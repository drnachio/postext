import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  buildDocument,
  clearResourceImages,
  registerResourceImage,
  renderPageToCanvas,
} from '../../index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../index.js';
import { deviceScaleOf, rasterScaleOf } from '../../canvas-backend/deviceScale.js';
import { drawResourceImage, resourceRasterCacheBytes } from '../../canvas-backend/renderResourceBlock.js';
import { initMathEngine, clearMathCache } from '../../math/index.js';
import { getMathRaster } from '../../math/rasterCache.js';
import type { MathRender } from '../../math/types.js';

// A vector picture (an SVG `<img>`, a formula) is rasterised once into an
// offscreen bitmap and blitted on later paints. The bitmap must have the
// size the picture shows at in device pixels: a page painted with
// `scale: 1.5` scales the context, and a bitmap of the box's page pixels
// would be upsampled, soft beside the text (#674).

/** Sizes of the bitmaps rasterised from an image source, in order. */
const rasters: [number, number][] = [];

class RasterCtx {
  font = '';
  fillStyle = '';
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(4);
  }
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
  drawImage(_image: unknown, _x: number, _y: number, w: number, h: number): void {
    rasters.push([w, h]);
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray([0, 0, 0, 255]) };
  }
  putImageData(): void {}
  scale(): void {}
  translate(): void {}
  fill(): void {}
}
class FakeOffscreenCanvas {
  ctx: RasterCtx;
  constructor(public width = 1, public height = 1) {
    this.ctx = new RasterCtx(width, height);
  }
  getContext(): RasterCtx {
    return this.ctx;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeOffscreenCanvas;
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class {};

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
/** `m` followed by `n` in user space, as a canvas composes transforms. */
const mul = (m: Matrix, n: Matrix): Matrix => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});

interface Blit {
  /** The source drawn: an offscreen bitmap, or the registered image. */
  src: unknown;
  /** The bitmap's size (an offscreen bitmap only). */
  size?: [number, number];
  box: [number, number, number, number];
}

/** A page canvas whose context keeps its transform and records every
 *  `drawImage`. */
function pageCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; blits: Blit[] } {
  const blits: Blit[] = [];
  let m = IDENTITY;
  const stack: Matrix[] = [];
  const own: Record<string, unknown> = {
    save: () => { stack.push(m); },
    restore: () => { m = stack.pop() ?? m; },
    scale: (x: number, y: number) => { m = mul(m, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); },
    translate: (x: number, y: number) => { m = mul(m, { ...IDENTITY, e: x, f: y }); },
    rotate: (t: number) => { m = mul(m, { a: Math.cos(t), b: Math.sin(t), c: -Math.sin(t), d: Math.cos(t), e: 0, f: 0 }); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, { a, b, c, d, e, f }); },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = { a, b, c, d, e, f }; },
    getTransform: () => ({ ...m }),
    measureText: (s: string) => ({ width: s.length * 7 }),
    drawImage: (src: unknown, x: number, y: number, w: number, h: number) => {
      blits.push({ src, ...(src instanceof FakeOffscreenCanvas ? { size: [src.width, src.height] as [number, number] } : {}), box: [x, y, w, h] });
    },
  };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (typeof key === 'string' && key in own) return own[key];
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ctx: ctx as unknown as CanvasRenderingContext2D, blits };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const CONFIG: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, dpi: 72 },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
};
const INK = '#295aa3';

const FIGURE: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'svg',
  createdAt: 0,
  updatedAt: 0,
  svg: { fileId: 'fig.svg', width: 100, height: 50 },
  placement: { position: 'here' },
};

const SVG = { vector: 'fig.svg' } as unknown as CanvasImageSource;

function figureDoc(config: PostextConfig = CONFIG): { doc: VDTDocument; box: { width: number; height: number } } {
  const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [FIGURE] }, config);
  const block = doc.blocks.find((b) => b.resourceBlock);
  return { doc, box: block!.resourceBlock!.bodyRect };
}

/** The figure's blit on a page painted at `scale`. */
function paintAt(doc: VDTDocument, scale: number, singleInk = false): Blit {
  const { canvas, blits } = pageCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas, { scale, ...(singleInk ? { singleInk: true } : {}) });
  expect(blits).toHaveLength(1);
  return blits[0]!;
}

beforeEach(() => {
  clearResourceImages();
  rasters.length = 0;
});

describe('device scale of a context', () => {
  it('reads the scale along each axis from the transform', () => {
    const { ctx } = pageCanvas();
    expect(deviceScaleOf(ctx)).toEqual({ x: 1, y: 1 });
    ctx.scale(1.5, 2);
    ctx.translate(40, 10);
    expect(deviceScaleOf(ctx)).toEqual({ x: 1.5, y: 2 });
  });

  it('follows a quarter turn and a mirror', () => {
    const { ctx } = pageCanvas();
    ctx.scale(3, 2);
    ctx.rotate(Math.PI / 2);
    // The box's x axis now runs down the device's y.
    expect(deviceScaleOf(ctx).x).toBeCloseTo(2, 9);
    expect(deviceScaleOf(ctx).y).toBeCloseTo(3, 9);
    ctx.scale(-1, 1);
    expect(deviceScaleOf(ctx).x).toBeCloseTo(2, 9);
  });

  it('is 1 on a context without getTransform', () => {
    expect(deviceScaleOf({} as CanvasRenderingContext2D)).toEqual({ x: 1, y: 1 });
    expect(deviceScaleOf({ getTransform: () => undefined } as unknown as CanvasRenderingContext2D)).toEqual({ x: 1, y: 1 });
  });

  it('rasterises at the page size at or below it, and a rounding of the page to whole pixels is not a scale', () => {
    const at = (s: number) => rasterScaleOf({ getTransform: () => ({ a: s, b: 0, c: 0, d: s, e: 0, f: 0 }) } as unknown as CanvasRenderingContext2D).x;
    expect(at(0.4)).toBe(1);
    expect(at(1)).toBe(1);
    expect(at(1.0004)).toBe(1);
    expect(at(1.47)).toBe(1.47);
  });
});

describe('raster of a vector picture', () => {
  it('has the size the picture shows at: scale 1, 1.5 and 3', () => {
    const { doc, box } = figureDoc();
    registerResourceImage('fig.svg', SVG, { vector: true });
    for (const scale of [1, 1.5, 3]) {
      rasters.length = 0;
      const blit = paintAt(doc, scale);
      const size: [number, number] = [Math.round(box.width * scale), Math.round(box.height * scale)];
      expect(rasters).toEqual([size]);
      expect(blit.size).toEqual(size);
      // Blitted into the box in page pixels, whatever the bitmap's size.
      expect(blit.box.slice(2)).toEqual([box.width, box.height]);
    }
  });

  it('keeps the page size below scale 1', () => {
    const { doc, box } = figureDoc();
    registerResourceImage('fig.svg', SVG, { vector: true });
    expect(paintAt(doc, 0.5).size).toEqual([Math.round(box.width), Math.round(box.height)]);
    expect(paintAt(doc, 0.25).size).toEqual([Math.round(box.width), Math.round(box.height)]);
    expect(rasters).toHaveLength(1);
  });

  it('is cached by its size: one rasterisation per scale, none on a repaint', () => {
    const { doc } = figureDoc();
    registerResourceImage('fig.svg', SVG, { vector: true });
    const first = paintAt(doc, 1.5);
    const again = paintAt(doc, 1.5);
    expect(again.src).toBe(first.src);
    expect(rasters).toHaveLength(1);
    const larger = paintAt(doc, 3);
    expect(larger.src).not.toBe(first.src);
    expect(rasters).toHaveLength(2);
    // Back at the first scale its bitmap is still there.
    expect(paintAt(doc, 1.5).src).toBe(first.src);
    expect(paintAt(doc, 3).src).toBe(larger.src);
    expect(rasters).toHaveLength(2);
    const [a, b] = rasters;
    expect(resourceRasterCacheBytes()).toBe((a![0] * a![1] + b![0] * b![1]) * 4);
  });

  it('tints the bitmap of a single-ink picture at the same size', () => {
    const config: PostextConfig = { ...CONFIG, diagramStyle: { singleInk: true, inkColor: { hex: INK, model: 'hex' } } };
    const { doc, box } = figureDoc(config);
    registerResourceImage('fig.svg', SVG, { vector: true });
    const blit = paintAt(doc, 3, true);
    expect(blit.size).toEqual([Math.round(box.width * 3), Math.round(box.height * 3)]);
    // The untinted bitmap of the same size is another entry.
    rasters.length = 0;
    const plain = figureDoc();
    expect(paintAt(plain.doc, 3).src).not.toBe(blit.src);
    expect(rasters).toHaveLength(1);
  });

  it('does not rasterise a bitmap source', () => {
    const { doc } = figureDoc();
    const bitmap = { bitmap: true } as unknown as CanvasImageSource;
    registerResourceImage('fig.svg', bitmap, { vector: false });
    expect(paintAt(doc, 3).src).toBe(bitmap);
    expect(rasters).toHaveLength(0);
  });

  it('follows the transform of the place it is drawn at (a design image, a cell image, a turned figure)', () => {
    registerResourceImage('icon.svg', SVG, { vector: true });
    const { ctx, blits } = pageCanvas();
    ctx.scale(2, 2);
    ctx.translate(10, 10);
    ctx.rotate(-Math.PI / 2);
    expect(drawResourceImage(ctx, 'icon.svg', 0, 0, 40, 30)).toBe(true);
    expect(blits[0]!.size).toEqual([80, 60]);
  });

  it('draws the source itself where the bitmap would pass the bound', () => {
    registerResourceImage('map.svg', SVG, { vector: true });
    const { ctx, blits } = pageCanvas();
    // 3000 × 2000 page px at ×4: 96 megapixels.
    ctx.scale(4, 4);
    drawResourceImage(ctx, 'map.svg', 0, 0, 3000, 2000);
    expect(blits[0]!.src).toBe(SVG);
    expect(rasters).toHaveLength(0);
    expect(resourceRasterCacheBytes()).toBe(0);
  });

  it('tints a picture past the bound in the largest bitmap the bound allows', () => {
    registerResourceImage('map.svg', SVG, { vector: true, singleInk: true });
    const { ctx, blits } = pageCanvas();
    ctx.scale(4, 4);
    drawResourceImage(ctx, 'map.svg', 0, 0, 3000, 2000, { inkHex: INK, svg: true });
    const [w, h] = blits[0]!.size!;
    expect(w).toBeGreaterThan(3000);
    expect(w).toBeLessThan(12000);
    expect(w * h * 4).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(w / h).toBeCloseTo(1.5, 2);
    // Never smaller than the picture's page size.
    const small = pageCanvas();
    small.ctx.scale(1.01, 1.01);
    drawResourceImage(small.ctx, 'map.svg', 0, 0, 7000, 7000, { inkHex: INK, svg: true });
    expect(small.blits[0]!.size).toEqual([7000, 7000]);
  });
});

describe('raster of a formula', () => {
  const formula = (): MathRender => ({
    tex: 'x^2',
    displayMode: false,
    svg: '',
    viewBox: { minX: 0, minY: 0, width: 1000, height: 500 },
    widthPx: 40,
    heightPx: 20,
    ascentPx: 15,
    depthPx: 5,
    scale: 1,
    paths: [{ d: 'M0 0L10 0L10 10Z', fill: 'currentColor' }],
  });

  beforeAll(async () => {
    await initMathEngine();
    clearMathCache();
  });

  it('has the size the formula shows at', () => {
    const render = formula();
    const at1 = getMathRaster(render, '#000')!;
    expect([at1.width, at1.height]).toEqual([40, 20]);
    const at15 = getMathRaster(render, '#000', { x: 1.5, y: 1.5 })!;
    expect([at15.width, at15.height]).toEqual([60, 30]);
    const at3 = getMathRaster(render, '#000', { x: 3, y: 3 })!;
    expect([at3.width, at3.height]).toEqual([120, 60]);
  });

  it('is cached by size and colour, for the same render and for a copy of it', () => {
    const render = formula();
    const at2 = getMathRaster(render, '#000', { x: 2, y: 2 })!;
    expect(getMathRaster(render, '#000', { x: 2, y: 2 })).toBe(at2);
    expect(getMathRaster(render, '#000')).not.toBe(at2);
    expect(getMathRaster(render, '#c00', { x: 2, y: 2 })).not.toBe(at2);
    // A structured clone (a worker rebuild) finds the bitmap by content.
    expect(getMathRaster(formula(), '#000', { x: 2, y: 2 })).toBe(at2);
  });

  it('leaves a formula past the bound to its paths', () => {
    expect(getMathRaster(formula(), '#000', { x: 400, y: 400 })).toBeNull();
  });

  it('is asked for at the scale of the context it is painted on', () => {
    const doc = buildDocument({ markdown: 'An inline formula $x^2$ in a line.' }, CONFIG);
    const render = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.kind === 'math')!.mathRender!;
    expect(render.paths.length).toBeGreaterThan(0);
    for (const scale of [1, 1.5, 3]) {
      const { canvas, blits } = pageCanvas();
      renderPageToCanvas(doc.pages[0]!, doc, canvas, { scale });
      expect(blits).toHaveLength(1);
      expect(blits[0]!.size).toEqual([Math.ceil(render.widthPx * scale), Math.ceil(render.heightPx * scale)]);
      expect(blits[0]!.box.slice(2)).toEqual([render.widthPx, render.heightPx]);
    }
  });
});
