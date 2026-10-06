import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, HeadingStyleConfig } from '../../types';
import type { VDTBlock, VDTDocument, VDTPage } from '../../vdt';

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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const article = (extra: Partial<HeadingStyleConfig> = {}): HeadingStyleConfig => ({
  id: 'article', numbered: false, span: 'page', breakBefore: { enabled: false }, fontSize: pt(16), ...extra,
});

const config = (style: HeadingStyleConfig): PostextConfig => ({
  page: { width: mm(160), height: mm(240), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  headingStyles: [style],
});

const MD = [
  '# The first article {style="article"}', '', filler(9), '',
  '# The second article {style="article"}', '', filler(9),
].join('\n');

const build = (style: HeadingStyleConfig): VDTDocument => buildDocument({ markdown: MD }, config(style), createMeasurementCache());
const headings = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'heading');
const textColumnsOf = (page: VDTPage) => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
const bottomOf = (b: VDTBlock): number => b.bbox.y + b.bbox.height;

describe('a span: page heading that opens mid-page (#539)', () => {
  it('starts a new page by default, breakBefore off or not', () => {
    const doc = build(article());
    const [, second] = headings(doc);
    expect(second!.pageIndex).toBe(1);
  });

  it('with spanBreak: false opens under the text before it, across the columns', () => {
    const doc = build(article({ spanBreak: false }));
    const [first, second] = headings(doc);
    expect(first!.pageIndex).toBe(0);
    expect(second!.pageIndex).toBe(0);
    const page = doc.pages[0]!;
    // The first article's text sits above the second heading in both columns.
    const before = doc.blocks.filter((b) => b.type === 'paragraph' && b.pageIndex === 0 && b.bbox.y < second!.bbox.y);
    const after = doc.blocks.filter((b) => b.type === 'paragraph' && b.pageIndex === 0 && b.bbox.y > second!.bbox.y);
    expect(new Set(before.map((b) => b.columnIndex)).size).toBe(2);
    for (const b of before) expect(bottomOf(b)).toBeLessThanOrEqual(second!.bbox.y + 0.5);
    // The text under it starts below its band in every column of its band.
    expect(after.length).toBeGreaterThan(0);
    for (const b of after) expect(b.bbox.y).toBeGreaterThanOrEqual(bottomOf(second!) - 0.5);
    const band = page.columns[second!.columnIndex]!.band ?? 0;
    expect(band).toBeGreaterThan(0);
    expect(new Set(after.map((b) => b.columnIndex)).size).toBe(2);
    // The columns above it end level, within a line.
    const closed = textColumnsOf(page).filter((c) => (c.band ?? 0) === band - 1);
    const ends = closed.map((c) => c.bbox.y + c.bbox.height - c.availableHeight);
    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(60);
    // Painted across the page, from its own overlay (the page's opener
    // band belongs to the first article).
    expect(second!.designOverlay).toBeDefined();
    expect(second!.designOverlay!.bbox.width).toBeCloseTo(page.contentArea.width, 0);
    expect(page.openerBand).toBeDefined();
    expect(first!.hidden).toBe(true);
  });

  it('paints a designed opener across the page at the heading', () => {
    const design: HeadingStyleConfig['advancedDesign'] = {
      enabled: true,
      slot: { elements: [{ kind: 'text', id: 't', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } }] },
    };
    const doc = build(article({ spanBreak: false, advancedDesign: design }));
    const [, second] = headings(doc);
    expect(second!.pageIndex).toBe(0);
    const overlay = second!.designOverlay!;
    expect(overlay.bbox.y).toBeCloseTo(second!.bbox.y, 5);
    const text = overlay.blocks.find((b) => b.kind === 'text');
    expect(text && 'lines' in text ? text.lines.map((l) => l.text).join(' ') : '').toBe('The second article');
  });

  it('still takes the next page when the room left would not hold it and a few lines', () => {
    const md = ['# The first article {style="article"}', '', filler(90), '', '# The second article {style="article"}', '', filler(4)].join('\n');
    const doc = buildDocument({ markdown: md }, config(article({ spanBreak: false })), createMeasurementCache());
    const [first, second] = headings(doc);
    expect(second!.pageIndex).toBeGreaterThan(first!.pageIndex);
    expect(doc.pages[second!.pageIndex]!.columns[second!.columnIndex]!.band ?? 0).toBe(0);
  });
});
