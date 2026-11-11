import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTBlock, VDTDocument, VDTPage } from '../../../vdt.js';
import type { PostextConfig, Resource, ResourcePlacement } from '../../../types.js';

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
 * A row at the foot (`layout.footFloatRow`) on the foot stacks (#1437):
 * a neighbour moved to stand level is moved through the stacks, so a float
 * joining its column later is placed from where it stands; three columns
 * make a row of three; footnotes keep their place under the row; a crop
 * toward the neighbour is reported.
 */

const pt = (value: number) => ({ value, unit: 'pt' as const });

const config = (columns: 'double' | 'triple' = 'double', footFloatRow = true): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: columns === 'triple' ? { layoutType: 'multiple', columnCount: 3, footFloatRow } : { layoutType: 'double', footFloatRow },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
});

const LONG = 'A caption long enough to run over three lines of the column, as the first one of the pair does in the chapter it comes from.';
const SAFE = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };

const fig = (id: string, h: number, caption: string, placement: ResourcePlacement = {}, safe = false): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: 600, height: h },
  placement,
  ...(safe ? { safeArea: SAFE } : {}),
});

const para = (i: number) => `Paragraph ${i} ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);

/** Paragraphs citing `ids` one per paragraph from the first on, each
 *  citing paragraph with a footnote when `notes` is set. */
function chapter(ids: string[], notes = false, count = 16): string {
  const paras = Array.from({ length: count }, (_, i) => para(i));
  ids.forEach((id, i) => {
    paras[i] = `See :ref{id="${id}"}${notes ? `[^n${i}]` : ''} here. ` + paras[i];
  });
  const defs = notes ? ids.map((_, i) => `[^n${i}]: A note to paragraph ${i}, long enough to take a line or two at the foot of the column.`) : [];
  return [...paras, ...defs].join('\n\n');
}

const build = (markdown: string, resources: Resource[], cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

function floatsOn(doc: VDTDocument, ids: string[]): { page: VDTPage; blocks: VDTBlock[] } {
  for (const page of doc.pages) {
    const fl = (page.floats ?? []).filter((b) => b.resourceBlock);
    const blocks = ids.map((id) => fl.find((b) => b.resourceBlock!.resource.id === id));
    if (blocks.every(Boolean)) return { page, blocks: blocks as VDTBlock[] };
  }
  throw new Error(`${ids.join(', ')} not on one page`);
}

const captionTop = (b: VDTBlock) => b.resourceBlock!.captionLines[0]!.bbox.y;
const bottomOf = (b: VDTBlock) => b.bbox.y + b.bbox.height;
const overlap = (a: VDTBlock, b: VDTBlock) =>
  a.columnIndex === b.columnIndex && a.bbox.y < bottomOf(b) - 0.01 && b.bbox.y < bottomOf(a) - 0.01;

describe('a foot row on the foot stacks', () => {
  it('moves the neighbour through the stacks: a float joining its column later goes above it', () => {
    // f1 has the short caption, so it rises to f2's; f3, at the foot of
    // f1's column, comes after.
    const resources = [
      fig('f1', 260, 'Short.', { position: 'bottom' }),
      fig('f2', 220, LONG, { position: 'bottom' }),
      fig('f3', 120, 'Third.', { position: 'bottom' }),
    ];
    const doc = build(chapter(['f1', 'f2', 'f3']), resources, config());
    const { page, blocks: [f1, f2, f3] } = floatsOn(doc, ['f1', 'f2', 'f3']);
    expect([f1!.columnIndex, f2!.columnIndex]).toEqual([0, 1]);
    expect(Math.abs(captionTop(f1!) - captionTop(f2!))).toBeLessThan(0.5);
    // No float laid over another, and every one within the page.
    for (const [a, b] of [[f1, f2], [f1, f3], [f2, f3]] as const) expect(overlap(a!, b!)).toBe(false);
    const foot = page.contentArea.y + page.contentArea.height;
    for (const f of [f1, f2, f3]) expect(bottomOf(f!)).toBeLessThanOrEqual(foot + 0.01);
    // The text of each column ends above its floats.
    for (const col of page.columns) {
      const top = Math.min(...[f1, f2, f3].filter((f) => f!.columnIndex === col.index).map((f) => f!.bbox.y));
      const lastText = Math.max(0, ...col.blocks.flatMap((b) => b.lines.map((l) => l.bbox.y + l.bbox.height)));
      if (Number.isFinite(top)) expect(lastText).toBeLessThanOrEqual(top + 0.01);
    }
  });

  it('sets three floats in a row across three columns, captions level', () => {
    const resources = [fig('f1', 400, LONG), fig('f2', 300, 'Short.'), fig('f3', 340, 'A caption of two lines, give or take a word.')];
    const on = build(chapter(['f1', 'f2', 'f3']), resources.map((r) => ({ ...r, placement: { position: 'bottom' } })), config('triple'));
    const { blocks } = floatsOn(on, ['f1', 'f2', 'f3']);
    expect(blocks.map((b) => b.columnIndex)).toEqual([0, 1, 2]);
    const tops = blocks.map(captionTop);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(0.5);
    // Off, the third stacks over the second in its column.
    const off = build(chapter(['f1', 'f2', 'f3']), resources.map((r) => ({ ...r, placement: { position: 'bottom' } })), config('triple', false));
    const [, o2, o3] = floatsOn(off, ['f1', 'f2', 'f3']).blocks;
    expect(o3!.columnIndex).toBe(o2!.columnIndex);
  });

  it('keeps footnotes clear of the row, where they stand without it', () => {
    const resources = [fig('f1', 260, LONG, { position: 'bottom' }), fig('f2', 220, 'Short.', { position: 'bottom' })];
    const doc = build(chapter(['f1', 'f2'], true), resources, config());
    const { page, blocks: [f1, f2] } = floatsOn(doc, ['f1', 'f2']);
    expect([f1!.columnIndex, f2!.columnIndex]).toEqual([0, 1]);
    expect(Math.abs(captionTop(f1!) - captionTop(f2!))).toBeLessThan(0.5);
    const notesOf = (d: VDTDocument) => d.blocks.filter((b) => b.pageIndex === page.index && b.footnoteNote !== undefined);
    const notes = notesOf(doc);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) for (const f of [f1, f2]) expect(overlap(n, f!)).toBe(false);
    // The citing column's notes keep their place: the row moved the
    // second figure only.
    const off = build(chapter(['f1', 'f2'], true), resources, config('double', false));
    const at = (d: VDTDocument) => notesOf(d).map((n) => [n.columnIndex, Math.round(n.bbox.y)]);
    expect(at(doc)).toEqual(at(off));
  });

  it('reports a picture cropped toward its neighbour', () => {
    const resources = [fig('f1', 260, LONG, { position: 'bottom' }, true), fig('f2', 220, 'Short.', { position: 'bottom' }, true)];
    const doc = build(chapter(['f1', 'f2']), resources, config());
    const { blocks: [, f2] } = floatsOn(doc, ['f1', 'f2']);
    expect(f2!.resourceBlock!.bodyFlex!.by).toBe('row');
    const cropped = (doc.contentWarnings ?? []).filter((w) => w.kind === 'floatCropped');
    expect(cropped).toEqual([expect.objectContaining({ kind: 'floatCropped', resourceId: 'f2', reason: 'row' })]);
    // Off, nothing is cropped or reported.
    const off = build(chapter(['f1', 'f2']), resources, config('double', false));
    expect((off.contentWarnings ?? []).filter((w) => w.kind === 'floatCropped')).toEqual([]);
  });
});

