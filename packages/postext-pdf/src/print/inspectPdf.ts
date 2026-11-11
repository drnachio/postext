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
import { pdfNameOf as nameOf, pdfWalk } from './pdfWalk.js';

export interface PrintPdfFont {
  /** The font's name without the subset tag. */
  name: string;
  /** Its font program is in the file. */
  embedded: boolean;
  /** Embedded as a subset (`ABCDEF+Name`). */
  subset: boolean;
  /** `TrueType`, `OpenType CFF`, `Type 1`, `Type 3`… */
  type: string;
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
  /** Pages without a TrimBox. */
  pagesWithoutTrimBox: number;
  /** The smallest bleed beyond the trim on any side of any page, mm (0
   *  when a page has no BleedBox or it equals the trim). */
  bleedMm: number;
  fonts: PrintPdfFont[];
  /** What the pages paint in. */
  color: {
    /** Process CMYK (DeviceCMYK, or a CMYK ICC space). */
    cmyk: boolean;
    /** RGB (DeviceRGB, CalRGB, or an RGB ICC space). */
    rgb: boolean;
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
  /** The file is tagged (`MarkInfo /Marked true`). */
  tagged: boolean;
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
  const markInfo = lookup(pdf.catalog.get(PDFName.of('MarkInfo')));
  const tagged = markInfo instanceof PDFDict && lookup(markInfo.get(PDFName.of('Marked')))?.toString() === 'true';

  const fonts = new Map<string, PrintPdfFont>();
  const color = { cmyk: false, rgb: false, gray: false, spots: new Set<string>(), registration: false };
  let overprint = false;

  const checkSpace = (cs: PDFObject | undefined): void => {
    const v = lookup(cs);
    const n = nameOf(v);
    if (n === 'DeviceRGB' || n === 'CalRGB' || n === 'RGB') color.rgb = true;
    if (n === 'DeviceCMYK' || n === 'CMYK') color.cmyk = true;
    if (n === 'DeviceGray' || n === 'G') color.gray = true;
    if (!(v instanceof PDFArray)) return;
    const kind = nameOf(lookup(v.get(0)));
    if (kind === 'CalRGB') color.rgb = true;
    if (kind === 'ICCBased') {
      const s = lookup(v.get(1));
      const comps = s instanceof PDFStream ? lookup(s.dict.get(PDFName.of('N'))) : undefined;
      const n = comps instanceof PDFNumber ? comps.asNumber() : 0;
      if (n === 3) color.rgb = true;
      else if (n === 4) color.cmyk = true;
      else if (n === 1) color.gray = true;
    }
    if (kind === 'Indexed') checkSpace(v.get(1));
    if (kind === 'Separation') {
      const ink = nameOf(lookup(v.get(1)));
      if (ink === 'All') color.registration = true;
      else if (ink && ink !== 'None') color.spots.add(ink);
    }
    if (kind === 'DeviceN') {
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
    const subset = /^[A-Z]{6}\+/.test(base);
    // pdf-lib names each embedded face `Name-1234`: the number is not the
    // font's, and one face sent in slices has one per slice.
    const name = (subset ? base.slice(7) : base).replace(/-\d+$/, '');
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
    const known = fonts.get(name);
    // One entry per face: embedded wins over a stray reference to it.
    if (!known || (!known.embedded && embedded)) fonts.set(name, { name, embedded, subset, type });
  };

  const walk = pdfWalk(ctx, {
    font: noteFont,
    space: checkSpace,
    graphicsState: (gs) => {
      for (const k of ['op', 'OP']) if (lookup(gs.get(PDFName.of(k)))?.toString() === 'true') overprint = true;
    },
    // Colour set straight in a content stream: `rg`/`RG`, `k`/`K`, `g`/`G`.
    content: (text) => {
      if (!color.rgb && /(^|[\s\]])(rg|RG)(?=\s|$)/.test(text)) color.rgb = true;
      if (!color.cmyk && /(^|[\s\]])(k|K)(?=\s|$)/.test(text)) color.cmyk = true;
      if (!color.gray && /(^|[\s\]])(g|G)(?=\s|$)/.test(text)) color.gray = true;
    },
  });

  const box = (page: ReturnType<typeof pdf.getPage>, key: string): [number, number, number, number] | undefined => {
    const v = page.node.lookup(PDFName.of(key));
    if (!(v instanceof PDFArray) || v.size() !== 4) return undefined;
    const n = v.asArray().map((o) => (lookup(o) as PDFNumber).asNumber());
    return [Math.min(n[0]!, n[2]!), Math.min(n[1]!, n[3]!), Math.max(n[0]!, n[2]!), Math.max(n[1]!, n[3]!)];
  };

  const pages = pdf.getPages();
  let trimMm = { width: 0, height: 0 };
  let mixedTrimPages = 0;
  let pagesWithoutTrimBox = 0;
  let bleedMm = Infinity;
  let annotations = 0;
  pages.forEach((page, i) => {
    const media = box(page, 'MediaBox') ?? [0, 0, page.getWidth(), page.getHeight()];
    const trimBox = box(page, 'TrimBox');
    if (!trimBox) pagesWithoutTrimBox++;
    const trim = trimBox ?? media;
    const bleed = box(page, 'BleedBox') ?? trim;
    const size = { width: round1((trim[2] - trim[0]) * MM_PER_PT), height: round1((trim[3] - trim[1]) * MM_PER_PT) };
    if (i === 0) trimMm = size;
    else if (Math.abs(size.width - trimMm.width) > 0.2 || Math.abs(size.height - trimMm.height) > 0.2) mixedTrimPages++;
    const sides = [trim[0] - bleed[0], trim[1] - bleed[1], bleed[2] - trim[2], bleed[3] - trim[3]];
    bleedMm = Math.min(bleedMm, ...sides.map((s) => Math.max(0, s) * MM_PER_PT));
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (annots instanceof PDFArray) annotations += annots.size();
    walk.page(page);
  });

  return {
    version,
    pageCount: pages.length,
    size: bytes.byteLength,
    ...(pdfx ? { pdfx } : {}),
    ...(outputIntent ? { outputIntent } : {}),
    trimMm,
    mixedTrimPages,
    pagesWithoutTrimBox,
    bleedMm: Number.isFinite(bleedMm) ? round1(bleedMm) : 0,
    fonts: [...fonts.values()].sort((a, b) => a.name.localeCompare(b.name)),
    color: { cmyk: color.cmyk, rgb: color.rgb, gray: color.gray, spots: [...color.spots].sort(), registration: color.registration },
    transparency: walk.transparency,
    overprint,
    annotations,
    tagged,
  };
}
