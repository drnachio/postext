// Intrinsic sizes of SVG and bitmap files, read without a DOM.
import type { BundleImageSize, BitmapInfo, BitmapResolutionSource } from '../types.js';

// ---------------------------------------------------------------------------
// Intrinsic sizes, without a DOM

function parseSvgLength(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return null;
  const num = parseFloat(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = trimmed.replace(/^[\d.+-]+/, '').toLowerCase();
  const factor = unit === 'pt' ? 96 / 72 : unit === 'pc' ? 16 : unit === 'in' ? 96 : unit === 'cm' ? 96 / 2.54 : unit === 'mm' ? 96 / 25.4 : 1;
  return num * factor;
}

/** `markup` without its `<!-- … -->` comments; an unclosed one is left
 *  as it is (as `/<!--[\s\S]*?-->/g` would), read in one pass. */
function withoutComments(markup: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const open = markup.indexOf('<!--', at);
    const close = open < 0 ? -1 : markup.indexOf('-->', open + 4);
    if (close < 0) return out + markup.slice(at);
    out += markup.slice(at, open);
    at = close + 3;
  }
}

const isNameChar = (c: string | undefined): boolean => c !== undefined && /[\w:-]/.test(c);

/** The quoted attributes of a tag's inside, by name: what a global
 *  `/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/` finds, read in one pass. A
 *  name is only tried from the start of its run (a shorter one inside it
 *  fails the same way), so a long run of name characters with no `=`
 *  costs one step per character. */
function svgAttributes(inside: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = 0;
  while (i < inside.length) {
    if (!isNameChar(inside[i]) || isNameChar(inside[i - 1])) {
      i++;
      continue;
    }
    let j = i;
    while (isNameChar(inside[j])) j++;
    let k = j;
    while (k < inside.length && /\s/.test(inside[k]!)) k++;
    if (inside[k] === '=') {
      k++;
      while (k < inside.length && /\s/.test(inside[k]!)) k++;
      const quote = inside[k];
      const close = quote === '"' || quote === "'" ? inside.indexOf(quote, k + 1) : -1;
      if (close >= 0) {
        attrs[inside.slice(i, j)] = inside.slice(k + 1, close);
        i = close + 1;
        continue;
      }
    }
    i = j;
  }
  return attrs;
}

/** An SVG's intrinsic pixel size from its root element: explicit
 *  `width`/`height`, else the `viewBox` extent; undefined when neither
 *  gives one. Reads the markup textually, so it runs anywhere. */
export function svgSize(markup: string): BundleImageSize | undefined {
  const tag = /<svg\b([^>]*)>/i.exec(withoutComments(markup));
  if (!tag) return undefined;
  const attrs = svgAttributes(tag[1]!);
  const w = parseSvgLength(attrs.width);
  const h = parseSvgLength(attrs.height);
  if (w && h) return { width: w, height: h };
  const viewBox = attrs.viewBox;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }
  return undefined;
}

/** A bitmap's pixel size read from its header (PNG, JPEG, GIF, WebP), or
 *  undefined when the header is not recognised. */
export function bitmapSize(bytes: ArrayBuffer | Uint8Array): BundleImageSize | undefined {
  const info = bitmapInfo(bytes);
  return info ? { width: info.width, height: info.height } : undefined;
}

const INCH_PER_METRE = 0.0254;

/** ppi to two decimals: 11811 px/m reads as 300. */
function roundPpi(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The resolution of an EXIF block (a TIFF header and IFD0, `t` its first
 *  byte): `XResolution` / `YResolution` in `ResolutionUnit` (2 inch, the
 *  default; 3 cm). Undefined without them, or with unit 1 (none). */
function exifResolution(b: Uint8Array, t: number, end: number): { x: number; y: number } | undefined {
  if (t + 8 > end) return undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const order = String.fromCharCode(b[t]!, b[t + 1]!);
  if (order !== 'II' && order !== 'MM') return undefined;
  const le = order === 'II';
  if (view.getUint16(t + 2, le) !== 42) return undefined;
  const ifd = t + view.getUint32(t + 4, le);
  if (ifd + 2 > end) return undefined;
  const count = view.getUint16(ifd, le);
  let x: number | undefined;
  let y: number | undefined;
  let unit = 2;
  const rational = (entry: number): number | undefined => {
    if (view.getUint16(entry + 2, le) !== 5) return undefined;
    const at = t + view.getUint32(entry + 8, le);
    if (at + 8 > end) return undefined;
    const den = view.getUint32(at + 4, le);
    return den > 0 ? view.getUint32(at, le) / den : undefined;
  };
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) break;
    const tag = view.getUint16(entry, le);
    if (tag === 0x011a) x = rational(entry);
    else if (tag === 0x011b) y = rational(entry);
    else if (tag === 0x0128) unit = view.getUint16(entry + 8, le);
  }
  if (!x || !y || (unit !== 2 && unit !== 3)) return undefined;
  const k = unit === 3 ? 2.54 : 1;
  return { x: x * k, y: y * k };
}

/** A bitmap's pixel size and, when the file states one, its resolution
 *  (#631): PNG `pHYs` in pixels per metre (unit 0, an aspect ratio only,
 *  is ignored); JPEG JFIF density (dpi or dots per cm; units 0 ignored) and
 *  EXIF `XResolution` / `YResolution`, EXIF winning when both are there
 *  (Photoshop writes both and edits the EXIF one); WebP EXIF. GIF carries
 *  none. The value is returned as read: 72 or 96 ppi often means "no
 *  information" (see `layout.bitmapResolution: 'file'`). Undefined when the
 *  header is not recognised. */
export function bitmapInfo(bytes: ArrayBuffer | Uint8Array): BitmapInfo | undefined {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (at: number, len: number): string => String.fromCharCode(...b.subarray(at, at + len));
  const withResolution = (width: number, height: number, res?: { x: number; y: number }, source?: BitmapResolutionSource): BitmapInfo =>
    res && source && res.x > 0 && res.y > 0 && Number.isFinite(res.x) && Number.isFinite(res.y)
      ? { width, height, resolution: { x: roundPpi(res.x), y: roundPpi(res.y), source } }
      : { width, height };
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG') {
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    // Chunks after the signature; `pHYs` comes before the image data.
    let i = 8;
    while (i + 8 <= b.length) {
      const len = view.getUint32(i);
      const type = ascii(i + 4, 4);
      if (type === 'IDAT' || type === 'IEND') break;
      if (type === 'pHYs' && len >= 9 && i + 17 <= b.length) {
        if (b[i + 16] === 1) {
          return withResolution(width, height, { x: view.getUint32(i + 8) * INCH_PER_METRE, y: view.getUint32(i + 12) * INCH_PER_METRE }, 'pHYs');
        }
        break;
      }
      i += 12 + len;
    }
    return { width, height };
  }
  if (b.length >= 10 && ascii(0, 3) === 'GIF') {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
      // Flag bit 3: an EXIF chunk follows the image data.
      if (b[20]! & 0x08) {
        let i = 12;
        while (i + 8 <= b.length) {
          const size = view.getUint32(i + 4, true);
          if (ascii(i, 4) === 'EXIF') {
            let t = i + 8;
            const end = Math.min(b.length, t + size);
            // Some writers keep JPEG's "Exif\0\0" prefix.
            if (ascii(t, 4) === 'Exif') t += 6;
            return withResolution(w, h, exifResolution(b, t, end), 'exif');
          }
          i += 8 + size + (size & 1);
        }
      }
      return { width: w, height: h };
    }
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return undefined;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let jfif: { x: number; y: number } | undefined;
    let exif: { x: number; y: number } | undefined;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker === 0xff) { i++; continue; }
      // Start-of-frame markers carry the size (not DHT, JPG, DAC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const width = view.getUint16(i + 7);
        const height = view.getUint16(i + 5);
        if (exif) return withResolution(width, height, exif, 'exif');
        return withResolution(width, height, jfif, 'jfif');
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = view.getUint16(i + 2);
      const end = Math.min(b.length, i + 2 + len);
      if (marker === 0xe0 && !jfif && i + 16 <= end && ascii(i + 4, 5) === 'JFIF\0') {
        // Units: 1 dots per inch, 2 dots per cm, 0 an aspect ratio only.
        const units = b[i + 11];
        const x = view.getUint16(i + 12);
        const y = view.getUint16(i + 14);
        if ((units === 1 || units === 2) && x > 0 && y > 0) jfif = units === 2 ? { x: x * 2.54, y: y * 2.54 } : { x, y };
      } else if (marker === 0xe1 && !exif && i + 10 <= end && ascii(i + 4, 6) === 'Exif\0\0') {
        exif = exifResolution(b, i + 10, end);
      }
      i += 2 + len;
    }
  }
  return undefined;
}
