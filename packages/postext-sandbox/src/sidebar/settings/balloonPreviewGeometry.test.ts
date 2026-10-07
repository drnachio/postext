import { describe, expect, it } from 'vitest';
import type { ComicBalloonShape, ComicBalloonTail } from 'postext';
import { balloonPreviewGeometry, dimensionToPx, estimateTextWidth, type BalloonPreviewInput } from './balloonPreviewGeometry';

const base: BalloonPreviewInput = {
  shape: 'oval',
  tail: 'curved',
  roundness: 2.2,
  burstPoints: 14,
  burstDepth: 0.22,
  wobble: 0,
  padding: 6,
  tailWidth: 10,
  tailReach: 0.55,
  textWidth: 60,
  textHeight: 28,
};

describe('balloon preview geometry', () => {
  it('draws a body around the text block for every shape, none for no balloon', () => {
    const shapes: ComicBalloonShape[] = ['oval', 'rounded', 'rectangle', 'cloud', 'burst', 'wavy', 'electric'];
    for (const shape of shapes) {
      const g = balloonPreviewGeometry({ ...base, shape });
      expect(g.body, shape).toMatch(/^M/);
      // The text block and its air fit inside the bounds.
      expect(g.bounds.width, shape).toBeGreaterThanOrEqual(base.textWidth + base.padding * 2 - 0.01);
      expect(g.bounds.height, shape).toBeGreaterThanOrEqual(base.textHeight + base.padding * 2 - 0.01);
    }
    const none = balloonPreviewGeometry({ ...base, shape: 'none' });
    expect(none.body).toBeUndefined();
    expect(none.tail).toBeUndefined();
  });

  it('draws each tail kind below the body', () => {
    const tails: ComicBalloonTail[] = ['curved', 'wedge', 'zigzag'];
    for (const tail of tails) {
      const g = balloonPreviewGeometry({ ...base, tail });
      expect(g.tail, tail).toMatch(/^M.*Z$/);
    }
    const bubbles = balloonPreviewGeometry({ ...base, tail: 'bubbles' });
    expect(bubbles.tail).toBeUndefined();
    expect(bubbles.bubbles).toHaveLength(3);
    expect(bubbles.bubbles[0]!.r).toBeGreaterThan(bubbles.bubbles[2]!.r);
    expect(bubbles.bubbles.every((b) => b.cy > 0)).toBe(true);
    expect(balloonPreviewGeometry({ ...base, tail: 'none' }).tail).toBeUndefined();
    // A longer reach takes the tail further down.
    const short = balloonPreviewGeometry({ ...base, tail: 'wedge', tailReach: 0.2 });
    const long = balloonPreviewGeometry({ ...base, tail: 'wedge', tailReach: 0.9 });
    expect(long.bounds.height).toBeGreaterThan(short.bounds.height);
  });

  it('is deterministic, with a burst of the asked number of spikes', () => {
    expect(balloonPreviewGeometry({ ...base, shape: 'burst', wobble: 0.5 })).toEqual(balloonPreviewGeometry({ ...base, shape: 'burst', wobble: 0.5 }));
    const burst = balloonPreviewGeometry({ ...base, shape: 'burst', burstPoints: 9 });
    expect(burst.body!.split('L')).toHaveLength(18);
  });

  it('converts dimensions and estimates text widths', () => {
    expect(dimensionToPx({ value: 2, unit: 'pt' }, 1.5, 12)).toBe(3);
    expect(dimensionToPx({ value: 0.5, unit: 'em' }, 1.5, 12)).toBe(6);
    expect(dimensionToPx({ value: 25.4, unit: 'mm' }, 1, 12)).toBeCloseTo(72);
    expect(estimateTextWidth('漢字', 10)).toBe(20);
    expect(estimateTextWidth('ab', 10)).toBeCloseTo(10.8);
  });
});
