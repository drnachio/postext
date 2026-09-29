import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { flowRectToPage, flowToPage, resourceBlockToPage, type VDTBlock, type VDTDocument, type VDTPage } from '../../vdt';
import type { PostextConfig, Dimension, Resource } from '../../types';
import { installSizedStub } from './stub';

installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const HLM = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。故曰「甄士隱」云云。';
const text = (n: number) => Array.from({ length: n }, () => HLM).join('\n\n');

const config = (layout: PostextConfig['layout'] = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(420), margins: { top: pt(40), right: pt(30), bottom: pt(40), left: pt(30) } },
  bodyText: { fontSize: pt(10), lineHeight: pt(16) },
  layout: { writingMode: 'vertical-rl', ...layout },
  locale: 'zh-Hant',
});

const figure = (id: string, w: number, h: number, placement?: Resource['placement']): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: '寶玉與黛玉初見',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: w, height: h },
  ...(placement ? { placement } : {}),
});

const table: Resource = {
  id: 't1',
  typeId: 'table',
  kind: 'table',
  caption: '賈府人物',
  createdAt: 0,
  updatedAt: 0,
  table: { model: { rows: [[{ content: '名' }, { content: '字' }], [{ content: '賈寶玉' }, { content: '怡紅公子' }], [{ content: '林黛玉' }, { content: '瀟湘妃子' }]] } },
};

/** A resource block's upright frame on the sheet: its corners mapped
 *  through the block's rotation, then the page's flow frame. */
function sheetFrame(page: VDTPage, blk: VDTBlock) {
  const rb = blk.resourceBlock!;
  const rot = rb.rotation!;
  const map = (x: number, y: number) => {
    const f = resourceBlockToPage(rb, x, y);
    return flowToPage(page, f.x, f.y);
  };
  return { origin: map(0, 0), xStep: map(10, 0), yStep: map(0, 10), far: map(rot.width, rot.height) };
}

function resourceBlocks(doc: VDTDocument): Array<{ page: VDTPage; blk: VDTBlock }> {
  const out: Array<{ page: VDTPage; blk: VDTBlock }> = [];
  for (const page of doc.pages) {
    for (const b of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      if (b.resourceBlock) out.push({ page, blk: b });
    }
  }
  return out;
}

describe('upright resources in a vertical flow', () => {
  it('a floated figure stands upright: its frame maps onto the sheet without a turn', () => {
    const doc = buildDocument(
      { markdown: `${text(2)}見圖:ref{id="f1"}。\n\n${text(4)}`, resources: [figure('f1', 800, 600)] },
      config(),
    );
    const found = resourceBlocks(doc);
    expect(found).toHaveLength(1);
    const { page, blk } = found[0]!;
    expect(blk.resourceBlock!.rotation!.direction).toBe('ccw');
    const f = sheetFrame(page, blk);
    // Upright x runs right on the sheet, upright y down.
    expect(f.xStep.x - f.origin.x).toBeCloseTo(10);
    expect(f.xStep.y - f.origin.y).toBeCloseTo(0);
    expect(f.yStep.y - f.origin.y).toBeCloseTo(10);
    expect(f.yStep.x - f.origin.x).toBeCloseTo(0);
    // It lies inside the physical content area, no taller than the tier.
    const area = flowRectToPage(page, page.contentArea);
    expect(f.origin.x).toBeGreaterThanOrEqual(area.x - 0.5);
    expect(f.far.x).toBeLessThanOrEqual(area.x + area.width + 0.5);
    expect(f.origin.y).toBeGreaterThanOrEqual(area.y - 0.5);
    expect(f.far.y).toBeLessThanOrEqual(area.y + area.height + 0.5);
    // The block takes, in the flow, the frame's width: its height there.
    expect(blk.bbox.height).toBeCloseTo(blk.resourceBlock!.rotation!.width);
  });

  it('fits the picture and its caption into the height of a tier, the caption set horizontally under it', () => {
    const doc = buildDocument(
      { markdown: `${text(2)}見圖:ref{id="f1"}。\n\n${text(6)}`, resources: [figure('f1', 600, 900)] },
      config({ layoutType: 'double', gutterWidth: pt(20) }),
    );
    const { page, blk } = resourceBlocks(doc)[0]!;
    const rb = blk.resourceBlock!;
    const tier = page.columns[0]!.bbox.width; // a tier's height on the sheet
    expect(rb.rotation!.height).toBeLessThanOrEqual(tier + 0.5);
    expect(rb.captionLines.length).toBeGreaterThan(0);
    const cap = rb.captionLines[0]!;
    // Under the picture in the upright frame, within its width.
    expect(cap.bbox.y).toBeGreaterThanOrEqual(rb.bodyRect.y + rb.bodyRect.height - 0.5);
    expect(cap.bbox.x + cap.bbox.width).toBeLessThanOrEqual(rb.rotation!.width + 0.5);
    // The frame is as wide as the picture, not the whole page.
    expect(rb.rotation!.width).toBeCloseTo(rb.bodyRect.width, 0);
  });

  describe('a caption that wraps as the frame narrows (#188)', () => {
    const LONG = '寶玉與黛玉初見，一段頗長的圖說文字，看看它如何換行。';
    const build = (w: number, h: number, caption: string, placement: Resource['placement']) => {
      const doc = buildDocument(
        { markdown: `${text(2)}見圖:ref{id="f1"}。\n\n${text(8)}`, resources: [{ ...figure('f1', w, h, placement), caption }] },
        { ...config({ layoutType: 'double', gutterWidth: pt(20) }), page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), right: pt(30), bottom: pt(40), left: pt(30) } } },
      );
      const { page, blk } = resourceBlocks(doc)[0]!;
      const tiers = page.columns.map((c) => flowRectToPage(page, c.bbox));
      const f = sheetFrame(page, blk);
      const tier = tiers.find((t) => f.origin.y >= t.y - 0.5 && f.origin.y <= t.y + t.height + 0.5)!;
      return { page, rb: blk.resourceBlock!, f, tier, tierLength: page.columns[0]!.bbox.width };
    };

    it('keeps the picture when half a tier leaves room for one caption line', () => {
      // At the frame's widest the caption takes one line and the picture
      // 37.67 px; set at the picture's width the caption wraps to three
      // lines, and the picture would shrink round after round to nothing.
      const { rb, f, tier } = build(600, 900, '寶玉黛玉初見', { position: 'top', width: 0.5 });
      expect(rb.rotation!.height).toBeLessThanOrEqual(80 + 0.5);
      expect(rb.bodyRect.width).toBeGreaterThan(37);
      expect(rb.captionLines).toHaveLength(1);
      // The frame narrows to the caption's line, not the whole flow.
      const capRight = Math.max(...rb.captionLines.map((l) => l.bbox.x + l.bbox.width));
      expect(rb.rotation!.width).toBeLessThanOrEqual(capRight + 12);
      expect(rb.rotation!.width).toBeGreaterThanOrEqual(capRight - 0.5);
      expect(f.far.y).toBeLessThanOrEqual(tier.y + tier.height + 0.5);
    });

    it('never runs a tall picture with a long caption past its tier', () => {
      // The widest frame gives the picture 22.59 px beside a two-line
      // caption; at that width the caption would take fifteen lines.
      const { rb, f, tier, tierLength } = build(300, 1600, LONG, { position: 'top' });
      expect(rb.rotation!.height).toBeLessThanOrEqual(tierLength + 0.5);
      // Three quarters of the picture at least, in a frame well short of
      // the flow's 224 px.
      expect(rb.bodyRect.width).toBeGreaterThanOrEqual(0.75 * 22.59 - 0.01);
      expect(rb.rotation!.width).toBeLessThan(120);
      expect(rb.captionLines.length).toBeLessThanOrEqual(3);
      // Inside its own tier on the sheet: it neither crosses the gutter nor
      // leaves the page.
      expect(f.origin.y).toBeGreaterThanOrEqual(tier.y - 0.5);
      expect(f.far.y).toBeLessThanOrEqual(tier.y + tier.height + 0.5);
      // Every caption line within the frame.
      for (const l of rb.captionLines) expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(rb.rotation!.width + 0.5);
    });
  });

  it('an inline figure (`::resource`) stands upright in its column', () => {
    const doc = buildDocument(
      { markdown: `${text(1)}\n\n::resource{id="f2"}\n\n${text(3)}`, resources: [figure('f2', 400, 300, { position: 'here' })] },
      config(),
    );
    const { page, blk } = resourceBlocks(doc)[0]!;
    const f = sheetFrame(page, blk);
    expect(f.xStep.x - f.origin.x).toBeCloseTo(10);
    expect(f.yStep.y - f.origin.y).toBeCloseTo(10);
    // The block's box in the flow is the frame turned: as tall there as the
    // frame is wide.
    expect(blk.bbox.height).toBeCloseTo(blk.resourceBlock!.rotation!.width);
    const colTop = page.columns[blk.columnIndex]!.bbox.x;
    expect(blk.resourceBlock!.rotation!.originX).toBeCloseTo(colTop);
  });

  it('a table stands upright too', () => {
    const doc = buildDocument(
      { markdown: `${text(1)}見表:ref{id="t1"}。\n\n${text(3)}`, resources: [table] },
      config(),
    );
    const { page, blk } = resourceBlocks(doc)[0]!;
    expect(blk.resourceBlock!.kind).toBe('table');
    const f = sheetFrame(page, blk);
    expect(f.xStep.x - f.origin.x).toBeCloseTo(10);
    expect(f.yStep.y - f.origin.y).toBeCloseTo(10);
  });

  it('ignores a quarter turn asked for in a vertical flow and says so', () => {
    const doc = buildDocument(
      { markdown: `${text(1)}見圖:ref{id="f3"}。\n\n${text(3)}`, resources: [figure('f3', 800, 600, { position: 'top', rotate: 'cw' })] },
      config(),
    );
    const { blk } = resourceBlocks(doc)[0]!;
    expect(blk.resourceBlock!.rotation!.direction).toBe('ccw');
    expect(doc.contentWarnings?.some((w) => w.kind === 'rotateIgnoredVertical' && w.resourceId === 'f3')).toBe(true);
  });

  it('turns a figure as asked in a horizontal appendix of a vertical book, and warns only for the vertical part', () => {
    const doc = buildDocument(
      {
        markdown: `${text(1)}見圖:ref{id="f3"}。\n\n${text(2)}\n\n# Appendix {style="appendix"}\n\nSee the map:ref{id="f4"}.\n\n${text(2)}`,
        resources: [figure('f3', 800, 600, { position: 'top', rotate: 'cw' }), figure('f4', 800, 600, { position: 'top', rotate: 'cw' })],
      },
      { ...config(), headingStyles: [{ id: 'appendix', breakBefore: { enabled: true, parity: 'any' }, layout: { layoutType: 'single', writingMode: 'horizontal-tb' } }] },
    );
    const blocks = resourceBlocks(doc);
    const f3 = blocks.find((b) => b.blk.resourceBlock!.resource.id === 'f3')!;
    const f4 = blocks.find((b) => b.blk.resourceBlock!.resource.id === 'f4')!;
    expect(f3.page.flow).toBeDefined();
    expect(f3.blk.resourceBlock!.rotation!.direction).toBe('ccw');
    expect(f4.page.flow).toBeUndefined();
    expect(f4.blk.resourceBlock!.rotation!.direction).toBe('cw');
    const warned = (doc.contentWarnings ?? []).filter((w) => w.kind === 'rotateIgnoredVertical').map((w) => (w as { resourceId: string }).resourceId);
    expect(warned).toEqual(['f3']);
  });

  it('keeps a turn in a horizontal flow, with no warning', () => {
    const doc = buildDocument(
      { markdown: `${text(1)}見圖:ref{id="f3"}。\n\n${text(3)}`, resources: [figure('f3', 800, 600, { position: 'top', rotate: 'cw' })] },
      { ...config(), layout: {} },
    );
    const { blk } = resourceBlocks(doc)[0]!;
    expect(blk.resourceBlock!.rotation!.direction).toBe('cw');
    expect(doc.contentWarnings?.some((w) => w.kind === 'rotateIgnoredVertical') ?? false).toBe(false);
  });
});
