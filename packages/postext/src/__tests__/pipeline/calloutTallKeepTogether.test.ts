import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { PostextConfig, Resource } from '../../types';

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

// A keep-together box taller than a full column (issue #129) splits like a
// `keepTogether: false` one instead of overflowing; a box a column can
// hold still moves whole.

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });
const TITLE = 'Recuerda';
const ICON = '★';

const style = (extra: Record<string, unknown> = {}) =>
  [{ id: 'note', title: TITLE, span: 'column' as const, icon: { kind: 'glyph' as const, glyph: ICON }, ...extra }];

/** Small single-column page (~11 body lines). */
const SMALL_PAGE = (extra: Record<string, unknown> = {}): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: style(extra),
});

/** Two-column page, ~23 grid lines tall, balancing off. */
const TWO_COL = (extra: Record<string, unknown> = {}): PostextConfig => ({
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  calloutStyles: style(extra),
});

const note = (body: string, attrs = ''): string => [`:::callout{type="note"${attrs}}`, body, ':::'].join('\n');
const paras = (n: number, each = 3): string => Array.from({ length: n }, () => filler(each)).join('\n\n');

const build = (md: string, config: PostextConfig, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown: md, resources }, config, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b.type !== 'callout'
    && b.pageIndex === frame.pageIndex && b.columnIndex === frame.columnIndex);
const linesOf = (doc: VDTDocument, frame: VDTBlock): number =>
  childrenOf(doc, frame).reduce((n, b) => n + b.lines.length, 0);
const overlayTexts = (frame: VDTBlock, needle: string): number =>
  (frame.designOverlay?.blocks ?? []).filter((b) => b.kind === 'text' && b.lines.some((l) => l.text.includes(needle))).length;

/** Every fragment sits inside its page's content area. */
function expectInsidePages(doc: VDTDocument, fs: VDTBlock[]): void {
  for (const f of fs) {
    const page = doc.pages[f.pageIndex]!;
    expect(f.bbox.y).toBeGreaterThanOrEqual(page.contentArea.y - 0.01);
    expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.01);
  }
}

/** Head keeps title and icon, continuations drop both; parts numbered in order. */
function expectFragments(fs: VDTBlock[]): void {
  fs.forEach((f, i) => {
    expect(f.callout!.part ?? 0).toBe(i);
    expect(f.callout!.continued ?? false).toBe(i < fs.length - 1);
    expect(overlayTexts(f, TITLE)).toBe(i === 0 ? 1 : 0);
    expect(overlayTexts(f, ICON)).toBe(i === 0 ? 1 : 0);
  });
}

describe('keep-together box taller than a full column', () => {
  it('splits across pages with no warning, every line set once', () => {
    const md = `${filler(4)}\n\n${note(paras(8))}\n\n${filler(2)}`;
    const doc = build(md, SMALL_PAGE());
    const fs = frames(doc);
    expect(fs.length).toBeGreaterThan(1);
    expect(doc.warnings ?? []).toHaveLength(0);
    expectInsidePages(doc, fs);
    expectFragments(fs);
    // The head opens where the box occurs, under the text before it.
    expect(fs[0]!.pageIndex).toBe(0);
    // Every paragraph of the box is set, in reading order.
    const kids = fs.flatMap((f) => childrenOf(doc, f));
    expect(kids.every((b) => b.type === 'paragraph')).toBe(true);
    const indices = [...new Set(kids.map((b) => b.contentIndex!))];
    expect(indices).toHaveLength(8);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  }, 60000);

  it('splits exactly like keepTogether: false', () => {
    const md = `${filler(4)}\n\n${note(paras(8))}\n\n${filler(2)}`;
    const kt = build(md, SMALL_PAGE());
    const split = build(md, SMALL_PAGE({ keepTogether: false }));
    const sig = (doc: VDTDocument) => frames(doc).map((f) => [f.pageIndex, f.columnIndex, Math.round(f.bbox.y), Math.round(f.bbox.height)]);
    expect(sig(kt)).toEqual(sig(split));
  }, 60000);

  it('honours splitMinLines', () => {
    // One 40-sentence paragraph: every cut falls between its lines.
    const md = note(filler(40));
    const doc = build(md, SMALL_PAGE({ splitMinLines: 3 }));
    const fs = frames(doc);
    expect(fs.length).toBeGreaterThan(1);
    expect(doc.warnings ?? []).toHaveLength(0);
    for (const f of fs) expect(linesOf(doc, f)).toBeGreaterThanOrEqual(3);
  }, 60000);

  it('a column box in a two-column layout starts in the current column and runs on', () => {
    const md = `${filler(6)}\n\n${note(paras(14))}\n\n${filler(4)}`;
    const doc = build(md, TWO_COL());
    const fs = frames(doc);
    expect(fs.length).toBeGreaterThan(1);
    expect(doc.warnings ?? []).toHaveLength(0);
    expectInsidePages(doc, fs);
    expectFragments(fs);
    expect(fs[0]!.pageIndex).toBe(0);
    expect(fs[0]!.columnIndex).toBe(0);
    for (const f of fs) {
      const col = doc.pages[f.pageIndex]!.columns[f.columnIndex]!;
      expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.01);
    }
  }, 60000);

  it('a page-span box taller than the page splits across pages', () => {
    const md = `${paras(3)}\n\n${note(paras(26), ' span="page"')}\n\n${paras(2)}`;
    const doc = build(md, TWO_COL());
    const fs = frames(doc);
    expect(fs.length).toBeGreaterThan(1);
    expect(doc.warnings ?? []).toHaveLength(0);
    expectInsidePages(doc, fs);
    expectFragments(fs);
    for (const f of fs) expect(doc.pages[f.pageIndex]!.columns[f.columnIndex]!.kind).toBe('span');
    // One fragment per page.
    expect(new Set(fs.map((f) => f.pageIndex)).size).toBe(fs.length);
  }, 60000);

  it('a floated box taller than the page stays in the flow and splits', () => {
    const md = `${paras(3)}\n\n${note(paras(26), ' span="page" placement="top"')}\n\n${paras(2)}`;
    const doc = build(md, TWO_COL());
    const fs = frames(doc);
    expect(fs.length).toBeGreaterThan(1);
    expect(doc.warnings ?? []).toHaveLength(0);
    expectInsidePages(doc, fs);
    expectFragments(fs);
    // Not a float: the fragments sit in span columns of the flow.
    expect(doc.pages.flatMap((p) => p.floats ?? []).filter((b) => b.type === 'callout')).toHaveLength(0);
    // A floated box a page can hold still floats whole.
    const short = build(`${paras(3)}\n\n${note(filler(2), ' span="page" placement="top"')}\n\n${paras(8)}`, TWO_COL());
    expect(frames(short)).toHaveLength(1);
    expect(short.pages.flatMap((p) => p.floats ?? []).filter((b) => b.type === 'callout')).toHaveLength(1);
    // So does a tall one no cut can split (a `:::columns` group).
    const group = [':::columns{count=2}', paras(30), ':::'].join('\n');
    const unsplittable = build(`${paras(3)}\n\n${note(group, ' span="page" placement="top"')}\n\n${paras(2)}`, TWO_COL());
    expect(frames(unsplittable)).toHaveLength(1);
    expect(unsplittable.pages.flatMap((p) => p.floats ?? []).filter((b) => b.type === 'callout')).toHaveLength(1);
  }, 60000);

  it('a box that fits a full column is never split: it moves whole', () => {
    // ~8 lines of text, then a 7-line box: it opens the next page whole.
    const md = `${filler(8)}\n\n${note(paras(2))}\n\n${filler(2)}`;
    const doc = build(md, SMALL_PAGE());
    const fs = frames(doc);
    expect(fs).toHaveLength(1);
    expect(fs[0]!.pageIndex).toBe(1);
    expect(fs[0]!.callout!.part ?? 0).toBe(0);
    expect(doc.warnings ?? []).toHaveLength(0);
  }, 60000);

  it('content no cut can split still overflows with a warning', () => {
    // No cut falls inside a `:::columns` group: a group taller than a
    // column leaves the box unsplittable.
    const group = [':::columns{count=2}', paras(12), ':::'].join('\n');
    const doc = build(note(group), SMALL_PAGE());
    expect(frames(doc)).toHaveLength(1);
    expect(doc.warnings?.map((w) => w.kind)).toEqual(['calloutOverflow']);
  }, 60000);
});
