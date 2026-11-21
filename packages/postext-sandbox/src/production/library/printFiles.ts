/**
 * Print files as pictures of the cover's libraries (its gallery, the logos,
 * a collection's ads): a TIFF, and an Illustrator file saved
 * PDF-compatible (Illustrator's default) or a PDF, become a PNG, made in
 * the browser when the file is picked. Each page of a PDF (each artboard
 * of an Illustrator file) is drawn at 300 ppi as a picture of its own, on
 * nothing: where the page has nothing drawn, the picture is clear. An EPS,
 * or an Illustrator file saved without its PDF, is PostScript, which a
 * browser cannot read: it is told apart, to say how to save it.
 *
 * The readers load only when such a file is picked: UTIF for TIFF, PDF.js
 * for PDF (run on the page, its worker module loaded beside it).
 */

import { sniffLogoMime, type LogoMime } from './logoLibrary.js';

export type PrintFileKind = 'tiff' | 'pdf' | 'postscript';

/** What `<input accept>` offers: the pictures read as they are and the
 *  print files made into PNG (and EPS, to say why it is not read). */
export const PICTURE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,.svg,image/tiff,.tif,.tiff,application/pdf,.pdf,.ai,.eps,application/postscript';

/** The print file `bytes` are, by their first bytes. */
export function sniffPrintFile(bytes: Uint8Array): PrintFileKind | undefined {
  const at = (i: number, ...b: number[]) => b.every((x, j) => bytes[i + j] === x);
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return 'tiff';
  // A DOS EPS: its PostScript after a binary header.
  if (at(0, 0xc5, 0xd0, 0xd3, 0xc6)) return 'postscript';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (head.startsWith('%PDF-')) return 'pdf';
  if (head.startsWith('%!PS')) return 'postscript';
  // A PDF may start after a few bytes of something else.
  if (head.includes('%PDF-')) return 'pdf';
  return undefined;
}

/** At most this many pixels in a picture made from a print file: what
 *  every browser's canvas draws (Safari's limit). */
const MAX_PIXELS = 16_000_000;
const PDF_PPI = 300;

/** A picture read from a file; `page` for one of a PDF's several pages. */
export type ReadPicture = { bytes: Uint8Array; mime: LogoMime; page?: number };

/** A file's pictures (one, or a PDF's pages) as the libraries keep them;
 *  'postscript' for a file a browser cannot read, undefined for one that
 *  is no picture. */
export async function readPictureFile(file: File): Promise<ReadPicture[] | 'postscript' | undefined> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffLogoMime(bytes);
  if (mime) return [{ bytes, mime }];
  const kind = sniffPrintFile(bytes);
  if (kind === 'postscript') return 'postscript';
  if (!kind) return undefined;
  try {
    const canvases = kind === 'tiff' ? [await tiffCanvas(bytes)] : await pdfCanvases(bytes);
    const out: ReadPicture[] = [];
    for (const [i, canvas] of canvases.entries()) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (blob) out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png', ...(canvases.length > 1 ? { page: i + 1 } : {}) });
    }
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/** A picture's name: its file's, with its page when it is one of several. */
export function pictureName(fileName: string, page?: number): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return page ? `${base} · ${page}` : base;
}

/** The scale that keeps `width` × `height` within {@link MAX_PIXELS}. */
const fitScale = (width: number, height: number) => Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));

type Utif = {
  decode(buffer: ArrayBuffer): { width?: number; height?: number }[];
  decodeImage(buffer: ArrayBuffer, ifd: object): void;
  toRGBA8(ifd: object): Uint8Array;
};

async function tiffCanvas(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const mod = (await import('utif')) as unknown as { default?: Utif } & Utif;
  const UTIF = mod.default ?? mod;
  const buffer = bytes.slice().buffer;
  const ifds = UTIF.decode(buffer);
  const ifd = ifds[0];
  if (!ifd) throw new Error('no image in the TIFF');
  UTIF.decodeImage(buffer, ifd);
  const { width = 0, height = 0 } = ifd;
  const rgba = UTIF.toRGBA8(ifd);
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, width * height * 4) as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const k = fitScale(width, height);
  if (k >= 1) return full;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(width * k));
  out.height = Math.max(1, Math.round(height * k));
  out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  return out;
}

/** The most pages of a PDF made into pictures. */
const MAX_PAGES = 20;

async function pdfCanvases(bytes: Uint8Array): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist');
  // PDF.js runs its worker's code on the page when it finds it here, so no
  // worker file has to be served.
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import('pdfjs-dist/build/pdf.worker.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const out: HTMLCanvasElement[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = (PDF_PPI / 72) * fitScale((base.width * PDF_PPI) / 72, (base.height * PDF_PPI) / 72);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      // PDF.js draws on an opaque context of its own, white under the page,
      // unless given one with transparency and told to lay nothing.
      const canvasContext = canvas.getContext('2d')!;
      await page.render({ canvas, canvasContext, viewport, background: 'rgba(0,0,0,0)' }).promise;
      out.push(canvas);
    }
    return out;
  } finally {
    void doc.destroy();
  }
}
