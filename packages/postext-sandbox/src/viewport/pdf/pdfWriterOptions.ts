// What the PDF writer is told besides the documents and the fonts: the
// settings of `debug`, `pdfGeneration` and `print`, the output profile, the
// pictures' bytes. The PDF tab and the Books panel's compiler (#1526) build
// them here, so a book downloaded from its row is the file the PDF tab
// writes; the warnings go the same way for both (`pdfWarnings`).

import { resolveDebugConfig, resolvePdfGenerationConfig, resolvePrintConfig, type PostextConfig, type Resource } from 'postext';
import type { PdfWarning } from 'postext-pdf';
import type { PdfWorkerRenderOptions } from 'postext-pdf/worker';
import { isPdfFontCheck, type PdfFontCheck } from '../../controls/fonts/pdfFontWarnings.js';
import { loadPrintProfile, outputProfileBaseUrl } from '../../print/printSetup.js';
import { buildPdfResourceBytes } from './pdfResourceBytes.js';

/** The writer's options but the font provider and the callbacks: the
 *  pictures' bytes as maps (they cross to a worker). */
export type PdfWriterSettings = Omit<PdfWorkerRenderOptions, 'fontProvider' | 'onWarning' | 'onProgress' | 'rasterizeSvg'> & {
  resourceBytes: Map<string, Uint8Array>;
};

/**
 * The options a configuration writes its PDF with: the page negative
 * (`debug.pageNegative`), outlines, forms, colour space and tagging
 * (`pdfGeneration`), the print settings and, for a PDF/X standard or a
 * CMYK file, the output profile (catalogue or uploaded), and the bytes of
 * the resources (print masters, originals and their previews).
 * `profileBaseUrl`: where catalogue profiles are fetched from (the host's,
 * by default).
 */
export async function pdfWriterSettings(
  config: PostextConfig,
  resources: Resource[],
  { profileBaseUrl = outputProfileBaseUrl() }: { profileBaseUrl?: string } = {},
): Promise<PdfWriterSettings> {
  const debug = resolveDebugConfig(config.debug);
  const pdfGen = resolvePdfGenerationConfig(config.pdfGeneration);
  // Print production (#603): a PDF/X standard or a CMYK PDF separates
  // through the output profile, loaded here (catalogue or uploaded).
  const print = resolvePrintConfig(config.print);
  const colorSpace = pdfGen.forceColorSpace ? pdfGen.colorSpace : 'rgb';
  const outputProfile = print.standard !== 'none' || colorSpace === 'cmyk'
    ? await loadPrintProfile(print, profileBaseUrl).then((p) => p.bytes, () => undefined)
    : undefined;
  const { bytes: resourceBytes, previews: previewBytes } = await buildPdfResourceBytes(resources, config);
  return {
    pageNegative: debug.pageNegative.enabled,
    outlines: pdfGen.outlines,
    // Out of the layout key (#1491): the live settings, not the ones a
    // cached document was laid out with.
    ...(pdfGen.forms ? { forms: pdfGen.forms } : {}),
    colorSpace,
    accessible: pdfGen.accessible,
    resourceBytes,
    ...(previewBytes.size > 0 ? { previewBytes } : {}),
    ...(config.print ? { print: config.print } : {}),
    ...(outputProfile ? { outputProfile } : {}),
    profileBaseUrl,
  };
}

/** Where a PDF's warnings go: the font checks (characters a face lacks
 *  and the like) are kept for the Checks panel, a fallback or a profile
 *  that could not be had goes to the console. */
export function pdfWarnings(): { onWarning: (w: PdfWarning) => void; fontChecks: PdfFontCheck[] } {
  const fontChecks: PdfFontCheck[] = [];
  return {
    fontChecks,
    onWarning: (w) => {
      if (isPdfFontCheck(w)) fontChecks.push(w);
      else if (w.kind === 'fontFallback' || w.kind === 'outputProfileUnavailable' || w.kind === 'imageProfileUnavailable' || w.kind === 'pictureOriginalUnreadable' || w.kind === 'pageNegativeIgnored') console.warn(w.message);
    },
  };
}
