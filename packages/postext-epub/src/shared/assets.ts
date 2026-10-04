// Fonts, pictures and identity shared by both renditions.

import { applySingleInkToSvg, resolveColorValue, type VDTDocument } from 'postext';
import type { EpubFontFile, EpubItem, EpubMetadata, EpubResourceBytes, EpubWarning } from '../types';
import { FONT_MEDIA_TYPES, IMAGE_EXTENSIONS, sniffFontFormat, sniffImageType } from './media';
import { uuidV5 } from './uuid';

/** The embedded font files as manifest items under `fonts/` and the
 *  `@font-face` rules that declare them, with `url()`s relative to a
 *  stylesheet in `styles/` (`../fonts/…`). */
export interface FontAssets {
  items: EpubItem[];
  css: string;
  /** Families that have at least one face. */
  families: Set<string>;
}

/** A lower-case ASCII slug for file names and manifest ids. */
export function slug(text: string, max = 48): string {
  const s = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return s || 'x';
}

/** A name not in `taken` (adds it): `base`, else `base-2`, `base-3`… */
function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

const CSS_FORMAT: Record<EpubFontFile['format'], string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

/** A CSS string literal. */
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ')}"`;
}

export function fontAssets(fonts: readonly EpubFontFile[]): FontAssets {
  const items: EpubItem[] = [];
  const rules: string[] = [];
  const families = new Set<string>();
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const font of fonts) {
    // The bytes decide the format: a host that names a TrueType file
    // `woff2` would otherwise get an item EPUBCheck rejects.
    const format = sniffFontFormat(font.bytes) ?? font.format;
    const key = `${font.family}\u0000${font.weight}\u0000${font.style}\u0000${font.unicodeRange ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = unique(`${slug(font.family, 32)}-${slug(String(font.weight), 12)}-${font.style}`, names);
    const href = `fonts/${name}.${format}`;
    items.push({ id: `font-${name}`, href, mediaType: FONT_MEDIA_TYPES[format], data: font.bytes });
    families.add(font.family);
    rules.push(
      `@font-face {\n` +
      `  font-family: ${cssString(font.family)};\n` +
      `  font-weight: ${font.weight};\n` +
      `  font-style: ${font.style};\n` +
      `  src: url("../${href}") format("${CSS_FORMAT[format]}");\n` +
      (font.unicodeRange ? `  unicode-range: ${font.unicodeRange};\n` : '') +
      `}\n`,
    );
  }
  return { items, css: rules.join(''), families };
}

/** The pictures the documents place (resource bitmaps/SVGs, table-cell
 *  images, design images), each written once under `images/`. `hrefOf`
 *  answers the href (relative to the package document) of a `fileId`, or
 *  undefined when the host had no bytes (reported once as `missingImage`). */
export interface ImageAssets {
  items: EpubItem[];
  hrefOf(fileId: string): string | undefined;
}

/** Every `fileId` the pages of `doc` place, in order of first appearance:
 *  figures, table-cell images, callout icons and markers, design images of
 *  headers, footers, opener bands and heading designs. A walk over the page
 *  tree rather than a list of fields, so a picture a future block kind
 *  places is not left behind. (`pdfFileId` print masters are the PDF's
 *  business: the HTML renderers ask for `fileId`.) */
export function placedFileIds(doc: VDTDocument): string[] {
  const out = new Set<string>();
  const visited = new Set<object>();
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    for (const [key, v] of Object.entries(value)) {
      if (key === 'fileId' && typeof v === 'string' && v) out.add(v);
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(doc.pages);
  return [...out];
}

/** The ink SVG pictures are recoloured to, or null without single ink. */
export function singleInkOf(doc: VDTDocument | undefined): string | null {
  const ds = doc?.config?.diagramStyle;
  return ds?.singleInk ? resolveColorValue(ds.inkColor, doc!.config.colorPalette, ds.inkColor).hex : null;
}

/** The pictures' files. Single-ink diagrams (`diagramStyle.singleInk`) are
 *  recoloured once here, as the PDF recolours their markup, rather than
 *  tinted by a CSS filter readers may not apply: the host hands over the
 *  SVG source. */
export async function imageAssets(
  docs: readonly VDTDocument[],
  resourceBytes: EpubResourceBytes | undefined,
  onWarning?: (warning: EpubWarning) => void,
): Promise<ImageAssets> {
  const fileIds = [...new Set(docs.flatMap(placedFileIds))];
  const fetched = await Promise.all(fileIds.map(async (fileId) => ({ fileId, payload: await resourceBytes?.(fileId) })));
  const items: EpubItem[] = [];
  const hrefs = new Map<string, string>();
  const names = new Set<string>();
  const ink = singleInkOf(docs[0]);
  for (const { fileId, payload } of fetched) {
    const mediaType = payload && payload.bytes.length > 0
      ? sniffImageType(payload.bytes) ?? (payload.mediaType in IMAGE_EXTENSIONS ? payload.mediaType : undefined)
      : undefined;
    if (!payload || !mediaType) {
      onWarning?.({ kind: 'missingImage', fileId });
      continue;
    }
    const ext = IMAGE_EXTENSIONS[mediaType]!;
    const name = unique(slug(fileId.replace(/\.[a-z0-9]+$/i, '')), names);
    const href = `images/${name}.${ext}`;
    const data = mediaType === 'image/svg+xml' && ink
      ? applySingleInkToSvg(new TextDecoder().decode(payload.bytes), ink)
      : payload.bytes;
    items.push({ id: `img-${name}`, href, mediaType, data });
    hrefs.set(fileId, href);
  }
  return { items, hrefOf: (fileId) => hrefs.get(fileId) };
}

/** A bare ISBN-10/13 (digits, an X check digit, hyphens or spaces). */
const BARE_ISBN = /^(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx]$/;

/** The `dc:identifier` of the book: the given one (a bare ISBN becomes
 *  `urn:isbn:…`), else a stable `urn:uuid:` derived from the title,
 *  creators and language, so rebuilding a book keeps its identity. */
export function bookIdentifier(metadata: EpubMetadata): string {
  const given = metadata.identifier?.trim();
  if (given) return BARE_ISBN.test(given) ? `urn:isbn:${given.replace(/[-\s]/g, '').toUpperCase()}` : given;
  const name = ['postext-epub', metadata.title.trim(), ...(metadata.creators ?? []).map((c) => c.trim()), metadata.language.trim().toLowerCase()].join('\n');
  return `urn:uuid:${uuidV5(name)}`;
}

/** Page progression of the book: rtl for a right-bound book (Arabic,
 *  vertical Chinese), else ltr. */
export function pageProgressionOf(docs: readonly VDTDocument[]): 'ltr' | 'rtl' {
  return docs.some((d) => d.binding === 'right') ? 'rtl' : 'ltr';
}
