import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { measureRichBlock } from '../../measure/rich.js';
import { composesAsCjk } from '../../measure/cjk/cjkCompose.js';
import { resolveFootnotesConfig, stripFootnotesDefaults } from '../../defaults/structure/footnotes.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { InlineSpan } from '../../parse/index.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

// Deterministic text measurement stub: Latin characters 7 px, CJK 14 px, a
// word joiner none.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const c of s) w += /[　-鿿＀-￯]/.test(c) ? 14 : c === '⁠' ? 0 : 7;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const span = (text: string): InlineSpan[] => [{ text, bold: false, italic: false }];
const config = (widthPt: number, extra: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 96, width: pt(widthPt), height: pt(700), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  locale: 'zh-Hant',
  bodyText: { textAlign: 'left', firstLineIndent: pt(0) },
  headings: { levels: [] },
  ...extra,
}) as unknown as PostextConfig;

// The note of tang-poems-facing-english: English that quotes three readings.
const NOTE = 'the bright moon. The collected works of Li Bai read 山月 here, the moon over the hills, and 看月光 in the first line; the 1705 edition of all Tang poetry reads 山月 but keeps 明月光. This page follows the anthology of 1763.';
const allLines = (doc: VDTDocument): string[] => {
  const out: string[] = [];
  type Node = { lines?: { text: string }[]; children?: Node[] };
  const walk = (b: Node): void => {
    for (const l of b.lines ?? []) out.push(l.text);
    for (const c of b.children ?? []) walk(c);
  };
  for (const p of doc.pages) {
    for (const c of p.columns) for (const b of c.blocks) walk(b as Node);
    for (const b of p.floats ?? []) walk(b as unknown as Node);
  }
  return out;
};
/** Lines that end inside one of the quotations. */
const divided = (lines: string[]): string[] => lines.filter((l) => /(看|看月|明|明月|山)$/.test(l.trim()));
const build = (md: string, w: number, extra?: Record<string, unknown>): string[] => allLines(buildDocument({ markdown: md }, config(w, extra), createMeasurementCache()));
const WIDTHS = Array.from({ length: 91 }, (_, i) => 150 + i * 3);
const NOTE_MD = `Text.[^m]\n\n[^m]: ${NOTE}`;
const STYLED_MD = `:::paragraphs{style="k"}\n${NOTE}\n:::`;
/** The measures of the sweep at which a quotation is divided. */
const count = (md: string, extra?: Record<string, unknown>): number => WIDTHS.filter((w) => divided(build(md, w, extra)).length > 0).length;

describe('keep-all in a Latin paragraph that quotes CJK characters (#705)', () => {
  it('the note is not a paragraph the composer sets', () => {
    expect(composesAsCjk(NOTE)).toBe(false);
  });

  it('with the defaults a quotation is divided at many measures, in the body and in a note', () => {
    expect(count(NOTE)).toBeGreaterThan(30);
    expect(count(NOTE_MD)).toBeGreaterThan(30);
  }, 120_000);

  it('cjk.wordBreak keep-all keeps the quotations of a body paragraph and of a note whole', () => {
    expect(count(NOTE, { cjk: { wordBreak: 'keep-all' } })).toBe(0);
    expect(count(NOTE_MD, { cjk: { wordBreak: 'keep-all' } })).toBe(0);
  }, 120_000);

  it('a paragraph style with wordBreak keep-all does too', () => {
    expect(count(STYLED_MD, { paragraphStyles: [{ id: 'k', wordBreak: 'keep-all' }] })).toBe(0);
    // And its `'normal'` breaks them under a keep-all document.
    expect(count(STYLED_MD, { cjk: { wordBreak: 'keep-all' }, paragraphStyles: [{ id: 'k', wordBreak: 'normal' }] })).toBeGreaterThan(30);
  }, 120_000);

  it('footnotes.wordBreak keep-all keeps the notes whole and leaves the body to the document', () => {
    const extra = { footnotes: { wordBreak: 'keep-all' } };
    expect(count(NOTE_MD, extra)).toBe(0);
    // The body paragraph of the same document still breaks between characters.
    expect(count(NOTE, extra)).toBeGreaterThan(30);
    // The English words of the note break as before: the same words, in order.
    for (const w of [150, 201, 300]) {
      const words = (ls: string[]): string => ls.join('').replace(/\s+/g, '');
      expect(words(build(NOTE_MD, w, extra))).toBe(words(build(NOTE_MD, w)));
    }
  }, 120_000);

  it('a note at the end of the chapter takes the rule', () => {
    const chapterEnd = { footnotes: { placement: 'chapterEnd', wordBreak: 'keep-all' } };
    expect(count(NOTE_MD, { footnotes: { placement: 'chapterEnd' } })).toBeGreaterThan(30);
    expect(count(NOTE_MD, chapterEnd)).toBe(0);
  }, 120_000);

  it('normal in the notes of a keep-all document breaks their quotations between characters', () => {
    const extra = { cjk: { wordBreak: 'keep-all' }, footnotes: { wordBreak: 'normal' } };
    expect(count(NOTE_MD, extra)).toBeGreaterThan(30);
    expect(count(NOTE, extra)).toBe(0);
  }, 120_000);

  it('with the defaults the lines are the lines of a document that names normal', () => {
    for (const w of [150, 222, 333]) {
      expect(build(NOTE_MD, w, { footnotes: { wordBreak: 'normal' } })).toEqual(build(NOTE_MD, w));
    }
  });

  // The breaker itself: 13 Latin characters to a line (91 px).
  const lines = (text: string, keepAll: boolean, width = 91): string[] =>
    measureRichBlock(span(text), FONT, FONT, FONT, FONT, width, 20, keepAll ? { cjkWordBreak: 'keep-all' } : { cjkWordBreak: 'normal' }).lines.map((l) => l.text);

  it('a quotation with punctuation inside breaks only next to it', () => {
    // 「看月光」、「明月光」: under keep-all the one break inside the word is
    // after the comma, between the two bracketed readings.
    const text = 'it reads 「看月光」、「明月光」 here';
    const normal = new Set<string>();
    const kept = new Set<string>();
    // From the width of the bracketed pair up: narrower, it is cut as any
    // word wider than its line.
    for (let w = 161; w <= 330; w += 7) {
      for (const l of lines(text, false, w)) normal.add(l);
      for (const l of lines(text, true, w)) kept.add(l);
    }
    const insideLetters = (l: string): boolean => /[看月明]$/.test(l) && !/光$/.test(l);
    expect([...normal].some(insideLetters)).toBe(true);
    expect([...kept].some(insideLetters)).toBe(false);
    // The break after 、 is still taken.
    expect([...kept].some((l) => l.endsWith('、'))).toBe(true);
    // And no line opens with a closing bracket or ends on an opening one.
    for (const l of kept) {
      expect(l.startsWith('」')).toBe(false);
      expect(l.endsWith('「')).toBe(false);
    }
  });

  it('a quotation wider than the whole line is still cut', () => {
    // Four characters to a line: the six-character run cannot stay whole.
    const out = lines('看月光明月光', true, 56);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join('')).toBe('看月光明月光');
    for (const l of out) expect([...l].length).toBeLessThanOrEqual(4);
  });

  it('a paragraph the composer sets has the same lines as before under keep-all', () => {
    // Kana written between spaces (分かち書き): the composer's keep-all.
    const kana = 'むかし むかし あるところに おじいさんと おばあさんが すんでいました';
    expect(composesAsCjk(kana)).toBe(true);
    const out = measureRichBlock(span(kana), FONT, FONT, FONT, FONT, 140, 20, { cjkWordBreak: 'keep-all' }).lines.map((l) => l.text.trim());
    for (const l of out) expect(kana.split(' ').some((phrase) => l.endsWith(phrase))).toBe(true);
  });
});

describe('footnotes.wordBreak (#705)', () => {
  it('resolves only to one of the two values', () => {
    expect(resolveFootnotesConfig({ wordBreak: 'keep-all' }).wordBreak).toBe('keep-all');
    expect(resolveFootnotesConfig({ wordBreak: 'normal' }).wordBreak).toBe('normal');
    expect(resolveFootnotesConfig({ wordBreak: 'break-all' as never }).wordBreak).toBeUndefined();
    expect('wordBreak' in resolveFootnotesConfig({})).toBe(false);
  });

  it('survives the strip, normal too: its default is the document\'s rule', () => {
    expect(stripFootnotesDefaults({ wordBreak: 'keep-all' })).toEqual({ wordBreak: 'keep-all' });
    expect(stripFootnotesDefaults({ wordBreak: 'normal' })).toEqual({ wordBreak: 'normal' });
    const c: PostextConfig = { cjk: { wordBreak: 'keep-all' }, footnotes: { wordBreak: 'normal' } };
    const stripped = stripConfigDefaults(c);
    expect(stripped.footnotes?.wordBreak).toBe('normal');
    expect(JSON.stringify(resolveAllConfig(stripped))).toBe(JSON.stringify(resolveAllConfig(c)));
  });
});
