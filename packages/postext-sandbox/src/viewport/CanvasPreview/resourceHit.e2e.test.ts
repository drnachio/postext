import { describe, expect, it } from 'vitest';
import { buildDocument, mapInlineSnippet } from 'postext';
import type { PostextConfig, PostextContent, Resource, VDTDocument } from 'postext';
import { resourceBlocksOnPage } from './geometry';
import {
  contentOffsetToPlain,
  resolveResourceRun,
  resourceTextAtPixel,
  xForPlainInResourceLine,
} from './resourceHit';

// Font-aware width stub (as in geometry.e2e.test.ts): bold glyphs wider than
// regular so segment widths differ per weight.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const per = /bold|700/.test(this.font) ? 9 : 7;
    return { width: s.length * per };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const CELLS = [
  ['**Header** one', 'see :ref{id="fig-1" case="lower"} here'],
  ['alpha beta gamma delta epsilon zeta eta theta', ''],
];
const table = (id: string, placement?: Resource['placement']): Resource => ({
  id, typeId: 'table', kind: 'table', caption: `Caption of *${id}*`, note: 'Source: *own* work', createdAt: 0, updatedAt: 0,
  placement,
  table: { model: { headerRowCount: 1, rows: CELLS.map((r, ri) => r.map((content) => ({ content, isHeader: ri === 0 }))) } },
});
const figure: Resource = {
  id: 'fig-1', typeId: 'figure', kind: 'bitmap', caption: 'x', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'a.png', format: 'png', width: 100, height: 80 },
};

const content: PostextContent = {
  markdown: '# Título\n\nUn párrafo con :ref{id="t-float"} y :ref{id="fig-1"}.\n\n::resource{id="t-inline"}\n\nOtro párrafo.',
  resources: [table('t-inline', { position: 'here' }), table('t-float', { position: 'top', span: 'column' }), figure],
};
const config: PostextConfig = {
  page: { width: { value: 120, unit: 'mm' }, height: { value: 200, unit: 'mm' } },
  locale: 'es',
};

type Block = VDTDocument['blocks'][number];

function findResourceBlock(doc: VDTDocument, id: string): { block: Block; pageIndex: number } {
  for (const page of doc.pages) {
    for (const b of resourceBlocksOnPage(doc, page.index)) {
      if (b.resourceBlock!.resource.id === id) return { block: b, pageIndex: page.index };
    }
  }
  throw new Error(`resource ${id} not laid out`);
}

describe('resource text hit-test against the real pipeline', () => {
  const doc = buildDocument(content, config);

  for (const id of ['t-inline', 't-float']) {
    describe(id, () => {
      const { block, pageIndex } = findResourceBlock(doc, id);
      const rb = block.resourceBlock!;

      it('is laid out with cells, a caption and a note', () => {
        expect(rb.table!.cells.length).toBe(4);
        expect(rb.captionLines.length).toBeGreaterThan(0);
        expect(rb.noteLines.length).toBeGreaterThan(0);
      });

      it('maps every glyph of every cell to its own snippet char, and back to the same x', () => {
        const mismatches: string[] = [];
        for (const cell of rb.table!.cells) {
          const target = { kind: 'cell' as const, row: cell.row, col: cell.col };
          const run = resolveResourceRun(rb, target)!;
          const snippet = CELLS[cell.row]![cell.col]!;
          expect(run.content).toBe(snippet);
          const { text: plain, sourceMap } = mapInlineSnippet(snippet);
          for (let li = 0; li < run.lines.length; li++) {
            const line = run.lines[li]!;
            const st = run.stamped[li]!;
            const yMid = line.bbox.y + line.bbox.height / 2;
            for (let p = st.plainStart; p < st.plainEnd; p++) {
              // Click a quarter into the glyph: the caret should land before it.
              const x0 = xForPlainInResourceLine(line, st, p);
              const x1 = xForPlainInResourceLine(line, st, p + 1);
              const x = x0 + (x1 - x0) * 0.25;
              const hit = resourceTextAtPixel(doc, pageIndex, x, yMid);
              const expected = sourceMap[p]!;
              if (!hit || hit.resourceId !== id || hit.target.kind !== 'cell' || hit.target.row !== cell.row
                || hit.target.col !== cell.col || hit.offset !== expected) {
                mismatches.push(`cell ${cell.row},${cell.col} plain ${p} (${JSON.stringify(plain[p])}) → ${JSON.stringify(hit)} expected ${expected}`);
              }
              // Reverse: the snippet offset paints back at the glyph's left edge.
              const back = xForPlainInResourceLine(line, st, contentOffsetToPlain(sourceMap, expected));
              if (Math.abs(back - x0) > 1e-6) mismatches.push(`cell ${cell.row},${cell.col} plain ${p}: x ${back} ≠ ${x0}`);
            }
          }
        }
        expect(mismatches).toEqual([]);
      });

      it('an empty cell yields offset 0 and a click on the caption label yields 0', () => {
        const empty = rb.table!.cells.find((c) => c.row === 1 && c.col === 1)!;
        expect(empty.lines).toEqual([]);
        const hit = resourceTextAtPixel(doc, pageIndex, empty.rect.x + empty.rect.width / 2, empty.rect.y + empty.rect.height / 2);
        expect(hit).toEqual({ resourceId: id, target: { kind: 'cell', row: 1, col: 1 }, offset: 0 });

        const cap = rb.captionLines[0]!;
        const label = cap.segments!.find((s) => s.captionLabel)!;
        expect(label).toBeDefined();
        const onLabel = resourceTextAtPixel(doc, pageIndex, cap.bbox.x + label.width / 2, cap.bbox.y + cap.bbox.height / 2);
        expect(onLabel).toEqual({ resourceId: id, target: { kind: 'caption' }, offset: 0 });
      });

      it('maps the caption description and the note past their markup', () => {
        const capRun = resolveResourceRun(rb, { kind: 'caption' })!;
        const caption = `Caption of *${id}*`;
        const plainIdx = mapInlineSnippet(caption).text.indexOf(id);
        const line = capRun.lines[0]!;
        const x = xForPlainInResourceLine(line, capRun.stamped[0]!, plainIdx) + 1;
        const hit = resourceTextAtPixel(doc, pageIndex, x, line.bbox.y + 1);
        expect(hit).toEqual({ resourceId: id, target: { kind: 'caption' }, offset: caption.indexOf(id) });

        const noteRun = resolveResourceRun(rb, { kind: 'note' })!;
        const nline = noteRun.lines[0]!;
        const plainOwn = mapInlineSnippet('Source: *own* work').text.indexOf('own');
        const nx = xForPlainInResourceLine(nline, noteRun.stamped[0]!, plainOwn) + 1;
        const nhit = resourceTextAtPixel(doc, pageIndex, nx, nline.bbox.y + 1);
        expect(nhit).toEqual({ resourceId: id, target: { kind: 'note' }, offset: 'Source: *own* work'.indexOf('own') });
      });
    });
  }

  it('the floated table lives in a page float band, not in doc.blocks', () => {
    expect(doc.blocks.some((b) => b.resourceBlock?.resource.id === 't-float')).toBe(false);
    expect(doc.pages.some((p) => (p.floats ?? []).some((f) => f.resourceBlock?.resource.id === 't-float'))).toBe(true);
  });
});
