import { beforeEach, describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { clearResourceImages, clearVarnishPaints, registerResourceImage, renderFinishMask, renderPageToCanvas, renderToHtml, finishMaskSvg } from '../../index.js';
import { maskPaintMap, overprintHexes, paintFinishMask, packFinishMask } from '../../canvas-backend/finish/mask.js';
import { applyFinishPreview } from '../../canvas-backend/finish/preview.js';
import { parsePaint } from '../../canvas-backend/finish/paint.js';
import type { FinishInk } from '../../color/finishInks.js';
import type { PostextConfig, SpotColor } from '../../types.js';
import { RasterCanvas, type RasterContext } from './rasterCanvas.js';

// #1563 / #1564: a varnish puts no colour on a screen page, and the finish
// mask records where each special ink lies: R metalness, G sheen, B
// fluorescence, A opaque white, each at the ink's tint.

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = RasterCanvas;

const ink = (kind: FinishInk['kind'], extra: Partial<FinishInk> = {}): FinishInk => ({ kind, tint: 100, name: kind, overprint: kind === 'white' || kind === 'varnish', ...extra });

const GOLD = '#c9a13b';
const FOIL = '#d0d0d0';
const NEON = '#ff3399';
const WHITE = '#f4f4f4';
const VARNISH = '#fefefe';
const INKS = new Map<string, FinishInk>([
  [GOLD, ink('metallic')],
  [FOIL, ink('foil')],
  [NEON, ink('fluorescent')],
  [WHITE, ink('white', { tint: 50 })],
  [VARNISH, ink('varnish', { sheen: 'matte' })],
]);
const createCanvas = (w: number, h: number) => new RasterCanvas(w, h);

/** A mask of a 40 × 10 page painted by `paint` on the raw context. */
function mask(paint: (ctx: RasterContext) => void, overprint: ReadonlySet<string> = new Set()) {
  return paintFinishMask(40, 10, (canvas) => {
    const ctx = canvas.getContext('2d') as RasterContext;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 40, 10);
    paint(ctx);
  }, INKS, overprint, { createCanvas });
}
const at = (m: { data: Uint8ClampedArray; width: number }, x: number, y: number) => [...m.data.subarray((y * m.width + x) * 4, (y * m.width + x) * 4 + 4)];

describe('finish mask channels', () => {
  it('writes each kind in its channel at its tint', () => {
    const m = mask((ctx) => {
      ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 8, 10);
      ctx.fillStyle = FOIL; ctx.fillRect(8, 0, 8, 10);
      ctx.fillStyle = NEON; ctx.fillRect(16, 0, 8, 10);
      ctx.fillStyle = WHITE; ctx.fillRect(24, 0, 8, 10);
      ctx.fillStyle = VARNISH; ctx.fillRect(32, 0, 8, 10);
    })!;
    expect(at(m, 4, 5)).toEqual([255, 179, 0, 0]); // metallic: satin .7
    expect(at(m, 12, 5)).toEqual([255, 255, 0, 0]); // foil: gloss
    expect(at(m, 20, 5)).toEqual([0, 0, 255, 0]);
    expect(at(m, 28, 5)[3]).toBeCloseTo(128, -1); // white at 50 %
    expect(at(m, 36, 5)).toEqual([0, 102, 0, 0]); // matte varnish .4
  });

  it('is undefined when the page paints no special ink', () => {
    expect(mask((ctx) => { ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 40, 10); })).toBeUndefined();
  });

  it('lets an ordinary ink knock a metallic ink out, unless it overprints', () => {
    const paint = (ctx: RasterContext) => {
      ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 40, 10);
      ctx.fillStyle = '#000000'; ctx.fillRect(10, 0, 10, 10);
    };
    const knocked = mask(paint)!;
    expect(at(knocked, 5, 5)[0]).toBe(255);
    expect(at(knocked, 15, 5)).toEqual([0, 0, 0, 0]);
    const over = mask(paint, new Set(['#000000']))!;
    expect(at(over, 15, 5)[0]).toBe(255);
    // A white ink overprints: the gold under it stays, its coverage is A.
    const white = mask((ctx) => {
      ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 40, 10);
      ctx.fillStyle = WHITE; ctx.fillRect(10, 0, 10, 10);
    }, overprintSet(WHITE))!;
    expect(at(white, 15, 5)[0]).toBe(255);
    expect(at(white, 15, 5)[3]).toBeGreaterThan(0);
  });

  it('lays a varnish over a picture, which knocks the inks under it out', () => {
    const picture = { width: 4, height: 4, rgba: [10, 200, 30, 255] as [number, number, number, number] };
    const m = mask((ctx) => {
      ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 40, 10);
      ctx.drawImage(picture as never, 10, 0, 20, 10);
      ctx.fillStyle = VARNISH; ctx.fillRect(20, 0, 20, 10);
    })!;
    expect(at(m, 5, 5)).toEqual([255, 179, 0, 0]);
    expect(at(m, 15, 5)).toEqual([0, 0, 0, 0]); // picture: no gold
    expect(at(m, 25, 5)).toEqual([0, 102, 0, 0]); // varnish over the picture
    expect(at(m, 35, 5)).toEqual([255, 179, 0, 0]); // varnish over gold: the larger sheen
  });

  it('keeps a white under a picture and under later paint, as on press (#1579)', () => {
    const picture = { width: 4, height: 4, rgba: [10, 200, 30, 255] as [number, number, number, number] };
    const m = mask((ctx) => {
      ctx.fillStyle = WHITE; ctx.fillRect(0, 0, 40, 10);
      ctx.drawImage(picture as never, 0, 0, 20, 10);
      ctx.fillStyle = '#123456'; ctx.fillRect(20, 0, 10, 10);
      ctx.fillStyle = {} as never; ctx.fillRect(30, 0, 10, 10);
    })!;
    for (const x of [5, 15, 25, 35]) expect(at(m, x, 5)[3]).toBeCloseTo(128, -1);
    expect(maskPaintMap('white', INKS, new Set())('#123456')).toBe('rgba(0, 0, 0, 0)');
    expect(maskPaintMap('white', INKS, new Set())(GOLD)).toBe('rgba(0, 0, 0, 0)');
  });

  it('maps paints for each pass, leaving transparent paints and gradients as they are', () => {
    const inks = maskPaintMap('inks', INKS, new Set());
    expect(inks('rgba(0, 0, 0, 0)')).toBe('rgba(0, 0, 0, 0)');
    expect(inks({} as CanvasGradient)).toBe('rgba(0, 0, 0, 1)');
    expect(inks(`${GOLD}80`)).toBe(`rgba(255, 179, 0, ${128 / 255})`);
    expect(maskPaintMap('varnish', INKS, new Set())(GOLD)).toBe('rgba(0, 0, 0, 0)');
    expect(parsePaint('rgb(201 161 59 / 50%)')).toEqual({ hex: GOLD, alpha: 0.5 });
    expect(parsePaint('#abc')).toEqual({ hex: '#aabbcc', alpha: 1 });
  });

  it('packs varnish sheen by its coverage', () => {
    const inks = new Uint8ClampedArray([0, 50, 0, 255]);
    const varnish = new Uint8ClampedArray([0, 200, 0, 128]);
    expect([...packFinishMask(1, 1, new Map([['inks', inks], ['varnish', varnish]]))!.data]).toEqual([0, 100, 0, 0]);
  });
});

function overprintSet(...hexes: string[]): Set<string> {
  return new Set(hexes);
}

const mm = (value: number) => ({ value, unit: 'mm' as const });
const spot = (hex: string, s: SpotColor) => ({ hex, model: 'spot' as const, spot: s });
const CMYK0 = { c: 0, m: 0, y: 0, k: 0 };
function config(background: ReturnType<typeof spot> | { hex: string; model: 'hex' }, extra: PostextConfig = {}): PostextConfig {
  return {
    page: { width: mm(40), height: mm(30), dpi: 72, margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) }, backgroundColor: background },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  };
}

beforeEach(() => clearResourceImages());

describe('renderFinishMask on a laid-out page', () => {
  it('reads a metallic paper through the page painter, text knocking it out', () => {
    const doc = buildDocument({ markdown: 'Gold.' }, config(spot(GOLD, { name: 'Gold', cmyk: { c: 0, m: 20, y: 60, k: 20 }, finish: { kind: 'metallic' } })));
    const page = doc.pages[0]!;
    const m = renderFinishMask(page, doc)!;
    expect(m).toBeDefined();
    expect([m.width, m.height]).toEqual([Math.round(page.width), Math.round(page.height)]);
    expect(at(m, 1, 1)).toEqual([255, 179, 0, 0]);
    // The first line's text is black: no gold under it.
    const line = page.columns[0]!.blocks[0]!.lines[0]!;
    const x = Math.round(line.bbox.x + 2);
    const y = Math.round(line.bbox.y + line.bbox.height / 2);
    expect(at(m, x, y)[0]).toBe(0);
  });

  it('is undefined for a plain page, and for a page whose ink has no finish', () => {
    const plain = buildDocument({ markdown: 'Text.' }, config({ hex: '#ffffff', model: 'hex' }));
    expect(renderFinishMask(plain.pages[0]!, plain)).toBeUndefined();
    const pms = buildDocument({ markdown: 'Text.' }, config(spot('#1f3f99', { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } })));
    expect(renderFinishMask(pms.pages[0]!, pms)).toBeUndefined();
  });

  it('gives a white paper of white ink its coverage, and overprints it by default', () => {
    const doc = buildDocument({ markdown: 'Kraft.' }, config(spot('#ececec', { name: 'Opaque white', cmyk: CMYK0, finish: { kind: 'white' } })));
    expect(overprintHexes(doc).has('#ececec')).toBe(true);
    const m = renderFinishMask(doc.pages[0]!, doc, { scale: 0.5 })!;
    expect(at(m, 1, 1)).toEqual([0, 0, 0, 255]);
  });

  it('never counts the sheet or a white paper as a pure-white ink', () => {
    const doc = buildDocument({ markdown: 'White ink.' }, config({ hex: '#ffffff', model: 'hex' }, {
      colorPalette: [{ id: 'w', name: 'Opaque white', value: spot('#ffffff', { name: 'Opaque white', cmyk: CMYK0, finish: { kind: 'white' } }) }],
    }));
    const m = renderFinishMask(doc.pages[0]!, doc, { scale: 0.5 });
    // The palette defines the ink, but nothing on the page is set in it.
    expect(m === undefined || at(m, 1, 1)[3] === 0).toBe(true);
  });

  it('paints the host recoloured picture of an SVG in the mask paints', () => {
    const resource = { id: 'fig', typeId: 'figure', kind: 'svg' as const, createdAt: 0, updatedAt: 0, svg: { fileId: 'fig.svg', width: 100, height: 50 }, placement: { position: 'here' as const } };
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [resource] }, config({ hex: '#ffffff', model: 'hex' }, {
      colorPalette: [{ id: 'g', name: 'Gold', value: spot(GOLD, { name: 'Gold', cmyk: CMYK0, finish: { kind: 'metallic' } }) }],
    }));
    registerResourceImage('fig.svg', { width: 10, height: 10, rgba: [0, 0, 255, 255] } as never, { vector: false });
    const gold = { width: 2, height: 2, rgba: [255, 179, 0, 255] } as never;
    const page = doc.pages.find((p) => JSON.stringify(p).includes('fig.svg'))!;
    const m = renderFinishMask(page, doc, { images: (id, pass) => (id === 'fig.svg' && pass === 'inks' ? gold : undefined) })!;
    expect(m).toBeDefined();
    expect([...m.data].some((v, i) => i % 4 === 0 && v === 255)).toBe(true);
    // Without the host's picture the page has no special ink.
    expect(renderFinishMask(page, doc)).toBeUndefined();
  });
});

describe('screen rule and preview', () => {
  const varnished = () => buildDocument({ markdown: 'Varnish.' }, config(spot(VARNISH, { name: 'Varnish', cmyk: CMYK0, finish: { kind: 'varnish' } })));

  it('leaves a varnish off the canvas, so the paper shows', () => {
    const doc = varnished();
    const canvas = new RasterCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas as unknown as HTMLCanvasElement);
    expect(canvas.ctx.pixel(1, 1)).toEqual([255, 255, 255, 255]);
    // The hook is gone after the paint.
    expect(Object.getOwnPropertyDescriptor(canvas.ctx, 'fillStyle')).toBeUndefined();
    // A plain spot paints its hex.
    const pms = buildDocument({ markdown: 'Text.' }, config(spot('#1f3f99', { name: 'PANTONE 286 C', cmyk: CMYK0 })));
    const c2 = new RasterCanvas();
    renderPageToCanvas(pms.pages[0]!, pms, c2 as unknown as HTMLCanvasElement);
    expect(c2.ctx.pixel(1, 1)).toEqual([0x1f, 0x3f, 0x99, 255]);
  });

  it('shows the varnish in false colour (map) and as a gloss (sheen)', () => {
    const doc = varnished();
    const map = new RasterCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, map as unknown as HTMLCanvasElement, { finishes: 'map' });
    const [r, g, b] = map.ctx.pixel(1, 1);
    expect(b!).toBeGreaterThan(r!);
    expect(g!).toBeLessThan(255);
    const flat = new RasterCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, flat as unknown as HTMLCanvasElement, { finishes: 'flat' });
    expect(flat.ctx.pixel(1, 1)).toEqual([255, 255, 255, 255]);
  });

  it('lights metal along a diagonal sweep', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(100);
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([255, 179, 0, 0], i);
    applyFinishPreview(pixels, { width: 4, height: 4, data }, 'sheen');
    const values = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) values.add(pixels[i]!);
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('HTML varnish', () => {
  it('clears a varnish hex in tags and sheets, never in the text', () => {
    const set = new Set(['#fefefe']);
    expect(clearVarnishPaints('<div style="background:#FEFEFE;color:#000000">#fefefe</div><svg><rect fill="#fefefe80"/></svg>', set))
      .toBe('<div style="background:transparent;color:#000000">#fefefe</div><svg><rect fill="transparent"/></svg>');
    expect(clearVarnishPaints('<style>.a{color:#fefefe}</style><p data-x="#fefefe1">x</p>', set))
      .toBe('<style>.a{color:transparent}</style><p data-x="#fefefe1">x</p>');
  });

  it('leaves a varnish paper off the HTML page', () => {
    const doc = buildDocument({ markdown: 'Varnish.' }, config(spot(VARNISH, { name: 'Varnish', cmyk: CMYK0, finish: { kind: 'varnish' } })));
    const html = renderToHtml(doc);
    expect(html.toLowerCase()).not.toContain(VARNISH);
    expect(html).toContain('background:transparent');
    const gold = buildDocument({ markdown: 'Gold.' }, config(spot(GOLD, { name: 'Gold', cmyk: CMYK0, finish: { kind: 'metallic' } })));
    expect(renderToHtml(gold).toLowerCase()).toContain(GOLD);
  });
});

describe('finishMaskSvg', () => {
  const doc = buildDocument({ markdown: 'x' }, config({ hex: '#ffffff', model: 'hex' }, {
    colorPalette: [
      { id: 'g', name: 'Gold', value: spot(GOLD, { name: 'Gold', cmyk: CMYK0, finish: { kind: 'metallic' } }) },
      { id: 'v', name: 'Varnish', value: spot(VARNISH, { name: 'Varnish', cmyk: CMYK0, finish: { kind: 'varnish' } }) },
    ],
  }));
  const svg = `<svg><rect fill="${GOLD}"/><rect fill="#e4002b icc-named-color(PANTONE, &quot;Varnish&quot;)"/><path data-spot="Gold" stroke="#123456" fill="none"/><rect style="fill:#333333"/></svg>`;

  it('recolours each paint for the paint of the mask', () => {
    expect(finishMaskSvg(svg, doc, 'inks')).toBe('<svg><rect fill="rgb(255, 179, 0)"/><rect fill="transparent"/><path data-spot="Gold" stroke="rgb(255, 179, 0)" fill="none"/><rect style="fill:#000000"/></svg>');
    // The white paint: no ordinary paint knocks a white out.
    expect(finishMaskSvg(svg, doc, 'white')).toBe('<svg><rect fill="transparent"/><rect fill="transparent"/><path data-spot="Gold" stroke="transparent" fill="none"/><rect style="fill:transparent"/></svg>');
    expect(finishMaskSvg(svg, doc, 'varnish')).toBe('<svg><rect fill="transparent"/><rect fill="rgb(0, 255, 0)"/><path data-spot="Gold" stroke="transparent" fill="none"/><rect style="fill:transparent"/></svg>');
  });
});
