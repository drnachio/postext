import { describe, it, expect, beforeAll } from 'vitest';
import { initMathEngine, renderMath, clearMathCache } from '../../math/index.js';
import type { MathRender } from '../../math/index.js';
import { normalizeTableRules, strokeSegment, strokeRect } from '../../math/strokes.js';

beforeAll(async () => {
  await initMathEngine();
  clearMathCache();
});

/** The absolute points of a flattened path (M/L/C commands only). */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const cmd of d.match(/[A-Za-z][^A-Za-z]*/g) ?? []) {
    const nums = (cmd.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  }
  return out;
}

function box(d: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts = points(d);
  return {
    minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])),
  };
}

/** Paths wider than `minWidthShare` of the formula and thinner than
 *  `maxThick` units: the horizontal rules. */
function horizontalRules(r: MathRender, maxThick = 120): ReturnType<typeof box>[] {
  return r.paths
    .map((p) => box(p.d))
    .filter((b) => b.maxX - b.minX > r.viewBox.width * 0.9 && b.maxY - b.minY < maxThick);
}

const SUM = String.raw`\begin{array}{rl} 7{,}56 & \text{kg} \\ -6{,}052 & \text{kg} \\ +13{,}7 & \text{kg} \\ \hline 15{,}208 & \text{kg} \end{array}`;

describe('math rules MathJax strokes (#1362)', () => {
  it("paints an array's \\hline as a filled rule between the rows", () => {
    const r = renderMath(SUM, true, 16);
    expect(r.error).toBeUndefined();
    const rules = horizontalRules(r);
    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    // 0.07 em thick (70 units), spanning the array.
    expect(rule.maxY - rule.minY).toBeCloseTo(70, 0);
    expect(rule.minX).toBeCloseTo(r.viewBox.minX, 0);
    expect(rule.maxX).toBeCloseTo(r.viewBox.minX + r.viewBox.width, 0);
    // Between the third and the fourth row: below most glyphs, above some.
    const glyphs = r.paths.filter((p) => box(p.d).maxY - box(p.d).minY >= 120).map((p) => box(p.d));
    const below = glyphs.filter((g) => g.minY > rule.maxY);
    const above = glyphs.filter((g) => g.maxY < rule.minY);
    expect(below.length).toBeGreaterThan(0);
    expect(above.length).toBeGreaterThan(below.length);
  });

  it('keeps the rule in the HTML markup with its stroke as attributes', () => {
    const r = renderMath(SUM, true, 16);
    expect(r.svg).toMatch(/<line data-line="h"[^>]*stroke-width="70"/);
  });

  it('paints column bars and a frame as outlines, not a filled block', () => {
    const r = renderMath(String.raw`\begin{array}{|c|c|}\hline a & b \\ \hline c & d \\ \hline\end{array}`, true, 16);
    const area = r.viewBox.width * r.viewBox.height;
    for (const p of r.paths) {
      const b = box(p.d);
      // Nothing covers the formula: the frame is a ring, not a rect.
      const pts = points(p.d).length;
      if (pts <= 4) expect((b.maxX - b.minX) * (b.maxY - b.minY)).toBeLessThan(area * 0.5);
    }
    // The middle \hline is a line; the outer ones are the frame's ring.
    expect(horizontalRules(r)).toHaveLength(1);
    expect(r.paths.some((p) => (p.d.match(/M/g) ?? []).length === 2)).toBe(true);
    expect(r.svg).toMatch(/<rect data-frame="true"[^>]*stroke-width="70" fill="none"/);
  });

  it('draws a dashed rule as separate dashes', () => {
    const r = renderMath(String.raw`\begin{array}{c:c} a & b \\ \hdashline c & d \end{array}`, true, 16);
    const line = r.paths.find((p) => (p.d.match(/M/g) ?? []).length > 3);
    expect(line).toBeDefined();
    expect(r.svg).toMatch(/stroke-dasharray="140"/);
  });

  it('outlines \\boxed instead of filling its box over the formula', () => {
    const r = renderMath(String.raw`\boxed{x}`, true, 16);
    const frame = r.paths.find((p) => (p.d.match(/M/g) ?? []).length === 2);
    expect(frame).toBeDefined();
  });

  it('strokes \\cancel and \\enclose{circle}', () => {
    const cancel = renderMath(String.raw`\cancel{x}`, true, 16);
    const plain = renderMath('x', true, 16);
    expect(cancel.paths.length).toBe(plain.paths.length + 1);
    const circle = renderMath(String.raw`\enclose{circle}{x}`, true, 16);
    expect(circle.paths.length).toBe(plain.paths.length + 1);
    expect(circle.paths.at(-1)!.d).toMatch(/C/);
  });
});

describe('stroke outlines', () => {
  it('turns a segment into a quad of its width', () => {
    expect(box(strokeSegment(0, 10, 100, 10, 4))).toEqual({ minX: 0, maxX: 100, minY: 8, maxY: 12 });
  });

  it('extends square caps and dots a round-capped zero dash', () => {
    expect(box(strokeSegment(0, 0, 10, 0, 2, undefined, 'square')).minX).toBe(-1);
    const dots = strokeSegment(0, 0, 280, 0, 70, '0,140', 'round');
    expect((dots.match(/M/g) ?? []).length).toBe(3);
  });

  it('leaves a zero-gap pattern solid', () => {
    expect((strokeSegment(0, 0, 100, 0, 2, '10,0').match(/M/g) ?? []).length).toBe(1);
  });

  it('frames a rect with an outer and an inner edge', () => {
    const d = strokeRect(0, 0, 100, 50, 10);
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect(box(d)).toEqual({ minX: -5, maxX: 105, minY: -5, maxY: 55 });
  });

  it('reads a non-default thickness given in em', () => {
    const out = normalizeTableRules('<line data-line="h" class="mjx-dashed" x1="0" y1="0" x2="1" y2="0" stroke-thickness="0.1" stroke-dasharray="0.2"></line>');
    expect(out).toContain('stroke-width="100"');
    expect(out).toContain('stroke-dasharray="200"');
    expect(out).not.toContain('stroke-thickness');
  });
});
