// Lettering rules of the third engine round (#584), each found on a real
// page of the comic recipes where the script still carried a workaround: a
// `break` balloon keeps out of the margin, a joined pair in a narrow cell
// reads in order, a reply never stands before the line it answers, a
// balloon keeps off the other character, a strip title stays at the head
// of its panel, short CJK lines in a close-up keep off the face.

import { describe, it, expect, beforeAll } from 'vitest';
import { installStubMeasure } from './stubMeasure';
import { letterPanel, letterPanelDetailed } from '../letter';
import { presetLetteringStyles } from '../presets';
import { placeUnits, type PlaceUnit, type UnitVariant } from '../placement';
import { buildBody } from '../shapes';
import type { LetteringAnchor, LetteringItem, LetteringPanel, Point, Rect } from '../types';

beforeAll(() => installStubMeasure());

const EM = 12;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const corners = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const overlap = (a: Rect, b: Rect) => overlapArea(a, b) > 0;
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r: Rect, of: Rect, slack = 0.5) => r.x >= of.x - slack && r.y >= of.y - slack && r.x + r.width <= of.x + of.width + slack && r.y + r.height <= of.y + of.height + slack;

const en = presetLetteringStyles({ fontSizePx: EM, locale: 'en', fontFamily: 'Test' });
const ja = presetLetteringStyles({ fontSizePx: EM, locale: 'ja', fontFamily: 'Test' });

function panel(cell: Rect, extra: Partial<LetteringPanel> = {}): LetteringPanel {
  return { index: 0, polygon: corners(cell), bbox: cell, insetPx: 6, direction: 'ltr', writingMode: 'horizontal', locale: 'en', anchors: [], dpi: 96, ...extra };
}

const item = (id: string, order: number, speaker: string | undefined, text: LetteringItem['text'], style = en.speech!, extra: Partial<LetteringItem> = {}): LetteringItem => ({
  id, order, kind: 'balloon', ...(speaker ? { speaker } : {}), text, sourceStart: order * 100, sourceEnd: order * 100 + 10, style, ...extra,
});

/** A face and what the layout derives from it (see `headGuards`,
 *  `bodyZones` in layoutPage.ts): the guard over the hair as an avoid
 *  zone, the figure under it as a soft zone of its owner. */
function figure(id: string, face: Rect, mouth: Point) {
  return {
    anchor: { id, mouth, face, visible: true } as LetteringAnchor,
    guard: { ...rect(face.x - 0.2 * face.width, face.y - 0.4 * face.height, 1.4 * face.width, 1.4 * face.height), guard: true },
    body: { ...rect(face.x - 0.3 * face.width, face.y + face.height, 1.6 * face.width, 2 * face.height), weight: 1.5, owner: id },
  };
}

describe('a `break` balloon left to the engine', () => {
  // Nº150's last panel, the cheering student, in the bottom left corner of
  // the live area: the margin left of it and below it, the panels above
  // and to the right (its slanted right edge).
  const trim = rect(-41, -49, 476, 677);
  const limit = rect(0, 0, 394, 573);
  const CELL: Point[] = [{ x: 138.6, y: 572.7 }, { x: 0, y: 572.7 }, { x: 0, y: 442.9 }, { x: 159.4, y: 442.9 }];
  const neighbours = [rect(0, 0, 394, 130), rect(0, 145, 394, 88), rect(185, 248, 210, 180), rect(0, 248, 229, 180), rect(147, 443, 248, 130)];
  const sora = figure('sora', rect(63.6, 493.3, 35.3, 39.7), { x: 81.3, y: 521 });
  const avoid = [rect(12.6, 445.4, 18.9, 20.2), rect(102, 502.7, 15.8, 23.9), sora.guard];
  const cell = (polygon: Point[], extra: Partial<LetteringPanel> = {}): LetteringPanel => ({
    ...panel(rect(0, 442.9, 159.4, 129.8), { polygon, limit, trim, sheet: trim, neighbours, anchors: [sora.anchor], avoid, softAvoid: [sora.body] }), ...extra,
  });
  const shout = (extra: Partial<LetteringItem> = {}) => item('s', 0, 'sora', '¡¡Lo ha conseguido!!', en.shout!, { breakBorder: true, sizeScale: 0.8, ...extra });

  it('crosses into the gutter and the next panel, never into the margin', () => {
    const { balloons, diagnostics } = letterPanelDetailed(cell(CELL), [shout()]);
    const b = balloons[0]!.bbox;
    expect(diagnostics).toEqual([]);
    expect(inside(b, limit, 1)).toBe(true);
  });

  it('may run off the live area when its panel bleeds', () => {
    // The same panel bled off the foot of the page.
    const bled = CELL.map((q) => (q.y > 500 ? { x: q.x, y: q.y + 40 } : q));
    const { diagnostics } = letterPanelDetailed(cell(bled, { bbox: rect(0, 442.9, 159.4, 169.8) }), [shout()]);
    expect(diagnostics).toEqual([]);
  });
});

describe('a joined pair in a narrow cell', () => {
  // Nº144 plan C: the keeper in a cell a fifth of the page wide, the
  // lighthouse and Maya's panels either side, the live area's margin above.
  const CELL = rect(0, 0, 109.4, 280.8);
  const limit = rect(-189.4, 0, 612, 965.5);
  const neighbours = [rect(-190, 0, 177, 280.8), rect(122.4, 0, 299.5, 280.8), rect(272, 140, 138, 130), rect(-190, 298, 612, 667)];
  const lines = [
    item('a', 0, 'tomas', 'Llegas justo a tiempo. La radio se ha quedado sorda,'),
    item('b', 1, 'tomas', 'y viene tormenta.'),
  ];

  it('reads in order, never sets the second balloon beside the first against the reading', () => {
    // A low strip cell, the speaker at its end: side by side is the only
    // way the pair fits, and the second goes after the first or not at all.
    const STRIP = rect(0, 0, 420, 95);
    const s = { id: 'tomas', mouth: { x: 395, y: 80 }, visible: true };
    const { balloons } = letterPanelDetailed(panel(STRIP, { anchors: [s] }), [
      item('a', 0, 'tomas', 'Just in time, the radio is gone deaf,'),
      item('b', 1, 'tomas', 'and a storm is coming.'),
    ]);
    const [a, b] = [balloons[0]!.bbox, balloons[1]!.bbox];
    expect(balloons[0]!.group).toBe(balloons[1]!.group);
    expect(centre(b).x).toBeGreaterThanOrEqual(centre(a).x - 0.25 * a.width);
  });

  it('fits a cell it can stack in with each balloon fitted to the width alike', () => {
    // His face low in the cell: room above it for the pair, stacked.
    const low = figure('tomas', rect(18, 200, 44.6, 50.4), { x: 33.8, y: 233 });
    const { balloons, diagnostics } = letterPanelDetailed(panel(CELL, { limit, trim: limit, neighbours, anchors: [low.anchor], avoid: [low.guard], softAvoid: [low.body] }), lines);
    expect(diagnostics).toEqual([]);
    expect(centre(balloons[1]!.bbox).y).toBeGreaterThan(centre(balloons[0]!.bbox).y);
  });
});

describe('a reply after the line it answers', () => {
  it('lets the first balloon touch the hair above its speaker rather than set the reply before it', () => {
    // Nº152 t2: Lola (right) speaks first, her grandfather (left) answers;
    // their heads all but touch the top of the panel.
    const CELL = rect(0, 0, 278, 222);
    const paco = figure('paco', rect(60.3, 15.2, 48.1, 53.6), { x: 85.3, y: 57.2 });
    const lola = figure('lola', rect(167.1, 76, 48.1, 48.1), { x: 195.1, y: 108 });
    const out = letterPanel(panel(CELL, { anchors: [paco.anchor, lola.anchor], avoid: [paco.guard, lola.guard], softAvoid: [paco.body, lola.body] }), [
      item('l', 0, 'lola', 'Hurry up, Grandpa!'),
      item('p', 1, 'paco', 'The oranges aren\'t going anywhere, Lola.'),
      { id: 'c', order: 2, kind: 'caption', text: 'Grandpa had been a baker for forty years. He walked slowly out of habit.', sourceStart: 200, sourceEnd: 210, style: { ...en.caption!, position: 'bottom-start' } },
    ]);
    const [l, p] = [out[0]!.bbox, out[1]!.bbox];
    // The reply (left of the line) starts below it.
    expect(p.y).toBeGreaterThanOrEqual(l.y + l.height - 0.25 * EM - 0.5);
  });
});

describe('a reply in a strip cell', () => {
  // Nº146's first strip panel: the penguin (left, low) asks, the walrus
  // (right, high) answers. The only room for the line in reading order is
  // above the penguin's head, touching the top of his hair, and the reply
  // placed alone takes that room first: the line has to move there once
  // the reply stands by the walrus.
  const CELL = rect(0, 0, 295, 304);
  const pip = figure('pip', rect(31, 134, 67, 61), { x: 80, y: 176 });
  const otto = figure('otto', rect(168, 70, 73, 67), { x: 201, y: 113 });
  for (const direction of ['ltr', 'rtl'] as const) {
    it(`sets the line above the penguin and the reply after it (${direction})`, () => {
      const { balloons } = letterPanelDetailed(panel(CELL, { direction, anchors: [pip.anchor, otto.anchor], avoid: [pip.guard, otto.guard], softAvoid: [pip.body, otto.body] }), [
        item('p', 0, 'pip', 'Good morning, dear Otto! One big warm croissant and two rolls, please.'),
        item('o', 1, 'otto', 'Coming up!'),
      ]);
      const [a, b] = [balloons[0]!.bbox, balloons[1]!.bbox];
      // The reply below the line, or ahead of it in the reading direction
      // and no higher than its top.
      const ahead = (centre(b).x - centre(a).x) * (direction === 'rtl' ? -1 : 1) > 0;
      expect(b.y).toBeGreaterThanOrEqual((ahead ? a.y : a.y + a.height) - 0.25 * EM - 0.5);
    });
  }
});

describe('balloons and the other character', () => {
  it('sets a speaker\'s balloons over his own side, not over the one he speaks to (right to left)', () => {
    // Nº149's charm panel with Sora (left) speaking first on a page read
    // right to left: no room above the heads.
    const CELL = rect(0, 0, 330, 300);
    const sora = figure('sora', rect(50, 45, 52, 63), { x: 81, y: 96 });
    const hana = figure('hana', rect(220, 45, 52, 63), { x: 246, y: 96 });
    const out = letterPanel(panel(CELL, { direction: 'rtl', anchors: [sora.anchor, hana.anchor], avoid: [sora.guard, hana.guard], softAvoid: [sora.body, hana.body] }), [
      item('s1', 0, 'sora', 'S-sorry! It is a charm from my grandma\'s shrine.'),
      item('s2', 1, 'sora', 'Take it tomorrow.'),
      item('h', 2, 'hana', '…Aizawa?'),
    ]);
    for (const b of out.filter((x) => x.speaker === 'sora')) expect(overlapArea(b.bbox, hana.body)).toBeLessThan(0.15 * b.bbox.width * b.bbox.height);
  });

  it('keeps off two figures that touch (a hug), the speaker\'s own included', () => {
    // Nº154's reunion: the girl's arms around her grandfather's neck, his
    // mouth over the hug, the market far on either side; his line goes over
    // the market.
    const CELL = rect(0, 0, 700, 300);
    const lola = { ...rect(150, 0, 180, 300), weight: 1.5, owner: 'lola' };
    const paco = { ...rect(280, 0, 180, 300), weight: 1.5, owner: 'paco' };
    const mouth = { x: 340, y: 60 };
    const body = buildBody([{ x: -40, y: -25, width: 80, height: 50 }], EM, en.speech!, 'u');
    const variant: UnitVariant = { bodies: [body], reshaped: false, bbox: body.bbox, samples: [...body.core, body.centre], rim: body.hull };
    const unit: PlaceUnit = { id: 'u', order: 0, kind: 'balloon', variants: [variant], target: { kind: 'point', point: mouth }, speaker: 'paco', sourceStart: 0, sourceEnd: 1, em: EM };
    const faces = [rect(240, 6, 70, 70), rect(310, 6, 70, 70)];
    const { placed } = placeUnits(panel(CELL, {
      anchors: [{ id: 'lola', mouth: { x: 270, y: 60 }, face: faces[0]!, visible: true }, { id: 'paco', mouth, face: faces[1]!, visible: true }],
      softAvoid: [lola, paco],
    }), [unit]);
    const box = { ...variant.bbox, x: variant.bbox.x + placed[0]!.at.x, y: variant.bbox.y + placed[0]!.at.y };
    expect(overlap(box, paco)).toBe(false);
    expect(overlap(box, lola)).toBe(false);
  });
});

describe('a strip title', () => {
  it('stays at the head of its panel, between two heads, before it goes to the foot', () => {
    // Nº151's second strip: both top corners and the middle hold a head.
    const CELL = rect(0, 0, 330, 250);
    const boy = figure('boy', rect(50, 30, 72, 67), { x: 90, y: 80 });
    const girl = figure('girl', rect(222, 25, 62, 64), { x: 253, y: 75 });
    const out = letterPanel(panel(CELL, { anchors: [boy.anchor, girl.anchor], avoid: [boy.guard, girl.guard] }), [
      { id: 't', order: 0, kind: 'caption', text: 'Therapy', sourceStart: 0, sourceEnd: 7, style: en.caption! },
    ]);
    const t = out[0]!.bbox;
    expect(t.y).toBeLessThan(CELL.y + 8);
    expect(overlap(t, boy.guard)).toBe(false);
    expect(overlap(t, girl.guard)).toBe(false);
  });
});

describe('a caption at the foot of a panel', () => {
  it('stays at the foot its keyword names, alone in its panel', () => {
    const CELL = rect(0, 0, 278, 222);
    for (const position of ['bottom-start', 'bottom', 'bottom-end'] as const) {
      const [c] = letterPanel(panel(CELL), [{ id: 'c', order: 0, kind: 'caption', text: 'Grandpa had been a baker.', sourceStart: 0, sourceEnd: 5, style: en.caption!, position }]);
      expect(c!.bbox.y + c!.bbox.height).toBeGreaterThan(CELL.height - 1);
    }
  });
});

describe('short CJK lines in a close shot', () => {
  it('sets a column too long for the room above the face in more, shorter columns', () => {
    // Nº144 plan A, Japanese: Maya's head fills the cell.
    const CELL = rect(0, 0, 254, 330);
    const maya = figure('maya', rect(20, 40, 214, 190), { x: 127, y: 200 });
    const { balloons, diagnostics } = letterPanelDetailed(
      panel(CELL, { locale: 'ja', writingMode: 'vertical', direction: 'rtl', anchors: [maya.anchor], avoid: [maya.guard], softAvoid: [maya.body] }),
      [item('m', 0, 'maya', 'おじいちゃん……原因、見つけたかも。', ja.speech!)],
    );
    expect(diagnostics).toEqual([]);
    expect(inside(centre(balloons[0]!.bbox) as unknown as Rect, rect(20, 40, 214, 190))).toBe(false);
  });

  it('may cover a top corner of a close-up face\'s box, which is hair, not face', () => {
    // A close-up whose face box fills all but the corners of the cell: a
    // small balloon fits in a top corner, outside the oval of the face.
    const CELL = rect(0, 0, 400, 400);
    const face = rect(10, 10, 380, 380);
    const body = buildBody([{ x: -10, y: -10, width: 20, height: 20 }], EM, en.speech!, 'u');
    const variant: UnitVariant = { bodies: [body], reshaped: false, bbox: body.bbox, samples: [...body.core, body.centre], rim: body.hull };
    const mouth = { x: 200, y: 300 };
    const unit: PlaceUnit = { id: 'u', order: 0, kind: 'balloon', variants: [variant], target: { kind: 'point', point: mouth }, sourceStart: 0, sourceEnd: 1, em: EM };
    const { placed, diagnostics } = placeUnits(panel(CELL, { anchors: [{ id: 'k', mouth, face, visible: true }] }), [unit]);
    expect(diagnostics).toEqual([]);
    // In a top corner of the box (the bottom ones are cheek and jaw).
    const at = placed[0]!.at;
    expect(Math.min(at.x, 400 - at.x)).toBeLessThan(80);
    expect(at.y).toBeLessThan(80);
  });
});

describe('the last fallback', () => {
  it('covers the hair over a head before what the art marks to keep clear', () => {
    // No clean spot: the left of the strip is the guard over a head, its
    // right a hand the art marks, the middle a face; the speaker is nearer
    // the hand.
    const CELL = rect(0, 0, 300, 100);
    const body = buildBody([{ x: -20, y: -12, width: 40, height: 24 }], EM, en.speech!, 'u');
    const variant: UnitVariant = { bodies: [body], reshaped: false, bbox: body.bbox, samples: [...body.core, body.centre], rim: body.hull };
    const mouth = { x: 190, y: 90 };
    const unit: PlaceUnit = { id: 'u', order: 0, kind: 'balloon', variants: [variant], target: { kind: 'point', point: mouth }, sourceStart: 0, sourceEnd: 1, em: EM };
    const { placed } = placeUnits(panel(CELL, {
      anchors: [{ id: 'k', mouth, face: rect(105, 0, 90, 100), visible: true }],
      avoid: [{ ...rect(0, 0, 105, 100), guard: true }, rect(195, 0, 105, 100)],
    }), [unit]);
    expect(placed[0]!.at.x).toBeLessThan(105);
  });
});
