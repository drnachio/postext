import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { resolveObjectURL } from 'node:buffer';
import {
  buildDocument,
  bundleImageUrl,
  clearRegisteredFonts,
  clearResourceImages,
  formatWarning,
  getResourceImage,
  inlineSvgFonts,
  inlineSvgFontsDetailed,
  inlineSvgFontsSync,
  isFontFaceOnlyStyleSheet,
  loadBundleFonts,
  prepareSvgMarkup,
  registerBundleImages,
  registerFontBytes,
  registerFontUrl,
  registeredFontGeneration,
  registeredFontProvider,
  registerSvgImage,
  renderToHtml,
  svgDeclaredFontFamilies,
  svgFontRequests,
} from '../index';
import type { BundleFontFile, PostextConfig, RenderWarning, Resource, SvgFontWarning } from '../index';

// #630: SVG pictures set their text in the document's fonts on canvas, in
// HTML and in EPUB — the faces their text names are inlined as
// `@font-face` data URIs before the picture is decoded or served.

/** Bytes that sniff as a font of `format`, `size` long. */
function fontBytes(format: 'woff2' | 'ttf', size = 16, fill = 0): Uint8Array {
  const b = new Uint8Array(size).fill(fill);
  if (format === 'woff2') b.set([0x77, 0x4f, 0x46, 0x32]);
  else b.set([0x00, 0x01, 0x00, 0x00]);
  return b;
}

const svg = (body: string, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"${extra}>${body}</svg>`;

/** The `@font-face` rules of inlined markup: family, weight, style. */
function faces(markup: string): string[] {
  return [...markup.matchAll(/@font-face\{font-family:"([^"]+)";font-weight:([^;]+);font-style:([^;]+);/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
}

/** Measurement for the layouts the HTML tests build. */
class MeasureCanvas {
  getContext() {
    return { font: '', measureText: (s: string) => ({ width: s.length * 7 }) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= MeasureCanvas;

beforeEach(() => {
  clearRegisteredFonts();
  clearResourceImages();
});

describe('svgFontRequests', () => {
  it('reads family, weight and style from attributes, style and inherited groups', () => {
    const reqs = svgFontRequests(svg(
      '<g font-family="IBM Plex Sans, sans-serif" font-weight="bold">'
      + '<text x="1" y="10">Ab</text>'
      + '<text style="font-style: italic; font-weight: 400">Cd</text>'
      + '</g>'
      + '<text style="font: italic 600 12px \'Source Serif 4\', serif">Ef</text>'
      + '<text font-family="serif">generic</text>'
      + '<title>Not set</title>',
    ));
    expect(reqs.map((r) => `${r.families.join('|')} ${r.weight} ${r.style} ${String.fromCodePoint(...[...r.codePoints].filter((c) => c > 0x20))}`)).toEqual([
      'IBM Plex Sans 700 normal Ab',
      'IBM Plex Sans 400 italic Cd',
      'Source Serif 4 600 italic Ef',
    ]);
  });

  it('counts tspans in the run they inherit and decodes entities', () => {
    const [req] = svgFontRequests(svg('<text font-family="Inter">a<tspan>&#x3b1;&amp;</tspan></text>'));
    expect([...req!.codePoints].sort((a, b) => a - b)).toEqual([0x20, 0x26, 0x61, 0x3b1]);
  });

  it('takes a style-sheet rule that names a family, and lists families declared by @font-face', () => {
    const markup = svg('<style>@font-face{font-family:"Own Face";src:url(x.woff2)} .lbl{font-family:Inter;font-weight:700}</style><text class="lbl">Hi</text>');
    expect(svgFontRequests(markup).map((r) => `${r.families[0]} ${r.weight}`)).toEqual(['Inter 700']);
    expect(svgDeclaredFontFamilies(markup)).toEqual(['own face']);
  });
});

describe('isFontFaceOnlyStyleSheet', () => {
  it('accepts @font-face rules, comments and whitespace only', () => {
    expect(isFontFaceOnlyStyleSheet('/* faces */ @font-face{font-family:X;src:url(data:font/woff2;base64,AA==)}\n@font-face{font-family:Y}')).toBe(true);
    expect(isFontFaceOnlyStyleSheet('<![CDATA[@font-face{font-family:X}]]>')).toBe(true);
    expect(isFontFaceOnlyStyleSheet('@font-face{font-family:X} text{fill:red}')).toBe(false);
    expect(isFontFaceOnlyStyleSheet('.a{fill:red}')).toBe(false);
  });
});

describe('inlineSvgFonts', () => {
  const markup = svg('<text font-family="IBM Plex Sans" font-weight="700">Sales</text>');

  it('embeds the face a provider answers, after the root tag, with its format', async () => {
    const asked: { family: string; weight: number; chars: string }[] = [];
    const out = await inlineSvgFonts(markup, async (family, weight, _style, request) => {
      asked.push({ family, weight, chars: String.fromCodePoint(...[...request!.codePoints].filter((c) => c > 0x20)).split('').sort().join('') });
      return fontBytes('woff2');
    });
    expect(asked).toEqual([{ family: 'IBM Plex Sans', weight: 700, chars: 'Saels' }]);
    expect(out).toMatch(/^<svg [^>]*><style type="text\/css"><!\[CDATA\[@font-face\{font-family:"IBM Plex Sans";font-weight:700;font-style:normal;src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\("woff2"\)\}\]\]><\/style><text/);
  });

  it('leaves alone a family the SVG declares itself', async () => {
    const own = svg('<style>@font-face{font-family:"IBM Plex Sans";src:url(data:font/woff2;base64,AA==)}</style><text font-family="IBM Plex Sans">x</text>');
    let calls = 0;
    const result = await inlineSvgFontsDetailed(own, async () => {
      calls++;
      return fontBytes('woff2');
    });
    expect(calls).toBe(0);
    expect(result.svg).toBe(own);
    expect(result.faces).toEqual([{ family: 'IBM Plex Sans', weight: 400, style: 'normal', status: 'declared' }]);
  });

  it('falls through the font-family list and reports a run none of whose families has a face', async () => {
    const warnings: SvgFontWarning[] = [];
    const two = svg('<text font-family="Missing, Inter">a</text><text font-family="Nowhere" font-style="italic">b</text>');
    const result = await inlineSvgFontsDetailed(two, async (family) => {
      if (family !== 'Inter') throw new Error('no');
      return fontBytes('ttf');
    }, { onWarning: (w) => warnings.push(w) });
    expect(faces(result.svg)).toEqual(['Inter 400 normal']);
    expect(warnings).toEqual([{ kind: 'svgFontUnavailable', family: 'Nowhere', weight: 400, style: 'italic' }]);
    expect(result.faces.map((f) => `${f.family}:${f.status}`)).toEqual(['Inter:inlined', 'Nowhere:unavailable']);
  });

  it('withholds families marked not redistributable and tells onWithheld', async () => {
    const withheld: string[] = [];
    const result = await inlineSvgFontsDetailed(markup, async () => fontBytes('ttf'), {
      withhold: (f) => f === 'IBM Plex Sans',
      onWithheld: (f) => withheld.push(f),
    });
    expect(result.svg).toBe(markup);
    expect(withheld).toEqual(['IBM Plex Sans']);
    expect(result.faces[0]!.status).toBe('withheld');
  });

  it('embeds nothing over maxBytes and reports svgFontsTooLarge', async () => {
    const warnings: SvgFontWarning[] = [];
    const result = await inlineSvgFontsDetailed(markup, async () => fontBytes('woff2', 4096), { maxBytes: 1000, onWarning: (w) => warnings.push(w) });
    expect(result.svg).toBe(markup);
    expect(result.bytes).toBe(0);
    expect(warnings).toEqual([{ kind: 'svgFontsTooLarge', bytes: 4096, maxBytes: 1000 }]);
    expect(result.faces[0]).toMatchObject({ status: 'tooLarge', bytes: 4096, files: 1 });
  });

  it('embeds a file answered for several weights once, for the range', () => {
    const file = fontBytes('ttf');
    const out = inlineSvgFontsSync(svg('<text font-family="Inter">a</text><text font-family="Inter" font-weight="700">b</text>'), () => file);
    expect(faces(out)).toEqual(['Inter 400 700 normal']);
  });

  it('skips files of a format left out of formats', () => {
    const out = inlineSvgFontsSync(markup, () => fontBytes('ttf'), { formats: ['woff2'] });
    expect(out).toBe(markup);
  });

  it('returns markup without text runs unchanged', async () => {
    const plain = svg('<rect width="10" height="10"/>');
    expect(await inlineSvgFonts(plain, async () => fontBytes('ttf'))).toBe(plain);
  });
});

describe('registered fonts', () => {
  it('serves only the unicode-range slices the SVG sets', async () => {
    const latin = fontBytes('woff2', 20, 1);
    const cyrillic = fontBytes('woff2', 30, 2);
    const greek = fontBytes('woff2', 40, 3);
    registerFontBytes('Inter', 400, 'normal', latin, { unicodeRange: 'U+0000-00FF, U+0131' });
    registerFontBytes('Inter', 400, 'normal', cyrillic, { unicodeRange: 'U+0400-045F' });
    registerFontBytes('Inter', 400, 'normal', greek, { unicodeRange: 'U+0370-03FF' });
    const latinOnly = await inlineSvgFontsDetailed(svg('<text font-family="Inter">Sales 2026</text>'), registeredFontProvider({ styleSheets: false }));
    expect(latinOnly.bytes).toBe(20);
    expect(latinOnly.faces[0]).toMatchObject({ status: 'inlined', files: 1 });
    const mixed = await inlineSvgFontsDetailed(svg('<text font-family="Inter">α and я</text>'), registeredFontProvider({ styleSheets: false }));
    expect(mixed.bytes).toBe(20 + 30 + 40);
  });

  it('picks the nearest weight of the same style and bumps the generation', async () => {
    const before = registeredFontGeneration();
    const regular = fontBytes('ttf', 16, 4);
    const bold = fontBytes('ttf', 18, 5);
    registerFontBytes('Lora', 400, 'normal', regular);
    registerFontBytes('Lora', 700, 'normal', bold);
    registerFontBytes('Lora', 400, 'italic', fontBytes('ttf', 19, 6));
    expect(registeredFontGeneration()).toBeGreaterThan(before);
    const provider = registeredFontProvider({ styleSheets: false });
    expect(await provider('lora', 600, 'normal')).toBe(bold);
    expect(await provider('Lora', 300, 'normal')).toBe(regular);
    await expect(provider('Nope', 400, 'normal')).rejects.toThrow();
  });

  it('fetches a face registered by URL once', async () => {
    let fetches = 0;
    const fakeFetch = (async () => {
      fetches++;
      return new Response(fontBytes('woff2', 24) as BodyInit);
    }) as unknown as typeof fetch;
    registerFontUrl('Fira Sans', 400, 'normal', 'https://cdn.example/fira-latin-400.woff2');
    const provider = registeredFontProvider({ fetch: fakeFetch, styleSheets: false });
    const a = await inlineSvgFontsDetailed(svg('<text font-family="Fira Sans">x</text>'), provider);
    const b = await inlineSvgFontsDetailed(svg('<text font-family="Fira Sans">y</text>'), provider);
    expect(a.bytes).toBe(24);
    expect(b.bytes).toBe(24);
    expect(fetches).toBe(1);
  });
});

describe('prepareSvgMarkup', () => {
  it('leaves the markup byte-identical with inlineFonts: false', async () => {
    registerFontBytes('IBM Plex Sans', 700, 'normal', fontBytes('ttf'));
    const markup = svg('<text font-family="IBM Plex Sans" font-weight="700">A</text>');
    expect((await prepareSvgMarkup(markup, { inlineFonts: false })).svg).toBe(markup);
    expect(faces((await prepareSvgMarkup(markup)).svg)).toEqual(['IBM Plex Sans 700 normal']);
  });

  it('recolours for single ink before it inlines', async () => {
    registerFontBytes('Inter', 400, 'normal', fontBytes('ttf'));
    const out = (await prepareSvgMarkup(svg('<text font-family="Inter" fill="#000000">A</text>'), { inkHex: '#295aa3' })).svg;
    expect(out).toContain('data-postext-single-ink=');
    expect(faces(out)).toEqual(['Inter 400 normal']);
    expect(out).not.toContain('fill="#000000"');
  });
});

/** An `<img>` stand-in that loads whatever `src` it is given and keeps
 *  the markup it decoded. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  markup = '';
  set src(url: string) {
    void (async () => {
      const blob = url.startsWith('blob:') ? resolveObjectURL(url) : undefined;
      this.markup = blob ? await blob.text() : decodeURIComponent(url.replace(/^data:[^,]*,/, ''));
      this.onload?.();
    })();
  }
}

describe('canvas hosts', () => {
  let saved: unknown;
  beforeEach(() => {
    saved = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image?: unknown }).Image = FakeImage;
  });
  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = saved;
  });

  it('registerSvgImage decodes the markup with the registered face and registers a vector image', async () => {
    registerFontBytes('IBM Plex Sans', 700, 'normal', fontBytes('woff2'));
    const report = await registerSvgImage('chart.svg', svg('<text font-family="IBM Plex Sans" font-weight="700">Q3</text>'));
    expect(report.faces).toEqual([{ family: 'IBM Plex Sans', weight: 700, style: 'normal', status: 'inlined', bytes: 16, files: 1 }]);
    const img = getResourceImage('chart.svg') as unknown as FakeImage;
    expect(faces(img.markup)).toEqual(['IBM Plex Sans 700 normal']);
  });

  const bundle = (inlineFonts?: boolean) => ({
    config: { ...(inlineFonts === false ? { diagramStyle: { inlineFonts: false } } : {}) } as PostextConfig,
    resources: [
      { id: 'chart', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'chart.svg', width: 100, height: 40 } },
      { id: 'raw', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'raw.svg', width: 100, height: 40, inlineFonts: false } },
    ] as Resource[],
    files: new Map([
      ['chart.svg', new TextEncoder().encode(svg('<text font-family="IBM Plex Sans" font-weight="700">Q3</text><text font-family="Nope">x</text>'))],
      ['raw.svg', new TextEncoder().encode(svg('<text font-family="IBM Plex Sans" font-weight="700">Q4</text>'))],
    ]),
    fonts: [{ fileId: 'f', file: 'fonts/plex-700.woff2', fileName: 'plex-700.woff2', family: 'IBM Plex Sans', weight: 700, style: 'normal', format: 'woff2', bytes: fontBytes('woff2', 32).buffer as ArrayBuffer }] as BundleFontFile[],
  });

  it('registerBundleImages inlines the bundle faces, honours svg.inlineFonts and reports missing families', async () => {
    const warnings: RenderWarning[] = [];
    await registerBundleImages(bundle(), { onWarning: (w) => warnings.push(w) });
    expect(faces((getResourceImage('chart.svg') as unknown as FakeImage).markup)).toEqual(['IBM Plex Sans 700 normal']);
    expect(faces((getResourceImage('raw.svg') as unknown as FakeImage).markup)).toEqual([]);
    expect(warnings).toEqual([{ kind: 'svgFontUnavailable', fileId: 'chart.svg', resourceId: 'chart', family: 'Nope', weight: 400, style: 'normal' }]);
    expect(formatWarning(warnings[0]!)).toContain('"Nope"');
  });

  it('bundleImageUrl serves SVG markup that carries the face, unless diagramStyle.inlineFonts is off', async () => {
    const urls = bundleImageUrl(bundle());
    const text = await resolveObjectURL(urls('chart.svg')!)!.text();
    expect(faces(text)).toEqual(['IBM Plex Sans 700 normal']);
    urls.revoke();
    const off = bundleImageUrl(bundle(false));
    const raw = await resolveObjectURL(off('chart.svg')!)!.text();
    expect(raw).toBe(svg('<text font-family="IBM Plex Sans" font-weight="700">Q3</text><text font-family="Nope">x</text>'));
    off.revoke();
  });

  it('loadBundleFonts registers the faces for SVG pictures without a FontFaceSet', async () => {
    await loadBundleFonts({ fonts: bundle().fonts }, undefined);
    const out = await inlineSvgFonts(svg('<text font-family="IBM Plex Sans" font-weight="700">Q</text>'), registeredFontProvider({ styleSheets: false }));
    expect(faces(out)).toEqual(['IBM Plex Sans 700 normal']);
  });
});

describe('renderToHtml inlineSvgFonts', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (inlineFonts?: boolean): PostextConfig => ({
    page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, dpi: 72 },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    ...(inlineFonts === false ? { diagramStyle: { inlineFonts: false } } : {}),
  });
  const figure: Resource = { id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'fig.svg', width: 100, height: 40 }, placement: { position: 'here' } };
  const markup = svg('<text font-family="IBM Plex Sans" font-weight="700">Q3</text>');
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  function srcOf(html: string): string {
    const m = /<img[^>]*src="([^"]*)"/.exec(html);
    return (m?.[1] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  it('re-encodes SVG data URIs with the registered faces', () => {
    registerFontBytes('IBM Plex Sans', 700, 'normal', fontBytes('woff2'));
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure] }, config());
    const plain = srcOf(renderToHtml(doc, { resourceImageUrl: () => dataUri }));
    expect(plain).toBe(dataUri);
    const inlined = srcOf(renderToHtml(doc, { resourceImageUrl: () => dataUri, inlineSvgFonts: true }));
    expect(faces(decodeURIComponent(inlined.replace(/^data:[^,]*,/, '')))).toEqual(['IBM Plex Sans 700 normal']);
    const off = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure] }, config(false));
    expect(srcOf(renderToHtml(off, { resourceImageUrl: () => dataUri, inlineSvgFonts: true }))).toBe(dataUri);
  });

  it('reports a family with no face once', () => {
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources: [figure] }, config());
    const warnings: RenderWarning[] = [];
    renderToHtml(doc, { resourceImageUrl: () => dataUri, inlineSvgFonts: true, onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([{ kind: 'svgFontUnavailable', fileId: 'fig.svg', resourceId: 'fig', family: 'IBM Plex Sans', weight: 700, style: 'normal' }]);
  });
});
