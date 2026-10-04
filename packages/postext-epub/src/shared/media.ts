// Media types of the pictures and fonts a book embeds, read from their
// bytes: a host's declared type can be wrong (an SVG served as a PNG), and
// EPUBCheck rejects an item whose bytes do not match its manifest type.

/** The EPUB core media types of pictures, and the file extension of each. */
export const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** The EPUB core media types of fonts, by file format. */
export const FONT_MEDIA_TYPES: Readonly<Record<'woff2' | 'woff' | 'ttf' | 'otf', string>> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

const startsWith = (bytes: Uint8Array, sig: readonly number[], at = 0): boolean =>
  bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** The picture media type of `bytes`, or undefined when they are none of
 *  PNG, JPEG, GIF, WebP or SVG. */
export function sniffImageType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  // SVG: markup (after a BOM, an XML declaration, comments or a doctype)
  // whose root is <svg.
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^﻿/, '');
  if (/^\s*</.test(head) && /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return undefined;
}

/** The font format of `bytes` (WOFF2, WOFF, TrueType or CFF OpenType), or
 *  undefined when they are none. */
export function sniffFontFormat(bytes: Uint8Array): 'woff2' | 'woff' | 'ttf' | 'otf' | undefined {
  if (startsWith(bytes, ascii('wOF2'))) return 'woff2';
  if (startsWith(bytes, ascii('wOFF'))) return 'woff';
  if (startsWith(bytes, ascii('OTTO'))) return 'otf';
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || startsWith(bytes, ascii('true'))) return 'ttf';
  return undefined;
}
