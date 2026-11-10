import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { cleanPin } from '../../../pipeline/floats/floatPlacement.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTDocument } from '../../../vdt.js';
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

/** A float set by hand (`placement.pin`, dragged in the canvas): the slot
 *  it names, counted from the page that cites it, or its usual place and a
 *  warning when that slot cannot be had. */

const pt = (value: number) => ({ value, unit: 'pt' as const });
const base = (): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'double' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
});
const fig = (placement: ResourcePlacement = {}, h = 260): Resource => ({
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'f', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 600, height: h },
  placement,
});
const para = (i: number) => `Paragraph ${i} ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);
/** Thirty paragraphs, the figure cited in the second. */
const MD = Array.from({ length: 30 }, (_, i) => (i === 1 ? 'See :ref{id="f"}. ' : '') + para(i)).join('\n\n');
const build = (r: Resource): VDTDocument => buildDocument({ markdown: MD, resources: [r] }, base(), createMeasurementCache());

function where(doc: VDTDocument) {
  for (const page of doc.pages) for (const f of page.floats ?? []) {
    if (f.resourceBlock?.resource.id !== 'f') continue;
    const a = page.contentArea;
    return {
      page: page.index,
      column: f.columnIndex,
      atTop: Math.abs(f.bbox.y - a.y) < 1,
      atFoot: a.y + a.height - (f.bbox.y + f.bbox.height) < 14 * 96 / 72 + 0.01,
    };
  }
  throw new Error('f not placed');
}
const missed = (doc: VDTDocument) => (doc.warnings ?? []).filter((w) => w.kind === 'floatPinMissed');

describe('a float set by hand (placement.pin)', () => {
  it('without a pin lands on the citing page', () => {
    expect(where(build(fig())).page).toBe(0);
  });

  it('takes the slot it names on a later page', () => {
    const doc = build(fig({ pin: { page: 1, column: 1, slot: 'bottom' } }));
    expect(where(doc)).toMatchObject({ page: 1, column: 1, atFoot: true });
    expect(missed(doc)).toEqual([]);
  });

  it('takes the head of a later column of the citing page', () => {
    const doc = build(fig({ pin: { page: 0, column: 1, slot: 'top' } }));
    expect(where(doc)).toMatchObject({ page: 0, column: 1, atTop: true });
  });

  it('takes the head of a page two pages on, in any column when none is named', () => {
    const doc = build(fig({ pin: { page: 2, slot: 'top' } }));
    expect(where(doc)).toMatchObject({ page: 2, atTop: true });
  });

  it('never lands before its citation: a slot above it is missed and reported', () => {
    // The head of the citing column is above the citation.
    const doc = build(fig({ pin: { page: 0, column: 0, slot: 'top' } }));
    const w = where(doc);
    expect(w.page === 0 && w.column === 0 && w.atTop).toBe(false);
    expect(missed(doc)).toEqual([expect.objectContaining({ kind: 'floatPinMissed', pageIndex: 0, resourceId: 'f' })]);
  });

  it('cleans what it reads', () => {
    expect(cleanPin({ page: 1, slot: 'top' })).toEqual({ page: 1, slot: 'top' });
    expect(cleanPin({ page: -1, slot: 'top' })).toBeUndefined();
    expect(cleanPin({ page: 1.5, slot: 'top' })).toBeUndefined();
    expect(cleanPin({ page: 1, slot: 'middle' as 'top' })).toBeUndefined();
    expect(cleanPin({ page: 1, column: -2, slot: 'bottom' })).toBeUndefined();
  });
});
