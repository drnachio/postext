/**
 * Print files read in the browser (#1669): a PDF, and an Illustrator file
 * saved PDF-compatible (Illustrator's default), become pictures, one per
 * page (per artboard), drawn at 300 ppi on nothing so what the page leaves
 * empty stays clear. An EPS, or an Illustrator file saved without its PDF,
 * is PostScript, which a browser cannot read: it is told apart, so the
 * reader can say how to save it.
 *
 * pdf.js loads only when such a file is dropped. It parses the file in a
 * module worker of its own, ended with the file; the pages are drawn on
 * the page one at a time, each encoded and its canvas and page freed
 * before the next. A file, a page and a picture all have limits.
 */

export type PrintFileKind = 'pdf' | 'postscript';

/** The largest print file read: a PDF past this is turned away unread. */
export const MAX_PRINT_FILE_BYTES = 200 * 1024 * 1024;
/** The most pages of a PDF made into pictures. */
export const MAX_PDF_PAGES = 20;
/** At most this many pixels in a picture: what every browser's canvas
 *  draws (Safari's limit). */
export const MAX_CANVAS_PIXELS = 16_000_000;
const PDF_PPI = 300;

/** The print file `bytes` are, by their first bytes. */
export function sniffPrintFile(bytes: Uint8Array): PrintFileKind | undefined {
  const at = (i: number, ...b: number[]) => b.every((x, j) => bytes[i + j] === x);
  // A DOS EPS: its PostScript after a binary header.
  if (at(0, 0xc5, 0xd0, 0xd3, 0xc6)) return 'postscript';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (head.startsWith('%!PS')) return 'postscript';
  // A PDF may start after a few bytes of something else.
  if (head.includes('%PDF-')) return 'pdf';
  return undefined;
}

/** The scale that keeps `width` × `height` within {@link MAX_CANVAS_PIXELS}. */
export function fitScale(width: number, height: number): number {
  return width * height > 0 ? Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height))) : 1;
}

/** A page of a PDF drawn as a PNG. */
export interface PdfPagePicture {
  png: ArrayBuffer;
  width: number;
  height: number;
  /** 1-based; `pages` is how many the file has. */
  page: number;
  pages: number;
}

/** The pages of a PDF as pictures, the first {@link MAX_PDF_PAGES}. */
export async function readPdfPages(bytes: Uint8Array): Promise<PdfPagePicture[]> {
  const pdfjs = await import('pdfjs-dist');
  const port = new Worker(new URL('./pdfjs.worker.js', import.meta.url), { type: 'module' });
  const worker = pdfjs.PDFWorker.create({ port: port as never });
  const task = pdfjs.getDocument({ data: bytes, worker, enableXfa: false, isOffscreenCanvasSupported: true });
  try {
    const doc = await task.promise;
    const out: PdfPagePicture[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: PDF_PPI / 72 });
      const viewport = page.getViewport({ scale: (PDF_PPI / 72) * fitScale(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      try {
        // Nothing laid under the page: where it draws nothing, the picture is clear.
        await page.render({ canvas, viewport, background: 'rgba(0,0,0,0)' }).promise;
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (blob) out.push({ png: await blob.arrayBuffer(), width: canvas.width, height: canvas.height, page: n, pages: doc.numPages });
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return out;
  } finally {
    await task.destroy().catch(() => undefined);
    worker.destroy();
    port.terminate();
  }
}
