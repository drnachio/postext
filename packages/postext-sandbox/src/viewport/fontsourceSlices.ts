/**
 * The files a Fontsource face is served as, and the ones a text needs.
 *
 * Fontsource's CSS for one weight and style (`@fontsource/<id>/400.css`)
 * lists a face as several `@font-face` rules, one per file, each with the
 * `unicode-range` it covers: `latin`, `latin-ext`, `cyrillic`… for a Latin
 * family, and about a hundred numbered slices for a Chinese, Japanese or
 * Korean one (Noto Serif SC: 97 slices, some 14,500 characters). The
 * browser downloads the files the page's text touches; the PDF provider
 * picks the same files for the characters the document sets
 * (`PdfFontRequest.codePoints`), so a Chinese PDF embeds the slices it
 * draws from and nothing else (issue #196).
 */

/** One file of a face: its URL and the code point ranges it covers. */
export interface FontSlice {
  /** The subset name: `latin`, `latin-ext`, or a slice number (`119`). */
  name: string;
  url: string;
  ranges: Array<[number, number]>;
}

/** A CSS `unicode-range` value (`U+0000-00FF,U+0131,U+4E??`) as ranges. */
export function parseUnicodeRange(value: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const raw of value.split(',')) {
    const part = raw.trim().replace(/^u\+/i, '');
    if (!part) continue;
    if (part.includes('?')) {
      const lo = parseInt(part.replace(/\?/g, '0'), 16);
      const hi = parseInt(part.replace(/\?/g, 'f'), 16);
      if (Number.isFinite(lo) && Number.isFinite(hi)) out.push([lo, hi]);
      continue;
    }
    const [a, b] = part.split('-');
    const lo = parseInt(a!, 16);
    const hi = b === undefined ? lo : parseInt(b, 16);
    if (Number.isFinite(lo) && Number.isFinite(hi)) out.push([lo, hi]);
  }
  return out;
}

const FACE_RE = /@font-face\s*\{([^}]*)\}/g;
const WOFF2_RE = /url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)\s*format\(\s*['"]?woff2['"]?\s*\)/i;
const RANGE_RE = /unicode-range:\s*([^;]+);/i;

/** The `@font-face` rules of a Fontsource stylesheet, in the order it
 *  declares them, with their WOFF2 URLs resolved against `cssUrl`. A rule
 *  with no WOFF2 source is skipped; one with no `unicode-range` covers
 *  everything. */
export function parseFontsourceCss(css: string, cssUrl: string): FontSlice[] {
  const out: FontSlice[] = [];
  for (const match of css.matchAll(FACE_RE)) {
    const body = match[1]!;
    const src = WOFF2_RE.exec(body)?.[1];
    if (!src) continue;
    const url = new URL(src, cssUrl).href;
    const range = RANGE_RE.exec(body)?.[1];
    const file = url.slice(url.lastIndexOf('/') + 1);
    // `<id>-<name>-<weight>-<style>.woff2`; the id may hold dashes too, so
    // the name is read from the right.
    const name = /-([a-z0-9]+(?:-ext)?)-\d+-(?:normal|italic)\.woff2$/i.exec(file)?.[1] ?? file;
    out.push({ name, url, ranges: range ? parseUnicodeRange(range) : [[0, 0x10ffff]] });
  }
  return out;
}

function covers(slice: FontSlice, cp: number): boolean {
  for (const [lo, hi] of slice.ranges) if (cp >= lo && cp <= hi) return true;
  return false;
}

/**
 * The files of a face that hold `codePoints`, in the order a browser looks
 * them up: the last rule declared first (CSS Fonts 4 §4.5, where ranges
 * overlap), so `latin` wins the space and the ASCII letters that numbered
 * CJK slices repeat. With no code points (a face asked for before its text
 * is known), the `latin` file, or the last one declared. Characters no file
 * covers are left out: the PDF reports them as missing.
 */
export function pickSlices(slices: readonly FontSlice[], codePoints?: Iterable<number>): FontSlice[] {
  const order = [...slices].reverse();
  const picked = new Set<FontSlice>();
  for (const cp of codePoints ?? []) {
    if (cp < 0x20) continue;
    const hit = order.find((slice) => covers(slice, cp));
    if (hit) picked.add(hit);
  }
  if (picked.size === 0) {
    const fallback = order.find((slice) => slice.name === 'latin') ?? order[0];
    return fallback ? [fallback] : [];
  }
  return order.filter((slice) => picked.has(slice));
}
