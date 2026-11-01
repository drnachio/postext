import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';

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

const SENTENCE = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

const TWO_COL: PostextConfig = {
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  page: { width: mm(160), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  links: { print: 'notes', show: 'both', qr: { size: mm(12) } },
};

const picture = (id: string, height: number, placement: Resource['placement']): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: 'A picture.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1600, height },
  placement,
});

const floats = (doc: VDTDocument, pageIndex: number) => doc.pages[pageIndex]!.floats ?? [];

describe('link notes and a page-span float at the foot of a closing page (#1367)', () => {
  // The chapter closes on its first page with a page-wide picture at the
  // foot, which moves up under the closing text (`hugClosingFloats`). The
  // note the last paragraph cites stood at the column's foot above the
  // picture's first slot, and the picture moved up over it.
  const story = (n: number) => buildDocument({
    markdown: `# One\n\nSee :ref{id="foot"}. ${filler(n)}\n\nSource: [the agency](https://example.org/release/42).\n\n# Two\n\nEnd.`,
    resources: [picture('foot', 500, { position: 'bottom', span: 'page' })],
  }, TWO_COL, createMeasurementCache());

  for (const n of [4, 8, 12]) {
    it(`sets the note above the picture, under the text (${n} sentences)`, () => {
      const doc = story(n);
      const page = floats(doc, 0);
      const figure = page.find((f) => f.resourceBlock?.resource.id === 'foot');
      const note = page.find((f) => f.footnoteNote !== undefined);
      expect(figure).toBeDefined();
      expect(note).toBeDefined();
      // The note ends above the picture.
      expect(note!.bbox.y + note!.bbox.height).toBeLessThanOrEqual(figure!.bbox.y + 0.5);
      // And under the text of its column.
      const col = doc.pages[0]!.columns[note!.columnIndex]!;
      for (const b of col.blocks) expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(note!.bbox.y + 0.5);
      // The note area too.
      for (const a of doc.pages[0]!.footnoteAreas ?? []) expect(a.bbox.y + a.bbox.height).toBeLessThanOrEqual(figure!.bbox.y + 0.5);
    });
  }
});

describe('link notes cited in a box with footnotes.placement column (#1369)', () => {
  const COLUMN: PostextConfig = {
    ...TWO_COL,
    headings: { balancing: { enabled: false }, levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
    links: { print: 'notes' },
    footnotes: { placement: 'column' },
  };
  const box = ':::callout{title="Further reading"}\n- [One](https://example.org/a)\n- [Two](https://example.org/b)\n:::';
  /** Each note on the page and in the column of the box line citing it, under what the column holds. */
  const expectNotesWithTheBox = (doc: VDTDocument): void => {
    const notes = doc.blocks.filter((b) => b.footnoteNote !== undefined);
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      const citing = doc.blocks.find((b) => b.footnoteNote === undefined && b.lines.some((l) => l.segments?.some((s) => s.footnoteId === note.footnoteNote)))!;
      expect(citing.containerId).toBeDefined();
      expect([note.pageIndex, note.columnIndex]).toEqual([citing.pageIndex, citing.columnIndex]);
      const col = doc.pages[note.pageIndex]!.columns[note.columnIndex]!;
      for (const b of col.blocks) expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(note.bbox.y + 0.5);
    }
  };

  it('sets them at the foot of the box\'s column when a chapter opens after the box', () => {
    // The notes waited for the next text the flow placed: the next
    // chapter's, on its own page.
    const doc = buildDocument({ markdown: `# One\n\n${filler(10)}\n\n${box}\n\n# Two\n\n${filler(2)}` }, COLUMN, createMeasurementCache());
    expect(doc.pages.length).toBeGreaterThan(1);
    expectNotesWithTheBox(doc);
    expect(doc.pages[1]!.floats?.some((f) => f.footnoteNote !== undefined) ?? false).toBe(false);
  });

  it('sets them at the foot of the box\'s column when the box closes the document', () => {
    expectNotesWithTheBox(buildDocument({ markdown: `${filler(30)}\n\n${box}` }, COLUMN, createMeasurementCache()));
  });
});
