import { describe, it, expect, beforeAll } from 'vitest';
import { installStubMeasure } from './stubMeasure';
import { letterPanelDetailed } from '../letter';
import { presetLetteringStyles } from '../presets';
import type { LetteringItem, LetteringPanel, Point, Rect } from '../types';

beforeAll(() => installStubMeasure());

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const corners = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
const CELL = rect(0, 0, 400, 260);
const PANEL: LetteringPanel = {
  index: 0, polygon: corners(CELL), bbox: CELL, insetPx: 6, direction: 'ltr', writingMode: 'horizontal', locale: 'es', dpi: 96,
  anchors: [{ id: 'ana', mouth: { x: 120, y: 210 }, head: { x: 120, y: 160 }, face: rect(80, 170, 80, 80), visible: true }],
};

function itemsAt(at: number): LetteringItem[] {
  const st = presetLetteringStyles({ fontSizePx: 12, locale: 'es', fontFamily: 'Test' });
  const a = '¿Has oído eso? Algo se mueve en el sótano.';
  const b = 'No es nada.';
  return [
    { id: 'i0', order: 0, kind: 'balloon', speaker: 'ana', text: a, sourceStart: at, sourceEnd: at + a.length, sourceMap: [...a].map((_, i) => at + i), style: st.speech! },
    { id: 'i1', order: 1, kind: 'caption', text: b, sourceStart: at + 60, sourceEnd: at + 60 + b.length, style: st.caption! },
  ];
}

describe('letterPanelDetailed: lettering kept across builds', () => {
  it('letters a panel moved further into the source as before, its offsets moved with it', () => {
    const first = letterPanelDetailed(PANEL, itemsAt(10));
    const moved = letterPanelDetailed(PANEL, itemsAt(1010));
    expect(moved.balloons.map((b) => b.bbox)).toEqual(first.balloons.map((b) => b.bbox));
    for (const [i, b] of moved.balloons.entries()) {
      const f = first.balloons[i]!;
      expect(b.sourceStart).toBe(f.sourceStart + 1000);
      expect(b.sourceEnd).toBe(f.sourceEnd + 1000);
      expect(b.text[0]!.sourceStart).toBe(f.text[0]!.sourceStart! + 1000);
      expect(b.text[0]!.sourceMap).toEqual(f.text[0]!.sourceMap?.map((o) => o + 1000));
    }
    expect(first.balloons[0]!.text[0]!.sourceMap?.[0]).toBe(10);
  });

  it('hands out copies: changing one result leaves the next alone', () => {
    const a = letterPanelDetailed(PANEL, itemsAt(0));
    a.balloons[0]!.bbox.x = -999;
    const b = letterPanelDetailed(PANEL, itemsAt(0));
    expect(b.balloons[0]!.bbox.x).not.toBe(-999);
  });
});
