import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderCutLines } from '../canvas-backend/decorations';
import { cropMarkSegments } from '../cropMarks';
import { dimensionToPx } from '../units';
import type { PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';

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

/** A 170 × 227 mm page with cut lines on, as in the EF-120 report. */
function docWith(cutLines: NonNullable<NonNullable<PostextConfig['page']>['cutLines']>): VDTDocument {
  return buildDocument({ markdown: 'A paragraph of text.' }, {
    page: { sizePreset: 'custom', width: mm(170), height: mm(227), dpi: 150, cutLines },
    header: { elements: [] },
    footer: { elements: [] },
  });
}

interface Segment { x1: number; y1: number; x2: number; y2: number }

/** The lines `renderCutLines` strokes on a recording canvas context. */
function strokedMarks(doc: VDTDocument): Segment[] {
  const out: Segment[] = [];
  let from: { x: number; y: number } | null = null;
  let to: { x: number; y: number } | null = null;
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'moveTo') return (x: number, y: number) => { from = { x, y }; };
      if (key === 'lineTo') return (x: number, y: number) => { to = { x, y }; };
      if (key === 'stroke') return () => { if (from && to) out.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y }); from = to = null; };
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  renderCutLines(ctx, doc.pages[0]!, doc);
  return out;
}

/** Distances of a mark's two ends from the trim edge it prolongs, nearer end first. */
function distancesFromTrim(seg: Segment, doc: VDTDocument): [number, number] {
  const page = doc.pages[0]!;
  const t = doc.trimOffset;
  const horizontal = Math.abs(seg.y1 - seg.y2) < 1e-9;
  const edge = (v: number, low: number, high: number) => (v < low ? low - v : v - high);
  const d = horizontal
    ? [edge(seg.x1, t, page.width - t), edge(seg.x2, t, page.width - t)]
    : [edge(seg.y1, t, page.height - t), edge(seg.y2, t, page.height - t)];
  return [Math.min(d[0]!, d[1]!), Math.max(d[0]!, d[1]!)];
}

// EF-120. The sheet grows by bleed + markOffset + markLength a side, and the
// marks ran markOffset … markOffset + markLength outside the trim: with a
// bleed wider than markOffset they started inside the bleed, over the art
// that runs to its edge. They now start clear of the bleed.
describe('crop marks (EF-120)', () => {
  it('keeps the marks out of a bleed wider than markOffset', () => {
    const doc = docWith({ enabled: true, bleed: mm(5) });
    const bleed = dimensionToPx(mm(5), 150);
    const length = dimensionToPx(mm(5), 150);
    const marks = strokedMarks(doc);
    expect(marks).toHaveLength(8);
    for (const seg of marks) {
      const [near, far] = distancesFromTrim(seg, doc);
      expect(near).toBeCloseTo(bleed, 6);
      expect(far).toBeCloseTo(bleed + length, 6);
    }
  });

  it('leaves the marks where they were when markOffset is at least the bleed (the defaults)', () => {
    const doc = docWith({ enabled: true });
    const offset = dimensionToPx(mm(3), 150);
    const length = dimensionToPx(mm(5), 150);
    const marks = strokedMarks(doc);
    expect(marks).toHaveLength(8);
    for (const seg of marks) {
      const [near, far] = distancesFromTrim(seg, doc);
      expect(near).toBeCloseTo(offset, 6);
      expect(far).toBeCloseTo(offset + length, 6);
    }
  });

  it('never runs a mark past the sheet', () => {
    for (const bleed of [0, 2, 3, 5, 9]) {
      const doc = docWith({ enabled: true, bleed: mm(bleed), markOffset: mm(3), markLength: mm(5) });
      const page = doc.pages[0]!;
      for (const seg of cropMarkSegments(page, doc.config.page)) {
        for (const v of [seg.x1, seg.x2]) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(page.width + 1e-9);
        }
        for (const v of [seg.y1, seg.y2]) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(page.height + 1e-9);
        }
      }
    }
  });

  it('draws the segments cropMarkSegments lists, two on each trim corner', () => {
    const doc = docWith({ enabled: true, bleed: mm(5) });
    const page = doc.pages[0]!;
    const segments = cropMarkSegments(page, doc.config.page);
    expect(strokedMarks(doc)).toEqual(segments);
    const corner = (s: Segment) => `${s.x1 < page.width / 2 ? 'l' : 'r'}${s.y1 < page.height / 2 ? 't' : 'b'}`;
    const perCorner = new Map<string, number>();
    for (const s of segments) perCorner.set(corner(s), (perCorner.get(corner(s)) ?? 0) + 1);
    expect(Object.fromEntries(perCorner)).toEqual({ lt: 2, rt: 2, lb: 2, rb: 2 });
  });

  // Round-4 follow-up: the marks worked the trim offset out again from
  // `cutLines`, while the PDF's `TrimBox` reads `doc.trimOffset`. The two
  // agree, and the backends now pass the document's value so they always do.
  it('sets the marks round the trim offset it is given, the document\'s by default in the backends', () => {
    const doc = docWith({ enabled: true, bleed: mm(5) });
    const page = doc.pages[0]!;
    expect(cropMarkSegments(page, doc.config.page, doc.trimOffset)).toEqual(cropMarkSegments(page, doc.config.page));
    const moved = cropMarkSegments(page, doc.config.page, doc.trimOffset + 10);
    const base = cropMarkSegments(page, doc.config.page);
    // The top-left corner's marks move 10 px in on both axes.
    expect(moved[0]!.y1).toBeCloseTo(base[0]!.y1 + 10, 6);
    expect(moved[1]!.x1).toBeCloseTo(base[1]!.x1 + 10, 6);
    // The canvas backend strokes the segments of `doc.trimOffset`.
    const shifted = { ...doc, trimOffset: doc.trimOffset + 10 };
    expect(strokedMarks(shifted)).toEqual(moved);
  });

  it('lists no marks when cut lines are off', () => {
    const doc = buildDocument({ markdown: 'Text.' }, {});
    expect(cropMarkSegments(doc.pages[0]!, doc.config.page)).toEqual([]);
  });
});
