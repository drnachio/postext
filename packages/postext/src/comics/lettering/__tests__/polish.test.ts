// The lettering rules added after looking at real pages (#559–#561): tails
// that never cross, heads kept clear, ruby and directional isolates inside
// balloons, house rules for CJK spacing and orphan lines, lettering that
// never runs into another panel or off the live area, pinned labels slid
// back into their panel, off-panel balloons by their border.

import { describe, it, expect, beforeAll } from 'vitest';
import { installStubMeasure } from './stubMeasure';
import { letterPanel, letterPanelDetailed } from '../letter';
import { presetLetteringStyles } from '../presets';
import { prepareText, readLetteringText, breakPoints } from '../text';
import { shapeText } from '../shape-text';
import { dist, segmentsCross } from '../geom';
import { buildBody } from '../shapes';
import { uncrossTails, type PlaceUnit, type Placed, type UnitVariant } from '../placement';
import type { ComicBalloonOut, LetteringItem, LetteringPanel, Point, Rect } from '../types';
import type { InlineSpan } from '../../../parse/types';

beforeAll(() => installStubMeasure());

const EM = 12;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const corners = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r: Rect, of: Rect, slack = 0.5) => r.x >= of.x - slack && r.y >= of.y - slack && r.x + r.width <= of.x + of.width + slack && r.y + r.height <= of.y + of.height + slack;

const en = presetLetteringStyles({ fontSizePx: EM, locale: 'en', fontFamily: 'Test' });
const ja = presetLetteringStyles({ fontSizePx: EM, locale: 'ja', fontFamily: 'Test' });
const ar = presetLetteringStyles({ fontSizePx: EM, locale: 'ar', fontFamily: 'Test' });

function panel(cell: Rect, extra: Partial<LetteringPanel> = {}): LetteringPanel {
  return { index: 0, polygon: corners(cell), bbox: cell, insetPx: 6, direction: 'ltr', writingMode: 'horizontal', locale: 'en', anchors: [], dpi: 96, ...extra };
}

const item = (id: string, order: number, speaker: string | undefined, text: LetteringItem['text'], style = en.speech!, extra: Partial<LetteringItem> = {}): LetteringItem => ({
  id, order, kind: 'balloon', ...(speaker ? { speaker } : {}), text, sourceStart: order * 100, sourceEnd: order * 100 + 10, style, ...extra,
});

/** The drawn part of a tail: from where it leaves its balloon (on the
 *  line from the balloon's centre) to its tip. */
function tailOf(b: ComicBalloonOut): [Point, Point] | undefined {
  if (!b.tailTip) return undefined;
  const c = centre(b.bbox);
  const t = b.tailTip;
  const len = dist(c, t);
  const k = Math.min(0.95, (Math.min(b.bbox.width, b.bbox.height) / 2) / Math.max(len, 1e-6));
  return [{ x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k }, t];
}

/** A one-body unit of a `w`×`h` oval aimed at `target`. */
function unitOf(id: string, order: number, w: number, h: number, target: Point): PlaceUnit {
  const body = buildBody([{ x: -w / 2 + 6, y: -h / 2 + 6, width: w - 12, height: h - 12 }], EM, en.speech!, id);
  const variant: UnitVariant = { bodies: [body], reshaped: false, bbox: body.bbox, samples: [...body.core, body.centre], rim: body.hull };
  return { id, order, kind: 'balloon', variants: [variant], target: { kind: 'point', point: target }, sourceStart: 0, sourceEnd: 1, em: EM };
}

describe('tails never cross', () => {
  it('undoes a crossing by trading places (Kurlander routing, pairwise)', () => {
    // Two balloons placed the wrong way round: each tail runs to the far
    // speaker, across the other.
    const CELL = rect(0, 0, 600, 360);
    const p = panel(CELL);
    const a = unitOf('a', 0, 120, 60, { x: 480, y: 300 });
    const b = unitOf('b', 1, 120, 60, { x: 120, y: 300 });
    const crossed: Placed[] = [{ unit: a, variant: 0, at: { x: 120, y: 120 } }, { unit: b, variant: 0, at: { x: 480, y: 120 } }];
    const tail = (q: Placed): [Point, Point] => {
      const t = (q.unit.target as { point: Point }).point;
      return [q.at, { x: q.at.x + (t.x - q.at.x) * 0.8, y: q.at.y + (t.y - q.at.y) * 0.8 }];
    };
    expect(segmentsCross(...tail(crossed[0]!), ...tail(crossed[1]!))).toBe(true);
    const fixed = uncrossTails(p, crossed);
    expect(segmentsCross(...tail(fixed[0]!), ...tail(fixed[1]!))).toBe(false);
    // Each balloon now stands on its own speaker's side.
    expect(fixed[0]!.at.x).toBeGreaterThan(fixed[1]!.at.x);
    // A layout with no crossing is left alone.
    expect(uncrossTails(p, fixed)).toEqual(fixed);
  });

  // Speakers stand in the order opposite to the one they speak in: the
  // first speaker on the right, the second on the left, both low, so a
  // reading-order layout (first balloon at the top left) would run its
  // tail across the second one's.
  const CELL = rect(0, 0, 640, 360);
  const right = { id: 'r', mouth: { x: 520, y: 300 }, visible: true };
  const left = { id: 'l', mouth: { x: 120, y: 300 }, visible: true };
  for (const dir of ['ltr', 'rtl'] as const) {
    it(`swaps or re-places balloons whose tails would cross (${dir})`, () => {
      const out = letterPanel(panel(CELL, { anchors: [right, left], direction: dir }), [
        item('a', 0, dir === 'ltr' ? 'r' : 'l', 'You first. I insist, really.'),
        item('b', 1, dir === 'ltr' ? 'l' : 'r', 'No, after you. I insist too.'),
      ]);
      const [ta, tb] = out.map(tailOf);
      expect(ta && tb).toBeTruthy();
      expect(segmentsCross(ta![0], ta![1], tb![0], tb![1])).toBe(false);
      // Each tail still ends nearer its own speaker.
      expect(dist(out[0]!.tailTip!, (dir === 'ltr' ? right : left).mouth)).toBeLessThan(dist(out[0]!.tailTip!, (dir === 'ltr' ? left : right).mouth));
    });
  }

  it('keeps tails out of the other balloons', () => {
    const CELL2 = rect(0, 0, 600, 400);
    const a = { id: 'a', mouth: { x: 150, y: 330 }, visible: true };
    const b = { id: 'b', mouth: { x: 450, y: 330 }, visible: true };
    const out = letterPanel(panel(CELL2, { anchors: [a, b] }), [
      item('1', 0, 'a', 'Did you see where the boat went?'),
      item('2', 1, 'b', 'Out past the lighthouse.'),
      item('3', 2, 'a', 'In this weather?'),
    ]);
    for (const x of out) {
      const t = tailOf(x);
      if (!t) continue;
      for (const y of out) {
        if (y === x || y.group === x.group) continue;
        const box = { x: y.bbox.x + 0.15 * y.bbox.width, y: y.bbox.y + 0.15 * y.bbox.height, width: 0.7 * y.bbox.width, height: 0.7 * y.bbox.height };
        const steps = 20;
        for (let k = 0; k <= steps; k++) {
          const p = { x: t[0].x + ((t[1].x - t[0].x) * k) / steps, y: t[0].y + ((t[1].y - t[0].y) * k) / steps };
          expect(p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height).toBe(false);
        }
      }
    }
  });
});

describe('heads and hats kept clear', () => {
  it('keeps balloons off the region a guard marks above a face (hat, hair)', () => {
    // The layout passes a face grown upward as an avoid zone (see
    // `headGuards`); with room elsewhere, no balloon covers it.
    const CELL = rect(0, 0, 600, 360);
    const face = rect(250, 150, 100, 100);
    const hat = rect(230, 110, 140, 40);
    const out = letterPanel(panel(CELL, { anchors: [{ id: 'a', mouth: { x: 300, y: 225 }, face, visible: true }], avoid: [{ x: 230, y: 110, width: 140, height: 140 }] }), [
      item('1', 0, 'a', 'This hat has seen three storms and a wedding.'),
    ]);
    expect(overlap(out[0]!.bbox, hat)).toBe(false);
    expect(overlap(out[0]!.bbox, face)).toBe(false);
  });
});

describe('ruby and isolates inside balloons', () => {
  const rubySpans = (vertical: boolean): InlineSpan[] => [
    { text: '灯台', bold: false, italic: false, ruby: { text: 'とうだい', group: true, id: 1 } },
    { text: 'の', bold: false, italic: false },
    { text: '嵐', bold: false, italic: false, ruby: { text: 'あらし', group: true, id: 2 } },
    { text: vertical ? 'が来る' : 'が来る', bold: false, italic: false },
  ];

  it('sets the reading over its base in horizontal lines', () => {
    const p = panel(rect(0, 0, 600, 360), { locale: 'ja' });
    const [b] = letterPanel(p, [item('1', 0, undefined, rubySpans(false), { ...ja.speech!, writingMode: 'horizontal' })]);
    const [base, ...rubies] = b!.text;
    expect(base!.lines.map((l) => l.text).join('')).toBe('灯台の嵐が来る');
    expect(rubies.map((r) => r.lines[0]!.text)).toEqual(['とうだい', 'あらし']);
    for (const r of rubies) {
      // Half the size, above the line, never read twice by assistive tech.
      expect(r.fontString).toContain(`${EM / 2}px`);
      const bottom = r.bbox.y + r.bbox.height;
      expect(base!.lines.some((l) => bottom <= l.baselineY - 0.5 * EM && bottom > l.baselineY - 1.3 * EM)).toBe(true);
      expect(r.artifact).toBe(true);
    }
    // Centred over its base (灯台 starts the only line).
    const line = base!.lines[0]!;
    const baseCentre = base!.bbox.x + line.xOffset + EM; // two ems of 灯台
    expect(Math.abs(centre(rubies[0]!.bbox).x - baseCentre)).toBeLessThan(0.6 * EM);
    // The balloon holds the reading too.
    for (const r of rubies) expect(inside(r.bbox, b!.bbox, 1)).toBe(true);
  });

  it('sets the reading beside its base in columns', () => {
    const p = panel(rect(0, 0, 400, 500), { locale: 'ja', writingMode: 'vertical', direction: 'rtl' });
    const [b] = letterPanel(p, [item('1', 0, undefined, rubySpans(true), ja.speech!)]);
    const [base, ...rubies] = b!.text;
    expect(base!.vertical).toBeDefined();
    expect(rubies).toHaveLength(2);
    for (const r of rubies) {
      expect(r.vertical).toBeDefined();
      // Right of a column: past the column's centre line by half an em.
      expect(r.bbox.width).toBeLessThan(EM);
    }
    // とうだい lies right of 灯台's column, centred on it along the column.
    const first = rubies[0]!;
    expect(first.bbox.x).toBeGreaterThan(base!.bbox.x + base!.bbox.width - 1.2 * EM);
    expect(inside(first.bbox, b!.bbox, 1)).toBe(true);
  });

  it('keeps a :ltr[…] run whole inside Arabic, printing no control', () => {
    const spans: InlineSpan[] = [
      { text: 'وصلتُ على متن ', bold: false, italic: false },
      { text: 'Bus 42', bold: false, italic: false, direction: { dir: 'ltr', id: 1 } },
      { text: '!', bold: false, italic: false },
    ];
    const read = readLetteringText(spans, Array.from({ length: 21 }, (_, k) => k));
    expect(read.text).toBe('وصلتُ على متن ⁦Bus 42⁩!');
    const p = panel(rect(0, 0, 600, 360), { locale: 'ar', direction: 'rtl' });
    const [b] = letterPanel(p, [item('1', 0, undefined, spans, ar.speech!, { sourceMap: Array.from({ length: 21 }, (_, k) => k) })]);
    const t = b!.text[0]!;
    expect(t.direction).toBe('rtl');
    for (const l of t.lines) {
      expect(/[⁦-⁩]/.test(l.text)).toBe(false);
      for (const r of l.runs ?? []) expect(/[⁦-⁩]/.test(r.text)).toBe(false);
    }
    // The isolate is one left-to-right run, not reordered word by word.
    const runs = t.lines.flatMap((l) => l.runs ?? []);
    expect(runs.some((r) => !r.rtl && r.text.includes('Bus 42'))).toBe(true);
    // Click to source still maps every printed character.
    expect(t.sourceMap).toBeDefined();
    expect(t.sourceMap!.every((m) => m >= 0)).toBe(true);
  });

  it('nests isolates and closes them at the end', () => {
    const outer = { dir: 'rtl' as const, id: 1 };
    const spans: InlineSpan[] = [
      { text: 'a ', bold: false, italic: false },
      { text: 'b ', bold: false, italic: false, direction: outer },
      { text: 'c', bold: false, italic: false, direction: { dir: 'ltr', id: 2, outer } },
    ];
    expect(readLetteringText(spans, undefined).text).toBe('a ⁧b ⁦c⁩⁩');
  });
});

describe('house rules for CJK and Latin lines', () => {
  const prep = (text: string, locale: string, vertical = false) =>
    prepareText(readLetteringText(text, undefined), (locale === 'ja' ? ja : en).speech!, { locale, vertical });

  it('drops the spaces a translator left between CJK characters and marks', () => {
    expect(prep('我らに何の破壊を願う ？ …', 'ja').text).toBe('我らに何の破壊を願う？…');
    expect(prep('… さあできた', 'ja').text).toBe('…さあできた');
    // Latin words keep theirs.
    expect(prep('エピソード 8 : Pepper', 'ja').text).toBe('エピソード 8 : Pepper');
  });

  it('never breaks before a closing mark or after an opening one', () => {
    const p = prep('Papi ! Je suis là ! « Bonjour »', 'fr');
    const ends = breakPoints(p, 'gb', false).filter((b) => !b.forced).map((b) => p.text.slice(b.next, b.next + 1));
    expect(ends).not.toContain('!');
    expect(ends).not.toContain('»');
    const starts = breakPoints(p, 'gb', false).filter((b) => !b.forced).map((b) => p.text[b.end - 1]);
    expect(starts).not.toContain('«');
  });

  it('never leaves a leader or a single character alone on a column', () => {
    const p = prep('……みんなが頼りにならないなら……', 'ja', true);
    const s = shapeText(p, ja.speech!, { locale: 'ja', vertical: true, dpi: 96 });
    for (const l of s.lines) {
      const t = p.text.slice(l.start, l.end).replace(/[\s\p{P}\p{S}]/gu, '');
      expect([...t].length).toBeGreaterThan(1);
    }
  });

  it('breaks a short Japanese text inside no word (わざ|わざ)', () => {
    const p = prep('……わざわざ？', 'ja', true);
    const s = shapeText(p, ja.speech!, { locale: 'ja', vertical: true, dpi: 96 });
    const lines = s.lines.map((l) => p.text.slice(l.start, l.end));
    expect(lines.some((t) => t.endsWith('わざ') && !t.endsWith('わざわざ'))).toBe(false);
  });

  it('sets a text with no CJK horizontally in a vertical panel (an English subtitle)', () => {
    const p = panel(rect(0, 0, 400, 400), { locale: 'ja', writingMode: 'vertical', direction: 'rtl' });
    const [s, b] = letterPanel(p, [
      { id: 's', order: 0, kind: 'sfx', text: 'WHAM', sourceStart: 0, sourceEnd: 4, style: ja.sfx! },
      item('b', 1, undefined, 'ドン', ja.speech!),
    ]);
    expect(s!.text[0]!.vertical).toBeUndefined();
    expect(b!.text[0]!.vertical).toBeDefined();
  });
});

describe('lettering stays where it belongs', () => {
  it('slides a pinned label that would run out of its panel back inside', () => {
    const CELL = rect(0, 0, 300, 200);
    const pin = { x: 290, y: 190 };
    const [b] = letterPanel(panel(CELL), [{ id: 'w', order: 0, kind: 'caption', text: 'Incantations for Demons, Vol. 1', sourceStart: 0, sourceEnd: 5, style: { ...en.caption!, position: 'auto' }, pin }]);
    expect(inside(b!.bbox, CELL)).toBe(true);
    // A pin with room is honoured exactly.
    const [c] = letterPanel(panel(CELL), [{ id: 'w', order: 0, kind: 'caption', text: 'Vol. 1', sourceStart: 0, sourceEnd: 5, style: { ...en.caption!, position: 'auto' }, pin: { x: 150, y: 100 } }]);
    expect(centre(c!.bbox).x).toBeCloseTo(150, 0);
    expect(centre(c!.bbox).y).toBeCloseTo(100, 0);
  });

  it('never runs into another panel or off the live area, even overflowing', () => {
    // A tiny panel with a long shout; the panel above holds a balloon.
    const CELL = rect(0, 210, 260, 150);
    const above = rect(0, 0, 260, 200);
    const limit = rect(0, 0, 260, 360);
    const { balloons, diagnostics } = letterPanelDetailed(panel(CELL, { neighbours: [above], limit, anchors: [{ id: 'k', mouth: { x: 60, y: 300 }, visible: true }] }), [
      item('1', 0, 'k', "Can't work at all and I've never been happier in my whole life!!", en.shout!),
    ]);
    const b = balloons[0]!;
    expect(overlap(b.bbox, { x: above.x, y: above.y, width: above.width, height: above.height - 2 })).toBe(false);
    expect(b.bbox.x).toBeGreaterThanOrEqual(limit.x - 0.5);
    expect(b.bbox.x + b.bbox.width).toBeLessThanOrEqual(limit.x + limit.width + 0.5);
    // It does not fit cleanly, and says so; the size never changes.
    expect(diagnostics.length).toBe(1);
    expect(b.text[0]!.fontString).toContain(`${en.shout!.fontSizePx}px`);
  });

  it('puts an off-panel speaker\'s balloon by the border its tail runs to', () => {
    const CELL = rect(0, 0, 600, 400);
    const [b] = letterPanel(panel(CELL), [item('1', 0, 'zoe', 'Thank you, keeper!', en.speech!, { tailTarget: 'bottom' })]);
    expect(b!.tailTip!.y).toBeCloseTo(400, 0);
    // The tail is short: the balloon sits low, by the bottom border.
    expect(dist(centre(b!.bbox), b!.tailTip!)).toBeLessThan(b!.bbox.height / 2 + 3 * EM);
  });

  it('butts a caption against the inner edge of a framed panel\'s border', () => {
    const CELL = rect(0, 0, 400, 300);
    const [c] = letterPanel(panel(CELL, { borderPx: 4 }), [{ id: 'c', order: 0, kind: 'caption', text: 'Lyon, 1943.', sourceStart: 0, sourceEnd: 5, style: en.caption!, position: 'top-start' }]);
    expect(c!.bbox.x).toBeCloseTo(2, 1);
    expect(c!.bbox.y).toBeCloseTo(2, 1);
  });

  it('places the dialogue before a sound effect with no place of its own', () => {
    const CELL = rect(0, 0, 400, 260);
    const k = { id: 'k', mouth: { x: 100, y: 200 }, visible: true };
    const out = letterPanel(panel(CELL, { anchors: [k] }), [
      { id: 's', order: 0, kind: 'sfx', text: 'THUMP', sourceStart: 0, sourceEnd: 5, style: en.sfx! },
      item('b', 1, 'k', 'Ouch.'),
    ]);
    const balloon = out.find((b) => b.kind === 'balloon')!;
    // The balloon takes its spot near the speaker, above it.
    expect(balloon.bbox.y + balloon.bbox.height).toBeLessThanOrEqual(k.mouth.y);
    expect(dist(centre(balloon.bbox), k.mouth)).toBeLessThan(8 * EM);
  });

  it('is deterministic', () => {
    const CELL = rect(0, 0, 640, 360);
    const anchors = [{ id: 'r', mouth: { x: 520, y: 300 }, visible: true }, { id: 'l', mouth: { x: 120, y: 300 }, visible: true }];
    const run = () => JSON.stringify(letterPanel(panel(CELL, { anchors }), [item('a', 0, 'r', 'You first.'), item('b', 1, 'l', 'No, you.')]));
    expect(run()).toBe(run());
  });
});
