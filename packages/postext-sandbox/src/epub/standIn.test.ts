import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fontsourceCssUrl } from '../viewport/pdf/fontsourceSlices.js';

// #993: a family the book may not hand on is not left to the reading system
// when it names an open `fallback`: the EPUB carries the fallback's faces
// under the family's own name, in the book's text and in its SVG pictures.

vi.mock('../storage/fontStorage.js', () => ({ getFontFile: async () => null }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

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

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    if (url.endsWith('.woff2')) return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
    const headers = { get: () => null };
    if (url === 'https://api.fontsource.org/v1/fonts/source-serif-4') return { ok: true, status: 200, headers, json: async () => SERIF_RECORD, text: async () => '' };
    for (const weight of [400, 700]) {
      for (const style of ['normal', 'italic']) {
        if (url === fontsourceCssUrl(SERIF, weight, style as 'normal' | 'italic')) return { ok: true, status: 200, headers, json: async () => ({}), text: async () => packageCss(weight, style) };
      }
    }
    return { ok: false, status: 404, headers, json: async () => ({}), text: async () => '' };
  });
}

let loader: typeof import('../controls/fonts/fontLoader.js');
let inputs: typeof import('./inputs.js');

beforeEach(async () => {
  stubFetch();
  vi.resetModules();
  loader = await import('../controls/fonts/fontLoader.js');
  inputs = await import('./inputs.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const config = (family: string) => ({ bodyText: { fontFamily: family } });
const urlOf = (file: { bytes: Uint8Array }) => new TextDecoder().decode(file.bytes);

describe('the fonts of an EPUB for a family that may not be handed on (#993)', () => {
  it('embeds the fallback\'s faces under the family\'s name, never the family\'s own files', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false, fallback: SERIF }]);
    const { fonts, withheld, stoodIn } = await inputs.collectEpubFonts(config('Licensed Serif'), []);
    expect(withheld).toEqual([]);
    expect(stoodIn).toEqual([{ family: 'Licensed Serif', standIn: SERIF }]);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((f) => f.family === 'Licensed Serif')).toBe(true);
    expect(fonts.every((f) => f.redistributable !== false)).toBe(true);
    // The regular and the bold of the fallback, as asked.
    const files = fonts.map((f) => urlOf(f));
    expect(files.some((u) => u.endsWith('source-serif-4-latin-400-normal.woff2'))).toBe(true);
    expect(files.some((u) => u.endsWith('source-serif-4-latin-700-normal.woff2'))).toBe(true);
  });

  it('leaves a family without a fallback to the reading system, as before', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false }]);
    const { fonts, withheld, stoodIn } = await inputs.collectEpubFonts(config('Licensed Serif'), []);
    expect(fonts.filter((f) => f.family === 'Licensed Serif')).toEqual([]);
    expect(withheld).toEqual(['Licensed Serif']);
    expect(stoodIn).toEqual([]);
  });

  it('leaves it to the reading system too when the fallback has no file to give', async () => {
    loader.setCustomFonts([{ name: 'Licensed Serif', variants: [], redistributable: false, fallback: 'Not A Real Family' }]);
    const { fonts, withheld, stoodIn } = await inputs.collectEpubFonts(config('Licensed Serif'), []);
    expect(fonts).toEqual([]);
    expect(withheld).toEqual(['Licensed Serif']);
    expect(stoodIn).toEqual([]);
  });

  it('names the stand-in of a withheld family only', () => {
    loader.setCustomFonts([
      { name: 'Licensed Serif', variants: [], redistributable: false, fallback: SERIF },
      { name: 'Open Serif', variants: [], fallback: SERIF },
    ]);
    expect(inputs.exportStandIn('Licensed Serif')).toBe(SERIF);
    // A family the book may hand on keeps its own files; it is not withheld.
    expect(inputs.exportStandIn('Open Serif')).toBeUndefined();
    expect(inputs.exportStandIn('Lora')).toBeUndefined();
    expect(inputs.epubSvgFonts().standIn?.('Licensed Serif')).toBe(SERIF);
  });
});
