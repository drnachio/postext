import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTDocument } from '../../../vdt.js';
import type { PostextConfig, Resource, ResourcePlacement } from '../../../types.js';
import { resolveLayoutConfig } from '../../../defaults/layout.js';

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

/**
 * A row at the foot (`layout.footFloatRow`): a figure cited where its
 * column already holds one at its foot takes the foot of the next empty
 * column, its caption level with its neighbour's, instead of stacking over
 * it in the same column.
 */

const pt = (value: number) => ({ value, unit: 'pt' as const });

const base = (footFloatRow = true): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'double', footFloatRow },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
});

const fig = (id: string, placement: ResourcePlacement = {}, w = 600, h = 300): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: id, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: w, height: h },
  placement,
});

const para = (i: number) => `Paragraph ${i} ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);

const build = (markdown: string, resources: Resource[], cfg: PostextConfig = base()): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

/** The two figures' blocks and the text lines of the page they share. */
function foot(doc: VDTDocument) {
  for (const page of doc.pages) {
    const fl = (page.floats ?? []).filter((b) => b.resourceBlock);
    const f1 = fl.find((b) => b.resourceBlock!.resource.id === 'f1');
    const f2 = fl.find((b) => b.resourceBlock!.resource.id === 'f2');
    if (f1 && f2) return { page, f1, f2 };
  }
  throw new Error('f1 and f2 not on one page');
}

/** Paragraphs with figure 1 cited in paragraph `k` and figure 2 in the
 *  next: at k = 4 both fall to the foot of the second column of page 1. */
function chapter(k: number): string {
  const paras = Array.from({ length: 16 }, (_, i) => para(i));
  paras[k] = `First :ref{id="f1"} here. ` + paras[k];
  paras[k + 1] = `Then :ref{id="f2"} there. ` + paras[k + 1];
  return paras.join('\n\n');
}
const FIGS = [fig('f1', {}, 600, 260), fig('f2', {}, 600, 220)];

describe('a row at the foot (layout.footFloatRow)', () => {
  const grid = 14 * 96 / 72;

  it('sets a second figure at the foot of the next column, level with the first', () => {
    const doc = build(chapter(0), FIGS);
    const { page, f1, f2 } = foot(doc);
    expect([f1.columnIndex, f2.columnIndex]).toEqual([0, 1]);
    // Both stand on the foot of the page.
    const a = page.contentArea;
    for (const f of [f1, f2]) expect(a.y + a.height - (f.bbox.y + f.bbox.height)).toBeLessThan(grid + 0.01);
  });

  it('is off by default, and off stacks them in the citing column, figure 1 first', () => {
    expect(resolveLayoutConfig().footFloatRow).toBe(false);
    const doc = build(chapter(0), FIGS, base(false));
    const { f1, f2 } = foot(doc);
    expect(f1.columnIndex).toBe(f2.columnIndex);
    expect(f1.bbox.y + f1.bbox.height).toBeLessThanOrEqual(f2.bbox.y + 0.01);
  });

  it('off, lays the page out as a configuration without it', () => {
    const plain: PostextConfig = { ...base(), layout: { layoutType: 'double' } };
    const pos = (d: VDTDocument) => d.pages.map((p) => (p.floats ?? []).map((b) => [b.columnIndex, Math.round(b.bbox.y * 100)]));
    expect(pos(build(chapter(0), FIGS, base(false)))).toEqual(pos(build(chapter(0), FIGS, plain)));
  });
});

describe('a foot row lines its figures up', () => {
  const LONG = 'A caption long enough to run over three lines of the column, as the first one of the pair does in the chapter it comes from.';
  const SAFE = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
  const pic = (id: string, h: number, caption: string, safe = true): Resource => ({
    ...fig(id, {}, 600, h), caption, ...(safe ? { safeArea: SAFE } : {}),
  });
  const firstCaption = (b: { resourceBlock?: { captionLines: { bbox: { y: number } }[] } }) => b.resourceBlock!.captionLines[0]!.bbox.y;

  it('sets the first lines of their captions level', () => {
    const { f1, f2 } = foot(build(chapter(0), [pic('f1', 260, LONG, false), pic('f2', 220, 'Short.', false)]));
    expect([f1.columnIndex, f2.columnIndex]).toEqual([0, 1]);
    expect(f1.resourceBlock!.captionLines.length).toBeGreaterThan(f2.resourceBlock!.captionLines.length);
    expect(Math.abs(firstCaption(f1) - firstCaption(f2))).toBeLessThan(0.5);
  });

  it('raises the first figure when the second has the longer caption', () => {
    const { f1, f2 } = foot(build(chapter(0), [pic('f1', 260, 'Short.', false), pic('f2', 220, LONG, false)]));
    expect([f1.columnIndex, f2.columnIndex]).toEqual([0, 1]);
    expect(Math.abs(firstCaption(f1) - firstCaption(f2))).toBeLessThan(0.5);
    // The text of the first column stays above its figure.
    const col = foot(build(chapter(0), [pic('f1', 260, 'Short.', false), pic('f2', 220, LONG, false)])).page.columns[0]!;
    const lastText = Math.max(...col.blocks.flatMap((b) => b.lines.map((l) => l.bbox.y + l.bbox.height)));
    expect(lastText).toBeLessThanOrEqual(f1.bbox.y + 0.01);
  });

  it('crops a picture with a safe area toward its neighbour’s height', () => {
    const { f1, f2 } = foot(build(chapter(0), [pic('f1', 260, LONG), pic('f2', 220, 'Short.')]));
    // The second grows within its safe area as far as it can toward the
    // first (column balancing, #442, may still add whole lines to the
    // first afterwards), and their captions stand level.
    expect(f2.resourceBlock!.bodySource).toBeDefined();
    expect(f2.resourceBlock!.bodyFlex!.delta).toBeGreaterThan(0);
    expect(f2.resourceBlock!.bodyFlex!.grow).toBeLessThan(0.5);
    expect(Math.abs(firstCaption(f1) - firstCaption(f2))).toBeLessThan(0.5);
  });

  it('leaves a picture without a safe area whole', () => {
    const { f2 } = foot(build(chapter(0), [pic('f1', 260, LONG, false), pic('f2', 220, 'Short.', false)]));
    expect(f2.resourceBlock!.bodySource).toBeUndefined();
  });
});
