import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, TableCell, VDTDocument, VDTPage } from '../../index';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Lines in each text column of `page`. */
const lines = (page: VDTPage): number[] =>
  page.columns.filter((c) => c.kind !== 'span').map((c) => c.blocks.reduce((n, b) => n + b.lines.length, 0));

/** Whether the closing page's two columns end within a line of each other. */
const levelled = (doc: VDTDocument): boolean => {
  const [a, b] = lines(doc.pages[doc.pages.length - 1]!);
  return Math.abs(a! - b!) <= 1;
};

describe('a closing page after a page a float takes whole is levelled (EF-189)', () => {
  // The Cookbook's repro: a 170 × 240 mm double page, a figure cited in the
  // first paragraph that takes page 2 alone, and the text that goes on.
  const para = (i: number) => `Paragraph ${i} of plain text that runs long enough to make several lines in a column of the page, with a few more words so that it wraps a third time.`;
  const markdown = (n: number, ref = true) => `# T\n\nThis cites ${ref ? ':ref{id="f"}' : 'Figure 1'} early.\n\n${Array.from({ length: n }, (_, i) => para(i)).join('\n\n')}`;
  const figure = (placement: Resource['placement'], width: number, height: number): Resource => ({
    id: 'f', typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'f.svg', width, height },
    placement,
  });
  const config: PostextConfig = { page: { width: mm(170), height: mm(240), dpi: 100 }, layout: { layoutType: 'double' } };
  const build = (n: number, resources: Resource[]): VDTDocument =>
    buildDocument({ markdown: markdown(n, resources.length > 0), resources }, config, createMeasurementCache());

  for (const [label, fig] of [
    ['a turned figure', figure({ rotate: 'ccw' }, 2000, 1400)],
    ['a page-wide figure as tall as the page', figure({ position: 'top', span: 'page' }, 2000, 2600)],
  ] as const) {
    it(`after ${label}`, () => {
      for (const n of [30, 34, 38, 42]) {
        const doc = build(n, [fig]);
        // Page 2 holds the figure alone; page 3 closes the chapter.
        expect(doc.pages).toHaveLength(3);
        expect(doc.pages[1]!.floats?.length).toBe(1);
        expect(lines(doc.pages[1]!)).toEqual([0, 0]);
        expect(levelled(doc), `${n}: ${lines(doc.pages[2]!).join('|')}`).toBe(true);
        // As levelled as the same text with no figure.
        const plain = build(n, []);
        expect(lines(doc.pages[2]!)).toEqual(lines(plain.pages[plain.pages.length - 1]!));
      }
    });
  }
});

describe('a closing page that opens with the rest of a split table is levelled (EF-167)', () => {
  const words = 'the programme opens with a welcome in the main hall and moves on to the sessions of the morning where speakers from the region present their work on water and soil and the afternoon closes with a panel'.split(' ');
  const para = (i: number) => `${Array.from({ length: 60 }, (_, k) => words[(k * 7 + i) % words.length]).join(' ')}.`;
  const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
  const table = (rows: number): Resource => ({
    id: 't', typeId: 'table', kind: 'table', caption: 'Programme.', createdAt: 0, updatedAt: 0,
    table: {
      model: {
        headerRowCount: 1,
        rows: [
          [cell('Time', { isHeader: true }), cell('Session', { isHeader: true })],
          ...Array.from({ length: rows }, (_, i) => [cell(`${i}.00`), cell(`Session ${i}\nSpeaker ${i}`)]),
        ],
      },
    },
    placement: { position: 'top', span: 'page' },
  });
  const config: PostextConfig = { page: { width: mm(170), height: mm(240), dpi: 150 }, layout: { layoutType: 'double' } };

  it('cuts the closing text level under the table rows', () => {
    let checked = 0;
    for (const [rows, n] of [[20, 18], [20, 24], [40, 18]] as const) {
      const md = `# T\n\nThe programme is in :ref{id="t"}\n\n${Array.from({ length: n }, (_, i) => para(i)).join('\n\n')}`;
      const doc = buildDocument({ markdown: md, resources: [table(rows)] }, config, createMeasurementCache());
      const last = doc.pages[doc.pages.length - 1]!;
      // The closing page opens with the rest of the table…
      expect(last.floats?.some((f) => f.id.startsWith('float-t-cont-')), `${rows}/${n}`).toBe(true);
      // …and its two columns of text end level under it (up to postext
      // 1.4 every line stayed in the first column).
      expect(lines(last).every((l) => l > 0), `${rows}/${n}: ${lines(last).join('|')}`).toBe(true);
      expect(levelled(doc), `${rows}/${n}: ${lines(last).join('|')}`).toBe(true);
      checked++;
    }
    expect(checked).toBe(3);
  });
});
