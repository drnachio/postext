import { describe, it, expect } from 'vitest';
import { buildDocument } from '../index';
import { createMeasurementCache } from '../measure';
import type { PostextConfig, Resource } from '../types';
import type { VDTBlock, VDTDocument, VDTPage } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const SENTENCE = 'Body text that runs on for a while and keeps going. ';
const para = (n: number, tag = '') => `${tag}${SENTENCE.repeat(n)}`.trim();

/** An 800 × 1000pt page at 72 dpi, 30pt margins, 12pt gutters, no running
 *  heads; the body set 9/11pt. */
const config = (columnCount: number, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(800), height: pt(1000), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'multiple', columnCount, gutterWidth: pt(12), columnRule: { enabled: true } },
  bodyText: { fontSize: pt(9), lineHeight: pt(11) },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

const columnWidth = (n: number) => (740 - (n - 1) * 12) / n;

const build = (markdown: string, cfg: PostextConfig, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

const textColumns = (page: VDTPage) => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
const usedBottom = (c: VDTPage['columns'][number]) => c.bbox.y + c.bbox.height - c.availableHeight;

const picture = (id: string, placement: Resource['placement']): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: id, format: 'png', width: 400, height: 300 }, caption: `Caption ${id}`, placement,
});
const floatOf = (doc: VDTDocument, id: string) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((f) => ({ page: p, f }))).find(({ f }) => f.resourceBlock?.resource.id === id);

describe('footnotes on a page of several columns (#505)', () => {
  const notes = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.footnoteNote !== undefined);
  const citing = (doc: VDTDocument, id: string): VDTBlock | undefined =>
    doc.blocks.find((b) => b.footnoteNote === undefined && b.lines.some((l) => l.segments?.some((s) => s.footnoteId === id)));

  it.each([3, 4])('sets each note at the foot of the column that cites it (%i columns)', (n) => {
    // Enough text for a page and more: the citations land in different columns.
    const md = [
      `${para(12)} First citation.[^a] ${para(4)}`,
      para(30),
      `${para(10)} Second citation.[^b] ${para(4)}`,
      para(30),
      `${para(8)} Third citation.[^c] ${para(4)}`,
      para(20),
      '[^a]: The first note.',
      '[^b]: The second note, a little longer than the first so it may take two lines in its narrow column.',
      '[^c]: The third note.',
    ].join('\n\n');
    const doc = build(md, config(n));
    const ns = notes(doc);
    expect(ns.map((b) => b.footnoteNote)).toEqual(['a', 'b', 'c']);
    const where = new Set<string>();
    for (const note of ns) {
      const cite = citing(doc, note.footnoteNote!)!;
      expect(cite).toBeDefined();
      expect(note.pageIndex).toBe(cite.pageIndex);
      expect(note.columnIndex).toBe(cite.columnIndex);
      where.add(`${note.pageIndex}:${note.columnIndex}`);
      const page = doc.pages[note.pageIndex!]!;
      const col = page.columns[note.columnIndex!]!;
      // Inside its column's measure, under the column's text, above the page foot.
      expect(note.bbox.x).toBeGreaterThanOrEqual(col.bbox.x - 0.5);
      expect(note.bbox.x + note.bbox.width).toBeLessThanOrEqual(col.bbox.x + col.bbox.width + 0.5);
      const text = col.blocks.filter((b) => b.footnoteNote === undefined);
      const textBottom = Math.max(...text.map((b) => b.bbox.y + b.bbox.height));
      expect(note.bbox.y).toBeGreaterThan(textBottom - 0.5);
      expect(note.bbox.y + note.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.5);
    }
    // The citations fall in different columns, so do the notes.
    expect(where.size).toBe(3);
  });
});

describe('the closing page of a section on several columns (#505)', () => {
  // The closing band is cut at the whole grid lines its text needs spread
  // evenly over the columns (rounded up): every column ends at the cut but
  // the last, which takes what is left — up to n − 1 lines short.
  const expectLevel = (doc: VDTDocument, page: VDTPage, n: number) => {
    const filled = textColumns(page).filter((c) => c.blocks.length > 0);
    // Every column of the closing page takes text…
    expect(filled).toHaveLength(n);
    for (const c of filled) expect(c.trailingCap).toBe(true);
    // …and they end level, short of the foot.
    const bottoms = filled.map(usedBottom);
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual((n - 1) * doc.baselineGrid + 0.5);
    expect(Math.max(...bottoms)).toBeLessThan(page.contentArea.y + page.contentArea.height - doc.baselineGrid);
  };

  it.each([3, 4, 6])('ends the %i columns of the last page level', (n) => {
    // A few pages of text: the last one holds a short close.
    const md = Array.from({ length: 60 + 20 * n }, (_, i) => para(4 + (i % 3), `P${i}. `)).join('\n\n');
    const doc = build(md, config(n));
    expect(doc.pages.length).toBeGreaterThan(1);
    expectLevel(doc, doc.pages[doc.pages.length - 1]!, n);
  });

  it('levels the page that closes a chapter before the next one opens', () => {
    const chapter = (k: number, paras: number) =>
      [`# Chapter ${k}`, ...Array.from({ length: paras }, (_, i) => para(4 + (i % 3), `C${k}P${i}. `))].join('\n\n');
    const doc = build(`${chapter(1, 46)}\n\n${chapter(2, 12)}`, config(4, {
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    }));
    const opener = doc.blocks.find((b) => b.type === 'heading' && b.headingLevel === 1 && b.pageIndex! > 0)!;
    expect(opener).toBeDefined();
    expectLevel(doc, doc.pages[opener.pageIndex! - 1]!, 4);
  });
});

describe('a bottom float across several columns (#505)', () => {
  it.each([[4, 2], [6, 3]])('on %i columns sits at the foot of %i of them', (n, k) => {
    const md = `${para(20)} :ref{id="a"}\n\n${para(60)}\n\n${para(60)}\n\n${para(60)}\n\n${para(60)}`;
    const doc = build(md, config(n), [picture('a', { position: 'bottom', columns: k })]);
    const { page, f } = floatOf(doc, 'a')!;
    expect(f.bbox.width).toBeCloseTo(k * columnWidth(n) + (k - 1) * 12, 3);
    // At the foot of the type area (its last grid line).
    const foot = page.contentArea.y + page.contentArea.height;
    expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(foot + 0.5);
    expect(f.bbox.y + f.bbox.height).toBeGreaterThan(foot - doc.baselineGrid);
    // Its left edge on a column's.
    const cols = textColumns(page);
    expect(cols.some((c) => Math.abs(c.bbox.x - f.bbox.x) < 0.5)).toBe(true);
    // The k columns over it stop above it; the others run to the foot.
    const over = cols.filter((c) => c.bbox.x >= f.bbox.x - 0.5 && c.bbox.x < f.bbox.x + f.bbox.width);
    expect(over).toHaveLength(k);
    for (const c of over) expect(c.bbox.y + c.bbox.height).toBeLessThanOrEqual(f.bbox.y + 0.5);
    for (const c of cols.filter((c) => !over.includes(c))) {
      expect(c.bbox.y + c.bbox.height).toBeGreaterThan(f.bbox.y + f.bbox.height - 0.5);
    }
    // No text runs under the picture.
    for (const c of over) for (const b of c.blocks) expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(f.bbox.y + 0.5);
  });
});

describe('a page-span heading on several columns (#505)', () => {
  const cfg = (n: number) => config(n, {
    headings: {
      levels: [
        { level: 1, span: 'page', fontSize: pt(24), lineHeight: pt(28), breakBefore: { enabled: true, parity: 'any' } },
        { level: 2, span: 'page', fontSize: pt(16), lineHeight: pt(20) },
      ],
    },
  });

  /** The heading opens its page in column 0 and reserves its band across
   *  every column: the text of all n columns starts under it. */
  const expectBand = (doc: VDTDocument, heading: VDTBlock, n: number) => {
    const page = doc.pages[heading.pageIndex!]!;
    const band = page.openerBand!;
    expect(band).toBeDefined();
    expect(band.bbox.y).toBeCloseTo(page.contentArea.y, 3);
    expect(band.bbox.width).toBeCloseTo(740, 3);
    expect(heading.columnIndex).toBe(0);
    const cols = textColumns(page);
    expect(cols).toHaveLength(n);
    const bandBottom = band.bbox.y + band.bbox.height;
    for (const c of cols) {
      expect(c.bbox.width).toBeCloseTo(columnWidth(n), 3);
      const text = c.blocks.filter((b) => b.type !== 'heading');
      expect(text.length).toBeGreaterThan(0);
      for (const b of text) expect(b.bbox.y).toBeGreaterThanOrEqual(bandBottom - 0.5);
    }
  };

  it.each([4, 6, 8])('opens a page across all %i columns', (n) => {
    const doc = build(`# A Title Across the Page\n\n${para(200)}`, cfg(n));
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.pageIndex).toBe(0);
    expectBand(doc, heading, n);
  });

  it.each([4, 5])('a section heading across %i columns opens a fresh page, the page before it closing level', (n) => {
    const doc = build(`${para(40)}\n\n## A Section Across the Page\n\n${para(200)}`, cfg(n));
    const heading = doc.blocks.find((b) => b.type === 'heading' && b.headingLevel === 2)!;
    expect(heading.pageIndex).toBe(1);
    expectBand(doc, heading, n);
    // The text before it shares the first page out level.
    const before = textColumns(doc.pages[0]!).filter((c) => c.blocks.length > 0);
    expect(before).toHaveLength(n);
    const bottoms = before.map(usedBottom);
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual((n - 1) * doc.baselineGrid + 0.5);
  });
});
