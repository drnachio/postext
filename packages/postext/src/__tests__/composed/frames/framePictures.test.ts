/**
 * Pictures in a frame set in a writing mode other than its page's (#960):
 * a vertical frame is turned a quarter turn on the page, so its pictures
 * are laid out counter-rotated and stand upright, inside the box.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { frameContentRect } from '../../../composed/paint.js';
import { resourceBlockToPage } from '../../../vdt.js';
import { renderPageToCanvas, registerResourceImage } from '../../../index.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { installSizedStub } from '../../vertical/stub.js';

installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(500), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } } as never,
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(20), textAlign: 'left' } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  locale: 'zh-Hans',
};
const RELIEF: Resource = {
  id: 'relief', typeId: 'figure', kind: 'bitmap', altText: 'A relief', caption: 'Relief', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'relief.png', format: 'png', width: 400, height: 300 },
} as Resource;
const md = '::::page{template="sheet"}\n正文。\n\n:::frame{slot="side"}\n第1回\n\n:::figure{resource="relief"}\n:::\n\n也\n:::\n::::\n';
const build = (mode: 'vertical-rl' | 'horizontal-tb', extra: Partial<PostextConfig> = {}): VDTDocument =>
  buildDocument({ markdown: md, resources: [RELIEF] }, {
    ...PAGE, ...extra,
    pageTemplates: [{ id: 'sheet', frames: [
      { name: 'main', flow: true, width: pt(100), height: pt(100), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'side', writingMode: mode, width: pt(150), height: pt(300), placement: { anchor: { to: 'container', edge: 'top-right' } } },
    ] }],
  } as PostextConfig, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const picture = (page: VDTPage, name: string): VDTBlock =>
  frameOf(page, name).blockIds.map((id) => page.floats!.find((b) => b.id === id)!).find((b) => b.resourceBlock)!;

describe('a picture in a frame turned by its writing mode (#960)', () => {
  it('stands upright in a vertical frame of a horizontal page, inside its box, with room left for the text', () => {
    const page = composedPage(build('vertical-rl'));
    const side = frameOf(page, 'side');
    expect(side.rotate).toBe(90);
    const rb = picture(page, 'side').resourceBlock!;
    // Counter-rotated against the frame's turn.
    expect(rb.rotation?.direction).toBe('ccw');
    // Its upright frame, put through the rotation, lies in the frame's box.
    const box = frameContentRect(side);
    const corners = [[0, 0], [rb.rotation!.width, 0], [0, rb.rotation!.height], [rb.rotation!.width, rb.rotation!.height]]
      .map(([x, y]) => resourceBlockToPage(rb, x!, y!));
    for (const c of corners) {
      expect(c.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(c.x).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(c.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(c.y).toBeLessThanOrEqual(box.y + box.height + 0.5);
    }
    // The paragraph after it keeps clear of it along the box's stacking axis.
    const lines = frameOf(page, 'side').blockIds.map((id) => page.floats!.find((b) => b.id === id)!);
    const after = lines.find((b) => b.type === 'paragraph' && b.lines[0]?.text === '也')!;
    const pic = picture(page, 'side');
    expect(after.bbox.y).toBeGreaterThanOrEqual(pic.bbox.y + pic.bbox.height - 0.5);
    expect(pic.bbox.y + pic.bbox.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  });

  it('is painted upright on the sheet: the frame\'s turn and the picture\'s cancel', () => {
    const doc = build('vertical-rl');
    const page = composedPage(doc);
    registerResourceImage('relief.png', { width: 400, height: 300 } as never);
    type M = [number, number, number, number, number, number];
    const mul = (m: M, n: M): M => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
    let m: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    const drawn: { m: M; w: number; h: number }[] = [];
    const api: Record<string, unknown> = {
      save: () => { stack.push(m); },
      restore: () => { m = stack.pop() ?? m; },
      transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
      setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = [a, b, c, d, e, f]; },
      translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
      scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
      rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
      drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => { drawn.push({ m, w, h }); },
      measureText: (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 5 }),
    };
    const state: Record<string, unknown> = { font: '10px Test', letterSpacing: '0px' };
    const ctx = new Proxy(state, {
      get(t, k) { if (typeof k === 'string' && k in api) return api[k]; if (k in t) return t[k as string]; return () => undefined; },
      set(t, k, v) { t[k as string] = v; return true; },
    });
    renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    expect(drawn.length).toBe(1);
    // Upright: no turn left in the matrix (x axis along x, y axis along y).
    const { m: pm } = drawn[0]!;
    expect(Math.abs(pm[1])).toBeLessThan(1e-6);
    expect(Math.abs(pm[2])).toBeLessThan(1e-6);
    expect(pm[0]).toBeGreaterThan(0);
    expect(pm[3]).toBeGreaterThan(0);
  });

  it('a horizontal card on a vertical page keeps its picture as before: no counter-rotation', () => {
    const page = composedPage(build('horizontal-tb', { layout: { writingMode: 'vertical-rl', layoutType: 'single' } as never }));
    expect(frameOf(page, 'side').rotate).toBe(-90);
    expect(picture(page, 'side').resourceBlock!.rotation).toBeUndefined();
  });

  it('a frame in the page\'s own mode keeps its picture as before', () => {
    const page = composedPage(build('horizontal-tb'));
    expect(picture(page, 'side').resourceBlock!.rotation).toBeUndefined();
  });

  it('stands upright in a vertical frame of a right-to-left page too', () => {
    const page = composedPage(build('vertical-rl', { direction: 'rtl' }));
    const rb = picture(page, 'side').resourceBlock!;
    expect(rb.rotation?.direction).toBe('ccw');
    const side = frameOf(page, 'side');
    expect(side.unmirrorX).toBeDefined();
    const box = frameContentRect(side);
    const c = resourceBlockToPage(rb, rb.rotation!.width, rb.rotation!.height);
    expect(c.x).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(c.y).toBeGreaterThanOrEqual(box.y - 0.5);
  });
});

describe('a picture in a frame of a vertical page\'s own mode (#971)', () => {
  const VERTICAL = { layout: { writingMode: 'vertical-rl', layoutType: 'single' } } as unknown as Partial<PostextConfig>;
  const inPageMode = (extra: Partial<PostextConfig> = {}): VDTDocument =>
    buildDocument({ markdown: md, resources: [RELIEF] }, {
      ...PAGE, ...VERTICAL, ...extra,
      pageTemplates: [{ id: 'sheet', frames: [
        { name: 'main', flow: true, width: pt(100), height: pt(100), placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'side', width: pt(150), height: pt(300), placement: { anchor: { to: 'container', edge: 'top-right' } } },
      ] }],
    } as PostextConfig, createMeasurementCache());

  it('stands upright, inside its box, with room left for the text', () => {
    const page = composedPage(inPageMode());
    const side = frameOf(page, 'side');
    const rb = picture(page, 'side').resourceBlock!;
    expect(rb.rotation?.direction).toBe('ccw');
    const box = frameContentRect(side);
    const corners = [[0, 0], [rb.rotation!.width, 0], [0, rb.rotation!.height], [rb.rotation!.width, rb.rotation!.height]]
      .map(([x, y]) => resourceBlockToPage(rb, x!, y!));
    for (const c of corners) {
      expect(c.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(c.x).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(c.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(c.y).toBeLessThanOrEqual(box.y + box.height + 0.5);
    }
  });

  it('shrinks to a narrow box and takes the room it needs when the frame has no height of its own', () => {
    const narrow = composedPage(buildDocument({ markdown: md, resources: [RELIEF] }, {
      ...PAGE, ...VERTICAL,
      pageTemplates: [{ id: 'sheet', frames: [
        { name: 'main', flow: true, width: pt(100), height: pt(100), placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'side', width: pt(70), placement: { anchor: { to: 'container', edge: 'top-right' } } },
      ] }],
    } as PostextConfig, createMeasurementCache()));
    const side = frameOf(narrow, 'side');
    const rb = picture(narrow, 'side').resourceBlock!;
    expect(rb.rotation?.direction).toBe('ccw');
    const box = frameContentRect(side);
    // Page width of the upright picture (the stacking axis) stays inside the box.
    const corners = [[0, 0], [rb.rotation!.width, rb.rotation!.height]].map(([x, y]) => resourceBlockToPage(rb, x!, y!));
    for (const c of corners) {
      expect(c.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(c.x).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(c.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(c.y).toBeLessThanOrEqual(box.y + box.height + 0.5);
    }
  });

  it('a frame that says the page\'s mode itself is the same', () => {
    const page = composedPage(inPageMode());
    const same = composedPage(buildDocument({ markdown: md, resources: [RELIEF] }, {
      ...PAGE, ...VERTICAL,
      pageTemplates: [{ id: 'sheet', frames: [
        { name: 'main', flow: true, width: pt(100), height: pt(100), placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'side', writingMode: 'vertical-rl', width: pt(150), height: pt(300), placement: { anchor: { to: 'container', edge: 'top-right' } } },
      ] }],
    } as PostextConfig, createMeasurementCache()));
    expect(picture(same, 'side').resourceBlock!.rotation?.direction).toBe(picture(page, 'side').resourceBlock!.rotation?.direction);
    expect(picture(same, 'side').bbox).toEqual(picture(page, 'side').bbox);
  });
});
