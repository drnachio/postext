import { describe, it, expect, beforeAll } from 'vitest';
import { installStubMeasure } from './stubMeasure';
import { letterPanel, letterPanelDetailed } from '../letter';
import { presetLetteringStyles } from '../presets';
import { dist, pointInRect } from '../geom';
import type { ComicBalloonOut, LetteringItem, LetteringPanel, Point, Rect } from '../types';

beforeAll(() => installStubMeasure());

const EM = 12;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const corners = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];

// One panel, two speakers: ana on the left, ben on the right, a lamp
// between them that must stay clear.
const CELL = rect(0, 0, 600, 320);
const ANA = { id: 'ana', mouth: { x: 150, y: 250 }, head: { x: 150, y: 190 }, face: rect(110, 200, 80, 80), visible: true };
const BEN = { id: 'ben', mouth: { x: 450, y: 255 }, head: { x: 450, y: 195 }, face: rect(410, 205, 80, 80), visible: true };
const LAMP = rect(280, 170, 40, 150);

type Loc = { tag: string; dir: 'ltr' | 'rtl'; vertical: boolean };
const LOCS: Loc[] = [
  { tag: 'en', dir: 'ltr', vertical: false },
  { tag: 'es', dir: 'ltr', vertical: false },
  { tag: 'ja', dir: 'rtl', vertical: true },
  { tag: 'ar', dir: 'rtl', vertical: false },
];
const LINES: Record<string, [string, string, string]> = {
  en: ['Did you hear that? Something is moving in the cellar.', "It's nothing. Go back to sleep.", 'Are you sure?'],
  es: ['¿Has oído eso? Algo se mueve en el sótano.', 'No es nada. Vuelve a dormir.', '¿Estás seguro?'],
  ja: ['いまの音、聞こえた？地下室で何かが動いてる。', 'なんでもないよ。もう寝なさい。', '本当に？'],
  ar: ['هل سمعت ذلك؟ شيء ما يتحرك في القبو.', 'لا شيء. عودي إلى النوم.', 'هل أنت متأكد؟'],
};

function panelFor(loc: Loc, extra: Partial<LetteringPanel> = {}): LetteringPanel {
  return {
    index: 0, polygon: corners(CELL), bbox: CELL, insetPx: 6, direction: loc.dir,
    writingMode: loc.vertical ? 'vertical' : 'horizontal', locale: loc.tag, anchors: [ANA, BEN], avoid: [LAMP], dpi: 96,
    ...extra,
  };
}

function itemsFor(loc: Loc): LetteringItem[] {
  const st = presetLetteringStyles({ fontSizePx: EM, locale: loc.tag, fontFamily: 'Test' });
  const [a, b, c] = LINES[loc.tag]!;
  return [
    { id: 'i0', order: 0, kind: 'balloon', speaker: 'ana', text: a, sourceStart: 0, sourceEnd: a.length, style: st.speech! },
    { id: 'i1', order: 1, kind: 'balloon', speaker: 'ben', text: b, sourceStart: 100, sourceEnd: 100 + b.length, style: st.speech! },
    { id: 'i2', order: 2, kind: 'balloon', speaker: 'ana', text: c, sourceStart: 200, sourceEnd: 200 + c.length, style: st.speech! },
  ];
}

const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
const shrunk = (r: Rect, k: number): Rect => ({ x: r.x + r.width * k, y: r.y + r.height * k, width: r.width * (1 - 2 * k), height: r.height * (1 - 2 * k) });

describe('letterPanel: placement (SPEC D3.3)', () => {
  for (const loc of LOCS) {
    describe(loc.tag, () => {
      let out: ComicBalloonOut[];
      beforeAll(() => {
        out = letterPanel(panelFor(loc), itemsFor(loc));
      });

      it('gives one balloon per item, in reading order, with real design text', () => {
        expect(out.map((b) => b.id)).toEqual(['i0', 'i1', 'i2']);
        for (const b of out) {
          expect(b.text).toHaveLength(1);
          expect(b.text[0]!.kind).toBe('text');
          expect(b.text[0]!.lines.length).toBeGreaterThan(0);
          if (loc.vertical) expect(b.text[0]!.vertical).toBeDefined();
          if (loc.tag === 'ar') expect(b.text[0]!.direction).toBe('rtl');
        }
      });

      it('keeps the balloons inside the panel and apart', () => {
        for (const b of out) {
          expect(b.bbox.x).toBeGreaterThanOrEqual(CELL.x);
          expect(b.bbox.y).toBeGreaterThanOrEqual(CELL.y);
          expect(b.bbox.x + b.bbox.width).toBeLessThanOrEqual(CELL.x + CELL.width);
          expect(b.bbox.y + b.bbox.height).toBeLessThanOrEqual(CELL.y + CELL.height);
        }
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) expect(overlap(shrunk(out[i]!.bbox, 0.15), shrunk(out[j]!.bbox, 0.15))).toBe(false);
        }
      });

      it('never covers a face or the lamp', () => {
        for (const b of out) {
          for (const r of [ANA.face, BEN.face, LAMP]) expect(overlap(shrunk(b.bbox, 0.12), r)).toBe(false);
          for (const t of b.text) expect(overlap(t.bbox, ANA.face) || overlap(t.bbox, BEN.face)).toBe(false);
        }
      });

      it('aims every tail at its own speaker', () => {
        for (const b of out) {
          expect(b.tailTip).toBeDefined();
          const own = b.speaker === 'ana' ? ANA.mouth : BEN.mouth;
          const other = b.speaker === 'ana' ? BEN.mouth : ANA.mouth;
          expect(dist(b.tailTip!, own)).toBeLessThan(dist(b.tailTip!, other));
          expect(b.shape!.d.startsWith('M')).toBe(true);
        }
      });

      it('respects the reading order (Kurlander, mirrored right to left)', () => {
        const fwd = loc.dir === 'rtl' ? -1 : 1;
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) {
            const e = out[i]!.bbox;
            const l = out[j]!.bbox;
            const earlierForward = ((e.x + e.width / 2) - (l.x + l.width / 2)) * fwd > 0;
            const limit = earlierForward ? e.y + e.height : e.y;
            expect(l.y).toBeGreaterThanOrEqual(limit - 0.25 * EM - 0.01);
          }
        }
      });

      it('is deterministic', () => {
        const again = letterPanel(panelFor(loc), itemsFor(loc));
        expect(JSON.stringify(again)).toBe(JSON.stringify(out));
      });
    });
  }

  it('maps every printed character back to its source', () => {
    const loc = LOCS[0]!;
    const items = itemsFor(loc).map((it) => ({ ...it, sourceMap: Array.from({ length: (it.text as string).length }, (_, k) => it.sourceStart + k) }));
    const [b] = letterPanel(panelFor(loc), items);
    const t = b!.text[0]!;
    expect(t.sourceText).toBe(t.lines.map((l) => l.text).join('\n'));
    expect(t.sourceMap).toHaveLength(t.sourceText!.length);
    expect(t.sourceStart).toBe(0);
  });
});

describe('letterPanel: kinds, joins, pins and fallbacks', () => {
  const loc = LOCS[0]!;
  const st = presetLetteringStyles({ fontSizePx: EM, locale: 'en', fontFamily: 'Test' });

  it('butts a caption into the start corner (the right one when reading right to left)', () => {
    const cap: LetteringItem = { id: 'c', order: 0, kind: 'caption', text: 'Lyon, 1943.', sourceStart: 0, sourceEnd: 11, style: st.caption! };
    const [ltr] = letterPanel(panelFor(loc), [cap]);
    expect(ltr!.bbox.x).toBeCloseTo(0, 0);
    expect(ltr!.bbox.y).toBeCloseTo(0, 0);
    expect(ltr!.tailTip).toBeUndefined();
    const [rtl] = letterPanel(panelFor(LOCS[3]!), [{ ...cap, style: presetLetteringStyles({ fontSizePx: EM, locale: 'ar' }).caption! }]);
    expect(rtl!.bbox.x + rtl!.bbox.width).toBeCloseTo(600, 0);
  });

  it('joins two balloons of one speaker into one outline with one tail', () => {
    const items: LetteringItem[] = [
      { id: 'a', order: 0, kind: 'balloon', speaker: 'ben', text: 'Listen to me.', sourceStart: 0, sourceEnd: 5, style: st.speech! },
      { id: 'b', order: 1, kind: 'balloon', speaker: 'ben', text: 'We leave tonight. Pack only what you can carry.', sourceStart: 10, sourceEnd: 20, style: st.speech! },
    ];
    for (const join of ['butt', 'connector'] as const) {
      const out = letterPanel(panelFor(loc), [items[0]!, { ...items[1]!, join }]);
      expect(out[0]!.group).toBe(out[1]!.group);
      expect(out[0]!.shape).toBeDefined();
      expect(out[1]!.shape).toBeUndefined();
      expect(out[0]!.tailTip).toBeDefined();
      expect(out[1]!.tailTip).toBeUndefined();
      // Bodies, tail, (neck): several subpaths in one compound path.
      expect((out[0]!.shape!.d.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(join === 'connector' ? 4 : 3);
    }
    // `join=false` keeps them apart.
    const apart = letterPanel(panelFor(loc), [items[0]!, { ...items[1]!, join: false }]);
    expect(apart[0]!.group).not.toBe(apart[1]!.group);
    expect(apart[1]!.shape).toBeDefined();
  });

  it('honours a pinned centre', () => {
    const pin = { x: 300, y: 80 };
    const [b] = letterPanel(panelFor(loc), [{ id: 'p', order: 0, kind: 'balloon', speaker: 'ana', text: 'Here.', sourceStart: 0, sourceEnd: 5, style: st.speech!, pin }]);
    expect(b!.bbox.x + b!.bbox.width / 2).toBeCloseTo(pin.x, 0);
    expect(b!.bbox.y + b!.bbox.height / 2).toBeCloseTo(pin.y, 0);
  });

  it('runs an off-panel tail to the border', () => {
    const side = letterPanel(panelFor(loc), [{ id: 'o', order: 0, kind: 'balloon', speaker: 'zoe', text: 'Over here!', sourceStart: 0, sourceEnd: 5, style: st.speech!, tailTarget: 'end' }]);
    expect(side[0]!.tailTip!.x).toBeCloseTo(600, 0);
    const unknown = letterPanel(panelFor(loc), [{ id: 'o', order: 0, kind: 'balloon', speaker: 'zoe', text: 'Over here!', sourceStart: 0, sourceEnd: 5, style: st.speech! }]);
    const t = unknown[0]!.tailTip!;
    const onBorder = Math.min(t.x, 600 - t.x, t.y, 320 - t.y);
    expect(onBorder).toBeLessThan(0.5);
    // A cropped speaker: toward the anchor, stopping at the border.
    const cropped = letterPanel(panelFor(loc, { anchors: [{ id: 'zoe', mouth: { x: 300, y: 500 }, visible: false }] }), [{ id: 'o', order: 0, kind: 'balloon', speaker: 'zoe', text: 'Down here!', sourceStart: 0, sourceEnd: 5, style: st.speech! }]);
    expect(cropped[0]!.tailTip!.y).toBeCloseTo(320, 0);
  });

  it('sets a sound effect without a balloon, rotated, with a halo, near its anchor', () => {
    const sfxAnchor = { id: 'sfx', mouth: { x: 300, y: 100 }, visible: true };
    const [s] = letterPanel(panelFor(loc, { anchors: [ANA, BEN, sfxAnchor] }), [{ id: 's', order: 0, kind: 'sfx', text: 'Krak', sourceStart: 0, sourceEnd: 4, style: st.sfx!, rotate: -10 }]);
    expect(s!.shape).toBeUndefined();
    expect(s!.rotate).toBe(-10);
    expect(s!.halo!.width).toBeGreaterThan(0);
    expect(s!.text[0]!.lines[0]!.text).toBe('KRAK');
    expect(pointInRect(sfxAnchor.mouth, s!.bbox, 2 * EM)).toBe(true);
    // Vertical in a vertical panel, unless the style says horizontal.
    const ja = presetLetteringStyles({ fontSizePx: EM, locale: 'ja' }).sfx!;
    const [v] = letterPanel(panelFor(LOCS[2]!), [{ id: 's', order: 0, kind: 'sfx', text: 'バキッ', sourceStart: 0, sourceEnd: 3, style: ja }]);
    expect(v!.text[0]!.vertical).toBeDefined();
    const [h] = letterPanel(panelFor(LOCS[2]!), [{ id: 's', order: 0, kind: 'sfx', text: 'バキッ', sourceStart: 0, sourceEnd: 3, style: { ...ja, writingMode: 'horizontal' } }]);
    expect(h!.text[0]!.vertical).toBeUndefined();
  });

  it('scales a sound effect without changing the dialogue size', () => {
    const [a] = letterPanel(panelFor(loc), [{ id: 's', order: 0, kind: 'sfx', text: 'Krak', sourceStart: 0, sourceEnd: 4, style: st.sfx! }]);
    const [b] = letterPanel(panelFor(loc), [{ id: 's', order: 0, kind: 'sfx', text: 'Krak', sourceStart: 0, sourceEnd: 4, style: st.sfx!, sizeScale: 2 }]);
    expect(b!.text[0]!.bbox.width).toBeCloseTo(2 * a!.text[0]!.bbox.width, 0);
  });

  it('reports a balloon that cannot fit and still places it', () => {
    const tiny = rect(0, 0, 110, 60);
    const long = 'This is far too much text for a panel this small, and it will not fit anywhere at all.';
    const res = letterPanelDetailed(
      { ...panelFor(loc), polygon: corners(tiny), bbox: tiny, anchors: [], avoid: [] },
      [{ id: 'x', order: 0, kind: 'balloon', speaker: 'ana', text: long, sourceStart: 5, sourceEnd: 90, style: st.speech! }],
    );
    expect(res.balloons).toHaveLength(1);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]).toMatchObject({ itemId: 'x', panelIndex: 0, sourceStart: 5, sourceEnd: 90 });
    expect(res.diagnostics[0]!.reasons).toContain('outside');
    // Never shrunk: the dialogue keeps its size.
    expect(res.balloons[0]!.text[0]!.fontString).toContain(`${EM}px`);
  });

  it('breaks the border when the item allows it before reporting', () => {
    const tiny = rect(0, 0, 110, 50);
    const text = 'Just a bit too long for here.';
    const base = { ...panelFor(loc), polygon: corners(tiny), bbox: tiny, anchors: [], avoid: [], bleedPx: 120 };
    const item: LetteringItem = { id: 'x', order: 0, kind: 'balloon', text, sourceStart: 0, sourceEnd: 5, style: { ...st.speech!, tail: 'none' } };
    const strict = letterPanelDetailed(base, [item]);
    const lenient = letterPanelDetailed(base, [{ ...item, breakBorder: true }]);
    expect(strict.diagnostics).toHaveLength(1);
    expect(strict.diagnostics[0]!.fallbacks).not.toContain('breakBorder');
    expect(lenient.diagnostics).toHaveLength(0);
    // It took the first fallback, keeping its preferred shape.
    const b = lenient.balloons[0]!.bbox;
    expect(b.x < 0 || b.y < 0 || b.x + b.width > 110 || b.y + b.height > 50).toBe(true);
  });

  it('covers an avoid zone (never a face) when nothing else fits', () => {
    const cell = rect(0, 0, 200, 120);
    const res = letterPanelDetailed(
      { ...panelFor(loc), polygon: corners(cell), bbox: cell, anchors: [], avoid: [rect(0, 0, 200, 120)] },
      [{ id: 'x', order: 0, kind: 'balloon', text: 'Hello there.', sourceStart: 0, sourceEnd: 5, style: { ...st.speech!, tail: 'none' } }],
    );
    expect(res.diagnostics).toHaveLength(0);
    const faces = letterPanelDetailed(
      { ...panelFor(loc), polygon: corners(cell), bbox: cell, anchors: [{ id: 'q', mouth: { x: -50, y: -50 }, face: rect(0, 0, 200, 120), visible: false }], avoid: [] },
      [{ id: 'x', order: 0, kind: 'balloon', text: 'Hello there.', sourceStart: 0, sourceEnd: 5, style: { ...st.speech!, tail: 'none' } }],
    );
    expect(faces.diagnostics[0]!.reasons).toContain('face');
  });
});
