import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import type { PostextConfig, Dimension } from '../../types';
import { installSizedStub, stubCharWidth } from './stub';
import { registerVerticalAlternates, unregisterVerticalAlternates } from '../../canvas-backend/verticalText';

installSizedStub();

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

interface Painted {
  text: string;
  /** Where the text's origin lands on the sheet. */
  x: number;
  y: number;
  /** The text's x axis on the sheet: (1, 0) upright, (0, 1) turned 90° clockwise. */
  ax: number;
  ay: number;
  font: string;
}

/** A 2D context that keeps the current transform and records every
 *  `fillText` with where it lands on the sheet. */
function recordingCanvas(): { canvas: HTMLCanvasElement; painted: Painted[]; calls: string[] } {
  const painted: Painted[] = [];
  const calls: string[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const state: Record<string, unknown> = { font: '10px Test', letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
  const saved: Record<string, unknown>[] = [];
  const size = () => Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? 10);
  const api: Record<string, unknown> = {
    save: () => { stack.push(m); saved.push({ ...state }); },
    restore: () => { m = stack.pop() ?? m; Object.assign(state, saved.pop() ?? {}); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { calls.push(`transform(${[a, b, c, d, e, f].map((v) => +v.toFixed(3)).join(',')})`); m = mul(m, [a, b, c, d, e, f]); },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => {
      painted.push({ text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5], ax: Math.round(m[0] * 1000) / 1000 + 0, ay: Math.round(m[1] * 1000) / 1000 + 0, font: String(state.font) });
    },
    measureText: (s: string) => {
      let w = 0;
      for (const ch of s) w += stubCharWidth(ch, size());
      return { width: w, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w };
    },
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key === 'string' && key in api) return api[key];
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set(target, key, value) { target[key as string] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, painted, calls };
}

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const config = (locale: string, lineBreakWidth = 300): PostextConfig => ({
  page: { width: pt(lineBreakWidth), height: pt(420), dpi: 72, margins: { top: pt(40), right: pt(30), bottom: pt(40), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(20), textAlign: 'left' },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  locale,
});

function paint(markdown: string, locale: string) {
  const doc = buildDocument({ markdown }, config(locale));
  const page = doc.pages[0]!;
  const rec = recordingCanvas();
  renderPageToCanvas(page, doc, rec.canvas);
  return { doc, page, ...rec };
}

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

describe('canvas: a vertical line', () => {
  it('paints the flow through the page frame, a quarter turn clockwise', () => {
    const { calls, page } = paint('紅樓夢', 'zh-Hant');
    expect(calls).toContain(`transform(0,1,-1,0,${+page.width.toFixed(3)},0)`);
  });

  it('stands each Han character upright, one em under the other, down the first column at the right', () => {
    const { painted, page } = paint('紅樓夢', 'zh-Hant');
    const han = painted.filter((p) => p.text.length === 1 && '紅樓夢'.includes(p.text));
    expect(han.map((p) => p.text)).toEqual(['紅', '樓', '夢']);
    for (const p of han) expect([p.ax, p.ay]).toEqual([1, 0]);
    // 10 pt at 72 dpi: 10 px cells straight down the sheet.
    expect(near(han[1]!.y - han[0]!.y, 10)).toBe(true);
    expect(near(han[2]!.y - han[1]!.y, 10)).toBe(true);
    expect(near(han[1]!.x, han[0]!.x)).toBe(true);
    // The first column sits at the right of the content area (30 pt right margin).
    expect(han[0]!.x).toBeGreaterThan(page.width - 30 - 20);
    expect(han[0]!.x).toBeLessThan(page.width - 30);
  });

  it('sets a Latin word sideways, turned with the frame', () => {
    const { painted } = paint('用iPhone拍照', 'zh-Hant');
    const word = painted.find((p) => p.text === 'iPhone')!;
    expect([word.ax, word.ay]).toEqual([0, 1]);
    const yong = painted.find((p) => p.text === '用')!;
    const pai = painted.find((p) => p.text === '拍')!;
    // 用 (10 px), then iPhone (6 × 5 px), then 拍.
    expect(near(pai.y - yong.y, 10 + 30)).toBe(true);
  });

  it('moves a mainland full stop to the top-right quadrant and leaves a Taiwan one centred', () => {
    const hans = paint('紅樓夢。', 'zh-Hans').painted;
    const hant = paint('紅樓夢。', 'zh-Hant').painted;
    const stop = (list: Painted[]) => list.find((p) => p.text === '。')!;
    const cell = (list: Painted[]) => list.find((p) => p.text === '夢')!;
    // Upright in both (never turned).
    expect([stop(hans).ax, stop(hans).ay]).toEqual([1, 0]);
    expect([stop(hant).ax, stop(hant).ay]).toEqual([1, 0]);
    // Taiwan: drawn like any character of its cell, one em below 夢.
    expect(near(stop(hant).x, cell(hant).x)).toBe(true);
    expect(near(stop(hant).y - cell(hant).y, 10)).toBe(true);
    // Mainland: 0.6 em right and 0.62 em up of that.
    expect(near(stop(hans).x - cell(hans).x, 6)).toBe(true);
    expect(near(stop(hans).y - cell(hans).y, 10 - 6.2)).toBe(true);
  });

  it('turns a bracket about its em box when the font gives no vertical form, and paints it with the twin face when one is registered', () => {
    const turned = paint('「紅」', 'zh-Hant').painted.find((p) => p.text === '「')!;
    expect([turned.ax, turned.ay]).toEqual([0, 1]);
    registerVerticalAlternates('Test Serif', 'Test Serif postext-vert');
    try {
      const twin = paint('「紅」', 'zh-Hant').painted.find((p) => p.text === '「')!;
      expect([twin.ax, twin.ay]).toEqual([1, 0]);
      expect(twin.font).toContain('Test Serif postext-vert');
    } finally {
      unregisterVerticalAlternates('Test Serif');
    }
  });

  it('reads mainland quotes as corner brackets, turned', () => {
    const p = paint('他說“好”', 'zh-Hans').painted;
    expect(p.some((x) => x.text === '『' && x.ay === 1)).toBe(true);
    expect(p.some((x) => x.text === '“')).toBe(false);
  });

  it('advances the next line (column) to the left', () => {
    const text = '此開卷第一回也作者自云因曾歷過一番夢幻之後故將真事隱去而借通靈之說撰此石頭記一書也故曰甄士隱云云';
    const { painted } = paint(text, 'zh-Hant');
    const first = painted.find((p) => p.text === '此')!;
    const later = painted.filter((p) => p.ax === 1);
    const columns = [...new Set(later.map((p) => Math.round(p.x)))];
    expect(columns.length).toBeGreaterThan(1);
    expect(columns[1]!).toBeLessThan(columns[0]!);
    expect(Math.round(first.x)).toBe(columns[0]);
  });

  it('paints a horizontal page with plain fillText calls and no transform', () => {
    const doc = buildDocument({ markdown: '紅樓夢 iPhone' }, { ...config('zh-Hant'), layout: { layoutType: 'single' } });
    const rec = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, rec.canvas);
    expect(rec.calls.some((c) => c.startsWith('transform('))).toBe(false);
    expect(rec.painted.every((p) => p.ax === 1 && p.ay === 0)).toBe(true);
    expect(rec.painted.map((p) => p.text).join('')).toContain('紅樓夢');
  });
});
