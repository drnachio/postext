'use client';

import { useMemo } from 'react';
import {
  authoredSpotColors,
  resolvePdfGenerationConfig,
  resolvePrintConfig,
  spotInks,
  spotsThroughInkTable,
  type PdfColorSpace,
  type PostextConfig,
  type Resource,
  type ResolvedPrintConfig,
  type VDTDocument,
} from 'postext';
import type { PdfFontCheck } from '../../controls/fonts/pdfFontWarnings.js';
import { preflightInputs } from '../../print/preflightInputs.js';
import { collectPreflightWarnings, pdfFontWarnings } from '../../warnings/compute.js';
import type { Warning } from '../../warnings/types.js';

/** Preflight findings that hold for the whole job: the same from every
 *  chapter, so shown once. */
const ONCE_PER_BOOK = new Set(['spotInks', 'spotInkConflict', 'spotInkName', 'spotInkSimilar', 'inkLimit']);

export interface PdfCheckData {
  print: ResolvedPrintConfig;
  colorSpace: PdfColorSpace;
  cutLines: boolean;
  /** The preflight ran (the book is set up for print). */
  preflightRan: boolean;
  /** The preflight's findings on the rendered pages, and the PDF's font
   *  warnings. */
  findings: Warning[];
  /** The spot inks the book paints in. */
  bookSpotInks: string[];
}

/** What the check of a PDF sets the file against: the configuration and
 *  resources it was rendered from, the preflight on its pages, and its
 *  font warnings. Worked out only while the check is open. */
export function usePdfCheck(open: boolean, config: PostextConfig, resources: readonly Resource[], docs: readonly VDTDocument[], fontChecks: readonly PdfFontCheck[]): PdfCheckData | null {
  return useMemo(() => (open ? pdfCheckData(config, resources, docs, fontChecks) : null), [open, config, resources, docs, fontChecks]);
}

/** {@link usePdfCheck}'s work, for a caller outside React (the WebMCP
 *  check). */
export function pdfCheckData(config: PostextConfig, resources: readonly Resource[], docs: readonly VDTDocument[], fontChecks: readonly PdfFontCheck[]): PdfCheckData {
  const print = resolvePrintConfig(config.print);
  const pdfGen = resolvePdfGenerationConfig(config.pdfGeneration);
  const colorSpace: PdfColorSpace = pdfGen.forceColorSpace ? pdfGen.colorSpace : 'rgb';
  const cutLines = docs[0]?.config.page.cutLines.enabled ?? false;
  const preflightRan = print.preflight.enabled && (print.standard !== 'none' || colorSpace === 'cmyk' || cutLines);
  const inputs = preflightInputs(config.print, resources);
  const once = new Set<string>();
  const findings: Warning[] = [];
  for (const doc of docs) {
    for (const w of collectPreflightWarnings(doc, config, resources, inputs)) {
      if (w.payload.kind === 'preflight' && ONCE_PER_BOOK.has(w.payload.check.kind)) {
        // Ink limits are per colour and page; the rich-black recipe's is
        // the job's.
        if (w.payload.check.kind !== 'inkLimit' || w.payload.check.color === 'rich-black') {
          const key = JSON.stringify(w.payload.check);
          if (once.has(key)) continue;
          once.add(key);
        }
      }
      findings.push(w);
    }
  }
  findings.push(...pdfFontWarnings(fontChecks));
  // The inks the pages paint, as the preflight found them; without a
  // preflight, the ones the configuration defines.
  const used = findings.flatMap((w) => (w.payload.kind === 'preflight' && w.payload.check.kind === 'spotInks' ? w.payload.check.inks : []));
  const bookSpotInks = preflightRan ? used : spotInks(spotsThroughInkTable(authoredSpotColors(config), new Map(), print.inks).spots.values()).inks.map((i) => i.name);
  return { print, colorSpace, cutLines, preflightRan, findings, bookSpotInks };
}
