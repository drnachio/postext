import { describe, expect, it } from 'vitest';
import { groundColour, luminance, markTreatment, overPaper, parseFill, type ColourGrid, type Rgb } from './backdrop.js';

/** A grid of `width` × `height` cells from a function of the cell. */
function gridOf(width: number, height: number, at: (x: number, y: number) => [number, number, number]): ColourGrid {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgb.set(at(x, y), (y * width + x) * 3);
  return { width, height, rgb };
}
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const ORANGE: [number, number, number] = [245, 140, 30];
/** The selection's default fill and the caret's. */
const HIGHLIGHT = '#fde04780';
const CARET = '#2563eb';
const unit = (c: [number, number, number]): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];

describe('the ground under a mark (#1712, #1716)', () => {
  it('reads pixels over white paper', () => {
    expect([...overPaper(new Uint8ClampedArray([0, 0, 0, 255, 10, 20, 30, 0, 255, 0, 0, 255]))]).toEqual([0, 0, 0, 255, 255, 255, 255, 0, 0]);
  });
  it('is the ground, not the text set on it', () => {
    // A third of every row is ink.
    const black = gridOf(30, 30, (x) => (x % 3 === 0 ? WHITE : BLACK));
    const orange = gridOf(30, 30, (x) => (x % 3 === 0 ? BLACK : ORANGE));
    expect(luminance(groundColour(black, 0.1, 0.1, 0.9, 0.2))).toBe(0);
    expect(groundColour(orange, 0.1, 0.1, 0.9, 0.2)).toEqual(unit(ORANGE));
  });
  it('is read mark by mark: a light box on a dark page', () => {
    const page = gridOf(40, 40, (x, y) => (x >= 20 && y < 20 ? WHITE : BLACK));
    expect(groundColour(page, 0.55, 0.1, 0.95, 0.2)).toEqual([1, 1, 1]);
    expect(groundColour(page, 0.05, 0.1, 0.45, 0.2)).toEqual([0, 0, 0]);
    expect(groundColour(page, 0.55, 0.6, 0.95, 0.7)).toEqual([0, 0, 0]);
  });
  it('a region off the page or thinner than a cell reads the nearest cells', () => {
    const page = gridOf(10, 10, () => ORANGE);
    expect(groundColour(page, 0.501, 0.2, 0.502, 0.4)).toEqual(unit(ORANGE));
    expect(groundColour(page, 1.2, 1.2, 1.4, 1.4)).toEqual(unit(ORANGE));
    expect(groundColour(page, -0.4, -0.4, -0.2, -0.2)).toEqual(unit(ORANGE));
  });
});

describe('what a mark needs on its ground (#1712, #1716)', () => {
  it('reads a fill with or without alpha', () => {
    expect(parseFill('#fde04780')!.alpha).toBeCloseTo(0.5, 2);
    expect(parseFill('#fff')).toEqual({ rgb: [1, 1, 1], alpha: 1 });
    expect(parseFill('rgb(1, 2, 3)')).toBeNull();
  });
  it('nothing on white paper or on a ground of another hue', () => {
    expect(markTreatment([1, 1, 1], HIGHLIGHT)).toBe('none');
    expect(markTreatment(unit([200, 220, 255]), HIGHLIGHT)).toBe('none');
    expect(markTreatment(unit([43, 74, 203]), HIGHLIGHT)).toBe('none');
  });
  it('a lightening copy on a dark ground', () => {
    expect(markTreatment([0, 0, 0], HIGHLIGHT)).toBe('screen');
    expect(markTreatment(unit([20, 25, 60]), CARET)).toBe('screen');
  });
  it('a shade where the yellow highlight is lost: orange, yellow, red', () => {
    expect(markTreatment(unit(ORANGE), HIGHLIGHT)).toBe('shade');
    expect(markTreatment(unit([250, 215, 40]), HIGHLIGHT)).toBe('shade');
    expect(markTreatment(unit([215, 40, 40]), HIGHLIGHT)).toBe('shade');
  });
  it('the blue caret shows on orange by itself', () => {
    expect(markTreatment(unit(ORANGE), CARET)).toBe('none');
  });
});
