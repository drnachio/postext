import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { cleanPin } from '../../../pipeline/floats/floatPlacement.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { ContentWarning, VDTDocument } from '../../../vdt.js';
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

/** A float set by hand (`placement.pin`, #1494): a preference. The slot it
 *  names first, counted from the page that cites it; else the usual slots
 *  of that page; else on as any float, never lost, never holding its
 *  sequence back past a chapter's end, and reported (`floatPinMissed`). */

const pt = (value: number) => ({ value, unit: 'pt' as const });
const base = (balancing = false): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'double' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }], balancing: { enabled: balancing } },
});
const fig = (placement: ResourcePlacement = {}, h = 260, id = 'f'): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: id, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: 600, height: h },
  placement,
});
const para = (i: number) => `Paragraph ${i} ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);
/** `n` paragraphs, the figures `ids` cited in the second. */
const text = (n = 30, ids = ['f']) =>
  Array.from({ length: n }, (_, i) => (i === 1 ? ids.map((id) => `See :ref{id="${id}"}. `).join('') : '') + para(i)).join('\n\n');
const build = (resources: Resource[], md = text(30, resources.map((r) => r.id)), balancing = false): VDTDocument =>
  buildDocument({ markdown: md, resources }, base(balancing), createMeasurementCache());

function where(doc: VDTDocument, id = 'f') {
  for (const page of doc.pages) for (const f of page.floats ?? []) {
    if (f.resourceBlock?.resource.id !== id) continue;
    const a = page.contentArea;
    return {
      page: page.index,
      column: f.columnIndex,
      atTop: Math.abs(f.bbox.y - a.y) < 1,
      atFoot: a.y + a.height - (f.bbox.y + f.bbox.height) < 14 * 96 / 72 + 0.01,
    };
  }
  throw new Error(`${id} not placed`);
}
type PinWarning = Extract<ContentWarning, { kind: 'floatPinMissed' }>;
const missed = (doc: VDTDocument): PinWarning[] =>
  (doc.contentWarnings ?? []).filter((w): w is PinWarning => w.kind === 'floatPinMissed');

describe('a float set by hand (placement.pin)', () => {
  it('without a pin lands on the citing page', () => {
    expect(where(build([fig()])).page).toBe(0);
  });

  it('takes the slot it names on a later page', () => {
    const doc = build([fig({ pin: { page: 1, column: 1, slot: 'bottom' } })]);
    expect(where(doc)).toMatchObject({ page: 1, column: 1, atFoot: true });
    expect(missed(doc)).toEqual([]);
  });

  it('takes the head of a later column of the citing page', () => {
    const doc = build([fig({ pin: { page: 0, column: 1, slot: 'top' } })]);
    expect(where(doc)).toMatchObject({ page: 0, column: 1, atTop: true });
    expect(missed(doc)).toEqual([]);
  });

  it('takes the head of a page two pages on, in any column when none is named', () => {
    const doc = build([fig({ pin: { page: 2, slot: 'top' } })]);
    expect(where(doc)).toMatchObject({ page: 2, atTop: true });
    expect(missed(doc)).toEqual([]);
  });

  it('a slot above its citation is missed: placed on that page as without the pin, and reported', () => {
    // The head of the citing column is above the citation.
    const doc = build([fig({ pin: { page: 0, column: 0, slot: 'top' } })]);
    const auto = where(build([fig()]));
    expect(where(doc)).toEqual(auto);
    expect(missed(doc)).toEqual([expect.objectContaining({ resourceId: 'f', reason: 'notTaken', requestedPage: 0, pageIndex: 0 })]);
  });

  it('a pin past the maximum offset is ignored and reported', () => {
    const doc = build([fig({ pin: { page: 7, slot: 'top' } })]);
    expect(where(doc)).toEqual(where(build([fig()])));
    expect(missed(doc)).toEqual([expect.objectContaining({ resourceId: 'f', reason: 'tooFar' })]);
  });

  it('a column the page lacks: another column takes it, on that page, and it is reported', () => {
    const doc = build([fig({ pin: { page: 1, column: 5, slot: 'bottom' } })]);
    expect(where(doc)).toMatchObject({ page: 1, atFoot: true });
    expect(missed(doc)).toEqual([expect.objectContaining({ reason: 'column', requestedPage: 1, pageIndex: 1 })]);
  });

  it('two floats pinned to one slot: both stack at it while they fit', () => {
    const a = fig({ pin: { page: 1, column: 0, slot: 'bottom' } }, 400, 'a');
    const b = fig({ pin: { page: 1, column: 0, slot: 'bottom' } }, 400, 'b');
    const doc = build([a, b]);
    expect(where(doc, 'a')).toMatchObject({ page: 1, column: 0 });
    expect(where(doc, 'b')).toMatchObject({ page: 1, column: 0, atFoot: true });
    expect(missed(doc)).toEqual([]);
  });

  it('two floats pinned to a slot that holds one: the first takes it, the second the usual slots of that page, in order', () => {
    const a = fig({ pin: { page: 1, column: 0, slot: 'bottom' } }, 900, 'a');
    const b = fig({ pin: { page: 1, column: 0, slot: 'bottom' } }, 900, 'b');
    const doc = build([a, b]);
    const wa = where(doc, 'a');
    const wb = where(doc, 'b');
    expect(wa).toMatchObject({ page: 1, column: 0, atFoot: true });
    expect(wb.page).toBe(1);
    expect(wb.column === 0 && wb.atFoot).toBe(false);
    expect(missed(doc).map((w) => [w.resourceId, w.reason])).toEqual([['b', 'notTaken']]);
  });

  it('a float that does not fit its slot goes on as usual and is reported', () => {
    // Taller than any column: no slot of the citing page holds it whole.
    const doc = build([fig({ pin: { page: 0, column: 1, slot: 'bottom' } }, 2400)]);
    expect(where(doc).page).toBeGreaterThanOrEqual(0);
    expect(missed(doc)).toEqual([expect.objectContaining({ reason: 'notTaken', requestedPage: 0 })]);
  });

  it('a pin past the end of the chapter neither loses the float nor holds back its sequence', () => {
    const md = text(3, ['a', 'b']);
    const a = fig({ pin: { page: 3, slot: 'top' } }, 260, 'a');
    const b = fig({}, 260, 'b');
    const doc = build([a, b], md);
    expect(where(doc, 'a').page).toBe(where(build([fig({}, 260, 'a'), b], md), 'a').page);
    expect(() => where(doc, 'b')).not.toThrow();
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'unplaced')).toEqual([]);
    expect(missed(doc)).toEqual([expect.objectContaining({ resourceId: 'a', reason: 'notTaken', requestedPage: 3 })]);
  });

  it('holds back the later floats of its sequence only until its page', () => {
    const a = fig({ pin: { page: 1, slot: 'top' } }, 260, 'a');
    const b = fig({}, 260, 'b');
    const doc = build([a, b]);
    expect(where(doc, 'a').page).toBe(1);
    expect(where(doc, 'b').page).toBeGreaterThanOrEqual(1);
    expect(missed(doc)).toEqual([]);
  });

  it('a page-span float takes the band its pin names', () => {
    const doc = build([fig({ span: 'page', pin: { page: 1, slot: 'bottom' } }, 300)]);
    expect(where(doc)).toMatchObject({ page: 1, atFoot: true });
    expect(missed(doc)).toEqual([]);
  });

  it('a float that may head its citing page follows its pin instead', () => {
    const doc = build([fig({ position: 'top', citingPage: true, pin: { page: 1, column: 1, slot: 'top' } })]);
    expect(where(doc)).toMatchObject({ page: 1, column: 1, atTop: true });
    expect(missed(doc)).toEqual([]);
  });

  it('keeps its slot with column balancing on', () => {
    const doc = build([fig({ pin: { page: 1, column: 1, slot: 'bottom' } })], undefined, true);
    expect(where(doc)).toMatchObject({ page: 1, column: 1, atFoot: true });
    expect(missed(doc)).toEqual([]);
  });

  it('a pin on a resource set in the text, or on a turned float, is ignored and reported', () => {
    const inline = fig({ position: 'here', pin: { page: 1, slot: 'top' } });
    const doc = build([inline], ['Intro.', '::resource{id="f"}', text(5, [])].join('\n\n'));
    expect(missed(doc)).toEqual([expect.objectContaining({ resourceId: 'f', reason: 'unsupported' })]);
    const turned = build([fig({ rotate: 'ccw', pin: { page: 0, slot: 'top' } })]);
    expect(missed(turned)).toEqual([expect.objectContaining({ resourceId: 'f', reason: 'unsupported' })]);
  });

  it('cleans what it reads, up to three pages on', () => {
    expect(cleanPin({ page: 1, slot: 'top' })).toEqual({ page: 1, slot: 'top' });
    expect(cleanPin({ page: 3, column: 0, slot: 'bottom' })).toEqual({ page: 3, column: 0, slot: 'bottom' });
    expect(cleanPin({ page: 4, slot: 'top' })).toBeUndefined();
    expect(cleanPin({ page: -1, slot: 'top' })).toBeUndefined();
    expect(cleanPin({ page: 1.5, slot: 'top' })).toBeUndefined();
    expect(cleanPin({ page: 1, slot: 'middle' as 'top' })).toBeUndefined();
    expect(cleanPin({ page: 1, column: -2, slot: 'bottom' })).toBeUndefined();
  });
});
