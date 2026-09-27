import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../pipeline';
import { initMathEngine, renderMath, clearMathCache } from '../math';
import { renderToHtml } from '../html-backend';
import type { MathRender } from '../math';
import type { VDTBlock, VDTDocument } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
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

beforeAll(async () => {
  await initMathEngine();
  clearMathCache();
});

/** Bounding box of flattened MathJax paths (absolute commands only). */
function pathsBox(paths: MathRender['paths']): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of paths) {
    for (const cmd of p.d.match(/[A-Za-z][^A-Za-z]*/g) ?? []) {
      if (!/^[MLQC]/.test(cmd)) continue;
      const nums = (cmd.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) {
        minX = Math.min(minX, nums[i]!); maxX = Math.max(maxX, nums[i]!);
        minY = Math.min(minY, nums[i + 1]!); maxY = Math.max(maxY, nums[i + 1]!);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

const displayBlocks = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'mathDisplay');
const inlineMath = (doc: VDTDocument) => doc.blocks
  .flatMap((b) => b.lines.flatMap((l) => l.segments ?? []))
  .filter((s) => s.kind === 'math');

// EF-75. MathJax writes the formula's box in `ex`, one ex being the TeX
// font's x-height (0.442 em); the engine read it as 0.5 em, so every
// formula came out 13 % larger than `bodyText.fontSize × fontSizeScale`.
describe('maths size (EF-75)', () => {
  it('sets 1000 font units of a formula to the requested size: 1 em = fontSizePx', () => {
    for (const [tex, display] of [['x', false], ['\\frac{a}{b}', true], ['\\int_0^1 x^2\\,dx', true]] as const) {
      const r = renderMath(tex, display, 100);
      expect(r.error).toBeUndefined();
      // The viewBox is in MathJax units (1000 per em).
      expect(r.widthPx).toBeCloseTo((r.viewBox.width / 1000) * 100, 1);
      expect(r.heightPx).toBeCloseTo((r.viewBox.height / 1000) * 100, 1);
    }
  });

  it('keeps the baseline where MathJax puts it (depth below the baseline)', () => {
    const r = renderMath('x_i', false, 100);
    // The viewBox starts at -ascent (y grows downwards after MathJax's flip).
    expect(r.ascentPx).toBeCloseTo((-r.viewBox.minY / 1000) * 100, 1);
    expect(r.depthPx).toBeCloseTo(r.heightPx - r.ascentPx, 5);
  });

  it('math.fontSizeScale 1.0 sets formulas at the body size, and scales linearly', () => {
    const md = 'Inline $x$ here.';
    const base = { bodyText: { fontSize: { value: 12, unit: 'pt' as const } } };
    const one = inlineMath(buildDocument({ markdown: md }, base))[0]!.mathRender!;
    const bodyPx = (12 * 300) / 72;
    expect(one.widthPx).toBeCloseTo((one.viewBox.width / 1000) * bodyPx, 1);
    const half = inlineMath(buildDocument({ markdown: md }, { ...base, math: { fontSizeScale: 0.5 } }))[0]!.mathRender!;
    expect(half.widthPx).toBeCloseTo(one.widthPx / 2, 1);
  });
});

// EF-74. A display formula with `\tag` comes back from MathJax as a
// full-width box (`width="100%"`, no viewBox, the equation and its number
// in nested viewports); the engine read no width and the formula vanished.
describe('numbered display formulas (EF-74)', () => {
  it('renders an equation with \\tag the width of its measure, the number flush right', () => {
    const r = renderMath('E = mc^2 \\tag{1}', true, 100, { containerWidthPx: 3000 });
    expect(r.error).toBeUndefined();
    expect(r.widthPx).toBeCloseTo(3000, 5);
    expect(r.heightPx).toBeGreaterThan(100);
    expect(r.paths.length).toBe(8); // E = m c 2 and ( 1 )
    // Coordinates are px of the box.
    expect(r.viewBox).toEqual({ minX: 0, minY: 0, width: 3000, height: r.heightPx });
    const formula = pathsBox(r.paths.slice(0, 5));
    const tag = pathsBox(r.paths.slice(5));
    // Equation centred in the measure…
    expect((formula.minX + formula.maxX) / 2).toBeGreaterThan(1500 - 30);
    expect((formula.minX + formula.maxX) / 2).toBeLessThan(1500 + 30);
    // …number at its right edge, on the same line (the ink of ")" stops
    // its side bearing, ~0.1 em, short of the box).
    expect(tag.maxX).toBeGreaterThan(3000 - 12);
    expect(tag.maxX).toBeLessThanOrEqual(3000 + 0.01);
    // (MathJax rounds the box to 0.001 ex; the parenthesis reaches it.)
    expect(tag.minY).toBeGreaterThan(0);
    expect(tag.maxY).toBeLessThanOrEqual(r.heightPx + 0.05);
    // Same size as the untagged formula.
    const plain = renderMath('E = mc^2', true, 100);
    const plainBox = pathsBox(plain.paths);
    const plainWidthPx = ((plainBox.maxX - plainBox.minX) / plain.viewBox.width) * plain.widthPx;
    expect(formula.maxX - formula.minX).toBeCloseTo(plainWidthPx, 0);
  });

  it('without a measure, the numbered formula takes its natural (minimum) width', () => {
    const r = renderMath('a = b \\tag{2}', true, 100);
    expect(r.error).toBeUndefined();
    expect(r.widthPx).toBeGreaterThan(200);
    expect(r.widthPx).toBeLessThan(2000);
    expect(pathsBox(r.paths).maxX).toBeLessThanOrEqual(r.widthPx + 0.01);
  });

  it('numbers every tagged row of an aligned environment', () => {
    const r = renderMath('\\begin{align} a &= b \\tag{3}\\\\ c &= d \\tag{4} \\end{align}', true, 100, { containerWidthPx: 2500 });
    expect(r.error).toBeUndefined();
    expect(r.widthPx).toBeCloseTo(2500, 5);
    const box = pathsBox(r.paths);
    expect(box.maxX).toBeGreaterThan(2500 - 12);
    expect(box.minY).toBeGreaterThanOrEqual(-0.01);
    expect(box.maxY).toBeLessThanOrEqual(r.heightPx + 0.01);
  });

  it('lays a numbered formula out across the column, painted in every backend', () => {
    const doc = buildDocument({ markdown: 'Energy:\n\n$$E = mc^2 \\tag{1}$$\n\nAfter.' });
    const [block] = displayBlocks(doc);
    expect(block).toBeDefined();
    const render = block!.mathRender!;
    expect(render.error).toBeUndefined();
    const column = doc.pages[block!.pageIndex]!.columns[block!.columnIndex]!;
    expect(render.widthPx).toBeCloseTo(column.bbox.width, 3);
    expect(block!.lines[0]!.bbox.width).toBeCloseTo(column.bbox.width, 3);
    expect(block!.bbox.height).toBeGreaterThan(0);
    // HTML: a self-contained SVG of the measured box, no nested viewports
    // left for the browser to resolve.
    const html = renderToHtml(doc);
    const svg = [...html.matchAll(/<svg\b[^>]*\bwidth="([\d.]+)"[^>]*>[\s\S]*?<\/svg>/g)]
      .find((m) => Math.abs(Number(m[1]) - column.bbox.width) < 0.01);
    expect(svg).toBeDefined();
    expect(svg![0]).not.toContain('data-table');
    expect(svg![0]).toContain('<path');
  });

  it('keeps the characters MathJax sets as text in the HTML of a numbered formula', () => {
    // "ó" is outside MathJax's TeX fonts: it comes as a <text> node, which
    // the unnumbered formula's markup keeps. The flattened markup of a
    // numbered one must keep it too, placed where MathJax put it.
    const plain = renderMath('x = \\text{ecuación}', true, 100);
    expect(plain.svg).toMatch(/<text\b[^>]*>ó<\/text>/);
    const r = renderMath('x = \\text{ecuación} \\tag{5}', true, 100, { containerWidthPx: 3000 });
    expect(r.error).toBeUndefined();
    const text = /<text\b([^>]*)>ó<\/text>/.exec(r.svg);
    expect(text).not.toBeNull();
    expect(r.svg).not.toContain('<svg data-');
    // Its transform is flattened into the box's px, like the paths: the
    // "ó" sits among the formula's glyphs, left of the number.
    const m = /transform="matrix\(([^)]*)\)"/.exec(text![1]!);
    expect(m).not.toBeNull();
    const [, , , , e, f] = m![1]!.split(' ').map(Number);
    const tag = pathsBox(r.paths.slice(-3)); // ( 5 )
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(tag.minX);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(r.heightPx);
  });

  it('keeps untagged display formulas as they were (same width in any measure)', () => {
    const a = renderMath('\\sum_{k=1}^n k', true, 100, { containerWidthPx: 800 });
    const b = renderMath('\\sum_{k=1}^n k', true, 100, { containerWidthPx: 5000 });
    const c = renderMath('\\sum_{k=1}^n k', true, 100);
    expect(a.widthPx).toBeCloseTo(c.widthPx, 5);
    expect(b.widthPx).toBeCloseTo(c.widthPx, 5);
    expect(a.svg).toBe(c.svg);
  });
});
