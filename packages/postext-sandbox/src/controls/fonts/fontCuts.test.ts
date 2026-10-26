import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FontFaceLike, PostextConfig } from 'postext';
import { FONTSOURCE_PACKAGE_VERSION, fontsourceCssUrl, fontsourceFileUrl, fontsourceUrlAt, fontsourceVersionOf } from '../../viewport/pdf/fontsourceSlices.js';
// The blocks of the Cookbook kit that fetch font files, as text (Vite's `?raw`).
// @ts-expect-error a file outside the package, with no types
import KIT_FONTS from '../../../../../cookbook/_kit/fonts.js?raw';
// @ts-expect-error as above
import KIT_CJK from '../../../../../cookbook/_kit/cjk.js?raw';
// @ts-expect-error as above
import KIT_ARABIC from '../../../../../cookbook/_kit/arabic.js?raw';
// @ts-expect-error as above
import KIT_COMICS from '../../../../../cookbook/_kit/comics.js?raw';
// @ts-expect-error as above
import KIT_PDF from '../../../../../cookbook/_kit/pdf.js?raw';
// @ts-expect-error as above
import KIT_IMAGES from '../../../../../cookbook/_kit/images.js?raw';

// #757: the Sandbox measured a Google family from Google's variable file,
// a Cookbook pen and the Sandbox's own PDF from Fontsource's static cuts,
// and between two masters of a family the two do not have the same
// advances: seven recipe editions broke lines at another word. The loader
// now declares the static files, one per weight, style and subset, on the
// page and for the layout worker, and the PDF provider embeds from the
// same list. Against the answers of Fontsource, jsDelivr and Google Fonts.

vi.mock('../../storage/fontStorage.js', () => ({ getFontFile: async () => null }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

type Loader = typeof import('./fontLoader.js');

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F';
const LATIN_EXT = 'U+0100-02BA,U+1E00-1E9F';
const CYRILLIC = 'U+0301,U+0400-045F';

/** A package's style sheet of one weight, as jsDelivr serves it: the
 *  subsets in Fontsource's order, `latin` last. */
function packageCss(id: string, family: string, subsets: [string, string][], weight = 400): string {
  return subsets.map(([name, range]) => `/* ${id}-${name}-${weight}-normal */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-display: swap;
  font-weight: ${weight};
  src: url(./files/${id}-${name}-${weight}-normal.woff2) format('woff2'), url(./files/${id}-${name}-${weight}-normal.woff) format('woff');
  unicode-range: ${range};
}`).join('\n');
}

const SERIF = 'Source Serif 4';
const SERIF_RECORD = { family: SERIF, type: 'google', variable: true, weights: [200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'] };
const SERIF_CSS = packageCss('source-serif-4', SERIF, [['cyrillic', CYRILLIC], ['latin-ext', LATIN_EXT], ['latin', LATIN]]);
/** Google's answer for the whole axis: the variable file, by subset. */
const SERIF_GOOGLE = ['normal', 'italic'].flatMap((style) => [['cyrillic', CYRILLIC], ['latin-ext', LATIN_EXT], ['latin', LATIN]].map(([name, range]) => `@font-face {
  font-family: '${SERIF}';
  font-style: ${style};
  font-weight: 200 900;
  src: url(https://fonts.gstatic.com/s/sourceserif4/v1/${style}-${name}.woff2) format('woff2');
  unicode-range: ${range};
}`)).join('\n');
/** Google's answer for one weight between two cuts: the variable file at it. */
const serifInstance = (weight: number) => [['latin-ext', LATIN_EXT], ['latin', LATIN]].map(([name, range]) => `@font-face {
  font-family: '${SERIF}';
  font-style: normal;
  font-weight: ${weight};
  src: url(https://fonts.gstatic.com/s/sourceserif4/v1/normal-${name}.woff2) format('woff2');
  unicode-range: ${range};
}`).join('\n');

// A family with two weights and no variable axis.
const AMIRI_RECORD = { family: 'Amiri', type: 'google', variable: false, weights: [400, 700], styles: ['italic', 'normal'] };
const AMIRI_CSS = packageCss('amiri', 'Amiri', [['arabic', 'U+0600-06FF,U+200C-200E,U+2010-2011'], ['latin-ext', LATIN_EXT], ['latin', LATIN]]);
// A family with no italic.
const GROTESK_RECORD = { family: 'Host Grotesk', type: 'google', variable: true, weights: [300, 400, 500, 600, 700, 800], styles: ['normal'] };
const GROTESK_CSS = packageCss('host-grotesk', 'Host Grotesk', [['latin-ext', LATIN_EXT], ['latin', LATIN]]);
// A Japanese family: numbered slices, then the Latin subsets.
const SLICES: [string, string][] = [
  ...Array.from({ length: 20 }, (_, i): [string, string] => [String(i), `U+${(0x4e00 + i * 16).toString(16)}-${(0x4e0f + i * 16).toString(16)}`]),
  // The slice that repeats the ASCII letters, as the numbered slices of Noto Serif JP do.
  ['118', 'U+41-5a,U+61-7a,U+3042'],
  ['119', 'U+20,U+3001-3002,U+3041'],
  ['latin-ext', LATIN_EXT],
  ['latin', LATIN],
];
const MINCHO_RECORD = { family: 'Noto Serif JP', type: 'google', variable: true, weights: [400, 700], styles: ['normal'], subsets: ['japanese', 'latin', 'latin-ext'] };
// An Arabic family with emoji: numbered slices that are not the script's, one of which repeats the digits.
const PLAYPEN_RECORD = { family: 'Playpen Sans Arabic', type: 'google', variable: true, weights: [400, 700], styles: ['normal'], subsets: ['arabic', 'emoji', 'latin', 'latin-ext', 'math'] };
const PLAYPEN_CSS = packageCss('playpen-sans-arabic', 'Playpen Sans Arabic', [
  ['1', 'U+200d,U+2620,U+1f308'], ['2', 'U+23,U+2a,U+30-39,U+200d,U+20e3'],
  ['arabic', 'U+0600-06FF,U+200C-200E,U+2010-2011'], ['math', 'U+0302-0303,U+0308,U+2212'], ['latin-ext', LATIN_EXT], ['latin', LATIN],
]);
const MINCHO_CSS = packageCss('noto-serif-jp', 'Noto Serif JP', SLICES);

/** What the network answers, by URL prefix: a string is a body, an Error a
 *  request that rejects, a number a status. Font files answer their own
 *  URL as bytes, unless the URL is in `noFile`. */
let routes: Record<string, string | object | Error | number>;
let requests: string[];
let noFile: Set<string>;
/** The URLs the network does not answer: the request stays out until it
 *  is given up. */
let stalled: Set<string>;
/** The URLs the network answers after a while (ms). */
let slow: Map<string, number>;
/** The version jsDelivr says it answered a package's style sheets from, by Fontsource id (x-jsd-version). */
let answeredFrom: Map<string, string>;

const fontsource = (id: string) => `https://api.fontsource.org/v1/fonts/${id}`;
const google = (family: string) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
const file = (id: string, subset: string, weight: number, style = 'normal') => `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`;
const fileOf = (bytes: ArrayBuffer | Uint8Array) => new TextDecoder().decode(bytes);
const cps = (text: string) => new Set([...text].map((ch) => ch.codePointAt(0)!));

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: string, init?: { signal?: AbortSignal }) => {
    const url = String(input);
    requests.push(url);
    if (slow.has(url)) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, slow.get(url));
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    if (stalled.has(url)) {
      await new Promise<never>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    if (url.endsWith('.woff2')) {
      if (noFile.has(url)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
    }
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    const answer = key === undefined ? 404 : routes[key]!;
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return { ok: false, status: answer, json: async () => ({}), text: async () => '' };
    const from = /@fontsource\/([a-z0-9-]+)@/.exec(url)?.[1];
    const headers = { get: (name: string) => (name === 'x-jsd-version' && from ? answeredFrom.get(from) ?? null : null) };
    return { ok: true, status: 200, headers, json: async () => answer, text: async () => String(answer) };
  });
}

function holds(unicodeRange: string | undefined, text: string): boolean {
  if (!unicodeRange) return true;
  const ranges = unicodeRange.split(',').map((part) => {
    const [lo, hi = lo] = part.trim().slice(2).split('-');
    return [parseInt(lo!, 16), parseInt(hi!, 16)] as const;
  });
  return [...text].some((ch) => ranges.some(([lo, hi]) => ch.codePointAt(0)! >= lo && ch.codePointAt(0)! <= hi));
}

class FakeFace implements FontFaceLike {
  status = 'unloaded';
  weight: string;
  style: string;
  unicodeRange?: string;
  readonly url: string;
  constructor(readonly family: string, readonly source: string, d: { weight?: string; style?: string; unicodeRange?: string } = {}) {
    this.weight = d.weight ?? '400';
    this.style = d.style ?? 'normal';
    this.unicodeRange = d.unicodeRange;
    this.url = /url\("([^"]+)"\)/.exec(source)?.[1] ?? source;
  }
}

/** `document.fonts` with the matching of CSS: the slant asked when the
 *  family has it, then the weight (a face of that weight, else the
 *  nearest), and of that cut the files whose range holds the text. */
class CutFontSet {
  faces: FakeFace[] = [];
  loads: string[] = [];
  /** No file arrives while set: `load` answers without loading. */
  offline = false;
  /** Files (by URL) that never arrive. */
  broken = new Set<string>();
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
  addEventListener(): void {}
  removeEventListener(): void {}
  private cut(font: string, text: string): FakeFace[] {
    const m = /^(italic )?(\d+) [\d.]+px "?([^"]+)"?$/.exec(font);
    if (!m) return [];
    const family = this.faces.filter((f) => f.family === m[3]);
    const slant = family.filter((f) => (f.style === 'italic') === !!m[1]);
    const pool = slant.length > 0 ? slant : family;
    const target = Number(m[2]);
    const distance = (f: FakeFace): number => {
      const [lo, hi = lo] = f.weight.split(' ').map(Number) as [number, number?];
      return target < lo ? lo - target : target > hi ? target - hi : 0;
    };
    const best = Math.min(...pool.map(distance));
    const cut = pool.filter((f) => distance(f) === best);
    const one = cut[0];
    return cut.filter((f) => f.weight === one!.weight && f.style === one!.style && holds(f.unicodeRange, text));
  }
  check(font: string, text = ' '): boolean {
    return this.cut(font, text).every((f) => f.status === 'loaded');
  }
  async load(font: string, text = ' '): Promise<FontFaceLike[]> {
    this.loads.push(font);
    if (this.offline) return [];
    const cut = this.cut(font, text);
    for (const f of cut) f.status = this.broken.has(f.url) ? 'error' : 'loaded';
    return cut.filter((f) => f.status === 'loaded');
  }
  declared(family: string): string[] {
    return this.faces.filter((f) => f.family === family).map((f) => `${f.weight} ${f.style} ${f.url.slice(f.url.lastIndexOf('/') + 1)}`);
  }
  loaded(family: string): string[] {
    return this.faces.filter((f) => f.family === family && f.status === 'loaded').map((f) => f.url.slice(f.url.lastIndexOf('/') + 1));
  }
}

const globals = globalThis as { document?: unknown; FontFace?: unknown };
let previous: { document?: unknown; FontFace?: unknown };
let fonts: CutFontSet;
/** The style sheets the page was given. */
let links: string[];
let loader: Loader;

beforeEach(async () => {
  routes = {
    [fontsource('source-serif-4')]: SERIF_RECORD,
    [fontsourceCssUrl(SERIF, 400, 'normal')]: SERIF_CSS,
    [fontsource('amiri')]: AMIRI_RECORD,
    [fontsourceCssUrl('Amiri', 400, 'normal')]: AMIRI_CSS,
    [fontsource('host-grotesk')]: GROTESK_RECORD,
    [fontsourceCssUrl('Host Grotesk', 400, 'normal')]: GROTESK_CSS,
    [fontsource('noto-serif-jp')]: MINCHO_RECORD,
    [fontsourceCssUrl('Noto Serif JP', 400, 'normal')]: MINCHO_CSS,
    [fontsource('playpen-sans-arabic')]: PLAYPEN_RECORD,
    [fontsourceCssUrl('Playpen Sans Arabic', 400, 'normal')]: PLAYPEN_CSS,
  };
  requests = [];
  noFile = new Set();
  stalled = new Set();
  slow = new Map();
  answeredFrom = new Map();
  stubFetch();
  previous = { document: globals.document, FontFace: globals.FontFace };
  fonts = new CutFontSet();
  links = [];
  globals.document = {
    fonts,
    createElement: () => ({}),
    head: {
      appendChild: (link: { href: string; onload?: () => void }) => {
        links.push(link.href);
        queueMicrotask(() => link.onload?.());
      },
    },
  };
  globals.FontFace = FakeFace;
  vi.resetModules();
  loader = await import('./fontLoader.js');
});

afterEach(() => {
  vi.useRealTimers();
  globals.document = previous.document;
  globals.FontFace = previous.FontFace;
  vi.unstubAllGlobals();
});

const upright = (weight: number) => ({ weight, style: 'normal' as const });
const italic = (weight: number) => ({ weight, style: 'italic' as const });
const names = (faces: { url: string }[]) => faces.map((f) => f.url.slice(f.url.lastIndexOf('/') + 1));

describe('the faces of a variable Google family Fontsource has as files (#757)', () => {
  it('are declared on the page as static files, one per weight, style and subset in use, with no style sheet of Google\'s', async () => {
    await loader.loadFont(SERIF, [upright(400), italic(400), upright(700)]);
    // The files a pen does not load first, then `latin` and `latin-ext`, as the kit declares them.
    expect(fonts.declared(SERIF)).toEqual([
      '400 normal source-serif-4-cyrillic-400-normal.woff2', '400 normal source-serif-4-latin-400-normal.woff2', '400 normal source-serif-4-latin-ext-400-normal.woff2',
      '400 italic source-serif-4-cyrillic-400-italic.woff2', '400 italic source-serif-4-latin-400-italic.woff2', '400 italic source-serif-4-latin-ext-400-italic.woff2',
      '700 normal source-serif-4-cyrillic-700-normal.woff2', '700 normal source-serif-4-latin-700-normal.woff2', '700 normal source-serif-4-latin-ext-700-normal.woff2',
    ]);
    // The kit's URL, file for file, and the range of the package's own style sheet.
    const latin = fonts.faces[1]!;
    expect(latin.url).toBe(file('source-serif-4', 'latin', 400));
    expect(latin.source).toBe(`url("${file('source-serif-4', 'latin', 400)}") format('woff2')`);
    expect(latin.unicodeRange).toBe(LATIN);
    expect(fonts.faces[2]!.unicodeRange).toBe(LATIN_EXT);
    // No face answers for a range of weights: nothing is interpolated.
    expect(fonts.faces.some((f) => f.weight.includes(' '))).toBe(false);
    // The file with the Latin letters of each cut is loaded, the others when a text needs them.
    expect(fonts.loaded(SERIF)).toEqual(['source-serif-4-latin-400-normal.woff2', 'source-serif-4-latin-400-italic.woff2', 'source-serif-4-latin-700-normal.woff2']);
    expect(links).toEqual([]);
    expect(requests.some((u) => u.includes('fonts.googleapis.com') || u.includes('gstatic'))).toBe(false);
  });

  it('take one request for the record and one for the package\'s style sheet, whatever weights follow', async () => {
    await loader.loadFont(SERIF, [upright(400)]);
    await loader.loadFont(SERIF, [upright(600), italic(600)]);
    await loader.loadFont(SERIF, [upright(400)]);
    expect(requests).toEqual([fontsource('source-serif-4'), fontsourceCssUrl(SERIF, 400, 'normal')]);
    expect(fonts.faces).toHaveLength(9);
  });

  it('are the regular face alone when no other is asked: what a specimen is set in', async () => {
    await loader.loadFont(SERIF);
    expect(new Set(fonts.declared(SERIF).map((f) => f.slice(0, 10)))).toEqual(new Set(['400 normal']));
  });

  it('are the ones a configuration asks for: the four of the body, the weight of the headings, the running heads\' own', async () => {
    const config: PostextConfig = { bodyText: { fontFamily: SERIF }, headings: { fontFamily: 'Host Grotesk', fontWeight: 600 } };
    const uses = loader.configFontUses(config, 'Some *emphasis* and **more**.');
    const key = (family: string) => (uses.get(family) ?? []).map((u) => `${u.weight}${u.style === 'italic' ? 'i' : ''}`);
    expect(key(SERIF)).toEqual(expect.arrayContaining(['400', '400i', '700', '700i']));
    expect(key('Host Grotesk')).toContain('600');
    // The built-in running heads, which the configuration does not write: Open Sans at 600.
    expect(key('Open Sans')).toContain('600');
    await loader.preloadConfigFonts(config, 'Some *emphasis* and **more**.');
    expect(new Set(fonts.declared(SERIF).map((f) => f.split(' ').slice(0, 2).join(' ')))).toEqual(new Set(['400 normal', '400 italic', '700 normal', '700 italic']));
    expect(links.filter((href) => href.includes(encodeURIComponent(SERIF)))).toEqual([]);
  });

  it('go to the layout worker whole, cut by cut, with the regular, the bold and their italics, the files in the order the page declares them', async () => {
    const faces = await loader.familyCutFaces(SERIF, [upright(600)], { standard: true });
    expect(faces.map((f) => `${f.weight} ${f.style}`).filter((cut, i, all) => all.indexOf(cut) === i)).toEqual(['400 normal', '400 italic', '600 normal', '700 normal', '700 italic']);
    expect(names(faces.slice(6, 9))).toEqual(['source-serif-4-cyrillic-600-normal.woff2', 'source-serif-4-latin-600-normal.woff2', 'source-serif-4-latin-ext-600-normal.woff2']);
    expect(faces.every((f) => f.url.startsWith(`https://cdn.jsdelivr.net/npm/@fontsource/source-serif-4@${FONTSOURCE_PACKAGE_VERSION}/files/`))).toBe(true);
    // The same files the page declares for those faces.
    await loader.loadFont(SERIF, [upright(600)]);
    expect(fonts.faces.map((f) => f.url)).toEqual(faces.slice(6, 9).map((f) => f.url));
    // As payloads: bytes of their own, in that order, each file fetched once.
    const payloads = await loader.fetchFacePayloads(faces);
    expect(payloads.map((p) => fileOf(p.buffer))).toEqual(faces.map((f) => f.url));
    expect(payloads.map((p) => p.unicodeRange).slice(0, 3)).toEqual([CYRILLIC, LATIN, LATIN_EXT]);
    const again = await loader.fetchFacePayloads(faces);
    expect(again[0]!.buffer).not.toBe(payloads[0]!.buffer);
    expect(again[0]!.buffer.byteLength).toBeGreaterThan(0);
    expect(requests.filter((u) => u === faces[0]!.url)).toHaveLength(1);
  });

  it('go to the worker for the faces asked alone when the family is cut by slices, the script\'s own files last', async () => {
    const faces = await loader.familyCutFaces('Noto Serif JP', [upright(400)], { standard: true });
    // No 700 beyond what was asked: a cut is as many files as the family has slices.
    expect(new Set(faces.map((f) => f.weight))).toEqual(new Set(['400']));
    expect(names(faces).slice(0, 4)).toEqual(['noto-serif-jp-latin-400-normal.woff2', 'noto-serif-jp-latin-ext-400-normal.woff2', 'noto-serif-jp-119-400-normal.woff2', 'noto-serif-jp-118-400-normal.woff2']);
    expect(names(faces).at(-1)).toBe('noto-serif-jp-0-400-normal.woff2');
    expect(faces).toHaveLength(SLICES.length);
    // A cut asked for is sent whatever the family: its bold when a page sets it.
    expect(new Set((await loader.familyCutFaces('Noto Serif JP', [upright(400), upright(700)], { standard: true })).map((f) => f.weight))).toEqual(new Set(['400', '700']));
  });

  it('leave out a subset the record gives no file for in a weight', async () => {
    const subsets = (cyrillic: boolean) => ({ ...(cyrillic ? { cyrillic: {} } : {}), 'latin-ext': {}, latin: {} });
    routes[fontsource('source-serif-4')] = {
      ...SERIF_RECORD, weights: [400, 900],
      variants: { 400: { normal: subsets(true), italic: subsets(true) }, 900: { normal: subsets(false), italic: subsets(false) } },
    };
    expect(names(await loader.familyCutFaces(SERIF, [upright(900)]))).toEqual(['source-serif-4-latin-900-normal.woff2', 'source-serif-4-latin-ext-900-normal.woff2']);
    expect(await loader.familyCutFaces(SERIF, [upright(400)])).toHaveLength(3);
  });
});

describe('the file a character is drawn from (#757)', () => {
  it('is the last one declared that holds it: the script\'s own slice for the letters it repeats, as in a pen', async () => {
    const cut = await loader.familyCutFaces('Noto Serif JP', [upright(400)]);
    const picked = (text: string) => names(loader.facesForCodePoints(cut, cps(text)));
    // The ASCII letters are in `latin` and in slice 118: the slice, declared after it, answers.
    expect(picked('NFKC')).toEqual(['noto-serif-jp-118-400-normal.woff2']);
    expect(picked('あ、')).toEqual(['noto-serif-jp-119-400-normal.woff2', 'noto-serif-jp-118-400-normal.woff2']);
    // Digits are in `latin` alone, and ā in `latin-ext`.
    expect(picked('3 ā')).toEqual(['noto-serif-jp-latin-400-normal.woff2', 'noto-serif-jp-latin-ext-400-normal.woff2', 'noto-serif-jp-119-400-normal.woff2']);
    // Before its text is known, the file with the Latin letters.
    expect(picked('')).toEqual(['noto-serif-jp-118-400-normal.woff2']);
  });

  it('is the arabic file for the joiners and hyphens it holds beside latin', async () => {
    const cut = await loader.familyCutFaces('Amiri', [upright(400)]);
    expect(names(cut)).toEqual(['amiri-latin-400-normal.woff2', 'amiri-latin-ext-400-normal.woff2', 'amiri-arabic-400-normal.woff2']);
    expect(names(loader.facesForCodePoints(cut, cps('‌‐')))).toEqual(['amiri-arabic-400-normal.woff2']);
    expect(names(loader.facesForCodePoints(cut, cps('Shahrazād')))).toEqual(['amiri-latin-400-normal.woff2', 'amiri-latin-ext-400-normal.woff2']);
  });

  it('is never a file a pen does not load where one it loads holds the character: the digits an emoji slice repeats come from latin', async () => {
    const cut = await loader.familyCutFaces('Playpen Sans Arabic', [upright(400)]);
    // The numbered slices of a family that is not Chinese, Japanese or
    // Korean are its emoji: before the files of the text, in the sheet's order.
    expect(names(cut)).toEqual([
      'playpen-sans-arabic-1-400-normal.woff2', 'playpen-sans-arabic-2-400-normal.woff2', 'playpen-sans-arabic-math-400-normal.woff2',
      'playpen-sans-arabic-latin-400-normal.woff2', 'playpen-sans-arabic-latin-ext-400-normal.woff2', 'playpen-sans-arabic-arabic-400-normal.woff2',
    ]);
    expect(names(loader.facesForCodePoints(cut, cps('2026 ب‍')))).toEqual(['playpen-sans-arabic-latin-400-normal.woff2', 'playpen-sans-arabic-arabic-400-normal.woff2']);
    // A character no other file holds is still theirs.
    expect(names(loader.facesForCodePoints(cut, cps('\u{1f308}')))).toEqual(['playpen-sans-arabic-1-400-normal.woff2']);
  });
});

describe('a family or a weight Fontsource has no file for (#757)', () => {
  it('keeps Google\'s style sheet for a family Fontsource has no record of', async () => {
    routes[fontsource('brand-new-serif')] = 404;
    routes[google('Brand New Serif')] = `@font-face { font-family: 'Brand New Serif'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/bns/latin.woff2) format('woff2'); unicode-range: ${LATIN}; }`;
    await loader.loadFont('Brand New Serif', [upright(400), upright(700)]);
    // The regular and bold pair, as before: once, whatever faces are asked.
    expect(links).toEqual(['https://fonts.googleapis.com/css2?family=Brand%20New%20Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap']);
    expect(fonts.faces).toEqual([]);
    expect(names(await loader.familyCutFaces('Brand New Serif', [upright(700)], { standard: true }))).toEqual(['latin.woff2']);
    expect(await loader.staticFaceFiles('Brand New Serif', 400, 'normal')).toBeNull();
  });

  it('keeps Google\'s variable style sheet for a family whose package cannot be read', async () => {
    routes[fontsourceCssUrl(SERIF, 400, 'normal')] = 404;
    routes[google(SERIF)] = SERIF_GOOGLE;
    await loader.loadFont(SERIF, [upright(400), italic(700)]);
    expect(links).toEqual(['https://fonts.googleapis.com/css2?family=Source%20Serif%204:ital,wght@0,200..900;1,200..900&display=swap']);
    expect(fonts.faces).toEqual([]);
    // The worker gets every face of the sheet, as before.
    const faces = await loader.familyCutFaces(SERIF, [upright(400)], { standard: true });
    expect(faces.map((f) => `${f.weight} ${f.style}`)).toEqual(['200 900 normal', '200 900 normal', '200 900 normal', '200 900 italic', '200 900 italic', '200 900 italic']);
    expect(await loader.staticFaceFiles(SERIF, 400, 'normal')).toBeNull();
  });

  it('sets a weight between two cuts of a variable family from Google\'s variable file at that weight, and embeds the nearest cut', async () => {
    routes[`${google(SERIF)}:wght@450`] = serifInstance(450);
    await loader.loadFont(SERIF, [upright(450)]);
    // The variable file, declared at 450 alone: interpolated, as every weight was.
    expect(fonts.faces.map((f) => `${f.weight} ${f.style} ${f.url}`)).toEqual([
      '450 normal https://fonts.gstatic.com/s/sourceserif4/v1/normal-latin-ext.woff2',
      '450 normal https://fonts.gstatic.com/s/sourceserif4/v1/normal-latin.woff2',
    ]);
    expect(links).toEqual([]);
    expect((await loader.familyCutFaces(SERIF, [upright(450)])).map((f) => f.weight)).toEqual(['450', '450']);
    // No static file holds it: the PDF embeds the cut nearest to it, the lighter of two as near.
    expect(names((await loader.staticFaceFiles(SERIF, 450, 'normal'))!)).toEqual(['source-serif-4-cyrillic-400-normal.woff2', 'source-serif-4-latin-400-normal.woff2', 'source-serif-4-latin-ext-400-normal.woff2']);
    expect(names((await loader.staticFaceFiles(SERIF, 460, 'normal'))!)[1]).toBe('source-serif-4-latin-500-normal.woff2');
  });

  it('sets that weight in the cut CSS matching settles on when Google cannot give the variable file', async () => {
    routes[`${google(SERIF)}:wght@450`] = new TypeError('Failed to fetch');
    await loader.loadFont(SERIF, [upright(450)]);
    expect(new Set(fonts.declared(SERIF).map((f) => f.slice(0, 10)))).toEqual(new Set(['500 normal']));
  });

  it('sets a weight a static family lacks in the cut CSS matching settles on, on the page, in the worker and in the PDF', async () => {
    for (const weight of [550, 600]) {
      // Above 500 the heavier cuts first: the 700 for a 600, and for a 550
      // where the 400 is as near.
      expect(new Set((await loader.familyCutFaces('Amiri', [upright(weight)])).map((f) => f.weight))).toEqual(new Set(['700']));
      expect(names((await loader.staticFaceFiles('Amiri', weight, 'normal'))!)[0]).toBe('amiri-latin-700-normal.woff2');
    }
    await loader.loadFont('Amiri', [upright(600)]);
    expect(new Set(fonts.declared('Amiri').map((f) => f.slice(0, 10)))).toEqual(new Set(['700 normal']));
    expect(requests.some((u) => u.includes('fonts.googleapis.com'))).toBe(false);
    // Under 400 the lighter first, and there is none: the 400.
    expect(names((await loader.staticFaceFiles('Amiri', 300, 'italic'))!)[0]).toBe('amiri-latin-400-italic.woff2');
  });

  it('sets the italic of a family with no italic from its upright cut', async () => {
    expect(names(await loader.familyCutFaces('Host Grotesk', [italic(600)]))).toEqual(['host-grotesk-latin-600-normal.woff2', 'host-grotesk-latin-ext-600-normal.woff2']);
    expect(names((await loader.staticFaceFiles('Host Grotesk', 600, 'italic'))!)[0]).toBe('host-grotesk-latin-600-normal.woff2');
    // Its stand-in (#688) declares that cut as the italic.
    const standIns = loader.standInFaces(await loader.fetchFamilyFaces('Host Grotesk'), [600]);
    expect(standIns.map((f) => `${f.weight} ${f.style}`)).toEqual(['600 italic', '600 italic']);
  });

  it('leaves out a file that cannot be had, and asks for it again later', async () => {
    const faces = await loader.familyCutFaces(SERIF, [upright(400)]);
    noFile.add(faces[1]!.url);
    expect((await loader.fetchFacePayloads(faces)).map((p) => fileOf(p.buffer))).toEqual([faces[0]!.url, faces[2]!.url]);
    // Not at every build while it fails.
    await loader.fetchFacePayloads(faces);
    expect(requests.filter((u) => u === faces[1]!.url)).toHaveLength(1);
  });
});

describe('the hold of the previews on static cuts (#757, #659)', () => {
  const CONFIG: PostextConfig = {
    bodyText: { fontFamily: SERIF },
    headings: { fontFamily: 'Host Grotesk', fontWeight: 600 },
    // The running heads and folios in the heading face: no family of the built-in designs.
    header: { elements: [] },
    footer: { elements: [] },
  };
  const TEXT = '# Night ferry\n\nThe *Chilco* sails **after** the ***last*** bus.';

  it('settles in one wait: every face it checks is loaded, the italics a family lacks answered by its upright', async () => {
    // The faces are declared while no file arrives (a slow network).
    fonts.offline = true;
    await loader.preloadConfigFonts(CONFIG, TEXT);
    expect(fonts.faces.length).toBeGreaterThan(0);
    const gate = loader.createFontGate();
    expect(gate.pending(CONFIG, TEXT)).toEqual(expect.arrayContaining([`400 16px "${SERIF}"`, `italic 700 16px "${SERIF}"`, '700 16px "Host Grotesk"']));
    fonts.offline = false;
    await gate.wait(CONFIG, TEXT);
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
    expect(loader.missingConfigFontSpecs(CONFIG, TEXT)).toEqual([]);
    expect(fonts.loaded(SERIF)).toEqual(expect.arrayContaining([
      'source-serif-4-latin-400-normal.woff2', 'source-serif-4-latin-400-italic.woff2', 'source-serif-4-latin-700-normal.woff2', 'source-serif-4-latin-700-italic.woff2',
    ]));
    // No style sheet was added: no face is made anew by a later one (#659).
    expect(links).toEqual([]);
  });

  it('has nothing to wait for once the faces of the book are declared and loaded', async () => {
    await loader.preloadConfigFonts(CONFIG, TEXT);
    const gate = loader.createFontGate();
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
  });

  it('gives up on a file that never arrives, after one wait, and builds', async () => {
    fonts.broken.add(file('source-serif-4', 'latin', 700, 'italic'));
    await loader.preloadConfigFonts(CONFIG, TEXT);
    const gate = loader.createFontGate();
    expect(gate.pending(CONFIG, TEXT)).toEqual([`italic 700 16px "${SERIF}"`]);
    await gate.wait(CONFIG, TEXT);
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
    // The face is still missing: another preview waits for it once too.
    expect(loader.missingConfigFontSpecs(CONFIG, TEXT)).toEqual([`italic 700 16px "${SERIF}"`]);
  });

  it('holds the build of an Arabic book for the arabic file of each cut, and loads it', async () => {
    const arabic: PostextConfig = { locale: 'ar', bodyText: { fontFamily: 'Amiri' }, headings: { fontFamily: 'Amiri' }, header: { elements: [] }, footer: { elements: [] } };
    const text = '# الليلة\n\nقال Shahrazād.';
    // Declared and loaded for a space: the Latin file alone.
    await loader.preloadConfigFonts(arabic, text);
    expect(fonts.loaded('Amiri').some((name) => name.includes('-arabic-'))).toBe(false);
    const gate = loader.createFontGate();
    expect(gate.pending(arabic, text)).toContain('400 16px "Amiri"');
    await gate.wait(arabic, text);
    expect(gate.pending(arabic, text)).toEqual([]);
    expect(fonts.loaded('Amiri')).toEqual(expect.arrayContaining(['amiri-arabic-400-normal.woff2', 'amiri-arabic-700-normal.woff2', 'amiri-latin-ext-400-normal.woff2']));
  });
});

describe('the Sandbox\'s PDF and its previews (#757)', () => {
  const provider = async () => (await import('../../viewport/pdf/pdfFontProvider.js')).createPdfFontProvider({ raw: true });

  it('embeds the files the previews declare for a face, the ones that hold its characters', async () => {
    const ask = await provider();
    const files = await ask(SERIF, 600, 'italic', { codePoints: cps('Dvořák') });
    // The browser looks a character up from the last file declared: so does the PDF.
    expect([files].flat().map(fileOf)).toEqual([file('source-serif-4', 'latin-ext', 600, 'italic'), file('source-serif-4', 'latin', 600, 'italic')]);
    await loader.loadFont(SERIF, [italic(600)]);
    const declared = fonts.faces.map((f) => f.url);
    for (const f of [files].flat()) expect(declared).toContain(fileOf(f));
    // The record and the package's style sheet, once: no style sheet per weight.
    expect(requests.filter((u) => u.endsWith('.css'))).toEqual([fontsourceCssUrl(SERIF, 400, 'normal')]);
  });

  it('embeds the slice a Japanese family repeats the ASCII letters in, as the page draws them', async () => {
    const ask = await provider();
    const files = await ask('Noto Serif JP', 400, 'normal', { codePoints: cps('NFKC、') });
    expect([files].flat().map(fileOf)).toEqual([file('noto-serif-jp', '118', 400), file('noto-serif-jp', '119', 400)]);
  });

  it('embeds the upright of a family with no italic, and the cut the page sets a missing weight in', async () => {
    const ask = await provider();
    expect([await ask('Host Grotesk', 600, 'italic', { codePoints: cps('Ab') })].flat().map(fileOf)).toEqual([file('host-grotesk', 'latin', 600)]);
    expect([await ask('Amiri', 600, 'normal', { codePoints: cps('Ab') })].flat().map(fileOf)).toEqual([file('amiri', 'latin', 700)]);
  });
});

describe('the Cookbook kit and the Sandbox (#757)', () => {
  const BLOCKS: Record<string, string> = { fonts: KIT_FONTS, cjk: KIT_CJK, arabic: KIT_ARABIC, comics: KIT_COMICS, pdf: KIT_PDF, images: KIT_IMAGES };

  it('take a family\'s files from the same package, the same range and the same URLs', () => {
    // The kit names a package's folder in one place (fontsourceAt), at the
    // range the Sandbox starts from, and every block goes through it (#766).
    const folder = /function fontsourceAt\(id, u = `(https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource\/\$\{id\}@)`\)/.exec(KIT_FONTS)![1]!;
    expect(KIT_FONTS).toContain(`fetch(u + '${FONTSOURCE_PACKAGE_VERSION}/package.json')`);
    for (const [name, source] of Object.entries(BLOCKS)) {
      expect(source.match(/@fontsource\//g)?.length ?? 0, name).toBe(name === 'fonts' ? 1 : 0);
      expect(source, name).toContain('fontsourceAt(id)');
    }
    // The kit's own template of a file's URL, filled in at the range.
    const template = /\$\{at\}(files\/\$\{id\}-\$\{subset\}-\$\{weight\}-\$\{style\}\.woff2)`/.exec(KIT_FONTS)![1]!;
    const fill = (text: string) => text.replace(/\$\{id\}/g, 'source-serif-4').replace('${subset}', 'latin-ext').replace('${weight}', '600').replace('${style}', 'italic');
    expect(fontsourceFileUrl(SERIF, 'latin-ext', 600, 'italic')).toBe(fill(`${folder}${FONTSOURCE_PACKAGE_VERSION}/${template}`));
    // At the version the package resolves to, the same address on both sides.
    expect(fontsourceUrlAt(fontsourceFileUrl(SERIF, 'latin-ext', 600, 'italic'), '5.3.1')).toBe(fill(`${folder}5.3.1/${template}`));
    // And the style sheet the kit reads a Chinese or Japanese family's slices from.
    expect(KIT_CJK).toContain("${weight}${style === 'italic' ? '-italic' : ''}.css");
    expect(fontsourceCssUrl('Noto Serif JP', 700, 'italic')).toBe('https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-jp@5/700-italic.css');
  });

  it('declare a cut\'s files in the same order: latin, latin-ext, greek, then the script\'s own', async () => {
    // fonts.js: latin first, then what the text needs of latin-ext and greek.
    expect(KIT_FONTS).toContain("['latin', ...kitSubsetsFor(text, meta)]");
    expect(KIT_FONTS.indexOf("'latin-ext']")).toBeLessThan(KIT_FONTS.indexOf("'greek']"));
    // cjk.js: the slices as the style sheet lists them, reversed, added in that order.
    expect(KIT_CJK).toContain('}).reverse()));');
    routes[fontsource('lora')] = { family: 'Lora', type: 'google', variable: true, weights: [400], styles: ['normal'], subsets: ['cyrillic', 'greek', 'latin', 'latin-ext', 'vietnamese'] };
    routes[fontsourceCssUrl('Lora', 400, 'normal')] = packageCss('lora', 'Lora', [['cyrillic', CYRILLIC], ['greek', 'U+0370-03FF'], ['vietnamese', 'U+0102-0103,U+1EA0-1EF9'], ['latin-ext', LATIN_EXT], ['latin', LATIN]]);
    expect(names(await loader.familyCutFaces('Lora', [upright(400)])).map((n) => n.replace(/^lora-(.+)-400-normal\.woff2$/, '$1'))).toEqual(['cyrillic', 'vietnamese', 'latin', 'latin-ext', 'greek']);
  });
});

describe('a request the network does not answer (#757)', () => {
  it('gives a file up after its bound: the rest of the cut is had, and the file is asked for again a while later', async () => {
    const faces = await loader.familyCutFaces(SERIF, [upright(400)]);
    expect(faces.length).toBeGreaterThan(1);
    const slow = faces[0]!.url;
    stalled.add(slow);
    vi.useFakeTimers();
    let settled = false;
    const got = loader.fetchFacePayloads(faces);
    void got.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(loader.FONT_STALL_MS - 1);
    // Still out: nothing bounds `fetch` but the loader.
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect((await got).map((p) => fileOf(p.buffer))).toEqual(faces.slice(1).map((f) => f.url));
    expect(loader.unansweredFontRequests()).toEqual([slow]);
    // The network answers again. Not asked at once (a file that fails is
    // not asked for by every build), then had.
    stalled.clear();
    expect(await loader.fetchFacePayloads(faces)).toHaveLength(faces.length - 1);
    await vi.advanceTimersByTimeAsync(loader.FONT_RETRY_MS);
    expect((await loader.fetchFacePayloads(faces)).map((p) => fileOf(p.buffer))).toEqual(faces.map((f) => f.url));
    expect(loader.unansweredFontRequests()).toEqual([]);
  });

  it('gives no request up while files keep arriving: a file waiting its turn behind the others is alive as long as they come in', async () => {
    const faces = await loader.familyCutFaces(SERIF, [upright(400), upright(700), italic(400)]);
    expect(faces.length).toBeGreaterThan(3);
    // A slow line: a file every ten seconds, the last one two minutes in.
    faces.forEach((face, i) => slow.set(face.url, (i + 1) * 10_000));
    const last = faces.length * 10_000;
    slow.set(faces[faces.length - 1]!.url, 120_000);
    vi.useFakeTimers();
    let payloads: { buffer: ArrayBuffer }[] | null = null;
    void loader.fetchFacePayloads(faces).then((p) => { payloads = p; });
    await vi.advanceTimersByTimeAsync(last);
    expect(payloads).toBeNull();
    expect(loader.unansweredFontRequests()).toEqual([]);
    // Nothing for fifteen seconds now: the one still out is given up.
    await vi.advanceTimersByTimeAsync(loader.FONT_STALL_MS - 10_000 - 1);
    expect(payloads).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(payloads).not.toBeNull();
    expect(payloads!).toHaveLength(faces.length - 1);
    expect(loader.unansweredFontRequests()).toEqual([faces[faces.length - 1]!.url]);
    expect(loader.fontRequestsUnanswered(SERIF, faces.map((f) => f.url))).toBe(true);
    expect(loader.fontRequestsUnanswered(SERIF, faces.slice(0, -1).map((f) => f.url))).toBe(false);
  });

  it('does not count a file the server has not (a 404 is an answer), and does not ask for it again', async () => {
    const faces = await loader.familyCutFaces(SERIF, [upright(400)]);
    noFile.add(faces[0]!.url);
    vi.useFakeTimers();
    expect(await loader.fetchFacePayloads(faces)).toHaveLength(faces.length - 1);
    expect(loader.unansweredFontRequests()).toEqual([]);
    // A later build, long after: the file is still not there to ask for.
    await vi.advanceTimersByTimeAsync(loader.FONT_RETRY_MS * 3);
    expect(await loader.fetchFacePayloads(faces)).toHaveLength(faces.length - 1);
    expect(requests.filter((url) => url === faces[0]!.url)).toHaveLength(1);
  });

  it('gives a family\'s record up after its bound, and the family is set from Google\'s style sheet', async () => {
    stalled.add(fontsource('source-serif-4'));
    routes[google(SERIF)] = SERIF_GOOGLE;
    vi.useFakeTimers();
    let faces: { url: string }[] | null = null;
    void loader.fetchFamilyFaces(SERIF).then((f) => { faces = f; });
    await vi.advanceTimersByTimeAsync(loader.FONT_STALL_MS - 1);
    expect(faces).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(faces).not.toBeNull();
    expect(faces!.length).toBeGreaterThan(0);
    expect(faces!.every((f) => f.url.startsWith('https://fonts.gstatic.com/'))).toBe(true);
    expect(loader.unansweredFontRequests()).toEqual([fontsource('source-serif-4')]);
    // The family may have files a later request brings; another family has not.
    expect(loader.fontRequestsUnanswered(SERIF, [])).toBe(true);
    expect(loader.fontRequestsUnanswered('Amiri', [])).toBe(false);
  });
});

describe('a family from one version of its package (#766)', () => {
  const versionsAsked = (id: string) => [...new Set(requests.filter((url) => url.includes(`/@fontsource/${id}@`) && url.endsWith('.woff2')).map((url) => /@([^/]+)\/files\//.exec(url)![1]!))];

  it('takes every file from the version the family\'s style sheet was answered from, on the page, for the worker and in the PDF', async () => {
    // jsDelivr resolves the range for each URL on that URL's clock: asked by
    // the range, the files of a family cut again would come from two cuts.
    answeredFrom.set('source-serif-4', '5.3.1');
    await loader.loadFont(SERIF, [upright(400), italic(700)]);
    expect(loader.fontsourcePackageVersion(SERIF)).toBe('5.3.1');
    const faces = await loader.familyCutFaces(SERIF, [upright(400), italic(700)], { standard: true });
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((f) => f.url.startsWith('https://cdn.jsdelivr.net/npm/@fontsource/source-serif-4@5.3.1/files/'))).toBe(true);
    // The page declares those very files.
    expect(fonts.faces.every((f) => f.source.includes('@5.3.1/files/'))).toBe(true);
    await loader.fetchFacePayloads(faces);
    const provide = (await import('../../viewport/pdf/pdfFontProvider.js')).createPdfFontProvider({ raw: true });
    await provide(SERIF, 400, 'normal', { codePoints: cps('abc') });
    await provide(SERIF, 500, 'normal', { codePoints: cps('abc') });
    expect(versionsAsked('source-serif-4')).toEqual(['5.3.1']);
    // One style sheet read by the range, to learn the version: nothing else.
    expect(requests.filter((url) => url.includes('@fontsource/source-serif-4@5/'))).toEqual([fontsourceCssUrl(SERIF, 400, 'normal')]);
  });

  it('keeps the range when jsDelivr does not say the version, as before', async () => {
    const faces = await loader.familyCutFaces(SERIF, [upright(400)]);
    expect(loader.fontsourcePackageVersion(SERIF)).toBeNull();
    expect(faces.every((f) => f.url.includes(`@${FONTSOURCE_PACKAGE_VERSION}/files/`))).toBe(true);
    expect(fontsourceVersionOf({ headers: { get: () => 'latest' } })).toBeNull();
    expect(fontsourceVersionOf({ headers: { get: () => '5.3.1' } })).toBe('5.3.1');
    expect(fontsourceVersionOf({})).toBeNull();
    expect(fontsourceUrlAt('https://fonts.gstatic.com/s/x/latin.woff2', '5.3.1')).toBe('https://fonts.gstatic.com/s/x/latin.woff2');
  });

  it('the kit takes every file from the version the package says it is, the PDF with them, and keeps the range when it cannot ask', async () => {
    const asked: string[] = [];
    let reachable = true;
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input);
      asked.push(url);
      if (url.endsWith('/package.json')) {
        if (!reachable) throw new TypeError('Failed to fetch');
        // The range, resolved for this URL: another URL of the family could be answered from 5.2.9.
        return { ok: true, json: async () => ({ version: '5.3.1' }) };
      }
      if (url.includes('api.fontsource.org')) return { ok: true, json: async () => ({ weights: [400, 700], styles: ['normal', 'italic'], subsets: ['latin', 'latin-ext'] }) };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    });
    const load = () => new Function('kitStatus', 'decompressWoff2', `${KIT_FONTS}\n${KIT_PDF}\nreturn { fontsourceResolver, fontsourceProvider };`)(() => {}, async (bytes: Uint8Array) => bytes) as {
      fontsourceResolver(family: string, weight: number, style: string, options?: { text?: string }): Promise<{ source: string }[] | null>;
      fontsourceProvider(family: string, weight: number, style: string, request?: { codePoints?: number[] }): Promise<unknown>;
    };
    const kit = load();
    const faces = (await kit.fontsourceResolver('Noto Sans TC', 400, 'normal', { text: 'a\u0101' }))!;
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((f) => f.source.startsWith('https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.3.1/files/noto-sans-tc-'))).toBe(true);
    await kit.fontsourceProvider('Noto Sans TC', 700, 'normal', { codePoints: [0x61, 0x101] });
    const files = asked.filter((url) => url.endsWith('.woff2'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((url) => url.includes('/@fontsource/noto-sans-tc@5.3.1/files/'))).toBe(true);
    // Asked once per family, of the range the Sandbox starts from.
    expect(asked.filter((url) => url.endsWith('/package.json'))).toEqual([`https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@${FONTSOURCE_PACKAGE_VERSION}/package.json`]);
    // The package cannot be asked: the range, as before.
    reachable = false;
    const again = (await load().fontsourceResolver('Noto Sans TC', 400, 'normal'))!;
    expect(again.every((f) => f.source.startsWith(`https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@${FONTSOURCE_PACKAGE_VERSION}/files/`))).toBe(true);
  });
});
