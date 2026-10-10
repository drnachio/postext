// Fonts, pictures and identity shared by both renditions.

import { applySingleInkToSvg, chainSvgFontProviders, inlineSvgFontsDetailed, isHlsMimeType, parseUnicodeRange, resolveColorValue, type SvgFontProvider, type VDTDocument } from 'postext';
import type { EpubFontFile, EpubItem, EpubMetadata, EpubResourceBytes, EpubSvgFontOptions, EpubWarning } from '../types';
import { FONT_MEDIA_TYPES, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, sniffFontFormat, sniffImageType, sniffVideoType } from './media';
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
    // A face the book may not hand on stays out of the package.
    if (font.redistributable === false) continue;
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
      // A video's own file is no picture (its poster is the block's
      // `fileId`): see `placedVideoFileIds`.
      else if (key === 'video') continue;
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(doc.pages);
  return [...out];
}

/** The self-hosted videos (#454) the pages of `doc` place: their files'
 *  `fileId`, in order of first appearance. */
export function placedVideoFileIds(doc: VDTDocument): string[] {
  const out = new Set<string>();
  for (const page of doc.pages) {
    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])];
    for (const b of blocks) {
      const fileId = b.resourceBlock?.video?.fileId;
      if (fileId) out.add(fileId);
    }
  }
  return [...out];
}

/** The self-hosted videos (#454) the book does not carry but plays from
 *  their production address: manifest items of their own, as EPUB asks of
 *  every remote resource. */
export function remoteVideoItems(docs: readonly VDTDocument[], carried: ImageAssets): EpubItem[] {
  const out = new Map<string, EpubItem>();
  for (const doc of docs) {
    for (const page of doc.pages) {
      for (const b of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
        const v = b.resourceBlock?.video;
        // An HLS stream is shown as its linked poster, no resource of the book.
        if (!v || v.source !== 'file' || !v.link || out.has(v.link) || isHlsMimeType(v.mimeType)) continue;
        if (v.fileId && carried.hrefOf(v.fileId)) continue;
        out.set(v.link, { id: `remote-${out.size + 1}`, href: v.link, mediaType: v.mimeType ?? 'video/mp4', data: '', remote: true });
      }
    }
  }
  return [...out.values()];
}

/** The videos' files (#454), written under `media/`. `hrefOf` answers the
 *  href of a `fileId`, or undefined when the host had no bytes: the video
 *  then plays from its production address, or shows its poster. */
export async function videoAssets(
  docs: readonly VDTDocument[],
  resourceBytes: EpubResourceBytes | undefined,
): Promise<ImageAssets> {
  const fileIds = [...new Set(docs.flatMap(placedVideoFileIds))];
  const fetched = await Promise.all(fileIds.map(async (fileId) => ({ fileId, payload: await resourceBytes?.(fileId) })));
  const items: EpubItem[] = [];
  const hrefs = new Map<string, string>();
  const names = new Set<string>();
  for (const { fileId, payload } of fetched) {
    const mediaType = payload && payload.bytes.length > 0
      ? sniffVideoType(payload.bytes) ?? (payload.mediaType in VIDEO_EXTENSIONS ? payload.mediaType : undefined)
      : undefined;
    if (!payload || !mediaType) continue;
    const name = unique(slug(fileId.replace(/\.[a-z0-9]+$/i, '')), names);
    const href = `media/${name}.${VIDEO_EXTENSIONS[mediaType]!}`;
    items.push({ id: `vid-${name}`, href, mediaType, data: payload.bytes });
    hrefs.set(fileId, href);
  }
  return { items, hrefOf: (fileId) => hrefs.get(fileId) };
}

/** The ink SVG pictures are recoloured to, or null without single ink. */
export function singleInkOf(doc: VDTDocument | undefined): string | null {
  const ds = doc?.config?.diagramStyle;
  return ds?.singleInk ? resolveColorValue(ds.inkColor, doc!.config.colorPalette, ds.inkColor).hex : null;
}

function weightRange(weight: number | string): [number, number] {
  const [lo, hi] = String(weight).trim().split(/\s+/).map(Number);
  const a = Number.isFinite(lo) ? lo! : 400;
  const b = hi !== undefined && Number.isFinite(hi) ? hi : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** The book's fonts as an SVG font provider (#630): the cut nearest to the
 *  weight asked for, the same style first, and of a family served as
 *  unicode-range slices the files that hold the characters. Faces marked
 *  not redistributable are never answered. */
export function epubFontProvider(fonts: readonly EpubFontFile[]): SvgFontProvider {
  return async (family, weight, style, request) => {
    const lower = family.toLowerCase();
    const faces = fonts.filter((f) => f.family.toLowerCase() === lower && f.redistributable !== false && f.bytes.length > 0);
    if (faces.length === 0) throw new Error(`No face for "${family}"`);
    const sameStyle = faces.filter((f) => f.style === style);
    const pool = sameStyle.length > 0 ? sameStyle : faces;
    const dist = (f: EpubFontFile) => {
      const [lo, hi] = weightRange(f.weight);
      return weight < lo ? lo - weight : weight > hi ? weight - hi : 0;
    };
    const best = Math.min(...pool.map(dist));
    const cut = pool.filter((f) => dist(f) === best);
    const w0 = String(cut[0]!.weight);
    const codePoints = request?.codePoints;
    const files = cut.filter((f) => {
      if (String(f.weight) !== w0) return false;
      const ranges = parseUnicodeRange(f.unicodeRange);
      if (!ranges || !codePoints || codePoints.size === 0) return true;
      for (const cp of codePoints) {
        if (cp <= 0x20) continue;
        for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
      }
      return false;
    });
    if (files.length === 0) throw new Error(`No file of "${family}" holds the text`);
    return files.length === 1 ? files[0]!.bytes : files.map((f) => f.bytes);
  };
}

/** The SVG pictures that keep their markup as given: none under
 *  `diagramStyle.inlineFonts: false` (then `null`), else those of a
 *  resource with `svg.inlineFonts: false`. */
function svgKeepMarkup(docs: readonly VDTDocument[]): Set<string> | null {
  if (docs[0]?.config?.diagramStyle?.inlineFonts === false) return null;
  const keep = new Set<string>();
  for (const doc of docs) {
    for (const page of doc.pages) {
      for (const b of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
        const svg = b.resourceBlock?.resource?.svg;
        if (svg?.inlineFonts === false && svg.fileId) keep.add(svg.fileId);
      }
    }
  }
  return keep;
}

/** How a writer prepares SVG pictures: recolour, then inline the book's
 *  fonts. Built once per book. */
export interface SvgAssetPreparer {
  (fileId: string, svgText: string): Promise<string>;
}

/** The SVG preparer of a book (#630): single ink (`diagramStyle.singleInk`)
 *  first, then the faces the text names from `fonts` and
 *  `svgFonts.provider`, families marked not redistributable left out and
 *  reported once each as `fontWithheld`. */
export function svgAssetPreparer(
  docs: readonly VDTDocument[],
  fonts: readonly EpubFontFile[] | undefined,
  svgFonts: EpubSvgFontOptions | undefined,
  onWarning?: (warning: EpubWarning) => void,
): SvgAssetPreparer {
  const ink = singleInkOf(docs[0]);
  const keep = svgFonts?.inline === false ? null : svgKeepMarkup(docs);
  const list = fonts ?? [];
  const provider = chainSvgFontProviders(epubFontProvider(list), svgFonts?.provider);
  const notRedistributable = new Set<string>();
  const redistributable = new Set<string>();
  for (const f of list) (f.redistributable === false ? notRedistributable : redistributable).add(f.family.toLowerCase());
  const withhold = (family: string): boolean => {
    const lower = family.toLowerCase();
    return (notRedistributable.has(lower) && !redistributable.has(lower)) || !!svgFonts?.withhold?.(family);
  };
  const toldWithheld = new Set<string>();
  return async (fileId, svgText) => {
    let svg = ink ? applySingleInkToSvg(svgText, ink) : svgText;
    if (!keep || keep.has(fileId)) return svg;
    svg = (await inlineSvgFontsDetailed(svg, provider, {
      withhold,
      ...(svgFonts?.maxBytes !== undefined ? { maxBytes: svgFonts.maxBytes } : {}),
      onWithheld: (family) => {
        if (toldWithheld.has(family.toLowerCase())) return;
        toldWithheld.add(family.toLowerCase());
        onWarning?.({ kind: 'fontWithheld', family, fileId });
      },
      onWarning: (w) => onWarning?.(w.kind === 'svgFontUnavailable'
        ? { kind: 'svgFontUnavailable', fileId, family: w.family, weight: w.weight, style: w.style }
        : { kind: 'svgFontsTooLarge', fileId, bytes: w.bytes, maxBytes: w.maxBytes }),
    })).svg;
    return svg;
  };
}

/** The pictures' files. Single-ink diagrams (`diagramStyle.singleInk`) are
 *  recoloured once here, as the PDF recolours their markup, rather than
 *  tinted by a CSS filter readers may not apply: the host hands over the
 *  SVG source. SVGs then get the book's fonts their text names (#630). */
export async function imageAssets(
  docs: readonly VDTDocument[],
  resourceBytes: EpubResourceBytes | undefined,
  onWarning?: (warning: EpubWarning) => void,
  fonts?: { fonts?: readonly EpubFontFile[]; svgFonts?: EpubSvgFontOptions },
): Promise<ImageAssets> {
  const fileIds = [...new Set(docs.flatMap(placedFileIds))];
  const fetched = await Promise.all(fileIds.map(async (fileId) => ({ fileId, payload: await resourceBytes?.(fileId) })));
  const items: EpubItem[] = [];
  const hrefs = new Map<string, string>();
  const names = new Set<string>();
  const prepare = svgAssetPreparer(docs, fonts?.fonts, fonts?.svgFonts, onWarning);
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
    let data: Uint8Array | string = payload.bytes;
    if (mediaType === 'image/svg+xml') {
      // Bytes as given when nothing changed (a BOM and all).
      const text = new TextDecoder().decode(payload.bytes);
      const prepared = await prepare(fileId, text);
      if (prepared !== text) data = prepared;
    }
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
