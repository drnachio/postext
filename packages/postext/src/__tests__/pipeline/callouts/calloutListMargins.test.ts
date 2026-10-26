import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { stripCalloutStylesDefaults } from '../../../defaults/index.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { CalloutListStyleConfig, PostextConfig } from '../../../types.js';

// #1103: a box sets the space above and below its lists (`lists.marginTop`
// / `marginBottom`), ordered lists too; unset, the document's.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (lists: CalloutListStyleConfig): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { dpi: 72 },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  unorderedLists: { marginTop: pt(10), marginBottom: pt(10) },
  calloutStyles: [{ id: 'box', snapToGrid: false, lists }],
});
const MD = [
  ':::callout{type="box"}', 'Before.', '', '- Item one.', '  - Nested item.', '- Item two.', '', '1. Numbered.', '', 'After.', ':::',
  '', 'Running before.', '', '- Running item.', '', 'Running after.',
].join('\n');

const build = (lists: CalloutListStyleConfig): VDTDocument => buildDocument({ markdown: MD }, config(lists), createMeasurementCache());
const block = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.lines[0]?.text.includes(text))!;
const gap = (doc: VDTDocument, from: string, to: string): number =>
  block(doc, to).lines[0]!.baseline - block(doc, from).lines[0]!.baseline;

describe('list margins of a box (#1103)', () => {
  it('resolves and strips only what is set', () => {
    const resolve = (lists: CalloutListStyleConfig) => resolveAllConfig({ calloutStyles: [{ id: 'x', lists }] }).calloutStyles[0]!.lists;
    expect(resolve({}).marginTop).toBeUndefined();
    expect(resolve({}).marginBottom).toBeUndefined();
    expect(resolve({ marginBottom: pt(0) }).marginBottom).toEqual(pt(0));
    expect(stripCalloutStylesDefaults([{ id: 'x', lists: { marginTop: pt(2) } }])).toEqual([{ id: 'x', lists: { marginTop: pt(2) } }]);
  });

  it('keeps the document margins when unset', () => {
    const doc = build({});
    expect(gap(doc, 'Before.', 'Item one.')).toBeCloseTo(24, 5);
    expect(gap(doc, 'Running before.', 'Running item.')).toBeCloseTo(24, 5);
  });

  it('sets the box lists, ordered ones too, with its own margins', () => {
    const plain = build({});
    const tight = build({ marginTop: pt(0), marginBottom: pt(0) });
    expect(gap(tight, 'Before.', 'Item one.')).toBeCloseTo(14, 5);
    // The ordered list takes them too: plain, its own 1.5 em below.
    expect(gap(plain, 'Numbered.', 'After.')).toBeCloseTo(29, 5);
    expect(gap(tight, 'Numbered.', 'After.')).toBeCloseTo(14, 5);
    // The running list keeps the document's.
    expect(gap(tight, 'Running before.', 'Running item.')).toBeCloseTo(24, 5);
  });
});
