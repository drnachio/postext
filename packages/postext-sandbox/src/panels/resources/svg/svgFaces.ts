import { inlineSvgFontsDetailed, svgFontRequests, type SvgFontFaceReport } from 'postext';
import { sandboxSvgFontProvider } from '../../../controls/media/svgFontProvider.js';
import { getBlob } from '../../../storage/blobStore.js';

// The faces the text of an SVG resource names (#630), and what becomes of
// each when the picture is shown or exported.

/** One face as listed: its name and what became of it. */
export interface FaceRow {
  face: string;
  status: SvgFontFaceReport['status'] | 'kept';
  bytes?: number;
}

function faceName(f: { family: string; weight: number; style: string }): string {
  return `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`;
}

/** The faces of the SVG stored as `fileId`: inlined through the Sandbox's
 *  provider when `inline`, else only named. Empty when the file is missing
 *  or is no SVG. */
export async function readSvgFaces(fileId: string, inline: boolean): Promise<FaceRow[]> {
  const rec = await getBlob(fileId).catch(() => null);
  if (!rec || rec.contentType !== 'image/svg+xml') return [];
  const text = new TextDecoder().decode(rec.bytes);
  if (inline) {
    const result = await inlineSvgFontsDetailed(text, sandboxSvgFontProvider());
    return result.faces.map((f) => ({ face: faceName(f), status: f.status, ...(f.bytes !== undefined ? { bytes: f.bytes } : {}) }));
  }
  return svgFontRequests(text).map((r) => ({ face: faceName({ family: r.families[0]!, weight: r.weight, style: r.style }), status: 'kept' as const }));
}
