import { describe, it, expect } from 'vitest';
import type { VDTComicBalloon } from 'postext';
import { fromBalloonFrame, onBalloon, toBalloonFrame } from './balloonDrag';

const balloon = (extra: Partial<VDTComicBalloon>): VDTComicBalloon => ({
  id: 's', panelIndex: 0, order: 0, kind: 'sfx', style: 'plate', sourceStart: 0, sourceEnd: 1, group: 0,
  text: [], bbox: { x: 100, y: 100, width: 100, height: 40 }, ...extra,
});

describe('hits on a leaned and turned balloon', () => {
  it('round-trips points through the balloon frame', () => {
    const b = balloon({ rotate: -11, skew: -8 });
    for (const p of [{ x: 100, y: 100 }, { x: 190, y: 130 }, { x: 150, y: 120 }]) {
      const q = toBalloonFrame(b, fromBalloonFrame(b, p));
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });

  it('follows the lean: the leaned top corner hits, the unleaned one misses', () => {
    const b = balloon({ skew: 45 });
    // The top edge moves 20 px forward (half the height times tan 45°).
    expect(onBalloon(b, 215, 101)).toBe(true);
    expect(onBalloon(b, 105, 101)).toBe(false);
    // The bottom edge moves 20 px back.
    expect(onBalloon(b, 85, 139)).toBe(true);
  });
});
