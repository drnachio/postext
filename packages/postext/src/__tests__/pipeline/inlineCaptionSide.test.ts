import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { columnClipRect } from '../../paint/columnClip.js';
import type { PostextConfig, Resource, TableCell, VDTBlock, VDTColumn, VDTDocument } from '../../index.js';

// #729: a resource set in the text (`position: 'here'`) with
// `placement.captionSide` sets its caption and note in the float-only side
// column, level with the top of its body, as a column float does
// (`layout.inlineCaptionSide`, on by default).

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

const CAPTION = 'A caption long enough to take a few lines of the side column.';
const HERE = { position: 'here' as const, captionSide: true };

const figure = (id: string, opts: { placement?: Resource['placement']; height?: number; caption?: string } = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: opts.caption ?? CAPTION,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: opts.height ?? 200 },
  placement: opts.placement ?? HERE,
});

const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
const table = (id: string, n: number): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: 'Activities by age group.',
  note: 'Source: the reference book.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Task', { isHeader: true }), cell('Age', { isHeader: true })],
        ...Array.from({ length: n }, (_, i) => [cell(`Task ${i + 1}`), cell('Yes')]),
      ],
    },
  },
  placement: HERE,
});

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** One-and-a-half layout whose side column is a float-only channel at the
 *  outer edge of mirrored margins. Balancing off (single pass). */
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(30), right: pt(20), mirror: true } },
  layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'outer' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  calloutStyles: [{ id: 'key', name: 'Key', title: 'Key', span: 'side' }, { id: 'note', name: 'Note', title: 'Note' }],
};
const OFF: PostextConfig = { ...PAGE, layout: { ...PAGE.layout, inlineCaptionSide: false } };

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the main column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
const EMBED = '::resource{id="a"}';
const MD = `${filler(1)}\n\n${EMBED}\n\n${filler(3, 1)}`;

const build = (markdown: string, resources: Resource[], config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown, resources }, config);

const sideOf = (doc: VDTDocument, page: number) => doc.pages[page]!.columns.find((c) => c.kind === 'side')!;
const mainOf = (doc: VDTDocument, page: number) => doc.pages[page]!.columns.find((c) => c.kind !== 'side' && c.kind !== 'span')!;
/** The inline resource blocks of the document, with their page and column. */
const embeds = (doc: VDTDocument): Array<{ page: number; col: VDTColumn; block: VDTBlock }> =>
  doc.pages.flatMap((p) => p.columns.flatMap((col) => col.blocks.filter((b) => b.resourceBlock).map((block) => ({ page: p.index, col, block }))));
const floatsOf = (doc: VDTDocument, page: number): VDTBlock[] => doc.pages[page]!.floats ?? [];
const captionOf = (b: VDTBlock) => b.resourceBlock!.captionLines;
const noteOf = (b: VDTBlock) => b.resourceBlock!.noteLines;
/** Whether every caption line of the block stands inside `col`. */
const captionIn = (b: VDTBlock, col: VDTColumn): boolean =>
  captionOf(b).length > 0 && captionOf(b).every((l) => l.bbox.x >= col.bbox.x - 0.5 && l.bbox.x + l.bbox.width <= col.bbox.x + col.bbox.width + 0.5);
const geometry = (doc: VDTDocument) =>
  doc.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => [b.type, b.bbox, b.resourceBlock?.captionLines.map((l) => [l.text, l.bbox])])));

describe('a resource set in the text with captionSide (#729)', () => {
  it('sets its caption in the side column, level with the top of the body', () => {
    const doc = build(MD, [figure('a')]);
    const [{ block, col, page }] = embeds(doc) as [{ block: VDTBlock; col: VDTColumn; page: number }];
    const side = sideOf(doc, page);
    expect(col).toBe(mainOf(doc, page));
    expect(captionIn(block, side)).toBe(true);
    // The caption is broken at the side column's measure.
    expect(captionOf(block).length).toBeGreaterThan(1);
    expect(captionOf(block)[0]!.bbox.x).toBeCloseTo(side.bbox.x, 3);
    expect(captionOf(block)[0]!.bbox.y).toBeCloseTo(block.bbox.y, 3);
    // The block in the text column is as tall as the body alone.
    expect(block.bbox.height).toBeCloseTo(block.resourceBlock!.bodyRect.height, 3);
    // The side column's own stack is not touched: the caption is an
    // obstacle of it, not a float.
    expect(side.blocks.length).toBe(0);
    expect(side.availableHeight).toBeCloseTo(side.bbox.height, 3);
  });

  it('moves the text after it up by the caption it no longer carries', () => {
    const on = build(MD, [figure('a')]);
    const off = build(MD, [figure('a')], OFF);
    const a = embeds(on)[0]!.block;
    const b = embeds(off)[0]!.block;
    expect(b.bbox.height).toBeGreaterThan(a.bbox.height + 1);
    expect(captionIn(b, mainOf(off, 0))).toBe(true);
    expect(captionOf(b)[0]!.bbox.y).toBeGreaterThan(b.bbox.y + b.resourceBlock!.bodyRect.height - 0.5);
    const after = (doc: VDTDocument) => mainOf(doc, 0).blocks[2]!.bbox.y;
    expect(after(on)).toBeLessThan(after(off) - 1);
  });

  it('inlineCaptionSide: false lays the page out as without captionSide', () => {
    const off = build(MD, [figure('a')], OFF);
    const plain = build(MD, [figure('a', { placement: { position: 'here' } })]);
    expect(geometry(off)).toEqual(geometry(plain));
    // And the option changes nothing for an embed that does not ask.
    expect(geometry(build(MD, [figure('a', { placement: { position: 'here' } })], OFF))).toEqual(geometry(plain));
  });

  it('sets the note under the caption, in the side column', () => {
    const doc = build(MD, [{ ...figure('a'), note: 'Source: the archive.' }]);
    const { block, page } = embeds(doc)[0]!;
    const side = sideOf(doc, page);
    const last = captionOf(block)[captionOf(block).length - 1]!;
    expect(noteOf(block).length).toBeGreaterThan(0);
    for (const l of noteOf(block)) {
      expect(l.bbox.x).toBeGreaterThanOrEqual(side.bbox.x - 0.5);
      expect(l.bbox.y).toBeGreaterThanOrEqual(last.bbox.y + last.bbox.height - 0.5);
    }
    expect(block.bbox.height).toBeCloseTo(block.resourceBlock!.bodyRect.height, 3);
  });

  it('a caption taller than its body runs on beside the text that follows', () => {
    const long = Array.from({ length: 12 }, () => CAPTION).join(' ');
    const doc = build(MD, [figure('a', { height: 40, caption: long })]);
    const { block, col } = embeds(doc)[0]!;
    const lines = captionOf(block);
    const foot = lines[lines.length - 1]!.bbox.y + lines[lines.length - 1]!.bbox.height;
    expect(foot).toBeGreaterThan(block.bbox.y + block.bbox.height + 1);
    // The text goes on right under the body.
    const next = col.blocks[col.blocks.indexOf(block) + 1]!;
    expect(next.bbox.y).toBeLessThan(foot);
  });

  it('a side float cited later stacks clear of the caption', () => {
    const md = `${filler(1)}\n\n${EMBED}\n\nHere is the reference :ref{id="s"} in the text.\n\n${filler(3, 1)}`;
    const doc = build(md, [figure('a'), figure('s', { placement: { span: 'side' }, caption: 'Side.' })]);
    const { block, page } = embeds(doc)[0]!;
    const side = sideOf(doc, page);
    expect(captionIn(block, side)).toBe(true);
    const lines = captionOf(block);
    const top = lines[0]!.bbox.y;
    const foot = lines[lines.length - 1]!.bbox.y + lines[lines.length - 1]!.bbox.height;
    const float = floatsOf(doc, page).find((b) => b.resourceBlock?.resource.id === 's')!;
    expect(float).toBeDefined();
    expect(float.bbox.x).toBeGreaterThanOrEqual(side.bbox.x - 0.5);
    const clear = float.bbox.y >= foot - 0.5 || float.bbox.y + float.bbox.height <= top + 0.5;
    expect(clear).toBe(true);
  });

  it('keeps the caption under the body when the side column is taken there', () => {
    // A side float cited before the embed stands beside the place the embed takes.
    const md = `Here is the reference :ref{id="s"} in the text.\n\n${EMBED}\n\n${filler(3, 1)}`;
    const doc = build(md, [figure('a'), figure('s', { placement: { span: 'side' }, caption: 'Side.' })]);
    const { block, page, col } = embeds(doc)[0]!;
    expect(floatsOf(doc, page).length).toBe(1);
    expect(captionIn(block, col)).toBe(true);
    expect(block.bbox.height).toBeGreaterThan(block.resourceBlock!.bodyRect.height + 1);
    // A side box standing there does the same.
    const boxed = build(`:::callout{type="key"}\nA box of the side column that takes a few lines of it.\n:::\n\n${EMBED}\n\n${filler(3, 1)}`, [figure('a')]);
    const e = embeds(boxed)[0]!;
    expect(captionIn(e.block, e.col)).toBe(true);
  });

  it('two embeds in a row each take the side column in turn', () => {
    const md = `${EMBED}\n\n::resource{id="b"}\n\n${filler(2)}`;
    const long = Array.from({ length: 12 }, () => CAPTION).join(' ');
    // The first caption ends above the second embed: both go to the side.
    const doc = build(md, [figure('a'), figure('b')]);
    const [first, second] = embeds(doc);
    expect(captionIn(first!.block, sideOf(doc, 0))).toBe(true);
    expect(captionIn(second!.block, sideOf(doc, 0))).toBe(true);
    // The first caption runs past the second embed's top: that one keeps
    // its caption under it.
    const crowded = build(md, [figure('a', { height: 40, caption: long }), figure('b')]);
    const [one, two] = embeds(crowded);
    expect(captionIn(one!.block, sideOf(crowded, 0))).toBe(true);
    expect(captionIn(two!.block, two!.col)).toBe(true);
  });

  it('decides again in the column an embed moves to', () => {
    // The embed does not fit the foot of page 1 and opens page 2, whose side
    // column stands on the other side (mirrored margins).
    const md = `${filler(22)}\n\n${EMBED}\n\n${filler(3, 30)}`;
    const doc = build(md, [figure('a', { height: 500 })]);
    const { block, page, col } = embeds(doc)[0]!;
    expect(page).toBeGreaterThan(0);
    expect(col.blocks[0]).toBe(block);
    const side = sideOf(doc, page);
    expect(captionIn(block, side)).toBe(true);
    expect(captionOf(block)[0]!.bbox.y).toBeCloseTo(block.bbox.y, 3);
    expect(block.bbox.height).toBeCloseTo(block.resourceBlock!.bodyRect.height, 3);
    // With the option off the same embed moves too, caption under it.
    const off = build(md, [figure('a', { height: 500 })], OFF);
    expect(embeds(off)[0]!.page).toBe(page);
  });

  it('keeps the caption under the body on a page without a side column', () => {
    const single: PostextConfig = { ...PAGE, layout: { layoutType: 'single' } };
    const doc = build(MD, [figure('a')], single);
    const { block, col } = embeds(doc)[0]!;
    expect(captionIn(block, col)).toBe(true);
    expect(geometry(doc)).toEqual(geometry(build(MD, [figure('a', { placement: { position: 'here' } })], single)));
  });

  it('keeps it under the body inside a box and round a wrapped picture', () => {
    const boxed = `${filler(1)}\n\n:::callout{type="note"}\nA box.\n\n${EMBED}\n\nIts last words.\n:::\n\n${filler(2, 1)}`;
    expect(geometry(build(boxed, [figure('a')]))).toEqual(geometry(build(boxed, [figure('a')], OFF)));
    const wrapped = figure('a', { placement: { ...HERE, wrap: 'right', width: 0.4 } });
    expect(geometry(build(MD, [wrapped]))).toEqual(geometry(build(MD, [wrapped], OFF)));
    // A page-span embed keeps its caption too.
    const span = figure('a', { placement: { ...HERE, span: 'page' } });
    expect(geometry(build(MD, [span]))).toEqual(geometry(build(MD, [span], OFF)));
  });

  it('takes the type\'s default placement', () => {
    const typed: PostextConfig = {
      ...PAGE,
      resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', captionPrefix: 'Figure', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', defaultPlacement: HERE }],
    };
    const res = { ...figure('a') } as Resource;
    delete res.placement;
    const doc = build(MD, [res], typed);
    const { block, page } = embeds(doc)[0]!;
    expect(captionIn(block, sideOf(doc, page))).toBe(true);
  });

  it('a narrower embed keeps the caption at the side column\'s edge', () => {
    const doc = build(MD, [figure('a', { placement: { ...HERE, width: 0.5, align: 'center' } })]);
    const { block, page } = embeds(doc)[0]!;
    expect(captionOf(block)[0]!.bbox.x).toBeCloseTo(sideOf(doc, page).bbox.x, 3);
  });

  it('an inline table: whole, and cut between rows with the caption beside its first slice', () => {
    const cfg: PostextConfig = { ...PAGE, bodyText: { fontSize: pt(10), lineHeight: pt(13) } };
    const whole = build(MD, [table('a', 4)], cfg);
    const w = embeds(whole)[0]!;
    expect(captionIn(w.block, sideOf(whole, w.page))).toBe(true);
    expect(noteOf(w.block)[0]!.bbox.x).toBeGreaterThanOrEqual(sideOf(whole, w.page).bbox.x - 0.5);

    const md = `${filler(4)}\n\n${EMBED}\n\n${filler(3, 10)}`;
    const cut = build(md, [table('a', 40)], cfg);
    const slices = embeds(cut);
    expect(slices.length).toBeGreaterThan(1);
    expect(captionIn(slices[0]!.block, sideOf(cut, slices[0]!.page))).toBe(true);
    for (const s of slices.slice(1)) {
      // The continuations keep their caption in the text column.
      if (captionOf(s.block).length > 0) expect(captionIn(s.block, s.col)).toBe(true);
    }
    // Every row is set once, as with the option off.
    const rows = (doc: VDTDocument) => embeds(doc).map((s) => [s.block.resourceBlock!.slice?.startRow, s.block.resourceBlock!.slice?.endRow]);
    expect(rows(cut)[0]![0]).toBe(0);
    expect(rows(cut)[rows(cut).length - 1]![1]).toBe(41);
    const off = build(md, [table('a', 40)], { ...cfg, layout: { ...cfg.layout, inlineCaptionSide: false } });
    expect(rows(off)[rows(off).length - 1]![1]).toBe(41);
  });

  it('builds the same document twice', () => {
    const md = `${filler(1)}\n\n${EMBED}\n\nHere is the reference :ref{id="s"} in the text.\n\n${filler(20, 1)}\n\n::resource{id="b"}\n\n${filler(3, 40)}`;
    const res = [figure('a'), figure('s', { placement: { span: 'side' }, caption: 'Side.' }), figure('b', { height: 500 })];
    expect(geometry(build(md, res))).toEqual(geometry(build(md, res)));
  });

  it('the column clip takes in the caption set at the side', () => {
    const doc = build(MD, [figure('a')]);
    const { block, col, page } = embeds(doc)[0]!;
    const side = sideOf(doc, page);
    const clip = columnClipRect(col, 300);
    for (const l of captionOf(block)) {
      expect(l.bbox.x).toBeGreaterThanOrEqual(clip.x);
      expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(clip.x + clip.width);
    }
    expect(clip.x + clip.width).toBeLessThanOrEqual(side.bbox.x + side.bbox.width + 20);
    // Without a side caption the clip is the column and its 2pt buffer.
    const off = build(MD, [figure('a')], OFF);
    const plain = columnClipRect(mainOf(off, 0), 300);
    expect(plain.width).toBeLessThan(mainOf(off, 0).bbox.width + 20);
  });
});
