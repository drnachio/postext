// Text measured with HarfRust instead of Skia, for the benchmark (#779
// phase 2): the measuring context's `measureText` answers the width of a
// string set in one of the book's faces from the Rust shaper compiled to
// WebAssembly, and leaves to Skia what only a canvas knows: a font the book
// does not ship, letter spacing, small capitals, CJK text (cut before each
// Han character), a word mixing scripts, a character the face has no glyph
// for. The other metrics (ink boxes) still come from Skia.

import { createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { parseFontString } from 'postext';
import type { Face, FontSet } from '../src/fonts';

interface Shaper {
  addFont(bytes: Uint8Array): number;
  language(tag: string): number;
  width(font: number, size: number, text: string, language?: number): number;
}

type MeasureText = (this: CanvasRenderingContext2D, text: string) => TextMetrics;

/** A font shorthand resolved to a face of the shaper and a size. */
interface Resolved {
  font: number;
  size: number;
  /** Widths measured in this face and size, by text: the engine and the
   *  kashida search ask for the same strings many times (Chrome keeps such
   *  a cache of its own). */
  widths: Map<string, number>;
}

const SIZE_RE = /(?:^|\s)(\d+(?:\.\d+)?)px(?:\/\S+)?\s/;
const CJK_RE = /[⺀-鿿가-퟿豈-﫿＀-￯]/;
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LATIN_RE = /[A-Za-zÀ-ɏ]/;

/** Widths from Rust that stand for Skia's `measureText`, the rest of the
 *  metrics read from Skia when asked. */
class ShapedMetrics {
  constructor(
    readonly width: number,
    private readonly real: () => TextMetrics,
  ) {}
  get actualBoundingBoxLeft() { return this.real().actualBoundingBoxLeft; }
  get actualBoundingBoxRight() { return this.real().actualBoundingBoxRight; }
  get actualBoundingBoxAscent() { return this.real().actualBoundingBoxAscent; }
  get actualBoundingBoxDescent() { return this.real().actualBoundingBoxDescent; }
  get fontBoundingBoxAscent() { return this.real().fontBoundingBoxAscent; }
  get fontBoundingBoxDescent() { return this.real().fontBoundingBoxDescent; }
}

export async function installRustShaping(fonts: FontSet): Promise<{ stats(): Record<string, number>; uninstall(): void }> {
  const here = new URL('.', import.meta.url).pathname;
  // @ts-expect-error: a plain ES module of the Rust workspace, untyped.
  const { loadShaper } = await import('../../../rust/crates/wasm-shape/js/shaper.mjs');
  const shaper = (await loadShaper(readFileSync(`${here}../../../rust/target/postext_wasm_shape.opt.wasm`))) as Shaper;
  const ids = new Map<Face, number>();
  const resolved = new Map<string, Resolved | null>();
  const counts = { rust: 0, skia: 0, missing: 0 };

  const resolve = (font: string): Resolved | null => {
    let r = resolved.get(font);
    if (r !== undefined) return r;
    r = null;
    const request = parseFontString(font);
    const size = SIZE_RE.exec(` ${font} `);
    if (request && size && !/small-caps|condensed|expanded/.test(font)) {
      const face = fonts.pick(request.family, request.weight, request.style);
      // A face the book asked for in another family (a stand-in) or one
      // Skia would embolden or slant itself is measured by Skia.
      if (face && !face.standsInFor && face.weight === request.weight && face.style === request.style) {
        let id = ids.get(face);
        if (id === undefined) {
          id = shaper.addFont(face.bytes);
          ids.set(face, id);
        }
        if (id >= 0) r = { font: id, size: Number(size[1]), widths: new Map() };
      }
    }
    resolved.set(font, r);
    return r;
  };

  const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as { measureText: MeasureText };
  const skia = prototype.measureText;
  prototype.measureText = function measureText(this: CanvasRenderingContext2D, text: string): TextMetrics {
    const r = resolve(this.font);
    const spaced = (this as { letterSpacing?: string }).letterSpacing;
    if (!r || (spaced && spaced !== '0px') || CJK_RE.test(text) || (RTL_RE.test(text) && LATIN_RE.test(text))) {
      counts.skia++;
      return skia.call(this, text);
    }
    let width = r.widths.get(text);
    if (width === undefined) {
      width = shaper.width(r.font, r.size, text);
      r.widths.set(text, width);
    }
    if (Number.isNaN(width)) {
      counts.missing++;
      return skia.call(this, text);
    }
    counts.rust++;
    return new ShapedMetrics(width, () => skia.call(this, text)) as unknown as TextMetrics;
  };
  return {
    stats: () => ({ ...counts }),
    uninstall: () => {
      prototype.measureText = skia;
    },
  };
}
