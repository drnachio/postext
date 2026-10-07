import { describe, it, expect } from 'vitest';
import { buildBody, buildNeck, buildTail, fitSuperellipse, tailLength, translateBody } from '../shapes';
import { pathData, pointInConvex, pointInRect, dist } from '../geom';
import { presetLetteringStyles } from '../presets';
import type { LetteringStyle, Point, Rect } from '../types';

const EM = 12;
const styles = presetLetteringStyles({ fontSizePx: EM, locale: 'en', fontFamily: 'Test' });
const speech = styles.speech!;
// A diamond text block: three lines, the middle one longest.
const INK: Rect[] = [
  { x: 20, y: 0, width: 60, height: 11 },
  { x: 0, y: 14, width: 100, height: 11 },
  { x: 15, y: 28, width: 70, height: 11 },
];

const corners = (r: Rect): Point[] => [
  { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height },
];
/** Distance from `p` to the polygon's boundary. */
function edgeDistance(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    best = Math.min(best, dist(p, { x: a.x + abx * t, y: a.y + aby * t }));
  }
  return best;
}
const isClosed = (d: string) => d.startsWith('M') && d.endsWith('Z') && /^[MLCZ0-9 .\-]+$/.test(d);

describe('balloon bodies (SPEC D3.2)', () => {
  for (const shape of ['oval', 'cloud', 'burst', 'wavy', 'electric', 'rounded', 'rectangle'] as const) {
    it(`${shape}: a closed outline holding the text with its air`, () => {
      const style: LetteringStyle = { ...speech, shape };
      const body = buildBody(INK, EM, style, 'b1');
      const d = pathData(body.cmds);
      expect(isClosed(d)).toBe(true);
      for (const r of INK) {
        for (const c of corners(r)) {
          expect(pointInConvex(c, body.core)).toBe(true);
          // Constant air: no ink corner closer to the outline than the
          // padding (2 % for the sampled outline).
          expect(edgeDistance(c, body.core)).toBeGreaterThanOrEqual(style.padding * 0.98 - 0.5);
        }
      }
      const b = body.bbox;
      expect(b.x).toBeLessThan(0 - style.padding + 1);
      expect(b.x + b.width).toBeGreaterThan(100 + style.padding - 1);
    });
  }

  it('hugs a diamond: an oval no wider than the text plus generous air', () => {
    const body = buildBody(INK, EM, speech, 'b1');
    expect(body.bbox.width).toBeLessThan(100 + 2 * speech.padding + 0.6 * 100);
    expect(body.bbox.height).toBeLessThan(39 + 2 * speech.padding + 0.8 * 39);
  });

  it('fits the smallest superellipse around points', () => {
    const pts = [{ x: -10, y: -5 }, { x: 10, y: 5 }, { x: 10, y: -5 }, { x: -10, y: 5 }];
    const { a, b } = fitSuperellipse(pts, { x: 0, y: 0 }, 2);
    expect(a * b).toBeCloseTo(100, 0); // a = 10√2, b = 5√2 for an ellipse
  });

  it('jitters bursts and clouds from the seed only', () => {
    const burst: LetteringStyle = { ...speech, shape: 'burst' };
    const a = pathData(buildBody(INK, EM, burst, 'x').cmds);
    const b = pathData(buildBody(INK, EM, burst, 'x').cmds);
    const c = pathData(buildBody(INK, EM, burst, 'y').cmds);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    const wobbly = (seed: string) => pathData(buildBody(INK, EM, { ...speech, wobble: 0.04 }, seed).cmds);
    expect(wobbly('s')).toBe(wobbly('s'));
    expect(wobbly('s')).not.toBe(wobbly('t'));
  });

  it('points every burst spike away from the centre', () => {
    const body = buildBody(INK, EM, { ...speech, shape: 'burst' }, 'z');
    for (let i = 1; i < body.hull.length; i += 2) {
      expect(dist(body.hull[i]!, body.centre)).toBeGreaterThan(dist(body.hull[i - 1]!, body.centre));
    }
  });
});

describe('tails (SPEC D3.2)', () => {
  const body = translateBody(buildBody(INK, EM, speech, 't'), 200, 100);
  const target = { x: 160, y: 260 };

  it('leaves the body, aims at the target and stops at the reach', () => {
    const tail = buildTail(body, target, speech, { strokeWidth: speech.strokeWidth })!;
    expect(tail).toBeDefined();
    expect(isClosed(pathData(tail.cmds))).toBe(true);
    const gap = dist(tail.base, target);
    // 0.55 of the gap, the tip never farther than 2.5 em from the target.
    expect(dist(tail.base, tail.tip)).toBeCloseTo(gap - Math.min(0.45 * gap, 2.5 * EM), 0);
    expect(dist(tail.tip, target)).toBeGreaterThanOrEqual(0.5 * EM);
    expect(dist(tail.tip, target)).toBeLessThanOrEqual(2.5 * EM + 0.5);
    // The tip lies on the line from the exit to the target.
    const ux = (target.x - tail.base.x) / gap;
    const uy = (target.y - tail.base.y) / gap;
    const along = (tail.tip.x - tail.base.x) * ux + (tail.tip.y - tail.base.y) * uy;
    expect(along).toBeCloseTo(dist(tail.base, tail.tip), 3);
    // It starts inside the body (the layer method merges the outlines).
    const first = tail.cmds[0]!.pts[0]!;
    expect(pointInConvex(first, body.core)).toBe(true);
  });

  it('ends about as near its target whatever the gap (consistent reach)', () => {
    expect(tailLength(4 * EM, EM, speech, false)).toBeCloseTo(2.2 * EM, 6);
    // A far balloon: the tip still ends 2.5 em from the mouth.
    expect(tailLength(20 * EM, EM, speech, false)).toBeCloseTo(17.5 * EM, 6);
    // Close: never nearer than tailGap (0.5 em).
    expect(tailLength(EM, EM, speech, false)).toBeCloseTo(0.5 * EM, 6);
    expect(tailLength(7 * EM, EM, speech, true)).toBe(7 * EM);
  });

  it('stops short of the speaker\'s face', () => {
    const face = { x: 120, y: 185, width: 110, height: 100 };
    const tail = buildTail(body, target, speech, { strokeWidth: 1, face })!;
    expect(pointInRect(tail.tip, face)).toBe(false);
    const free = buildTail(body, target, speech, { strokeWidth: 1 })!;
    expect(pointInRect(free.tip, face)).toBe(true);
  });

  it('runs to the border for an off-panel speaker', () => {
    const border = { x: 200, y: 400 };
    const tail = buildTail(body, border, speech, { strokeWidth: 1, offPanel: true })!;
    expect(dist(tail.tip, border)).toBeLessThan(0.01);
  });

  it('draws thought bubbles, a lightning bolt and no tail', () => {
    const bubbles = buildTail(body, target, { ...speech, tail: 'bubbles' }, { strokeWidth: 1 })!;
    expect(bubbles.cmds.filter((c) => c.op === 'M')).toHaveLength(3);
    const zig = buildTail(body, target, { ...speech, tail: 'zigzag' }, { strokeWidth: 1 })!;
    expect(zig.cmds.every((c) => c.op !== 'C')).toBe(true);
    expect(buildTail(body, target, { ...speech, tail: 'none' }, { strokeWidth: 1 })).toBeUndefined();
    // A target inside the body has no tail.
    expect(buildTail(body, body.centre, speech, { strokeWidth: 1 })).toBeUndefined();
  });

  it('joins two bodies with a neck that starts inside both', () => {
    const other = translateBody(buildBody(INK, EM, speech, 'u'), 260, 190);
    const neck = buildNeck(body, other, 1);
    expect(isClosed(pathData(neck))).toBe(true);
    const start = neck[0]!.pts[0]!;
    expect(pointInConvex(start, body.core)).toBe(true);
  });
});
