import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import type { PostextConfig, Resource, TableModel, VDTBlock } from '../../index';

// #465: a list nested at the content column of a `1.` item (three spaces a
// level) gets each level's own numbering style, and a table cell nests its
// items the same way.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

const config: PostextConfig = {
  page: {
    width: pt(400),
    height: pt(600),
    margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) },
  },
  layout: { layoutType: 'single' },
  orderedLists: {
    levels: [
      { level: 2, numberFormat: 'lower-alpha', separator: ')' },
      { level: 3, numberFormat: 'lower-roman', separator: ')' },
      { level: 4, numberFormat: 'upper-alpha', separator: ']' },
    ],
  },
};

const items = (markdown: string): VDTBlock[] =>
  buildDocument({ markdown }, config).blocks.filter((b) => b.type === 'listItem');

describe('nested ordered lists at the content column (#465)', () => {
  it('numbers a third-level item under `1.` with the third level\'s style', () => {
    const list = items([
      '1. 第一章 A',
      '   1. ひらがな B',
      '      1. 漢字 C',
      '      2. 送り仮名 D',
      '   2. カタカナ E',
      '2. 第二章 F',
    ].join('\n'));
    expect(list.map((b) => b.listDepth)).toEqual([1, 2, 3, 3, 2, 1]);
    expect(list.map((b) => b.bulletText)).toEqual(['1.', 'a)', 'i)', 'ii)', 'b)', '2.']);
  });

  it('indents each level as a two-space list does', () => {
    const three = items(['1. 一 A', '   1. 二 B', '      1. 三 C'].join('\n'));
    const two = items(['1. 一 A', '  1. 二 B', '    1. 三 C'].join('\n'));
    expect(three.map((b) => b.bbox.x)).toEqual(two.map((b) => b.bbox.x));
    expect(three.map((b) => b.lines[0]!.bbox.x)).toEqual(two.map((b) => b.lines[0]!.bbox.x));
  });
});

describe('nested lists in a table cell (#465)', () => {
  const cellLines = (content: string) => {
    const model: TableModel = { rows: [[{ content }, { content: 'x' }]] };
    const table: Resource = { id: 't', typeId: 'table', kind: 'table', caption: 'T.', createdAt: 0, updatedAt: 0, table: { model } };
    const resourceTypes = defaultResourceTypes();
    const { block } = layoutResourceBlock({
      resource: table,
      resourceType: resourceTypes.find((t) => t.id === 'table'),
      number: '1',
      resolved: resolveAllConfig(config),
      columnWidth: 600,
      resourceNumbering: { t: { number: '1', typeId: 'table', heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
      resourceTypes,
      resources: [table],
    });
    return block.table!.cells.find((c) => c.lines.some((l) => l.text.includes('A')))!.lines;
  };

  it('sets an item at the content column of `1.` one level in, not two', () => {
    const three = cellLines('1. 一 A\n   1. 二 B\n      1. 三 C');
    const two = cellLines('1. 一 A\n  1. 二 B\n    1. 三 C');
    expect(three.map((l) => l.text)).toEqual(two.map((l) => l.text));
    expect(three.map((l) => l.bbox.x)).toEqual(two.map((l) => l.bbox.x));
    // Three steps, evenly spaced.
    const xs = three.map((l) => l.bbox.x);
    expect(xs[1]! - xs[0]!).toBeGreaterThan(0);
    expect(xs[2]! - xs[1]!).toBeCloseTo(xs[1]! - xs[0]!, 6);
  });

  it('starts the cell\'s list again after a plain paragraph', () => {
    const lines = cellLines('• 一 A\n  • 二 B\nNote\n  • 一 C');
    expect(lines.map((l) => l.text.trim())).toEqual(['• 一 A', '• 二 B', 'Note', '• 一 C']);
    expect(lines[3]!.bbox.x).toBeCloseTo(lines[0]!.bbox.x, 6);
  });
});
