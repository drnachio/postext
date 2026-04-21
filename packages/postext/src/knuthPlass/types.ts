// ---------------------------------------------------------------------------
// Data model: Box / Glue / Penalty
// ---------------------------------------------------------------------------

export interface KPBox {
  type: 'box';
  width: number;
  sourceIndex: number;
  meta?: unknown;
}

export interface KPGlue {
  type: 'glue';
  width: number;
  stretch: number;
  shrink: number;
  sourceIndex: number;
  meta?: unknown;
}

export interface KPPenalty {
  type: 'penalty';
  width: number;
  penalty: number;
  flagged: boolean;
  sourceIndex: number;
  meta?: unknown;
}

export type KPItem = KPBox | KPGlue | KPPenalty;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface KPOptions {
  /** Available width for each line (varies with indent). */
  lineWidth: (lineIndex: number) => number;
  /** Normal space width for the font. */
  normalSpaceWidth: number;
  /** Max space stretch as multiplier of normalSpaceWidth (e.g. 1.5). */
  maxStretchRatio: number;
  /** Min space width as multiplier of normalSpaceWidth (e.g. 0.8). */
  minShrinkRatio: number;
  /** Penalty for two consecutive hyphenated lines. */
  consecutiveHyphenDemerit?: number;
  /** Penalty for adjacent lines of very different tightness. */
  fitnessClassDemerit?: number;
  /** Equivalent-badness added to the final line when it is shorter than
   *  `runtMinWidth` — enters the squared demerit formula on the same scale as
   *  `badness` (and hyphen penalties). 0 (default) disables runt avoidance.
   *  As a reference, `badness` saturates at 10000, so values ≳ 1000 will
   *  dominate most feasible layouts; values around 100–500 nudge. */
  runtPenalty?: number;
  /** Minimum content width (in px) the final line must have to avoid the runt
   *  penalty. Typically `runtMinCharacters * normalSpaceWidth`. */
  runtMinWidth?: number;
}

// ---------------------------------------------------------------------------
// Rich-token adapter metadata (public — referenced by consumers)
// ---------------------------------------------------------------------------

export interface RichTokenMeta {
  bold: boolean;
  italic: boolean;
  originalTokenIndex: number;
  /** Character index within the original token where this sub-box starts. */
  subStart?: number;
  /** Character index within the original token where this sub-box ends. */
  subEnd?: number;
}
