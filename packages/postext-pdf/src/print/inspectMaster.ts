/**
 * What a placed PDF (a print master, `Resource.svg.pdfFileId`) brings into
 * a print file that postext does not control (#605): fonts it does not
 * embed, RGB colour, and transparency (which PDF/X-1a forbids).
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';

export interface PrintMasterReport {
  /** Base names of fonts used without an embedded font program. */
  nonEmbeddedFonts: string[];
  /** The page paints in an RGB colour space (device or ICC-based). */
  rgb: boolean;
  /** The page uses transparency: alpha, soft masks, blend modes or
   *  transparency groups. */
  transparency: boolean;
}

const name = (o: PDFObject | undefined): string | undefined => (o instanceof PDFName ? o.asString().slice(1) : undefined);

/** Inspect the first page of a PDF's bytes (the page postext embeds). */
export async function inspectPrintMaster(bytes: Uint8Array): Promise<PrintMasterReport> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = pdf.context;
  const lookup = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const fonts = new Set<string>();
  let rgb = false;
  let transparency = false;
  const seen = new Set<PDFObject>();

  const checkSpace = (cs: PDFObject | undefined) => {
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
      if (kind === 'Separation' || kind === 'DeviceN') checkSpace(v.get(kind === 'Separation' ? 2 : 2));
    }
  };

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

  /** Device RGB set straight in a content stream (`rg` / `RG`). */
  const scanContent = (stream: PDFObject | undefined) => {
    const s = lookup(stream);
    if (s instanceof PDFArray) {
      for (let i = 0; i < s.size(); i++) scanContent(s.get(i));
      return;
    }
    if (!(s instanceof PDFRawStream)) return;
    try {
      const text = new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());
      if (/(^|[\s\]])(rg|RG)(?=\s|$)/.test(text)) rgb = true;
    } catch {
      // An undecodable stream says nothing.
    }
  };

  const walkResources = (res: PDFObject | undefined): void => {
    const r = lookup(res);
    if (!(r instanceof PDFDict) || seen.has(r)) return;
    seen.add(r);
    const fontDict = lookup(r.get(PDFName.of('Font')));
    if (fontDict instanceof PDFDict) {
      for (const [, f] of fontDict.entries()) {
        const font = lookup(f);
        if (font instanceof PDFDict && !fontEmbedded(font)) fonts.add(name(lookup(font.get(PDFName.of('BaseFont')))) ?? 'unnamed');
      }
    }
    const spaces = lookup(r.get(PDFName.of('ColorSpace')));
    if (spaces instanceof PDFDict) for (const [, cs] of spaces.entries()) checkSpace(cs);
    const states = lookup(r.get(PDFName.of('ExtGState')));
    if (states instanceof PDFDict) {
      for (const [, g] of states.entries()) {
        const gs = lookup(g);
        if (!(gs instanceof PDFDict)) continue;
        for (const k of ['ca', 'CA']) {
          const v = lookup(gs.get(PDFName.of(k)));
          if (v instanceof PDFNumber && v.asNumber() < 1) transparency = true;
        }
        const smask = lookup(gs.get(PDFName.of('SMask')));
        if (smask && name(smask) !== 'None') transparency = true;
        const bm = lookup(gs.get(PDFName.of('BM')));
        if (bm && name(bm) !== 'Normal' && name(bm) !== 'Compatible') transparency = true;
      }
    }
    const xobjects = lookup(r.get(PDFName.of('XObject')));
    if (xobjects instanceof PDFDict) {
      for (const [, x] of xobjects.entries()) {
        const xo = lookup(x);
        if (!(xo instanceof PDFStream)) continue;
        const d = xo.dict;
        const sub = name(lookup(d.get(PDFName.of('Subtype'))));
        if (sub === 'Image') {
          checkSpace(d.get(PDFName.of('ColorSpace')));
          if (d.get(PDFName.of('SMask')) !== undefined) transparency = true;
        } else if (sub === 'Form') {
          scanContent(xo);
          const group = lookup(d.get(PDFName.of('Group')));
          if (group instanceof PDFDict && name(lookup(group.get(PDFName.of('S')))) === 'Transparency') transparency = true;
          walkResources(d.get(PDFName.of('Resources')));
        }
      }
    }
  };

  const page = pdf.getPage(0);
  walkResources(page.node.Resources());
  scanContent(page.node.get(PDFName.of('Contents')));
  const group = page.node.lookup(PDFName.of('Group'));
  if (group instanceof PDFDict && name(lookup(group.get(PDFName.of('S')))) === 'Transparency') transparency = true;
  return { nonEmbeddedFonts: [...fonts].sort(), rgb, transparency };
}
