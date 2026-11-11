// The Check for print dialog's content as data, for the WebMCP `check`
// action of `sandbox_run_viewer` (#1474): the same items, findings and
// verdict, worded as the dialog words them.

import type { PrintPdfReport } from 'postext-pdf/worker';
import type { SandboxLabels } from '../../types/index.js';
import { findingSeverity, pdfCheckItems, pdfCheckVerdict } from '../../print/pdfCheck.js';
import { detailFor } from '../../sidebar/WarningsPanel/details.js';
import { titleFor } from '../../sidebar/WarningsPanel/titles.js';
import type { ViewerPrintCheck } from '../viewerControls.js';
import type { PdfCheckData } from './usePdfCheck.js';

export function printCheckReport(
  report: PrintPdfReport | undefined,
  data: PdfCheckData,
  file: { stale: boolean; chapterOnly: boolean },
  labels: SandboxLabels,
): ViewerPrintCheck {
  const items = pdfCheckItems({
    report,
    print: data.print,
    colorSpace: data.colorSpace,
    bookSpotInks: data.bookSpotInks,
    cutLines: data.cutLines,
    stale: file.stale,
    chapterOnly: file.chapterOnly,
  }, labels);
  const verdict = pdfCheckVerdict(items, data.findings) as ViewerPrintCheck['verdict'];
  return {
    verdict,
    verdictText: verdict === 'critical' ? labels.pdfCheckHasCritical : verdict === 'warning' ? labels.pdfCheckHasWarnings : labels.pdfCheckReady,
    notChecked: labels.pdfCheckNotChecked,
    items: items.map((i) => ({ id: i.id, group: i.group, severity: i.severity, title: i.title, ...(i.detail ? { detail: i.detail } : {}) })),
    findings: data.findings.map((w) => ({
      kind: w.payload.kind === 'preflight' ? w.payload.check.kind : w.payload.kind,
      severity: findingSeverity(w),
      title: titleFor(w.payload, labels),
      detail: detailFor(w.payload, labels),
      ...(w.payload.kind === 'preflight' && w.payload.page !== undefined ? { page: w.payload.page } : {}),
    })),
    preflightRan: data.preflightRan,
  };
}
