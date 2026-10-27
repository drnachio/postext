// Page labels and their runs (#1278: split out of numbering.ts).
import type { DigitSystem } from '../../types.js';
import { formatNumeral, documentNumeralStyle } from './counters.js';
import type { NumeralStyle } from './styles.js';

// ---------------------------------------------------------------------------
// Page-level numbering sequencer
// ---------------------------------------------------------------------------

/** A switch in the page-numbering sequence. At `startPageIndex`, the
 *  (optional) `format` and/or (optional) `startAt` take effect.
 *  A `format`-only segment keeps the counter flowing; a `startAt`-only
 *  segment resets the counter without changing the format. The first
 *  segment (typically pushed from `cfg.page.pageNumbering`) must set both
 *  and have `startPageIndex === 0`. */
export interface PageNumberSegment {
  startPageIndex: number;
  format?: NumeralStyle;
  startAt?: number;
}

export interface PageLabelInfo {
  value: number;
  label: string;
  format: NumeralStyle;
}

/** Assign (format, numeric value, rendered label) to every page.
 *
 *  Segments must be sorted by `startPageIndex`. The first segment is
 *  treated as the document-wide default and must define both `format`
 *  and `startAt`. Later segments with an omitted field carry over the
 *  previous one. */
export function buildPageLabels(
  pageCount: number,
  segments: PageNumberSegment[],
  /** The document's digit system: a decimal page is labelled in it, and
   *  records `arabic-indic` or `persian` as its format (see
   *  {@link documentNumeralStyle}). */
  digits?: DigitSystem,
): PageLabelInfo[] {
  if (pageCount <= 0) return [];
  if (segments.length === 0) {
    // Defensive default — behave as a plain decimal-from-1 sequence.
    return Array.from({ length: pageCount }, (_, i) => ({
      value: i + 1,
      label: formatNumeral(i + 1, 'decimal', digits),
      format: documentNumeralStyle('decimal' as NumeralStyle, digits),
    }));
  }
  const sorted = [...segments].sort((a, b) => a.startPageIndex - b.startPageIndex);
  const out: PageLabelInfo[] = new Array(pageCount);

  let curFormat: NumeralStyle = sorted[0]!.format ?? 'decimal';
  let curValue: number = sorted[0]!.startAt ?? 1;
  let segIdx = 0;
  // Absorb any segments that apply before / at page 0.
  while (segIdx < sorted.length && sorted[segIdx]!.startPageIndex <= 0) {
    const s = sorted[segIdx]!;
    if (s.format !== undefined) curFormat = s.format;
    if (s.startAt !== undefined) curValue = s.startAt;
    segIdx++;
  }

  for (let i = 0; i < pageCount; i++) {
    while (segIdx < sorted.length && sorted[segIdx]!.startPageIndex === i) {
      const s = sorted[segIdx]!;
      if (s.format !== undefined) curFormat = s.format;
      if (s.startAt !== undefined) curValue = s.startAt;
      segIdx++;
    }
    const label = formatNumeral(curValue, curFormat, digits);
    out[i] = { value: curValue, label, format: documentNumeralStyle(curFormat, digits) };
    curValue++;
  }
  return out;
}

/** One contiguous run of pages sharing `(format, counter)`. Boundary rule:
 *  a run starts whenever the format differs from the previous page or the
 *  counter is not exactly `previous + 1`. Feeds the PDF `/PageLabels`
 *  emitter. `maxValue` is the max `value` seen in the run — used by the
 *  PDF backend to detect the alpha-overflow (`>26`) case. */
export interface PageLabelRun {
  startPageIndex: number;
  endPageIndex: number;
  format: NumeralStyle;
  startAt: number;
  maxValue: number;
}

export function collectPageLabelRuns(labels: PageLabelInfo[]): PageLabelRun[] {
  const runs: PageLabelRun[] = [];
  for (let i = 0; i < labels.length; i++) {
    const p = labels[i]!;
    const prev = runs[runs.length - 1];
    if (
      prev
      && prev.format === p.format
      && p.value === prev.startAt + (i - prev.startPageIndex)
    ) {
      prev.endPageIndex = i;
      if (p.value > prev.maxValue) prev.maxValue = p.value;
      continue;
    }
    runs.push({
      startPageIndex: i,
      endPageIndex: i,
      format: p.format,
      startAt: p.value,
      maxValue: p.value,
    });
  }
  return runs;
}
