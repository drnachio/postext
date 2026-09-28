import type { PdfFontWarning } from 'postext-pdf';

/** The font warnings of the last PDF the PDF tab generated (issue #196):
 *  characters a face lacks, a variable font set at its default weight, a
 *  large CFF face embedded whole. The Checks panel lists them until the
 *  next generation replaces them. A font fallback is left out: the
 *  provider's italic-to-upright stand-in is routine in the Sandbox. */
export type PdfFontCheck = Extract<PdfFontWarning, { kind: 'missingGlyph' | 'variableFontDefaultInstance' | 'cffEmbeddedWhole' }>;

let current: readonly PdfFontCheck[] = [];
const listeners = new Set<() => void>();

/** Whether a PDF warning is one the Checks panel lists. */
export function isPdfFontCheck(warning: { kind: string }): warning is PdfFontCheck {
  return warning.kind === 'missingGlyph' || warning.kind === 'variableFontDefaultInstance' || warning.kind === 'cffEmbeddedWhole';
}

/** The font warnings of the last PDF generated. */
export function pdfFontChecks(): readonly PdfFontCheck[] {
  return current;
}

/** Replace the list with a new generation's warnings. */
export function setPdfFontChecks(checks: readonly PdfFontCheck[]): void {
  if (checks.length === 0 && current.length === 0) return;
  current = checks;
  for (const cb of listeners) cb();
}

/** Be told when {@link pdfFontChecks} changes; returns the unsubscribe
 *  function. */
export function onPdfFontChecksChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
