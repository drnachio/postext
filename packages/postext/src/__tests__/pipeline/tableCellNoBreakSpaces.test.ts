import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { measureRichBlock, measureRichSnippet } from '../../measure/rich';
import type { PostextConfig, Resource, TableModel } from '../../types';
import type { ResolvedResourceBlock, VDTDocument, VDTResourceTableCell } from '../../vdt';

// EF-154: a table cell drops no-break spaces. (a) A cell paragraph holding
// only U+00A0 set no line, although CommonMark keeps such a line as
// content: `'1\n\u00A0'` gave a one-line row. (b) A trailing U+00A0 was
// trimmed (1.4.1), so a right-aligned `'760\u00A0'` ended where `'(231)'`
// did; since EF-66 the space stays in the word it follows.

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

const NBSP = '\u00A0';
const config: PostextConfig = { layout: { layoutType: 'single' } };

const table = (model: TableModel): Resource => ({
  id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  table: { model },
});

function cellsOf(doc: VDTDocument): VDTResourceTableCell[] {
  const rb = doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])])
    .map((b) => b.resourceBlock)
    .find((r): r is ResolvedResourceBlock => r !== undefined);
  return rb!.table!.cells;
}

const cellAt = (cells: VDTResourceTableCell[], row: number, col: number) => cells.find((c) => c.row === row && c.col === col)!;

describe('EF-154: no-break spaces in table cells', () => {
  it('a cell line holding only a no-break space is a line of the cell', () => {
    const doc = buildDocument({ markdown: '::resource{id="t"}\n', resources: [table({ rows: [[{ content: `1\n${NBSP}` }, { content: '2' }]] })] }, config);
    const first = cellAt(cellsOf(doc), 0, 0);
    expect(first.lines.map((l) => l.text)).toEqual(['1', NBSP]);
    // The row is one line taller than a row of one-line cells.
    const flat = buildDocument({ markdown: '::resource{id="t"}\n', resources: [table({ rows: [[{ content: '1' }, { content: '2' }]] })] }, config);
    const lineH = first.lines[1]!.bbox.y - first.lines[0]!.bbox.y;
    expect(lineH).toBeGreaterThan(0);
    expect(first.rect.height - cellAt(cellsOf(flat), 0, 0).rect.height).toBeCloseTo(lineH, 6);
    expect(cellAt(cellsOf(doc), 0, 1).rect.height).toBeCloseTo(first.rect.height, 6);
  });

  it('a blank cell line (ordinary spaces only) still adds nothing', () => {
    const doc = buildDocument({ markdown: '::resource{id="t"}\n', resources: [table({ rows: [[{ content: '1\n   \n2' }]] })] }, config);
    expect(cellAt(cellsOf(doc), 0, 0).lines.map((l) => l.text)).toEqual(['1', '2']);
  });

  it('a byte-order mark (U+FEFF) alone is blank, as before: it has no width to keep', () => {
    // A pasted CSV cell can start with one.
    const doc = buildDocument({
      markdown: '::resource{id="t"}\n',
      resources: [table({ rows: [[{ content: '﻿' }, { content: '1\n﻿\n2' }]] })],
    }, config);
    const cells = cellsOf(doc);
    expect(cellAt(cells, 0, 0).lines).toEqual([]);
    expect(cellAt(cells, 0, 1).lines.map((l) => l.text)).toEqual(['1', '2']);
    const run = (text: string) => ({ text, bold: false, italic: false });
    const F = '16px T';
    expect(measureRichSnippet([run('﻿')], F, F, F, F, 200, 20).lines).toEqual([]);
    // The other no-break spaces are content.
    for (const space of [' ', ' ']) {
      expect(measureRichSnippet([run(space)], F, F, F, F, 200, 20).lines.map((l) => l.text)).toEqual([space]);
    }
  });

  it('keeps a trailing no-break space at its width in a right-aligned cell', () => {
    const doc = buildDocument({
      markdown: '::resource{id="t"}\n',
      resources: [table({ rows: [[{ content: `760${NBSP}`, align: 'right' }], [{ content: '(231)', align: 'right' }]] })],
    }, config);
    const cells = cellsOf(doc);
    const gain = cellAt(cells, 0, 0).lines[0]!;
    const loss = cellAt(cells, 1, 0).lines[0]!;
    expect(gain.text).toBe(`760${NBSP}`);
    // Both lines end at the cell's right edge; the space after 760 takes
    // the room the closing bracket takes under it.
    expect(gain.bbox.x + gain.bbox.width).toBeCloseTo(loss.bbox.x + loss.bbox.width, 6);
    expect(gain.bbox.width).toBe(4 * 7);
  });

  it('the snippet measurer sets a run of no-break spaces as a line, and ordinary whitespace as none', () => {
    const run = (text: string) => ({ text, bold: false, italic: false });
    const F = '16px T';
    expect(measureRichSnippet([run(NBSP)], F, F, F, F, 200, 20).lines.map((l) => l.text)).toEqual([NBSP]);
    expect(measureRichSnippet([run(' \n\t ')], F, F, F, F, 200, 20).lines).toEqual([]);
    // The body keeps its rule: its parser drops such a paragraph as well.
    expect(measureRichBlock([run(NBSP)], F, F, F, F, 200, 20).lines).toEqual([]);
  });

  it('a caption piece holding only a no-break space between two forced breaks is a line', () => {
    const caption = ['First.', NBSP, 'Third.'].join(' \\\\ ');
    const doc = buildDocument({ markdown: '::resource{id="t"}\n', resources: [{ ...table({ rows: [[{ content: 'x' }]] }), caption }] }, config);
    const rb = doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])])
      .map((b) => b.resourceBlock)
      .find((r): r is ResolvedResourceBlock => r !== undefined)!;
    expect(rb.captionLines.map((l) => l.text)).toEqual(['Table\u00A01. First.', NBSP, 'Third.']);
  });
});
