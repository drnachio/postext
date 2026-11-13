/**
 * What a finished PDF is, read back from its bytes: the checks a printer's
 * preflight runs on a file before it goes to plate. The version and the
 * PDF/X identification, the output intent, the page boxes (trim size,
 * bleed), the fonts and whether they are embedded, the colour it paints in
 * (process, spot inks, RGB), transparency and overprint.
 *
 * It reads what the file says, not what the configuration asked for, so a
 * host can show both side by side before the file leaves. Every page is
 * read, by the walk `inspectPrintMaster` reads a placed master's first
 * page with (`pdfWalk.ts`).
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, PDFString, PDFHexString, type PDFObject } from 'pdf-lib';
import { pdfNameOf as nameOf, pdfWalk, type PdfPaintKind } from './pdfWalk.js';

export interface PrintPdfFont {
  /** The font's name, without a subset tag (`ABCDEF+`) or the number
   *  pdf-lib appends to each embedded face (`-1234`). */
  name: string;
  /** Its font program is in the file. A face used both embedded and not
   *  is listed twice, once each way. */
  embedded: boolean;
  /** `TrueType`, `OpenType CFF`, `Type 1`, `Type 3`… */
  type: string;
}

/** Where RGB is painted: in vector paint (fills, strokes, text, shadings,
 *  patterns) and in images. */
export interface PrintPdfRgbUse {
  vector: boolean;
  images: boolean;
}

export interface PrintPdfReport {
  /** `1.4`, `1.6`, `1.7`… from the header. */
  version: string;
  pageCount: number;
  /** File size, bytes. */
  size: number;
  /** `GTS_PDFXVersion` of the Info dictionary (`PDF/X-4`), if any. */
  pdfx?: string;
  /** The PDF/X output intent: the printing condition, and whether the
   *  destination profile is embedded. */
  outputIntent?: { identifier: string; condition: string; registry?: string; profileEmbedded: boolean };
  /** Trim size of the first page, mm (its TrimBox, else MediaBox). */
  trimMm: { width: number; height: number };
  /** Pages whose trim size differs from the first page's. */
  mixedTrimPages: number;
  /** Pages without a TrimBox (or with one that is not four numbers). */
  pagesWithoutTrimBox: number;
  /** Pages with a MediaBox, TrimBox or BleedBox that is not four numbers,
   *  read as if it were missing. */
  malformedBoxPages: number;
  /** The smallest bleed beyond the trim on any side of any page, mm (0
   *  when a page has no BleedBox or it equals the trim). */
  bleedMm: number;
  fonts: PrintPdfFont[];
  /** What the pages paint in. */
  color: {
    /** Process CMYK (DeviceCMYK, or a CMYK ICC space). */
    cmyk: boolean;
    /** RGB of any kind: `deviceRgb` or `iccRgb`. */
    rgb: boolean;
    /** DeviceRGB: RGB with no profile, whose print colour is the RIP's
     *  guess. */
    deviceRgb: PrintPdfRgbUse;
    /** RGB with a profile (an RGB ICC space, or CalRGB): a PDF/X-4 RIP
     *  converts it to the output intent. */
    iccRgb: PrintPdfRgbUse;
    /** DeviceGray. */
    gray: boolean;
    /** Spot inks by name (Separation and DeviceN colorants), registration
     *  (`All`) excluded. */
    spots: string[];
    /** Something paints in registration colour (crop marks). */
    registration: boolean;
  };
  /** Alpha, soft masks, blend modes or transparency groups. */
  transparency: boolean;
  /** Some graphics state overprints. */
  overprint: boolean;
  /** Annotations (links, …) on the pages. */
  annotations: number;
  /** The file has an interactive form (`AcroForm`). */
  form: boolean;
  /** The file is tagged (`MarkInfo /Marked true`). */
  tagged: boolean;
  /** The names of its optional content groups (layers), as the catalog
   *  lists them (`Die line` for the die-cut plate Postext writes); absent
   *  when it has none. */
  layers?: string[];
}

const MM_PER_PT = 25.4 / 72;
const textOf = (o: PDFObject | undefined): string | undefined =>
  o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : o instanceof PDFName ? o.decodeText() : undefined;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Read a PDF's bytes back as a printer's preflight would. */
export async function inspectPrintPdf(bytes: Uint8Array): Promise<PrintPdfReport> {
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
  const version = /%PDF-(\d\.\d)/.exec(header)?.[1] ?? '?';
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = pdf.context;
  const lookup = (o: PDFObject | undefined): PDFObject | undefined => (o instanceof PDFRef ? ctx.lookup(o) : o);

  // Identification and output intent.
  const info = lookup(ctx.trailerInfo.Info);
  const pdfx = info instanceof PDFDict ? textOf(lookup(info.get(PDFName.of('GTS_PDFXVersion')))) : undefined;
  let outputIntent: PrintPdfReport['outputIntent'];
  const intents = lookup(pdf.catalog.get(PDFName.of('OutputIntents')));
  if (intents instanceof PDFArray) {
    for (let i = 0; i < intents.size(); i++) {
      const d = lookup(intents.get(i));
      if (!(d instanceof PDFDict) || nameOf(lookup(d.get(PDFName.of('S')))) !== 'GTS_PDFX') continue;
      const id = textOf(lookup(d.get(PDFName.of('OutputConditionIdentifier'))));
      const cond = textOf(lookup(d.get(PDFName.of('OutputCondition'))));
      const registry = textOf(lookup(d.get(PDFName.of('RegistryName'))));
      outputIntent = {
        identifier: id || cond || '',
        condition: cond || id || '',
        ...(registry ? { registry } : {}),
        profileEmbedded: lookup(d.get(PDFName.of('DestOutputProfile'))) instanceof PDFStream,
      };
      break;
    }
  }
  const layers: string[] = [];
  const ocProperties = lookup(pdf.catalog.get(PDFName.of('OCProperties')));
  const ocgs = ocProperties instanceof PDFDict ? lookup(ocProperties.get(PDFName.of('OCGs'))) : undefined;
  if (ocgs instanceof PDFArray) {
    for (let i = 0; i < ocgs.size(); i++) {
      const g = lookup(ocgs.get(i));
      const name = g instanceof PDFDict ? textOf(lookup(g.get(PDFName.of('Name')))) : undefined;
      if (name !== undefined) layers.push(name);
    }
  }
  const markInfo = lookup(pdf.catalog.get(PDFName.of('MarkInfo')));
  const tagged = markInfo instanceof PDFDict && lookup(markInfo.get(PDFName.of('Marked')))?.toString() === 'true';

  const fonts = new Map<string, PrintPdfFont>();
  const color = {
    cmyk: false,
    gray: false,
    spots: new Set<string>(),
    registration: false,
    deviceRgb: { vector: false, images: false },
    iccRgb: { vector: false, images: false },
  };
  let overprint = false;
  const rgb = (use: PrintPdfRgbUse, kind: PdfPaintKind): void => {
    if (kind === 'image') use.images = true;
    else use.vector = true;
  };

  const checkSpace = (cs: PDFObject | undefined, kind: PdfPaintKind, res?: PDFDict, depth = 0): void => {
    const v = lookup(cs);
    const n = nameOf(v);
    if (n === 'DeviceRGB' || n === 'RGB') rgb(color.deviceRgb, kind);
    else if (n === 'DeviceCMYK' || n === 'CMYK') color.cmyk = true;
    else if (n === 'DeviceGray' || n === 'G') color.gray = true;
    else if (n && res && depth < 4) {
      // An inline image names a space of its resources.
      const spaces = lookup(res.get(PDFName.of('ColorSpace')));
      if (spaces instanceof PDFDict) checkSpace(spaces.get(PDFName.of(n)), kind, undefined, depth + 1);
    }
    if (!(v instanceof PDFArray) || depth >= 4) return;
    const family = nameOf(lookup(v.get(0)));
    if (family === 'CalRGB') rgb(color.iccRgb, kind);
    if (family === 'ICCBased') {
      const s = lookup(v.get(1));
      const comps = s instanceof PDFStream ? lookup(s.dict.get(PDFName.of('N'))) : undefined;
      const n = comps instanceof PDFNumber ? comps.asNumber() : 0;
      if (n === 3) rgb(color.iccRgb, kind);
      else if (n === 4) color.cmyk = true;
      else if (n === 1) color.gray = true;
    }
    if (family === 'Indexed' || family === 'I') checkSpace(v.get(1), kind, res, depth + 1);
    if (family === 'Pattern' && v.size() > 1) checkSpace(v.get(1), 'vector', res, depth + 1);
    if (family === 'Separation') {
      const ink = nameOf(lookup(v.get(1)));
      if (ink === 'All') color.registration = true;
      else if (ink && ink !== 'None') color.spots.add(ink);
    }
    if (family === 'DeviceN') {
      const names = lookup(v.get(1));
      if (names instanceof PDFArray) {
        for (let i = 0; i < names.size(); i++) {
          const ink = nameOf(lookup(names.get(i)));
          if (!ink || ink === 'None') continue;
          if (['Cyan', 'Magenta', 'Yellow', 'Black'].includes(ink)) color.cmyk = true;
          else if (ink === 'All') color.registration = true;
          else color.spots.add(ink);
        }
      }
    }
  };

  const noteFont = (font: PDFDict): void => {
    const base = nameOf(lookup(font.get(PDFName.of('BaseFont')))) ?? 'unnamed';
    // pdf-lib names each embedded face `Name-1234`: the number is not the
    // font's, and one face sent in slices has one per slice. Other
    // writers tag a subset `ABCDEF+Name`.
    const name = base.replace(/^[A-Z]{6}\+/, '').replace(/-\d+$/, '');
    let sub = nameOf(lookup(font.get(PDFName.of('Subtype'))));
    let desc = font;
    if (sub === 'Type0') {
      const kids = lookup(font.get(PDFName.of('DescendantFonts')));
      const kid = kids instanceof PDFArray ? lookup(kids.get(0)) : undefined;
      if (kid instanceof PDFDict) {
        desc = kid;
        sub = nameOf(lookup(kid.get(PDFName.of('Subtype'))));
      }
    }
    const fd = lookup(desc.get(PDFName.of('FontDescriptor')));
    const file = fd instanceof PDFDict
      ? (['FontFile', 'FontFile2', 'FontFile3'] as const).find((k) => fd.get(PDFName.of(k)) !== undefined)
      : undefined;
    const embedded = sub === 'Type3' || !!file;
    const type = sub === 'Type3' ? 'Type 3'
      : file === 'FontFile2' || sub === 'TrueType' || sub === 'CIDFontType2' ? 'TrueType'
      : file === 'FontFile3' || sub === 'CIDFontType0' ? 'OpenType CFF'
      : sub === 'Type1' || sub === 'MMType1' ? 'Type 1'
      : sub ?? '?';
    // One entry per face and way it is used: the slices of one face are
    // one entry, and a face also used without its program is listed again
    // as such, never hidden behind its embedded copies.
    const key = `${name}\u0000${embedded}\u0000${type}`;
    if (!fonts.has(key)) fonts.set(key, { name, embedded, type });
  };

  const walk = pdfWalk(ctx, {
    font: noteFont,
    space: checkSpace,
    graphicsState: (gs) => {
      for (const k of ['op', 'OP']) if (lookup(gs.get(PDFName.of(k)))?.toString() === 'true') overprint = true;
    },
    // Colour set straight in a content stream: `rg`/`RG`, `k`/`K`, `g`/`G`.
    content: (text) => {
      if (!color.deviceRgb.vector && /(^|[\s\]])(rg|RG)(?=\s|$)/.test(text)) color.deviceRgb.vector = true;
      if (!color.cmyk && /(^|[\s\]])(k|K)(?=\s|$)/.test(text)) color.cmyk = true;
      if (!color.gray && /(^|[\s\]])(g|G)(?=\s|$)/.test(text)) color.gray = true;
    },
  });

  /** A page box; undefined when it is missing, and noted when it is not
   *  four numbers (read as missing). */
  let malformed = false;
  const box = (page: ReturnType<typeof pdf.getPage>, key: string): [number, number, number, number] | undefined => {
    let v: PDFObject | undefined;
    try {
      v = page.node.lookup(PDFName.of(key));
    } catch {
      malformed = true;
      return undefined;
    }
    if (v === undefined) return undefined;
    const n = v instanceof PDFArray && v.size() === 4 ? v.asArray().map((o) => lookup(o)).map((o) => (o instanceof PDFNumber ? o.asNumber() : NaN)) : [];
    if (n.length !== 4 || !n.every(Number.isFinite) || n[0] === n[2] || n[1] === n[3]) {
      malformed = true;
      return undefined;
    }
    return [Math.min(n[0]!, n[2]!), Math.min(n[1]!, n[3]!), Math.max(n[0]!, n[2]!), Math.max(n[1]!, n[3]!)];
  };

  /** A MediaBox the page inherits from its page tree; US Letter when
   *  there is none that reads. */
  const inheritedMedia = (page: ReturnType<typeof pdf.getPage>): [number, number, number, number] => {
    try {
      const w = page.getWidth();
      const h = page.getHeight();
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [0, 0, w, h];
    } catch {
      // Not four numbers anywhere up the tree.
    }
    malformed = true;
    return [0, 0, 612, 792];
  };

  const pages = pdf.getPages();
  let trimMm = { width: 0, height: 0 };
  let mixedTrimPages = 0;
  let pagesWithoutTrimBox = 0;
  let malformedBoxPages = 0;
  let bleedMm = Infinity;
  let annotations = 0;
  pages.forEach((page, i) => {
    malformed = false;
    const media = box(page, 'MediaBox') ?? inheritedMedia(page);
    const trimBox = box(page, 'TrimBox');
    if (!trimBox) pagesWithoutTrimBox++;
    const trim = trimBox ?? media;
    const bleed = box(page, 'BleedBox') ?? trim;
    if (malformed) malformedBoxPages++;
    const size = { width: round1((trim[2] - trim[0]) * MM_PER_PT), height: round1((trim[3] - trim[1]) * MM_PER_PT) };
    if (i === 0) trimMm = size;
    else if (Math.abs(size.width - trimMm.width) > 0.2 || Math.abs(size.height - trimMm.height) > 0.2) mixedTrimPages++;
    const sides = [trim[0] - bleed[0], trim[1] - bleed[1], bleed[2] - trim[2], bleed[3] - trim[3]];
    bleedMm = Math.min(bleedMm, ...sides.map((s) => Math.max(0, s) * MM_PER_PT));
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (annots instanceof PDFArray) annotations += annots.size();
    walk.page(page);
  });
  walk.acroForm(pdf.catalog);
  const form = lookup(pdf.catalog.get(PDFName.of('AcroForm'))) instanceof PDFDict;

  return {
    version,
    pageCount: pages.length,
    size: bytes.byteLength,
    ...(pdfx ? { pdfx } : {}),
    ...(outputIntent ? { outputIntent } : {}),
    trimMm,
    mixedTrimPages,
    pagesWithoutTrimBox,
    malformedBoxPages,
    bleedMm: Number.isFinite(bleedMm) ? round1(bleedMm) : 0,
    fonts: [...fonts.values()].sort((a, b) => a.name.localeCompare(b.name) || Number(a.embedded) - Number(b.embedded)),
    color: {
      cmyk: color.cmyk,
      rgb: color.deviceRgb.vector || color.deviceRgb.images || color.iccRgb.vector || color.iccRgb.images,
      deviceRgb: color.deviceRgb,
      iccRgb: color.iccRgb,
      gray: color.gray,
      spots: [...color.spots].sort(),
      registration: color.registration,
    },
    transparency: walk.transparency,
    overprint,
    annotations,
    form,
    tagged,
    ...(layers.length > 0 ? { layers } : {}),
  };
}
