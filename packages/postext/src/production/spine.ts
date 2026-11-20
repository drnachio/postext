import { resolveFolioConfig } from '../defaults/output/folio.js';
import type { FolioPaperConfig } from '../types/output/folio.js';

/** Consecutive pages printed on one paper. */
export interface PageRun {
  pages: number;
  grammage: number;
  bulk: number;
}

/** The pages of a laid-out book grouped into runs of one paper: each page
 *  on its `:::paper` stock (`page.paper`) over the book's own (`paper`,
 *  usually `config.folio.paper`), the stock's defaults filling the rest. */
export function pageRunsOf(pages: readonly { paper?: FolioPaperConfig }[], paper?: FolioPaperConfig): PageRun[] {
  const runs: PageRun[] = [];
  for (const page of pages) {
    const p = resolveFolioConfig({ paper: { ...paper, ...page.paper } }).paper;
    const last = runs[runs.length - 1];
    if (last && last.grammage === p.grammage && last.bulk === p.bulk) last.pages++;
    else runs.push({ pages: 1, grammage: p.grammage, bulk: p.bulk });
  }
  return runs;
}

/** The page count rounded up to whole signatures, and the blank pages that
 *  adds. Without a signature, the count rounded up to an even number. */
export function signaturePages(pages: number, signature?: number): { pages: number; blanks: number } {
  const unit = signature && signature > 0 ? signature : 2;
  const rounded = Math.ceil(pages / unit) * unit;
  return { pages: rounded, blanks: rounded - pages };
}

/** Thickness of one leaf (two pages), mm: grammage × bulk is its caliper
 *  in µm. */
export const leafMm = (grammage: number, bulk: number): number => (grammage * bulk) / 1000;

export interface SpineReading {
  /** Pages after rounding to the signature, and the blanks that added. */
  pages: number;
  blanks: number;
  /** Thickness of the text block, mm. */
  block: number;
  /** Spine of the block: block + the binding's allowance, mm. */
  spine: number;
}

/** The spine of a book from its runs of paper: each run's leaves × the
 *  caliper of its paper, the blanks of the last signature on the last
 *  run's paper, plus `allowance` (glue, sewing, cover board). */
export function spineFromRuns(runs: readonly PageRun[], signature: number | undefined, allowance: number): SpineReading {
  const count = runs.reduce((n, r) => n + r.pages, 0);
  const { pages, blanks } = signaturePages(count, signature);
  let block = 0;
  runs.forEach((run, i) => {
    const own = run.pages + (i === runs.length - 1 ? blanks : 0);
    block += Math.ceil(own / 2) * leafMm(run.grammage, run.bulk);
  });
  return { pages, blanks, block, spine: block + allowance };
}

