import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { parseMarkdown } from '../../parse';
import { comicBlockOnSheet, comicSplitGrid, comicStripOffset, comicStripPlacement, comicStripWidth, pageComics, parseComicAspect, parseComicSplit, parseComicStripAlign, parseComicStripWidth, translateSvgPath } from '../../comics';
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
    expect(comicStripPlacement({})).toEqual({ span: 'column', position: 'here', align: 'center' });
    expect(comicStripPlacement({ span: 'page', placement: 'top', height: '4cm', aspect: '4/1' })).toEqual({
      span: 'page', position: 'top', height: { value: 4, unit: 'cm' }, aspect: 4, align: 'center',
    });
    expect(comicStripPlacement({ placement: 'nowhere', height: 'tall' })).toEqual({ span: 'column', position: 'here', align: 'center' });
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

  it('cuts the band with a page-wide strip set here on a page of several columns (#590)', () => {
    const md = `${para(3)}\n\n:::strip{span=page}\n::panel\n::panel\n:::\n\n${para(40, 'After')}`;
    const doc = buildDocument({ markdown: md, resources }, { ...config, layout: { layoutType: 'double' } });
    const [{ page, block, float }] = strips(doc) as [ReturnType<typeof strips>[0]];
    expect(float).toBe(false);
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 3);
    // In a span column: the text before it ends level above it in both
    // columns, the text after it goes on under it in both.
    const span = page.columns.find((c) => c.kind === 'span' && c.blocks.includes(block))!;
    expect(span).toBeDefined();
    const above = page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side' && c.bbox.y < span.bbox.y);
    const below = page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side' && c.bbox.y >= span.bbox.y + span.bbox.height - 0.5);
    expect(above).toHaveLength(2);
    expect(below).toHaveLength(2);
    for (const c of above) for (const b of c.blocks) expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(block.bbox.y + 0.01);
    expect(below.every((c) => c.blocks.length > 0)).toBe(true);
    expect(below[0]!.blocks[0]!.lines[0]!.text).toMatch(/^After 0/);
    expect(pageComics(page)).toHaveLength(1);
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

describe(':::strip — width, alignment and caption (#590)', () => {
  const config: PostextConfig = { page: { sizePreset: '17x24' } };
  const single: PostextConfig = { ...config, layout: { layoutType: 'single' } };
  const two = (attrs: string): string => `:::strip{${attrs}}\n::panel\n::panel\n:::`;
  const one = (md: string, cfg: PostextConfig = config, res: Resource[] = resources) => {
    const doc = buildDocument({ markdown: md, resources: res }, cfg);
    const found = strips(doc);
    expect(found).toHaveLength(1);
    return { doc, ...found[0]! };
  };
  const captionText = (block: VDTBlock): string => {
    const c = block.stripCaption!;
    return block.lines.slice(c.firstLine, c.firstLine + c.lineCount).map((l) => l.text).join(' ');
  };

  it('reads width, align, caption, type and id', () => {
    expect(comicStripPlacement({ width: '60%', align: 'end', caption: ' A day. ', type: 'figure', id: 's1' })).toEqual({
      span: 'column', position: 'here', width: { fraction: 0.6 }, align: 'end', caption: 'A day.', type: 'figure', id: 's1',
    });
    expect(parseComicStripWidth('12cm')).toEqual({ length: { value: 12, unit: 'cm' } });
    expect(parseComicStripWidth('80')).toEqual({ length: { value: 80, unit: 'mm' } });
    expect(parseComicStripWidth('150%')).toEqual({ fraction: 1 });
    expect(parseComicStripWidth('0%')).toBeUndefined();
    expect(parseComicStripWidth('wide')).toBeUndefined();
    expect(parseComicStripAlign('START')).toBe('start');
    expect(parseComicStripAlign('left')).toBe('center');
    expect(comicStripWidth({ width: { fraction: 0.5 } }, 400, 96)).toBe(200);
    expect(comicStripWidth({ width: { length: { value: 10, unit: 'in' } } }, 400, 96)).toBe(400);
    expect(comicStripOffset('start', 400, 100)).toBe(0);
    expect(comicStripOffset('center', 400, 100)).toBe(150);
    expect(comicStripOffset('end', 400, 100)).toBe(300);
  });

  it('sets a narrower strip at the centre of its measure by default, at its start or end when asked', () => {
    for (const [align, share] of [['', 0.5], ['align=start', 0], ['align=end', 1]] as const) {
      const { page, block } = one(`Text.\n\n${two(`width=60% ${align}`)}\n\nAfter.`);
      const col = page.columns[block.columnIndex]!;
      const w = col.bbox.width * 0.6;
      // The block keeps the measure; the strip stands inside it, as tall as
      // its own width makes it (two square panels).
      expect(block.bbox.width).toBeCloseTo(col.bbox.width, 3);
      expect(block.comic!.frame.width).toBeCloseTo(w, 3);
      expect(block.comic!.frame.height).toBeCloseTo(w / 2, 3);
      expect(block.bbox.height).toBeCloseTo(w / 2, 3);
      expect(block.comic!.frame.x).toBeCloseTo((col.bbox.width - w) * share, 3);
      for (const p of block.comic!.panels) expect(p.bbox.x).toBeGreaterThanOrEqual(block.comic!.frame.x - 0.01);
      const onSheet = comicBlockOnSheet(page, block)!;
      expect(onSheet.frame.x).toBeCloseTo(block.bbox.x + (col.bbox.width - w) * share, 3);
    }
    // A length, never wider than the measure.
    const { block } = one(`${two('width=4cm align=start')}`);
    expect(block.comic!.frame.width).toBeCloseTo((4 / 2.54) * 300, 1);
    const { page, block: wide } = one(`${two('width=1000mm')}`);
    expect(wide.comic!.frame.width).toBeCloseTo(page.columns[wide.columnIndex]!.bbox.width, 3);
  });

  it('follows the text direction: the start is the right of a right-to-left page', () => {
    const { page, block } = one(`نص.\n\n${two('width=50% align=start')}\n\nنص.`, { ...config, locale: 'ar' });
    const sheet = flowRectToPage(page, block.bbox);
    const onSheet = comicBlockOnSheet(page, block)!;
    expect(onSheet.frame.x + onSheet.frame.width).toBeCloseTo(sheet.x + sheet.width, 3);
    expect(onSheet.frame.width).toBeCloseTo(sheet.width / 2, 3);
  });

  it('runs along the column of a vertical page: the end of the measure is its foot', () => {
    const md = '本文。\n\n:::strip{split="* / *" width=50% align=end}\n::panel\n::panel\n:::\n\n本文。';
    const { page, block } = one(md, { ...config, locale: 'ja', layout: { writingMode: 'vertical-rl' } });
    const sheet = flowRectToPage(page, block.bbox);
    const onSheet = comicBlockOnSheet(page, block)!;
    expect(onSheet.frame.height).toBeCloseTo(sheet.height / 2, 3);
    expect(onSheet.frame.y + onSheet.frame.height).toBeCloseTo(sheet.y + sheet.height, 3);
  });

  it('sets a plain caption under the strip, at its width, in the caption style', () => {
    const { doc, page, block } = one(`Text.\n\n${two('width=60% caption="A *quiet* morning."')}\n\nAfter.`, single);
    const c = block.stripCaption!;
    expect(c).toMatchObject({ firstLine: 1, lineCount: 1, position: 'below' });
    expect(c.typeId).toBeUndefined();
    expect(captionText(block)).toBe('A quiet morning.');
    // The placeholder line carries the strip, the caption follows a gap
    // under it, and the block holds both.
    const strip = block.lines[0]!;
    expect(strip.text).toBe('');
    expect(strip.bbox.height).toBeCloseTo(block.comic!.frame.height, 3);
    const line = block.lines[1]!;
    expect(line.bbox.y).toBeGreaterThan(strip.bbox.y + strip.bbox.height);
    expect(line.bbox.y + line.bbox.height).toBeCloseTo(block.bbox.y + block.bbox.height, 3);
    // Within the strip's own width, from its start.
    expect(line.bbox.x).toBeGreaterThanOrEqual(block.bbox.x + block.comic!.frame.x - 0.01);
    // Caption fonts and colours: the block's, and every segment's own.
    const cs = doc.config.captionStyle;
    expect(block.fontString).toContain(cs.fontFamily);
    expect(block.color).toBe(cs.color.hex);
    const italic = line.segments!.find((s) => s.text === 'quiet')!;
    expect(italic.fontString).toContain('italic');
    for (const seg of line.segments!.filter((s) => s.kind === 'text')) expect(seg.color).toBe(cs.color.hex);
    // The text after it starts below the caption.
    const col = page.columns[block.columnIndex]!;
    const after = col.blocks[col.blocks.indexOf(block) + 1]!;
    expect(after.bbox.y).toBeGreaterThanOrEqual(block.bbox.y + block.bbox.height - 0.01);
  });

  it('numbers a captioned strip in a resource type, in sequence with its resources, and lets a :ref name it', () => {
    const md = [
      'First :ref{id="d1"}.',
      two('caption="The morning." type=figure id=daily'),
      'As :ref{id="daily"} shows, and :ref{id="wide"} after it.',
      two('caption="Not counted." type=nonsense'),
      two('type=figure'),
    ].join('\n\n');
    const doc = buildDocument({ markdown: md, resources }, config);
    const found = strips(doc).map((s) => s.block);
    expect(found).toHaveLength(3);
    expect(captionText(found[0]!)).toBe('Figure\u00A02. The morning.');
    expect(found[0]!.stripCaption).toMatchObject({ typeId: 'figure', number: '2', id: 'daily' });
    expect(captionText(found[1]!)).toBe('Not counted.');
    expect(found[1]!.stripCaption!.number).toBeUndefined();
    expect(found[2]!.stripCaption).toBeUndefined();
    const text = doc.blocks.filter((b) => b.type === 'paragraph').map((b) => b.lines.map((l) => l.text).join(' ')).join(' | ');
    expect(text).toContain('As Fig.\u00A02 shows, and Fig.\u00A03 after it.');
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'unknownResourceId')).toEqual([]);
  });

  it('sets the caption over the strip when the caption style says so, with its bar', () => {
    const cfg: PostextConfig = { ...config, captionStyle: { position: 'above', backgroundEnabled: true, background: { hex: '#eeeeee', model: 'hex' } } };
    const { block } = one(`Text.\n\n${two('caption="Over it." width=80%')}`, cfg);
    const c = block.stripCaption!;
    expect(c).toMatchObject({ firstLine: 0, lineCount: 1, position: 'above' });
    expect(block.lines[1]!.text).toBe('');
    // The comic stands under the caption band and its gap.
    expect(block.comic!.frame.y).toBeGreaterThan(c.bar!.rect.y + c.bar!.rect.height);
    expect(c.bar).toMatchObject({ background: '#eeeeee' });
    expect(c.bar!.rect.width).toBeCloseTo(block.comic!.frame.width, 3);
    expect(block.lines[0]!.bbox.y).toBeGreaterThan(block.bbox.y + c.bar!.rect.y);
  });

  it('floats a captioned strip with its caption', () => {
    const md = `${para(2)}\n\n:::strip{placement=top span=page width=70% caption="Floated." type=figure}\n::panel\n::panel\n:::\n\n${para(40, 'After')}`;
    const { page, block, float } = one(md, { ...config, layout: { layoutType: 'double' } });
    expect(float).toBe(true);
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 3);
    expect(captionText(block)).toBe('Figure\u00A01. Floated.');
    const line = block.lines[block.stripCaption!.firstLine]!;
    expect(line.bbox.y).toBeGreaterThan(block.bbox.y + block.comic!.frame.height);
    expect(line.bbox.y + line.bbox.height).toBeCloseTo(block.bbox.y + block.bbox.height, 3);
    expect(line.bbox.x).toBeGreaterThanOrEqual(block.bbox.x + block.comic!.frame.x - 0.01);
    for (const c of page.columns) for (const b of c.blocks) expect(b.bbox.y).toBeGreaterThanOrEqual(block.bbox.y + block.bbox.height - 0.01);
  });

  it('cuts the band with a captioned page-wide strip, its caption under it in the span column', () => {
    const md = `${para(3)}\n\n:::strip{span=page width=50% caption="Across."}\n::panel\n::panel\n:::\n\n${para(30, 'After')}`;
    const { page, block, float } = one(md, { ...config, layout: { layoutType: 'double' } });
    expect(float).toBe(false);
    const span = page.columns.find((c) => c.kind === 'span' && c.blocks.includes(block))!;
    expect(span).toBeDefined();
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 3);
    expect(block.comic!.frame.x).toBeCloseTo(page.contentArea.width / 4, 3);
    expect(captionText(block)).toBe('Across.');
    expect(block.lines[block.stripCaption!.firstLine]!.bbox.y + 1).toBeLessThanOrEqual(span.bbox.y + span.bbox.height);
  });

  it('sets a page-wide strip in the flow of a one-column page', () => {
    const { page, block, float } = one(`Text.\n\n${two('span=page caption="Here."')}\n\nAfter.`, single);
    expect(float).toBe(false);
    expect(page.columns.some((c) => c.kind === 'span')).toBe(false);
    expect(captionText(block)).toBe('Here.');
    const col = page.columns[block.columnIndex]!;
    const after = col.blocks[col.blocks.indexOf(block) + 1]!;
    expect(after.lines[0]!.text).toBe('After.');
    expect(after.bbox.y).toBeGreaterThan(block.bbox.y + block.bbox.height);
  });
});
