import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../../defaults/headings';
import { resolveHeadingStylesConfig } from '../../defaults/headingStyles';
import { resolveAllConfig } from '../../pipeline/config';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { HeadingsConfig, PostextConfig } from '../../types';

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
const pt = (value: number) => ({ value, unit: 'pt' as const });
const EPS = 0.01;

/** Heading margins off the grid (a line and a half under a heading), so a
 *  snapped heading and an unsnapped one set their text differently. */
const config = (headings: HeadingsConfig, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  ...extra,
  headings: {
    balancing: { enabled: false },
    marginTop: pt(14),
    marginBottom: pt(7),
    ...headings,
    levels: [{ level: 1, breakBefore: { enabled: false } }, ...(headings.levels ?? [])],
  },
});

const MD = [
  'Opening paragraph of the section.',
  '## Second level',
  'Text under the second-level heading.',
  '### Third level',
  'Text under the third-level heading.',
  '## Styled second level {style="loose"}',
  'Text under the styled heading.',
].join('\n\n');

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, cfg, createMeasurementCache());
const headingsOf = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'heading');
const textAfter = (doc: VDTDocument, h: VDTBlock): VDTBlock =>
  doc.blocks.find((b) => b.type === 'paragraph' && (b.contentIndex ?? -1) > (h.contentIndex ?? 0))!;
/** Whether a block's top sits on a baseline-grid line of its page. */
const onGrid = (doc: VDTDocument, b: VDTBlock): boolean => {
  const lines = (b.bbox.y - doc.pages[b.pageIndex]!.contentArea.y) / doc.baselineGrid;
  return Math.abs(lines - Math.round(lines)) < EPS;
};

describe('headings.levels[].snapToGrid (EF-22)', () => {
  it('inherits headings.snapToGrid when a level leaves it unset', () => {
    expect(resolveHeadingsConfig().levels.every((l) => l.snapToGrid)).toBe(true);
    expect(resolveHeadingsConfig({ snapToGrid: false }).levels.every((l) => !l.snapToGrid)).toBe(true);
    const mixed = resolveHeadingsConfig({ snapToGrid: false, levels: [{ level: 3, snapToGrid: true }] });
    expect(mixed.levels.map((l) => l.snapToGrid)).toEqual([false, false, true, false, false, false]);
  });

  it('an H2 off the grid and an H3 on it, in one document', () => {
    const doc = build(config({ levels: [{ level: 2, snapToGrid: false }] }));
    const [h2, h3] = headingsOf(doc);
    expect(h2!.snappedToGrid).toBe(false);
    expect(h3!.snappedToGrid).toBe(true);
    // The text under the H2 keeps the exact margin — off the grid; the text
    // under the H3 is back on it.
    expect(onGrid(doc, textAfter(doc, h2!))).toBe(false);
    expect(onGrid(doc, textAfter(doc, h3!))).toBe(true);
  });

  it('a level can snap when the headings default does not', () => {
    const doc = build(config({ snapToGrid: false, levels: [{ level: 3, snapToGrid: true }] }));
    const [h2, h3] = headingsOf(doc);
    expect(h2!.snappedToGrid).toBe(false);
    expect(h3!.snappedToGrid).toBe(true);
  });

  it('a heading style overrides its level', () => {
    const doc = build(config({}, { headingStyles: [{ id: 'loose', snapToGrid: false }] }));
    const hs = headingsOf(doc);
    expect(hs.map((h) => h.snappedToGrid)).toEqual([true, true, false]);
    const styles = resolveHeadingStylesConfig(
      [{ id: 'loose', snapToGrid: false }],
      resolveAllConfig().page, resolveAllConfig().bodyText, resolveAllConfig().unorderedLists, resolveAllConfig().orderedLists,
    );
    expect(styles[0]!.overrides.snapToGrid).toBe(false);
  });

  it('leaves the layout unchanged when no level sets it', () => {
    const plain = build(config({}));
    const explicit = build(config({ levels: [{ level: 2, snapToGrid: true }, { level: 3, snapToGrid: true }] }));
    expect(explicit.blocks.map((b) => [b.pageIndex, b.bbox.y])).toEqual(plain.blocks.map((b) => [b.pageIndex, b.bbox.y]));
  });

  it('strip keeps a level value only when it differs from headings.snapToGrid', () => {
    expect(stripHeadingsDefaults({ levels: [{ level: 2, snapToGrid: true }] })).toBeUndefined();
    expect(stripHeadingsDefaults({ levels: [{ level: 2, snapToGrid: false }] }))
      .toEqual({ levels: [{ level: 2, snapToGrid: false }] });
    expect(stripHeadingsDefaults({ snapToGrid: false, levels: [{ level: 2, snapToGrid: false }, { level: 3, snapToGrid: true }] }))
      .toEqual({ snapToGrid: false, levels: [{ level: 3, snapToGrid: true }] });
  });
});
