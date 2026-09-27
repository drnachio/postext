import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import { resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../defaults/paragraphStyles';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import type { ParagraphStyleConfig, PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';

// EF-128: a paragraph style can indent every line of its paragraphs
// (`indent`), and the first-line or hanging indent is measured from there,
// so an indented line of verse can hang its turnover deeper than its own
// start: `indent: 1.5em` + `hangingIndent: 2.5em` sets the line at 1.5 em
// and its turnover at 4 em. Off (0) by default.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
// 72 dpi and a 10 pt body: 1 em = 10 px.
const config = (style: Omit<ParagraphStyleConfig, 'id'>): PostextConfig => ({
  page: { width: pt(200), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false } },
  paragraphStyles: [{ id: 'v', textAlign: 'left', ...style }],
});

const VERSE = 'And the long line of the verse runs on past the measure of the page and turns over, hanging deep.';
const build = (style: Omit<ParagraphStyleConfig, 'id'>, markdown = `:::paragraphs{style="v"}\n${VERSE}\n:::`): VDTDocument =>
  buildDocument({ markdown }, config(style));
const para = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const starts = (b: VDTBlock): number[] => b.lines.map((l) => l.bbox.x - b.bbox.x);

describe('paragraphStyles[].indent (EF-128)', () => {
  it('without it, firstLineIndent is ignored once hangingIndent is set (unchanged)', () => {
    const b = para(build({ firstLineIndent: em(1.5), hangingIndent: em(4) }));
    expect(b.lines.length).toBeGreaterThan(1);
    expect(starts(b)[0]).toBeCloseTo(0, 5);
    for (const x of starts(b).slice(1)) expect(x).toBeCloseTo(40, 5);
  });

  it('indents every line, and hangs the turnover from there', () => {
    const b = para(build({ indent: em(1.5), hangingIndent: em(2.5) }));
    expect(b.lines.length).toBeGreaterThan(1);
    expect(starts(b)[0]).toBeCloseTo(15, 5);
    for (const x of starts(b).slice(1)) expect(x).toBeCloseTo(40, 5);
    // Every line fits the narrower measure: the right edge stays put.
    for (const l of b.lines) expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(b.bbox.x + b.bbox.width + 0.01);
  });

  it('works with a first-line indent too, and on its own', () => {
    const withFirst = para(build({ indent: em(2), firstLineIndent: em(1) }));
    expect(starts(withFirst)[0]).toBeCloseTo(30, 5);
    for (const x of starts(withFirst).slice(1)) expect(x).toBeCloseTo(20, 5);
    const block = para(build({ indent: em(3) }));
    for (const x of starts(block)) expect(x).toBeCloseTo(30, 5);
    // The text wraps at the narrower measure.
    expect(block.lines.length).toBeGreaterThanOrEqual(para(build({})).lines.length);
  });

  it('applies inside a box too', () => {
    const doc = build({ indent: em(1.5), hangingIndent: em(2.5) }, `:::callout\n:::paragraphs{style="v"}\n${VERSE}\n:::\n:::`);
    const b = para(doc);
    expect(b.containerId).toBeDefined();
    expect(starts(b)[0]).toBeCloseTo(15, 5);
    for (const x of starts(b).slice(1)) expect(x).toBeCloseTo(40, 5);
  });

  it('the HTML sets the lines where the layout put them', () => {
    const doc = build({ indent: em(1.5), hangingIndent: em(2.5) });
    const b = para(doc);
    const html = renderToHtml(doc);
    for (const l of b.lines) expect(html).toContain(`left:${l.bbox.x}px;`);
  });

  it('resolves to 0 and is stripped when 0; a negative indent counts as none', () => {
    const body = resolveBodyTextConfig();
    expect(resolveParagraphStylesConfig([{ id: 'a' }], body)[0]!.indent).toEqual(em(0));
    expect(stripParagraphStylesDefaults([{ id: 'a', indent: em(0) }])).toEqual([{ id: 'a' }]);
    expect(stripParagraphStylesDefaults([{ id: 'a', indent: em(1) }])).toEqual([{ id: 'a', indent: em(1) }]);
    const b = para(build({ indent: em(-2) }));
    for (const x of starts(b)) expect(x).toBeCloseTo(0, 5);
  });
});
