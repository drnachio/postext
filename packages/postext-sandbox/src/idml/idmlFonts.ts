// The fonts of an IDML export, from what the Sandbox has loaded: the
// files of the faces the laid-out book is set in (custom families from
// the browser's store, catalogue families from where the previews take
// them), and which families may not be handed on.

import type { VDTDocument } from 'postext';
import { withholdNonRedistributable } from '../controls/media/svgFontProvider.js';
import { documentCodePoints } from '../epub/fontSubsets.js';
import { createPdfFontProvider } from '../viewport/pdf/pdfFontProvider.js';
import { idmlFaces, type IdmlFace } from './idmlExport.js';

/** The font files of the book's faces, TrueType or OpenType (the PDF's
 *  provider decodes WOFF2). A face with no file is left out. */
export function sandboxIdmlFaces(docs: readonly VDTDocument[]): Promise<IdmlFace[]> {
  return idmlFaces(docs, createPdfFontProvider(), documentCodePoints(docs));
}

/** A custom family marked `redistributable: false`: named in the package,
 *  its files kept out of `Document fonts`. */
export const idmlFontWithheld = (family: string): boolean => withholdNonRedistributable(family);
