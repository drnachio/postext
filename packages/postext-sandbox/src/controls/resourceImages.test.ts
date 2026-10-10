import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from 'postext';
import { applySingleInkToSvg } from 'postext';

// The blob store, the font inliner and the text index are the Sandbox's own
// IndexedDB and DOM plumbing: stood in for here.
const blobs = new Map<string, { contentType: string; bytes: ArrayBuffer }>();
vi.mock('../storage/blobStore', () => ({
  getBlob: async (fileId: string) => blobs.get(fileId) ?? null,
}));
/** The faces the stand-in provider holds, by family (#630). */
const heldFonts = new Map<string, Uint8Array>();
vi.mock('./svgFontProvider', () => ({
  sandboxSvgFontProvider: () => async (family: string) => {
    const bytes = heldFonts.get(family);
    if (!bytes) throw new Error('no such font in tests');
    return bytes;
  },
  svgFontGeneration: () => 0,
}));
vi.mock('./svgTextIndex', () => ({ ensureSvgTextIndex: () => undefined, dropSvgTextIndex: () => undefined }));
const registered: { fileId: string; options: unknown }[] = [];
vi.mock('postext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('postext')>()),
  registerResourceImage: (fileId: string, _image: unknown, options: unknown) => {
    registered.push({ fileId, options });
  },
}));

const {
  ensureResourceImages,
  ensureResourceImageUrls,
  getResourceImageUrl,
  invalidateResourceImage,
  svgFontIssues,
  svgFontReport,
  unavailableResourceImages,
} = await import('./resourceImages');

const INK = '#295aa3';
const RAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1" fill="#000000"/></svg>';
const enc = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const resource = (id: string, kind: 'svg' | 'bitmap'): Resource => ({
  id, typeId: 'figure', kind, createdAt: 0, updatedAt: 0,
  ...(kind === 'svg' ? { svg: { fileId: id, width: 2, height: 1 } } : { bitmap: { fileId: id, format: 'png', width: 2, height: 1 } }),
});

/** Markup handed to each `<img>` the canvas path decoded. */
const decodedMarkup: string[] = [];
const G = globalThis as unknown as Record<string, unknown>;
const saved = { document: G.document, Image: G.Image, createImageBitmap: G.createImageBitmap };

beforeEach(() => {
  blobs.clear();
  registered.length = 0;
  decodedMarkup.length = 0;
  G.document = {};
  G.Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      void fetch(url).then((r) => r.text()).then((text) => {
        decodedMarkup.push(text);
        this.onload?.();
      });
    }
  };
  // A truncated upload: stored, but no decoder takes it.
  G.createImageBitmap = async () => {
    throw new Error('The source image could not be decoded.');
  };
});

afterEach(() => {
  Object.assign(G, saved);
  for (const id of ['broken.png', 'late.png', 'fig.svg', 'chart.svg']) invalidateResourceImage(id);
  heldFonts.clear();
});

describe('image payloads the previews cannot show', () => {
  it('keeps an undecodable image flagged when the HTML tab builds its URL', async () => {
    const broken = resource('broken.png', 'bitmap');
    blobs.set('broken.png', { contentType: 'image/png', bytes: new Uint8Array([0x89, 0x50]).buffer });
    await ensureResourceImages([broken]);
    expect(unavailableResourceImages().has('broken.png')).toBe(true);
    // The HTML path finds the blob stored, but never decodes it: the
    // canvas's verdict stands.
    await ensureResourceImageUrls([broken]);
    expect(getResourceImageUrl('broken.png')).toBeDefined();
    expect(unavailableResourceImages().has('broken.png')).toBe(true);
  });

  it('flags a missing payload from either path, and clears it once it is stored', async () => {
    const late = resource('late.png', 'bitmap');
    await ensureResourceImageUrls([late]);
    expect(unavailableResourceImages().has('late.png')).toBe(true);
    blobs.set('late.png', { contentType: 'image/png', bytes: new Uint8Array([1]).buffer });
    await ensureResourceImageUrls([late]);
    expect(unavailableResourceImages().has('late.png')).toBe(false);
  });
});

describe('single ink in the Sandbox', () => {
  it('recolours an SVG once and registers it so the canvas never tints it again', async () => {
    blobs.set('fig.svg', { contentType: 'image/svg+xml', bytes: enc(RAW) });
    expect(await ensureResourceImages([resource('fig.svg', 'svg')], INK)).toBe(true);
    expect(decodedMarkup).toEqual([applySingleInkToSvg(RAW, INK)]);
    expect(registered).toEqual([{ fileId: 'fig.svg', options: { vector: true, singleInk: false } }]);
    // The HTML tab's URL serves the same markup, recoloured once.
    await ensureResourceImageUrls([resource('fig.svg', 'svg')], INK);
    expect(await (await fetch(getResourceImageUrl('fig.svg')!)).text()).toBe(applySingleInkToSvg(RAW, INK));
  });
});

describe('fonts in SVG pictures (#630)', () => {
  const CHART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><text font-family="Lato">Q3</text><text font-family="Nowhere">x</text></svg>';

  it('inlines the faces the provider holds, keeps a report and lists the missing family', async () => {
    heldFonts.set('Lato', Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0, 0]));
    blobs.set('chart.svg', { contentType: 'image/svg+xml', bytes: enc(CHART) });
    await ensureResourceImages([resource('chart.svg', 'svg')]);
    expect(decodedMarkup[0]).toContain('@font-face{font-family:"Lato";font-weight:400;font-style:normal;src:url(data:font/woff2;base64,');
    expect(svgFontReport('chart.svg')?.map((f) => `${f.family}:${f.status}`)).toEqual(['Lato:inlined', 'Nowhere:unavailable']);
    expect([...svgFontIssues().keys()]).toEqual(['chart.svg']);
  });

  it('leaves the markup as stored for a resource with svg.inlineFonts: false', async () => {
    heldFonts.set('Lato', Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0, 0]));
    blobs.set('chart.svg', { contentType: 'image/svg+xml', bytes: enc(CHART) });
    const r = resource('chart.svg', 'svg');
    await ensureResourceImages([{ ...r, svg: { ...r.svg!, inlineFonts: false } }]);
    expect(decodedMarkup[0]).toBe(CHART);
    await ensureResourceImageUrls([r], null, { inlineFonts: false });
    expect(await (await fetch(getResourceImageUrl('chart.svg')!)).text()).toBe(CHART);
  });
});
