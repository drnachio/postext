// Lettering rules of the second engine round (#581), each found on a real
// page of the comic recipes or the Pepper&Carrot showcase: a border broken
// on purpose is not an overflow, nothing runs off the sheet, off-panel
// voices come with short tails, the spine of a spread stays clear.

import { describe, it, expect, beforeAll } from 'vitest';
import { installStubMeasure } from './stubMeasure';
import { letterPanel, letterPanelDetailed } from '../letter';
import { presetLetteringStyles } from '../presets';
import { dist } from '../geom';
import type { LetteringItem, LetteringPanel, Point, Rect } from '../types';

beforeAll(() => installStubMeasure());

const EM = 12;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const corners = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r: Rect, of: Rect, slack = 0.5) => r.x >= of.x - slack && r.y >= of.y - slack && r.x + r.width <= of.x + of.width + slack && r.y + r.height <= of.y + of.height + slack;

const en = presetLetteringStyles({ fontSizePx: EM, locale: 'en', fontFamily: 'Test' });

function panel(cell: Rect, extra: Partial<LetteringPanel> = {}): LetteringPanel {
  return { index: 0, polygon: corners(cell), bbox: cell, insetPx: 6, direction: 'ltr', writingMode: 'horizontal', locale: 'en', anchors: [], dpi: 96, ...extra };
}

const item = (id: string, order: number, speaker: string | undefined, text: LetteringItem['text'], style = en.speech!, extra: Partial<LetteringItem> = {}): LetteringItem => ({
  id, order, kind: 'balloon', ...(speaker ? { speaker } : {}), text, sourceStart: order * 100, sourceEnd: order * 100 + 10, style, ...extra,
});

describe('a border broken on purpose', () => {
  // A small panel at the top left of a page: the live area is inset from
  // the trim by margins; the next panel is to the right.
  const trim = rect(-60, -60, 900, 1200);
  const limit = rect(0, 0, 780, 1080);
  const CELL = rect(0, 0, 150, 110);
  const next = rect(162, 0, 300, 110);
  const big = (extra: Partial<LetteringItem>): LetteringItem => ({
    id: 's', order: 0, kind: 'sfx', text: 'KRA-KOOM', sourceStart: 0, sourceEnd: 9, style: en.sfx!, sizeScale: 1.6, rotate: 0, ...extra,
  });

  it('raises no overflow for a `break` sound effect crossing its border, and keeps it on the sheet', () => {
    const p = panel(CELL, { limit, trim, sheet: trim, neighbours: [next] });
    const { balloons, diagnostics } = letterPanelDetailed(p, [big({ breakBorder: true })]);
    expect(diagnostics).toEqual([]);
    const b = balloons[0]!.bbox;
    // It does break the border (it cannot fit the cell)…
    expect(inside(b, CELL)).toBe(false);
    // …and never leaves the trim.
    expect(inside(b, trim)).toBe(true);
  });

  it('raises no overflow for a pinned sound effect that runs over the border', () => {
    const p = panel(CELL, { limit, trim, sheet: trim, neighbours: [next] });
    const { balloons, diagnostics } = letterPanelDetailed(p, [big({ pin: { x: 140, y: 60 } })]);
    expect(diagnostics).toEqual([]);
    expect(centre(balloons[0]!.bbox).x).toBeCloseTo(140, 0);
  });

  it('raises no overflow for a pinned balloon too big for its panel, which stays on the page', () => {
    const tiny = rect(0, 0, 110, 60);
    const p = panel(tiny, { limit, trim, sheet: trim });
    const { balloons, diagnostics } = letterPanelDetailed(p, [item('b', 0, undefined, 'A line far too long for this little panel to hold.', { ...en.speech!, tail: 'none' }, { pin: { x: 55, y: 30 } })]);
    expect(diagnostics).toEqual([]);
    expect(inside(balloons[0]!.bbox, rect(trim.x + 6, trim.y + 6, trim.width - 12, trim.height - 12))).toBe(true);
  });

  it('still reports what a crossing covers (a face)', () => {
    const face = rect(110, 20, 40, 60);
    const p = panel(CELL, { limit, trim, sheet: trim, anchors: [{ id: 'k', mouth: { x: 130, y: 70 }, face, visible: true }] });
    const { diagnostics } = letterPanelDetailed(p, [big({ pin: { x: 130, y: 50 } })]);
    expect(diagnostics.map((d) => d.reasons).flat()).toContain('face');
  });

  it('never sets a balloon of a panel that bleeds past the live area', () => {
    // A panel bleeding off the top and the left of the sheet.
    const bleeding = rect(-60, -60, 400, 300);
    const p = panel(bleeding, { limit, trim, sheet: trim });
    const balloons = letterPanel(p, [
      item('c', 0, undefined, 'Ten o\'clock. The storm had found the headland.', en.caption!, { position: 'top-start' }),
      item('a', 1, 'ana', 'Did you hear that? Something on the roof.'),
    ].map((x, i) => (i === 1 ? { ...x } : x)));
    for (const b of balloons) expect(inside(b.bbox, limit)).toBe(true);
  });

  it('never lets a `break` balloon stand mostly in the next panel (yonkoma, a shout over the panel above)', () => {
    const cell = rect(0, 200, 160, 90);
    const above = rect(0, 0, 160, 188);
    const face = rect(10, 240, 70, 50);
    const p = panel(cell, { limit, trim, sheet: trim, neighbours: [above], anchors: [{ id: 'k', mouth: { x: 45, y: 265 }, face, visible: true }] });
    const { balloons, diagnostics } = letterPanelDetailed(p, [item('k', 0, 'k', 'No work at all… but so happy!!', en.shout!, { breakBorder: true })]);
    const b = balloons[0]!.bbox;
    expect(inside(b, cell)).toBe(false);
    expect(diagnostics).toEqual([]);
    expect(inside({ ...centre(face), width: 0, height: 0 }, b, 0)).toBe(false);
    const c = centre(b);
    expect(c.y).toBeGreaterThan(cell.y);
    expect(c.y).toBeLessThan(cell.y + cell.height);
  });

  it('keeps a balloon breaking out of its panel off the balloons another panel set', () => {
    const p = panel(CELL, { limit, trim, sheet: trim, neighbours: [next], foreign: [rect(162, 10, 120, 70)] });
    const { balloons, diagnostics } = letterPanelDetailed(p, [big({ breakBorder: true })]);
    expect(diagnostics).toEqual([]);
    expect(overlap(balloons[0]!.bbox, rect(162, 10, 120, 70))).toBe(false);
  });
});

describe('off-panel voices', () => {
  it('puts the balloon by the border its voice comes from, with a short tail, in a crowded panel', () => {
    // balloon-kinds, morning panel: the skipper speaks first, from below the
    // panel; three more balloons of two speakers in it.
    const CELL = rect(0, 0, 640, 520);
    const anchors = [
      { id: 'tomas', mouth: { x: 360, y: 130 }, face: rect(326, 68, 64, 88), visible: true },
      { id: 'maya', mouth: { x: 298, y: 151 }, face: rect(262, 99, 58, 73), visible: true },
    ];
    const balloons = letterPanel(panel(CELL, { anchors }), [
      item('s', 0, 'skipper', 'Thank you, keeper! I owe you a crate of mackerel!', en.speech!, { tailTarget: 'bottom' }),
      item('t1', 1, 'tomas', 'Make it two.'),
      item('t2', 2, 'tomas', 'One\'s for the cat.'),
      item('m', 3, 'maya', 'Biscuit says three.'),
    ]);
    const s = balloons.find((b) => b.id === 's')!;
    expect(s.tailTip!.y).toBeCloseTo(520, 0);
    const reach = s.tailTip!.y - (s.bbox.y + s.bbox.height);
    expect(reach).toBeLessThan(Math.max(3 * EM, 0.6 * s.bbox.height));
  });
});
