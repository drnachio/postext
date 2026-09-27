import { describe, it, expect, beforeEach } from 'vitest';
import {
  applySingleInkToSvg,
  buildDocument,
  bundleImageUrl,
  bundleResourceBytes,
  clearResourceImages,
  registerBundleImages,
  registerResourceImage,
  renderPageToCanvas,
  renderToHtml,
  renderToHtmlIndexed,
} from '../index';
import { applySingleInkToPixels, singleInkColorMatrix } from '../svg/singleInk';
import type { PostextConfig, RenderPageOptions, Resource } from '../index';

// EF-17: `diagramStyle.singleInk` can recolour SVG pictures on canvas and in
// HTML too, not only in the PDF: the canvas tints the pixels of a raw SVG
// image, the HTML backend filters its `<img>`, both with the luminance →
// tint mapping `applySingleInkToSvg` applies to the markup. In postext 1.x
// the host asks for it (`singleInk: true` on the render or the picture):
// hosts written for 1.4 recolour the markup themselves, and a picture tinted
// twice comes out lighter. Pictures a host already recoloured
// (`singleInk: false`) and bitmaps are always painted as given.

/** An offscreen 2D context with a real RGBA buffer: `drawImage` of a fake
 *  image fills the whole target with the image's `rgba`. */
class PixelCtx {
  font = '';
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
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(this.data) };
  }
  putImageData(img: { data: Uint8ClampedArray }): void {
    this.data = new Uint8ClampedArray(img.data);
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
const INK = '#295aa3';
const inked = (on: boolean): PostextConfig => ({
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, dpi: 72 },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  diagramStyle: { singleInk: on, inkColor: { hex: INK, model: 'hex' } },
});

const figure = (kind: 'svg' | 'bitmap'): Resource => ({
  id: 'fig',
  typeId: 'figure',
  kind,
  createdAt: 0,
  updatedAt: 0,
  ...(kind === 'svg'
    ? { svg: { fileId: 'fig.svg', width: 100, height: 50 } }
    : { bitmap: { fileId: 'fig.png', format: 'png', width: 100, height: 50 } }),
  placement: { position: 'here' },
});

/** The figure painted on canvas with the render `options` (none: `null`).
 *  The backends tint on request in 1.x, so the default asks. */
function paint(kind: 'svg' | 'bitmap', on: boolean, options: RenderPageOptions | null = { singleInk: true }): number[][] {
  const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure(kind)] }, inked(on));
  const { canvas, drawn } = pageCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas, options ?? undefined);
  return drawn;
}

/** The tint `applySingleInkToSvg` gives a solid colour, as RGB bytes. */
function markupTint(hex: string): number[] {
  const out = applySingleInkToSvg(`<rect fill="${hex}"/>`, INK);
  const h = /fill="#([0-9a-f]{6})"/.exec(out)![1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

beforeEach(() => {
  clearResourceImages();
});

describe('canvas single ink (EF-17)', () => {
  it('tints a raw SVG figure to the ink, as the PDF does', () => {
    // A black SVG decoded through an <img>-like vector source.
    registerResourceImage('fig.svg', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: true });
    const [first] = paint('svg', true);
    expect(first!.slice(0, 3)).toEqual(markupTint('#000000'));
    expect(first![3]).toBe(255);
  });

  it('paints the figure as given when single ink is off', () => {
    registerResourceImage('fig.svg', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: true });
    expect(paint('svg', false)[0]).toEqual([0, 0, 0, 255]);
  });

  it('never tints twice a picture the host recoloured (singleInk: false)', () => {
    const pre = markupTint('#000000');
    registerResourceImage('fig.svg', { rgba: [...pre, 255] } as unknown as CanvasImageSource, { vector: true, singleInk: false });
    expect(paint('svg', true)[0]).toEqual([...pre, 255]);
  });

  it('paints a picture registered as in postext 1.4 as given, unless the render asks for the tint', () => {
    // A 1.4 host recoloured the markup with applySingleInkToSvg and
    // registered the image without a flag: tinting it again would lighten
    // it (black → 1 − L(ink) of the ink).
    const pre = markupTint('#000000');
    registerResourceImage('fig.svg', { rgba: [...pre, 255] } as unknown as CanvasImageSource, { vector: true });
    expect(paint('svg', true, null)[0]).toEqual([...pre, 255]);
    expect(paint('svg', true, {})[0]).toEqual([...pre, 255]);
    expect(paint('svg', true, { singleInk: false })[0]).toEqual([...pre, 255]);
    // A raw SVG is tinted when the render asks, or when its registration does.
    registerResourceImage('fig.svg', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: true });
    expect(paint('svg', true, null)[0]).toEqual([0, 0, 0, 255]);
    expect(paint('svg', true, { singleInk: true })[0]!.slice(0, 3)).toEqual(markupTint('#000000'));
    registerResourceImage('fig.svg', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: true, singleInk: true });
    expect(paint('svg', true, null)[0]!.slice(0, 3)).toEqual(markupTint('#000000'));
    // …never while the document's single ink is off.
    expect(paint('svg', false, null)[0]).toEqual([0, 0, 0, 255]);
  });

  it('tints an SVG figure registered as a bitmap source, and never a bitmap figure', () => {
    registerResourceImage('fig.svg', { rgba: [255, 255, 255, 255] } as unknown as CanvasImageSource, { vector: false });
    expect(paint('svg', true)[0]).toEqual([255, 255, 255, 255]);
    registerResourceImage('fig.svg', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: false });
    expect(paint('svg', true)[0]!.slice(0, 3)).toEqual(markupTint('#000000'));
    registerResourceImage('fig.png', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: false });
    expect(paint('bitmap', true)[0]).toEqual([0, 0, 0, 255]);
  });
});

describe('the pixel and filter forms of the mapping (EF-17)', () => {
  const samples = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#f6c453', '#7f7f7f', '#123456'];

  it('applySingleInkToPixels matches applySingleInkToSvg colour for colour', () => {
    for (const hex of samples) {
      const px = new Uint8ClampedArray([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(200));
      applySingleInkToPixels(px, INK);
      expect([...px.slice(0, 3)], hex).toEqual(markupTint(hex));
      expect(px[3]).toBe(200);
    }
  });

  it('singleInkColorMatrix maps black to the ink and white to paper', () => {
    const m = singleInkColorMatrix(INK)!;
    expect(m).toHaveLength(20);
    const apply = (rgb: number[]) => [0, 1, 2].map((row) =>
      m[row * 5]! * rgb[0]! + m[row * 5 + 1]! * rgb[1]! + m[row * 5 + 2]! * rgb[2]! + m[row * 5 + 4]!);
    const ink = [0x29, 0x5a, 0xa3].map((c) => c / 255);
    apply([0, 0, 0]).forEach((v, i) => expect(v).toBeCloseTo(ink[i]!, 6));
    apply([1, 1, 1]).forEach((v) => expect(v).toBeCloseTo(1, 6));
    for (const hex of samples) {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      apply(rgb).forEach((v, i) => expect(Math.abs(v * 255 - markupTint(hex)[i]!), hex).toBeLessThanOrEqual(0.5));
    }
    // Alpha passes through.
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(singleInkColorMatrix('not a colour')).toBeNull();
  });
});

describe('HTML single ink (EF-17)', () => {
  const url = (id: string) => (id === 'fig.svg' ? 'blob:fig-svg' : id === 'fig.png' ? 'blob:fig-png' : undefined);

  /** The figure in HTML, asking for the tint unless `options` says. */
  function html(kind: 'svg' | 'bitmap', on: boolean, options: Parameters<typeof renderToHtml>[1] = {}): string {
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure(kind)] }, inked(on));
    return renderToHtml(doc, { resourceImageUrl: url, singleInk: true, ...options });
  }

  it('filters a raw SVG image through a page-local feColorMatrix', () => {
    const out = html('svg', true);
    const img = /<img [^>]*src="blob:fig-svg"[^>]*>/.exec(out)![0];
    const id = /filter:url\(#([^)]+)\)/.exec(img)![1]!;
    expect(out).toContain(`<filter id="${id}"`);
    expect(out).toContain('color-interpolation-filters="sRGB"');
    expect(out).toContain(`values="${singleInkColorMatrix(INK)!.map((v) => +v.toFixed(6)).join(' ')}"`);
  });

  it('leaves images alone when single ink is off, for bitmaps, and for pre-inked URLs', () => {
    expect(html('svg', false)).not.toContain('filter:url(');
    expect(html('bitmap', true)).not.toContain('filter:url(');
    expect(html('svg', true, { singleInk: false })).not.toContain('filter:url(');
    const resolver = Object.assign((id: string) => url(id), { singleInk: false as const });
    expect(html('svg', true, { resourceImageUrl: resolver, singleInk: undefined })).not.toContain('filter:url(');
    expect(html('svg', false)).not.toContain('<filter');
  });

  it('filters only on request in postext 1.x: the render option, or the resolver’s own flag', () => {
    // A 1.4 host serves URLs it recoloured itself: no second tint.
    expect(html('svg', true, { singleInk: undefined })).not.toContain('filter:url(');
    expect(html('svg', true, { singleInk: undefined })).not.toContain('<filter');
    const asks = Object.assign((id: string) => url(id), { singleInk: true as const });
    expect(html('svg', true, { resourceImageUrl: asks, singleInk: undefined })).toContain('filter:url(');
  });

  it('filters a design image when its URL names an SVG', () => {
    const config: PostextConfig = {
      ...inked(true),
      header: {
        elements: [{
          kind: 'image',
          id: 'logo',
          resourceId: 'fig',
          placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(20) } },
        }],
      },
    };
    const doc = buildDocument({ markdown: 'Text.', resources: [figure('svg')] }, config);
    // A VDT from before design images carried their kind: the URL decides.
    for (const b of doc.pages[0]!.header!.blocks) if (b.kind === 'image') delete b.imageKind;
    const svgUrl = renderToHtml(doc, { resourceImageUrl: () => 'data:image/svg+xml,%3Csvg%2F%3E', singleInk: true });
    expect(svgUrl).toMatch(/<img [^>]*data:image\/svg\+xml[^>]*filter:url\(#pt-ink-295aa3-0\)/);
    const blobUrl = renderToHtml(doc, { resourceImageUrl: () => 'blob:logo', singleInk: true });
    expect(blobUrl).not.toContain('filter:url(');
  });

  it('decides a design image by the kind of its resource, whatever its URL', () => {
    const logo = (kind: 'svg' | 'bitmap') => buildDocument({ markdown: 'Text.', resources: [figure(kind)] }, {
      ...inked(true),
      header: { elements: [{ kind: 'image', id: 'logo', resourceId: 'fig', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(20) } } }] },
    });
    // An SVG behind a blob URL is filtered; a PNG named like an SVG is not.
    expect(renderToHtml(logo('svg'), { resourceImageUrl: () => 'blob:logo', singleInk: true })).toMatch(/<img [^>]*blob:logo[^>]*filter:url\(#pt-ink-/);
    expect(renderToHtml(logo('bitmap'), { resourceImageUrl: () => '/logo.svg', singleInk: true })).not.toContain('filter:url(');
  });

  it('gives every page the filter definition while single ink applies', () => {
    // A host patching blocks one by one (`renderToHtmlIndexed`) may bring an
    // SVG image onto a page that had none: its filter must resolve.
    const doc = buildDocument({ markdown: 'Text only.' }, inked(true));
    const page = renderToHtmlIndexed(doc, { singleInk: true }).pages[0]!;
    expect(page.innerHtml).toContain('<filter id="pt-ink-295aa3-0"');
    expect(page.decorationHtml).toContain('<filter id="pt-ink-295aa3-0"');
    expect(renderToHtmlIndexed(buildDocument({ markdown: 'Text only.' }, inked(false)), { singleInk: true }).pages[0]!.innerHtml).not.toContain('<filter');
    expect(renderToHtmlIndexed(doc, { singleInk: false }).pages[0]!.innerHtml).not.toContain('<filter');
  });
});

describe('picture kinds in the VDT (EF-17, EF-06)', () => {
  const svgWithMaster: Resource = {
    id: 'map', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'map.svg', width: 40, height: 40, pdfFileId: 'map.pdf' },
  };
  const png: Resource = {
    id: 'photo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'photo.png', format: 'png', width: 40, height: 40 },
  };

  it('stamps the kind and the print master on design images, box icons and cell images', () => {
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: 'Map', image: { resourceId: 'map' } }, { content: 'Photo', image: { resourceId: 'photo' } }]] } },
      placement: { position: 'here' },
    };
    const config: PostextConfig = {
      ...inked(false),
      header: {
        elements: [
          { kind: 'image', id: 'a', resourceId: 'map', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(10) } } },
          { kind: 'image', id: 'b', resourceId: 'photo', placement: { anchor: { to: 'container', edge: 'top-right' }, size: { width: pt(10) } } },
        ],
      },
      calloutStyles: [{ id: 'note', icon: { kind: 'resource', resourceId: 'map' } }],
    };
    const markdown = ':::callout{type="note"}\nBoxed text.\n:::\n\n::resource{id="tab"}';
    const doc = buildDocument({ markdown, resources: [svgWithMaster, png, table] }, config);
    const header = doc.pages[0]!.header!.blocks.filter((b) => b.kind === 'image');
    expect(header.map((b) => b.kind === 'image' && [b.fileId, b.imageKind, b.pdfFileId])).toEqual([
      ['map.svg', 'svg', 'map.pdf'],
      ['photo.png', 'bitmap', undefined],
    ]);
    const blocks = doc.pages[0]!.columns.flatMap((c) => c.blocks);
    const icon = blocks.flatMap((b) => b.designOverlay?.blocks ?? []).find((b) => b.kind === 'image');
    expect(icon).toMatchObject({ fileId: 'map.svg', imageKind: 'svg', pdfFileId: 'map.pdf' });
    const cells = blocks.flatMap((b) => b.resourceBlock?.table?.cells ?? []).map((c) => c.image);
    expect(cells.map((i) => i && [i.fileId, i.kind, i.pdfFileId])).toEqual([['map.svg', 'svg', 'map.pdf'], ['photo.png', 'bitmap', undefined]]);
  });

  it('tints a design image on canvas by its kind, not by how it was decoded', () => {
    const header = (resource: Resource): PostextConfig => ({
      ...inked(true),
      header: { elements: [{ kind: 'image', id: 'logo', resourceId: resource.id, placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(20) } } }] },
    });
    const drawnFor = (resource: Resource) => {
      const doc = buildDocument({ markdown: 'Text.', resources: [resource] }, header(resource));
      const { canvas, drawn } = pageCanvas();
      renderPageToCanvas(doc.pages[0]!, doc, canvas, { singleInk: true });
      return drawn[0];
    };
    // A PNG logo decoded through an <img> (a vector source by default).
    registerResourceImage('photo.png', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: true });
    expect(drawnFor(png)).toEqual([0, 0, 0, 255]);
    // An SVG logo decoded to an ImageBitmap.
    registerResourceImage('map.svg', { rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: false });
    expect(drawnFor(svgWithMaster)!.slice(0, 3)).toEqual(markupTint('#000000'));
  });
});

// Round-1 review: no picture is ever tinted twice — not by a 1.4-era host
// that recolours the markup itself, not through the bundle adapters, not
// in the Sandbox (which registers with `singleInk: false`), on canvas, in
// HTML or in the PDF (see postext-pdf's svgVector.test.ts). The markup pass
// marks what it recolours, the backends leave a marked picture alone, and
// they tint an unmarked one only when asked.
describe('no picture is tinted twice', () => {
  const RAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1" fill="#000000"/></svg>';
  const INKED = applySingleInkToSvg(RAW, INK);
  const dataUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const pre = () => markupTint('#000000');

  it('a 1.4-era pen: applySingleInkToSvg, then registerResourceImage, even when the render asks', () => {
    // An <img> loaded from the recoloured markup as a data URI: marked, so
    // never tinted, whatever the flags say.
    const img = { src: dataUrl(INKED), rgba: [...pre(), 255] } as unknown as CanvasImageSource;
    registerResourceImage('fig.svg', img, { vector: true });
    expect(paint('svg', true, null)[0]).toEqual([...pre(), 255]);
    expect(paint('svg', true, { singleInk: true })[0]).toEqual([...pre(), 255]);
    registerResourceImage('fig.svg', img, { vector: true, singleInk: true });
    expect(paint('svg', true, { singleInk: true })[0]).toEqual([...pre(), 255]);
    // Behind a blob URL the markup cannot be read: the 1.x default (no
    // tint unless asked) keeps the 1.4 call right.
    registerResourceImage('fig.svg', { src: 'blob:https://pen/1', rgba: [...pre(), 255] } as unknown as CanvasImageSource);
    expect(paint('svg', true, null)[0]).toEqual([...pre(), 255]);
    // The raw markup as a data URI is tinted when asked.
    registerResourceImage('fig.svg', { src: dataUrl(RAW), rgba: [0, 0, 0, 255] } as unknown as CanvasImageSource, { vector: true });
    expect(paint('svg', true, { singleInk: true })[0]!.slice(0, 3)).toEqual(pre());
  });

  it('HTML: a recoloured SVG data URI gets no filter, even when the render asks', () => {
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure('svg')] }, inked(true));
    expect(renderToHtml(doc, { resourceImageUrl: () => dataUrl(INKED), singleInk: true })).not.toContain('filter:url(');
    expect(renderToHtml(doc, { resourceImageUrl: () => dataUrl(RAW), singleInk: true })).toContain('filter:url(');
    // A 1.4-era host serving recoloured blob URLs: no filter by default.
    expect(renderToHtml(doc, { resourceImageUrl: () => 'blob:https://pen/1' })).not.toContain('filter:url(');
  });

  describe('the bundle adapters', () => {
    const bundle = { config: inked(true), resources: [figure('svg')], files: new Map([['fig.svg', new TextEncoder().encode(RAW)]]) };
    /** The markup behind an object URL. */
    const blobText = async (url: string): Promise<string> => (await fetch(url)).text();

    it('bundleImageUrl serves the markup recoloured once, and HTML adds no filter — also through a wrapper', async () => {
      const resolver = bundleImageUrl(bundle);
      try {
        expect(resolver.singleInk).toBe(false);
        expect(await blobText(resolver('fig.svg')!)).toBe(INKED);
        const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure('svg')] }, inked(true));
        expect(renderToHtml(doc, { resourceImageUrl: resolver })).not.toContain('filter:url(');
        // A wrapper loses the resolver's flag; the 1.x default adds none.
        expect(renderToHtml(doc, { resourceImageUrl: (id) => resolver(id) })).not.toContain('filter:url(');
      } finally {
        resolver.revoke();
      }
    });

    it('registerBundleImages registers the markup recoloured once, and the canvas leaves it alone', async () => {
      const seen: string[] = [];
      const G = globalThis as unknown as { Image?: unknown };
      const previous = G.Image;
      // A decoder stand-in: reads the markup it is given and "decodes" the
      // recoloured black.
      G.Image = class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        rgba = [...pre(), 255];
        set src(url: string) {
          void blobText(url).then((text) => { seen.push(text); this.onload?.(); });
        }
      };
      try {
        await registerBundleImages(bundle);
      } finally {
        G.Image = previous;
      }
      expect(seen).toEqual([INKED]);
      expect(paint('svg', true, { singleInk: true })[0]).toEqual([...pre(), 255]);
    });

    it('bundleResourceBytes hands the PDF the raw markup, which it recolours once', () => {
      const bytes = bundleResourceBytes(bundle)('fig.svg')!;
      const svg = new TextDecoder().decode(bytes);
      expect(svg).toBe(RAW);
      // What the PDF backend does with it (postext-pdf's preloadResourceImages).
      expect(applySingleInkToSvg(svg, INK)).toBe(INKED);
      // A bundle whose file was recoloured before it was written is not
      // recoloured again.
      const prebaked = { ...bundle, files: new Map([['fig.svg', new TextEncoder().encode(INKED)]]) };
      expect(applySingleInkToSvg(new TextDecoder().decode(bundleResourceBytes(prebaked)('fig.svg')!), INK)).toBe(INKED);
    });
  });
});
