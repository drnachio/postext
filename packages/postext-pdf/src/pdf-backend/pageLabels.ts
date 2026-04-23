import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFString,
  type PDFDocument,
} from 'pdf-lib';
import type { PageLabelRun, VDTDocument } from 'postext';
import { collectPageLabelRuns } from 'postext';

/**
 * postext `NumeralStyle` → PDF `/S` style code. PDF 1.7 §12.4.2 supports
 * `/D` (decimal), `/R` (upper roman), `/r` (lower roman), `/A` (upper
 * letters A–Z, AA–ZZ), `/a` (lower letters a–z, aa–zz). The PDF letter
 * variants only survive up to 26 (AA repeats A twice, not 27) so we
 * only emit them when the entire run fits within ±26; otherwise we
 * drop the style and emit per-page `/P` prefix entries carrying the
 * literal label.
 */
const STYLE_CODE: Record<string, 'D' | 'R' | 'r' | 'A' | 'a' | null> = {
  decimal: 'D',
  'upper-roman': 'R',
  'lower-roman': 'r',
  'upper-alpha': 'A',
  'lower-alpha': 'a',
};

/** Emit a `/PageLabels` number tree on the PDF catalog. No-op when
 *  `doc.pages` is empty. Alpha runs whose max value exceeds 26 fall back
 *  to per-page `/P` prefix entries so PDF viewers show the exact postext
 *  label (`AA`, `AB`, …) rather than the PDF repeated-letter scheme. */
export function addPageLabels(pdfDoc: PDFDocument, doc: VDTDocument): void {
  if (doc.pages.length === 0) return;

  const ctx = pdfDoc.context;
  const nums = PDFArray.withContext(ctx);
  const runs: PageLabelRun[] = collectPageLabelRuns(
    doc.pages.map((p) => ({
      value: p.pageNumberValue,
      label: p.pageLabel,
      format: p.pageNumberFormat,
    })),
  );

  for (const run of runs) {
    const code = STYLE_CODE[run.format] ?? null;
    const isAlpha = run.format === 'upper-alpha' || run.format === 'lower-alpha';

    if (isAlpha && run.maxValue > 26) {
      for (let i = run.startPageIndex; i <= run.endPageIndex; i++) {
        const page = doc.pages[i]!;
        const dict = PDFDict.withContext(ctx);
        dict.set(PDFName.of('P'), PDFString.of(page.pageLabel));
        nums.push(PDFNumber.of(i));
        nums.push(dict);
      }
      continue;
    }

    const dict = PDFDict.withContext(ctx);
    if (code) dict.set(PDFName.of('S'), PDFName.of(code));
    if (run.startAt !== 1) dict.set(PDFName.of('St'), PDFNumber.of(run.startAt));
    nums.push(PDFNumber.of(run.startPageIndex));
    nums.push(dict);
  }

  const pageLabels = PDFDict.withContext(ctx);
  pageLabels.set(PDFName.of('Nums'), nums);
  pdfDoc.catalog.set(PDFName.of('PageLabels'), pageLabels);
}
