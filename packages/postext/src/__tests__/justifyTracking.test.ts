import { describe, it, expect } from 'vitest';
import { measureBlock } from '../measure/plain';
import { measureRichBlock } from '../measure/rich';
import { adjustLine } from '../knuthPlass/breakpoints';
import { KP_INFINITY } from '../knuthPlass/constants';
import { buildDocument } from '../pipeline';
import { createMeasurementCache } from '../measure/font';
import { renderBlock } from '../canvas-backend/blockRender';
import { renderToHtmlIndexed } from '../html-backend';
import { resolveBodyTextConfig, stripBodyTextDefaults, DEFAULT_BODY_TEXT_CONFIG } from '../defaults/bodyText';
import type { InlineSpan } from '../parse';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTLine } from '../vdt';

// EF-65: a justified line Knuth–Plass can only set by stretching its word
// spaces past `maxWordSpacing` (or shrinking them past `minWordSpacing`) may
// take a little tracking instead, up to `bodyText.maxJustifyTracking`
// thousandths of an em either way. Off by default: documents keep their
// lines unless they ask for it.

// Every character, the space included, is 7 px wide.
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
const KP = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.6 };
const TEXT_RIGID = 'aaaaa bbbbb cccccccccc dd ee';
const textWidth = (line: VDTLine): number => line.segments!.filter((s) => s.kind !== 'space').reduce((sum, s) => sum + s.width, 0);
const chars = (line: VDTLine): number => line.segments!.filter((s) => s.kind !== 'space').reduce((sum, s) => sum + s.text.length, 0);

describe('bodyText.maxJustifyTracking (EF-65): defaults', () => {
  it('is 0, off, and a static default the config strips', () => {
    expect(DEFAULT_BODY_TEXT_CONFIG.maxJustifyTracking).toBe(0);
    expect(resolveBodyTextConfig({}).maxJustifyTracking).toBe(0);
    expect(resolveBodyTextConfig({ maxJustifyTracking: 15 }).maxJustifyTracking).toBe(15);
    expect(stripBodyTextDefaults(resolveBodyTextConfig({}))?.maxJustifyTracking).toBeUndefined();
    expect(stripBodyTextDefaults(resolveBodyTextConfig({ maxJustifyTracking: 15 }))?.maxJustifyTracking).toBe(15);
  });
});

describe('bodyText.maxJustifyTracking (EF-65): the breaker', () => {
  // 92 px, first line "aaaaa bbbbb" (77 px natural, one space): it cannot
  // take "cccccccccc", so its space would stretch from 7 to 22 px (3.1×, set
  // ragged). 0.8 px of tracking on its 10 letters gives 8 px back.
  const TEXT = 'aaaaa bbbbb cccccccccc';

  for (const [path, measure] of [
    ['plain', (px?: number) => measureBlock(TEXT, FONT, 92, 20, { ...KP, ...(px !== undefined ? { justifyTrackingPx: px } : {}) })],
    ['rich', (px?: number) => measureRichBlock([span('aaaaa', true), span(TEXT.slice(5))], FONT, FONT, FONT, FONT, 92, 20, { ...KP, ...(px !== undefined ? { justifyTrackingPx: px } : {}) })],
  ] as const) {
    it(`${path}: without it, the line stretches its space past the limit`, () => {
      const [first] = measure().lines;
      expect(first!.text).toBe('aaaaa bbbbb');
      expect(first!.justifiedSpaceRatio).toBeCloseTo(15 / 7 + 1, 5);
      expect(first!.letterSpacing).toBeUndefined();
    });

    it(`${path}: with it, tracking takes the excess and the space comes back to maxWordSpacing`, () => {
      const [first, second] = measure(0.8).lines;
      expect(first!.text).toBe('aaaaa bbbbb');
      expect(first!.letterSpacing).toBeCloseTo(0.8, 5);
      // The letters carry their tracking in their measured widths…
      expect(textWidth(first!)).toBeCloseTo(70 + 0.8 * chars(first!), 5);
      // …and the one space is left at twice its width.
      expect(first!.justifiedSpaceRatio).toBeCloseTo(2, 5);
      // The last line is never tracked.
      expect(second!.letterSpacing).toBeUndefined();
    });

    it(`${path}: only what the limit leaves: a smaller cap leaves the rest to the space`, () => {
      const [first] = measure(0.3).lines;
      expect(first!.letterSpacing).toBeCloseTo(0.3, 5);
      expect(first!.justifiedSpaceRatio).toBeCloseTo((92 - 70 - 3) / 7, 5);
    });
  }

  it('a line that needs to shrink past minWordSpacing may track tighter instead', () => {
    // 74 px: "aaaaa bbbbb" is 77 px; its space may shrink to 4.2 px (74.2 px),
    // 0.2 px over. Negative tracking of 0.02 px a letter closes it.
    const loose = measureBlock('aaaaa bbbbb cc', FONT, 74, 20, KP).lines;
    expect(loose[0]!.text).toBe('aaaaa');
    const tight = measureBlock('aaaaa bbbbb cc', FONT, 74, 20, { ...KP, justifyTrackingPx: 0.1 }).lines;
    expect(tight[0]!.text).toBe('aaaaa bbbbb');
    expect(tight[0]!.letterSpacing).toBeCloseTo(-0.02, 5);
    expect(tight[0]!.justifiedSpaceRatio).toBeCloseTo(0.6, 5);
  });

  it('spaces that may not stretch at all (maxWordSpacing 1): tracking alone fills the line, at r = 1', () => {
    // The ratio of a line tracking fills is 1, not "infinitely loose", when
    // its spaces have no stretch: 5 px of slack over 10 letters at 1 px each.
    expect(adjustLine(5, 0, 3, 10, 1, true)).toEqual({ r: 1, tracking: 0.5, share: 0.5 });
    // More slack than tracking covers stays infeasible, as without tracking.
    expect(adjustLine(15, 0, 3, 10, 1, true).r).toBe(KP_INFINITY);
    // A line of rigid spaces that fits exactly takes none.
    expect(adjustLine(0, 0, 3, 10, 1, true)).toEqual({ r: 0, tracking: 0, share: 0 });
    // The breaker weighs it so: at 92 px the first line "aaaaa bbbbb" is 15 px
    // short, which 1.5 px a letter fills with the one space at its width.
    const rigid = { ...KP, maxStretchRatio: 1 };
    for (const lines of [
      measureBlock(TEXT_RIGID, FONT, 92, 20, { ...rigid, justifyTrackingPx: 2 }).lines,
      measureRichBlock([span('aaaaa', true), span(TEXT_RIGID.slice(5))], FONT, FONT, FONT, FONT, 92, 20, { ...rigid, justifyTrackingPx: 2 }).lines,
    ]) {
      expect(lines.map((l) => l.text)).toEqual(['aaaaa bbbbb', 'cccccccccc dd', 'ee']);
      expect(lines[0]!.letterSpacing).toBeCloseTo(1.5, 5);
      expect(lines[0]!.justifiedSpaceRatio).toBeCloseTo(1, 5);
      // "cccccccccc dd" is 1 px short: 1/12 px on each of its 12 letters.
      expect(lines[1]!.letterSpacing).toBeCloseTo(1 / 12, 5);
    }
  });

  it('lines within the word-spacing limits take none', () => {
    const text = 'the quick brown fox jumps over the lazy dog and runs far away into the woods';
    const plain = measureBlock(text, FONT, 140, 20, KP).lines;
    const tracked = measureBlock(text, FONT, 140, 20, { ...KP, justifyTrackingPx: 0.5 }).lines;
    expect(plain.every((l) => l.justifiedSpaceRatio === undefined || (l.justifiedSpaceRatio <= 2 && l.justifiedSpaceRatio >= 0.6))).toBe(true);
    expect(tracked).toEqual(plain);
  });
});

describe('bodyText.maxJustifyTracking (EF-65): the document and the renderers', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (maxJustifyTracking?: number): PostextConfig => ({
    page: { width: pt(112), height: pt(200), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontSize: pt(16), lineHeight: pt(20), firstLineIndent: pt(0), hyphenation: { enabled: false }, ...(maxJustifyTracking !== undefined ? { maxJustifyTracking } : {}) },
  });
  const paragraph = (doc: ReturnType<typeof buildDocument>): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;

  it('reads the setting in thousandths of an em of the body size', () => {
    // 16 px text: 50‰ is 0.8 px a letter.
    expect(paragraph(buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config())).lines[0]!.letterSpacing).toBeUndefined();
    const line = paragraph(buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config(50))).lines[0]!;
    expect(line.letterSpacing).toBeCloseTo(0.8, 5);
  });

  it('the canvas paints each line with its block tracking plus its own', () => {
    const block = paragraph(buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config(50)));
    const seen: string[] = [];
    const ctx = {
      font: '', fillStyle: '', textBaseline: 'alphabetic', _ls: '0px',
      get letterSpacing() { return this._ls; },
      set letterSpacing(v: string) { this._ls = v; seen.push(v); },
      fillText(text: string) { seen.push(`${this._ls}:${text}`); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    renderBlock(ctx as unknown as CanvasRenderingContext2D, block, block.bbox.width, block.bbox.x);
    expect(seen).toContain('0.8px:aaaaa');
    expect(seen).toContain('0px:cccccccccc');
    // A block tracked negative (a runt set short) paints so too.
    const tight = { ...block, letterSpacing: -0.2, lines: [block.lines[1]!] };
    seen.length = 0;
    renderBlock(ctx as unknown as CanvasRenderingContext2D, tight, block.bbox.width, block.bbox.x);
    expect(seen).toContain('-0.2px:cccccccccc');
  });

  it('a build with a measurement cache (the Sandbox worker, buildBundle) sets the same lines as one without', () => {
    // Runt tightening reads the measure's `lastLineRunt`, which a cached
    // measure once dropped; with justification tracking on, the two builds
    // then set callout bodies and quotes to different line counts.
    const words = ['a', 'slice', 'of', 'cucumber', 'is', 'left', 'in', 'salty', 'water', 'and', 'its', 'cells', 'shrink', 'by', 'osmosis', 'within', 'minutes'];
    const para = (seed: number, count: number) => Array.from({ length: count }, (_, i) => words[(seed * 7 + i * 5) % words.length]).join(' ') + '.';
    // para(1, 28) and para(1, 33) end on a runt that tightening takes up.
    const markdown = [
      para(1, 28), '', para(2, 31), '',
      ':::callout{type="box"}', para(1, 33), '', para(4, 19), ':::', '',
      `> ${para(5, 29)}`, '',
      para(6, 37), '', para(7, 17),
    ].join('\n');
    const cfg = { ...config(20), page: { ...config().page!, width: pt(190), height: pt(900) } };
    const lines = (doc: ReturnType<typeof buildDocument>) => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.map((b) => ({
      letterSpacing: b.letterSpacing,
      lines: b.lines.map((l) => [l.text, l.letterSpacing, l.justifiedSpaceRatio]),
    }))));
    const uncached = buildDocument({ markdown }, cfg);
    const cached = buildDocument({ markdown }, cfg, createMeasurementCache());
    expect(lines(cached)).toEqual(lines(uncached));
    // It is a real check: both tracking and runt tightening are at work.
    expect(lines(uncached).some((b) => b.lines.some((l) => l[1] !== undefined))).toBe(true);
    const loose = buildDocument({ markdown }, { ...cfg, bodyText: { ...cfg.bodyText, tightenRunts: false } });
    expect(lines(loose).flatMap((b) => b.lines).length).toBeGreaterThan(lines(uncached).flatMap((b) => b.lines).length);
  });

  it('a tracked line still too loose to justify is set ragged at its natural letter widths', () => {
    // "Go to the page" cannot take the URL after it: even with 0.64 px of
    // tracking its three spaces stretch past 3×, so it is set ragged. It
    // used to keep the tracking, a letter-spaced line on a ragged edge, which
    // canvas and PDF also spread on its spaces while HTML did not.
    const px = (value: number) => ({ value, unit: 'px' as const });
    const cfg: PostextConfig = {
      page: { width: px(220), height: px(2000), dpi: 96, margins: { top: px(20), bottom: px(20), left: px(20), right: px(20) } },
      layout: { layoutType: 'single' },
      bodyText: { maxJustifyTracking: 60, hyphenation: { enabled: false } },
    };
    const markdown = 'Go to the page at www.example.org/a-very-long-path/with-many-segments/and-more-segments/index.html for the full list of words and more of them here. The word **bold** too.';
    const line = paragraph(buildDocument({ markdown }, cfg)).lines[0]!;
    expect(line.text.trim()).toBe('Go to the page');
    expect(line.ragged).toBe(true);
    expect(line.letterSpacing).toBeUndefined();
    expect(line.justifiedSpaceRatio).toBeUndefined();
    for (const seg of line.segments!) expect(seg.width).toBeCloseTo(seg.text.length * 7, 5);
    expect(line.bbox.width).toBeCloseTo(line.segments!.reduce((s, seg) => s + seg.width, 0), 5);
    // The canvas paints it untracked.
    const block = paragraph(buildDocument({ markdown }, cfg));
    const seen: string[] = [];
    const ctx = {
      font: '', fillStyle: '', textBaseline: 'alphabetic', _ls: '0px',
      get letterSpacing() { return this._ls; },
      set letterSpacing(v: string) { this._ls = v; },
      fillText(text: string) { seen.push(`${this._ls}:${text}`); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    renderBlock(ctx as unknown as CanvasRenderingContext2D, { ...block, lines: [block.lines[0]!] }, block.bbox.width, block.bbox.x);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.startsWith('0px:')).toBe(true);
  });

  it('the HTML sets the letter-spacing of each line', () => {
    const doc = buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config(50));
    const html = renderToHtmlIndexed(doc).html;
    expect(html).toMatch(/class="pt-line"[^>]*letter-spacing:0\.8px;/);
  });
});
