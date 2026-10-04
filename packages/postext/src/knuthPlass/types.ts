// ---------------------------------------------------------------------------
// Data model: Box / Glue / Penalty
// ---------------------------------------------------------------------------

export interface KPBox {
  type: 'box';
  width: number;
  sourceIndex: number;
  meta?: unknown;
  /** Characters the box paints as text: what tracking would spread (see
   *  `KPOptions.trackingPerChar`). 0 or absent for a formula or a swatch. */
  chars?: number;
  /** A box tracking must not reach (a chip paints its own runs): a line
   *  that holds one takes no tracking. */
  noTracking?: boolean;
  /** How much the box itself may widen (px), counted with its line's glue
   *  stretch: an Arabic word's kashida capacity (`measure/kashida.ts`).
   *  Absent: rigid. */
  stretch?: number;
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
  /** Characters the break adds to its line (the hyphen of a syllable). */
  chars?: number;
  /** A dictionary syllable of ragged text: taken only where sending the
   *  word whole to the next line would leave more than
   *  `KPOptions.hyphenationZone` empty (see there). */
  zoned?: boolean;
  /** Width (px) the break adds at the start of the next line, and its
   *  characters: the hyphen of a compound repeated there
   *  (`MeasureBlockOptions.repeatHyphen`). TeX's post-break text. */
  postWidth?: number;
  postChars?: number;
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
  /** Scale `runtPenalty` by the final line's shortfall: a last line of
   *  content width `w` pays `runtPenalty × (1 − w / runtMinWidth)`, so the
   *  shorter the runt the dearer it is. Default false: every runt pays the
   *  whole penalty. */
  runtGraded?: boolean;
  /** Line numbers (1-based) that must not end on a hyphen: the lines that
   *  close a column or a page (`BodyTextConfig.hyphenateAcrossColumns`). A
   *  hyphenated break ending one of them costs
   *  {@link COLUMN_END_HYPHEN_BADNESS} more, so the breaker takes a
   *  whole-word break there whenever one keeps the spaces within their
   *  limits. Line counts are kept apart up to the last of them. */
  avoidHyphenAtLines?: readonly number[];
  /** Item positions the first lines must break at, in order: line 1 ends
   *  at `fixedBreaks[0]`, line 2 at `fixedBreaks[1]`, and so on. A
   *  paragraph broken again after its first lines were placed keeps them
   *  this way (see `MeasureBlockOptions.keepBreaks`); the rest of it is
   *  broken as usual. Line counts are kept apart up to the last of them. */
  fixedBreaks?: readonly number[];
  /** TeX-style \looseness: prefer a final break sequence with exactly
   *  (natural + looseness) lines. A positive value runs the paragraph long
   *  and is taken only when every line of that sequence stays within the
   *  configured stretch limit (adjustment ratio < 1.0, i.e. word spacing
   *  below `maxStretchRatio`); a negative one runs it short (every feasible
   *  sequence keeps its spaces at or above `minShrinkRatio`) and is taken
   *  only when none of its lines that stay justified sets its word spaces
   *  wider than `maxStretchRatio` or than the natural sequence's loosest
   *  such line, whichever is looser, and it has no more lines past 3× the
   *  normal space (which the pipeline sets ragged) than the natural one
   *  (EF-65). Falls back silently to the natural solution when no such
   *  sequence exists. Default 0 (off). */
  looseness?: number;
  /** The line index from which `lineWidth` no longer varies (1 when only
   *  the first line is indented, 0 when no line is). Lets the DP merge
   *  active nodes that differ only in their line count: from that line on
   *  two nodes at the same break with the same fitness class face the same
   *  future, so the cheaper one dominates — without it the set of active
   *  nodes grows with the paragraph and the search goes quadratic. Ignored
   *  while `looseness` asks for an exact line count, long or short. */
  lineWidthUniformFrom?: number;
  /** Tracking a justified line may take, in px added after every character
   *  (either way), when its word spaces alone would stretch past the
   *  stretch limit or shrink past the shrink limit: the part of the
   *  adjustment beyond the limit goes into the letters, up to this much a
   *  character (`bodyText.maxJustifyTracking`). A line of one word, or one
   *  holding a chip, takes none. 0 or absent: off. See `adjustLine`. */
  trackingPerChar?: number;
  /** A ragged setting (`MeasureBlockOptions.optimalRagged`): every line
   *  but the last gets this much stretch (px) on top of its glue's, the
   *  right-hand glue of Knuth and Plass's ragged model, and the word spaces
   *  are given none. A line short of its measure by this much has the
   *  badness of a justified line at its stretch limit. The looseness gate
   *  on word spacing does not apply. Unset or 0: justified. */
  raggedStretch?: number;
  /** Hyphenation zone of ragged text (px), the rule of the line-by-line
   *  breaker: a penalty marked `zoned` ends a line only inside a word that
   *  does not fit the rest of the line, and only when the line, ended
   *  instead at the word space before that word, would fall short of its
   *  measure by more than this (a word that opens its line cannot go down).
   *  Unset: every penalty is a candidate. */
  hyphenationZone?: number;
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
  /** On a penalty: the break is bare (a hard hyphen the word carries), so
   *  the line ends as it is and no hyphen is added. */
  bare?: boolean;
  /** On a penalty: a break between ideographs — no hyphen, no penalty. */
  free?: boolean;
  /** On a free penalty: the break is next to a CJK character, so the line
   *  it ends is not `hyphenated`. */
  cjk?: boolean;
  /** On a penalty inside a Catalan `l·l`: the hyphen the line ends on takes
   *  the place of the middle dot, this many px wide. */
  replacesWidth?: number;
}
