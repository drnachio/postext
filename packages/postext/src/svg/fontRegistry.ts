// The font files the host has, for SVG pictures (#630).
//
// A `FontFace` made from bytes keeps no bytes, and one made from a URL does
// not say which, so the engine cannot read the faces of `document.fonts`
// back. This registry holds them: `loadBundleFonts` registers a bundle's
// faces, and hosts register theirs (`registerFontBytes`, or
// `registerFontUrl` for a file fetched on demand). `registeredFontProvider`
// answers `inlineSvgFonts` from it, then from the `@font-face` rules of the
// page's readable style sheets (their files fetched; same-origin or CORS in
// practice, as Fontsource's and Google's are).

import type { SvgFontProvider, SvgFontStyle, SvgFontSyncProvider } from './fonts';

export interface RegisterFontOptions {
  /** CSS `unicode-range` of the file (`U+0000-00FF, U+0131`): a slice of a
   *  family served as several files is handed out only for text that
   *  needs it. Absent: the file covers every character. */
  unicodeRange?: string;
}

interface Entry {
  family: string;
  /** Weight, or the range of a variable face. */
  weight: [number, number];
  style: SvgFontStyle;
  ranges: [number, number][] | null;
  bytes?: Uint8Array;
  url?: string;
}

const entries: Entry[] = [];
let generation = 0;

/** Parse a CSS `unicode-range` into code point intervals; null when it
 *  reads as nothing. */
export function parseUnicodeRange(value: string | undefined): [number, number][] | null {
  if (!value) return null;
  const out: [number, number][] = [];
  for (const part of value.split(',')) {
    const m = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part);
    if (!m) continue;
    if (m[1]!.includes('?')) {
      out.push([parseInt(m[1]!.replace(/\?/g, '0'), 16), parseInt(m[1]!.replace(/\?/g, 'f'), 16)]);
    } else {
      const lo = parseInt(m[1]!, 16);
      out.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
    }
  }
  return out.length > 0 ? out : null;
}

function covers(ranges: [number, number][] | null, codePoints: ReadonlySet<number> | undefined): boolean {
  if (!ranges || !codePoints || codePoints.size === 0) return true;
  for (const cp of codePoints) {
    if (cp <= 0x20) continue;
    for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function weightRange(weight: number | string): [number, number] {
  if (typeof weight === 'number') return [weight, weight];
  const parts = weight.trim().split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)));
  const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

function styleOf(style: string | undefined): SvgFontStyle {
  return style && /italic|oblique/i.test(style) ? 'italic' : 'normal';
}

function register(entry: Entry): void {
  const same = entries.findIndex((e) =>
    e.family.toLowerCase() === entry.family.toLowerCase()
    && e.weight[0] === entry.weight[0] && e.weight[1] === entry.weight[1]
    && e.style === entry.style
    && JSON.stringify(e.ranges) === JSON.stringify(entry.ranges));
  if (same >= 0) entries.splice(same, 1, entry);
  else entries.push(entry);
  generation++;
}

/** Register the bytes of a face (TrueType, OpenType, WOFF or WOFF2) for
 *  SVG pictures to embed. `weight` is a number or a variable range
 *  (`'100 900'`). Registering the same face again replaces it. */
export function registerFontBytes(
  family: string,
  weight: number | string,
  style: SvgFontStyle | string,
  bytes: Uint8Array | ArrayBuffer,
  options?: RegisterFontOptions,
): void {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  register({ family, weight: weightRange(weight), style: styleOf(style), ranges: parseUnicodeRange(options?.unicodeRange), bytes: data });
}

/** Register a face by the URL of its file, fetched the first time an SVG
 *  needs it (a slice only when the SVG sets characters in its
 *  `unicodeRange`). */
export function registerFontUrl(
  family: string,
  weight: number | string,
  style: SvgFontStyle | string,
  url: string,
  options?: RegisterFontOptions,
): void {
  register({ family, weight: weightRange(weight), style: styleOf(style), ranges: parseUnicodeRange(options?.unicodeRange), url });
}

/** Forget every registered face of a family. */
export function unregisterFontFamily(family: string): void {
  const lower = family.toLowerCase();
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i]!.family.toLowerCase() === lower) entries.splice(i, 1);
  generation++;
}

/** Forget every registered face. */
export function clearRegisteredFonts(): void {
  entries.length = 0;
  generation++;
}

/** A counter bumped by every registration change: hosts that cache
 *  SVG markup with fonts inlined key it with this. */
export function registeredFontGeneration(): number {
  return generation;
}

function distance(w: [number, number], target: number): number {
  return target < w[0] ? w[0] - target : target > w[1] ? target - w[1] : 0;
}

/** The registered files of the cut nearest to (weight, style) — the same
 *  style first — that hold the characters asked for. */
function pick(list: readonly Entry[], weight: number, style: SvgFontStyle, codePoints?: ReadonlySet<number>): Entry[] {
  if (list.length === 0) return [];
  const sameStyle = list.filter((e) => e.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : list;
  const best = Math.min(...pool.map((e) => distance(e.weight, weight)));
  const cut = pool.filter((e) => distance(e.weight, weight) === best);
  // The nearest cut may be heavier and lighter alike: keep one weight.
  const w0 = cut[0]!.weight;
  return cut.filter((e) => e.weight[0] === w0[0] && e.weight[1] === w0[1] && covers(e.ranges, codePoints));
}

function familyEntries(family: string): Entry[] {
  const lower = family.toLowerCase();
  return entries.filter((e) => e.family.toLowerCase() === lower);
}

const fetched = new Map<string, Promise<Uint8Array>>();

function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const cached = fetched.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  })();
  fetched.set(url, promise);
  promise.catch(() => fetched.delete(url));
  return promise;
}

/** The bytes a fetched URL entry gave, if any (for the sync provider). */
const settled = new Map<string, Uint8Array>();

/** The first `url(...)` of an `@font-face` `src` with a format an image
 *  can use (a `local()` source is skipped). */
function srcUrl(src: string, base: string | undefined): string | null {
  for (const m of src.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/g)) {
    const url = m[1] ?? m[2] ?? m[3] ?? '';
    const format = (m[4] ?? '').toLowerCase();
    if (!url) continue;
    if (format && !/^(woff2|woff|truetype|opentype)(-variations)?$/.test(format)) continue;
    try {
      return base ? new URL(url, base).href : url;
    } catch {
      return url;
    }
  }
  return null;
}

/** `@font-face` rules of the document's readable style sheets, as
 *  registry entries (cross-origin sheets without CORS cannot be read and
 *  are skipped). */
function styleSheetEntries(): Entry[] {
  if (typeof document === 'undefined' || !document.styleSheets) return [];
  const out: Entry[] = [];
  const visit = (rules: CSSRuleList | undefined, base: string | undefined, depth: number): void => {
    if (!rules || depth > 8) return;
    for (const rule of Array.from(rules)) {
      const r = rule as CSSRule & { style?: CSSStyleDeclaration; cssRules?: CSSRuleList; styleSheet?: CSSStyleSheet };
      if (r.constructor?.name === 'CSSFontFaceRule' || r.type === 5) {
        const style = r.style;
        if (!style) continue;
        const family = style.getPropertyValue('font-family').trim().replace(/^(['"])(.*)\1$/, '$2');
        const url = srcUrl(style.getPropertyValue('src'), base);
        if (!family || !url) continue;
        out.push({
          family,
          weight: weightRange(style.getPropertyValue('font-weight') || 400),
          style: styleOf(style.getPropertyValue('font-style')),
          ranges: parseUnicodeRange(style.getPropertyValue('unicode-range')),
          url,
        });
      } else if (r.styleSheet) {
        let nested: CSSRuleList | undefined;
        try {
          nested = r.styleSheet.cssRules;
        } catch {
          nested = undefined;
        }
        visit(nested, r.styleSheet.href ?? base, depth + 1);
      } else if (r.cssRules) {
        visit(r.cssRules, base, depth + 1);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    visit(rules, sheet.href ?? document.baseURI, 0);
  }
  return out;
}

export interface RegisteredFontProviderOptions {
  /** Also read the `@font-face` rules of the page's style sheets for a
   *  family nothing registered. Default true (in a browser). */
  styleSheets?: boolean;
  /** The `fetch` used for URL faces. Default the global one. */
  fetch?: typeof fetch;
}

/** An `inlineSvgFonts` provider over the registered faces
 *  ({@link registerFontBytes}, {@link registerFontUrl}), then the page's
 *  `@font-face` rules: the cut nearest to the weight asked for, the same
 *  style first, and of a family served as unicode-range slices only the
 *  files that hold the characters. */
export function registeredFontProvider(options?: RegisteredFontProviderOptions): SvgFontProvider {
  const fetchImpl = options?.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
  const useSheets = options?.styleSheets ?? true;
  return async (family, weight, style, request) => {
    let found = pick(familyEntries(family), weight, style, request?.codePoints);
    if (found.length === 0 && useSheets && familyEntries(family).length === 0) {
      const lower = family.toLowerCase();
      found = pick(styleSheetEntries().filter((e) => e.family.toLowerCase() === lower), weight, style, request?.codePoints);
    }
    if (found.length === 0) throw new Error(`No registered face for "${family}"`);
    const files = await Promise.all(found.map(async (e) => {
      if (e.bytes) return e.bytes;
      if (!e.url || !fetchImpl) return null;
      try {
        const bytes = await fetchBytes(e.url, fetchImpl);
        settled.set(e.url, bytes);
        return bytes;
      } catch {
        return null;
      }
    }));
    const got = files.filter((f): f is Uint8Array => f !== null);
    if (got.length === 0) throw new Error(`The files of "${family}" could not be had`);
    return got.length === 1 ? got[0]! : got;
  };
}

/** The registry's faces held in memory: registered bytes, and URL faces
 *  once fetched. For synchronous hosts (`renderToHtml`). */
export function registeredFontSyncProvider(): SvgFontSyncProvider {
  return (family, weight, style, request) => {
    const found = pick(familyEntries(family), weight, style, request?.codePoints);
    const got = found.map((e) => e.bytes ?? (e.url ? settled.get(e.url) : undefined)).filter((b): b is Uint8Array => !!b);
    return got.length === 0 ? null : got.length === 1 ? got[0]! : got;
  };
}
