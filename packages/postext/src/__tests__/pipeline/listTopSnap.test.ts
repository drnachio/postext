import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveUnorderedListsConfig, resolveOrderedListsConfig, resolveBodyTextConfig, stripUnorderedListsDefaults, stripOrderedListsDefaults } from '../../defaults';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';

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

// The EF-103 repro (baseline-grid-book-page): a 13.4 pt leading, where the
// default 1.5 em list margins are not a whole number of lines.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (snap?: boolean): PostextConfig => ({
  page: { width: mm(120), height: mm(160), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(13.4), firstLineIndent: pt(0) },
  ...(snap === undefined ? {} : { unorderedLists: { snapTopToGrid: snap }, orderedLists: { snapTopToGrid: snap } }),
});
const markdown = [
  'A paragraph before the list, one line.',
  '- first bullet',
  '- second bullet',
  'Text between the lists.',
  '1. first number',
  '2. second number',
  'A paragraph after the lists.',
].join('\n\n');

/** Offset (in grid lines, 0 ≤ x < 1) of each list item's first line from
 *  the baseline grid of its column. */
const offsets = (doc: VDTDocument): number[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks
    .filter((b) => b.type === 'listItem')
    .map((b) => {
      const off = ((b.lines[0]!.bbox.y - c.bbox.y) / doc.baselineGrid) % 1;
      return Math.min(off, 1 - off) < 1e-4 ? 0 : off;
    })));

describe('unorderedLists / orderedLists.snapTopToGrid (EF-103)', () => {
  it('is off by default, and stripped when off', () => {
    expect(resolveUnorderedListsConfig(undefined, resolveBodyTextConfig()).snapTopToGrid).toBe(false);
    expect(resolveOrderedListsConfig(undefined, resolveBodyTextConfig()).snapTopToGrid).toBe(false);
    expect(stripUnorderedListsDefaults({ snapTopToGrid: false })).toBeUndefined();
    expect(stripOrderedListsDefaults({ snapTopToGrid: true })).toEqual({ snapTopToGrid: true });
  });

  it('by default a list sits off the grid until it ends (1.4 behaviour)', () => {
    const doc = buildDocument({ markdown }, config(), createMeasurementCache());
    expect(offsets(doc).some((o) => o > 0)).toBe(true);
    const off = buildDocument({ markdown }, config(false), createMeasurementCache());
    expect(off.blocks.map((b) => b.bbox.y)).toEqual(doc.blocks.map((b) => b.bbox.y));
  });

  it('on, every item of both lists sits on the grid, the margin above at least the one set', () => {
    const plain = buildDocument({ markdown }, config(), createMeasurementCache());
    const doc = buildDocument({ markdown }, config(true), createMeasurementCache());
    expect(offsets(doc)).toEqual([0, 0, 0, 0]);
    // Rounded up: each list's first item sits at or below where it did.
    const firsts = (d: VDTDocument) => d.blocks.filter((b) => b.type === 'listItem' && b.bulletText !== undefined && /first/.test(b.lines[0]!.text)).map((b) => b.bbox.y);
    const before = firsts(plain);
    const after = firsts(doc);
    expect(after).toHaveLength(2);
    after.forEach((y, i) => expect(y).toBeGreaterThanOrEqual(before[i]! - 0.01));
    // The text after each list is back on the grid either way.
    const para = doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]!.text.startsWith('A paragraph after'))!;
    const col = doc.pages[para.pageIndex!]!.columns[para.columnIndex!]!;
    expect(((para.bbox.y - col.bbox.y) / doc.baselineGrid) % 1).toBeCloseTo(0, 4);
  });

  it('a heading style can turn it on for its section, through its body style lists', () => {
    const styled: PostextConfig = {
      ...config(),
      headingStyles: [{
        id: 'snapped',
        bodyStyle: { unorderedLists: { snapTopToGrid: true }, orderedLists: { snapTopToGrid: true } },
      }],
    };
    const md = `# Plain\n\n${markdown}\n\n# Snapped {style="snapped"}\n\n${markdown}`;
    const doc = buildDocument({ markdown: md }, styled, createMeasurementCache());
    const all = offsets(doc);
    expect(all).toHaveLength(8);
    // The first section keeps the document's lists (off the grid); the
    // styled one snaps both of its lists.
    expect(all.slice(0, 4).some((o) => o > 0)).toBe(true);
    expect(all.slice(4)).toEqual([0, 0, 0, 0]);
  });
});
