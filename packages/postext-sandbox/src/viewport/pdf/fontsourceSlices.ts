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

/**
 * The major version of the `@fontsource/<id>` packages every file is taken
 * from (#757): the one the Cookbook kit pins (`cookbook/_kit/fonts.js`), so
 * a preview, the PDF made from it and a pen fetch the same URLs. `@latest`
 * would move to another major on its own, the kit staying behind.
 */
export const FONTSOURCE_PACKAGE_VERSION = '5';

const PACKAGE_URL = /^(https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource\/[a-z0-9-]+@)[^/]+(\/.*)$/;

/**
 * The exact version of a package an answer of jsDelivr came from (#766):
 * its `x-jsd-version` header, which the CDN lets a page of another origin
 * read (`access-control-expose-headers: *`). The range `@5` is a moving
 * name jsDelivr resolves for each URL on that URL's own clock: after a
 * release that cuts a family again (noto-sans-tc 5.3.1), its style sheets
 * came from one version and some of its files from two others, and the
 * characters no file then held fell to a font of the system. The version
 * the family's style sheet was answered from is the one every file of the
 * family is then asked of. Null when the answer does not say (a cache in
 * between, a test): the range stays, as before.
 */
export function fontsourceVersionOf(res: { headers?: { get?(name: string): string | null } } | null | undefined): string | null {
  const value = res?.headers?.get?.('x-jsd-version') ?? null;
  return value && /^\d+\.\d+\.\d+/.test(value) ? value : null;
}

/** `url` of a file of a Fontsource package, asked of `version` instead of
 *  the range it names; as it is for any other URL, or with no version. */
export function fontsourceUrlAt(url: string, version: string | null | undefined): string {
  if (!version) return url;
  const m = PACKAGE_URL.exec(url);
  return m ? `${m[1]}${version}${m[2]}` : url;
}

/** Fontsource's id of a family: `Source Serif 4` is `source-serif-4`. */
export function fontsourceId(family: string): string {
  return family.toLowerCase().replace(/\s+/g, '-');
}

/** The folder of a family's package on jsDelivr. */
function fontsourcePackageUrl(id: string): string {
  return `https://cdn.jsdelivr.net/npm/@fontsource/${id}@${FONTSOURCE_PACKAGE_VERSION}`;
}

/** Fontsource's stylesheet of one weight and style: every file of the face
 *  with its `unicode-range`. */
export function fontsourceCssUrl(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${fontsourcePackageUrl(fontsourceId(family))}/${weight}${style === 'italic' ? '-italic' : ''}.css`;
}

/** One file of a face: a subset (`latin`, `latin-ext`, a slice number) in
 *  a weight and a style. */
export function fontsourceFileUrl(family: string, subset: string, weight: number, style: 'normal' | 'italic'): string {
  const id = fontsourceId(family);
  return `${fontsourcePackageUrl(id)}/files/${id}-${subset}-${weight}-${style}.woff2`;
}

/** One file of a face: its URL and the code point ranges it covers. */
export interface FontSlice {
  /** The subset name: `latin`, `latin-ext`, or a slice number (`119`). */
  name: string;
  url: string;
  ranges: Array<[number, number]>;
  /** The `unicode-range` as the stylesheet writes it; unset when the rule
   *  has none. */
  unicodeRange?: string;
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
    out.push({ name, url, ranges: range ? parseUnicodeRange(range) : [[0, 0x10ffff]], ...(range ? { unicodeRange: range.trim() } : {}) });
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
