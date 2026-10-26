import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FontFaceLike } from 'postext';
import { fontsourceCssUrl } from '../../viewport/pdf/fontsourceSlices.js';

// #978: a bundle that leaves a licensed family's files out names an open
// family of about the same width for it. The Sandbox sets the faces the
// family has no file of in that family's files, under the licensed name,
// on the page and for the layout worker.

vi.mock('../../storage/fontStorage.js', () => ({ getFontFile: async (id: string) => (id === 'own-regular' ? { buffer: new TextEncoder().encode('own-regular').buffer } : null) }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

type Loader = typeof import('./fontLoader.js');

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F';
const SERIF = 'Source Serif 4';
const SERIF_RECORD = { family: SERIF, type: 'google', variable: true, weights: [400, 700], styles: ['italic', 'normal'] };
const packageCss = (weight: number, style: string) => `/* source-serif-4-latin-${weight}-${style} */
@font-face {
  font-family: '${SERIF}';
  font-style: ${style};
  font-display: swap;
  font-weight: ${weight};
  src: url(./files/source-serif-4-latin-${weight}-${style}.woff2) format('woff2');
  unicode-range: ${LATIN};
}`;

let requests: string[];

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('.woff2')) return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
    const headers = { get: () => null };
    if (url === 'https://api.fontsource.org/v1/fonts/source-serif-4') return { ok: true, status: 200, headers, json: async () => SERIF_RECORD, text: async () => '' };
    for (const weight of [400, 700]) {
      for (const style of ['normal', 'italic']) {
        if (url === fontsourceCssUrl(SERIF, weight, style as 'normal' | 'italic')) return { ok: true, status: 200, headers, json: async () => ({}), text: async () => packageCss(weight, style) };
      }
    }
    // A family Fontsource does not know and Google's style sheet serves (#993).
    if (url.startsWith('https://fonts.googleapis.com/css2?family=Sheet%20Serif')) return { ok: true, status: 200, headers, json: async () => ({}), text: async () => SHEET_CSS };
    return { ok: false, status: 404, headers, json: async () => ({}), text: async () => '' };
  });
}

const SHEET = 'Sheet Serif';
const sheetFace = (weight: number, style: string) => `/* latin */
@font-face {
  font-family: '${SHEET}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/sheetserif/v1/sheet-${weight}-${style}.woff2) format('woff2');
  unicode-range: ${LATIN};
}`;
const SHEET_CSS = [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']].map(([w, st]) => sheetFace(w as number, st as string)).join('\n');

class FakeFace implements FontFaceLike {
  status = 'unloaded';
  weight: string;
  style: string;
  unicodeRange?: string;
  readonly url: string;
  constructor(readonly family: string, readonly source: unknown, d: { weight?: string; style?: string; unicodeRange?: string } = {}) {
    this.weight = d.weight ?? '400';
    this.style = d.style ?? 'normal';
    this.unicodeRange = d.unicodeRange;
    this.url = typeof source === 'string' ? (/url\("([^"]+)"\)/.exec(source)?.[1] ?? source) : 'buffer';
  }
  async load(): Promise<FontFaceLike> {
    this.status = 'loaded';
    return this;
  }
}

class FontSet {
  faces: FakeFace[] = [];
  readonly status = 'loaded';
  readonly ready = Promise.resolve();
  get size(): number {
    return this.faces.length;
  }
  [Symbol.iterator](): Iterator<FontFaceLike> {
    return this.faces[Symbol.iterator]();
  }
  add(face: FakeFace): this {
    this.faces.push(face);
    return this;
  }
  delete(face: FakeFace): boolean {
    const had = this.faces.includes(face);
    this.faces = this.faces.filter((f) => f !== face);
    return had;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  check(): boolean {
    return true;
  }
  async load(): Promise<FontFaceLike[]> {
    return [];
  }
  declared(family: string): string[] {
    return this.faces.filter((f) => f.family === family).map((f) => `${f.weight} ${f.style} ${f.url.slice(f.url.lastIndexOf('/') + 1)}`);
  }
}

const globals = globalThis as { document?: unknown; FontFace?: unknown };
let previous: { document?: unknown; FontFace?: unknown };
let fonts: FontSet;
let loader: Loader;

beforeEach(async () => {
  requests = [];
  stubFetch();
  previous = { document: globals.document, FontFace: globals.FontFace };
  fonts = new FontSet();
  globals.document = { fonts, createElement: () => ({}), head: { appendChild: (link: { onload?: () => void }) => queueMicrotask(() => link.onload?.()) } };
  globals.FontFace = FakeFace;
  vi.resetModules();
  loader = await import('./fontLoader.js');
});

afterEach(() => {
  globals.document = previous.document;
  globals.FontFace = previous.FontFace;
  vi.unstubAllGlobals();
});

const upright = (weight: number) => ({ weight, style: 'normal' as const });
const italic = (weight: number) => ({ weight, style: 'italic' as const });

describe('a custom family with a fallback (#978)', () => {
  it('declares the fallback\'s cuts under its own name, the regular, the bold and their italics', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false, fallback: SERIF }]);
    await loader.loadFont('Licensed Serif', [upright(400), italic(400)]);
    const declared = new Set(fonts.declared('Licensed Serif'));
    expect(declared).toEqual(new Set([
      '400 normal source-serif-4-latin-400-normal.woff2',
      '700 normal source-serif-4-latin-700-normal.woff2',
      '400 italic source-serif-4-latin-400-italic.woff2',
      '700 italic source-serif-4-latin-700-italic.woff2',
    ]));
    // The fallback's own name is never declared: the book names the licensed one.
    expect(fonts.declared(SERIF)).toEqual([]);
    expect(fonts.faces.filter((f) => f.family === 'Licensed Serif').some((f) => f.status === 'loaded')).toBe(true);
  });

  // #993: a fallback Google serves only as a style sheet (no static cuts
  // at Fontsource) is set under the licensed name too.
  it('declares the faces of a fallback served only by Google\'s style sheet under the family\'s name', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false, fallback: SHEET }]);
    await loader.loadFont('Licensed Serif', [upright(400), italic(400)]);
    expect(new Set(fonts.declared('Licensed Serif'))).toEqual(new Set([
      '400 normal sheet-400-normal.woff2',
      '700 normal sheet-700-normal.woff2',
      '400 italic sheet-400-italic.woff2',
      '700 italic sheet-700-italic.woff2',
    ]));
    expect(fonts.declared(SHEET)).toEqual([]);
    const payloads = await loader.collectFontPayloadsForFaces([{ family: 'Licensed Serif', weight: 400, style: 'normal' }]);
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.every((p) => p.family === 'Licensed Serif')).toBe(true);
    expect(new TextDecoder().decode(payloads.find((p) => p.weight === '400' && p.style === 'normal')!.buffer)).toContain('sheet-400-normal.woff2');
  });

  it('sheetFaceFiles answers the sheet\'s files of a face, and nothing for a family served as static cuts', async () => {
    const urlOf = (faces: { url: string }[] | null) => (faces ?? []).map((f) => f.url.slice(f.url.lastIndexOf('/') + 1));
    expect(urlOf(await loader.sheetFaceFiles(SHEET, 700, 'normal'))).toEqual(['sheet-700-normal.woff2']);
    expect(urlOf(await loader.sheetFaceFiles(SHEET, 400, 'italic'))).toEqual(['sheet-400-italic.woff2']);
    // A weight between two cuts is the one CSS font matching settles on.
    expect(urlOf(await loader.sheetFaceFiles(SHEET, 600, 'normal'))).toEqual(['sheet-700-normal.woff2']);
    expect(await loader.sheetFaceFiles(SERIF, 400, 'normal')).toBeNull();
    loader.setCustomFonts([{ name: 'Mine', variants: [] }]);
    expect(await loader.sheetFaceFiles('Mine', 400, 'normal')).toBeNull();
  });

  it('asks for the licensed family nowhere on the network', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false, fallback: SERIF }]);
    await loader.loadFont('Licensed Serif');
    expect(requests.some((u) => u.toLowerCase().includes('licensed'))).toBe(false);
  });

  it('keeps the files it has and sets only the slant it has none of in the fallback', async () => {
    loader.setCustomFonts([{
      name: 'Half Licensed',
      fallback: SERIF,
      variants: [{ weight: 400, style: 'normal', fileId: 'own-regular', format: 'ttf' }],
    }]);
    await loader.loadFont('Half Licensed', [upright(400), italic(400)]);
    const declared = fonts.declared('Half Licensed');
    expect(declared.filter((d) => d.includes('normal') && d.includes('source-serif'))).toEqual([]);
    expect(declared.some((d) => d.includes('400 italic source-serif-4-latin-400-italic.woff2'))).toBe(true);
    expect(declared.some((d) => d.endsWith('buffer'))).toBe(true);
  });

  it('goes to the layout worker as payloads named for the family', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false, fallback: SERIF }]);
    const payloads = await loader.collectFontPayloadsForFaces([{ family: 'Licensed Serif', weight: 400, style: 'normal' }, { family: 'Licensed Serif', weight: 700, style: 'italic' }]);
    expect(payloads.every((p) => p.family === 'Licensed Serif')).toBe(true);
    expect(payloads.map((p) => `${p.weight} ${p.style}`).sort()).toEqual(['400 italic', '400 normal', '700 italic', '700 normal']);
    expect(new TextDecoder().decode(payloads.find((p) => p.weight === '400' && p.style === 'normal')!.buffer)).toContain('source-serif-4-latin-400-normal.woff2');
  });

  it('is not reported as short of the variants the fallback answers', () => {
    const family = { name: 'Licensed Serif', variants: [], fallback: SERIF };
    expect(loader.missingStandardVariants(family)).toEqual([]);
    expect(loader.missingStandardVariants({ ...family, fallback: undefined }).length).toBe(4);
    const half = { name: 'Half', fallback: SERIF, variants: [{ weight: 400, style: 'normal' as const, fileId: 'x', format: 'ttf' as const }] };
    expect(loader.missingStandardVariants(half)).toEqual([{ weight: 700, style: 'normal' }]);
  });

  it('removes the faces when the family changes, and follows the fallback it is given', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], fallback: SERIF }]);
    await loader.loadFont('Licensed Serif');
    expect(fonts.declared('Licensed Serif').length).toBeGreaterThan(0);
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [] }]);
    expect(fonts.declared('Licensed Serif')).toEqual([]);
  });
});

// #968: an edition laid out behind the reader may declare a custom family
// the book on screen does not.
describe('the custom families of an edition laid out behind the reader (#968)', () => {
  const own = { name: 'Only Here', variants: [{ weight: 400, style: 'normal' as const, fileId: 'own-regular', format: 'ttf' as const }] };

  it('are served as the book\'s own, without joining its list', async () => {
    loader.setCustomFonts([{ name: 'Shared', variants: [] }]);
    loader.declareEditionFonts([{ name: 'Shared', variants: [], fallback: SERIF }, own]);
    // The book's definition of a name wins; the new one is served.
    expect(loader.getCustomFontFamily('Shared')?.fallback).toBeUndefined();
    expect(loader.getCustomFontFamily('Only Here')).toBe(own);
    expect(loader.isCustomFontFamily('Only Here')).toBe(true);
    expect(loader.listCustomFontFamilies().map((f) => f.name)).toEqual(['Shared']);
    expect(loader.customFontsSignature()).not.toContain('Only Here');
    await loader.loadFont('Only Here');
    expect(fonts.declared('Only Here')).toEqual(['400 normal buffer']);
    const payloads = await loader.collectFontPayloadsForFaces([{ family: 'Only Here', weight: 400, style: 'normal' }]);
    expect(payloads.map((p) => p.family)).toEqual(['Only Here']);
    expect(requests.some((u) => u.includes('only'))).toBe(false);
  });

  it('give way to the book on screen\'s own definition, and to another book', () => {
    const heard: string[][] = [];
    loader.onCustomFontsChanged((families) => heard.push(families));
    loader.declareEditionFonts([own]);
    expect(heard).toEqual([['Only Here']]);
    // Declaring it again changes nothing.
    loader.declareEditionFonts([own]);
    expect(heard).toHaveLength(1);
    loader.setCustomFonts([{ ...own, name: 'Only Here' }]);
    expect(loader.listCustomFontFamilies().map((f) => f.name)).toEqual(['Only Here']);
    loader.setCustomFonts(undefined);
    loader.declareEditionFonts([own]);
    loader.setCustomFonts(undefined, { newBook: true });
    expect(loader.getCustomFontFamily('Only Here')).toBeUndefined();
  });
});
