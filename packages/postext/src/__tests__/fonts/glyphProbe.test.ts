import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { GLYPH_PROBE_FAMILY, installGlyphProbe } from '../../fonts/glyphFallback.js';
import { sfntCodePointRanges, rangesHave } from '../../fonts/cmap.js';
import { fontStringFamilies } from '../../measure/fontString.js';
import { syncFontSet } from '../../fonts/fontSet.js';
import { measurementGeneration } from '../../measure/canvas.js';
import type { ContentWarning } from '../../vdt.js';

// #1105, the glyph probe: in a browser the engine cannot read a loaded
// face's `cmap`, so it declares a face that covers all of Unicode at an
// advance no text face has, and measures each character in the face with
// the probe behind it. This canvas draws as a browser does: each character
// from the first family of the list that has it, else from its default
// face, `serif`.

const COVERS: Record<string, (cp: number) => boolean> = {
  'subset sans': (cp) => cp >= 0x20 && cp <= 0x7e,
  serif: (cp) => cp < 0x2600,
  'sans-serif': (cp) => cp < 0x80,
  monospace: (cp) => cp < 0x80,
};
const WIDTH: Record<string, number> = { 'subset sans': 0.5, serif: 0.6, 'sans-serif': 0.55, monospace: 0.62 };
let probeAdvance = 0;

class BrowserCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    const families = fontStringFamilies(this.font).map((f) => f.toLowerCase());
    let width = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      const from = families.find((f) => (f === GLYPH_PROBE_FAMILY.toLowerCase() ? true : COVERS[f]?.(cp)));
      if (from === GLYPH_PROBE_FAMILY.toLowerCase()) width += probeAdvance * size;
      else width += (WIDTH[from ?? 'serif'] ?? 0.6) * size;
    }
    return { width };
  }
}

class FakeFace {
  status = 'unloaded';
  weight: string;
  style: string;
  constructor(public family: string, public source: Uint8Array, descriptors?: FontFaceDescriptors) {
    this.weight = String(descriptors?.weight ?? '400');
    this.style = String(descriptors?.style ?? 'normal');
  }
  async load() {
    // The probe's own advance, read from its file as a browser would.
    const view = new DataView(this.source.buffer, this.source.byteOffset, this.source.byteLength);
    const n = view.getUint16(4);
    for (let t = 0; t < n; t++) {
      const rec = 12 + t * 16;
      const tag = String.fromCharCode(...[0, 1, 2, 3].map((k) => view.getUint8(rec + k)));
      if (tag === 'hmtx') probeAdvance = view.getUint16(view.getUint32(rec + 8) + 4) / 1000;
    }
    expect(rangesHave(sfntCodePointRanges(this.source)!, 0x10ffff)).toBe(true);
    this.status = 'loaded';
    return this;
  }
}

const faces: FakeFace[] = [];
const fontSet = {
  status: 'loaded',
  get size() { return faces.length; },
  [Symbol.iterator]: () => faces[Symbol.iterator](),
  add: (f: FakeFace) => { faces.push(f); },
  load: async () => [],
};

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.OffscreenCanvas = class { getContext() { return new BrowserCtx(); } };
  g.FontFace = FakeFace;
  g.fonts = fontSet;
  // The face the text is set in, loaded, so it is no `fontFallback`.
  faces.push(Object.assign(new FakeFace('Subset Sans', new Uint8Array(0)), { status: 'loaded' }));
  expect(await installGlyphProbe()).toBe(true);
  // Once per font set.
  expect(await installGlyphProbe()).toBe(true);
  expect(faces.filter((f) => f.family === GLYPH_PROBE_FAMILY)).toHaveLength(1);
});

describe('#1105: the glyph probe', () => {
  // The probe arriving in a set the engine has already looked at (the
  // Sandbox watches `document.fonts` before `prepareFonts` declares it) is
  // no change of its faces: no eviction, no new generation, no relayout.
  it('changes nothing when it lands in a set the engine already tracks', async () => {
    const own: FakeFace[] = [Object.assign(new FakeFace('Body Face', new Uint8Array(0)), { status: 'loaded' })];
    const set = {
      status: 'loaded',
      get size() { return own.length; },
      [Symbol.iterator]: () => own[Symbol.iterator](),
      add: (f: FakeFace) => { own.push(f); },
      load: async () => [],
    };
    expect(syncFontSet(set)).toEqual([]);
    const generation = measurementGeneration();
    expect(await installGlyphProbe(set)).toBe(true);
    expect(own.some((f) => f.family === GLYPH_PROBE_FAMILY)).toBe(true);
    expect(syncFontSet(set, { force: true })).toEqual([]);
    expect(measurementGeneration()).toBe(generation);
  });

  it('finds the characters a loaded face lacks and the generic family that drew them', () => {
    const doc = buildDocument({ markdown: 'An arrow → and ← here.' }, { bodyText: { fontFamily: 'Subset Sans' }, headings: { fontFamily: 'Subset Sans' } });
    const found = (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'glyphFallback' }> => w.kind === 'glyphFallback');
    expect(found).toEqual([{ kind: 'glyphFallback', family: 'Subset Sans', weight: 400, style: 'normal', characters: ['→', '←'], count: 2, supplier: 'serif' }]);
  });

  it('names no family when none of the generic ones drew them', () => {
    const doc = buildDocument({ markdown: 'Snow ☃.' }, { bodyText: { fontFamily: 'Subset Sans' }, headings: { fontFamily: 'Subset Sans' } });
    const [w] = (doc.contentWarnings ?? []).filter((x): x is Extract<ContentWarning, { kind: 'glyphFallback' }> => x.kind === 'glyphFallback');
    expect(w).toMatchObject({ characters: ['☃'], count: 1 });
    expect(w!.supplier).toBeUndefined();
  });
});
