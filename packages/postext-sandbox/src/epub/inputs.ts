// What the EPUB writer is handed besides the laid-out chapters and the
// metadata (./metadata.ts): the book's fonts as files, the bytes of its
// pictures and a cover. Gathered in the browser from the Sandbox's own
// stores.

import { baseFontFamily, documentFontFaces, exportStandInOf, type PostextConfig, type VDTDocument } from 'postext';
import type { EpubCover, EpubFontFile, EpubResourceBytes, EpubSvgFontOptions } from 'postext-epub';
import { collectFontPayloadsForFaces, configFontUses, getConfigFontFamilies, getCustomFontFamily, listCustomFontFamilies } from '../controls/fonts/fontLoader.js';
import { sandboxSvgFontProvider, withholdNonRedistributable } from '../controls/media/svgFontProvider.js';
import { getBlob } from '../storage/blobStore.js';
import { documentCodePoints, facesForText, fontFormatOf } from './fontSubsets.js';

/** The open family that is set under the name of `family` in a file that
 *  leaves the app (#993): the `fallback` of a custom family marked as not
 *  redistributable. Undefined for any other family. */
export function exportStandIn(family: string): string | undefined {
  return exportStandInOf(listCustomFontFamilies(), family);
}

/** The fonts the EPUB embeds: for every family the configuration names,
 *  the weights and slants it asks for and the ones the pages are set in,
 *  each in the files that hold the text's characters (a catalogue family
 *  is a file per weight, style and subset, #757); every file of a custom
 *  family, except those that may not be handed on. A family that may not
 *  be handed on and names a `fallback` is embedded in the fallback's faces
 *  of the same weights and slants, under its own name (`stoodIn`, #993);
 *  one without, or whose fallback gave no file, is `withheld` and left to
 *  the reading system. */
export async function collectEpubFonts(
  config: PostextConfig,
  docs: readonly VDTDocument[],
  /** The book's text: it names faces too (comic lettering, a comic
   *  line's own `font=`, #696). */
  markdown?: readonly string[],
): Promise<{ fonts: EpubFontFile[]; withheld: string[]; stoodIn: { family: string; standIn: string }[] }> {
  const families = getConfigFontFamilies(config, markdown);
  const notHanded = families.filter((f) => getCustomFontFamily(f)?.redistributable === false);
  const codePoints = documentCodePoints(docs);
  // A feature family (a style's figures, #1237) is set in the EPUB as its
  // base family with `font-variant-numeric`: its base family's files.
  const uses = [
    ...[...configFontUses(config, markdown)].flatMap(([family, list]) => list.map((use) => ({ family, ...use }))),
    ...docs.flatMap((doc) => documentFontFaces(doc)),
  ].map((face) => ({ ...face, family: baseFontFamily(face.family) }));
  const asked = uses.filter((face) => !notHanded.includes(face.family));
  // The faces of the families left out, asked of their stand-ins.
  const standOf = new Map(notHanded.flatMap((family): [string, string][] => {
    const standIn = exportStandIn(family);
    return standIn ? [[family, standIn]] : [];
  }));
  const standAsked = uses.filter((face) => standOf.has(face.family)).map((face) => ({ family: standOf.get(face.family)!, weight: face.weight, style: face.style }));
  const [payloads, standPayloads] = await Promise.all([
    collectFontPayloadsForFaces(asked, codePoints),
    standAsked.length > 0 ? collectFontPayloadsForFaces(standAsked, codePoints) : Promise.resolve([]),
  ]);
  const toFile = (p: (typeof payloads)[number], family: string): EpubFontFile => {
    const bytes = new Uint8Array(p.buffer);
    return {
      family,
      weight: p.weight,
      style: p.style === 'italic' || p.style === 'oblique' ? 'italic' : 'normal',
      bytes,
      format: fontFormatOf(bytes),
      ...(p.unicodeRange ? { unicodeRange: p.unicodeRange } : {}),
    };
  };
  const fonts = facesForText(payloads, codePoints).filter((p) => p.buffer.byteLength > 0).map((p) => toFile(p, p.family));
  const stoodIn: { family: string; standIn: string }[] = [];
  const withheld = notHanded.filter((family) => !standOf.has(family));
  for (const [family, standIn] of standOf) {
    // The stand-in's files, set under the licensed family's name.
    const mine = standPayloads.filter((p) => p.family === standIn);
    const files = facesForText(mine, codePoints).filter((p) => p.buffer.byteLength > 0).map((p) => toFile({ ...p, buffer: p.buffer.slice(0) }, family));
    if (files.length === 0) withheld.push(family);
    else {
      fonts.push(...files);
      stoodIn.push({ family, standIn });
    }
  }
  return { fonts, withheld, stoodIn };
}

/** The pictures' bytes from the blob store, as stored: the EPUB writer
 *  recolours single-ink SVGs and embeds the book's fonts in them
 *  (`svgFonts`, #630), leaving out the families marked as not
 *  redistributable. Never the PDF print master. */
export function epubResourceBytes(): EpubResourceBytes {
  return async (fileId) => {
    const rec = await getBlob(fileId).catch(() => null);
    if (!rec) return undefined;
    return { bytes: new Uint8Array(rec.bytes), mediaType: rec.contentType };
  };
}

/** How the EPUB writer embeds fonts in the SVG pictures (#630): from the
 *  book's fonts, then the Sandbox's provider (custom families, then
 *  Google), never a family marked as not redistributable: that one's text
 *  is set in its `fallback` when it names one (#993). */
export function epubSvgFonts(): EpubSvgFontOptions {
  return { provider: sandboxSvgFontProvider(), withhold: withholdNonRedistributable, standIn: exportStandIn };
}

/** Narrowest cover picture taken as the book's cover: the Books panel's
 *  own captures (240 px) and the like are previews, not covers. */
export const MIN_COVER_WIDTH = 600;
/** Width of a cover rendered from the book's first page. */
export const RENDERED_COVER_WIDTH = 1600;

const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** A cover picture, when it is a bitmap at least {@link MIN_COVER_WIDTH}
 *  wide (SVG previews and small captures are left for the rendered page). */
export async function usableCover(bytes: ArrayBuffer, mime: string, alt: string): Promise<EpubCover | null> {
  if (!COVER_TYPES.has(mime) || typeof createImageBitmap === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const wide = bitmap.width >= MIN_COVER_WIDTH;
    bitmap.close();
    return wide ? { bytes: new Uint8Array(bytes), mediaType: mime as EpubCover['mediaType'], alt } : null;
  } catch {
    return null;
  }
}

/** The book's own cover picture, if it has one: the project's, else the
 *  sample book's shipped one. */
export async function bookCoverPicture(source: { projectThumbnail?: { fileId: string; mime: string }; presetThumbnailUrl?: string }): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (source.projectThumbnail) {
    const rec = await getBlob(source.projectThumbnail.fileId).catch(() => null);
    return rec ? { bytes: rec.bytes, mime: rec.contentType || source.projectThumbnail.mime } : null;
  }
  if (!source.presetThumbnailUrl || typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(source.presetThumbnailUrl);
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    return { bytes: await res.arrayBuffer(), mime };
  } catch {
    return null;
  }
}
