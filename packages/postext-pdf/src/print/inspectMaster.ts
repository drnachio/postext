/**
 * What a placed PDF (a print master, `Resource.svg.pdfFileId`) brings into
 * a print file that postext does not control (#605): fonts it does not
 * embed, RGB colour, and transparency (which PDF/X-1a forbids).
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import { pdfNameOf as name, pdfWalk } from './pdfWalk.js';

export interface PrintMasterReport {
  /** Base names of fonts used without an embedded font program. */
  nonEmbeddedFonts: string[];
  /** The page paints in an RGB colour space (device or ICC-based). */
  rgb: boolean;
  /** The page uses transparency: alpha, soft masks, blend modes or
   *  transparency groups. */
  transparency: boolean;
}

/** Inspect the first page of a PDF's bytes (the page postext embeds). */
export async function inspectPrintMaster(bytes: Uint8Array): Promise<PrintMasterReport> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const lookup = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? pdf.context.lookup(o) : o);
  const fonts = new Set<string>();
  let rgb = false;

  const fontEmbedded = (font: PDFDict): boolean => {
    const sub = name(lookup(font.get(PDFName.of('Subtype'))));
    if (sub === 'Type3') return true;
    if (sub === 'Type0') {
      const kids = lookup(font.get(PDFName.of('DescendantFonts')));
      const kid = kids instanceof PDFArray ? lookup(kids.get(0)) : undefined;
      return kid instanceof PDFDict ? fontEmbedded(kid) : false;
    }
    const fd = lookup(font.get(PDFName.of('FontDescriptor')));
    if (!(fd instanceof PDFDict)) return false;
    return ['FontFile', 'FontFile2', 'FontFile3'].some((k) => fd.get(PDFName.of(k)) !== undefined);
  };

  const checkSpace = (cs: PDFObject | undefined): void => {
    const v = lookup(cs);
    const n = name(v);
    if (n === 'DeviceRGB' || n === 'CalRGB' || n === 'RGB') rgb = true;
    if (v instanceof PDFArray) {
      const kind = name(lookup(v.get(0)));
      if (kind === 'CalRGB') rgb = true;
      if (kind === 'ICCBased') {
        const s = lookup(v.get(1));
        const comps = s instanceof PDFStream ? lookup(s.dict.get(PDFName.of('N'))) : undefined;
        if (comps instanceof PDFNumber && comps.asNumber() === 3) rgb = true;
      }
      // Indexed / Separation / DeviceN: their base or alternate space.
      if (kind === 'Indexed') checkSpace(v.get(1));
      if (kind === 'Separation' || kind === 'DeviceN') checkSpace(v.get(2));
    }
  };

  const walk = pdfWalk(pdf.context, {
    font: (font) => {
      if (!fontEmbedded(font)) fonts.add(name(lookup(font.get(PDFName.of('BaseFont')))) ?? 'unnamed');
    },
    space: checkSpace,
    // Device RGB set straight in a content stream (`rg` / `RG`).
    content: (text) => {
      if (/(^|[\s\]])(rg|RG)(?=\s|$)/.test(text)) rgb = true;
    },
  });
  walk.page(pdf.getPage(0));
  return { nonEmbeddedFonts: [...fonts].sort(), rgb, transparency: walk.transparency };
}
