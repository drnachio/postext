/**
 * The checks the PDF tab shows before a download: what the file is (read
 * back from its bytes, `inspectPrintPdf`) set against what printing needs
 * and what the book asked for. Words come from the labels; the preflight
 * and font findings keep the Checks panel's own wording.
 */

import type { ResolvedPrintConfig, PdfColorSpace } from 'postext';
import type { PrintPdfReport } from 'postext-pdf/worker';
import type { SandboxLabels } from '../types/index.js';
import { fill } from './fillTokens.js';

export type PdfCheckSeverity = 'critical' | 'warning' | 'info' | 'ok';
export type PdfCheckGroup = 'output' | 'fonts' | 'inks';

export interface PdfCheckItem {
  id: string;
  group: PdfCheckGroup;
  severity: PdfCheckSeverity;
  title: string;
  detail?: string;
}

export interface PdfCheckInput {
  /** The file read back; undefined when it could not be. */
  report: PrintPdfReport | undefined;
  print: ResolvedPrintConfig;
  /** The colour space the PDF was asked for. */
  colorSpace: PdfColorSpace;
  /** Whether the book uses spot colours (`ColorValue.spot`). */
  bookSpotInks: readonly string[];
  /** Crop marks were asked for. */
  cutLines: boolean;
  /** The book changed since the PDF was generated. */
  stale: boolean;
  /** The PDF holds the current chapter only. */
  chapterOnly: boolean;
}

/** Bleed a printer expects beyond the trim, mm. */
const MIN_BLEED_MM = 3;

const SEVERITY_RANK: Record<PdfCheckSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };

export function worstSeverity(severities: Iterable<PdfCheckSeverity>): PdfCheckSeverity {
  let worst: PdfCheckSeverity = 'ok';
  for (const s of severities) if (SEVERITY_RANK[s] < SEVERITY_RANK[worst]) worst = s;
  return worst;
}

export function sortBySeverity<T extends { severity: PdfCheckSeverity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

const fmtMm = (n: number) => String(Math.round(n * 10) / 10);

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function pdfCheckItems(input: PdfCheckInput, labels: SandboxLabels): PdfCheckItem[] {
  const { report, print, colorSpace } = input;
  const items: PdfCheckItem[] = [];
  const add = (item: PdfCheckItem) => items.push(item);
  const pdfxAsked = print.standard !== 'none';
  const cmykAsked = pdfxAsked || colorSpace === 'cmyk';

  // ---- Output: the file as a whole.
  if (input.stale) add({ id: 'stale', group: 'output', severity: 'warning', title: labels.pdfCheckStale, detail: labels.pdfCheckStaleDetail });
  if (input.chapterOnly) add({ id: 'chapterOnly', group: 'output', severity: 'info', title: labels.pdfCheckChapterOnly, detail: labels.pdfCheckChapterOnlyDetail });
  if (!report) {
    add({ id: 'unreadable', group: 'output', severity: 'warning', title: labels.pdfCheckUnreadable });
    return items;
  }
  add({
    id: 'file',
    group: 'output',
    severity: 'ok',
    title: fill(labels.pdfCheckFile, { version: report.version, pages: report.pageCount, size: sizeLabel(report.size) }),
  });
  if (!pdfxAsked) {
    add({ id: 'noPdfx', group: 'output', severity: 'warning', title: labels.pdfCheckNoPdfx, detail: labels.pdfCheckNoPdfxDetail });
  } else if (!report.pdfx) {
    add({ id: 'pdfxMissing', group: 'output', severity: 'critical', title: labels.pdfCheckPdfxMissing });
  } else {
    const condition = report.outputIntent?.identifier ?? '';
    add({ id: 'pdfx', group: 'output', severity: 'ok', title: report.pdfx, ...(condition ? { detail: condition } : {}) });
    if (!report.outputIntent) add({ id: 'noIntent', group: 'output', severity: 'critical', title: labels.pdfCheckNoIntent });
    else if (!report.outputIntent.profileEmbedded) add({ id: 'profileNotEmbedded', group: 'output', severity: 'critical', title: labels.pdfCheckProfileNotEmbedded });
  }
  add({
    id: 'trim',
    group: 'output',
    severity: 'ok',
    title: fill(labels.pdfCheckTrim, { width: fmtMm(report.trimMm.width), height: fmtMm(report.trimMm.height) }),
  });
  if (report.mixedTrimPages > 0) {
    add({ id: 'mixedTrim', group: 'output', severity: 'warning', title: fill(labels.pdfCheckMixedTrim, { pages: report.mixedTrimPages }) });
  }
  if (report.pagesWithoutTrimBox > 0 && pdfxAsked) {
    add({ id: 'noTrimBox', group: 'output', severity: 'critical', title: fill(labels.pdfCheckNoTrimBox, { pages: report.pagesWithoutTrimBox }) });
  }
  if (report.bleedMm + 0.05 < MIN_BLEED_MM) {
    add({
      id: 'bleed',
      group: 'output',
      severity: cmykAsked ? 'warning' : 'info',
      title: fill(labels.pdfCheckBleedShort, { bleed: fmtMm(report.bleedMm), min: MIN_BLEED_MM }),
      detail: labels.pdfCheckBleedShortDetail,
    });
  } else {
    add({ id: 'bleed', group: 'output', severity: 'ok', title: fill(labels.pdfCheckBleed, { bleed: fmtMm(report.bleedMm) }) });
  }
  add({ id: 'cutLines', group: 'output', severity: 'info', title: input.cutLines ? labels.pdfCheckCutLinesOn : labels.pdfCheckCutLinesOff });
  if (!input.chapterOnly && report.pageCount % 4 !== 0) {
    add({ id: 'signatures', group: 'output', severity: 'info', title: fill(labels.pdfCheckPageMultiple, { pages: report.pageCount }), detail: labels.pdfCheckPageMultipleDetail });
  }
  if (report.annotations > 0 && print.standard === 'pdfx1a') {
    add({ id: 'annotations', group: 'output', severity: 'warning', title: fill(labels.pdfCheckAnnotations, { count: report.annotations }) });
  }

  // ---- Fonts.
  const missing = report.fonts.filter((f) => !f.embedded);
  for (const f of missing) {
    add({ id: `font-${f.name}`, group: 'fonts', severity: 'critical', title: fill(labels.pdfCheckFontNotEmbedded, { font: f.name }) });
  }
  if (report.fonts.length > 0 && missing.length === 0) {
    add({
      id: 'fontsEmbedded',
      group: 'fonts',
      severity: 'ok',
      title: fill(labels.pdfCheckFontsEmbedded, { count: report.fonts.length }),
      detail: report.fonts.map((f) => `${f.name} (${f.type}${f.subset ? `, ${labels.pdfCheckFontSubset}` : ''})`).join(' · '),
    });
  }

  // ---- Inks.
  const plates: string[] = [];
  if (report.color.cmyk) plates.push(labels.pdfCheckProcess);
  plates.push(...report.color.spots);
  if (plates.length > 0) {
    add({
      id: 'plates',
      group: 'inks',
      severity: 'ok',
      title: fill(labels.pdfCheckPlates, { count: (report.color.cmyk ? 4 : 0) + report.color.spots.length }),
      detail: plates.join(' + '),
    });
  }
  if (report.color.rgb) {
    const severity: PdfCheckSeverity = print.standard === 'pdfx1a' ? 'critical' : cmykAsked ? 'info' : 'warning';
    add({
      id: 'rgb',
      group: 'inks',
      severity,
      title: labels.pdfCheckRgb,
      detail: cmykAsked ? labels.pdfCheckRgbKeptDetail : labels.pdfCheckRgbDetail,
    });
  }
  const lostSpots = input.bookSpotInks.filter((ink) => !report.color.spots.includes(ink));
  if (lostSpots.length > 0) {
    add({
      id: 'spotsLost',
      group: 'inks',
      severity: 'warning',
      title: fill(labels.pdfCheckSpotsLost, { inks: lostSpots.join(', ') }),
      detail: cmykAsked ? labels.pdfCheckSpotsUnusedDetail : labels.pdfCheckSpotsLostDetail,
    });
  }
  if (report.transparency && print.standard === 'pdfx1a') {
    add({ id: 'transparency', group: 'inks', severity: 'critical', title: labels.pdfCheckTransparencyX1a });
  }
  if (report.overprint) {
    add({ id: 'overprint', group: 'inks', severity: 'info', title: labels.pdfCheckOverprint, detail: labels.pdfCheckOverprintDetail });
  }
  return items;
}
