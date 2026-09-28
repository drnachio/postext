import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFontsourceCss, parseUnicodeRange, pickSlices } from './fontsourceSlices';

vi.mock('../controls/fontLoader', () => ({
  getCustomFontFamily: () => undefined,
  loadFont: async () => undefined,
}));
vi.mock('../storage/fontStorage', () => ({ getFontFile: async () => null }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

// Abridged from `@fontsource/noto-serif-tc@5/400.css`: numbered slices
// first, the named Latin subsets last.
const CSS = `
/* noto-serif-tc-[122]-400-normal */
@font-face {
  font-family: 'Noto Serif TC';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/noto-serif-tc-122-400-normal.woff2) format('woff2'), url(./files/noto-serif-tc-122-400-normal.woff) format('woff');
  unicode-range: U+d,U+2b,U+7c,U+a0,U+a9,U+300c-300d,U+4e4b,U+4e5f,U+ff01,U+ff08-ff09,U+ff1f;
}
/* noto-serif-tc-[123]-400-normal */
@font-face {
  font-family: 'Noto Serif TC';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/noto-serif-tc-123-400-normal.woff2) format('woff2'), url(./files/noto-serif-tc-123-400-normal.woff) format('woff');
  unicode-range: U+20-22,U+27-2a,U+2c-3b,U+3f,U+41-5d,U+61-7b,U+3002,U+4e00,U+ff0c,U+ff1a;
}
/* noto-serif-tc-latin-ext-400-normal */
@font-face {
  font-family: 'Noto Serif TC';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/noto-serif-tc-latin-ext-400-normal.woff2) format('woff2'), url(./files/noto-serif-tc-latin-ext-400-normal.woff) format('woff');
  unicode-range: U+0100-02BA,U+1E00-1E9F;
}
/* noto-serif-tc-latin-400-normal */
@font-face {
  font-family: 'Noto Serif TC';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/noto-serif-tc-latin-400-normal.woff2) format('woff2'), url(./files/noto-serif-tc-latin-400-normal.woff) format('woff');
  unicode-range: U+0000-00FF,U+0131,U+2000-206F;
}
`;
const CSS_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-tc@latest/400.css';
const cps = (text: string) => new Set([...text].map((ch) => ch.codePointAt(0)!));

describe('parseFontsourceCss', () => {
  it('reads every file with its name, absolute URL and ranges, in declaration order', () => {
    const slices = parseFontsourceCss(CSS, CSS_URL);
    expect(slices.map((s) => s.name)).toEqual(['122', '123', 'latin-ext', 'latin']);
    expect(slices[0]!.url).toBe('https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-tc@latest/files/noto-serif-tc-122-400-normal.woff2');
    expect(slices[3]!.ranges).toEqual([[0, 0xff], [0x131, 0x131], [0x2000, 0x206f]]);
  });

  it('reads wildcard ranges', () => {
    expect(parseUnicodeRange('U+4E??, u+30A0-30FF')).toEqual([[0x4e00, 0x4eff], [0x30a0, 0x30ff]]);
  });
});

describe('pickSlices', () => {
  const slices = parseFontsourceCss(CSS, CSS_URL);

  it('picks the slices a Chinese sentence touches, the last declared first', () => {
    // 也 之 「 」 ！ in [122]; 。 ， 一 in [123]; the space in latin.
    expect(pickSlices(slices, cps('一之也。「」，！ ')).map((s) => s.name)).toEqual(['latin', '123', '122']);
  });

  it('gives Latin text the latin file alone, and latin-ext for what latin lacks', () => {
    expect(pickSlices(slices, cps('Plain text.')).map((s) => s.name)).toEqual(['latin']);
    expect(pickSlices(slices, cps('Dvořák')).map((s) => s.name)).toEqual(['latin', 'latin-ext']);
  });

  it('falls back to the latin file when the characters are unknown', () => {
    expect(pickSlices(slices).map((s) => s.name)).toEqual(['latin']);
    expect(pickSlices(slices, []).map((s) => s.name)).toEqual(['latin']);
  });
});

describe('createPdfFontProvider (#196)', () => {
  const fetched: string[] = [];
  /** Files (by URL) whose next fetches fail with a 503, and how many. */
  const failing = new Map<string, number>();
  /** Stylesheet URLs whose next fetch throws (a network error). */
  const unreachable = new Set<string>();
  /** A file of the stub stylesheet, served from `family`'s package. */
  const fileUrl = (family: string, slice: string) => `https://cdn.jsdelivr.net/npm/@fontsource/${family}@latest/files/noto-serif-tc-${slice}-400-normal.woff2`;
  const names = (files: Uint8Array | Uint8Array[]) => (Array.isArray(files) ? files : [files]).map((b) => new TextDecoder().decode(b));
  beforeEach(() => {
    fetched.length = 0;
    failing.clear();
    unreachable.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      if (url.startsWith('https://api.fontsource.org/')) return new Response(JSON.stringify({ weights: [400, 700] }));
      if (unreachable.delete(url)) throw new TypeError('Failed to fetch');
      if (url.endsWith('/400.css')) return new Response(CSS);
      if (url.endsWith('.css')) return new Response('', { status: 404 });
      const left = failing.get(url) ?? 0;
      if (left > 0) {
        failing.set(url, left - 1);
        return new Response('', { status: 503 });
      }
      return new Response(new TextEncoder().encode(url.slice(url.lastIndexOf('/') + 1)));
    });
  });

  it('answers a Chinese face with the slices of its characters', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider');
    const provider = createPdfFontProvider();
    const files = await provider('Noto Serif TC', 400, 'normal', { codePoints: cps('之也，') });
    const names = (Array.isArray(files) ? files : [files]).map((b) => new TextDecoder().decode(b));
    expect(names).toEqual(['noto-serif-tc-123-400-normal.woff2', 'noto-serif-tc-122-400-normal.woff2']);
    // A face with no italic stylesheet sets its italic from the upright files.
    const italic = await provider('Noto Serif TC', 400, 'italic', { codePoints: cps('Ab') });
    expect((Array.isArray(italic) ? italic : [italic]).map((b) => new TextDecoder().decode(b))).toEqual(['noto-serif-tc-latin-400-normal.woff2']);
    expect(fetched.filter((u) => u.endsWith('.css'))).toContain('https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-tc@latest/400-italic.css');
  });

  it('fetches a file that failed once again, and leaves out one that fails twice', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider');
    const provider = createPdfFontProvider();
    failing.set(fileUrl('noto-sans-tc', '122'), 1);
    expect(names(await provider('Noto Sans TC', 400, 'normal', { codePoints: cps('之也，') }))).toEqual([
      'noto-serif-tc-123-400-normal.woff2',
      'noto-serif-tc-122-400-normal.woff2',
    ]);
    // One file down for good: the face keeps the others; the PDF reports
    // the characters of the missing one.
    failing.set(fileUrl('noto-sans-sc', '122'), 2);
    expect(names(await provider('Noto Sans SC', 400, 'normal', { codePoints: cps('之也，') }))).toEqual([
      'noto-serif-tc-123-400-normal.woff2',
    ]);
    expect(fetched.filter((u) => u === fileUrl('noto-sans-sc', '122'))).toHaveLength(2);
  });

  it('rejects the face only when none of its files can be had', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider');
    const provider = createPdfFontProvider();
    failing.set(fileUrl('noto-serif-jp', '122'), 2);
    failing.set(fileUrl('noto-serif-jp', '123'), 2);
    await expect(provider('Noto Serif JP', 400, 'normal', { codePoints: cps('之也，') })).rejects.toThrow(/none of the 2 file/);
  });

  it('remembers a stylesheet the CDN does not have, and fetches one it could not reach again', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider');
    const provider = createPdfFontProvider();
    const italicCss = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@latest/400-italic.css';
    await provider('Noto Serif SC', 400, 'italic', { codePoints: cps('Ab') });
    await provider('Noto Serif SC', 400, 'italic', { codePoints: cps('Cd') });
    expect(fetched.filter((u) => u === italicCss)).toHaveLength(1);
    const uprightCss = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@latest/400.css';
    unreachable.add(uprightCss);
    await provider('Noto Sans JP', 400, 'normal', { codePoints: cps('Ab') });
    expect(names(await provider('Noto Sans JP', 400, 'normal', { codePoints: cps('之') }))).toEqual(['noto-serif-tc-122-400-normal.woff2']);
    expect(fetched.filter((u) => u === uprightCss)).toHaveLength(2);
  });
});
