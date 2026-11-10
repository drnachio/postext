import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { forgetFontCoverage, registerFontCoverage } from '../../fonts/glyphFallback.js';
import { readStrikeout, strikeoutOf } from '../../fonts/strikeout.js';
import { minimalFont } from '../../fonts/minimalFont.js';
import { STRIKE_AT, STRIKE_STROKE } from '../../marks/strikeGeometry.js';
import type { PostextConfig, VDTDocument, VDTLine, VDTLineMark } from '../../index.js';

// The line through struck-through text (`~~…~~`) sits where the face puts
// its strikeout and is as thick as the face says (OS/2 yStrikeoutPosition
// and yStrikeoutSize), read from the files registered with
// `registerFontCoverage`; a face without them takes the fallback.

const readFileSync = readFile as (path: URL) => Uint8Array;
const font = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../../../../apps/web/public/fonts/${name}`, import.meta.url)));
// Lora: 300 / 50 of 1000 units. Fraunces: 578 / 50 of 2000.
const LORA = font('Lora-Regular.ttf');
const FRAUNCES = font('Fraunces-Regular.ttf');

/** A face whose OS/2 table leaves the strikeout at zero. */
function bareFace(): Uint8Array {
  const bytes = minimalFont({ family: 'Bare Sans', ranges: [[0x20, 0x7e]], advanceEm: 0.5 }).slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) {
    const r = 12 + i * 16;
    if (String.fromCharCode(...bytes.subarray(r, r + 4)) !== 'OS/2') continue;
    const at = view.getUint32(r + 8);
    view.setInt16(at + 26, 0);
    view.setInt16(at + 28, 0);
  }
  return bytes;
}

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '16');
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (fontFamily: string): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily, fontSize: pt(20), lineHeight: pt(26), textAlign: 'left' },
  header: { elements: [] },
  footer: { elements: [] },
});
const build = (markdown: string, family: string): VDTDocument => buildDocument({ markdown }, config(family), createMeasurementCache());
const firstLine = (doc: VDTDocument): VDTLine => doc.blocks.flatMap((b) => b.lines).find((l) => l.segments?.some((s) => s.strike))!;
const strikes = (line: VDTLine): VDTLineMark[] => (line.marks ?? []).filter((m) => m.kind === 'line');

afterEach(() => forgetFontCoverage(['Test Serif', 'Bare Sans']));

describe('the face’s strikeout', () => {
  it('is read from the OS/2 table, in em', () => {
    expect(readStrikeout(LORA)).toEqual({ position: 0.3, size: 0.05 });
    expect(readStrikeout(FRAUNCES)).toEqual({ position: 0.289, size: 0.025 });
    expect(readStrikeout(bareFace())).toBeUndefined();
    expect(readStrikeout(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('is found for a font shorthand by family, slant and nearest weight', () => {
    registerFontCoverage('Test Serif', 400, 'normal', LORA);
    registerFontCoverage('Test Serif', 700, 'normal', FRAUNCES);
    expect(strikeoutOf('20px "Test Serif", serif')?.position).toBe(0.3);
    expect(strikeoutOf('bold 20px "Test Serif"')?.position).toBe(0.289);
    expect(strikeoutOf('italic 600 20px "Test Serif"')?.position).toBe(0.289);
    expect(strikeoutOf('20px "Other Face", "Test Serif"')).toBeUndefined();
  });

  it('places the line of a face that sets it', () => {
    registerFontCoverage('Test Serif', 400, 'normal', LORA);
    const [mark] = strikes(firstLine(build('Widget A: ~~€ 165~~ € 129.', 'Test Serif')));
    expect(mark!.y).toBeCloseTo(-0.3 * 20, 6);
    expect(mark!.thickness).toBeCloseTo(0.05 * 20, 6);
  });

  it('falls back for a face that sets none, and for one no file was read of', () => {
    registerFontCoverage('Bare Sans', 400, 'normal', bareFace());
    for (const family of ['Bare Sans', 'Unread Face']) {
      const [mark] = strikes(firstLine(build('Widget A: ~~€ 165~~ € 129.', family)));
      expect(mark!.y).toBeCloseTo(-STRIKE_AT * 20, 6);
      expect(mark!.thickness).toBeCloseTo(STRIKE_STROKE * 20, 6);
    }
  });

  it('gives each face of a run its own piece, the pieces meeting', () => {
    registerFontCoverage('Test Serif', 400, 'normal', LORA);
    registerFontCoverage('Test Serif', 700, 'normal', FRAUNCES);
    const line = firstLine(build('Was ~~plain **bold**~~ now.', 'Test Serif'));
    const marks = strikes(line).sort((a, b) => a.x - b.x);
    expect(marks).toHaveLength(2);
    expect(marks[0]!.y).toBeCloseTo(-0.3 * 20, 6);
    expect(marks[1]!.y).toBeCloseTo(-0.289 * 20, 6);
    expect(marks[1]!.thickness).toBeCloseTo(0.025 * 20, 6);
    // The space between the two words belongs to the first piece.
    expect(marks[0]!.x + marks[0]!.length!).toBeCloseTo(marks[1]!.x, 6);
  });

  it('places the line inside a chip by its face too', () => {
    registerFontCoverage('Test Serif', 400, 'normal', LORA);
    const seg = build('A :chip[~~old~~ new] tag.', 'Test Serif').blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).find((s) => s.chip)!;
    const strike = seg.chip!.strikes![0]!;
    const sizePx = parseFloat(/(\d*\.?\d+)px/.exec(seg.chip!.runs[0]!.fontString)![1]!);
    expect(strike.y).toBeCloseTo(-0.3 * sizePx, 6);
  });
});
