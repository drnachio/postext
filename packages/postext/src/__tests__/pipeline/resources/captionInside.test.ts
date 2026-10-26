import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { captionInsideShare } from '../../../pipeline/resources/captionInside.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../../index.js';

// #1106: `placement.captionSide: 'inside'` sets the caption and note beside
// a narrow picture inside its own slot (one column, two, a float, a
// resource set in the text). The picture takes `placement.width` of the
// slot (default 0.5) at its `align` side, the caption the rest after the
// gutter, level with the picture's top; the block is as tall as the
// taller of the two.

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
const SHORT = 'A short caption.';
const LONG = Array.from({ length: 4 }, () => 'A caption long enough to run over many lines of the narrow band beside the picture, so that the block grows to hold it whole.').join(' ');

const figure = (id: string, placement: Resource['placement'], opts: { caption?: string; note?: string; height?: number } = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: opts.caption ?? SHORT,
  ...(opts.note ? { note: opts.note } : {}),
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 2000, height: opts.height ?? 1200 },
  placement,
});

const ONE: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single', gutterWidth: pt(12) },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};
const TWO: PostextConfig = { ...ONE, layout: { layoutType: 'double', gutterWidth: pt(12) } };

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
const MD = `${filler(1)}\n\n::resource{id="a"}\n\n${filler(3, 1)}`;

const build = (markdown: string, resources: Resource[], config: PostextConfig = ONE): VDTDocument =>
  buildDocument({ markdown, resources }, config);
const resourceBlocks = (doc: VDTDocument): Array<{ page: number; block: VDTBlock; colX: number; colW: number }> =>
  doc.pages.flatMap((p) => [
    ...p.columns.flatMap((c) => c.blocks.filter((b) => b.resourceBlock).map((block) => ({ page: p.index, block, colX: c.bbox.x, colW: c.bbox.width }))),
    ...(p.floats ?? []).filter((b) => b.resourceBlock).map((block) => ({ page: p.index, block, colX: block.bbox.x, colW: block.bbox.width })),
  ]);
const only = (doc: VDTDocument) => {
  const all = resourceBlocks(doc);
  expect(all.length).toBe(1);
  return all[0]!;
};
/** The picture's rect on the page. */
const bodyOf = (b: VDTBlock) => {
  const r = b.resourceBlock!.bodyRect;
  return { x: b.bbox.x + r.x, y: b.bbox.y + r.y, width: r.width, height: r.height };
};
const gutterPx = (doc: VDTDocument) => (12 * doc.config.page.dpi) / 72;

describe("placement.captionSide: 'inside' (#1106)", () => {
  it('sets the caption beside a picture set in the text of a one-column page', () => {
    const doc = build(MD, [figure('a', { position: 'here', captionSide: 'inside' })]);
    const { block, colX, colW } = only(doc);
    const body = bodyOf(block);
    const lines = block.resourceBlock!.captionLines;
    expect(block.bbox.width).toBeCloseTo(colW, 3);
    // Half the column by default, at the left.
    expect(body.x).toBeCloseTo(colX, 3);
    expect(body.width).toBeCloseTo(colW * 0.5, 3);
    // The caption starts a gutter right of the picture's share, level with
    // its top, and stays inside the column.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.bbox.x).toBeCloseTo(colX + colW * 0.5 + gutterPx(doc), 3);
    expect(lines[0]!.bbox.y).toBeCloseTo(block.bbox.y, 3);
    for (const l of lines) expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(colX + colW + 0.5);
    // The picture is the taller: the block is its height.
    expect(block.bbox.height).toBeCloseTo(body.height, 3);
  });

  it('grows the block to a caption taller than the picture', () => {
    const doc = build(MD, [figure('a', { position: 'here', captionSide: 'inside', width: 0.4 }, { caption: LONG, note: 'Source: a note under the caption.', height: 200 })]);
    const { block } = only(doc);
    const body = bodyOf(block);
    const rb = block.resourceBlock!;
    const lastCaption = rb.captionLines[rb.captionLines.length - 1]!;
    const lastNote = rb.noteLines[rb.noteLines.length - 1]!;
    expect(lastCaption.bbox.y).toBeGreaterThan(body.y + body.height);
    // The note follows the caption in the same band.
    expect(lastNote.bbox.x).toBeCloseTo(rb.captionLines[0]!.bbox.x, 3);
    expect(lastNote.bbox.y).toBeGreaterThan(lastCaption.bbox.y);
    expect(block.bbox.height).toBeGreaterThan(body.height + 1);
    expect(block.bbox.y + block.bbox.height).toBeGreaterThanOrEqual(lastNote.bbox.y + lastNote.bbox.height - 0.5);
    // The text after the block starts under the band, not under the picture.
    const next = doc.pages[0]!.columns[0]!.blocks.find((b) => b.bbox.y > block.bbox.y && !b.resourceBlock);
    expect(next!.bbox.y).toBeGreaterThanOrEqual(lastNote.bbox.y + lastNote.bbox.height - 0.5);
  });

  it("puts the picture at the right and the caption at the left with align: 'right'", () => {
    const doc = build(MD, [figure('a', { position: 'here', captionSide: 'inside', width: 0.6, align: 'right' })]);
    const { block, colX, colW } = only(doc);
    const body = bodyOf(block);
    expect(body.x + body.width).toBeCloseTo(colX + colW, 3);
    expect(body.width).toBeCloseTo(colW * 0.6, 3);
    const lines = block.resourceBlock!.captionLines;
    expect(lines[0]!.bbox.x).toBeCloseTo(colX, 3);
    for (const l of lines) expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(body.x - gutterPx(doc) + 0.5);
  });

  it('sets a top float of a two-column page inside its column', () => {
    const doc = build(`${filler(1)} See :ref{id="a"}.\n\n${filler(8, 1)}`, [figure('a', { position: 'top', captionSide: 'inside', width: 0.55 })], TWO);
    const { block } = only(doc);
    const col = doc.pages[0]!.columns.find((c) => c.bbox.x <= block.bbox.x + 0.5 && c.bbox.x + c.bbox.width >= block.bbox.x + block.bbox.width - 0.5);
    expect(col).toBeDefined();
    // The float takes its whole column; the picture its share.
    expect(block.bbox.width).toBeCloseTo(col!.bbox.width, 3);
    const body = bodyOf(block);
    expect(body.width).toBeCloseTo(col!.bbox.width * 0.55, 3);
    const lines = block.resourceBlock!.captionLines;
    expect(lines[0]!.bbox.x).toBeCloseTo(col!.bbox.x + col!.bbox.width * 0.55 + gutterPx(doc), 3);
    expect(lines[0]!.bbox.y).toBeCloseTo(body.y, 3);
  });

  it('keeps the caption under the picture when the band would be too narrow', () => {
    const doc = build(MD, [figure('a', { position: 'here', captionSide: 'inside', width: 0.9 })]);
    const { block } = only(doc);
    const body = bodyOf(block);
    const lines = block.resourceBlock!.captionLines;
    expect(lines[0]!.bbox.y).toBeGreaterThan(body.y + body.height - 0.5);
  });

  it('lays out a picture without it as before', () => {
    const plain = build(MD, [figure('a', { position: 'here', width: 0.5 })]);
    const off = build(MD, [figure('a', { position: 'here', width: 0.5, captionSide: false })]);
    const a = only(plain).block;
    const b = only(off).block;
    expect(b.bbox).toEqual(a.bbox);
    expect(b.resourceBlock!.captionLines.map((l) => l.bbox)).toEqual(a.resourceBlock!.captionLines.map((l) => l.bbox));
    // Narrowed by `width`, its caption under it.
    expect(a.resourceBlock!.bodyRect.width).toBeCloseTo(only(plain).colW * 0.5, 3);
    expect(a.resourceBlock!.captionLines[0]!.bbox.y).toBeGreaterThan(bodyOf(a).y + bodyOf(a).height - 0.5);
  });

  it('moves the whole block to the next page when it does not fit the foot of this one', () => {
    const md = `${filler(14)}\n\n::resource{id="a"}\n\n${filler(2, 20)}`;
    const doc = build(md, [figure('a', { position: 'here', captionSide: 'inside', width: 0.4 }, { caption: LONG, height: 400 })]);
    const { block, page } = only(doc);
    const rb = block.resourceBlock!;
    const last = rb.captionLines[rb.captionLines.length - 1]!;
    // The caption stays with its picture on one page, inside the content area.
    const area = doc.pages[page]!.contentArea;
    expect(last.bbox.y + last.bbox.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
  });
});

describe("captionSide: 'inside' in a composed page's frame (#1106)", () => {
  it('sets the caption beside the picture inside the frame', () => {
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const config: PostextConfig = {
      ...ONE,
      page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
      pageTemplates: [{ id: 'r', frames: [{ name: 'text', flow: true, width: mm(60) }, { name: 'photo', width: mm(90), placement: { anchor: { to: 'container', edge: 'top-right' } } }] }],
    };
    const md = '::::page{template="r"}\nText.\n\n::resource{id="pic" slot="photo"}\n::::';
    const doc = buildDocument({ markdown: md, resources: [figure('pic', { captionSide: 'inside' })] }, config, createMeasurementCache());
    const page = doc.pages.find((p) => p.composed)!;
    const photo = page.composed!.frames.find((f) => f.name === 'photo')!;
    const pic = photo.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).find((b) => b.type === 'resource')!;
    const body = bodyOf(pic);
    const lines = pic.resourceBlock!.captionLines;
    expect(pic.bbox.width).toBeLessThanOrEqual(photo.rect.width + 0.5);
    expect(body.width).toBeCloseTo(pic.bbox.width * 0.5, 1);
    expect(lines[0]!.bbox.x).toBeGreaterThan(body.x + body.width);
    expect(lines[0]!.bbox.y).toBeCloseTo(body.y, 1);
  });
});

describe('captionInsideShare', () => {
  const base = figure('a', { captionSide: 'inside' });
  it('gives the picture its share, 0.5 by default', () => {
    expect(captionInsideShare(base, undefined)).toBe(0.5);
    expect(captionInsideShare({ ...base, placement: { captionSide: 'inside', width: 0.3 } }, undefined)).toBe(0.3);
  });
  it('reads the type default and leaves other values alone', () => {
    const type = { id: 'figure', name: 'Figure', defaultPlacement: { captionSide: 'inside' as const } } as never;
    expect(captionInsideShare({ ...base, placement: {} }, type)).toBe(0.5);
    expect(captionInsideShare({ ...base, placement: { captionSide: true } }, undefined)).toBeUndefined();
  });
  it('is for pictures only', () => {
    const table: Resource = { ...base, kind: 'table', bitmap: undefined, table: { model: { headerRowCount: 0, rows: [[{ content: 'x' }]] } } };
    expect(captionInsideShare(table, undefined)).toBeUndefined();
  });
});
