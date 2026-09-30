import { PDFNumber, PDFOperator, PDFOperatorNames } from 'pdf-lib';

/**
 * The operators around a text segment painted stretched along the line
 * (`VDTLineSegment.inkScale`, a dash of a Chinese 破折号): horizontal
 * scaling (`Tz`, percent) before its text object and back to 100 after.
 * Empty for any other segment.
 */
export function inkScaleOperators(inkScale: number | undefined): { before: PDFOperator[]; after: PDFOperator[] } {
  if (inkScale === undefined) return { before: [], after: [] };
  return {
    before: [PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(inkScale * 100)])],
    after: [PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(100)])],
  };
}
