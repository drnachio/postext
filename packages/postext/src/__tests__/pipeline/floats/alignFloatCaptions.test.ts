import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// `captionStyle.alignAcrossColumns`: figures sharing a band of a page line
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

function build(align: boolean, position: 'top' | 'bottom', footFloatRow = true, pinned = false): VDTDocument {
  const resources = [
    figure('a', `Un pie largo que ocupa varias líneas en la columna: ${words(40)}.`, 300, position, pinned),
    figure('b', 'Un pie corto.', 220, position),
  ];
  const md = `${words(5)} :ref{id="a"} ${words(5)} :ref{id="b"} ${words(400)}`;
  const config: PostextConfig = {
    page: { width: mm(180), height: mm(250), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'double', gutterWidth: mm(6), footFloatRow },
    bodyText: { fontSize: pt(10), lineHeight: pt(13), firstLineIndent: pt(0) },
    headings: { balancing: { enabled: false } },
    captionStyle: { fontSize: pt(8), ...(align ? { alignAcrossColumns: true } : {}) },
  };
  return buildDocument({ markdown: md, resources }, config, createMeasurementCache());
}

const floatsOf = (doc: VDTDocument): VDTBlock[] => {
  const page = doc.pages.find((p) => (p.floats ?? []).filter((f) => f.resourceBlock).length >= 2)!;
  return page.floats!.filter((f) => f.resourceBlock);
};
const captionTop = (b: VDTBlock) => b.resourceBlock!.captionLines[0]!.bbox.y;
const bodyBottom = (b: VDTBlock) => b.bbox.y + b.resourceBlock!.bodyRect.y + b.resourceBlock!.bodyRect.height;

describe('captionStyle.alignAcrossColumns', () => {
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
        layout: { layoutType: 'double', gutterWidth: mm(6) },
        bodyText: { fontSize: pt(10), lineHeight: pt(13), firstLineIndent: pt(0) },
        headings: { balancing: { enabled: false } },
        captionStyle: { fontSize: pt(8), ...(align ? { alignAcrossColumns: true } : {}) },
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
});
