import { describe, expect, it } from 'vitest';
import { comicArtPointToPage, type VDTComicBalloon, type VDTComicPage, type VDTComicPanel } from 'postext';
import { comicHitAt } from './comicHit';
import {
  balloonAt,
  balloonDropIssues,
  balloonEm,
  balloonKeepOut,
  ellipseExit,
  pageToTailTarget,
  tailTargetNow,
  tailTipAt,
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

describe('tail tips (#580)', () => {
  const a = balloon('a', 0, 1, { x: 150, y: 220, width: 100, height: 60 }, { tailTip: { x: 200, y: 330 } });
  const b = balloon('b', 1, 2, { x: 300, y: 220, width: 100, height: 60 }, { tailTip: { x: 340, y: 335 } });
  const comic = { balloons: [a, b], panels: [panel()], splitters: [] } as unknown as VDTComicPage;

  it('finds the nearest tip within the reach', () => {
    expect(tailTipAt(comic, 203, 328, 7)).toBe(a);
    expect(tailTipAt(comic, 336, 338, 7)).toBe(b);
    expect(tailTipAt(comic, 260, 330, 7)).toBeNull();
  });

  it('puts a tip before the balloon and the panel under it', () => {
    const hit = comicHitAt([comic], 201, 331, { band: 8, tipRadius: 7 });
    expect(hit).toMatchObject({ kind: 'tail', balloon: a });
    // Without a reach, the panel is all there is there.
    expect(comicHitAt([comic], 201, 331, { band: 8 })?.kind).toBe('panel');
    expect(comicHitAt([comic], 200, 250, { band: 8, tipRadius: 7 })).toMatchObject({ kind: 'balloon', balloon: a });
  });

  it('looks in every comic of the page, the later ones first', () => {
    const strip = { balloons: [], panels: [{ ...panel(), index: 0, polygon: [{ x: 0, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 700 }, { x: 0, y: 700 }], bbox: { x: 0, y: 600, width: 600, height: 100 } }], splitters: [] } as unknown as VDTComicPage;
    expect(comicHitAt([comic, strip], 50, 650, { band: 8 })).toMatchObject({ kind: 'panel', comic: strip });
    expect(comicHitAt([comic, strip], 200, 250, { band: 8 })).toMatchObject({ kind: 'balloon', comic });
  });

  it('writes a target in fractions of the cropped and mirrored picture, kept on it', () => {
    for (const mirrored of [false, true]) {
      const p = panel(mirrored);
      const to = pageToTailTarget(p, { x: 300, y: 350 });
      const back = pinToPage(p, to);
      expect(back.x).toBeCloseTo(300, 0);
      expect(back.y).toBeCloseTo(350, 0);
      // Beyond the picture: held at its edge.
      const far = pageToTailTarget(p, { x: 2000, y: -50 });
      expect(far).toEqual({ x: mirrored ? 0 : 1, y: 0 });
    }
    // A panel without art: fractions of the cell.
    expect(pageToTailTarget(panel(false, false), { x: 300, y: 350 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('aims from the written target, else the speaker\'s mouth, else the tip', () => {
    const p = panel(true);
    const tip = { x: 1, y: 2 };
    expect(tailTargetNow(p, tip, { x: 0.25, y: 0.5 })).toEqual(pinToPage(p, { x: 0.25, y: 0.5 }));
    expect(tailTargetNow(p, tip, undefined, { x: 0.25, y: 0.5 })).toEqual(comicArtPointToPage(p.art!, 0.25, 0.5));
    expect(tailTargetNow(panel(false, false), tip, undefined, { x: 0.25, y: 0.5 })).toBe(tip);
  });

  it('starts the preview line on the balloon\'s edge', () => {
    const box = { x: 0, y: 0, width: 200, height: 100 };
    expect(ellipseExit(box, { x: 300, y: 50 })).toEqual({ x: 200, y: 50 });
    expect(ellipseExit(box, { x: 100, y: 400 })).toEqual({ x: 100, y: 100 });
    // Inside the body: the point itself.
    expect(ellipseExit(box, { x: 110, y: 50 })).toEqual({ x: 110, y: 50 });
  });
});

describe('where a dragged balloon would land (#580)', () => {
  const p = panel();
  const face = { x: 0.4, y: 0.4, width: 0.2, height: 0.3 };
  const resource = {
    anchors: [{ id: 'ana', x: 0.5, y: 0.6, face }, { id: 'ben', x: 0.85, y: 0.8 }, { id: 'sfx', x: 0.1, y: 0.1 }],
    avoid: [{ x: 0, y: 0.85, width: 1, height: 0.15 }],
  };
  const zones = balloonKeepOut(p, resource, 10);
  const b = balloon('a', 0, 1, { x: 120, y: 210, width: 80, height: 40 });

  it('maps the faces, a guard for an anchor without one, and the avoid zones', () => {
    expect(zones.faces).toHaveLength(2);
    const onPage = comicArtPointToPage(p.art!, 0.4, 0.4);
    expect(zones.faces[0]!.x).toBeCloseTo(onPage.x, 6);
    const mouth = comicArtPointToPage(p.art!, 0.85, 0.8);
    const g = zones.faces[1]!;
    for (const [k, v] of Object.entries({ x: mouth.x - 16, y: mouth.y - 26, width: 32, height: 33 })) expect(g[k as keyof typeof g]).toBeCloseTo(v, 6);
    expect(zones.avoid).toHaveLength(1);
    expect(balloonKeepOut(panel(false, false), resource, 10)).toEqual({ faces: [], avoid: [] });
  });

  it('flags a ghost over a face, over an avoid zone, or out of the panel', () => {
    expect(balloonDropIssues([b], { x: 0, y: 0 }, p, zones)).toEqual({ face: false, avoid: false, outside: false });
    const f = zones.faces[0]!;
    const onFace = { x: f.x + f.width / 2 - 160, y: f.y + f.height / 2 - 230 };
    expect(balloonDropIssues([b], onFace, p, zones).face).toBe(true);
    expect(balloonDropIssues([b], { x: 0, y: 240 }, p, zones)).toMatchObject({ avoid: true, outside: false });
    expect(balloonDropIssues([b], { x: -40, y: 0 }, p, zones).outside).toBe(true);
    // A line written with `break` may cross the border.
    expect(balloonDropIssues([b], { x: -40, y: 0 }, p, zones, { breakBorder: true }).outside).toBe(false);
    // Touching the border is not out of the panel.
    expect(balloonDropIssues([b], { x: -20, y: -10 }, p, zones).outside).toBe(false);
    // A balloon wider than its panel is flagged only when it runs out further.
    const wide = balloon('w', 0, 1, { x: 80, y: 300, width: 440, height: 40 });
    expect(balloonDropIssues([wide], { x: 0, y: 20 }, p, zones).outside).toBe(false);
    expect(balloonDropIssues([wide], { x: 30, y: 0 }, p, zones).outside).toBe(true);
  });

  it('reads the type size of the lettering', () => {
    expect(balloonEm({ text: [{ fontString: 'bold 18.5px "Comic Neue"' }] } as unknown as VDTComicBalloon)).toBe(18.5);
    expect(balloonEm({ text: [] } as unknown as VDTComicBalloon)).toBe(0);
  });
});
