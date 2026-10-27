import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { measureRichBlock } from '../../measure/rich.js';
import { cjkCompositionOf, type CjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { resolveCjkConfig } from '../../defaults/text/cjk.js';
import type { Dimension, PostextConfig } from '../../types.js';
import type { VDTLine, VDTLineSegment } from '../../vdt.js';

// A Japanese two-em dash (2倍ダッシュ, ―― or ——) is one stroke, and a row
// of dashes one rule (#680). The stub is Noto Serif JP's: its horizontal
// bar ― advances an em with ink from 0.071 to 0.929 em, so two of them
// leave 0.14 em of blank between their strokes; its em dash — is the
// proportional Latin stroke of dashRule.test.ts (0.89 em, drawn low). 國
// has ink from 0.079 em below the baseline to 0.822 em above it.

const EM = 20;
const SIZE_RE = /(\d*\.?\d+)px/;
interface Glyph { advance: number; left: number; right: number; top: number; bottom: number }
const GLYPHS: Record<string, Glyph> = {
  '—': { advance: 0.89, left: 0.043, right: 0.846, top: 0.293, bottom: 0.242 },
  '―': { advance: 1, left: 0.071, right: 0.929, top: 0.4, bottom: 0.36 },
  '…': { advance: 1, left: 0.111, right: 0.889, top: 0.436, bottom: 0.324 },
};
const HAN: Glyph = { advance: 1, left: 0.098, right: 0.946, top: 0.822, bottom: -0.079 };
const LATIN: Glyph = { advance: 0.5, left: 0.05, right: 0.45, top: 0.7, bottom: 0 };
const glyph = (ch: string): Glyph => GLYPHS[ch] ?? (ch === ' ' ? { ...LATIN, advance: 0.25, right: 0, left: 0 } : ch.codePointAt(0)! >= 0x2e80 ? HAN : LATIN);
class StubCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? EM);
    let x = 0;
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const ch of s) {
      const g = glyph(ch);
      if (g.right > g.left) {
        left = Math.min(left, x + g.left);
        right = Math.max(right, x + g.right);
        top = Math.max(top, g.top);
        bottom = Math.min(bottom, g.bottom);
      }
      x += g.advance;
    }
    if (left === Infinity) return { width: x * em, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 } as TextMetrics;
    return {
      width: x * em,
      actualBoundingBoxLeft: -left * em,
      actualBoundingBoxRight: right * em,
      actualBoundingBoxAscent: top * em,
      actualBoundingBoxDescent: -bottom * em,
    } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = `${EM}px "Test Serif"`;
const comp = (locale = 'ja'): CjkComposition => cjkCompositionOf(resolveCjkConfig({ latinSpacing: { value: 0, unit: 'em' } }, locale), 96, locale);
const lines = (text: string, locale = 'ja', measure = 40 * EM): VDTLine[] =>
  measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, measure, 30, { textAlign: 'left', cjkComposition: comp(locale) }).lines;
const dashes = (line: VDTLine): VDTLineSegment[] => (line.segments ?? []).filter((s) => s.text === '―' || s.text === '—');
/** Where each dash's ink runs along its line, px from the line's start. */
function inkSpans(line: VDTLine): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  for (const s of line.segments ?? []) {
    if (s.text === '―' || s.text === '—') {
      const g = glyph(s.text);
      const scale = s.inkScale ?? 1;
      const origin = x + (s.inkOffset ?? 0);
      out.push([origin + g.left * EM * scale, origin + g.right * EM * scale]);
    }
    x += s.width;
  }
  return out;
}
const lineWidth = (l: VDTLine): number => (l.segments ?? []).reduce((sum, s) => sum + s.width, 0);
const BAR_SIDE = 0.071 * EM;

describe('a Japanese two-em dash is one stroke (#680)', () => {
  it('stretches each ― over its em, the two overlapping at the join', () => {
    const [line] = lines('そう――それから');
    const [a, b] = dashes(line!);
    // Each dash keeps the advance of its face: nothing on the line moves.
    expect(a!.width).toBeCloseTo(EM);
    expect(b!.width).toBeCloseTo(EM);
    expect(lineWidth(line!)).toBeCloseTo(8 * EM);
    const [[a0, a1], [b0, b1]] = inkSpans(line!) as [[number, number], [number, number]];
    const start = 2 * EM;
    expect(a0 - start).toBeCloseTo(BAR_SIDE);
    expect(start + 2 * EM - b1).toBeCloseTo(BAR_SIDE);
    expect(a1 - b0).toBeCloseTo(0.04 * EM);
    expect(a!.inkScale).toBeCloseTo((1 - 0.071 + 0.02) / (0.929 - 0.071));
    // ― sits on the centre of the characters already.
    expect(a!.baselineShift).toBeUndefined();
  });

  it('joins a pair of em dashes at the advance of the face, raised to the centre of the characters', () => {
    const [line] = lines('そう——それから');
    const [a, b] = dashes(line!);
    expect(a!.width).toBeCloseTo(0.89 * EM);
    expect(b!.width).toBeCloseTo(0.89 * EM);
    expect(lineWidth(line!)).toBeCloseTo((6 + 2 * 0.89) * EM);
    const [[a0, a1], [b0, b1]] = inkSpans(line!) as [[number, number], [number, number]];
    const start = 2 * EM;
    expect(a0 - start).toBeCloseTo(0.043 * EM);
    expect(start + 2 * 0.89 * EM - b1).toBeCloseTo(0.043 * EM);
    expect(a1 - b0).toBeCloseTo(0.04 * EM);
    expect(a!.baselineShift).toBeCloseTo(-0.1035 * EM);
  });

  it('is Japanese: a paragraph with kana in a document of no CJK language too, never Korean', () => {
    const kana = dashes(lines('そう――それから', 'en')[0]!);
    expect(kana).toHaveLength(2);
    expect(kana.every((s) => s.inkScale !== undefined)).toBe(true);
    expect(dashes(lines('そう――それから', 'ko')[0]!).some((s) => s.inkScale !== undefined)).toBe(false);
    expect(dashes(lines('그래――그리고', 'ko')[0]!).some((s) => s.inkScale !== undefined)).toBe(false);
  });

  it('leaves a single dash, a dash between Latin words and the ellipsis as the face sets them', () => {
    for (const text of ['東京―大阪', 'そう……それから', 'the word――another word in かな']) {
      const segs = lines(text).flatMap((l) => l.segments ?? []);
      expect(segs.some((s) => s.inkScale !== undefined), text).toBe(false);
      expect(segs.some((s) => s.inkOffset !== undefined && (s.text === '…' || s.text === '―')), text).toBe(false);
    }
  });
});

describe('a row of dashes is one rule (#680)', () => {
  for (const locale of ['ja', 'zh-Hans']) {
    it(`twelve ― in ${locale}: from the first side bearing to the last, every stroke overlapping the next`, () => {
      const [line] = lines(`あ${'―'.repeat(12)}い`, locale);
      const spans = inkSpans(line!);
      expect(spans).toHaveLength(12);
      expect(spans[0]![0] - EM).toBeCloseTo(BAR_SIDE);
      expect(13 * EM - spans[11]![1]).toBeCloseTo(BAR_SIDE);
      for (let i = 1; i < spans.length; i++) expect(spans[i - 1]![1] - spans[i]![0], `${i}`).toBeCloseTo(0.04 * EM);
      expect(lineWidth(line!)).toBeCloseTo(14 * EM);
    });
  }

  it('an odd row: the last dash runs on from the pair before it', () => {
    const [line] = lines('あ―――い');
    const spans = inkSpans(line!);
    expect(spans).toHaveLength(3);
    expect(spans[0]![0] - EM).toBeCloseTo(BAR_SIDE);
    expect(4 * EM - spans[2]![1]).toBeCloseTo(BAR_SIDE);
    expect(spans[0]![1] - spans[1]![0]).toBeCloseTo(0.04 * EM);
    expect(spans[1]![1] - spans[2]![0]).toBeCloseTo(0.04 * EM);
  });

  it('a Chinese 破折号 alone is set as before', () => {
    const [line] = lines('女子——一一细考', 'zh-Hans');
    const [a, b] = dashes(line!);
    expect(a!.inkScale).toBeCloseTo((1 - 0.043 + 0.02) / (0.846 - 0.043));
    const [[a0], [, b1]] = inkSpans(line!) as [[number, number], [number, number]];
    expect(a0 - 2 * EM).toBeCloseTo(0.043 * EM);
    expect(4 * EM - b1).toBeCloseTo(0.043 * EM);
    expect(b!.inkScale).toBeCloseTo(a!.inkScale!);
  });

  it('two rows a zero-width space apart stay two rules', () => {
    const [line] = lines('あ――\u200B――い');
    const spans = inkSpans(line!);
    expect(spans[1]![1]).toBeLessThan(spans[2]![0]);
  });
});

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const config = (vertical: boolean): PostextConfig => ({
  locale: 'ja',
  page: { sizePreset: 'custom', width: { value: 400, unit: 'px' }, height: { value: 600, unit: 'px' }, dpi: 72, margins: { top: pt(20), right: pt(20), bottom: pt(20), left: pt(20) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: { value: EM, unit: 'px' }, lineHeight: { value: 30, unit: 'px' }, textAlign: 'left', firstLineIndent: pt(0) },
  cjk: { latinSpacing: { value: 0, unit: 'em' } },
  layout: { layoutType: 'single', ...(vertical ? { writingMode: 'vertical-rl' as const } : {}) },
});

describe('renderers paint the joined dash of Japanese text (#680)', () => {
  for (const vertical of [false, true]) {
    it(`canvas and HTML, ${vertical ? 'down' : 'across'} the page`, () => {
      const doc = buildDocument({ markdown: 'そう――それから。' }, config(vertical));
      const block = doc.blocks.find((b) => b.type === 'paragraph')!;
      const line = block.lines[0]!;
      const bars = dashes(line);
      expect(bars).toHaveLength(2);
      // The pair is one stroke over its two cells.
      const [[a0, a1], [b0, b1]] = inkSpans(line) as [[number, number], [number, number]];
      expect(a0 - 2 * EM).toBeCloseTo(BAR_SIDE);
      expect(4 * EM - b1).toBeCloseTo(BAR_SIDE);
      expect(a1).toBeGreaterThan(b0);
      const calls: string[] = [];
      const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: FONT, textAlign: 'left', textBaseline: 'alphabetic' };
      const ctx = new Proxy(target, {
        get(t, key) {
          if (key === 'fillText') return (text: string, x: number, y: number) => { calls.push(`fillText ${text} ${x} ${y}`); };
          if (key === 'translate') return (x: number, y: number) => { calls.push(`translate ${x.toFixed(3)} ${y.toFixed(3)}`); };
          if (key === 'scale') return (x: number, y: number) => { calls.push(`scale ${x.toFixed(4)} ${y}`); };
          if (key === 'measureText') return (s: string) => new StubCtx().measureText(s);
          if (key in t) return t[key];
          return () => undefined;
        },
        set(t, key, value) { t[key] = value; return true; },
      });
      renderPageToCanvas(doc.pages[0]!, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
      let x = line.bbox.x;
      for (const s of line.segments ?? []) {
        if (s.text === '―') {
          const i = calls.indexOf(`translate ${(x + s.inkOffset!).toFixed(3)} ${(line.baseline + (s.baselineShift ?? 0)).toFixed(3)}`);
          expect(i, `${x}`).toBeGreaterThanOrEqual(0);
          expect(calls[i + 1]).toBe(`scale ${s.inkScale!.toFixed(4)} 1`);
          expect(calls[i + 2]).toBe('fillText ― 0 0');
        }
        x += s.width;
      }
      const html = renderToHtml(doc);
      expect(html.match(vertical ? /transform:scaleY\(/g : /transform:scaleX\(/g)).toHaveLength(2);
    });
  }
});

describe('a paragraph that is a row of dashes (#680)', () => {
  const row = (locale: string, vertical = false, text = '―'.repeat(12)): VDTLine => {
    const doc = buildDocument({ markdown: `前の段落。\n\n${text}\n\n次の段落。` }, { ...config(vertical), locale });
    return doc.blocks.filter((b) => b.type === 'paragraph')[1]!.lines[0]!;
  };

  for (const vertical of [false, true]) {
    it(`is one rule in a Japanese document, ${vertical ? 'down' : 'across'} the page`, () => {
      const line = row('ja', vertical);
      const spans = inkSpans(line);
      expect(spans).toHaveLength(12);
      expect(spans[0]![0]).toBeCloseTo(BAR_SIDE);
      expect(12 * EM - spans[11]![1]).toBeCloseTo(BAR_SIDE);
      for (let i = 1; i < spans.length; i++) expect(spans[i - 1]![1], `${i}`).toBeGreaterThan(spans[i]![0]);
      // As long as its twelve cells, as it was.
      expect(lineWidth(line)).toBeCloseTo(12 * EM);
    });
  }

  it('is one rule in a Chinese document, each dash an em', () => {
    const line = row('zh-Hans', false, '—'.repeat(6));
    const spans = inkSpans(line);
    expect(spans).toHaveLength(6);
    expect(lineWidth(line)).toBeCloseTo(6 * EM);
    for (let i = 1; i < spans.length; i++) expect(spans[i - 1]![1], `${i}`).toBeGreaterThan(spans[i]![0]);
  });

  it('is left to the face in a document of another language', () => {
    for (const locale of ['en', 'ko']) {
      const line = row(locale);
      expect((line.segments ?? []).some((s) => s.inkScale !== undefined), locale).toBe(false);
    }
  });
});
