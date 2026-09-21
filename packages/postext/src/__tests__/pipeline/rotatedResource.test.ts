import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { resourceBlockRectToPage, resourceBlockToLocal, resourceBlockToPage } from '../../vdt';
import { parseInlineSnippetSpans } from '../../parse/inlineSnippet';
import { SWATCH_PLACEHOLDER } from '../../parse/inlineFormatting';
import type { PostextConfig, Resource, TableCell, VDTBlock, VDTDocument } from '../../index';

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

const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

/** A header row plus `n` body rows. */
const table = (id: string, n: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: 'Services and benefits.',
  note: 'Source: the reference book.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Service', { isHeader: true }), cell('Grade I', { isHeader: true }), cell('Grade II', { isHeader: true })],
        ...Array.from({ length: n }, (_, i) => [cell(`Service ${i + 1}`), cell('Yes'), cell('Yes')]),
      ],
    },
  },
  placement: { rotate: 'ccw' },
  ...extra,
});

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** Two-column page with balancing off (single pass, deterministic). */
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const build = (markdown: string, resources: Resource[], config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown, resources }, config);

const floatsOf = (doc: VDTDocument, id: string) =>
  doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === id).map((b) => ({ page: p, block: b })));
const rbOf = (b: VDTBlock) => b.resourceBlock!;

function layout(resource: Resource, config?: PostextConfig, extra: { rotate?: 'ccw' | 'cw'; rotatedLength?: number; columnWidth?: number } = {}) {
  const resourceTypes = config?.resourceTypes ?? defaultResourceTypes();
  const resolved = resolveAllConfig(config);
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '46-5',
    resolved,
    columnWidth: extra.columnWidth ?? 300,
    resourceNumbering: {},
    resourceTypes,
    resources: [resource],
    ...(extra.rotate ? { rotate: extra.rotate, rotatedLength: extra.rotatedLength } : {}),
  });
}

describe('rotated resource layout', () => {
  it('lays the block out upright at the rotated length and reports that length as its height', () => {
    const { block, totalHeight } = layout(table('tab', 4), undefined, { rotate: 'ccw', rotatedLength: 500, columnWidth: 300 });
    expect(totalHeight).toBe(500);
    expect(block.rotation).toBeDefined();
    expect(block.rotation!.direction).toBe('ccw');
    expect(block.rotation!.width).toBe(500);
    expect(block.bodyRect.width).toBe(500);
    // Upright height: body plus caption and note.
    expect(block.rotation!.height).toBeCloseTo(block.bodyRect.height + (block.rotation!.height - block.bodyRect.height), 6);
    expect(block.rotation!.height).toBeGreaterThan(block.bodyRect.height);
    // The frame's origin is left to the placer.
    expect(block.rotation!.originX).toBe(0);
    expect(block.rotation!.originY).toBe(0);
    // Cells span the upright width.
    const cells = block.table!.cells;
    expect(Math.max(...cells.map((c) => c.rect.x + c.rect.width))).toBeCloseTo(500, 6);
  });

  it('an upright layout of the same table has no rotation', () => {
    const { block, totalHeight } = layout(table('tab', 4));
    expect(block.rotation).toBeUndefined();
    expect(totalHeight).toBeGreaterThan(0);
    expect(block.bodyRect.width).toBe(300);
  });

  it('maps the upright frame onto the page and back', () => {
    const rb = { rotation: { direction: 'ccw' as const, originX: 20, originY: 400, width: 500, height: 120 } };
    expect(resourceBlockToPage(rb, 0, 0)).toEqual({ x: 20, y: 400 });
    // Upright x runs up the page, upright y runs right.
    expect(resourceBlockToPage(rb, 10, 5)).toEqual({ x: 25, y: 390 });
    expect(resourceBlockToLocal(rb, 25, 390)).toEqual({ x: 10, y: 5 });
    expect(resourceBlockRectToPage(rb, { x: 0, y: 0, width: 500, height: 120 })).toEqual({ x: 20, y: -100, width: 120, height: 500 });
    const cw = { rotation: { direction: 'cw' as const, originX: 140, originY: 30, width: 500, height: 120 } };
    expect(resourceBlockToPage(cw, 10, 5)).toEqual({ x: 135, y: 40 });
    expect(resourceBlockToLocal(cw, 135, 40)).toEqual({ x: 10, y: 5 });
    expect(resourceBlockRectToPage(cw, { x: 0, y: 0, width: 500, height: 120 })).toEqual({ x: 20, y: 30, width: 120, height: 500 });
    // An upright block: the identity.
    expect(resourceBlockToPage({}, 3, 4)).toEqual({ x: 3, y: 4 });
    expect(resourceBlockRectToPage({}, { x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('rotated floats', () => {
  const markdown = `Intro :ref{id="tab"} text.\n\n${filler(30)}`;

  it('takes a whole page as a page-span float, flush left, turned counter-clockwise', () => {
    const doc = build(markdown, [table('tab', 6)]);
    const placed = floatsOf(doc, 'tab');
    expect(placed).toHaveLength(1);
    const { page, block } = placed[0]!;
    const rb = rbOf(block);
    expect(rb.rotation).toBeDefined();
    // The band spans the content width and (almost) the full content height.
    expect(block.bbox.x).toBeCloseTo(page.contentArea.x, 6);
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 6);
    expect(block.bbox.y).toBeCloseTo(page.contentArea.y, 6);
    expect(block.bbox.height).toBeGreaterThan(page.contentArea.height * 0.85);
    expect(block.bbox.height).toBeLessThanOrEqual(page.contentArea.height + 1e-6);
    // Upright frame as long as the band is tall; its origin at the band's
    // bottom-left (the frame's top faces the left edge of the page).
    expect(rb.rotation!.width).toBeCloseTo(block.bbox.height, 6);
    expect(rb.rotation!.originX).toBeCloseTo(page.contentArea.x, 6);
    expect(rb.rotation!.originY).toBeCloseTo(block.bbox.y + block.bbox.height, 6);
    // Every cell, mapped onto the page, lies inside the band.
    for (const c of rb.table!.cells) {
      const r = resourceBlockRectToPage(rb, c.rect);
      expect(r.x).toBeGreaterThanOrEqual(block.bbox.x - 1e-6);
      expect(r.x + r.width).toBeLessThanOrEqual(block.bbox.x + block.bbox.width + 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(block.bbox.y - 1e-6);
      expect(r.y + r.height).toBeLessThanOrEqual(block.bbox.y + block.bbox.height + 1e-6);
    }
    // No body text shares the page with it.
    const textOnPage = doc.blocks.filter((b) => b.pageIndex === page.index && !b.hidden && b.lines.length > 0);
    expect(textOnPage).toHaveLength(0);
  });

  it('sits flush to the spine on a verso page when the margins are mirrored', () => {
    const config: PostextConfig = {
      ...PAGE,
      page: { ...PAGE.page!, margins: { ...PAGE.page!.margins!, mirror: true } },
    };
    const doc = build(markdown, [table('tab', 6)], config);
    const placed = floatsOf(doc, 'tab');
    expect(placed).toHaveLength(1);
    const { page, block } = placed[0]!;
    const rb = rbOf(block);
    const verso = page.index % 2 === 1;
    const expectedLeft = verso ? block.bbox.x + block.bbox.width - rb.rotation!.height : block.bbox.x;
    expect(rb.rotation!.originX).toBeCloseTo(expectedLeft, 6);
  });

  it('a table too wide for the page is cut between rows and continues, turned, on the next pages', () => {
    const doc = build(markdown, [table('tab', 90)]);
    const slices = floatsOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    let next = 0;
    for (let i = 0; i < slices.length; i++) {
      const { page, block } = slices[i]!;
      const rb = rbOf(block);
      expect(rb.rotation).toBeDefined();
      // Each slice fits the band's width upright…
      expect(rb.rotation!.height).toBeLessThanOrEqual(page.contentArea.width + 1e-6);
      // …on consecutive pages, one per page.
      if (i > 0) expect(page.index).toBe(slices[i - 1]!.page.index + 1);
      const s = rb.slice;
      if (s) {
        if (i === 0) expect(s.startRow).toBe(0);
        else expect(s.startRow).toBe(next);
        next = s.endRow;
        expect(s.continued).toBe(i > 0);
        expect(s.continues).toBe(i < slices.length - 1);
      }
    }
    expect(next).toBe(91);
  });
});

describe('table cell fills', () => {
  it('a cell background is resolved through the palette and carried onto the cell', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'ok', name: 'Compatible', value: { hex: '#c1dfd6', model: 'hex' } }],
    };
    const res = table('tab', 1, {
      placement: {},
      table: {
        model: {
          headerRowCount: 1,
          rows: [
            [cell('A', { isHeader: true }), cell('B', { isHeader: true })],
            [cell('x', { background: { hex: '#000000', model: 'hex', paletteId: 'ok' } }), cell('y', { background: { hex: '#ff0000', model: 'hex' } })],
            [cell('p'), cell('q', { background: { hex: '#123456', model: 'hex', paletteId: 'missing' } })],
          ],
        },
      },
    });
    const { block } = layout(res, config);
    const at = (row: number, col: number) => block.table!.cells.find((c) => c.row === row && c.col === col)!;
    expect(at(1, 0).background).toBe('#c1dfd6');
    expect(at(1, 1).background).toBe('#ff0000');
    expect(at(2, 0).background).toBeUndefined();
    // An unknown palette id falls back to the stored hex.
    expect(at(2, 1).background).toBe('#123456');
    expect(at(0, 0).background).toBeUndefined();
  });
});

describe('inline colour swatches', () => {
  it('parses `:swatch{color=…}` into an atomic swatch span', () => {
    const spans = parseInlineSnippetSpans('Key: :swatch{color="#abc"} compatible; :swatch{color="ok"} **bold**');
    const swatches = spans.filter((s) => s.swatch);
    expect(swatches).toHaveLength(2);
    expect(swatches[0]!.text).toBe(SWATCH_PLACEHOLDER);
    expect(swatches[0]!.swatch!.color).toBe('#abc');
    expect(swatches[1]!.swatch!.color).toBe('ok');
    // A swatch without a colour is left as text.
    expect(parseInlineSnippetSpans('no :swatch{} here').some((s) => s.swatch)).toBe(false);
  });

  it('measures a swatch as a square on the baseline, filled from a hex or a palette entry', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'ok', name: 'Compatible', value: { hex: '#c1dfd6', model: 'hex' } }],
    };
    const res = table('tab', 1, {
      placement: {},
      note: ':swatch{color="#abc"} compatible; :swatch{color="ok"} conditional; :swatch{color="nope"} unknown',
    });
    const { block } = layout(res, config);
    const segs = block.noteLines.flatMap((l) => l.segments ?? []).filter((s) => s.kind === 'swatch');
    expect(segs).toHaveLength(3);
    expect(segs[0]!.swatch?.color).toBe('#aabbcc');
    expect(segs[1]!.swatch?.color).toBe('#c1dfd6');
    expect(segs[2]!.swatch?.color).toBeUndefined();
    // Three quarters of the note's font size, square.
    const sizePx = Number(/(\d*\.?\d+)px/.exec(block.noteFontString)![1]);
    for (const s of segs) expect(s.width).toBeCloseTo(sizePx * 0.75, 6);
  });
});
