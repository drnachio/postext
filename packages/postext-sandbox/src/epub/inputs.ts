// What the EPUB writer is handed besides the laid-out chapters and the
// metadata (./metadata.ts): the book's fonts as files, the bytes of its
// pictures and a cover. Gathered in the browser from the Sandbox's own
// stores.

import type { PostextConfig, VDTDocument } from 'postext';
import type { EpubCover, EpubFontFile, EpubResourceBytes } from 'postext-epub';
import { collectFontPayloadsForFamilies, getConfigFontFamilies, getCustomFontFamily } from '../controls/fontLoader';
import { inlineSvgFonts } from '../controls/svgFonts';
import { getBlob } from '../storage/blobStore';
import { documentCodePoints, facesForText, fontFormatOf } from './fontSubsets';

/** The fonts the EPUB embeds: every face of every family the
 *  configuration names (Google slices only where the text needs them),
 *  except custom families that may not be handed on — named in
 *  `withheld`. */
export async function collectEpubFonts(
  config: PostextConfig,
  docs: readonly VDTDocument[],
): Promise<{ fonts: EpubFontFile[]; withheld: string[] }> {
  const families = getConfigFontFamilies(config);
  const withheld = families.filter((f) => getCustomFontFamily(f)?.redistributable === false);
  const payloads = await collectFontPayloadsForFamilies(families.filter((f) => !withheld.includes(f)));
  const faces = facesForText(payloads, documentCodePoints(docs));
  const fonts = faces
    .filter((p) => p.buffer.byteLength > 0)
    .map((p): EpubFontFile => {
      const bytes = new Uint8Array(p.buffer);
      return {
        family: p.family,
        weight: p.weight,
        style: p.style === 'italic' || p.style === 'oblique' ? 'italic' : 'normal',
        bytes,
        format: fontFormatOf(bytes),
        ...(p.unicodeRange ? { unicodeRange: p.unicodeRange } : {}),
      };
    });
  return { fonts, withheld };
}

/** The pictures' bytes from the blob store: bitmaps as stored, SVGs as
 *  their source with the Sandbox's custom fonts inlined (an image cannot
 *  see the book's fonts). Single ink is the writer's: it recolours the
 *  source. Never the PDF print master. */
export function epubResourceBytes(): EpubResourceBytes {
  return async (fileId) => {
    const rec = await getBlob(fileId).catch(() => null);
    if (!rec) return undefined;
    if (rec.contentType !== 'image/svg+xml') return { bytes: new Uint8Array(rec.bytes), mediaType: rec.contentType };
    const svg = await inlineSvgFonts(new TextDecoder().decode(rec.bytes));
    return { bytes: new TextEncoder().encode(svg), mediaType: 'image/svg+xml' };
  };
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
