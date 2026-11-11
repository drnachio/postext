/**
 * A walk over what a PDF page paints with, shared by the readers of
 * finished files: a placed print master (`inspectPrintMaster`, #605) and
 * the book's own PDF read back (`inspectPrintPdf`). It visits each
 * resource once — fonts (and a Type 3 font's own resources), colour
 * spaces, shadings, patterns, images and forms, inline images included —
 * the appearances of the page's annotations and the form's default
 * resources, decodes content streams for the colour operators set straight
 * in them, and notes transparency (alpha, soft masks, blend modes,
 * transparency groups). What to make of a font or a colour space is the
 * reader's.
 */

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFContext, type PDFObject, type PDFPage } from 'pdf-lib';

/** What paints in a colour space: vector paint (fills, strokes, text,
 *  shadings, patterns) or an image. */
export type PdfPaintKind = 'vector' | 'image';

export interface PdfWalkVisitor {
  /** A font dictionary of a resource dictionary. */
  font?(font: PDFDict): void;
  /** A colour space: of a resource dictionary, an image (inline ones
   *  included), a shading or a pattern; or a device space named in a
   *  content stream (`/DeviceRGB cs`). `resources` is the dictionary a
   *  name used by an inline image is looked up in. */
  space?(cs: PDFObject | undefined, kind: PdfPaintKind, resources?: PDFDict): void;
  /** A graphics state dictionary (`ExtGState`). */
  graphicsState?(gs: PDFDict): void;
  /** The decoded text of a content stream (a page's, a form's, an
   *  annotation appearance's, a tiling pattern's or a Type 3 glyph's). */
  content?(text: string): void;
}

export interface PdfWalk {
  /** Resolve an indirect object. */
  lookup(o: PDFObject | undefined): PDFObject | undefined;
  /** Walk one page: its resources, its content, its group and the
   *  appearances of its annotations. */
  page(page: PDFPage): void;
  /** Walk the document's interactive form: its default resources and the
   *  appearances of its fields. */
  acroForm(catalog: PDFDict): void;
  /** Something paints with transparency. */
  readonly transparency: boolean;
}

/** A name object's text (`/DeviceRGB` → `DeviceRGB`). */
export const pdfNameOf = (o: PDFObject | undefined): string | undefined => (o instanceof PDFName ? o.decodeText() : undefined);

const isSpace = (c: number): boolean => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;

/**
 * The dictionaries of the inline images of a content stream (`BI … ID`),
 * as text. The image data after `ID` is skipped to its `EI`.
 */
export function inlineImageDicts(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const bi = text.indexOf('BI', at);
    if (bi < 0) return out;
    // An operator stands alone: whitespace (or the start) before and after.
    if ((bi > 0 && !isSpace(text.charCodeAt(bi - 1))) || !isSpace(text.charCodeAt(bi + 2))) {
      at = bi + 2;
      continue;
    }
    const id = /\sID[\s]/g;
    id.lastIndex = bi + 2;
    const m = id.exec(text);
    if (!m) return out;
    out.push(text.slice(bi + 2, m.index));
    const ei = /\sEI(?=\s|$)/g;
    ei.lastIndex = m.index + m[0].length;
    const end = ei.exec(text);
    if (!end) return out;
    at = end.index + end[0].length;
  }
}

export function pdfWalk(ctx: PDFContext, visit: PdfWalkVisitor): PdfWalk {
  const lookup = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const seen = new Set<PDFObject>();
  let transparency = false;

  const transparencyGroup = (group: PDFObject | undefined): void => {
    const g = lookup(group);
    if (g instanceof PDFDict && pdfNameOf(lookup(g.get(PDFName.of('S')))) === 'Transparency') transparency = true;
  };

  /** A content stream (or an array of them) painted with `res`. */
  const content = (stream: PDFObject | undefined, res: PDFDict | undefined): void => {
    const s = lookup(stream);
    if (s instanceof PDFArray) {
      for (let i = 0; i < s.size(); i++) content(s.get(i), res);
      return;
    }
    if (!(s instanceof PDFRawStream) || seen.has(s)) return;
    seen.add(s);
    if (!visit.content && !visit.space) return;
    let text: string;
    try {
      text = new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());
    } catch {
      // An undecodable stream says nothing.
      return;
    }
    visit.content?.(text);
    if (visit.space) {
      // Device spaces named straight in the stream.
      for (const m of text.matchAll(/\/(DeviceRGB|DeviceCMYK|DeviceGray)\s+(?:cs|CS)(?=\s|$)/g)) visit.space(PDFName.of(m[1]!), 'vector');
      for (const dict of inlineImageDicts(text)) {
        if (/\/IM\s+true|\/ImageMask\s+true/.test(dict)) continue;
        const cs = /\/(?:CS|ColorSpace)\s*(\/[^\s/[\]<>()]+|\[[^\]]*\])/.exec(dict)?.[1];
        if (!cs) continue;
        if (cs.startsWith('[')) {
          // `[/I /RGB 255 <…>]`: an indexed space over its base.
          const base = /\/(?:I|Indexed)\s*\/([^\s/[\]<>()]+)/.exec(cs)?.[1];
          if (base) visit.space(PDFName.of(base), 'image', res);
          continue;
        }
        visit.space(PDFName.of(cs.slice(1)), 'image', res);
      }
    }
  };

  /** A form-like stream: content painted with its own resources. */
  const form = (xo: PDFStream): void => {
    if (seen.has(xo)) return;
    const res = lookup(xo.dict.get(PDFName.of('Resources')));
    content(xo, res instanceof PDFDict ? res : undefined);
    transparencyGroup(xo.dict.get(PDFName.of('Group')));
    resources(res);
  };

  const shading = (sh: PDFObject | undefined): void => {
    const d = lookup(sh);
    const dict = d instanceof PDFStream ? d.dict : d;
    if (dict instanceof PDFDict) visit.space?.(dict.get(PDFName.of('ColorSpace')), 'vector');
  };

  const resources = (res: PDFObject | undefined): void => {
    const r = lookup(res);
    if (!(r instanceof PDFDict) || seen.has(r)) return;
    seen.add(r);
    const fonts = lookup(r.get(PDFName.of('Font')));
    if (fonts instanceof PDFDict) {
      for (const [, f] of fonts.entries()) {
        const font = lookup(f);
        if (!(font instanceof PDFDict) || seen.has(font)) continue;
        seen.add(font);
        visit.font?.(font);
        // A Type 3 font draws its glyphs with resources of its own.
        if (pdfNameOf(lookup(font.get(PDFName.of('Subtype')))) === 'Type3') {
          const own = lookup(font.get(PDFName.of('Resources')));
          const procs = lookup(font.get(PDFName.of('CharProcs')));
          if (procs instanceof PDFDict) for (const [, p] of procs.entries()) content(p, own instanceof PDFDict ? own : undefined);
          resources(own);
        }
      }
    }
    const spaces = lookup(r.get(PDFName.of('ColorSpace')));
    if (spaces instanceof PDFDict) for (const [, cs] of spaces.entries()) visit.space?.(cs, 'vector');
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
    if (shadings instanceof PDFDict) for (const [, sh] of shadings.entries()) shading(sh);
    const patterns = lookup(r.get(PDFName.of('Pattern')));
    if (patterns instanceof PDFDict) {
      for (const [, p] of patterns.entries()) {
        const pat = lookup(p);
        if (!pat || seen.has(pat)) continue;
        // A tiling pattern paints a cell of content; a shading pattern a
        // shading.
        if (pat instanceof PDFStream) form(pat);
        else if (pat instanceof PDFDict) {
          seen.add(pat);
          shading(pat.get(PDFName.of('Shading')));
        }
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
          if (lookup(d.get(PDFName.of('ImageMask')))?.toString() !== 'true') visit.space?.(d.get(PDFName.of('ColorSpace')), 'image');
          if (d.get(PDFName.of('SMask')) !== undefined) transparency = true;
        } else if (sub === 'Form') form(xo);
      }
    }
  };

  /** The appearance streams of an annotation (`AP` N, R, D; each a
   *  stream or a dictionary of states). */
  const appearances = (annot: PDFObject | undefined): void => {
    const a = lookup(annot);
    if (!(a instanceof PDFDict) || seen.has(a)) return;
    seen.add(a);
    const ap = lookup(a.get(PDFName.of('AP')));
    if (ap instanceof PDFDict) {
      for (const key of ['N', 'R', 'D']) {
        const v = lookup(ap.get(PDFName.of(key)));
        if (v instanceof PDFStream) form(v);
        else if (v instanceof PDFDict) for (const [, s] of v.entries()) {
          const st = lookup(s);
          if (st instanceof PDFStream) form(st);
        }
      }
    }
    // A field's widgets.
    const kids = lookup(a.get(PDFName.of('Kids')));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) appearances(kids.get(i));
  };

  return {
    lookup,
    page(page) {
      const res = page.node.Resources();
      resources(res);
      content(page.node.get(PDFName.of('Contents')), res);
      transparencyGroup(page.node.lookup(PDFName.of('Group')));
      const annots = page.node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) for (let i = 0; i < annots.size(); i++) appearances(annots.get(i));
    },
    acroForm(catalog) {
      const form = lookup(catalog.get(PDFName.of('AcroForm')));
      if (!(form instanceof PDFDict)) return;
      resources(form.get(PDFName.of('DR')));
      const fields = lookup(form.get(PDFName.of('Fields')));
      if (fields instanceof PDFArray) for (let i = 0; i < fields.size(); i++) appearances(fields.get(i));
    },
    get transparency() {
      return transparency;
    },
  };
}
