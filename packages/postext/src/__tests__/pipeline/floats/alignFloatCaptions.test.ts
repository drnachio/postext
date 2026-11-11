import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import { resolveLayoutConfig } from '../../../defaults/layout.js';
import { proposeFloatPads, type PlacedSlot } from '../../../pipeline/build/floatPads.js';

// `layout.alignFloatsAcrossColumns`: figures sharing a band of a page line
// up across its columns — at the foot, the first lines of their captions.
// Our foot row (`layout.footFloatRow`) already lines up a float joining the
// foot band of the next column, so the foot cases set it off to see the new
// rule alone; a figure placed by hand (`placement.pin`) is left as dropped.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

const figure = (id: string, caption: string, height: number, position: 'top' | 'bottom', pinned = false): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height },
  placement: { position, span: 'column', ...(pinned ? { pin: { page: 0, column: 0, slot: position } } : {}) },
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i % 7}`).join(' ');

function build(align: boolean, position: 'top' | 'bottom', footFloatRow = true, pinned = false, balancing = false): VDTDocument {
  const resources = [
    figure('a', `Un pie largo que ocupa varias líneas en la columna: ${words(40)}.`, 300, position, pinned),
    figure('b', 'Un pie corto.', 220, position),
  ];
  const md = `${words(5)} :ref{id="a"} ${words(5)} :ref{id="b"} ${words(400)}`;
  const config: PostextConfig = {
    page: { width: mm(180), height: mm(250), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'double', gutterWidth: mm(6), footFloatRow, ...(align ? { alignFloatsAcrossColumns: true } : {}) },
    bodyText: { fontSize: pt(10), lineHeight: pt(13), firstLineIndent: pt(0) },
    headings: { balancing: { enabled: balancing } },
    captionStyle: { fontSize: pt(8) },
  };
  return buildDocument({ markdown: md, resources }, config, createMeasurementCache());
}

const floatsOf = (doc: VDTDocument): VDTBlock[] => {
  const page = doc.pages.find((p) => (p.floats ?? []).filter((f) => f.resourceBlock).length >= 2)!;
  return page.floats!.filter((f) => f.resourceBlock);
};
const captionTop = (b: VDTBlock) => b.resourceBlock!.captionLines[0]!.bbox.y;
const bodyBottom = (b: VDTBlock) => b.bbox.y + b.resourceBlock!.bodyRect.y + b.resourceBlock!.bodyRect.height;

describe('layout.alignFloatsAcrossColumns', () => {
  it('at the foot of the columns, sets the first lines of the captions level', () => {
    const [a, b] = floatsOf(build(false, 'bottom', false));
    expect(a!.columnIndex).not.toBe(b!.columnIndex);
    expect(Math.abs(captionTop(a!) - captionTop(b!))).toBeGreaterThan(5);
    const [a2, b2] = floatsOf(build(true, 'bottom', false));
    expect(captionTop(a2!)).toBeCloseTo(captionTop(b2!), 0);
  });

  it('agrees with the foot row: both on, the captions stay level', () => {
    const [a, b] = floatsOf(build(true, 'bottom'));
    expect(captionTop(a!)).toBeCloseTo(captionTop(b!), 0);
  });

  it('leaves a figure placed by hand where it was dropped, and does not line others up with it', () => {
    const [a, b] = floatsOf(build(false, 'top', true, true));
    const [a2, b2] = floatsOf(build(true, 'top', true, true));
    expect(a2!.bbox.y).toBeCloseTo(a!.bbox.y, 6);
    expect(bodyBottom(a2!)).toBeCloseTo(bodyBottom(a!), 6);
    expect(bodyBottom(b2!)).toBeCloseTo(bodyBottom(b!), 6);
  });

  it('at the head of the columns, sets the bottoms of the pictures level', () => {
    const [a, b] = floatsOf(build(false, 'top'));
    expect(Math.abs(bodyBottom(a!) - bodyBottom(b!))).toBeGreaterThan(5);
    const [a2, b2] = floatsOf(build(true, 'top'));
    expect(bodyBottom(a2!)).toBeCloseTo(bodyBottom(b2!), 0);
  });

  it('a picture filling its column from the head lines up with the foot captions beside it', () => {
    const tall = (align: boolean, height: number) => {
      const resources = [
        figure('a', `Un pie largo bajo una imagen que llena la columna: ${words(50)}.`, height, 'top'),
        figure('b', `Un pie más corto al pie de la otra columna: ${words(30)}.`, 300, 'bottom'),
      ];
      const md = `${words(5)} :ref{id="a"} ${words(150)} :ref{id="b"} ${words(400)}`;
      const config: PostextConfig = {
        page: { width: mm(180), height: mm(250), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
        layout: { layoutType: 'double', gutterWidth: mm(6), ...(align ? { alignFloatsAcrossColumns: true } : {}) },
        bodyText: { fontSize: pt(10), lineHeight: pt(13), firstLineIndent: pt(0) },
        headings: { balancing: { enabled: false } },
        captionStyle: { fontSize: pt(8) },
      };
      return floatsOf(buildDocument({ markdown: md, resources }, config, createMeasurementCache()));
    };
    const [a, b] = tall(false, 800);
    expect(Math.abs(captionTop(a!) - captionTop(b!))).toBeGreaterThan(5);
    const [a2, b2] = tall(true, 800);
    expect(captionTop(b2!)).toBeCloseTo(captionTop(a2!), 0);
    // With text left under the picture it stands in the head band only.
    const [a3, b3] = tall(true, 600);
    expect(Math.abs(captionTop(a3!) - captionTop(b3!))).toBeGreaterThan(5);
  });

  it('holds with column balancing on', () => {
    for (const position of ['top', 'bottom'] as const) {
      const doc = build(true, position, false, false, true);
      const [a, b] = floatsOf(doc);
      if (position === 'bottom') expect(captionTop(a!)).toBeCloseTo(captionTop(b!), 0);
      else expect(bodyBottom(a!)).toBeCloseTo(bodyBottom(b!), 0);
    }
  });

  it('is off by default', () => {
    expect(resolveLayoutConfig().alignFloatsAcrossColumns).toBe(false);
  });
});

describe('the pads read again after the last pass', () => {
  it('gives no white to a figure whose neighbour left its band', () => {
    // Laid out once with both figures at the foot: each pad lines one up
    // with the other. Read again with the second figure gone from the page,
    // the first asks for none.
    const doc = build(false, 'bottom', false);
    const [a, b] = floatsOf(doc);
    const slot = (f: VDTBlock): PlacedSlot => ({ page: f.pageIndex!, column: f.columnIndex!, position: 'bottom' });
    const pads = proposeFloatPads(doc, new Map([['a', slot(a!)], ['b', slot(b!)]]), new Map());
    expect(pads.size).toBeGreaterThan(0);
    const alone = proposeFloatPads(doc, new Map([['a', slot(a!)]]), pads);
    expect(alone.size).toBe(0);
  });

  it('keys each pad to the page it was read on', () => {
    const doc = build(true, 'bottom', false);
    const [a] = floatsOf(doc);
    // The pads a pass applied are read back without themselves: the same
    // layout asks for the same pads, on the same page.
    const settled = proposeFloatPads(doc, new Map([...floatsOf(doc)].map((f) => [f.resourceBlock!.resource.id, { page: f.pageIndex!, column: f.columnIndex!, position: 'bottom' as const }])), new Map());
    for (const pad of settled.values()) expect(pad.page).toBe(a!.pageIndex);
  });
});
