/**
 * Frames held at the foot of a card (#980): a text that is a line shorter or
 * longer in another edition moves nothing below it when the frames of the card
 * are a stack with a box of the card's height, the frames above the held ones
 * take the spare space (`grow`) and give it back (`shrink`), and the held
 * frames write a `minHeight`. The ladder squeezes the text above before it
 * moves anything, and `frameOverflow` says when it cannot.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import { composedReflowLog } from '../../../composed/reflowLog.js';
import type { PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};
const mm = (value: number) => ({ value, unit: 'mm' as const });
const MM = 300 / 25.4;
const toMm = (v: number): number => v / MM;
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

const CARD: PageTemplate = {
  id: 'card',
  frames: [
    { name: 'text', grow: 1, shrink: 1 },
    { name: 'map', minHeight: mm(60) },
  ],
  groups: [{ name: 'card', frames: ['text', 'map'], gap: mm(4), placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: mm(140) } } }],
} as never;
const page = (n: number) => `::::page{template="card"}\n:::frame{slot="text"}\n${words(n)}\n:::\n\n:::frame{slot="map"}\nMap\n:::\n::::`;
const build = (md: string): VDTDocument => buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [CARD] }, createMeasurementCache());
const frameOf = (p: VDTPage, name: string): VDTFrame => p.composed!.frames.find((f) => f.name === name)!;

describe('frames held at the foot of a card (#980)', () => {
  const held = (n: number) => {
    const doc = build(page(n));
    const p = doc.pages.find((x) => x.composed)!;
    return { doc, p, text: frameOf(p, 'text'), map: frameOf(p, 'map') };
  };

  it('a text of any length leaves the held frame where the card ends', () => {
    const [short, usual, long] = [5, 40, 400].map(held);
    for (const r of [short!, usual!, long!]) {
      expect(toMm(r.map.rect.y + r.map.rect.height)).toBeCloseTo(160, 3);
      expect(toMm(r.map.rect.height)).toBeCloseTo(60, 3);
      expect(r.p.composed!.log).toEqual([]);
    }
    // The frame above takes the spare space whatever it holds; its text stays at its top.
    expect(short!.text.rect.y).toBe(long!.text.rect.y);
    expect(toMm(short!.text.rect.height)).toBeCloseTo(76, 3);
    expect(short!.map.rect).toEqual(long!.map.rect);
  });

  it('a text too long for the room above is scaled, then reported; the held frame does not move', () => {
    const { doc, p, text, map } = held(1500);
    expect(toMm(map.rect.y)).toBeCloseTo(100, 3);
    expect(toMm(map.rect.height)).toBeCloseTo(60, 3);
    expect(text.scale).toBeLessThan(1);
    expect(text.overflowPx).toBeGreaterThan(0);
    expect(p.composed!.log.map((e) => `${e.frame} ${e.kind}`)).toEqual(['text textScaled', 'text overflow']);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow').map((w) => 'frame' in w && w.frame)).toEqual(['text']);
    expect(composedReflowLog(doc)[0]!.lines.some((l) => l.includes('text overflows'))).toBe(true);
  });

  it('a frame anchored below another one follows its text, as before', () => {
    const below: PageTemplate = {
      id: 'card',
      frames: [{ name: 'text' }, { name: 'map', minHeight: mm(60), placement: { anchor: { to: '#text', edge: 'below' }, offset: { y: mm(4) } } }],
    } as never;
    const at = (n: number): number => {
      const doc = buildDocument({ markdown: page(n) }, { ...PAGE, pageTemplates: [below] }, createMeasurementCache());
      return frameOf(doc.pages.find((x) => x.composed)!, 'map').rect.y;
    };
    expect(at(1500)).toBeGreaterThan(at(5));
  });
});
