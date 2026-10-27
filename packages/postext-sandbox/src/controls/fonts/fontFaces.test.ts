import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fontFallbacks, type FontFaceLike, type PostextConfig } from 'postext';

// Where the Sandbox takes a family's faces from and which it declares
// beside them, against the answers Fontsource and Google Fonts give for
// the families of the recipes the defects were found on: a comic face with
// one weight (Bangers, #688), a family Google Fonts does not serve next to
// one it does (Commit Mono and Host Grotesk, #689).
//
// The network of these tests has no Fontsource package for Bangers or Host
// Grotesk (its style sheet answers 404), so the loader takes them from
// Google's style sheet, as it did for every family before #757; the static
// cuts of a family whose package is there are in fontCuts.test.ts.

type Loader = typeof import('./fontLoader.js');

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153';
const LATIN_EXT = 'U+0100-02BA, U+1E00-1E9F';
const VIETNAMESE = 'U+0102-0103, U+1EA0-1EF9, U+20AB';

/** A Google style sheet: one rule per file, as css2 answers. */
function googleCss(family: string, rules: { weight: string; style?: string; range: string; file: string }[]): string {
  return rules.map((r) => `@font-face {
  font-family: '${family}';
  font-style: ${r.style ?? 'normal'};
  font-weight: ${r.weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${r.file}.woff2) format('woff2');
  unicode-range: ${r.range};
}`).join('\n');
}

const BANGERS_CSS = googleCss('Bangers', [
  { weight: '400', range: VIETNAMESE, file: 'bangers/vietnamese' },
  { weight: '400', range: LATIN_EXT, file: 'bangers/latin-ext' },
  { weight: '400', range: LATIN, file: 'bangers/latin' },
]);
const HOST_CSS = googleCss('Host Grotesk', [
  { weight: '300 800', range: LATIN_EXT, file: 'hostgrotesk/latin-ext' },
  { weight: '300 800', range: LATIN, file: 'hostgrotesk/latin' },
  { weight: '300 800', style: 'italic', range: LATIN, file: 'hostgrotesk/latin-italic' },
]);

const COMMIT_MONO = {
  family: 'Commit Mono', type: 'other', variable: false, weights: [400, 700], styles: ['normal', 'italic'], unicodeRange: {},
  variants: Object.fromEntries(['400', '700'].map((w) => [w, Object.fromEntries(['normal', 'italic'].map((s) => [s, {
    latin: { url: { woff2: `https://cdn.jsdelivr.net/fontsource/fonts/commit-mono@latest/latin-${w}-${s}.woff2`, ttf: 'unused' } },
  }]))])),
};

/** What the network answers, by URL prefix: a string is a body, an Error a
 *  request that rejects (a response with no CORS headers), a number a
 *  status. Font files answer their own URL as bytes. */
let routes: Record<string, string | object | Error | number>;
let requests: string[];
/** The host a request went to ('' for one that is no absolute URL). */
const hostOf = (url: string): string => (URL.canParse(url) ? new URL(url).hostname : '');
/** Files answered later the earlier they are asked for. */
let reverseArrival = false;

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('.woff2')) {
      if (reverseArrival) await new Promise((r) => setTimeout(r, Math.max(0, 30 - requests.length * 5)));
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
    }
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const answer = key === undefined ? 404 : routes[key]!;
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return { ok: false, status: answer, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => answer, text: async () => String(answer) };
  });
}

const fontsource = (id: string) => `https://api.fontsource.org/v1/fonts/${id}`;
const google = (family: string) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
const fileOf = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

class FakeFace implements FontFaceLike {
  status = 'unloaded';
  weight: string;
  style: string;
  unicodeRange?: string;
  constructor(readonly family: string, readonly source: string, d: { weight?: string; style?: string; unicodeRange?: string } = {}) {
    this.weight = d.weight ?? '400';
    this.style = d.style ?? 'normal';
    this.unicodeRange = d.unicodeRange;
  }
}

/** `document.fonts`, as far as the loader uses it. */
class FakeFontSet {
  faces: FakeFace[] = [];
  loads: string[] = [];
  readonly ready = Promise.resolve();
  [Symbol.iterator](): Iterator<FontFaceLike> {
    return this.faces[Symbol.iterator]();
  }
  add(face: FakeFace): this {
    this.faces.push(face);
    return this;
  }
  check(): boolean {
    return true;
  }
  /** Loads the faces of the family, weight and slant asked (no matching
   *  beyond a face whose range holds the weight). */
  async load(font: string): Promise<FontFaceLike[]> {
    this.loads.push(font);
    const m = /^(italic )?(\d+) 16px "(.+)"$/.exec(font);
    if (!m) return [];
    const hit = this.faces.filter((f) => {
      const [lo, hi = lo] = f.weight.split(' ').map(Number) as [number, number?];
      return f.family === m[3] && (f.style === 'italic') === !!m[1] && Number(m[2]) >= lo && Number(m[2]) <= hi;
    });
    for (const f of hit) f.status = 'loaded';
    return hit;
  }
  declared(family: string): string[] {
    return this.faces.filter((f) => f.family === family).map((f) => `${f.weight} ${f.style}`);
  }
}

const globals = globalThis as { document?: unknown; FontFace?: unknown };
let previous: { document?: unknown; FontFace?: unknown };
let fonts: FakeFontSet;
let loader: Loader;

beforeEach(async () => {
  routes = {};
  requests = [];
  reverseArrival = false;
  stubFetch();
  previous = { document: globals.document, FontFace: globals.FontFace };
  fonts = new FakeFontSet();
  // No `createElement`: a style sheet link would throw.
  globals.document = { fonts };
  globals.FontFace = FakeFace;
  vi.resetModules();
  loader = await import('./fontLoader.js');
});

afterEach(() => {
  globals.document = previous.document;
  globals.FontFace = previous.FontFace;
  vi.unstubAllGlobals();
});

const face = (weight: string, style = 'normal', unicodeRange = LATIN) => ({ weight, style, unicodeRange });

describe('standInFaces (#688)', () => {
  it('gives a family with one weight its own file for 600 to 900, slice by slice', async () => {
    const own = [face('400', 'normal', VIETNAMESE), face('400', 'normal', LATIN_EXT), face('400')];
    expect(loader.standInFaces(own)).toEqual([face('600 900', 'normal', VIETNAMESE), face('600 900', 'normal', LATIN_EXT), face('600 900')]);
  });

  it('gives a family with no italic the upright cut of each italic asked', () => {
    expect(loader.standInFaces([face('400')], [400, 700])).toEqual([face('600 900'), face('400', 'italic'), face('600 900', 'italic')]);
    // A variable upright answers both italics with one face.
    expect(loader.standInFaces([face('200 900')], [400, 700])).toEqual([face('200 900', 'italic')]);
    // None asked, none declared.
    expect(loader.standInFaces([face('200 900')])).toEqual([]);
  });

  it('declares nothing for a family with a bold and an italic of its own', () => {
    const own = [face('400'), face('700'), face('400', 'italic'), face('700', 'italic')];
    expect(loader.standInFaces(own, [400, 700])).toEqual([]);
  });

  it('takes the heaviest cut for the bold, in each slant', () => {
    const own = [face('300'), face('400'), face('300', 'italic'), face('400', 'italic')];
    expect(loader.standInFaces(own, [700])).toEqual([face('600 900'), face('600 900', 'italic')]);
  });

  it('leaves a weight another real face answers to the browser: the italic keeps the weight of its cut', () => {
    // An italic 600 of an upright 400 and 700 is the 700 set upright: a
    // neighbour, which the engine still reports (#650).
    const standIns = loader.standInFaces([face('400'), face('700')], [600]);
    expect(standIns).toEqual([face('700', 'italic')]);
  });

  it('answers the engine: no fontFallback for the bold and the italic of a one-weight family, a neighbour still reported', () => {
    const loaded = (f: { weight: string; style: string }): FontFaceLike => ({ family: 'Bangers', weight: f.weight, style: f.style, status: 'loaded' });
    const own = [face('400')];
    const asked = [
      { family: 'Bangers', weight: 700, style: 'normal' as const },
      { family: 'Bangers', weight: 400, style: 'italic' as const },
      { family: 'Bangers', weight: 700, style: 'italic' as const },
    ];
    expect(fontFallbacks(asked, own.map(loaded), { measureWidth: null }).map((f) => f.reason)).toEqual(['synthesized', 'synthesized', 'synthesized']);
    const set = [...own, ...loader.standInFaces(own, [400, 700])].map(loaded);
    expect(fontFallbacks(asked, set, { measureWidth: null })).toEqual([]);
    expect(fontFallbacks([{ family: 'Bangers', weight: 500, style: 'normal' }], set, { measureWidth: null })).toEqual([
      { family: 'Bangers', weight: 500, style: 'normal', reason: 'synthesized' },
    ]);
  });
});

describe('askedItalics (#688)', () => {
  it('asks the italics of the faces comic pages are lettered in', () => {
    const asked = loader.askedItalics({ locale: 'en' }, ':::page\n::panel\nhana{inner}: I can see it.\n:::');
    expect(asked.get('Comic Neue')).toEqual([400, 700]);
    expect(asked.get('Bangers')).toEqual([400, 700]);
  });

  it('asks the italics the configuration sets, and no others', () => {
    const config: PostextConfig = { bodyText: { fontFamily: 'Oswald' }, headings: { fontFamily: 'Bebas Neue' } };
    const asked = loader.askedItalics(config, 'Some *emphasis*.');
    expect(asked.get('Oswald')).toEqual([400, 700]);
    expect(asked.has('Bebas Neue')).toBe(false);
  });
});

const COMIC = ':::page\n::panel\nsfx: WHAM\n:::';
const COMIC_CONFIG: PostextConfig = { locale: 'en', comics: { lettering: { fontFamily: 'Bangers' } }, bodyText: { fontFamily: 'Bangers' }, headings: { fontFamily: 'Bangers' } };

describe('the stand-ins of a build (#688)', () => {
  beforeEach(() => {
    routes[fontsource('bangers')] = { type: 'google', variable: false, weights: [400], styles: ['normal'] };
    routes[google('Bangers')] = BANGERS_CSS;
  });

  it('sends the worker the family\'s own files as its bold and its italics, for the characters of the text', async () => {
    const payloads = await loader.collectStandInPayloads(COMIC_CONFIG, { markdown: COMIC });
    const bangers = payloads.filter((p) => p.family === 'Bangers');
    // The text is ASCII: the latin file, under the three faces the family lacks.
    expect(bangers.map((p) => `${p.weight} ${p.style} ${fileOf(p.buffer)}`)).toEqual([
      '600 900 normal https://fonts.gstatic.com/s/bangers/latin.woff2',
      '400 italic https://fonts.gstatic.com/s/bangers/latin.woff2',
      '600 900 italic https://fonts.gstatic.com/s/bangers/latin.woff2',
    ]);
    expect(bangers.every((p) => p.unicodeRange === LATIN)).toBe(true);
    // Each payload has a buffer of its own (they are transferred together).
    expect(new Set(bangers.map((p) => p.buffer)).size).toBe(3);
  });

  it('sends a face once, and the file of a character the text gains', async () => {
    const first = await loader.collectStandInPayloads(COMIC_CONFIG, { markdown: COMIC });
    const sent = new Set(first.map(loader.fontPayloadKey));
    expect(await loader.collectStandInPayloads(COMIC_CONFIG, { markdown: COMIC }, sent)).toEqual([]);
    const more = await loader.collectStandInPayloads(COMIC_CONFIG, { markdown: COMIC.replace('WHAM', 'Ầ') }, sent);
    expect(more.map((p) => `${p.weight} ${p.style} ${p.unicodeRange}`)).toEqual([
      `600 900 normal ${VIETNAMESE}`, `400 italic ${VIETNAMESE}`, `600 900 italic ${VIETNAMESE}`,
    ]);
  });

  it('declares them on the page beside the family\'s faces, and loads them', async () => {
    expect(loader.standInsSettled(COMIC_CONFIG, COMIC)).toBe(false);
    expect(await loader.declareStandIns(COMIC_CONFIG, COMIC)).toBe(true);
    expect(fonts.declared('Bangers')).toEqual([
      '600 900 normal', '600 900 normal', '600 900 normal',
      '400 italic', '400 italic', '400 italic',
      '600 900 italic', '600 900 italic', '600 900 italic',
    ]);
    expect(fonts.faces[2]!.source).toBe('url("https://fonts.gstatic.com/s/bangers/latin.woff2") format(\'woff2\')');
    expect(fonts.faces[2]!.unicodeRange).toBe(LATIN);
    expect(fonts.loads).toEqual(expect.arrayContaining(['600 16px "Bangers"', 'italic 400 16px "Bangers"', 'italic 600 16px "Bangers"']));
    expect(fonts.faces.every((f) => f.status === 'loaded')).toBe(true);
    // Once: nothing is declared twice.
    expect(loader.standInsSettled(COMIC_CONFIG, COMIC)).toBe(true);
    expect(await loader.declareStandIns(COMIC_CONFIG, COMIC)).toBe(false);
    expect(fonts.faces).toHaveLength(9);
  });

  it('is declared by the wait of the previews before their faces are checked', async () => {
    await loader.ensureConfigFontsLoaded(COMIC_CONFIG, COMIC);
    expect(fonts.declared('Bangers')).toContain('600 900 normal');
    expect(loader.standInsSettled(COMIC_CONFIG, COMIC)).toBe(true);
  });

  it('settles a family whose faces cannot be had, with nothing declared', async () => {
    routes[google('Bangers')] = new TypeError('Failed to fetch');
    expect(await loader.declareStandIns(COMIC_CONFIG, COMIC)).toBe(false);
    expect(fonts.faces).toEqual([]);
    expect(loader.standInsSettled(COMIC_CONFIG, COMIC)).toBe(true);
  });
});

describe('a family Google Fonts does not serve (#689)', () => {
  beforeEach(() => {
    routes[fontsource('host-grotesk')] = { type: 'google', variable: true, weights: [300, 400, 500, 600, 700, 800], styles: ['italic', 'normal'] };
    routes[google('Host Grotesk')] = HOST_CSS;
  });

  it('costs the other families of the build none of their faces when its request rejects', async () => {
    // Fontsource down for this family: Google is asked, and its 400 has no CORS headers.
    routes[fontsource('commit-mono')] = 503;
    routes[google('Commit Mono')] = new TypeError('Failed to fetch');
    const payloads = await loader.collectFontPayloadsForFamilies(['Host Grotesk', 'Commit Mono']);
    expect(payloads.map((p) => `${p.family} ${p.weight} ${p.style}`)).toEqual([
      'Host Grotesk 300 800 normal', 'Host Grotesk 300 800 normal', 'Host Grotesk 300 800 italic',
    ]);
  });

  it('is loaded from Fontsource, and Google is not asked for it', async () => {
    routes[fontsource('commit-mono')] = COMMIT_MONO;
    routes[google('Commit Mono')] = new TypeError('Failed to fetch');
    const payloads = await loader.collectFontPayloadsForFamilies(['Host Grotesk', 'Commit Mono']);
    expect(payloads.filter((p) => p.family === 'Commit Mono').map((p) => `${p.weight} ${p.style} ${fileOf(p.buffer)}`)).toEqual([
      '400 normal https://cdn.jsdelivr.net/fontsource/fonts/commit-mono@latest/latin-400-normal.woff2',
      '400 italic https://cdn.jsdelivr.net/fontsource/fonts/commit-mono@latest/latin-400-italic.woff2',
      '700 normal https://cdn.jsdelivr.net/fontsource/fonts/commit-mono@latest/latin-700-normal.woff2',
      '700 italic https://cdn.jsdelivr.net/fontsource/fonts/commit-mono@latest/latin-700-italic.woff2',
    ]);
    expect(payloads.filter((p) => p.family === 'Host Grotesk')).toHaveLength(3);
    expect(requests.some((u) => u.startsWith(google('Commit Mono')))).toBe(false);
  });

  it('is declared on the page as faces of its own, with no style sheet', async () => {
    routes[fontsource('commit-mono')] = COMMIT_MONO;
    // The regular face alone when no other is asked: what a specimen is set in (#757).
    await loader.loadFont('Commit Mono');
    expect(fonts.declared('Commit Mono')).toEqual(['400 normal']);
    await loader.loadFont('Commit Mono', [{ weight: 400, style: 'italic' }, { weight: 700, style: 'normal' }, { weight: 700, style: 'italic' }]);
    expect(fonts.declared('Commit Mono').sort()).toEqual(['400 italic', '400 normal', '700 italic', '700 normal']);
    expect(fonts.faces.every((f) => f.status === 'loaded')).toBe(true);
    expect(requests.some((u) => hostOf(u) === 'fonts.googleapis.com')).toBe(false);
  });

  it('is not asked for again at every build while it cannot be had', async () => {
    routes[fontsource('commit-mono')] = 404;
    routes[google('Commit Mono')] = new TypeError('Failed to fetch');
    await loader.collectFontPayloadsForFamilies(['Commit Mono']);
    await loader.collectFontPayloadsForFamilies(['Commit Mono']);
    await loader.collectStandInPayloads({ bodyText: { fontFamily: 'Commit Mono' } }, { markdown: 'Text.' });
    expect(requests.filter((u) => u.startsWith(google('Commit Mono')))).toHaveLength(1);
  });
});

describe('the files of a family sent to the worker (#689)', () => {
  it('keep the order of the style sheet, whatever order they arrive in', async () => {
    routes[fontsource('bangers')] = { type: 'google', variable: false, weights: [400], styles: ['normal'] };
    routes[google('Bangers')] = BANGERS_CSS;
    reverseArrival = true;
    const payloads = await loader.collectFontPayloadsForFamilies(['Bangers']);
    expect(payloads.map((p) => p.unicodeRange)).toEqual([VIETNAMESE, LATIN_EXT, LATIN]);
  });
});

// #739: the Fonts panel tagged every family that is not a custom one
// "Google Fonts": Commit Mono (Fontsource only), a misspelt name, and a
// family whose record had not come yet.
describe('where a family comes from, as the loader resolved it (#739)', () => {
  it('is Google Fonts for a record of type google', async () => {
    routes[fontsource('host-grotesk')] = { type: 'google', variable: true, weights: [300, 400, 500, 600, 700, 800], styles: ['italic', 'normal'] };
    routes[google('Host Grotesk')] = HOST_CSS;
    expect(loader.fontFamilySource('Host Grotesk')).toBeUndefined();
    await loader.collectFontPayloadsForFamilies(['Host Grotesk']);
    expect(loader.fontFamilySource('Host Grotesk')).toBe('google');
  });

  it('is Fontsource for a record of another type that carries its own files', async () => {
    routes[fontsource('commit-mono')] = COMMIT_MONO;
    await loader.loadFont('Commit Mono');
    expect(loader.fontFamilySource('Commit Mono')).toBe('fontsource');
  });

  it('is missing for a family no service has', async () => {
    routes[fontsource('helvetica-noue')] = 404;
    routes[google('Helvetica Noue')] = new TypeError('Failed to fetch');
    await loader.loadFont('Helvetica Noue').catch(() => undefined);
    expect(loader.fontFamilySource('Helvetica Noue')).toBe('missing');
    expect(loader.isKnownUnavailableGoogleFont('Helvetica Noue')).toBe(true);
  });

  it('is unknown while the request is in flight, and tells who listens when the answer comes', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => { answer = resolve; });
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input);
      requests.push(url);
      if (url.startsWith(fontsource('lora'))) {
        await pending;
        return { ok: true, status: 200, json: async () => ({ type: 'google', variable: true, weights: [400, 700], styles: ['normal', 'italic'] }) };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) };
    });
    const resolved: string[] = [];
    const off = loader.onFontSourceResolved((family) => resolved.push(family));
    const loading = loader.collectFontPayloadsForFamilies(['Lora']);
    await new Promise((r) => setTimeout(r, 5));
    expect(loader.fontFamilySource('Lora')).toBeUndefined();
    expect(resolved).toEqual([]);
    answer(undefined);
    await loading;
    expect(loader.fontFamilySource('Lora')).toBe('google');
    expect(resolved).toEqual(['Lora']);
    off();
  });

  it('is your file for an uploaded family, and missing once its files are removed', () => {
    const custom = [{ name: 'House Serif', variants: [{ weight: 400, style: 'normal' as const, fileId: 'f1', format: 'woff2' as const }] }];
    loader.setCustomFonts(custom);
    expect(loader.fontFamilySource('House Serif')).toBe('custom');
    loader.setCustomFonts([]);
    expect(loader.fontFamilySource('House Serif')).toBe('missing');
  });
});

// #753: opening the guide cost 64 failed requests. Its figures are set in
// `Geist, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`,
// the engine asks the host for every named family of the list, and the
// loader took each of them to Fontsource, to Google Fonts and to jsDelivr,
// weight by weight and style by style.
describe('the system fonts of a font stack (#753)', () => {
  const STACK = ['-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial'];
  const GENERIC = ['sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont'];
  const FACES: [number, 'normal' | 'italic'][] = [[400, 'normal'], [400, 'italic'], [600, 'normal'], [700, 'normal'], [700, 'italic']];
  const fontsourceCss = (id: string, weight: number) => `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/${weight}`;
  const LORA_CSS = `@font-face{font-family:'Lora';font-style:normal;font-weight:400;src:url(./files/lora-latin-400-normal.woff2) format('woff2');unicode-range:${LATIN};}`;
  const GEORGIA_CSS = googleCss('Georgia', [{ weight: '400', range: LATIN, file: 'l/georgia' }]);

  /** The style sheets the page was given. */
  let links: string[];
  /** A page that takes a style sheet link, and fails to load it. */
  function pageWithLinks(): void {
    links = [];
    globals.document = {
      fonts,
      createElement: () => ({}),
      head: {
        appendChild: (link: { href: string; onerror?: () => void }) => {
          links.push(link.href);
          queueMicrotask(() => link.onerror?.());
        },
      },
    };
  }

  const provider = async () => (await import('../../viewport/pdf/pdfFontProvider.js')).createPdfFontProvider({ raw: true });

  it('tells them by name, whatever the quotes and the case', async () => {
    const { isSystemFontFamily, isGenericFontFamily } = await import('./systemFonts.js');
    for (const name of [...STACK, ...GENERIC, "'Segoe UI'", '"helvetica neue"', 'ARIAL', 'Times New Roman', 'PingFang SC', 'Hiragino Mincho ProN', 'Yu Gothic', 'Geeza Pro', 'Tahoma', 'Source Han Sans SC']) {
      expect(isSystemFontFamily(name), name).toBe(true);
    }
    // System fonts somewhere, and in the catalogue too; a misspelt name is
    // for the catalogue to answer.
    for (const name of ['Geist', 'Roboto', 'Noto Sans SC', 'Ubuntu', 'DejaVu Sans', 'EB Garamond', 'Helvetica Noue', 'Arial Nova Web']) {
      expect(isSystemFontFamily(name), name).toBe(false);
    }
    expect(GENERIC.every(isGenericFontFamily)).toBe(true);
    expect(['Arial', 'Segoe UI', 'Helvetica Neue', 'Geist'].some(isGenericFontFamily)).toBe(false);
  });

  it('gives their faces up in the provider of the SVG pictures and the PDF, with no request', async () => {
    pageWithLinks();
    const ask = await provider();
    for (const family of [...STACK, 'sans-serif']) {
      for (const [weight, style] of FACES) {
        await expect(ask(family, weight, style, { codePoints: new Set([0x20, 0x41]) })).rejects.toThrow(`Fontsource has no files for the family "${family}"`);
      }
    }
    expect(requests).toEqual([]);
    expect(links).toEqual([]);
  });

  it('asks no service for a generic keyword: no record, no style sheet, no files', async () => {
    pageWithLinks();
    await Promise.all(GENERIC.map((family) => loader.loadFont(family)));
    expect(await loader.collectFontPayloadsForFamilies(GENERIC)).toEqual([]);
    expect(await loader.fetchFamilyFaces('sans-serif')).toEqual([]);
    expect(requests).toEqual([]);
    expect(links).toEqual([]);
    expect(fonts.loads).toEqual([]);
  });

  it('does not look a face of an operating system up, and leaves a setting that names one what Google Fonts answers for it', async () => {
    pageWithLinks();
    routes[google('Georgia')] = GEORGIA_CSS;
    expect(await loader.fontFamilyWeights('Georgia')).toBeNull();
    await loader.loadFont('Georgia');
    expect(links).toEqual(['https://fonts.googleapis.com/css2?family=Georgia:ital,wght@0,400;0,700;1,400;1,700&display=swap']);
    const payloads = await loader.collectFontPayloadsForFamilies(['Georgia']);
    expect(payloads.map((p) => `${p.family} ${p.weight} ${p.style}`)).toEqual(['Georgia 400 normal']);
    expect(requests.filter((u) => u.includes('fontsource'))).toEqual([]);
  });

  it('keeps them missing for the Checks panel, known from the start', async () => {
    for (const family of STACK) {
      expect(loader.fontFamilySource(family)).toBe('missing');
      expect(loader.isKnownUnavailableGoogleFont(family)).toBe(true);
      expect(loader.isUncataloguedFontFamily(family)).toBe(true);
    }
    const { computeWarnings } = await import('../../warnings/compute.js');
    const config: PostextConfig = { bodyText: { fontFamily: 'Arial' }, headings: { fontFamily: 'Lora, Helvetica Neue, sans-serif' } };
    const payloads = computeWarnings({ markdown: 'Text.', config, doc: null }).map((w) => w.payload);
    expect(payloads.filter((p) => p.kind === 'missingFontFamily')).toEqual([{ kind: 'missingFontFamily', family: 'Arial' }]);
    expect(payloads.filter((p) => p.kind === 'fontFamilyStack')).toEqual([
      { kind: 'fontFamilyStack', path: 'headings.fontFamily', value: 'Lora, Helvetica Neue, sans-serif', used: 'Lora' },
    ]);
    expect(requests).toEqual([]);
  });

  it('leaves an uploaded family of such a name to its files', () => {
    loader.setCustomFonts([{ name: 'Arial', variants: [{ weight: 400, style: 'normal' as const, fileId: 'f1', format: 'woff2' as const }] }]);
    expect(loader.fontFamilySource('Arial')).toBe('custom');
    expect(loader.isUncataloguedFontFamily('Arial')).toBe(false);
  });

  it('looks a family the catalogue does not have up once, whatever weights and styles are asked', async () => {
    pageWithLinks();
    routes[fontsource('helvetica-noue')] = 404;
    const ask = await provider();
    for (const [weight, style] of FACES) {
      await expect(ask('Helvetica Noue', weight, style)).rejects.toThrow('Fontsource has no files for the family "Helvetica Noue"');
    }
    expect(requests).toEqual([fontsource('helvetica-noue')]);
    expect(loader.isUncataloguedFontFamily('Helvetica Noue')).toBe(true);
    expect(loader.fontFamilySource('Helvetica Noue')).toBe('missing');
  });

  it('looks a family the catalogue has up once too, and answers with its files', async () => {
    pageWithLinks();
    routes[fontsource('lora')] = { type: 'google', variable: true, weights: [400, 500, 600, 700], styles: ['normal', 'italic'] };
    routes[fontsourceCss('lora', 400)] = LORA_CSS;
    const ask = await provider();
    const files = await ask('Lora', 400, 'normal', { codePoints: new Set([0x41]) });
    expect([files].flat().map((f) => new TextDecoder().decode(f))).toEqual([
      'https://cdn.jsdelivr.net/npm/@fontsource/lora@5/files/lora-latin-400-normal.woff2',
    ]);
    expect(requests.filter((u) => u.startsWith(fontsource('lora')))).toHaveLength(1);
    expect(loader.isUncataloguedFontFamily('Lora')).toBe(false);
  });

  it('still asks for the files of a family whose lookup failed: the catalogue down is not the family missing', async () => {
    pageWithLinks();
    routes[fontsource('lora')] = 503;
    routes[fontsourceCss('lora', 400)] = LORA_CSS;
    const ask = await provider();
    const files = await ask('Lora', 400, 'normal', { codePoints: new Set([0x41]) });
    expect([files].flat()).toHaveLength(1);
    expect(loader.isUncataloguedFontFamily('Lora')).toBe(false);
  });
});
