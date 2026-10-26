import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument, clearResourceImages, registerResourceImage, renderPageToCanvas, renderToHtml } from '../../index.js';
import type { PostextConfig, Resource } from '../../index.js';

// #995: a label tab's picture painted in the label's text colour. The
// canvas composites the decoded picture with `source-in` on a scratch
// bitmap, so only what the picture covers takes the colour.

/** An offscreen 2D context with a real RGBA buffer: `drawImage` of a fake
 *  image fills the target with the image's `rgba`; `fillRect` under
 *  `source-in` keeps the colour where the target has alpha. */
class PixelCtx {
  font = '';
  fillStyle = '#000000';
  globalCompositeOperation = 'source-over';
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(Math.max(1, width * height) * 4);
  }
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
  drawImage(image: { rgba?: number[] }): void {
    const [r, g, b, a] = image.rgba ?? [0, 0, 0, 255];
    for (let i = 0; i < this.data.length; i += 4) this.data.set([r!, g!, b!, a!], i);
  }
  fillRect(): void {
    const hex = /^#([0-9a-f]{6})$/i.exec(this.fillStyle)![1]!;
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < this.data.length; i += 4) {
      const alpha = this.data[i + 3]!;
      if (this.globalCompositeOperation === 'source-in') this.data.set([...rgb, alpha], i);
      else this.data.set([...rgb, 255], i);
    }
  }
}
class FakeOffscreenCanvas {
  ctx: PixelCtx;
  constructor(public width = 1, public height = 1) {
    this.ctx = new PixelCtx(width, height);
  }
  getContext(): PixelCtx {
    return this.ctx;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeOffscreenCanvas;

/** A page canvas that records the first pixel of every raster drawn on it. */
function pageCanvas(): { canvas: HTMLCanvasElement; drawn: number[][] } {
  const drawn: number[][] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'drawImage') {
        return (src: FakeOffscreenCanvas | { rgba?: number[] }) => {
          drawn.push(src instanceof FakeOffscreenCanvas ? [...src.ctx.data.slice(0, 4)] : [...(src.rgba ?? [])]);
        };
      }
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, drawn };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const RING: Resource = { id: 'ring', typeId: 'figure', kind: 'svg', altText: '', createdAt: 0, updatedAt: 0, svg: { fileId: 'ring.svg', width: 20, height: 10 } };
const BITMAP: Resource = { id: 'ring', typeId: 'figure', kind: 'bitmap', altText: '', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'ring.png', format: 'png', width: 20, height: 10 } };

const config = (tint: boolean): PostextConfig => ({
  page: { width: pt(500), height: pt(700), dpi: 72, margins: { top: pt(40), bottom: pt(20), left: pt(30), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{
    id: 'tab', title: '',
    label: { fontSize: pt(10), fontWeight: 400, position: 'top-left', height: pt(14), paddingX: pt(6), offset: pt(7), color: { hex: '#123456', source: 'custom' }, icon: { resourceId: 'ring', width: pt(8), gap: pt(3), placement: 'inside', tint } },
  }] as never,
});

function paint(resource: Resource, tint: boolean): number[][] {
  const doc = buildDocument({ markdown: ':::callout{type="tab" label="Money"}\nBody of the box.\n:::', resources: [resource] }, config(tint));
  const { canvas, drawn } = pageCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return drawn;
}

beforeEach(() => {
  clearResourceImages();
});

describe('label.icon.tint on the canvas (#995)', () => {
  it('paints an SVG picture in the label colour, keeping its transparency', () => {
    registerResourceImage('ring.svg', { rgba: [255, 255, 255, 128] } as unknown as CanvasImageSource, { vector: true });
    expect(paint(RING, true)).toContainEqual([0x12, 0x34, 0x56, 128]);
  });

  it('paints a bitmap picture in the label colour as well', () => {
    registerResourceImage('ring.png', { rgba: [200, 10, 10, 255] } as unknown as CanvasImageSource, { vector: false });
    expect(paint(BITMAP, true)).toContainEqual([0x12, 0x34, 0x56, 255]);
  });

  it('leaves the picture in its own colours without the tint', () => {
    registerResourceImage('ring.svg', { rgba: [255, 255, 255, 128] } as unknown as CanvasImageSource, { vector: true });
    const drawn = paint(RING, false);
    expect(drawn).not.toContainEqual([0x12, 0x34, 0x56, 128]);
    expect(drawn.some((px) => px[0] === 255 && px[3] === 128)).toBe(true);
  });
});

// ... and in HTML: the page defines a flood of the colour kept where the
// picture has alpha, and the `<img>` is filtered through it.
describe('label.icon.tint in HTML (#995)', () => {
  const html = (tint: boolean, resource: Resource = RING): string => {
    const doc = buildDocument({ markdown: ':::callout{type="tab" label="Money"}\nBody of the box.\n:::', resources: [resource] }, config(tint));
    return renderToHtml(doc, { resourceImageUrl: (fileId) => `data:image/svg+xml;base64,${btoa(fileId)}` });
  };

  it('filters the picture through a flood of the label colour, defined on the page', () => {
    const out = html(true);
    const id = /filter:url\(#(pt-tint-123456-0)\)/.exec(out)?.[1];
    expect(id).toBe('pt-tint-123456-0');
    expect(out).toContain(`<filter id="${id}" color-interpolation-filters="sRGB"><feFlood flood-color="#123456"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
    // Defined once, before the picture that uses it.
    expect(out.split(`<filter id="${id}"`).length - 1).toBeGreaterThanOrEqual(1);
    expect(out.indexOf(`<filter id="${id}"`)).toBeLessThan(out.indexOf(`filter:url(#${id})`));
  });

  it('also filters a bitmap', () => {
    expect(html(true, BITMAP)).toContain('filter:url(#pt-tint-123456-0)');
  });

  it('adds nothing without the tint', () => {
    const out = html(false);
    expect(out).not.toContain('pt-tint-');
    expect(out).not.toContain('feFlood');
  });
});
