import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDocument, type CustomFontFamily, type PostextConfig, type VDTDocument } from 'postext';

// The EPUB cover of a closed book (#1548): the Books panel's compile
// worker paints the first page with the book's own faces, declared in the
// worker's font set from the book's registry, by the paint the EPUB tab
// makes on the page; the picture is the one the EPUB tab writes for that
// book. The canvas here records what it is asked to draw and, for each
// piece of text, the face the realm's font set gives the family it names:
// its "JPEG" is that record.

// The font files of the two books, by file id.
const fontFiles = vi.hoisted(() => new Map<string, ArrayBuffer>());
vi.mock('../storage/fontStorage.js', async (original) => ({
  ...(await original<object>()),
  getFontFile: vi.fn(async (fileId: string) => (fontFiles.has(fileId) ? { buffer: fontFiles.get(fileId)!.slice(0) } : null)),
}));

const { compiledBookCover } = await import('./compileCover.js');
const { epubPaintedCover } = await import('../epub/cover.js');
const { setCustomFonts } = await import('../controls/fonts/fontLoader.js');

const bytesOf = (...values: number[]) => new Uint8Array(values).buffer as ArrayBuffer;
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

class FakeFontFace {
  constructor(public family: string, public source: ArrayBuffer, public descriptors: FontFaceDescriptors = {}) {}
  load() { return Promise.resolve(this); }
}

class FakeFontSet {
  faces: FakeFontFace[] = [];
  ready = Promise.resolve(this);
  add(face: FakeFontFace) { this.faces.push(face); return this; }
  check() { return true; }
  load() { return Promise.resolve([]); }
  forEach(cb: (face: FakeFontFace) => void) { this.faces.forEach(cb); }
  [Symbol.iterator]() { return this.faces[Symbol.iterator](); }
}

const G = globalThis as unknown as Record<string, unknown>;

/** The faces of the realm's font set (the page's, or the worker's) that a
 *  canvas font string names, as family and bytes. */
function facesFor(font: string): string[] {
  const set = ((G.document as { fonts?: FakeFontSet } | undefined)?.fonts ?? G.fonts) as FakeFontSet | undefined;
  return (set?.faces ?? []).filter((f) => font.includes(f.family)).map((f) => `${f.family}:${hex(f.source)}`);
}

type Op = { text: string; font: string; faces: string[] } | { drawn: Op[] };

/** A canvas that records the text drawn on it and the faces it is drawn
 *  in. Every other call is accepted and does nothing. */
class RecordingCanvas {
  width = 1;
  height = 1;
  ops: Op[] = [];
  private ctx: unknown;
  getContext() {
    this.ctx ??= recordingContext(this);
    return this.ctx;
  }
  async convertToBlob() {
    return new Blob([JSON.stringify(this.ops)], { type: 'image/jpeg' });
  }
}

function recordingContext(canvas: RecordingCanvas): unknown {
  const noop = () => undefined;
  const target: Record<string | symbol, unknown> = {
    canvas,
    font: '10px sans-serif',
    direction: 'ltr',
    globalAlpha: 1,
    lineWidth: 1,
    fillText(this: { font: string }, text: string) { canvas.ops.push({ text, font: this.font, faces: facesFor(this.font) }); },
    drawImage(source: unknown) { if (source instanceof RecordingCanvas) canvas.ops.push({ drawn: [...source.ops] }); },
    measureText: (s: string) => ({ width: s.length * 7, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 7 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({ setTransform: noop }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  };
  const proxy: unknown = new Proxy(target, {
    get: (t, p) => (p in t ? (typeof t[p] === 'function' ? (t[p] as (...a: unknown[]) => unknown).bind(proxy) : t[p]) : noop),
    set: (t, p, v) => { t[p] = v; return true; },
  });
  return proxy;
}

const family = (name: string, fileId: string): CustomFontFamily => ({ name, variants: [{ weight: 400, style: 'normal', fileId, format: 'ttf' }] });
const ALPHA = family('Alpha Serif', 'alpha.ttf');
const BETA = family('Beta Sans', 'beta.ttf');

/** A book set in its own custom family, laid out. */
function book(face: CustomFontFamily, words: string): { config: PostextConfig; markdown: string; doc: VDTDocument } {
  const config: PostextConfig = { page: { sizePreset: '17x24' }, customFonts: [face], bodyText: { fontFamily: face.name } } as PostextConfig;
  const markdown = `${words}\n`;
  return { config, markdown, doc: buildDocument({ markdown, resources: [] }, config) };
}

/** The cover the compile worker paints: a realm of its own, with the
 *  compiled book's registry and an empty font set. */
async function workerCover(b: ReturnType<typeof book>): Promise<{ bytes: string; declared: string[] }> {
  const fonts = new FakeFontSet();
  G.fonts = fonts;
  setCustomFonts(b.config.customFonts, { newBook: true });
  const rasterize = vi.fn(async () => null);
  const cover = await compiledBookCover(b.doc, { config: b.config, resources: [], markdown: b.markdown }, 'T', rasterize);
  expect(cover).toMatchObject({ mediaType: 'image/jpeg', alt: 'T', showsFirstPage: true });
  delete G.fonts;
  return { bytes: new TextDecoder().decode(cover!.bytes), declared: fonts.faces.map((f) => `${f.family}:${hex(f.source)}`) };
}

/** The cover the EPUB tab paints on the page, the page's font set holding
 *  the faces of `open` (the book open) as the font loader declares them. */
async function pageCover(b: ReturnType<typeof book>, open: CustomFontFamily): Promise<string> {
  const fonts = new FakeFontSet();
  fonts.add(new FakeFontFace(open.name, fontFiles.get(open.variants[0]!.fileId)!, { weight: '400', style: 'normal' }));
  G.document = { fonts };
  const cover = await epubPaintedCover(b.doc, { config: b.config, resources: [] }, 'T');
  delete G.document;
  return new TextDecoder().decode(cover!.bytes);
}

beforeEach(() => {
  fontFiles.set('alpha.ttf', bytesOf(0xa1, 0xa2, 0xa3));
  fontFiles.set('beta.ttf', bytesOf(0xb1, 0xb2, 0xb3));
  vi.stubGlobal('OffscreenCanvas', RecordingCanvas);
  vi.stubGlobal('FontFace', FakeFontFace);
  // No catalogue family is fetched: the books are set in their own.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete G.fonts;
  delete G.document;
});

describe('compiledBookCover (#1548)', () => {
  it('paints each of two books with different custom fonts in its own faces, as the EPUB tab paints it', async () => {
    const alpha = book(ALPHA, 'Alpha words on the first page.');
    const beta = book(BETA, 'Beta words on the first page.');
    const a = await workerCover(alpha);
    const b = await workerCover(beta);
    // Each worker's font set holds the faces of the book it compiles.
    expect(a.declared).toEqual(['Alpha Serif:a1a2a3']);
    expect(b.declared).toEqual(['Beta Sans:b1b2b3']);
    // The text is drawn in them.
    const textFaces = (bytes: string) => [...new Set((JSON.parse(bytes) as Op[]).flatMap(function flat(op: Op): string[] {
      return 'drawn' in op ? op.drawn.flatMap(flat) : op.text.includes('words') ? op.faces : [];
    }))];
    expect(textFaces(a.bytes)).toEqual(['Alpha Serif:a1a2a3']);
    expect(textFaces(b.bytes)).toEqual(['Beta Sans:b1b2b3']);
    // The same picture as the EPUB tab's for that book open on the page.
    expect(a.bytes).toBe(await pageCover(alpha, ALPHA));
    expect(b.bytes).toBe(await pageCover(beta, BETA));
    // On a page with the other book open, the second book's cover would
    // not be its own: why the page no longer paints it.
    expect(await pageCover(beta, ALPHA)).not.toBe(b.bytes);
  });

  it('paints nothing for a book without pages', async () => {
    G.fonts = new FakeFontSet();
    const empty = { pages: [] } as unknown as VDTDocument;
    await expect(compiledBookCover(empty, { config: {}, resources: [], markdown: '' }, 'T', async () => null)).resolves.toBeNull();
  });
});
