import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { parseMarkdown } from '../../parse';
import { comicBlockOnSheet, comicSplitGrid, comicStripPlacement, pageComics, parseComicAspect, parseComicSplit, translateSvgPath } from '../../comics';
import { flowRectToPage, type VDTBlock, type VDTDocument, type VDTPage } from '../../vdt';
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

const picture = (id: string, width: number, height: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `file-${id}`, format: 'png', width, height },
  ...extra,
});
const resources: Resource[] = [
  picture('d1', 1000, 1000),
  picture('wide', 3000, 1000, { safeArea: { x: 0.3, y: 0, width: 0.4, height: 1 } }),
];

const para = (n: number, tag = 'Paragraph'): string =>
  Array.from({ length: n }, (_, i) => `${tag} ${i} lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`).join('\n\n');

const daily = ':::strip{split="* | * | *"}\n::panel{art=d1}\nana: Morning!\n::panel\n::panel\n:::';

const strips = (doc: VDTDocument): { page: VDTPage; block: VDTBlock; float: boolean }[] =>
  doc.pages.flatMap((page) => [
    ...page.columns.flatMap((c) => c.blocks).filter((b) => b.comic).map((block) => ({ page, block, float: false })),
    ...(page.floats ?? []).filter((b) => b.comic).map((block) => ({ page, block, float: true })),
  ]);

describe(':::strip — parsing and attributes', () => {
  it('reads a strip as a comic directive whose panels sit side by side without a split', () => {
    const blocks = parseMarkdown(':::strip{aspect=4}\n::panel\n::panel\n::panel\n:::\n\nAfter.');
    expect(blocks[0]!.type).toBe('directive');
    expect(blocks[0]!.directiveName).toBe('strip');
    expect(blocks[0]!.comic!.kind).toBe('strip');
    expect(blocks[0]!.comic!.splitParse.tree.axis).toBe('columns');
    expect(blocks[0]!.comic!.splitParse.tree.items).toHaveLength(3);
    expect(blocks[1]!.type).toBe('paragraph');
  });

  it('reads span, placement, height and aspect', () => {
    expect(comicStripPlacement({})).toEqual({ span: 'column', position: 'here' });
    expect(comicStripPlacement({ span: 'page', placement: 'top', height: '4cm', aspect: '4/1' })).toEqual({
      span: 'page', position: 'top', height: { value: 4, unit: 'cm' }, aspect: 4,
    });
    expect(comicStripPlacement({ placement: 'nowhere', height: 'tall' })).toEqual({ span: 'column', position: 'here' });
    expect(parseComicAspect('4:1')).toBe(4);
    expect(parseComicAspect('2.5')).toBe(2.5);
    expect(parseComicAspect('0')).toBeUndefined();
    // Square panels by default: 3 across, or 2 across 2 tiers.
    expect(comicSplitGrid(parseComicSplit('* | * | *').tree)).toEqual({ across: 3, down: 1 });
    expect(comicSplitGrid(parseComicSplit('* [* | *] / *').tree)).toEqual({ across: 2, down: 2 });
    expect(comicSplitGrid(parseComicSplit('60 | * [50 / *]').tree)).toEqual({ across: 2, down: 2 });
  });

  it('moves an SVG path by an offset, absolute coordinates only', () => {
    expect(translateSvgPath('M0 0 L10 10 h5 v5 C1 2 3 4 5 6 A2 2 0 0 1 4 4 Z', 1, 2))
      .toBe('M 1 2 L 11 12 h 5 v 5 C 2 4 4 6 6 8 A 2 2 0 0 1 5 6 Z');
    expect(translateSvgPath('m1 1 l2 2 H3 V4', 10, 20)).toBe('m 11 21 l 2 2 H 13 V 24');
  });
});

describe(':::strip — in the flow', () => {
  const config: PostextConfig = { page: { sizePreset: '17x24' } };

  it('sets a strip here, a column wide, its panels cut from its own box', () => {
    const md = `# Title\n\n${para(2)}\n\n${daily}\n\n${para(2, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, config);
    const found = strips(doc);
    expect(found).toHaveLength(1);
    const { page, block, float } = found[0]!;
    expect(float).toBe(false);
    expect(block.type).toBe('resource');
    expect(block.resourceBlock).toBeUndefined();
    const col = page.columns[block.columnIndex]!;
    expect(block.bbox.width).toBeCloseTo(col.bbox.width, 3);
    // Three square panels: a third as tall as wide.
    expect(block.bbox.height).toBeCloseTo(col.bbox.width / 3, 3);
    const comic = block.comic!;
    expect(comic.frame).toEqual({ x: 0, y: 0, width: block.bbox.width, height: block.bbox.height });
    expect(comic.panels).toHaveLength(3);
    for (const p of comic.panels) {
      expect(p.bbox.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.bbox.x + p.bbox.width).toBeLessThanOrEqual(block.bbox.width + 0.01);
    }
    expect(comic.panels[0]!.bbox.x).toBeLessThan(comic.panels[1]!.bbox.x);
    expect(comic.panels[0]!.art?.resourceId).toBe('d1');
    // The splitters carry the range of the split value.
    expect(comic.splitters).toHaveLength(2);
    for (const s of comic.splitters) expect(md.slice(s.sourceStart, s.sourceEnd)).toBe('* | * | *');
    expect(md.slice(block.sourceStart!, block.sourceEnd!)).toBe(daily);
    expect(md.slice(comic.panels[0]!.sourceStart, comic.panels[0]!.sourceEnd)).toBe('::panel{art=d1}\nana: Morning!');
    // The text after it follows it in the same column, a float gap below.
    const after = col.blocks[col.blocks.indexOf(block) + 1]!;
    expect(after.bbox.y).toBeGreaterThanOrEqual(block.bbox.y + block.bbox.height - 0.01);
    // On the sheet: moved by the block's place.
    const onSheet = comicBlockOnSheet(page, block)!;
    expect(onSheet.panels[0]!.bbox.x).toBeCloseTo(comic.panels[0]!.bbox.x + block.bbox.x, 3);
    expect(onSheet.panels[0]!.bbox.y).toBeCloseTo(comic.panels[0]!.bbox.y + block.bbox.y, 3);
    expect(onSheet.splitters[0]!.a.y).toBeCloseTo(comic.splitters[0]!.a.y + block.bbox.y, 3);
    expect(pageComics(page)).toEqual([onSheet]);
  });

  it('takes the measure of its column on a page of two columns', () => {
    const md = `${para(3)}\n\n${daily}\n\n${para(20, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, { ...config, layout: { layoutType: 'double' } });
    const [{ page, block }] = strips(doc) as [ReturnType<typeof strips>[0]];
    const textCols = page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
    expect(textCols.length).toBe(2);
    expect(block.bbox.width).toBeCloseTo(textCols[0]!.bbox.width, 3);
    expect(block.bbox.width).toBeLessThan(page.contentArea.width / 2);
    expect(block.comic!.panels).toHaveLength(3);
  });

  it('keeps a strip together: one that does not fit moves whole to the next column, with the heading before it', () => {
    // Fill most of the first column, then a heading and a tall strip.
    const md = `${para(11)}\n\n## Comic\n\n:::strip{height=9cm}\n::panel\n::panel\n:::\n\n${para(4, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, { ...config, layout: { layoutType: 'double' } });
    const found = strips(doc);
    expect(found).toHaveLength(1);
    const { page, block } = found[0]!;
    // Never cut: one block, its whole height inside its column.
    const col = page.columns[block.columnIndex]!;
    expect(block.bbox.height).toBeCloseTo((9 / 2.54) * doc.config.page.dpi, 1);
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.5);
    // It did not fit under the text of the first column.
    const first = doc.pages[0]!.columns[0]!;
    expect(first.blocks.includes(block)).toBe(false);
    // The heading goes on with it.
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.pageIndex).toBe(block.pageIndex);
    expect(heading.columnIndex).toBe(block.columnIndex);
  });

  it('never makes a strip taller than a column', () => {
    const md = `Text.\n\n:::strip{aspect=0.1}\n::panel\n:::`;
    const doc = buildDocument({ markdown: md, resources }, config);
    const [{ page, block }] = strips(doc) as [ReturnType<typeof strips>[0]];
    expect(block.bbox.height).toBeLessThanOrEqual(page.contentArea.height + 0.01);
  });

  it('floats a strip to the head of a page, across the columns', () => {
    const md = `${para(3)}\n\n:::strip{span=page placement=top aspect=5}\n::panel\n::panel\n::panel\n::panel\n:::\n\n${para(60, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, { ...config, layout: { layoutType: 'double' } });
    const found = strips(doc);
    expect(found).toHaveLength(1);
    const { page, block, float } = found[0]!;
    expect(float).toBe(true);
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 3);
    expect(block.bbox.height).toBeCloseTo(page.contentArea.width / 5, 3);
    expect(block.bbox.y).toBeCloseTo(page.contentArea.y, 3);
    // The text of that page flows under it.
    for (const c of page.columns) for (const b of c.blocks) expect(b.bbox.y).toBeGreaterThanOrEqual(block.bbox.y + block.bbox.height - 0.01);
    expect(pageComics(page)).toHaveLength(1);
  });

  it('floats a page-wide strip set here on a page of several columns', () => {
    const md = `${para(3)}\n\n:::strip{span=page}\n::panel\n::panel\n:::\n\n${para(40, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, { ...config, layout: { layoutType: 'double' } });
    const [{ page, block, float }] = strips(doc) as [ReturnType<typeof strips>[0]];
    expect(float).toBe(true);
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 3);
  });

  it('floats a strip to the foot of a page', () => {
    const md = `${para(2)}\n\n:::strip{placement=bottom aspect=4}\n::panel\n::panel\n:::\n\n${para(30, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, config);
    const [{ page, block, float }] = strips(doc) as [ReturnType<typeof strips>[0]];
    expect(float).toBe(true);
    // At the foot: under the page's text, on the last grid line or so.
    const bottom = page.contentArea.y + page.contentArea.height;
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(bottom + 0.01);
    expect(block.bbox.y + block.bbox.height).toBeGreaterThan(bottom - doc.baselineGrid - 0.01);
    for (const c of page.columns) for (const b of c.blocks) expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(block.bbox.y + 0.01);
  });

  it('reads its panels from the right in a right-to-left document', () => {
    const md = `نص.\n\n${daily}\n\nنص.`;
    const doc = buildDocument({ markdown: md, resources }, { ...config, locale: 'ar' });
    const [{ page, block }] = strips(doc) as [ReturnType<typeof strips>[0]];
    const comic = block.comic!;
    expect(comic.direction).toBe('rtl');
    expect(comic.panels[0]!.bbox.x).toBeGreaterThan(comic.panels[1]!.bbox.x);
    const sheet = flowRectToPage(page, block.bbox);
    const onSheet = comicBlockOnSheet(page, block)!;
    expect(onSheet.frame.x).toBeCloseTo(sheet.x, 3);
  });

  it('turns its box onto the sheet in a vertical document', () => {
    const md = '本文。\n\n:::strip{split="* / * / * / *" aspect=0.25}\n::panel\n::panel\n::panel\n::panel\n:::\n\n本文。';
    const doc = buildDocument({ markdown: md, resources }, { ...config, locale: 'ja', layout: { writingMode: 'vertical-rl' } });
    const [{ page, block }] = strips(doc) as [ReturnType<typeof strips>[0]];
    const sheet = flowRectToPage(page, block.bbox);
    const comic = block.comic!;
    // A yonkoma down the column: four tiers, tall on the sheet.
    expect(comic.frame.width).toBeCloseTo(sheet.width, 3);
    expect(comic.frame.height).toBeCloseTo(sheet.height, 3);
    expect(comic.frame.height).toBeGreaterThan(comic.frame.width);
    expect(comic.panels.map((p) => p.bbox.y)).toEqual([...comic.panels.map((p) => p.bbox.y)].sort((a, b) => a - b));
    const onSheet = comicBlockOnSheet(page, block)!;
    expect(onSheet.frame.x).toBeGreaterThanOrEqual(0);
    expect(onSheet.frame.x + onSheet.frame.width).toBeLessThanOrEqual(page.width);
  });

  it('reports a letterboxed panel of a strip on the page it landed on', () => {
    const md = `${para(30)}\n\n:::strip{aspect=0.6}\n::panel{art=wide}\n:::`;
    const doc = buildDocument({ markdown: md, resources }, config);
    const [{ page }] = strips(doc) as [ReturnType<typeof strips>[0]];
    const w = (doc.contentWarnings ?? []).find((x) => x.kind === 'comicPanelLetterbox');
    expect(w).toBeDefined();
    expect(w!.pageIndex).toBe(page.index);
  });

  it('letters a strip in its own box, and moves the balloons onto the sheet with it', () => {
    const doc = buildDocument({ markdown: daily, resources }, config);
    const { page, block } = strips(doc)[0]!;
    const comic = block.comic!;
    expect(comic.balloons).toHaveLength(1);
    const b = comic.balloons[0]!;
    expect(b.kind).toBe('balloon');
    expect(b.panelIndex).toBe(0);
    // Block-relative: inside the strip's own frame.
    const p0 = comic.panels[0]!.bbox;
    expect(b.bbox.x).toBeGreaterThanOrEqual(p0.x - 1);
    expect(b.bbox.x + b.bbox.width).toBeLessThanOrEqual(p0.x + p0.width + 1);
    const onSheet = pageComics(page).find((c) => c.sourceStart === comic.sourceStart)!;
    const dx = onSheet.frame.x - comic.frame.x;
    const dy = onSheet.frame.y - comic.frame.y;
    expect(onSheet.balloons[0]!.bbox.x).toBeCloseTo(b.bbox.x + dx, 6);
    expect(onSheet.balloons[0]!.bbox.y).toBeCloseTo(b.bbox.y + dy, 6);
  });
});
