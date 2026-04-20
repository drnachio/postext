import type { PdfFontProvider } from 'postext-pdf';
import { decompressWoff2 } from 'postext-pdf';
import { loadFont } from '../controls/fontLoader';

const bytesCache = new Map<string, Promise<Uint8Array>>();
const cssCache = new Map<string, Promise<string>>();

function cacheKey(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${family}|${weight}|${style}`;
}

function weightMatches(fw: string, target: number): boolean {
  const parts = fw
    .split(/\s+/)
    .map((p) => parseInt(p, 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return false;
  if (parts.length === 1) return parts[0] === target;
  const [min, max] = [parts[0]!, parts[parts.length - 1]!];
  return target >= min && target <= max;
}

interface FontFaceBlock {
  family: string;
  weight: string;
  style: string;
  src: string;
  unicodeRange: string;
}

function parseFontFaceBlocks(css: string): FontFaceBlock[] {
  const blocks: FontFaceBlock[] = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const body = m[1]!;
    const get = (prop: string): string => {
      const match = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'i'));
      return match ? match[1]!.trim() : '';
    };
    const family = get('font-family').replace(/^['"]|['"]$/g, '').trim();
    if (!family) continue;
    blocks.push({
      family,
      weight: get('font-weight') || '400',
      style: get('font-style') || 'normal',
      src: get('src'),
      unicodeRange: get('unicode-range'),
    });
  }
  return blocks;
}

function isLatinRange(unicodeRange: string): boolean {
  return /U\+0{0,2}0{0,2}-0{0,2}0FF/i.test(unicodeRange);
}

function fetchCss(url: string): Promise<string> {
  const existing = cssCache.get(url);
  if (existing) return existing;
  const p = fetch(url, { mode: 'cors' }).then(async (r) => {
    if (!r.ok) throw new Error(`css fetch failed: ${r.status} ${url}`);
    return r.text();
  });
  cssCache.set(url, p);
  return p;
}

async function collectCandidateCss(family: string): Promise<string[]> {
  const familyEncoded = encodeURIComponent(family).toLowerCase();
  const hrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => (link as HTMLLinkElement).href)
    .filter((href) => {
      if (!href.includes('fonts.googleapis.com')) return false;
      const lower = href.toLowerCase();
      return lower.includes(familyEncoded) || lower.includes(family.toLowerCase().replace(/\s/g, '+'));
    });
  const unique = Array.from(new Set(hrefs));
  return Promise.all(unique.map((h) => fetchCss(h).catch(() => '')));
}

async function findWoff2Urls(
  family: string,
  weight: number,
  style: 'normal' | 'italic',
): Promise<string[]> {
  const cssTexts = await collectCandidateCss(family);
  const latin: string[] = [];
  const other: string[] = [];
  for (const css of cssTexts) {
    const blocks = parseFontFaceBlocks(css);
    for (const block of blocks) {
      if (block.family.toLowerCase() !== family.toLowerCase()) continue;
      const normalizedStyle: 'normal' | 'italic' =
        block.style === 'italic' || block.style === 'oblique' ? 'italic' : 'normal';
      if (normalizedStyle !== style) continue;
      if (!weightMatches(block.weight, weight)) continue;
      const target = isLatinRange(block.unicodeRange) ? latin : other;
      const re = /url\(([^)]+)\)\s*format\((['"])?woff2\2?\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block.src)) !== null) {
        const raw = m[1]!.trim().replace(/^['"]|['"]$/g, '');
        target.push(raw);
      }
    }
  }
  // Prefer the Latin subset (U+0000-00FF) — it covers ASCII + common Western
  // punctuation that pdf-lib will encode. Other subsets lack these glyphs
  // and pdf-lib would render every character as notdef tofu.
  return [...latin, ...other];
}

async function fetchAndDecompress(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return decompressWoff2(buf);
}

/**
 * Factory for a `PdfFontProvider` backed by the Google Fonts stylesheets
 * injected by the sandbox's `loadFont()`. Cross-origin CSSOM is blocked, so
 * we fetch the CSS text over HTTP and parse `@font-face` blocks ourselves.
 */
export function createPdfFontProvider(): PdfFontProvider {
  return async (family, weight, style) => {
    const key = cacheKey(family, weight, style);
    const cached = bytesCache.get(key);
    if (cached) return cached;

    const promise = (async (): Promise<Uint8Array> => {
      await loadFont(family);

      let urls = await findWoff2Urls(family, weight, style);
      if (urls.length === 0 && style === 'italic') {
        urls = await findWoff2Urls(family, weight, 'normal');
      }
      if (urls.length === 0) {
        throw new Error(`no woff2 src for ${family} ${weight} ${style}`);
      }

      let lastErr: unknown = null;
      for (const url of urls) {
        try {
          return await fetchAndDecompress(url);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`failed to load font ${family} ${weight} ${style}`);
    })();

    bytesCache.set(key, promise);
    try {
      return await promise;
    } catch (err) {
      bytesCache.delete(key);
      throw err;
    }
  };
}
