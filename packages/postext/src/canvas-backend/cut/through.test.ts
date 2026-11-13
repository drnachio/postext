import { describe, it, expect } from 'vitest';
import type { VDTDieCut, VDTDocument, VDTPage, VDTPathCommand } from '../../vdt.js';
import { composeThrough, cutDieShapes, paintThrough } from './through.js';
import { dieCutClipDecl } from '../../html-backend/dieCut.js';

// The see-through composite (#1567): what it cuts out, and in what order it
// clips and draws, on a context that records its calls.

type Call = [string, ...unknown[]];

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
      };
    },
    set(target, key: string, value: unknown) {
      target[key] = value;
      calls.push([`=${key}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const rect = (x: number, y: number, w: number, h: number): VDTPathCommand[] => [
  { op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' },
];
const cut = (...holes: VDTPathCommand[][]): VDTDieCut => ({ holes, sources: holes.map(() => 'd'), wrapGapPx: holes.map(() => 0) });
const docOf = (cuts: (VDTDieCut | undefined)[]) => ({
  pageIndexOffset: 0,
  trimOffset: 0,
  pages: cuts.map((dieCut, index) => ({ index, width: 400, height: 600, ...(dieCut ? { dieCut } : {}) }) as unknown as VDTPage),
}) as unknown as VDTDocument;

describe('cutDieShapes', () => {
  it('makes the holes and the paper past the outline transparent', () => {
    const { ctx, calls } = recorder();
    const page = { width: 400, height: 600, dieCut: { ...cut(rect(10, 10, 20, 20)), outline: [rect(0, 0, 390, 600)] } } as unknown as VDTPage;
    cutDieShapes(ctx, page, { trimOffset: 0 });
    expect(calls).toContainEqual(['=globalCompositeOperation', 'destination-out']);
    expect(calls.filter((c) => c[0] === 'fill').map((c) => c[1])).toEqual(['nonzero', 'evenodd']);
    expect(calls[0]![0]).toBe('save');
    expect(calls[calls.length - 1]![0]).toBe('restore');
  });
  it('leaves a page without a cut alone', () => {
    const { ctx, calls } = recorder();
    cutDieShapes(ctx, { width: 1, height: 1 } as VDTPage, { trimOffset: 0 });
    expect(calls).toEqual([]);
  });
});

describe('composeThrough', () => {
  // Pages 0, 2 and 4 share a hole; the walk ends on page 6, which has none.
  const doc = docOf([cut(rect(50, 50, 40, 40)), undefined, cut(rect(50, 50, 40, 40)), undefined, cut(rect(60, 60, 10, 10)), undefined, undefined]);
  const images = new Map([[2, 'img2'], [4, 'img4'], [6, 'img6']]) as unknown as Map<number, CanvasImageSource>;

  it('draws the deepest layer first, each clipped by every hole above it', () => {
    const { ctx, calls } = recorder();
    composeThrough(doc, 0, (i) => images.get(i), ctx, 2);
    expect(calls[1]).toEqual(['setTransform', 2, 0, 0, 2, 0, 0]);
    const draws = calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
    expect(draws).toEqual(['img6', 'img4', 'img2']);
    // Clips before each draw: three for page 6 (holes of 0, 2, 4), two for 4, one for 2.
    const clipsBefore: number[] = [];
    let n = 0;
    for (const c of calls) {
      if (c[0] === 'clip') n++;
      if (c[0] === 'restore') n = 0;
      if (c[0] === 'drawImage') clipsBefore.push(n);
    }
    expect(clipsBefore).toEqual([3, 2, 1]);
    // Then the edge: a blurred shadow and the wall's line.
    const shadow = calls.findIndex((c) => c[0] === '=shadowBlur' && (c[1] as number) > 0);
    expect(shadow).toBeGreaterThan(calls.findIndex((c) => c[0] === 'drawImage' && c[1] === 'img2'));
    expect(calls.some((c) => c[0] === 'stroke')).toBe(true);
  });

  it('fills a page it has no image of with paper, and the board past the end', () => {
    const { ctx, calls } = recorder();
    const short = docOf([cut(rect(50, 50, 40, 40)), undefined, cut(rect(50, 50, 40, 40))]);
    paintThrough(ctx, short, 0, () => undefined, 1, { background: '#123456' });
    const fills = calls.filter((c) => c[0] === '=fillStyle').map((c) => c[1]);
    expect(fills.slice(0, 2)).toEqual(['#123456', '#ffffff']);
  });

  it('draws nothing for a page without holes', () => {
    const { ctx, calls } = recorder();
    paintThrough(ctx, doc, 1, () => undefined);
    expect(calls).toEqual([]);
  });
});

describe('HTML clip-path', () => {
  it('keeps the bleed box less the holes, even-odd', () => {
    const decl = dieCutClipDecl({ width: 400, height: 600, dieCut: cut(rect(10, 20, 30, 40)) }, 5);
    expect(decl).toBe("clip-path:path(evenodd,'M5 5L395 5L395 595L5 595ZM10 20L40 20L40 60L10 60Z');");
  });
  it('keeps the outline when the leaf has one', () => {
    const decl = dieCutClipDecl({ width: 400, height: 600, dieCut: { holes: [], sources: [], wrapGapPx: [], outline: [rect(0, 0, 390, 600)] } });
    expect(decl).toBe("clip-path:path(evenodd,'M0 0L390 0L390 600L0 600Z');");
    expect(dieCutClipDecl({ width: 1, height: 1 })).toBeUndefined();
  });
});
