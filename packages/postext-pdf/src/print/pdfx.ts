/**
 * PDF/X identification and the output intent (#603): what turns a CMYK
 * render into a PDF/X-1a:2003 or PDF/X-4 file.
 *
 * - The output intent `GTS_PDFX`, naming the printing condition (the ICC
 *   characterization registry name) and embedding the destination
 *   profile.
 * - The Info dictionary's `GTS_PDFXVersion`, `/Trapped /False`, title and
 *   dates; an XMP packet with the same, `pdfxid:GTSPDFXVersion` and the
 *   document / version ids (PDF/X-4), merged with the PDF/UA one when the
 *   file is tagged; the trailer `/ID`.
 * - A TrimBox and BleedBox on every page (the version header, 1.4 for
 *   X-1a and 1.6 for X-4, is set on the saved bytes), and for X-4 a transparency page group blending in
 *   CMYK plus `/DefaultRGB` (sRGB) where RGB pictures were kept.
 */

import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, type PDFPage } from 'pdf-lib';
import { srgbProfileBytes } from 'postext';
import type { PrintColorMode } from './colorMode';

export interface PdfXMeta {
  title: string;
  author?: string;
  lang?: string;
  producer: string;
  creatorTool: string;
  /** The file is also tagged PDF/UA-1. */
  pdfua: boolean;
  /** Set the dates (tests pin them). */
  date?: Date;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isoDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function uuid(bytes: Uint8Array): string {
  const h = hex(bytes.subarray(0, 16));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function pdfxVersionString(standard: 'pdfx1a' | 'pdfx4'): string {
  return standard === 'pdfx1a' ? 'PDF/X-1a:2003' : 'PDF/X-4';
}

/** The XMP packet of a PDF/X file (and PDF/UA when tagged). */
export function buildPdfXXmp(meta: PdfXMeta, standard: 'pdfx1a' | 'pdfx4', date: Date, documentId: string): string {
  const title = xmlEscape(meta.title);
  const creator = meta.author ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(meta.author)}</rdf:li></rdf:Seq></dc:creator>\n` : '';
  const language = meta.lang ? `<dc:language><rdf:Bag><rdf:li>${xmlEscape(meta.lang)}</rdf:li></rdf:Bag></dc:language>\n` : '';
  const when = isoDate(date);
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
    ' xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/"' +
    (meta.pdfua ? ' xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"' : '') +
    '>\n' +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>\n` +
    creator +
    language +
    '<dc:format>application/pdf</dc:format>\n' +
    `<pdf:Producer>${xmlEscape(meta.producer)}</pdf:Producer>\n` +
    '<pdf:Trapped>False</pdf:Trapped>\n' +
    `<xmp:CreatorTool>${xmlEscape(meta.creatorTool)}</xmp:CreatorTool>\n` +
    `<xmp:CreateDate>${when}</xmp:CreateDate>\n` +
    `<xmp:ModifyDate>${when}</xmp:ModifyDate>\n` +
    `<xmp:MetadataDate>${when}</xmp:MetadataDate>\n` +
    `<xmpMM:DocumentID>uuid:${documentId}</xmpMM:DocumentID>\n` +
    `<xmpMM:InstanceID>uuid:${documentId}</xmpMM:InstanceID>\n` +
    '<xmpMM:VersionID>1</xmpMM:VersionID>\n' +
    '<xmpMM:RenditionClass>default</xmpMM:RenditionClass>\n' +
    `<pdfxid:GTSPDFXVersion>${pdfxVersionString(standard)}</pdfxid:GTSPDFXVersion>\n` +
    (meta.pdfua ? '<pdfuaid:part>1</pdfuaid:part>\n' : '') +
    '</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n' +
    '<?xpacket end="w"?>'
  );
}

/** Give a page a TrimBox and BleedBox (its MediaBox) when it has none. */
function ensureBoxes(page: PDFPage): void {
  const has = (k: string) => page.node.get(PDFName.of(k)) !== undefined;
  const { x, y, width, height } = page.getMediaBox();
  if (!has('TrimBox')) page.setTrimBox(x, y, width, height);
  if (!has('BleedBox')) page.setBleedBox(x, y, width, height);
}

/** Write the PDF/X parts of a render. Call after every page and the
 *  structure tree are written, before saving. */
export function writePdfX(pdfDoc: PDFDocument, mode: PrintColorMode, meta: PdfXMeta, keptRgb: boolean): void {
  if (mode.standard === 'none') return;
  const standard = mode.standard;
  const context = pdfDoc.context;
  const date = meta.date ?? new Date();
  const idBytes = randomBytes(16);
  const documentId = uuid(idBytes);

  // Output intent with the destination profile.
  const profileRef = context.register(context.flateStream(mode.profile.bytes, { N: 4 }));
  const intent = context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of(mode.condition.registryName),
    ...(mode.condition.registryName !== 'Custom' ? { RegistryName: PDFString.of('http://www.color.org') } : {}),
    OutputCondition: PDFString.of(mode.condition.condition),
    Info: PDFString.of(mode.condition.name),
    DestOutputProfile: profileRef,
  });
  pdfDoc.catalog.set(PDFName.of('OutputIntents'), context.obj([context.register(intent)]));

  // Info dictionary.
  pdfDoc.setTitle(meta.title, { showInWindowTitleBar: true });
  if (meta.author) pdfDoc.setAuthor(meta.author);
  pdfDoc.setCreator(meta.creatorTool);
  pdfDoc.setProducer(meta.producer);
  pdfDoc.setCreationDate(date);
  pdfDoc.setModificationDate(date);
  const info = (pdfDoc as unknown as { getInfoDict(): { set(k: PDFName, v: unknown): void } }).getInfoDict();
  info.set(PDFName.of('Trapped'), PDFName.of('False'));
  info.set(PDFName.of('GTS_PDFXVersion'), PDFString.of(pdfxVersionString(standard)));

  // XMP (replacing the PDF/UA-only packet of a tagged render).
  const xmp = buildPdfXXmp(meta, standard, date, documentId);
  const metadata = context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
  pdfDoc.catalog.set(PDFName.of('Metadata'), context.register(metadata));

  // Trailer ID: the same bytes twice (a first version of the file).
  const id = PDFHexString.of(hex(idBytes));
  context.trailerInfo.ID = context.obj([id, id]);

  const srgbRef = standard === 'pdfx4' && keptRgb
    ? context.register(context.flateStream(srgbProfileBytes(), { N: 3 }))
    : undefined;
  for (const page of pdfDoc.getPages()) {
    ensureBoxes(page);
    if (standard === 'pdfx4') {
      page.node.set(PDFName.of('Group'), context.obj({ Type: 'Group', S: 'Transparency', CS: 'DeviceCMYK' }));
      if (srgbRef) {
        const resources = page.node.normalizedEntries().Resources;
        let spaces = resources.lookup(PDFName.of('ColorSpace'));
        if (!(spaces instanceof PDFDict)) {
          spaces = context.obj({});
          resources.set(PDFName.of('ColorSpace'), spaces);
        }
        (spaces as PDFDict).set(PDFName.of('DefaultRGB'), context.obj([PDFName.of('ICCBased'), srgbRef]));
      }
    }
  }
}
