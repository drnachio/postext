import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../measure/rich';
import { setHyphenationLocale } from '../hyphenate';
import { buildDocument } from '../pipeline';
import type { InlineSpan } from '../parse';
import type { PostextConfig, Resource } from '../types';
import type { VDTBlock } from '../vdt';

// EF-73 and EF-62: punctuation touching a bold or italic run, or an inline
// :ref, travels with it. postext 1.4.1 set ragged lines word by word and
// could end a line on "(" or open one with the "." after **osmosis** or the
// ")" after a reference. The line-by-line breaker now treats runs that touch
// with no space between as one group (EF-21); these tests pin that down for
// every path, and cover the group that opens a line and cannot take its
// punctuation: the word is hyphenated so its tail goes down with it.

// Deterministic stub: bold is wider than roman, italic narrower, and the
// punctuation narrow, so the breaks fall at many different places.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const per = /bold|700/.test(this.font) ? 8 : /italic/.test(this.font) ? 6.5 : 7;
    let w = 0;
    for (const ch of s) w += '.,;:()'.includes(ch) ? 3 : ch === ' ' ? 3.5 : per;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const N = '16px Test';
const B = 'bold 16px Test';
const I = 'italic 16px Test';
const BI = 'italic bold 16px Test';
const roman = (text: string): InlineSpan => ({ text, bold: false, italic: false });
const bold = (text: string): InlineSpan => ({ text, bold: true, italic: false });
const italic = (text: string): InlineSpan => ({ text, bold: false, italic: true });
const ref = (text: string): InlineSpan => ({ text, bold: true, italic: false, ref: { resourceId: 'fig' } });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

afterEach(() => setHyphenationLocale('en-us'));

/** Lines that open on closing punctuation or end on an opening bracket. */
function stranded(lines: readonly { text: string }[]): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (i > 0 && /^[\u2060]?[.,;:!?)\]]/.test(l.text)) out.push(`opens: ${JSON.stringify(l.text)}`);
    if (i < lines.length - 1 && /[([]$/.test(l.text)) out.push(`ends: ${JSON.stringify(l.text)}`);
  });
  return out;
}

const SENTENCE = 'A slice of cucumber is left in salty water. Predict what happens to its cells and explain it in terms of ';
const CASES: [string, InlineSpan[]][] = [
  ['bold, full stop', [roman(SENTENCE), bold('osmosis'), roman('.')]],
  ['italic, full stop', [roman(SENTENCE), italic('osmosis'), roman('.')]],
  ['bold, comma, text', [roman(SENTENCE), bold('osmosis'), roman(', then the cells shrink.')]],
  ['word joiner', [roman(SENTENCE), bold('osmosis'), roman('\u2060.')]],
  ['reference in brackets', [roman('The flows spread across the plain as the figure shows ('), ref('Fig. 3.1'), roman(') and cool into columns.')]],
  ['reference, full stop', [roman('The flows spread across the plain, see '), ref('Fig. 3.1'), roman('. They cool into columns.')]],
];
const OPTIONS = [
  { textAlign: 'left' as const },
  { textAlign: 'left' as const, hyphenate: true },
  { textAlign: 'left' as const, hyphenate: true, hyphenationZonePx: 21 },
  { textAlign: 'justify' as const, hyphenate: true },
  { textAlign: 'justify' as const, hyphenate: true, optimal: true },
];

// The sweeps lay out thousands of paragraphs: well under a second alone,
// but they get an explicit timeout so a loaded machine (turbo runs the
// suites in parallel) does not fail them on vitest's 5 s default.
const SWEEP_TIMEOUT = 30_000;

describe('punctuation stays with the run it touches (EF-73, EF-62)', () => {
  it('on every breaking path, at every width', () => {
    for (const [name, spans] of CASES) {
      for (const options of OPTIONS) {
        // 1.5 px steps land on both the whole and the half pixels the stub's
        // widths break at.
        for (let width = 70; width <= 420; width += 1.5) {
          const { lines } = measureRichBlock(spans, N, B, I, BI, width, 20, options);
          expect(stranded(lines), `${name} ${JSON.stringify(options)} at ${width}px`).toEqual([]);
        }
      }
    }
  }, SWEEP_TIMEOUT);

  it('a word that opens its line and cannot take its full stop is hyphenated, so the stop goes down with its tail', () => {
    // "osmosis" (bold, 56 px) fits a 57 px line; "osmosis." (59 px) does not.
    const spans = [bold('osmosis'), roman('.')];
    const hyphenated = measureRichBlock(spans, N, B, I, BI, 57, 20, { textAlign: 'left', hyphenate: true });
    expect(hyphenated.lines.map((l) => l.text)).toEqual(['osmo-', 'sis.']);
    // Without syllables there is nowhere else to break: the stop goes down.
    const plain = measureRichBlock(spans, N, B, I, BI, 57, 20, { textAlign: 'left' });
    expect(plain.lines.map((l) => l.text)).toEqual(['osmosis', '.']);
    // Knuth–Plass breaks at a syllable too (either: neither line has a
    // space to stretch).
    const kp = measureRichBlock(spans, N, B, I, BI, 57, 20, { textAlign: 'justify', hyphenate: true, optimal: true });
    expect(kp.lines.map((l) => l.text).join('|')).toMatch(/^os(mo)?-\|(mo)?sis\.$/);
  });

  it('in ragged body text, with the Cookbook probe\'s references in brackets (EF-62 addendum)', () => {
    // postext 1.4.1 set 1,517 of 10,671 ragged lines of this corpus with a
    // bracket parted from its reference ("… it is (" / "Fig. 1.1) …"); its
    // justified lines had none.
    const words = 'the colony wakes before you do and the first warm afternoon tells you what the winter has left and it is worth waiting for because honey keeps for years if it is dry'.split(' ');
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const para = (n: number) => {
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        out.push(words[Math.floor(rnd() * words.length)]!);
        if (rnd() < 0.12) out.push('(:ref{id="fig"})');
        if (rnd() < 0.05) out.push('(see :ref{id="fig"}),');
      }
      return out.join(' ') + '.';
    };
    const markdown = Array.from({ length: 4 }, () => para(90)).join('\n\n');
    const resources: Resource[] = [{ id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'x.svg', width: 100, height: 40 } } as Resource];
    for (const bodyText of [{ textAlign: 'left' as const }, { textAlign: 'justify' as const, optimalLineBreaking: false }, { textAlign: 'justify' as const }]) {
      for (let w = 60; w <= 130; w += 2) {
        const config: PostextConfig = {
          page: { sizePreset: 'custom', width: mm(w + 20), height: mm(400), dpi: 150, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
          layout: { layoutType: 'single' },
          header: { elements: [] },
          footer: { elements: [] },
          bodyText: { fontFamily: 'Test', fontSize: pt(10.4), lineHeight: pt(14.2), firstLineIndent: pt(0), ...bodyText },
        };
        const doc = buildDocument({ markdown, resources }, config);
        for (const b of doc.blocks.filter((x: VDTBlock) => x.type === 'paragraph')) {
          expect(stranded(b.lines), `${JSON.stringify(bodyText)} at ${w} mm`).toEqual([]);
        }
      }
    }
  }, SWEEP_TIMEOUT);

  it('in a whole document: ragged box bodies in a justified book, and paragraphs', () => {
    const resources: Resource[] = [{ id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'x.svg', width: 100, height: 50 } } as Resource];
    const markdown = [
      ':::callout{type="box"}',
      'A slice of cucumber is left in salty water. Predict what happens to its cells and explain it in terms of **osmosis**.',
      '',
      'Forty *minutes* later, the flows spread as the figure shows (:ref{id="fig"}) and cool into columns.',
      ':::',
      '',
      'A slice of cucumber is left in salty water. Predict what happens to its cells and explain it in terms of **osmosis**.',
      '',
      '::resource{id="fig"}',
    ].join('\n');
    for (const bodyAlign of ['left', 'justify'] as const) {
      for (let w = 40; w <= 100; w += 0.5) {
        const config: PostextConfig = {
          page: { sizePreset: 'custom', width: mm(w + 20), height: mm(260), dpi: 150, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
          layout: { layoutType: 'single' },
          header: { elements: [] },
          footer: { elements: [] },
          bodyText: { fontFamily: 'Test', fontSize: pt(9.6), lineHeight: pt(12.6), textAlign: 'justify', firstLineIndent: pt(0) },
          calloutStyles: [{ id: 'box', title: 'Box', body: { textAlign: bodyAlign } }],
        };
        const doc = buildDocument({ markdown, resources }, config);
        const blocks = doc.blocks.filter((b: VDTBlock) => b.type === 'paragraph');
        expect(blocks.length).toBeGreaterThanOrEqual(3);
        for (const b of blocks) expect(stranded(b.lines), `${bodyAlign} body at ${w} mm`).toEqual([]);
      }
    }
  }, SWEEP_TIMEOUT);
});
