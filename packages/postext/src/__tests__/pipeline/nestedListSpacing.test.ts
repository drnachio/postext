import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

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

// EF-165 (product-manual-warnings): at 72 dpi a point is a pixel.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (ordered: number, unordered: number): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(12), firstLineIndent: pt(0) },
  orderedLists: { itemSpacing: pt(ordered), marginTop: pt(0), marginBottom: pt(0) },
  unorderedLists: { itemSpacing: pt(unordered), marginTop: pt(0), marginBottom: pt(0) },
  headings: { balancing: { enabled: false } },
});

const items = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'listItem');
const gaps = (doc: VDTDocument): number[] => {
  const list = items(doc);
  return list.slice(1).map((b, i) => +(b.bbox.y - (list[i]!.bbox.y + list[i]!.bbox.height)).toFixed(4));
};
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());

describe('the item after a nested list (EF-165)', () => {
  it('takes its own list\'s itemSpacing, not the nested list\'s', () => {
    const md = '1. One\n2. Two\n   - nested a\n   - nested b\n3. Three\n4. Four';
    // One→Two, Two→a, a→b, b→Three, Three→Four.
    expect(gaps(build(md, config(6, 0)))).toEqual([6, 6, 0, 6, 6]);
  });

  it('works the other way round, and across two levels', () => {
    const md = '- One\n  1. first\n     - deep\n  2. second\n- Two';
    // One→first (unordered 2), first→deep (ordered 8), deep→second
    // (ordered 8), second→Two (unordered 2).
    expect(gaps(build(md, config(8, 2)))).toEqual([2, 8, 8, 2]);
    const skip = '- One\n  1. first\n     - deep\n- Two';
    // deep (depth 3) → Two (depth 1): Two's list.
    expect(gaps(build(skip, config(8, 2)))).toEqual([2, 8, 2]);
  });

  it('leaves lists whose levels share one spacing as they were', () => {
    const md = '1. One\n2. Two\n   - nested a\n   - nested b\n3. Three';
    expect(gaps(build(md, config(5, 5)))).toEqual([5, 5, 5, 5]);
  });

  it('follows the same rule inside a callout', () => {
    const md = ':::callout\n1. One\n2. Two\n   - nested a\n   - nested b\n3. Three\n:::';
    const doc = build(md, {
      ...config(6, 0),
      calloutStyles: [{ id: 'note', lists: { itemSpacing: pt(4) } }],
    });
    // A box sets one spacing for both kinds of list.
    expect(gaps(doc)).toEqual([4, 4, 4, 4]);
  });
});
