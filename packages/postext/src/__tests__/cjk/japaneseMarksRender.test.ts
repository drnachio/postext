import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { sesamePath } from '../../canvas-backend/annotations';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine, VDTLineMark } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';

// The sesame (傍点) and the side lines (傍線) of #421 in the canvas and HTML
// backends: the sesame stands on the sheet the same way in horizontal and
// vertical text, the side lines are drawn as the layout placed them.
installSizedStub();

interface Call { op: string; args: unknown[]; fill?: string }

function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: '10px Test', fillStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic' };
  const stack: Record<string | symbol, unknown>[] = [];
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'save') return () => { stack.push({ ...t }); };
      if (key === 'restore') return () => { Object.assign(t, stack.pop() ?? {}); };
      if (key === 'measureText') {
        return (s: string) => {
          const em = Number(/(\d*\.?\d+)px/.exec(String(t.font))?.[1] ?? 10);
          let w = 0;
          for (const ch of s) w += stubCharWidth(ch, em);
          return { width: w };
        };
      }
      if (key in t) return t[key];
      return (...args: unknown[]) => { calls.push({ op: String(key), args, fill: String(t.fillStyle) }); };
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});
const vertical = (extra: Partial<PostextConfig> = {}) => config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' }, ...extra });

const firstLine = (doc: VDTDocument): VDTLine => doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;
/** A mark's centre in the page's flow frame. */
const at = (line: VDTLine, m: VDTLineMark) => ({ x: line.bbox.x + m.x, y: line.baseline + m.y });

/** The lens of the first sesame the canvas draws, as offsets from its
 *  centre (the flow frame). */
function lensOffsets(doc: VDTDocument): { x: number; y: number }[] {
  const line = firstLine(doc);
  const centre = at(line, line.marks!.find((m) => m.kind === 'sesame')!);
  const { canvas, calls } = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  const from = calls.findIndex((c) => c.op === 'moveTo');
  const pts: { x: number; y: number }[] = [];
  const move = calls[from]!;
  pts.push({ x: Number(move.args[0]) - centre.x, y: Number(move.args[1]) - centre.y });
  for (const c of calls.slice(from + 1, from + 3)) {
    expect(c.op).toBe('quadraticCurveTo');
    pts.push({ x: Number(c.args[0]) - centre.x, y: Number(c.args[1]) - centre.y });
    pts.push({ x: Number(c.args[2]) - centre.x, y: Number(c.args[3]) - centre.y });
  }
  return pts;
}

describe('the sesame on a vertical page', () => {
  it('is the horizontal lens turned a quarter turn back', () => {
    const [a, b] = sesamePath(10);
    const [va, vb] = sesamePath(10, true);
    // A quarter turn clockwise (the page's flow transform) takes each
    // vertical point back onto the horizontal one: (x, y) → (−y, x).
    [...va!, ...vb!].forEach((p, i) => {
      const h = [...a!, ...b!][i]!;
      expect(-p.y).toBeCloseTo(h.x, 9);
      expect(p.x).toBeCloseTo(h.y, 9);
    });
  });

  it('stands on the canvas sheet as it does in horizontal text', () => {
    const md = 'これは:dots[大切]なこと';
    const horizontal = lensOffsets(buildDocument({ markdown: md }, config()));
    const turned = lensOffsets(buildDocument({ markdown: md }, vertical()));
    expect(turned).toHaveLength(horizontal.length);
    turned.forEach((p, i) => {
      // The flow frame is turned a quarter turn clockwise onto the sheet.
      expect(-p.y).toBeCloseTo(horizontal[i]!.x, 6);
      expect(p.x).toBeCloseTo(horizontal[i]!.y, 6);
    });
  });

  it('leans like ﹅ on the sheet: its top end left of its bottom end', () => {
    const [a] = sesamePath(10);
    // The lens runs from a[0] (one tip) to a[2] (the other).
    const [top, bottom] = a![0]!.y < a![2]!.y ? [a![0]!, a![2]!] : [a![2]!, a![0]!];
    expect(top.x).toBeLessThan(bottom.x);
  });

  it('is drawn turned back in HTML on a vertical page only', () => {
    const md = 'これは:dots[大切]なこと';
    const pathOf = (html: string) => /<svg aria-hidden="true"[^>]*><path d="([^"]+)"/.exec(html)![1]!;
    const h = pathOf(renderToHtml(buildDocument({ markdown: md }, config()), { mode: 'single' }));
    const v = pathOf(renderToHtml(buildDocument({ markdown: md }, vertical()), { mode: 'single' }));
    expect(h).not.toBe(v);
    const size = 0.3 * 20;
    const d = (pts: { x: number; y: number }[][]) => {
      const p = (q: { x: number; y: number }) => `${(q.x + size).toFixed(3)} ${(q.y + size).toFixed(3)}`;
      return `M${p(pts[0]![0]!)}Q${p(pts[0]![1]!)} ${p(pts[0]![2]!)}Q${p(pts[1]![1]!)} ${p(pts[1]![2]!)}Z`;
    };
    expect(h).toBe(d(sesamePath(size)));
    expect(v).toBe(d(sesamePath(size, true)));
  });
});

describe('side lines on the canvas', () => {
  it('a solid line is one rectangle, a double line two, a dotted line one arc a dot', () => {
    const md = ':sideline[大切な]と:sideline[こと]{style="double"}と:sideline[もの]{style="dotted"}';
    const doc = buildDocument({ markdown: md }, config());
    const line = firstLine(doc);
    const [solid, double, dotted] = line.marks!;
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const rects = calls.filter((c) => c.op === 'fillRect');
    const s = at(line, solid!);
    expect(rects.some((r) => r.args[0] === s.x && r.args[2] === solid!.length && Math.abs(Number(r.args[1]) - (s.y - solid!.thickness / 2)) < 1e-9)).toBe(true);
    const d = at(line, double!);
    const doubleRects = rects.filter((r) => r.args[0] === d.x && r.args[2] === double!.length);
    expect(doubleRects.map((r) => Number(r.args[1]) + double!.thickness / 2)).toEqual([d.y - double!.gap! / 2, d.y + double!.gap! / 2]);
    const o = at(line, dotted!);
    const arcs = calls.filter((c) => c.op === 'arc' && Math.abs(Number(c.args[1]) - o.y) < 1e-9);
    const count = Math.round((dotted!.length! - dotted!.size!) / dotted!.gap!) + 1;
    expect(arcs).toHaveLength(count);
    expect(Number(arcs[0]!.args[0])).toBeCloseTo(o.x + dotted!.size! / 2, 9);
    expect(Number(arcs[arcs.length - 1]!.args[0])).toBeCloseTo(o.x + dotted!.length! - dotted!.size! / 2, 9);
  });

  it('a wavy line is a stroked wave, right of a vertical line', () => {
    const doc = buildDocument({ markdown: ':sideline[大切なこと]{style="wavy"}' }, vertical());
    const line = firstLine(doc);
    expect(line.marks![0]!.kind).toBe('wavy');
    expect(line.marks![0]!.y).toBeLessThan(0);
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(calls.filter((c) => c.op === 'stroke').length).toBeGreaterThan(0);
  });
});

describe('side lines in HTML', () => {
  it('as aria-hidden boxes: a rule, two rules, round dots', () => {
    const doc = buildDocument({ markdown: ':sideline[大切な]と:sideline[こと]{style="double"}と:sideline[もの]{style="dotted"}' }, config());
    const line = firstLine(doc);
    const html = renderToHtml(doc, { mode: 'single' });
    const [solid, double, dotted] = line.marks!;
    const rule = (m: VDTLineMark, y: number) => `left:${m.x.toFixed(3)}px;top:${(y - m.thickness / 2).toFixed(3)}px;width:${m.length!.toFixed(3)}px;`;
    expect(html).toContain(rule(solid!, solid!.y));
    expect(html).toContain(rule(double!, double!.y - double!.gap! / 2));
    expect(html).toContain(rule(double!, double!.y + double!.gap! / 2));
    const dots = html.match(new RegExp(`top:${(dotted!.y - dotted!.size! / 2).toFixed(3)}px;width:${dotted!.size!.toFixed(3)}px;height:${dotted!.size!.toFixed(3)}px;border-radius:50%`, 'g'));
    expect(dots).toHaveLength(Math.round((dotted!.length! - dotted!.size!) / dotted!.gap!) + 1);
    // Side-lined text is no emphasis: no <em>.
    expect(html).not.toContain('<em');
  });
});
