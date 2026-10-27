// Resource bytes sniffed and turned into PNG, SVGs rasterised through
// the DOM, and the fonts an SVG names inlined for the raster
// (#1276: split out of renderResourceBlock.ts).
import type { PDFFont } from 'pdf-lib';
import { svgDeclaredFontFamilies, fontFaceRule, sniffFontFormat, injectSvgStyle } from 'postext';
import { parseFontString } from '../../../fontString.js';
import { FontCache, type PdfFontProvider, fontFilesOf, type PdfFontFile, declarationOf, inDeclarationOrder } from '../../../fontCache.js';
import { parseUnicodeRange } from '../../../unicodeRange.js';
import { widthOfTextAtSize } from '../../../faceFiles.js';
import { type VectorFontResolver, svgToVectorDrawing, type VectorFont } from '../../vector/svgVector.js';

/** Resolution of the raster fallback for SVGs the vector path cannot emit,
 *  relative to the figure's largest placement on the page. Diagrams are line
 *  art with small type, so this sits above the 300 dpi photographs need. */
export const RASTER_DPI = 600;

type Sniffed = 'pdf' | 'svg' | 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';

/** Identify a payload from its leading bytes. */
export function sniffBytes(bytes: Uint8Array): Sniffed {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'pdf'; // %PDF
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
  if (at(0) === 0xff && at(1) === 0xd8) return 'jpeg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'gif';
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46
    && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'webp';
  // SVG: optional BOM / whitespace, then `<` (XML declaration, comment,
  // doctype or the root element itself).
  let i = 0;
  if (at(0) === 0xef && at(1) === 0xbb && at(2) === 0xbf) i = 3;
  while (i < bytes.length && (at(i) === 0x20 || at(i) === 0x09 || at(i) === 0x0a || at(i) === 0x0d)) i++;
  if (at(i) === 0x3c) {
    const head = new TextDecoder().decode(bytes.subarray(i, Math.min(bytes.length, i + 4096)));
    if (/<svg[\s>]/i.test(head) || /^<\?xml/i.test(head) || head.startsWith('<!')) return 'svg';
  }
  return 'unknown';
}

/** A PNG of `bitmap`, drawn on whatever canvas the environment has (a
 *  worker has `OffscreenCanvas`, a document has both). */
async function bitmapToPng(bitmap: ImageBitmap): Promise<Uint8Array | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(bitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await pngBlob.arrayBuffer());
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const c2d = canvas.getContext('2d');
  if (!c2d) return null;
  c2d.drawImage(bitmap, 0, 0);
  const pngBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!pngBlob) return null;
  return new Uint8Array(await pngBlob.arrayBuffer());
}

/** Decode WebP bytes to PNG bytes via a canvas. Browser (or worker) only. */
export async function webpToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof createImageBitmap === 'undefined') return null;
  try {
    const blob = new Blob([bytes as BlobPart], { type: 'image/webp' });
    return await bitmapToPng(await createImageBitmap(blob));
  } catch {
    return null;
  }
}

/** Rasterises SVG markup to PNG bytes at a pixel size; null when it cannot. */
export type SvgRasterizer = (svgText: string, widthPx: number, heightPx: number) => Promise<Uint8Array | null>;

/** Rasterise SVG markup to PNG bytes at the given pixel size, through an
 *  `Image` and a canvas of the document. Browser main thread only (a
 *  worker cannot decode SVG); returns null elsewhere or when the SVG does
 *  not decode. The default {@link SvgRasterizer}. */
export async function rasterizeSvgWithDom(svgText: string, widthPx: number, heightPx: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Image === 'undefined') return null;
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = Math.max(1, Math.round(heightPx));
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Generic CSS families that never name a loadable font. */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial',
]);

/** A canvas font string for one family / weight / style (size is irrelevant
 *  to the cache key). */
function svgFontString(family: string, weight: number, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${weight} 16px ${family}`;
}

/** The character of a numeric reference; nothing for one out of range. */
function charOf(cp: number): string {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

/** The characters an SVG's text may set: those of its markup outside tags,
 *  entities decoded — more than its text nodes (a `<style>` sheet counts
 *  too), which only asks a sliced face for a file more. */
export function svgCodePoints(svgText: string): Set<number> {
  const text = svgText
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => charOf(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => charOf(parseInt(dec, 10)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (_, name: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[name] ?? '');
  const out = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0x20) out.add(cp);
  }
  out.add(0x20);
  return out;
}

/** Fonts an SVG's text would need, as font strings the {@link FontCache}
 *  can preload: every named (non-generic) family of each run, so the
 *  resolver can fall through the `font-family` list in order. */
export function collectSvgFontStrings(svgText: string): string[] {
  const wanted = new Set<string>();
  const probe: VectorFontResolver = (families, weight, italic) => {
    for (const f of families) if (!GENERIC_FAMILIES.has(f.toLowerCase())) wanted.add(svgFontString(f, weight, italic));
    return { widthOf: () => 0, pdfFont: null };
  };
  svgToVectorDrawing(svgText, { fonts: probe, probe: true });
  return [...wanted];
}

/** Resolve SVG font requests against the preloaded cache: the first named
 *  family of the list that loaded wins; generic families never match. */
export function fontResolverFor(fontCache: FontCache): VectorFontResolver {
  const fonts = new Map<PDFFont, VectorFont>();
  return (families, weight, italic) => {
    for (const f of families) {
      if (GENERIC_FAMILIES.has(f.toLowerCase())) continue;
      const pdfFont = fontCache.get(svgFontString(f, weight, italic));
      if (!pdfFont) continue;
      let vf = fonts.get(pdfFont);
      if (!vf) {
        vf = { pdfFont, widthOf: (text, size) => widthOfTextAtSize(pdfFont, text, size) };
        fonts.set(pdfFont, vf);
      }
      return vf;
    }
    return null;
  };
}

/** Before an SVG with text is rasterised through an `<img>` — which cannot
 *  see any page font — embed the faces its runs ask for as `@font-face` data
 *  URIs, fetched from the same provider the body text uses (#630: the
 *  engine's `fontFaceRule` / `injectSvgStyle`). Families the provider cannot
 *  supply are skipped (the image falls back to a system face, as the screen
 *  preview would), and so are those the SVG declares itself. */
export async function inlineSvgFontsForRaster(
  svgText: string,
  fontStrings: string[],
  provider: PdfFontProvider,
): Promise<string> {
  let css = '';
  const codePoints = svgCodePoints(svgText);
  const declared = new Set(svgDeclaredFontFamilies(svgText).map((f) => f.toLowerCase()));
  for (const fs of fontStrings) {
    const parsed = parseFontString(fs);
    if (!parsed || declared.has(parsed.family.toLowerCase())) continue;
    const answer = await provider(parsed.family, parsed.weight, parsed.style, { codePoints }).catch(() => null);
    // A face of several files is one @font-face per file: the browser
    // looks each character up in them in turn. Files given with their
    // ranges are declared as the page declared them, each rule with its
    // range and the one declared last at the end, so the picture takes a
    // character from the file the page did.
    const files = answer ? fontFilesOf(answer) : [];
    const rangesOf = (file: PdfFontFile) => {
      const unicodeRange = declarationOf(file)?.unicodeRange;
      return unicodeRange === undefined ? undefined : parseUnicodeRange(unicodeRange);
    };
    const ranged = files.some((file) => rangesOf(file) !== undefined);
    for (const bytes of ranged ? inDeclarationOrder(files) : files) {
      if (bytes.length === 0) continue;
      const rule = fontFaceRule(parsed.family, parsed.weight, parsed.style, bytes, sniffFontFormat(bytes) ?? 'ttf');
      const ranges = rangesOf(bytes);
      css += ranges && rule.endsWith('}')
        ? `${rule.slice(0, -1)};unicode-range:${ranges.map(([lo, hi]) => `U+${lo.toString(16)}${hi > lo ? `-${hi.toString(16)}` : ''}`).join(',')}}`
        : rule;
    }
  }
  return injectSvgStyle(svgText, css);
}
