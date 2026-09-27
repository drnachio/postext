import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { renderToHtml } from '../../html-backend';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { ParagraphStyleConfig, PostextConfig } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
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

// Default page is 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px.
// The `bib` style is 7pt → 29.17px, leading 1.2em → 35px, hanging 2em → 58.33px.
const GRID = 50;
const BIB_FONT_PX = (7 * 300) / 72;
const BIB_LEADING = BIB_FONT_PX * 1.2;
const BIB_HANGING = BIB_FONT_PX * 2;

const SENTENCE =
  'Referencia bibliográfica con autores, título de la obra, editorial y año de publicación para probar el sangrado francés. ';
const entry = (n: number): string => SENTENCE.repeat(n).trim();

const bibConfig = (extra?: Partial<ParagraphStyleConfig>): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  paragraphStyles: [{
    id: 'bib',
    fontSize: { value: 7, unit: 'pt' },
    lineHeight: { value: 1.2, unit: 'em' },
    hangingIndent: { value: 2, unit: 'em' },
    textAlign: 'left',
    ...extra,
  }],
});

function build(md: string, config: PostextConfig): VDTDocument {
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const headings = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'heading');
const columnTop = (doc: VDTDocument, b: VDTBlock): number =>
  doc.pages[b.pageIndex]!.columns[b.columnIndex]!.bbox.y;

const SAMPLE = [
  'Intro.',
  '',
  ':::paragraphs{style="bib"}',
  entry(3),
  '',
  entry(3),
  ':::',
  '',
  'After.',
  '',
].join('\n');

describe(':::paragraphs containers', () => {
  it('paragraphs inside :::paragraphs use the style font size and leading', () => {
    const doc = build(SAMPLE, bibConfig());
    const [intro, e1, e2, after] = paragraphs(doc);
    expect(after).toBeDefined();

    expect(e1!.fontString).not.toBe(intro!.fontString);
    expect(e1!.fontString).toBe(e2!.fontString);
    expect(after!.fontString).toBe(intro!.fontString);

    expect(intro!.lines[0]!.bbox.height).toBeCloseTo(GRID, 5);
    expect(e1!.lines.length).toBeGreaterThan(1);
    expect(e1!.lines[0]!.bbox.height).toBeCloseTo(BIB_LEADING, 5);
    expect(e1!.lines[1]!.bbox.y - e1!.lines[0]!.bbox.y).toBeCloseTo(BIB_LEADING, 5);
  });

  it('hanging indent indents lines 2+ only', () => {
    const doc = build(SAMPLE, bibConfig());
    const e1 = paragraphs(doc)[1]!;
    expect(e1.lines.length).toBeGreaterThanOrEqual(3);
    const x0 = e1.lines[0]!.bbox.x;
    for (const line of e1.lines.slice(1)) {
      expect(line.bbox.x - x0).toBeCloseTo(BIB_HANGING, 5);
    }
  });

  it('zero spaceBetween yields no gap between entries', () => {
    const doc = build(SAMPLE, bibConfig());
    const [, e1, e2] = paragraphs(doc);
    expect(e2!.bbox.y).toBeCloseTo(e1!.bbox.y + e1!.bbox.height, 5);
    expect(e1!.bbox.height).toBeCloseTo(e1!.lines.length * BIB_LEADING, 5);
  });

  it('spaceBetween separates entries by exactly that amount', () => {
    const doc = build(SAMPLE, bibConfig({ spaceBetween: { value: 0.5, unit: 'em' } }));
    const [, e1, e2] = paragraphs(doc);
    expect(e2!.bbox.y - (e1!.bbox.y + e1!.bbox.height)).toBeCloseTo(BIB_FONT_PX * 0.5, 5);
  });

  it('the flow after the container is back on the baseline grid', () => {
    const doc = build(SAMPLE, bibConfig());
    const [intro, e1, e2, after] = paragraphs(doc);
    // The container interior is off-grid by design (35px leading on a 50px
    // grid); only its last paragraph snaps.
    expect(e1!.snappedToGrid).toBe(false);
    expect(e2!.snappedToGrid).toBe(true);
    expect((e2!.bbox.y + e2!.bbox.height - columnTop(doc, e2!)) % GRID).toBeCloseTo(0, 5);
    expect((after!.bbox.y - columnTop(doc, after!)) % GRID).toBeCloseTo(0, 5);
    expect((intro!.bbox.y - columnTop(doc, intro!)) % GRID).toBeCloseTo(0, 5);
  });

  it('marginTop / marginBottom pad the container while keeping the grid after it', () => {
    const doc = build(SAMPLE, bibConfig({
      marginTop: { value: 1, unit: 'em' },
      marginBottom: { value: 1, unit: 'em' },
    }));
    const [intro, e1, e2, after] = paragraphs(doc);
    expect(e1!.bbox.y - (intro!.bbox.y + intro!.bbox.height)).toBeCloseTo(BIB_FONT_PX, 5);
    const lastLine = e2!.lines[e2!.lines.length - 1]!;
    const textBottom = e2!.bbox.y + lastLine.bbox.y - e2!.lines[0]!.bbox.y + BIB_LEADING;
    expect(after!.bbox.y - textBottom).toBeGreaterThanOrEqual(BIB_FONT_PX - 0.01);
    expect((after!.bbox.y - columnTop(doc, after!)) % GRID).toBeCloseTo(0, 5);
  });

  it('negative marginTop / marginBottom pull the container and the flow after it up', () => {
    const doc = build(SAMPLE, bibConfig({
      marginTop: { value: -1, unit: 'em' },
      marginBottom: { value: -1, unit: 'em' },
    }));
    const [intro, e1, e2, after] = paragraphs(doc);
    // The container starts one style em above the intro's bottom edge.
    expect(e1!.bbox.y - (intro!.bbox.y + intro!.bbox.height)).toBeCloseTo(-BIB_FONT_PX, 5);
    // The flow after it snaps to the first grid line at or above the text
    // bottom minus the margin (so it may sit above the text's own bottom).
    const lastLine = e2!.lines[e2!.lines.length - 1]!;
    const textBottom = e2!.bbox.y + lastLine.bbox.y - e2!.lines[0]!.bbox.y + BIB_LEADING;
    expect(after!.bbox.y - textBottom).toBeGreaterThanOrEqual(-BIB_FONT_PX - 0.01);
    expect(after!.bbox.y - textBottom).toBeLessThan(GRID - BIB_FONT_PX + 0.01);
    expect((after!.bbox.y - columnTop(doc, after!)) % GRID).toBeCloseTo(0, 5);
    // …and it starts above where a zero margin would have put it.
    const plain = paragraphs(build(SAMPLE, bibConfig()))[3]!;
    expect(after!.bbox.y).toBeLessThan(plain.bbox.y);
  });

  it('unknown style id falls back to body style', () => {
    const doc = build(SAMPLE.replace('style="bib"', 'style="nope"'), bibConfig());
    const [intro, e1, e2, after] = paragraphs(doc);
    expect(e1!.fontString).toBe(intro!.fontString);
    expect(e2!.fontString).toBe(intro!.fontString);
    expect(e1!.lines[0]!.bbox.height).toBeCloseTo(GRID, 5);
    expect((after!.bbox.y - columnTop(doc, after!)) % GRID).toBeCloseTo(0, 5);
  });

  describe('marker blocks do not disturb lookaheads', () => {
    it('a heading run continues across a containerStart', () => {
      const md = ['# A', '', ':::paragraphs{style="bib"}', '## B', '', entry(2), ':::', ''].join('\n');
      const doc = build(md, bibConfig());
      const [a, b] = headings(doc);
      // Consecutive headings collapse margins and only the last one snaps —
      // the marker between them must be invisible to that rule.
      expect(a!.snappedToGrid).toBe(false);
      expect(b!.snappedToGrid).toBe(true);
    });

    it('indentAfterHeading: false sees the heading through a containerStart', () => {
      const config = bibConfig({ hangingIndent: undefined, firstLineIndent: { value: 2, unit: 'em' } });
      config.bodyText = { indentAfterHeading: false };
      const afterHeading = ['# A', '', ':::paragraphs{style="bib"}', entry(2), ':::', ''].join('\n');
      const afterParagraph = ['Intro.', '', ':::paragraphs{style="bib"}', entry(2), ':::', ''].join('\n');
      const p1 = paragraphs(build(afterHeading, config))[0]!;
      const p2 = paragraphs(build(afterParagraph, config))[1]!;
      expect(p1.lines[0]!.bbox.x).toBeCloseTo(p1.lines[1]!.bbox.x, 5);
      expect(p2.lines[0]!.bbox.x - p2.lines[1]!.bbox.x).toBeCloseTo(BIB_HANGING, 5);
    });

    it('heading keepWithNext holds across a containerStart, with heading runs rolled back intact', () => {
      // Small single-column page (~11 body lines) so a short sweep of the
      // filler length walks the heading run across the column bottom.
      // Keep-with-next must then carry both headings (and the marker between
      // them) into the next column without losing or duplicating a heading.
      const mm = (value: number) => ({ value, unit: 'mm' as const });
      const config: PostextConfig = {
        ...bibConfig(),
        page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
        layout: { layoutType: 'single' },
      };
      let pushed = 0;
      for (let n = 3; n <= 12; n++) {
        const md = [entry(n), '', '# A', '', ':::paragraphs{style="bib"}', '## B', '', entry(2), ':::', ''].join('\n');
        const doc = build(md, config);
        const hs = headings(doc);
        expect(hs.map((h) => h.headingLevel)).toEqual([1, 2]);
        const first = paragraphs(doc).find((p) => p.contentIndex !== undefined && p.contentIndex > hs[1]!.contentIndex!)!;
        for (const h of hs) {
          expect([h.pageIndex, h.columnIndex]).toEqual([first.pageIndex, first.columnIndex]);
        }
        // A keep-with-next push leaves the filler's column with room the
        // heading itself would have fitted in.
        const a = hs[0]!;
        const fillerParts = paragraphs(doc).filter((p) => p.contentIndex === 0);
        const lastFiller = fillerParts[fillerParts.length - 1]!;
        const fillerCol = doc.pages[lastFiller.pageIndex]!.columns[lastFiller.columnIndex]!;
        const sameCol = lastFiller.pageIndex === a.pageIndex && lastFiller.columnIndex === a.columnIndex;
        if (!sameCol && fillerCol.availableHeight >= a.bbox.height) pushed++;
      }
      expect(pushed).toBeGreaterThan(0);
    }, 30_000);
  });
});

// EF-68. A coloured paragraph style set its italic runs in the body text's
// italic colour, with no way to give them the style's own.
describe('paragraph style italic colour (EF-68)', () => {
  const red = { hex: '#aa0000', model: 'hex' as const };
  const blue = { hex: '#0000aa', model: 'hex' as const };
  const green = { hex: '#00aa00', model: 'hex' as const };
  const md = ['Intro *body italic*.', '', ':::paragraphs{style="c"}', 'Coloured text with *italic words* and **bold words**.', ':::', ''].join('\n');

  it('italic runs in a styled paragraph take the style\'s italicColor', () => {
    const doc = build(md, { bodyText: { italicColor: green }, paragraphStyles: [{ id: 'c', color: red, italicColor: blue }] });
    const [intro, styled] = paragraphs(doc);
    expect(styled!.color).toBe('#aa0000');
    expect(styled!.italicColor).toBe('#0000aa');
    expect(intro!.italicColor).toBe('#00aa00');
    // Painted: the HTML backend colours the italic run.
    const html = renderToHtml(doc);
    expect(html).toMatch(/color:#0000aa[^>]*>[^<]*italic/);
  });

  it('without italicColor, italic runs keep the body text italic colour (as in 1.4)', () => {
    const doc = build(md, { bodyText: { italicColor: green }, paragraphStyles: [{ id: 'c', color: red }] });
    const styled = paragraphs(doc)[1]!;
    expect(styled.italicColor).toBe('#00aa00');
  });
});

// EF-77. A `:::paragraphs` container inside a callout ignored its style's
// marginTop / marginBottom: the box stacked its entries as if the container
// were not there. They collapse with the neighbours' spacing as in running
// text, vanish at the top of the box, and a negative one pulls.
describe(':::paragraphs inside a callout (EF-77)', () => {
  const boxed = (lead: boolean) => [
    'Intro.',
    '',
    ':::callout{type="note"}',
    ...(lead ? ['First paragraph in the box.', ''] : []),
    ':::paragraphs{style="bib"}',
    entry(1),
    '',
    entry(1),
    ':::',
    '',
    'Last paragraph in the box.',
    ':::',
    '',
  ].join('\n');
  const byText = (doc: VDTDocument, start: string): VDTBlock =>
    doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]?.text.startsWith(start))!;
  const entries = (doc: VDTDocument): VDTBlock[] =>
    doc.blocks.filter((b) => b.type === 'paragraph' && b.lines[0]?.text.startsWith('Referencia'));
  const bottom = (b: VDTBlock): number => b.bbox.y + b.bbox.height;
  const gaps = (doc: VDTDocument) => {
    const [e1, e2] = entries(doc);
    return {
      above: e1!.bbox.y - bottom(byText(doc, 'First')),
      between: e2!.bbox.y - bottom(e1!),
      below: byText(doc, 'Last').bbox.y - bottom(e2!),
    };
  };

  it('applies the style margins around the container, collapsing with the spacing there', () => {
    const plain = gaps(build(boxed(true), bibConfig()));
    const spaced = gaps(build(boxed(true), bibConfig({
      marginTop: { value: 1, unit: 'em' },
      marginBottom: { value: 2, unit: 'em' },
    })));
    expect(spaced.above).toBeCloseTo(Math.max(plain.above, BIB_FONT_PX), 5);
    expect(spaced.above).toBeGreaterThan(plain.above);
    expect(spaced.between).toBeCloseTo(plain.between, 5);
    expect(spaced.below).toBeCloseTo(Math.max(plain.below, 2 * BIB_FONT_PX), 5);
    expect(spaced.below).toBeGreaterThan(plain.below);
  });

  it('a container that opens the box takes no top margin (as at the top of a column)', () => {
    const md = boxed(false);
    const firstEntry = (config: PostextConfig) => entries(build(md, config))[0]!.bbox.y;
    expect(firstEntry(bibConfig({ marginTop: { value: 3, unit: 'em' } }))).toBeCloseTo(firstEntry(bibConfig()), 5);
  });

  it('a negative marginTop pulls the container up into the spacing above it', () => {
    const plain = gaps(build(boxed(true), bibConfig({ spaceBetween: { value: 0, unit: 'em' } })));
    const pulled = gaps(build(boxed(true), bibConfig({ marginTop: { value: -0.5, unit: 'em' } })));
    expect(pulled.above).toBeCloseTo(plain.above - BIB_FONT_PX / 2, 5);
  });

  it('leaves a box without paragraph containers as it was', () => {
    const md = ['Intro.', '', ':::callout{type="note"}', 'First paragraph in the box.', '', 'Last paragraph in the box.', ':::', ''].join('\n');
    const doc = build(md, bibConfig({ marginTop: { value: 3, unit: 'em' } }));
    const gap = byText(doc, 'Last').bbox.y - bottom(byText(doc, 'First'));
    const ref = build(md, bibConfig());
    expect(gap).toBeCloseTo(byText(ref, 'Last').bbox.y - bottom(byText(ref, 'First')), 5);
  });
});
