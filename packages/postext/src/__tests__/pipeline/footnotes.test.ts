import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import { parseMarkdown } from '../../parse';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../index';

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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

const TWO_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

function build(md: string, config: PostextConfig = TWO_COL): VDTDocument {
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

const notes = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.footnoteNote !== undefined);
const markerLine = (doc: VDTDocument, id: string) => {
  for (const b of doc.blocks) {
    if (b.footnoteNote !== undefined) continue;
    for (const l of b.lines) if (l.segments?.some((s) => s.footnoteId === id)) return { block: b, line: l };
  }
  return undefined;
};

describe('footnote parsing', () => {
  it('turns [^id] into a marker span and [^id]: into a definition paragraph', () => {
    const blocks = parseMarkdown('Texto con nota.[^a] Y sigue.\n\n[^a]: La nota *en cursiva*.');
    expect(blocks).toHaveLength(2);
    const marker = blocks[0]!.spans.find((s) => s.footnote);
    expect(marker?.footnote?.id).toBe('a');
    expect(blocks[1]!.footnoteDef).toBe('a');
    expect(blocks[1]!.text).toBe('La nota en cursiva.');
    expect(blocks[1]!.sourceMap[0]).toBe('Texto con nota.[^a] Y sigue.\n\n[^a]: '.length);
  });
});

describe('footnotes at the column foot', () => {
  it('sets the note at the foot of the column that cites it, numbered in order', () => {
    const md = [
      `${filler(2)} Primera cita.[^uno] ${filler(1)}`,
      `${filler(1)} Segunda cita.[^dos] ${filler(1)}`,
      '[^dos]: La segunda nota.',
      '[^uno]: La primera nota, algo más larga que la segunda para ocupar dos líneas en la columna.',
    ].join('\n\n');
    const doc = build(md);
    const ns = notes(doc);
    expect(ns.map((n) => n.footnoteNote)).toEqual(['uno', 'dos']);
    for (const n of ns) {
      const cite = markerLine(doc, n.footnoteNote!)!;
      expect(n.pageIndex).toBe(cite.block.pageIndex);
      expect(n.columnIndex).toBe(cite.block.columnIndex);
      // Under the text of its column.
      const col = doc.pages[n.pageIndex]!.columns[n.columnIndex]!;
      const textBottom = Math.max(...col.blocks.map((b) => b.bbox.y + b.bbox.height));
      expect(n.bbox.y).toBeGreaterThan(textBottom - 0.5);
      expect(n.bbox.y + n.bbox.height).toBeLessThanOrEqual(doc.pages[0]!.contentArea.y + doc.pages[0]!.contentArea.height + 0.5);
    }
    const seg = markerLine(doc, 'uno')!.line.segments!.find((s) => s.footnoteId === 'uno')!;
    expect(seg.text).toBe('1');
    expect(seg.script).toBe('sup');
    expect(ns[0]!.lines[0]!.text.startsWith('1')).toBe(true);
    const area = doc.pages[0]!.footnoteAreas?.[0];
    expect(area?.rule).toBeDefined();
  });

  it('moves the citing line on when its note does not fit under it', () => {
    const longNote = filler(4);
    const md = [filler(9) + ' Aquí.[^n] ' + filler(3), `[^n]: ${longNote}`].join('\n\n');
    const doc = build(md);
    const n = notes(doc)[0]!;
    const cite = markerLine(doc, 'n')!;
    expect(n.pageIndex).toBe(cite.block.pageIndex);
    expect(n.columnIndex).toBe(cite.block.columnIndex);
    const col = doc.pages[n.pageIndex]!.columns[n.columnIndex]!;
    for (const b of col.blocks) expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(n.bbox.y + 0.5);
  });

  it('sets the notes after the chapter with placement chapterEnd', () => {
    const md = [`${filler(1)} Cita.[^a]`, '[^a]: Nota al final.', filler(1)].join('\n\n');
    const doc = build(md, { ...TWO_COL, footnotes: { placement: 'chapterEnd' } });
    const ns = notes(doc);
    expect(ns).toHaveLength(1);
    const last = doc.blocks.filter((b) => b.type === 'paragraph').at(-1)!;
    expect(last.footnoteNote).toBe('a');
  });
});
