import { describe, it, expect } from 'vitest';
import { anchorsOutsideSafeArea, comicArtCrop, comicArtPointToPage, comicCropFeasibleRange } from '../../comics/art';
import { pointInPolygon } from '../../comics/geometry';

const r = (n: number) => Math.round(n * 1000) / 1000;
const cellRect = (cell: { x: number; y: number; width: number; height: number }) => [
  { x: cell.x, y: cell.y },
  { x: cell.x + cell.width, y: cell.y },
  { x: cell.x + cell.width, y: cell.y + cell.height },
  { x: cell.x, y: cell.y + cell.height },
];

describe('comicArtCrop', () => {
  // A 3:1 panorama, its subject left of centre.
  const wide = { width: 3000, height: 1000, safeArea: { x: 0.2, y: 0, width: 0.4, height: 1 } };

  it('covers the cell and keeps the safe area, the margins cropped in proportion', () => {
    const cell = { x: 0, y: 0, width: 600, height: 400 };
    const crop = comicArtCrop({ ...wide, cell, fit: 'cover' });
    expect(crop.letterbox).toBe(false);
    expect(crop.fallback).toBe(false);
    // The window is 1.5 / 3 = half the width, the whole height.
    expect(r(crop.source.width)).toBe(0.5);
    expect(r(crop.source.height)).toBe(1);
    // Safe area [0.2, 0.6] inside, margins 0.2 and 0.4 cut in proportion.
    expect(crop.source.x).toBeLessThanOrEqual(0.2);
    expect(crop.source.x + crop.source.width).toBeGreaterThanOrEqual(0.6);
    expect(r(crop.source.x)).toBe(r((0.2 * 0.5) / 0.6));
    // The whole picture is drawn twice the cell's width.
    expect(r(crop.box.width)).toBe(1200);
    expect(r(crop.box.height)).toBe(400);
    expect(r(crop.box.x)).toBe(r(-crop.source.x * 1200));
  });

  it('centres the window on the focus while the safe area allows', () => {
    const cell = { x: 0, y: 0, width: 600, height: 400 };
    const centred = comicArtCrop({ width: 3000, height: 1000, cell, fit: 'cover', focus: { x: 0.7, y: 0.5 } });
    expect(r(centred.source.x)).toBe(0.45);
    // The safe area wins over the focus.
    const kept = comicArtCrop({ ...wide, cell, fit: 'cover', focus: { x: 0.9, y: 0.5 } });
    expect(kept.source.x).toBeLessThanOrEqual(0.2 + 1e-9);
    // No safe area and no focus: centred.
    expect(r(comicArtCrop({ width: 3000, height: 1000, cell, fit: 'cover' }).source.x)).toBe(0.25);
  });

  it('letterboxes when the cell cannot hold the safe area under a cover crop', () => {
    // A tall cell: a cover window would be 0.1 of the width, the safe area
    // needs 0.4 of it.
    const cell = { x: 0, y: 0, width: 100, height: 333.3333 };
    const crop = comicArtCrop({ ...wide, cell, fit: 'cover' });
    expect(crop.fallback).toBe(true);
    expect(crop.letterbox).toBe(true);
    expect(r(crop.source.x)).toBe(0.2);
    expect(r(crop.source.width)).toBe(0.4);
    expect(r(crop.source.height)).toBe(1);
    // The picture is drawn narrower than the cell is tall: bands above and
    // below, the safe area spanning the cell's width.
    expect(r(crop.box.width)).toBe(250);
    expect(crop.box.height).toBeLessThan(cell.height);
    expect(r(crop.box.y + crop.box.height / 2)).toBe(r(cell.height / 2));
    // Feasible ratios: 0.4·3 = 1.2 down to … 3/1.
    expect(comicCropFeasibleRange(3000, 1000, wide.safeArea)).toEqual({ min: 1.2000000000000002, max: 3 });
  });

  it('contains: the whole picture, always letterboxed', () => {
    const cell = { x: 10, y: 20, width: 400, height: 400 };
    const crop = comicArtCrop({ width: 2000, height: 1000, cell, fit: 'contain' });
    expect(crop.source).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(crop.letterbox).toBe(true);
    expect(crop.fallback).toBe(false);
    expect([crop.box.x, crop.box.y, crop.box.width, crop.box.height].map(r)).toEqual([10, 120, 400, 200]);
  });

  it('reads the safe area flipped for mirrored art, and reports the source unflipped', () => {
    const cell = { x: 0, y: 0, width: 600, height: 400 };
    const plain = comicArtCrop({ ...wide, cell, fit: 'cover' });
    const mirrored = comicArtCrop({ ...wide, cell, fit: 'cover', mirrored: true });
    // The same part of the stored picture shows.
    expect(r(mirrored.source.x)).toBe(r(plain.source.x));
    expect(r(mirrored.source.width)).toBe(r(plain.source.width));
    // On the page the subject is on the other side.
    expect(r(mirrored.box.x)).toBe(r(600 - (plain.box.x + plain.box.width)));
  });
});

describe('anchors', () => {
  it('maps a picture point to the page, flipped for mirrored art, and tests visibility', () => {
    const cell = { x: 100, y: 100, width: 600, height: 400 };
    const crop = comicArtCrop({ width: 3000, height: 1000, cell, fit: 'cover' });
    const art = { box: crop.box, mirrored: false };
    const centre = comicArtPointToPage(art, 0.5, 0.5);
    expect([r(centre.x), r(centre.y)]).toEqual([400, 300]);
    const edge = comicArtPointToPage(art, 0.05, 0.5);
    expect(pointInPolygon(cellRect(cell), edge)).toBe(false);
    const flipped = comicArtPointToPage({ box: crop.box, mirrored: true }, 0.3, 0.5);
    expect(r(flipped.x)).toBe(r(crop.box.x + 0.7 * crop.box.width));
  });

  it('lists the anchors outside the safe area', () => {
    const anchors = [{ id: 'ana', x: 0.1, y: 0.5 }, { id: 'ben', x: 0.5, y: 0.5 }];
    expect(anchorsOutsideSafeArea(anchors, { x: 0.2, y: 0, width: 0.6, height: 1 }).map((a) => a.id)).toEqual(['ana']);
    expect(anchorsOutsideSafeArea(anchors, undefined)).toEqual([]);
  });
});
