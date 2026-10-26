import { describe, it, expect } from 'vitest';
import { MAX_STAGE_ZOOM, pinchZoom, scrollForFocus, STAGE_NAMES_ZOOM, touchPair, wheelZoom, zoomStep } from './stageZoom.js';

// #956: the zoom of the picture in the marks dialog.

describe('the steps of the picture zoom', () => {
  it('goes up level by level to the most, and down to the fitted picture', () => {
    const up: number[] = [1];
    while (up[up.length - 1]! < MAX_STAGE_ZOOM) up.push(zoomStep(up[up.length - 1]!, 1));
    expect(up).toEqual([1, 1.5, 2, 3, 4, 6, 8]);
    expect(zoomStep(MAX_STAGE_ZOOM, 1)).toBe(MAX_STAGE_ZOOM);
    const down: number[] = [MAX_STAGE_ZOOM];
    while (down[down.length - 1]! > 1) down.push(zoomStep(down[down.length - 1]!, -1));
    expect(down).toEqual([8, 6, 4, 3, 2, 1.5, 1]);
    expect(zoomStep(1, -1)).toBe(1);
  });

  it('finds the next level from a zoom between two, as the wheel leaves it', () => {
    expect(zoomStep(2.4, 1)).toBe(3);
    expect(zoomStep(2.4, -1)).toBe(2);
  });

  it('names every point of a dense map from the third level up', () => {
    expect(STAGE_NAMES_ZOOM).toBe(3);
    expect(zoomStep(2, 1)).toBe(STAGE_NAMES_ZOOM);
  });
});

describe('the wheel zoom', () => {
  it('grows when the wheel goes up, shrinks when it goes down, and is capped for a mouse notch', () => {
    expect(wheelZoom(-10)).toBeGreaterThan(1);
    expect(wheelZoom(10)).toBeLessThan(1);
    expect(wheelZoom(0)).toBe(1);
    expect(wheelZoom(-100)).toBeCloseTo(wheelZoom(-30), 10);
    expect(wheelZoom(-30)).toBeLessThan(1.4);
  });
});

// #970: two fingers move and zoom the picture on a touch screen.
describe('the touch gesture of the picture', () => {
  it('finds the middle of two fingers and how far apart they are', () => {
    expect(touchPair({ x: 10, y: 20 }, { x: 30, y: 60 })).toEqual({ cx: 20, cy: 40, distance: Math.hypot(20, 40) });
  });

  it('zooms by how much farther apart the fingers are, between the fitted picture and the most', () => {
    expect(pinchZoom(2, 100, 150)).toBeCloseTo(3);
    expect(pinchZoom(2, 100, 50)).toBeCloseTo(1);
    expect(pinchZoom(2, 100, 10)).toBe(1);
    expect(pinchZoom(4, 100, 900)).toBe(MAX_STAGE_ZOOM);
    expect(pinchZoom(3, 0, 80)).toBe(3);
    expect(pinchZoom(3, 80, 0)).toBe(3);
  });

  it('keeps the point under the fingers where they are: the scroll that puts a fraction of the picture at a place', () => {
    // A picture 2000 × 1500 px with the point at a fifth, half way, under the place (300, 200).
    expect(scrollForFocus(0.2, 0.5, 300, 200, { width: 2000, height: 1500 })).toEqual({ left: 100, top: 550 });
    // Fingers that moved right and up: the same point, a new place.
    expect(scrollForFocus(0.2, 0.5, 340, 160, { width: 2000, height: 1500 })).toEqual({ left: 60, top: 590 });
  });
});
