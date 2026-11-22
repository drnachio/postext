// The cover sheet written as a PDF for the printer (#1669), the way the PDF
// tab writes a book: its writer settings (print, colour space, output
// profile, the pictures' bytes, the cover's own files beside them), on a
// PDF worker, then the preflight on the sheet. The Cover panel's export
// and `sandbox_cover_export` both write it so.

import type { VDTDocument } from 'postext';
import type { BuiltCover } from 'postext/production';
import type { PdfWorkerHandle, RenderProgress } from 'postext-pdf/worker';
import type { createPdfFontProvider } from '../viewport/pdf/pdfFontProvider.js';
import { pdfWarnings, pdfWriterSettings } from '../viewport/pdf/pdfWriterOptions.js';
import { pdfCheckData } from '../viewport/pdf/usePdfCheck.js';
import type { Warning } from '../warnings/types.js';

/** A file name from a version and what is written of it. */
export const coverFileName = (s: string): string => s.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'cover';

export async function writeCoverPdf(
  built: BuiltCover,
  doc: VDTDocument,
  worker: PdfWorkerHandle,
  fontProvider: ReturnType<typeof createPdfFontProvider>,
  onProgress?: (p: RenderProgress) => void,
): Promise<{ bytes: Uint8Array; findings: readonly Warning[] }> {
  const resources = built.content.resources ?? [];
  const settings = await pdfWriterSettings(built.config, resources);
  // Copies: the worker takes the buffers it is sent, and the built cover's
  // files are painted and written again.
  for (const [id, bytes] of Object.entries(built.files)) settings.resourceBytes.set(id, bytes.slice());
  const { onWarning, fontChecks } = pdfWarnings();
  const bytes = await worker.render([doc], { ...settings, fontProvider, onWarning, ...(onProgress ? { onProgress } : {}) });
  return { bytes, findings: pdfCheckData(built.config, resources, [doc], fontChecks).findings };
}
