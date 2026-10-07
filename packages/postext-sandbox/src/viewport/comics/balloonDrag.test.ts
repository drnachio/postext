import { describe, expect, it } from 'vitest';
import { comicArtPointToPage, type VDTComicBalloon, type VDTComicPage, type VDTComicPanel } from 'postext';
import {
  balloonAt,
  balloonGhost,
  balloonGrabCentre,
  balloonGroup,
  dragBalloon,
  flattenPath,
  groupBox,
  nudgeDelta,
  pageToPin,
  pinAfterMove,
  pinToPage,
  roundPin,
} from './balloonDrag';

// A panel whose picture is cropped: the cell shows the middle of a wider
// picture (the art box runs past the cell on both sides).
const cell = { x: 100, y: 200, width: 400, height: 300 };
const art = (mirrored: boolean): NonNullable<VDTComicPanel['art']> => ({
  resourceId: 'room',
  kind: 'bitmap',
  fileId: 'f',
  box: { x: 20, y: 200, width: 480 * 1.2, height: 300 },
  source: { x: 0.1, y: 0, width: 0.8, height: 1 },
  mirrored,
  letterbox: false,
});
const panel = (mirrored = false, withArt = true): VDTComicPanel => ({
  index: 0,
  sourceStart: 0,
  sourceEnd: 0,
  polygon: [{ x: 100, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 500 }, { x: 100, y: 500 }],
  bbox: cell,
  radius: 0,
  border: { width: 1, color: '#000', style: 'solid' },
  ...(withArt ? { art: art(mirrored) } : {}),
});

const balloon = (id: string, order: number, group: number, bbox: VDTComicBalloon['bbox'], extra: Partial<VDTComicBalloon> = {}): VDTComicBalloon => ({
  id,
  panelIndex: 0,
  order,
  kind: 'balloon',
  style: 'speech',
  sourceStart: order * 10,
  sourceEnd: order * 10 + 5,
  group,
  text: [],
  bbox,
  ...extra,
});

describe('page point ↔ pin (#571)', () => {
  it('reads a point in fractions of the cropped picture, the inverse of the engine', () => {
    for (const mirrored of [false, true]) {
      const p = panel(mirrored);
      for (const at of [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.91, y: 0.05 }]) {
        const onPage = comicArtPointToPage(p.art!, at.x, at.y);
        expect(pinToPage(p, at)).toEqual(onPage);
        const back = pageToPin(p, onPage);
        expect(back.x).toBeCloseTo(at.x, 9);
        expect(back.y).toBeCloseTo(at.y, 9);
      }
    }
  });

  it('flips x on mirrored art', () => {
    const left = { x: 40, y: 350 };
    expect(pageToPin(panel(false), left).x).toBeLessThan(0.1);
    expect(pageToPin(panel(true), left).x).toBeGreaterThan(0.9);
    expect(pageToPin(panel(true), left).y).toBeCloseTo(0.5, 9);
  });

  it('uses the cell for a panel without art', () => {
    const p = panel(false, false);
    expect(pageToPin(p, { x: 300, y: 350 })).toEqual({ x: 0.5, y: 0.5 });
    expect(pinToPage(p, { x: 0.25, y: 1 })).toEqual({ x: 200, y: 500 });
  });

  it('rounds to a tenth of a percent', () => {
    expect(roundPin({ x: 0.123456, y: 0.98765 })).toEqual({ x: 0.123, y: 0.988 });
  });
});

describe('dragging a balloon (#571)', () => {
  const centre = { x: 300, y: 300 };
  it('moves with the pointer and keeps its centre inside the panel', () => {
    expect(dragBalloon(centre, { x: 0, y: 0 }, { x: 40, y: -30 }, cell)).toEqual({ x: 40, y: -30 });
    expect(dragBalloon(centre, { x: 0, y: 0 }, { x: 900, y: 900 }, cell)).toEqual({ x: 200, y: 200 });
  });

  it('keeps the whole group inside the panel when it fits, else its centre', () => {
    const box = { x: 260, y: 280, width: 80, height: 40 };
    expect(dragBalloon(centre, { x: 0, y: 0 }, { x: -500, y: 500 }, cell, { box })).toEqual({ x: -160, y: 180 });
    const wide = { x: 50, y: 280, width: 500, height: 40 };
    expect(dragBalloon(centre, { x: 0, y: 0 }, { x: -500, y: 0 }, cell, { box: wide })).toEqual({ x: -200, y: 0 });
  });

  it('keeps to one axis with Shift', () => {
    expect(dragBalloon(centre, { x: 0, y: 0 }, { x: 40, y: -30 }, cell, { axisLock: true })).toEqual({ x: 40, y: 0 });
    expect(dragBalloon(centre, { x: 0, y: 0 }, { x: 10, y: -30 }, cell, { axisLock: true })).toEqual({ x: 0, y: -30 });
  });

  it('writes the moved centre as a pin of the picture, mirrored or not', () => {
    const p = panel(false);
    const at = pinAfterMove(p, centre, { x: 57.6, y: 0 });
    expect(at.x).toBeCloseTo(pageToPin(p, centre).x + 0.1, 3);
    const m = panel(true);
    expect(pinAfterMove(m, centre, { x: 57.6, y: 0 }).x).toBeCloseTo(pageToPin(m, centre).x - 0.1, 3);
  });

  it('starts from the written pin when the line has one', () => {
    const p = panel(false);
    const b = balloon('a', 0, 0, { x: 280, y: 280, width: 40, height: 30 });
    expect(balloonGrabCentre(p, b)).toEqual({ x: 300, y: 295 });
    expect(balloonGrabCentre(p, b, { x: 0.5, y: 0.5 })).toEqual(pinToPage(p, { x: 0.5, y: 0.5 }));
    // A drag of nothing writes the same pin back.
    expect(pinAfterMove(p, balloonGrabCentre(p, b, { x: 0.25, y: 0.4 }), { x: 0, y: 0 })).toEqual({ x: 0.25, y: 0.4 });
  });

  it('nudges by a percent of the picture, rightwards on the page whatever the mirroring', () => {
    expect(nudgeDelta(panel(false), { x: 1, y: 0 }, 1)).toEqual({ x: 5.76, y: 0 });
    expect(nudgeDelta(panel(true), { x: 1, y: 0 }, 1)).toEqual({ x: 5.76, y: 0 });
    expect(nudgeDelta(panel(false, false), { x: 0, y: -1 }, 5)).toEqual({ x: 0, y: -15 });
  });
});

describe('balloons under the pointer (#571)', () => {
  const a = balloon('0:0', 0, 7, { x: 120, y: 220, width: 100, height: 50 }, { shape: { d: 'M120 220L220 220L220 270L120 270Z', strokeWidth: 1 } });
  const b = balloon('0:1', 1, 7, { x: 140, y: 260, width: 120, height: 50 });
  const sfx = balloon('0:2', 2, 8, { x: 150, y: 240, width: 80, height: 20 }, { kind: 'sfx', style: 'sfx', rotate: 90 });
  const comic = { balloons: [a, b, sfx], panels: [panel()] } as unknown as VDTComicPage;

  it('finds the one on top, sound effects over balloons, turned with their rotation', () => {
    // The sound effect stands upright (rotated a quarter turn): it covers
    // x 180–200, y 210–290.
    expect(balloonAt(comic, 190, 280)?.id).toBe('0:2');
    expect(balloonAt(comic, 160, 245)?.id).toBe('0:0');
    expect(balloonAt(comic, 250, 300)?.id).toBe('0:1');
    expect(balloonAt(comic, 400, 400)).toBeNull();
  });

  it('moves a joined group together, its first balloon leading', () => {
    expect(balloonGroup(comic, b).map((x) => x.id)).toEqual(['0:0', '0:1']);
    expect(balloonGroup(comic, sfx).map((x) => x.id)).toEqual(['0:2']);
    expect(groupBox([a, b])).toEqual({ x: 120, y: 220, width: 140, height: 90 });
  });

  it('draws the ghost from the outline, moved', () => {
    const ghost = balloonGhost([a, b], { x: 10, y: 5 });
    expect(ghost).toHaveLength(1);
    expect(ghost[0]![0]).toEqual({ x: 130, y: 225 });
    const turned = balloonGhost([sfx], { x: 0, y: 0 })[0]!;
    expect(turned[0]!.x).toBeCloseTo(200, 6);
    expect(turned[0]!.y).toBeCloseTo(210, 6);
  });

  it('flattens curves into polygons', () => {
    const polys = flattenPath('M0 0C0 10 10 10 10 0Z M20 20L30 20L30 30Z', 4);
    expect(polys).toHaveLength(2);
    expect(polys[0]).toHaveLength(5);
    expect(polys[0]![4]).toEqual({ x: 10, y: 0 });
    expect(polys[0]![2]!.y).toBeCloseTo(7.5, 9);
    expect(polys[1]).toEqual([{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }]);
  });
});
