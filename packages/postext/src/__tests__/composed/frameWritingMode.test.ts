import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { PageTemplate } from '../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../index.js';
import { framePageRect, frameMatrix } from '../../composed/paint.js';
import { flowRectToPage } from '../../vdt.js';
import { sourceAt } from '../../composed/sourceMap.js';
import { installSizedStub, stubCharWidth } from '../vertical/stub.js';
import { renderPageToCanvas } from '../../index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';

installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px. Body text 10 pt, so a CJK character is 10 px either way, a
// lone digit 5 px across a horizontal line and a 10 px upright cell down a vertical one.
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(500), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } } as never,
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(20), textAlign: 'left' } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  locale: 'zh-Hans',
};
const VERTICAL: Partial<PostextConfig> = { layout: { writingMode: 'vertical-rl', layoutType: 'single' } as never };
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const textBlocks = (page: VDTPage, name: string): VDTBlock[] => {
  const frame = frameOf(page, name);
  return frame.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).filter((b) => b && b.type !== 'callout');
};

/** A box of `mode` beside the page's own text, 60 × 200 pt as it stands on the page. */
const template = (mode: 'vertical-rl' | 'horizontal-tb', height: 'auto' | number = 200): PageTemplate => ({
  id: 'sheet',
  frames: [
    { name: 'main', flow: true, width: pt(200), height: pt(200), placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'side', writingMode: mode, width: pt(60), ...(height === 'auto' ? {} : { height: pt(height) }), placement: { anchor: { to: 'container', edge: 'top-right' } } },
  ],
});
const md = '::::page{template="sheet"}\n正文。\n\n:::frame{slot="side"}\n第1回\n:::\n::::\n';
const build = (mode: 'vertical-rl' | 'horizontal-tb', extra: Partial<PostextConfig> = {}, height: 'auto' | number = 200) =>
  buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: [template(mode, height)] } as PostextConfig, createMeasurementCache());
/** The width the digit takes along its line: 10 px standing upright in a cell down a
 *  vertical line, 5 px across a horizontal one (with a quarter-em gap each side). */
const digitWidth = (b: VDTBlock): number => b.lines.flatMap((l) => l.segments ?? []).find((s) => s.text === '1')!.width;

describe('a frame set in its own writing mode (#944)', () => {
  it('a vertical box on a horizontal page: laid out vertically in its box turned a quarter turn', () => {
    const page = composedPage(build('vertical-rl'));
    const side = frameOf(page, 'side');
    expect(side.writingMode).toBe('vertical-rl');
    expect(side.rotate).toBe(90);
    // The content's box is the page's box turned: 200 wide (its lines' length), 60 tall.
    expect(side.rect.width).toBeCloseTo(200);
    expect(side.rect.height).toBeCloseTo(60);
    const box = framePageRect(side);
    expect(box.width).toBeCloseTo(60);
    expect(box.height).toBeCloseTo(200);
    // At the area's top right, as placed.
    expect(box.x + box.width).toBeCloseTo(page.contentArea.x + page.contentArea.width);
    expect(box.y).toBeCloseTo(page.contentArea.y);
    // The digit stands upright in a cell of its own down the line.
    const [para] = textBlocks(page, 'side');
    expect(digitWidth(para!)).toBeCloseTo(10);
    // The frame's matrix turns the first line to the box's right edge, running down.
    const m = frameMatrix(side)!;
    const at = (x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
    const line = para!.lines[0]!.bbox;
    const start = at(line.x, line.y);
    const end = at(line.x + line.width, line.y);
    expect(start.x).toBeGreaterThan(box.x + box.width / 2);
    expect(start.x).toBeLessThanOrEqual(box.x + box.width + 0.01);
    expect(end.y).toBeGreaterThan(start.y);
    expect(start.y).toBeGreaterThanOrEqual(box.y - 0.01);
    // The book's own frame stays horizontal: the digit is half a character.
    const [main] = textBlocks(page, 'main');
    expect(main!.lines.length).toBeGreaterThan(0);
    expect(frameOf(page, 'main').writingMode).toBeUndefined();
  });

  it('a horizontal card on a vertical page: laid out horizontally, turned back to stand on the sheet', () => {
    const page = composedPage(build('horizontal-tb', VERTICAL));
    expect(page.flow?.writingMode).toBe('vertical-rl');
    const side = frameOf(page, 'side');
    expect(side.writingMode).toBe('horizontal-tb');
    expect(side.rotate).toBe(-90);
    const [para] = textBlocks(page, 'side');
    // Horizontal: the lone digit is half a character wide.
    expect(digitWidth(para!)).toBeCloseTo(5);
  });

  it('a frame in the page’s own mode is set as before', () => {
    const page = composedPage(build('horizontal-tb'));
    const side = frameOf(page, 'side');
    expect(side.writingMode).toBeUndefined();
    expect(side.rotate).toBe(0);
    expect(side.rect.width).toBeCloseTo(60);
  });

  it('an auto height is the least that holds its lines across the box', () => {
    const page = composedPage(build('vertical-rl', {}, 'auto'));
    const box = framePageRect(frameOf(page, 'side'));
    expect(box.width).toBeCloseTo(60);
    // The least height whose lines, set side by side, fit the 60 pt across:
    // shorter than one line of the three characters, and nothing left over.
    expect(box.height).toBeLessThan(30);
    expect(box.height).toBeGreaterThan(0);
    expect(frameOf(page, 'side').overflowPx).toBe(0);
  });

  describe('a vertical frame on a right-to-left page (#960)', () => {
    const RTL: Partial<PostextConfig> = { direction: 'rtl' };
    it('is laid out vertically, as on a left-to-right page, and says it is painted unmirrored', () => {
      const doc = build('vertical-rl', RTL, 200);
      const page = composedPage(doc);
      const side = frameOf(page, 'side');
      expect(page.flow?.writingMode).toBe('horizontal-tb');
      expect(side.writingMode).toBe('vertical-rl');
      expect(side.rotate).toBe(90);
      expect(side.unmirrorX).toBe((page.flow as { mirror: { originX: number } }).mirror.originX);
      const box = framePageRect(side);
      expect(box.width).toBeCloseTo(60);
      expect(box.height).toBeCloseTo(200);
      // The digit stands upright in its own cell down the line.
      const [para] = textBlocks(page, 'side');
      expect(digitWidth(para!)).toBeCloseTo(10);
      // The page's own frame keeps its mode and its mirrored line order.
      expect(frameOf(page, 'main').writingMode).toBeUndefined();
      expect(frameOf(page, 'main').unmirrorX).toBeUndefined();
    });

    it('lands, through the mirror, in the box the page shows, its first line at that box\'s right edge running down', () => {
      const doc = build('vertical-rl', RTL, 200);
      const page = composedPage(doc);
      const side = frameOf(page, 'side');
      const origin = side.unmirrorX!;
      const m = frameMatrix(side)!;
      const [para] = textBlocks(page, 'side');
      const line = para!.lines[0]!.bbox;
      // The matrix puts the block in the flow frame; the page's mirror puts the flow on the sheet.
      const onSheet = (x: number, y: number) => ({ x: origin - (m[0] * x + m[2] * y + m[4]), y: m[1] * x + m[3] * y + m[5] });
      const start = onSheet(line.x, line.y);
      const end = onSheet(line.x + line.width, line.y);
      const box = flowRectToPage(page, framePageRect(side));
      // The box is where the mirrored flow puts the frame (top-right of the flow: the sheet's top left).
      expect(box.x).toBeCloseTo(page.width - (page.contentArea.x + page.contentArea.width), 0);
      expect(start.x).toBeGreaterThan(box.x + box.width / 2);
      expect(start.x).toBeLessThanOrEqual(box.x + box.width + 0.01);
      expect(end.y).toBeGreaterThan(start.y);
      expect(start.y).toBeGreaterThanOrEqual(box.y - 0.01);
    });

    it('does not turn the lines of the frame back: they keep the measurer\'s order', () => {
      const doc = build('vertical-rl', RTL, 200);
      const page = composedPage(doc);
      for (const b of textBlocks(page, 'side')) for (const l of b.lines) expect(l.order).toBeUndefined();
    });

    it('the canvas paints its characters upright, one under the other down one column, inside the box', () => {
      const doc = build('vertical-rl', RTL, 200);
      const page = composedPage(doc);
      const painted = paint(page, doc).filter((p) => /[第回]/.test(p.text));
      expect(painted.length).toBe(2);
      for (const p of painted) expect([p.ax, p.ay]).toEqual([1, 0]);
      expect(painted[0]!.x).toBeCloseTo(painted[1]!.x, 3);
      expect(painted[1]!.y).toBeGreaterThan(painted[0]!.y);
      const box = flowRectToPage(page, framePageRect(frameOf(page, 'side')));
      for (const p of painted) {
        expect(p.x).toBeGreaterThanOrEqual(box.x - 0.01);
        expect(p.x).toBeLessThanOrEqual(box.x + box.width + 0.01);
      }
    });

    it('a click on its character on the sheet finds it in the Markdown', () => {
      const doc = build('vertical-rl', RTL, 200);
      const page = composedPage(doc);
      const painted = paint(page, doc).find((p) => p.text === '回')!;
      // A point inside that character's cell on the sheet (its origin is the cell's top-left, the cell 10 pt).
      const chain = sourceAt(doc, page.index, painted.x + 4, painted.y - 4);
      const glyph = chain.find((e) => e.level === 'text')!;
      expect(md.slice((glyph.source as { start: number }).start, (glyph.source as { end: number }).end)).toBe('回');
      expect(chain.find((e) => e.level === 'frame')?.id).toBe('cp0:side');
    });

    it('the HTML marks the frame, so that nothing in it is turned back by the mirrored flow', () => {
      const html = renderToHtml(build('vertical-rl', RTL, 200));
      expect(html).toContain('class="pt-frame pt-unmirrored" data-frame-id="cp0:side"');
      expect(html).toContain('.pt-flow-mirrored .pt-unmirrored [style*="white-space:pre"]');
      expect(html).not.toContain('class="pt-frame pt-unmirrored" data-frame-id="cp0:main"');
    });
  });

  it('a click on a vertical frame’s character on the page finds it in the Markdown', () => {
    const doc = build('vertical-rl');
    const page = composedPage(doc);
    const side = frameOf(page, 'side');
    const [para] = textBlocks(page, 'side');
    const line = para!.lines[0]!;
    // The third cell of the line (回), its centre, put on the page through the frame's turn.
    const segs = line.segments ?? [];
    let x = line.bbox.x;
    for (const seg of segs) {
      if (seg.text === '回') break;
      x += seg.width;
    }
    const m = frameMatrix(side)!;
    const fx = x + 5;
    const fy = line.bbox.y + line.bbox.height / 2;
    const at = { x: m[0] * fx + m[2] * fy + m[4], y: m[1] * fx + m[3] * fy + m[5] };
    const chain = sourceAt(doc, page.index, at.x, at.y);
    const glyph = chain.find((e) => e.level === 'text')!;
    expect(glyph.source.kind).toBe('markdown');
    expect(md.slice((glyph.source as { start: number }).start, (glyph.source as { end: number }).end)).toBe('回');
    expect(chain.find((e) => e.level === 'frame')?.id).toBe('cp0:side');
  });

  it('the HTML writes a vertical frame’s lines set vertically, a horizontal card’s across', () => {
    const frameHtml = (html: string, id: string): string => {
      const at = html.indexOf(`data-frame-id="${id}"`);
      const next = html.indexOf('class="pt-frame"', at + 1);
      return html.slice(at, next < 0 ? undefined : next);
    };
    const v = renderToHtml(build('vertical-rl'));
    expect(frameHtml(v, 'cp0:side')).toContain('writing-mode:vertical-rl');
    expect(frameHtml(v, 'cp0:main')).not.toContain('writing-mode:vertical-rl');
    const h = renderToHtml(build('horizontal-tb', VERTICAL));
    expect(frameHtml(h, 'cp0:side')).not.toContain('writing-mode:vertical-rl');
    expect(frameHtml(h, 'cp0:main')).toContain('writing-mode:vertical-rl');
  });

  it('the canvas paints a vertical frame’s characters upright, one under the other down its column', () => {
    const doc = build('vertical-rl', {}, 200);
    const page = composedPage(doc);
    const painted = paint(page, doc).filter((p) => /[第回]/.test(p.text));
    expect(painted.length).toBe(2);
    // Upright on the sheet, in one column, the second below the first.
    for (const p of painted) expect([p.ax, p.ay]).toEqual([1, 0]);
    expect(painted[0]!.x).toBeCloseTo(painted[1]!.x, 3);
    expect(painted[1]!.y).toBeGreaterThan(painted[0]!.y);
    // The frame's main text is set across, as the page is.
    const main = paint(page, doc).filter((p) => /[正文]/.test(p.text));
    expect(main.every((p) => p.ax === 1 && p.ay === 0)).toBe(true);
  });

  it('the canvas paints a horizontal card on a vertical page across the sheet', () => {
    const doc = build('horizontal-tb', VERTICAL);
    const page = composedPage(doc);
    const painted = paint(page, doc).filter((p) => /[第回]/.test(p.text));
    expect(painted.length).toBe(2);
    const ys = new Set(painted.map((p) => Math.round(p.y)));
    // One line across the sheet: both on one baseline, left to right.
    expect(ys.size).toBe(1);
    expect(painted[1]!.x).toBeGreaterThan(painted[0]!.x);
    for (const p of painted) expect([p.ax, p.ay]).toEqual([1, 0]);
  });
});

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
/** Every `fillText` of a page painted on a recording context: the text,
 *  where its origin lands on the sheet and its x axis there. */
function paint(page: VDTPage, doc: VDTDocument): { text: string; x: number; y: number; ax: number; ay: number }[] {
  const out: { text: string; x: number; y: number; ax: number; ay: number }[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const state: Record<string, unknown> = { font: '10px Test', letterSpacing: '0px' };
  const size = () => Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? 10);
  const api: Record<string, unknown> = {
    save: () => { stack.push(m); },
    restore: () => { m = stack.pop() ?? m; },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = [a, b, c, d, e, f]; },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => {
      out.push({ text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5], ax: Math.round(m[0] * 1000) / 1000 + 0, ay: Math.round(m[1] * 1000) / 1000 + 0 });
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
  renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
  return out;
}
