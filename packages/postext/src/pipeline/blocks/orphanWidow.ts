export interface OrphanWidowConfig {
  avoidOrphans: boolean;
  orphanMinLines: number;
  orphanPenalty: number;
  avoidWidows: boolean;
  widowMinLines: number;
  widowPenalty: number;
  slackWeight: number;
}

export interface SplitChoice {
  /** Number of lines to place in the current column (0 means push the whole
   *  paragraph to the next column; equals totalLines means keep it here). */
  splitAt: number;
  /** Total demerit assigned to the chosen candidate (for diagnostics/tests). */
  demerit: number;
}

// Defaults — exported for UI defaults and tests.
// Kept in sync with DEFAULT_BODY_TEXT_CONFIG in defaults/bodyText.ts.
export const DEFAULT_ORPHAN_PENALTY = 1000;
export const DEFAULT_WIDOW_PENALTY = 1000;
export const DEFAULT_SLACK_WEIGHT = 10;

/**
 * Score each candidate split `k` (place `k` lines in the current column, the
 * rest in the next) and return the one with minimum total demerit.
 *
 * Soft constraints — penalty-based, not hard forbids. If the only way to honor
 * both orphan and widow constraints is unreasonable, the optimizer picks the
 * least-bad candidate.
 *
 * Pure function — no I/O, deterministic, trivially unit-testable.
 */
export function chooseParagraphSplit(
  totalLines: number,
  spaceRemaining: number,
  cfg: OrphanWidowConfig,
): SplitChoice {
  if (totalLines <= 0) return { splitAt: 0, demerit: 0 };

  const maxFit = Math.min(spaceRemaining, totalLines);
  if (maxFit <= 0) return { splitAt: 0, demerit: 0 };

  let bestSplit = maxFit >= totalLines ? totalLines : Math.max(1, maxFit);
  let bestDemerit = Number.POSITIVE_INFINITY;

  for (let k = 0; k <= maxFit; k++) {
    const tailLines = totalLines - k;
    let demerit = 0;

    if (k < spaceRemaining) {
      const slack = spaceRemaining - k;
      demerit += cfg.slackWeight * slack * slack;
    }

    // Widow: too few lines at BOTTOM of current column after a split.
    if (cfg.avoidWidows && 0 < k && k < cfg.widowMinLines && tailLines > 0) {
      demerit += cfg.widowPenalty;
    }

    // Orphan: too few lines at TOP of next column after a split.
    if (cfg.avoidOrphans && 0 < tailLines && tailLines < cfg.orphanMinLines && k > 0) {
      demerit += cfg.orphanPenalty;
    }

    if (demerit < bestDemerit) {
      bestDemerit = demerit;
      bestSplit = k;
    }
  }

  return { splitAt: bestSplit, demerit: bestDemerit };
}
