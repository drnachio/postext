import { describe, it, expect } from 'vitest';
import { measureBlock } from '../measure/plain';
import { measureRichBlock } from '../measure/rich';
import { getMeasureDirection } from '../measure/bidiLines';
import { buildDocument } from '../pipeline';
import { renderBlock } from '../canvas-backend/blockRender';
import type { InlineSpan } from '../parse';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTLine } from '../vdt';

// #369: right-to-left lines. Segments stay in logical order; each carries
// its direction (`rtl`, `level`), the line the order to paint them in
// (`order`, visual left to right), and the canvas paints in that order.

// 7 px a character, whatever the font.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const span = (text: string, bold = false): InlineSpan => ({ text, bold, italic: false });
const AR = 'قال AAA إن 2024 و١٤٤٥ (BBB) جميلة.';
const visual = (line: VDTLine): string[] => (line.order ?? line.segments!.map((_, i) => i)).map((i) => line.segments![i]!.text);

describe('segment directions and order', () => {
  for (const [path, measure] of [
    ['plain', () => measureBlock(AR, FONT, 1000, 20, { direction: 'rtl' })],
    ['rich', () => measureRichBlock([span(AR)], FONT, FONT, FONT, FONT, 1000, 20, { direction: 'rtl' })],
    ['rich, justified', () => measureRichBlock([span(AR)], FONT, FONT, FONT, FONT, 1000, 20, { direction: 'rtl', textAlign: 'justify', optimal: true })],
  ] as const) {
    it(`${path}: an Arabic paragraph with Latin words and both digit sets`, () => {
      const [line] = measure().lines;
      const segs = line!.segments!;
      // Logical order and text are kept; a segment never mixes levels.
      expect(segs.map((s) => s.text).join('')).toBe(AR);
      expect(line!.text).toBe(AR);
      const at = (t: string) => segs.find((s) => s.text === t)!;
      expect(at('قال').rtl).toBe(true);
      expect(at('قال').level).toBeUndefined();
      expect(at('AAA').rtl).toBeUndefined();
      expect(at('AAA').level).toBe(2);
      expect(at('2024').level).toBe(2);
      // و and the Arabic-Indic number glued to it part at the level change.
      expect(at('و').rtl).toBe(true);
      expect(at('١٤٤٥').level).toBe(2);
      // The brackets resolve right to left (N0), the Latin word inside them
      // left to right.
      expect(at('(').rtl).toBe(true);
      expect(at('BBB').level).toBe(2);
      expect(at('جميلة.').rtl).toBe(true);
      // Visual order, left to right: the end of the sentence first, each
      // left-to-right run reading as written.
      expect(visual(line!)).toEqual([...segs.map((s) => s.text)].reverse());
      // The pieces of a cut segment keep its width.
      const total = segs.reduce((w, s) => w + s.width, 0);
      expect(total).toBeCloseTo(AR.length * 7, 6);
    });
  }

  it('an Arabic phrase inside an English paragraph turns around in place', () => {
    for (const measured of [
      measureBlock('He said كتاب جميل today.', FONT, 1000, 20),
      measureRichBlock([span('He said '), span('كتاب', true), span(' جميل today.')], FONT, FONT, FONT, FONT, 1000, 20),
    ]) {
      const [line] = measured.lines;
      expect(visual(line!)).toEqual(['He', ' ', 'said', ' ', 'جميل', ' ', 'كتاب', ' ', 'today.']);
      expect(line!.segments!.filter((s) => s.rtl).map((s) => s.text)).toEqual(['كتاب', ' ', 'جميل']);
    }
  });

  it('an inline :rtl isolate reads its words right to left', () => {
    const iso = { dir: 'rtl' as const, id: 1 };
    // Without the isolate the English paragraph reads "AB كتاب" left to
    // right; inside it the Arabic word comes first.
    const [plain] = measureRichBlock([span('see AB كتاب end')], FONT, FONT, FONT, FONT, 1000, 20).lines;
    expect(visual(plain!)).toEqual(['see', ' ', 'AB', ' ', 'كتاب', ' ', 'end']);
    const [line] = measureRichBlock([span('see '), { ...span('AB كتاب'), direction: iso }, span(' end')], FONT, FONT, FONT, FONT, 1000, 20).lines;
    expect(visual(line!)).toEqual(['see', ' ', 'كتاب', ' ', 'AB', ' ', 'end']);
  });

  it('every line of a paragraph broken over several gets its own order', () => {
    const text = `${AR} ${AR} ${AR}`;
    const { lines } = measureBlock(text, FONT, 200, 20, { direction: 'rtl', textAlign: 'justify', optimal: true });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.segments!.map((s) => s.text).join('')).toBe(line.text);
      expect(line.order).toBeDefined();
      expect([...line.order!].sort((a, b) => a - b)).toEqual(line.segments!.map((_, i) => i));
    }
  });

  it('a left-to-right paragraph without right-to-left letters is left as it was', () => {
    for (const measured of [
      measureBlock('Plain English text, nothing else.', FONT, 100, 20, { textAlign: 'justify', optimal: true }),
      measureRichBlock([span('Plain '), span('English', true), span(' text.')], FONT, FONT, FONT, FONT, 100, 20),
    ]) {
      for (const line of measured.lines) {
        expect(line.order).toBeUndefined();
        expect(line.measure).toBeUndefined();
        expect(line.segments!.some((s) => s.rtl !== undefined || s.level !== undefined)).toBe(false);
      }
    }
  });

  it('an English paragraph set right to left keeps its order', () => {
    const [line] = measureBlock('All Latin words', FONT, 1000, 20, { direction: 'rtl' }).lines;
    expect(line!.order).toBeUndefined();
    expect(line!.segments!.some((s) => s.rtl)).toBe(false);
  });
});

describe('an Arabic paragraph in an English book', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config: PostextConfig = {
    direction: 'ltr',
    page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { firstLineIndent: pt(14), textAlign: 'justify', indentAfterHeading: true },
  };
  const markdown = `Intro text.\n\n:::paragraphs{dir=rtl}\n${AR} ${AR} ${AR}\n:::\n\nMore English text.`;

  it('sets its lines from the right: the indent on the right, the span in measure', () => {
    expect(getMeasureDirection()).toBe('ltr');
    const doc = buildDocument({ markdown }, config);
    const arabic = doc.blocks.find((b) => b.lines.some((l) => l.text.includes('قال')))!;
    expect(arabic.direction).toBe('rtl');
    const [first, second] = arabic.lines;
    expect(first!.measure).toEqual({ x: 20, width: 260 - 14 });
    expect(first!.bbox.x).toBe(20);
    expect(second!.measure).toEqual({ x: 20, width: 260 });
    // The English paragraphs around it are untouched.
    for (const b of doc.blocks.filter((x) => x !== arabic)) {
      expect(b.direction).toBeUndefined();
      expect(b.lines.some((l) => l.measure || l.order)).toBe(false);
    }
  });

  describe('on the canvas', () => {
    function recordingCtx() {
      const calls: { text: string; x: number; direction: string; textAlign: string }[] = [];
      const ctx = {
        font: '', fillStyle: '', letterSpacing: '0px', textBaseline: 'alphabetic', direction: 'ltr', textAlign: 'start',
        measureText: (s: string) => ({ width: s.length * 7 }),
        fillText(text: string, x: number) { calls.push({ text, x, direction: this.direction, textAlign: this.textAlign }); },
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
      };
      return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
    }

    it('paints the segments in order, right-to-left runs as such, the last line flush right', () => {
      const doc = buildDocument({ markdown }, config);
      const arabic = doc.blocks.find((b) => b.lines.some((l) => l.text.includes('قال')))! as VDTBlock;
      const { ctx, calls } = recordingCtx();
      const last = arabic.lines[arabic.lines.length - 1]!;
      renderBlock(ctx, { ...arabic, lines: [last] }, arabic.bbox.width, arabic.bbox.x);
      expect(calls.map((c) => c.text)).toEqual(visual(last).filter((t) => t.trim() !== ''));
      for (const c of calls) {
        const seg = last.segments!.find((s) => s.text === c.text)!;
        expect(c.direction).toBe(seg.rtl ? 'rtl' : 'ltr');
        if (seg.rtl) expect(c.textAlign).toBe('left');
      }
      // Flush right: the line ends on the block's right edge.
      const width = last.segments!.reduce((w, s) => w + s.width, 0);
      expect(calls[0]!.x).toBeCloseTo(arabic.bbox.x + arabic.bbox.width - width, 6);
      expect(ctx.direction).toBe('ltr');
      expect(ctx.textAlign).toBe('start');
    });

    it('justifies a line across its span, the first line short of the right edge by its indent', () => {
      const doc = buildDocument({ markdown }, config);
      const arabic = doc.blocks.find((b) => b.lines.some((l) => l.text.includes('قال')))! as VDTBlock;
      const { ctx, calls } = recordingCtx();
      const first = arabic.lines[0]!;
      renderBlock(ctx, { ...arabic, lines: [first] }, arabic.bbox.width, arabic.bbox.x);
      expect(calls[0]!.x).toBeCloseTo(first.measure!.x, 6);
      const lastPainted = calls[calls.length - 1]!;
      expect(lastPainted.x + lastPainted.text.length * 7).toBeCloseTo(first.measure!.x + first.measure!.width, 6);
    });
  });
});
