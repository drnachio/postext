import { describe, it, expect, beforeAll } from 'vitest';
import { initMathEngine, renderMath, clearMathCache } from '../../math/index.js';
import type { MathPath, MathRender } from '../../math/index.js';
import { flattenPath, strokePolylines, type Pt } from '../../math/strokePath.js';
import { getMathRaster } from '../../math/rasterCache.js';

beforeAll(async () => {
  await initMathEngine();
  clearMathCache();
});

/** Nonzero winding of a fill path around a point. */
function winding(d: string, x: number, y: number): number {
  let w = 0;
  for (const sub of flattenPath(d)) {
    const pts = sub.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      const side = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
      if (a[1] <= y && b[1] > y && side > 0) w++;
      else if (a[1] > y && b[1] <= y && side < 0) w--;
    }
  }
  return w;
}

const covers = (paths: readonly MathPath[], x: number, y: number): boolean =>
  paths.some((p) => p.fill !== 'none' && winding(p.d, x, y) !== 0);

/** The paths of `tex` beyond its glyphs (MathJax appends the notation). */
function notation(tex: string, glyphs: string): MathPath[] {
  const r = renderMath(tex, true, 16);
  const plain = renderMath(glyphs, true, 16);
  expect(r.error).toBeUndefined();
  expect(r.paths.every((p) => p.fill !== 'none')).toBe(true);
  return r.paths.slice(plain.paths.length);
}

// The markup's local coordinates are mirrored by the root's scale(1,-1):
// a point (x, y) in MathJax's notation code is (x, -y) in the paths.
describe('\\enclose notations MathJax strokes as paths (#1371)', () => {
  it('strokes the longdiv bracket and bar instead of filling the shape they close', () => {
    // M 33.5 -188.5 a 183.3 443.5 0 0,1 0 1088 L 2100 899.5, 67 wide, round.
    const marks = notation(String.raw`\enclose{longdiv}{638}`, '638');
    expect(marks).toHaveLength(1);
    expect(covers(marks, 1000, -899.5)).toBe(true); // the bar
    expect(covers(marks, 2100 + 20, -899.5)).toBe(true); // its round cap
    expect(covers(marks, 1000, -500)).toBe(false); // under the bar: the digits
    expect(covers(marks, 100, -355.5)).toBe(false); // inside the bracket's bow
  });

  it('strokes the phasor angle with a miter corner', () => {
    // M 1467 -155.5 L 44 -155.5 L 365.7 832.5, 67 wide, joined `mitre`.
    const marks = notation(String.raw`\enclose{phasorangle}{30}`, '30');
    expect(covers(marks, 700, 155.5)).toBe(true);
    expect(covers(marks, (44 + 365.7) / 2, -(832.5 - 155.5) / 2)).toBe(true);
    expect(covers(marks, 900, -400)).toBe(false);
    // The miter fills the outer corner beyond the bevel.
    expect(covers(marks, 44 - 30, 155.5 + 30)).toBe(true);
  });

  it('rounds the corners of a roundedbox', () => {
    // rect x=33.5 y=-244.5 width=1039 height=920 rx=267, 67 wide.
    const marks = notation(String.raw`\enclose{roundedbox}{x}`, 'x');
    expect(covers(marks, 553, 244.5)).toBe(true); // the bottom edge
    expect(covers(marks, 33.5, 244.5)).toBe(false); // a square corner's place
    expect(covers(marks, 33.5 + 267 * 0.293, 244.5 - 267 * 0.293)).toBe(true); // the arc
    expect(covers(marks, 553, -215)).toBe(false); // inside the box
  });
});

describe('strokePolylines', () => {
  const corner = [{ pts: [[0, 0], [100, 0], [100, 100]] as Pt[], closed: false }];

  it('fills a miter corner and leaves a bevel above the limit', () => {
    expect(winding(strokePolylines(corner, { width: 10, linejoin: 'miter' }), 104, -4)).not.toBe(0);
    expect(winding(strokePolylines(corner, { width: 10, linejoin: 'bevel' }), 104, -4)).toBe(0);
    expect(winding(strokePolylines(corner, { width: 10, linejoin: 'miter', miterlimit: 1.2 }), 104, -4)).toBe(0);
  });

  it('adds up overlapping pieces instead of cancelling them', () => {
    const d = strokePolylines(corner, { width: 10, linejoin: 'round', linecap: 'round' });
    for (const [x, y] of [[100, 0], [99, 1], [0, 0], [-4, 0], [100, 104]] as Pt[]) {
      expect(winding(d, x, y)).not.toBe(0);
    }
    expect(winding(d, 50, 50)).toBe(0);
  });
});

describe('canvas paint of an unpainted path (#1371)', () => {
  it('skips a fill: none path instead of filling it with the previous colour', () => {
    const fills: string[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { OffscreenCanvas: g['OffscreenCanvas'], Path2D: g['Path2D'] };
    g['Path2D'] = class { constructor(public d: string) {} };
    g['OffscreenCanvas'] = class {
      getContext(): unknown {
        return {
          fillStyle: '', scale() {}, translate() {},
          fill(this: { fillStyle: string }) { fills.push(this.fillStyle); },
        };
      }
    };
    try {
      const render: MathRender = {
        tex: 'probe-1371', displayMode: false, svg: '',
        paths: [
          { d: 'M0 0L1 0L1 1Z', fill: '#ff0000' },
          { d: 'M0 0L1 0L1 1Z', fill: 'none' },
          { d: 'M0 0L1 0L1 1Z', fill: 'currentColor' },
        ],
        viewBox: { minX: 0, minY: 0, width: 1, height: 1 },
        widthPx: 1, heightPx: 1, ascentPx: 1, depthPx: 0, scale: 1,
      };
      expect(getMathRaster(render, '#000000')).not.toBeNull();
      expect(fills).toEqual(['#ff0000', '#000000']);
    } finally {
      g['OffscreenCanvas'] = saved.OffscreenCanvas;
      g['Path2D'] = saved.Path2D;
    }
  });
});
