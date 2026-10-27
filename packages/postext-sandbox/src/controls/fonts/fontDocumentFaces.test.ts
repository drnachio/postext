import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FontFaceLike, PostextConfig } from 'postext';
import { fontsourceCssUrl } from '../../viewport/pdf/fontsourceSlices.js';
import { createPostextGuideConfig } from '../../context/guideConfig.js';

// #770: the contents page of the Arabic guide sets the summary of each
// chapter in Amiri italic (the default slant of `toc.subtitle`), and
// nothing in an Arabic book asks Amiri for an italic: the page declared
// that cut once the first layout had named it and loaded its Latin file,
// the one that holds a space. The Arabic file came with the first paint,
// which set the 66 words of the summaries in the system's Arabic face
// meanwhile (Chrome 154, macOS, 39.58 px: «الفجوة» 85.82 px wide in a box of
// 82.88, «والصفحة» 121.44 in 111.02). The italic is now one of the faces the
// configuration asks for, and a face the pages alone name is loaded for the
// characters the document sets.

vi.mock('../../storage/fontStorage.js', () => ({ getFontFile: async () => null }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

type Loader = typeof import('./fontLoader.js');

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F';
const LATIN_EXT = 'U+0100-02BA,U+1E00-1E9F';
const ARABIC = 'U+0600-06FF,U+200C-200E,U+2010-2011';

/** A package's style sheet of the regular weight, as jsDelivr serves it. */
function packageCss(id: string, family: string, subsets: [string, string][]): string {
  return subsets.map(([name, range]) => `/* ${id}-${name}-400-normal */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/${id}-${name}-400-normal.woff2) format('woff2'), url(./files/${id}-${name}-400-normal.woff) format('woff');
  unicode-range: ${range};
}`).join('\n');
}

const record = (family: string, weights: number[], styles: string[]) => ({ family, type: 'google', variable: false, weights, styles });
/** A Japanese family: twenty numbered slices, then the Latin subsets. */
const SLICES: [string, string][] = [
  ...Array.from({ length: 20 }, (_, i): [string, string] => [String(i), `U+${(0x4e00 + i * 16).toString(16)}-${(0x4e0f + i * 16).toString(16)}`]),
  ['latin-ext', LATIN_EXT],
  ['latin', LATIN],
];

const FAMILIES: Record<string, { id: string; record: object; css: string }> = {
  Amiri: { id: 'amiri', record: record('Amiri', [400, 700], ['italic', 'normal']), css: packageCss('amiri', 'Amiri', [['arabic', ARABIC], ['latin-ext', LATIN_EXT], ['latin', LATIN]]) },
  'Noto Kufi Arabic': { id: 'noto-kufi-arabic', record: record('Noto Kufi Arabic', [400, 600, 700, 800], ['normal']), css: packageCss('noto-kufi-arabic', 'Noto Kufi Arabic', [['arabic', ARABIC], ['latin', LATIN]]) },
  'IBM Plex Sans Arabic': { id: 'ibm-plex-sans-arabic', record: record('IBM Plex Sans Arabic', [400, 600, 700], ['normal']), css: packageCss('ibm-plex-sans-arabic', 'IBM Plex Sans Arabic', [['arabic', ARABIC], ['latin', LATIN]]) },
  Fraunces: { id: 'fraunces', record: record('Fraunces', [400, 600, 700, 800], ['italic', 'normal']), css: packageCss('fraunces', 'Fraunces', [['latin-ext', LATIN_EXT], ['latin', LATIN]]) },
  'Noto Serif JP': { id: 'noto-serif-jp', record: record('Noto Serif JP', [400, 700], ['normal']), css: packageCss('noto-serif-jp', 'Noto Serif JP', SLICES) },
};

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
  readonly file: string;
  constructor(readonly family: string, source: string, d: { weight?: string; style?: string; unicodeRange?: string } = {}) {
    this.weight = d.weight ?? '400';
    this.style = d.style ?? 'normal';
    this.unicodeRange = d.unicodeRange;
    const url = /url\("([^"]+)"\)/.exec(source)?.[1] ?? source;
    this.file = url.slice(url.lastIndexOf('/') + 1);
  }
}

/** `document.fonts` with the matching of CSS: the slant asked when the
 *  family has it, then the nearest weight, and of that cut the files whose
 *  range holds the text. */
class CutFontSet {
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
  addEventListener(): void {}
  removeEventListener(): void {}
  private cut(font: string, text: string): FakeFace[] {
    const m = /^(italic )?(\d+) [\d.]+px "?([^"]+)"?$/.exec(font);
    if (!m) return [];
    const family = this.faces.filter((f) => f.family === m[3]);
    const slant = family.filter((f) => (f.style === 'italic') === !!m[1]);
    const pool = slant.length > 0 ? slant : family;
    const target = Number(m[2]);
    const best = Math.min(...pool.map((f) => Math.abs(Number(f.weight) - target)));
    const one = pool.find((f) => Math.abs(Number(f.weight) - target) === best);
    return pool.filter((f) => f.weight === one!.weight && f.style === one!.style && holds(f.unicodeRange, text));
  }
  check(font: string, text = ' '): boolean {
    return this.cut(font, text).every((f) => f.status === 'loaded');
  }
  async load(font: string, text = ' '): Promise<FontFaceLike[]> {
    const cut = this.cut(font, text);
    for (const f of cut) f.status = 'loaded';
    return cut;
  }
  declared(family: string, style: string): string[] {
    return this.faces.filter((f) => f.family === family && f.style === style).map((f) => f.file);
  }
  loaded(family: string): string[] {
    return this.faces.filter((f) => f.family === family && f.status === 'loaded').map((f) => f.file);
  }
}

const globals = globalThis as { document?: unknown; FontFace?: unknown };
let previous: { document?: unknown; FontFace?: unknown };
let fonts: CutFontSet;
let loader: Loader;

beforeEach(async () => {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    for (const [family, { id, record: body, css }] of Object.entries(FAMILIES)) {
      if (url === `https://api.fontsource.org/v1/fonts/${id}`) return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => '' };
      if (url === fontsourceCssUrl(family, 400, 'normal')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => css };
    }
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}), text: async () => '' };
  });
  previous = { document: globals.document, FontFace: globals.FontFace };
  fonts = new CutFontSet();
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

const key = (uses: Map<string, { weight: number; style: string }[]>, family: string) => (uses.get(family) ?? []).map((u) => `${u.weight}${u.style === 'italic' ? 'i' : ''}`);

describe('the summaries of a contents page (#770)', () => {
  const SUMMARY = 'الفجوة بين الويب والصفحة المطبوعة، وما يسدّها';

  it('are set in a face the configuration asks for: the Arabic guide asks Amiri for its italic', () => {
    const uses = loader.configFontUses(createPostextGuideConfig('ar'));
    // Nothing else of the edition is set in an italic of the text face.
    expect(key(uses, 'Amiri')).toEqual(['400', '400i', '700']);
    // The Latin editions say it in so many words (`italic: true`).
    expect(key(loader.configFontUses(createPostextGuideConfig('en')), 'Lora')).toContain('400i');
  });

  it('have their italic declared and its Arabic file loaded before the first build of an Arabic book', async () => {
    const config: PostextConfig = {
      locale: 'ar',
      bodyText: { fontFamily: 'Amiri' },
      headings: { fontFamily: 'Noto Kufi Arabic' },
      header: { elements: [] },
      footer: { elements: [] },
      toc: { levels: [{ level: 1, fontFamily: 'Noto Kufi Arabic', fontWeight: 600 }], subtitle: { enabled: true, attr: 'summary', fontFamily: 'Amiri' } },
    };
    // The chapter is its `:::toc` alone: the summaries are the other chapters'.
    const text = '# المحتويات\n\n:::toc\n';
    await loader.preloadConfigFonts(config, text);
    // In the order a pen declares them: the Latin files, then the Arabic one.
    expect(fonts.declared('Amiri', 'italic')).toEqual(['amiri-latin-400-italic.woff2', 'amiri-latin-ext-400-italic.woff2', 'amiri-arabic-400-italic.woff2']);
    const gate = loader.createFontGate();
    expect(gate.pending(config, text)).toContain('italic 400 16px "Amiri"');
    await gate.wait(config, text);
    expect(gate.pending(config, text)).toEqual([]);
    expect(fonts.loaded('Amiri')).toContain('amiri-arabic-400-italic.woff2');
    expect(fonts.check('italic 400 39.5833px Amiri', SUMMARY)).toBe(true);
  });

  it('are left upright where the configuration says so: no italic is declared', async () => {
    const config: PostextConfig = {
      locale: 'ar',
      bodyText: { fontFamily: 'Amiri' },
      header: { elements: [] },
      footer: { elements: [] },
      toc: { subtitle: { enabled: true, attr: 'summary', fontFamily: 'Amiri', italic: false } },
    };
    expect(key(loader.configFontUses(config), 'Amiri')).toEqual(['400', '700']);
    await loader.preloadConfigFonts(config, ':::toc\n');
    expect(fonts.declared('Amiri', 'italic')).toEqual([]);
  });
});

describe('a face the pages of a document name (#770)', () => {
  const italic = [{ weight: 400, style: 'italic' as const }];

  it('is declared like any other, with its Latin file alone loaded', async () => {
    await loader.loadFont('Amiri', italic);
    expect(fonts.declared('Amiri', 'italic')).toHaveLength(3);
    expect(fonts.loaded('Amiri')).toEqual(['amiri-latin-400-italic.woff2']);
    expect(fonts.check('italic 400 16px "Amiri"', 'الفجوة')).toBe(false);
  });

  it('is loaded for the characters the document sets: the file of each script in it', async () => {
    await loader.loadFacesForText([['Amiri', italic]], 'الفجوة Postext');
    expect(fonts.declared('Amiri', 'italic')).toHaveLength(3);
    expect(fonts.loaded('Amiri').sort()).toEqual(['amiri-arabic-400-italic.woff2', 'amiri-latin-400-italic.woff2']);
    expect(fonts.check('italic 400 16px "Amiri"', 'الفجوة')).toBe(true);
    // A text with a letter of Latin Extended brings that file too.
    await loader.loadFacesForText([['Amiri', italic]], 'Dvořák');
    expect(fonts.loaded('Amiri')).toContain('amiri-latin-ext-400-italic.woff2');
  });

  it('is loaded in the cut that answers for it: a weight the family lacks, an italic it has none of', async () => {
    await loader.loadFacesForText([['Noto Kufi Arabic', [{ weight: 500, style: 'italic' }]]], 'الجزء');
    // No italic and no 500: the upright 400, the cut CSS matching settles on.
    expect(fonts.loaded('Noto Kufi Arabic').sort()).toEqual(['noto-kufi-arabic-arabic-400-normal.woff2', 'noto-kufi-arabic-latin-400-normal.woff2']);
  });

  it('is left to the page in a family cut by slices: the slices come as the text is painted', async () => {
    await loader.loadFacesForText([['Noto Serif JP', [{ weight: 700, style: 'normal' }]]], '一丐丠 abc');
    expect(fonts.declared('Noto Serif JP', 'normal')).toHaveLength(22);
    expect(fonts.loaded('Noto Serif JP')).toEqual(['noto-serif-jp-latin-700-normal.woff2']);
  });

  it('asks nothing of a generic family, and resolves where there is no page', async () => {
    await loader.loadFacesForText([['serif', italic]], 'abc');
    expect(fonts.faces).toEqual([]);
    globals.document = undefined;
    await expect(loader.loadFacesForText([['Amiri', italic]], 'abc')).resolves.toBeUndefined();
  });
});
