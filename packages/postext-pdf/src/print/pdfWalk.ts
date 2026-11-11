/**
 * A walk over what a PDF page paints with, shared by the readers of
 * finished files: a placed print master (`inspectPrintMaster`, #605) and
 * the book's own PDF read back (`inspectPrintPdf`). It visits each
 * resource once — fonts (and a Type 3 font's own resources), colour
 * spaces, shadings, images and forms — decodes content streams for the
 * colour operators set straight in them, and notes transparency (alpha,
 * soft masks, blend modes, transparency groups). What to make of a font or
 * a colour space is the reader's.
 */

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFContext, type PDFObject, type PDFPage } from 'pdf-lib';

export interface PdfWalkVisitor {
  /** A font dictionary of a resource dictionary. */
  font?(font: PDFDict): void;
  /** A colour space: of a resource dictionary, an image or a shading. */
  space?(cs: PDFObject | undefined): void;
  /** A graphics state dictionary (`ExtGState`). */
  graphicsState?(gs: PDFDict): void;
  /** The decoded text of a content stream (a page's or a form's). */
  content?(text: string): void;
}

export interface PdfWalk {
  /** Resolve an indirect object. */
  lookup(o: PDFObject | undefined): PDFObject | undefined;
  /** Walk one page: its resources, its content and its group. */
  page(page: PDFPage): void;
  /** Something paints with transparency. */
  readonly transparency: boolean;
}

/** A name object's text (`/DeviceRGB` → `DeviceRGB`). */
export const pdfNameOf = (o: PDFObject | undefined): string | undefined => (o instanceof PDFName ? o.decodeText() : undefined);

export function pdfWalk(ctx: PDFContext, visit: PdfWalkVisitor): PdfWalk {
  const lookup = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const seen = new Set<PDFObject>();
  let transparency = false;

  const transparencyGroup = (group: PDFObject | undefined): void => {
    const g = lookup(group);
    if (g instanceof PDFDict && pdfNameOf(lookup(g.get(PDFName.of('S')))) === 'Transparency') transparency = true;
  };

  const content = (stream: PDFObject | undefined): void => {
    const s = lookup(stream);
    if (s instanceof PDFArray) {
      for (let i = 0; i < s.size(); i++) content(s.get(i));
      return;
    }
    if (!(s instanceof PDFRawStream) || seen.has(s)) return;
    seen.add(s);
    if (!visit.content) return;
    let text: string;
    try {
      text = new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());
    } catch {
      // An undecodable stream says nothing.
      return;
    }
    visit.content(text);
  };

  const resources = (res: PDFObject | undefined): void => {
    const r = lookup(res);
    if (!(r instanceof PDFDict) || seen.has(r)) return;
    seen.add(r);
    const fonts = lookup(r.get(PDFName.of('Font')));
    if (fonts instanceof PDFDict) {
      for (const [, f] of fonts.entries()) {
        const font = lookup(f);
        if (!(font instanceof PDFDict)) continue;
        visit.font?.(font);
        // A Type 3 font draws its glyphs with resources of its own.
        if (pdfNameOf(lookup(font.get(PDFName.of('Subtype')))) === 'Type3') resources(font.get(PDFName.of('Resources')));
      }
    }
    const spaces = lookup(r.get(PDFName.of('ColorSpace')));
    if (spaces instanceof PDFDict) for (const [, cs] of spaces.entries()) visit.space?.(cs);
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
        if (smask && pdfNameOf(smask) !== 'None') transparency = true;
        const bm = lookup(gs.get(PDFName.of('BM')));
        if (bm && pdfNameOf(bm) !== 'Normal' && pdfNameOf(bm) !== 'Compatible') transparency = true;
        visit.graphicsState?.(gs);
      }
    }
    const shadings = lookup(r.get(PDFName.of('Shading')));
    if (shadings instanceof PDFDict) {
      for (const [, sh] of shadings.entries()) {
        const d = lookup(sh);
        const dict = d instanceof PDFStream ? d.dict : d;
        if (dict instanceof PDFDict) visit.space?.(dict.get(PDFName.of('ColorSpace')));
      }
    }
    const xobjects = lookup(r.get(PDFName.of('XObject')));
    if (xobjects instanceof PDFDict) {
      for (const [, x] of xobjects.entries()) {
        const xo = lookup(x);
        if (!(xo instanceof PDFStream) || seen.has(xo)) continue;
        const d = xo.dict;
        const sub = pdfNameOf(lookup(d.get(PDFName.of('Subtype'))));
        if (sub === 'Image') {
          seen.add(xo);
          // A stencil mask paints in the current colour, not its own.
          if (lookup(d.get(PDFName.of('ImageMask')))?.toString() !== 'true') visit.space?.(d.get(PDFName.of('ColorSpace')));
          if (d.get(PDFName.of('SMask')) !== undefined) transparency = true;
        } else if (sub === 'Form') {
          content(xo);
          transparencyGroup(d.get(PDFName.of('Group')));
          resources(d.get(PDFName.of('Resources')));
        }
      }
    }
  };

  return {
    lookup,
    page(page) {
      resources(page.node.Resources());
      content(page.node.get(PDFName.of('Contents')));
      transparencyGroup(page.node.lookup(PDFName.of('Group')));
    },
    get transparency() {
      return transparency;
    },
  };
}
