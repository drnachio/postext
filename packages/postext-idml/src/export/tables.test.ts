// A table of the book is an InDesign table: rows of fixed height, and
// cells whose insets are the engine's, so the text Postext set in a cell
// fits it in InDesign too.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Resource } from 'postext';
import { build, config } from '../testing/kit.test-helper.js';
import { idmlDocument } from './index.js';

const TABLE: Resource = {
  id: 'prices', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  table: { model: { headerRowCount: 1, rows: [[{ content: 'Item', isHeader: true }, { content: 'Price', isHeader: true }], [{ content: 'Widget A' }, { content: '129' }]] } },
  placement: { position: 'here' },
} as Resource;

describe('tables', () => {
  const warnings: string[] = [];
  const doc = build('A list.\n\n::resource{id="prices"}\n\nAfter.', config(), [TABLE]);
  const { bytes } = idmlDocument({ docs: [doc], onWarning: (w) => warnings.push(w.code) });
  const files = unzipSync(bytes);
  const story = Object.keys(files).filter((f) => f.startsWith('Stories/')).map((f) => strFromU8(files[f]!)).find((s) => s.includes('<Table '))!;

  it('writes the table with its rows, columns and cells', () => {
    expect(story).toBeDefined();
    expect(story).toMatch(/<Table [^>]*BodyRowCount="2"[^>]*ColumnCount="2"/);
    expect(story.match(/<Cell /g)).toHaveLength(4);
    expect(story).toContain('<Content>Widget</Content>');
    expect(warnings).not.toContain('table');
  });

  it('fixes the height of every row', () => {
    const rows = story.match(/<Row [^>]*>/g)!;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatch(/AutoGrow="false"/);
  });

  it('writes the insets of a cell in both forms InDesign knows', () => {
    // InDesign 2026 writes `Text…Inset` and reads `…Inset`: with the first
    // alone a cell keeps its default 4 pt and the text is overset.
    const cells = story.match(/<Cell [^>]*>/g)!;
    for (const c of cells) {
      expect(c).toMatch(/ TextTopInset="0"/);
      expect(c).toMatch(/ TextBottomInset="0"/);
      expect(c).toMatch(/ TopInset="0"/);
      expect(c).toMatch(/ BottomInset="0"/);
      const text = / TextLeftInset="([^"]+)"/.exec(c)?.[1];
      const own = / LeftInset="([^"]+)"/.exec(c)?.[1];
      expect(own).toBeDefined();
      expect(own).toBe(text);
    }
  });
});
