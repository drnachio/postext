// The options, hints and results of a placement pass, and the constants the
// pass and its drivers share (#1276: split out of build.ts).
import type { VDTDocument, VDTColumn } from '../../vdt.js';
import type { FontFaceSetLike } from '../../fonts/faces.js';
import type { MeasuredContentBlock } from '../blocks/measureContentBlock.js';
import type { LooseBudget } from '../columns/columnBalancing.js';
import type { BandCap, BandPassReport } from '../columns/bandCaps.js';

/** Room (px) under closing boxes a balancing pass must close to be kept on
 *  that ground alone (see `boxRoomIn`). */
export const BOX_ROOM_EPS_PX = 0.5;
/** Overflow past a capped column's foot (px) that counts as content the
 *  cut did not hold — a clipped line, not floating-point drift. */
export const CAPPED_OVERFLOW_PX = 0.5;
/** Smallest share of its width an inline figure is set at to stay in the
 *  room left in its column (`layout.fitFiguresToPage`). */
export const MIN_INLINE_FIGURE_SCALE = 0.5;

/** What sets the reservation of an in-column heading's design when it is
 *  taller than the heading's lines (#997): the id of the element that
 *  reaches lowest, or nothing when the design's `minHeight` does. */
export interface HeadingClaim {
  element?: string;
}

export interface BuildDocumentOptions {
  /**
   * Cooperative cancellation hook. Called once per top-level content block
   * during placement. Throw (or return a truthy value checked by the caller)
   * to abort. Intended for running `buildDocument` inside a Web Worker where
   * a newer request has superseded this one.
   */
  shouldCancel?: () => boolean;
  /**
   * Progress hook, called as placement advances: once per top-level content
   * block of every pass (the engine re-places the document several times —
   * band caps, column balancing — so `pass` counts up and the block counter
   * restarts). A long build can show a bar from it.
   */
  onProgress?: (progress: BuildProgress) => void;
  /**
   * Called after every placement pass with its wall time — the engine
   * re-places the document several times (band caps, column balancing,
   * contents rounds); dev tooling shows where a build's time went.
   */
  onPass?: (info: BuildPassInfo) => void;
  /**
   * The font set the build measures against (#629): by default
   * `document.fonts`, or `self.fonts` in a worker. At its start the build
   * drops what was measured in families whose faces changed since the
   * last build; at its end it lists the faces its text was set in that
   * the set could not give (`fontFallback` content warnings). `null`
   * skips both.
   */
  fontSet?: FontFaceSetLike | null;
}

/** One placement pass of a build, as reported to {@link BuildDocumentOptions.onPass}. */
export interface BuildPassInfo {
  /** 1-based pass within its contents round. */
  pass: number;
  /** 0-based round of a document laying out its own contents (see `MAX_TOC_ROUNDS`). */
  tocRound: number;
  /** Wall time of the pass in ms. */
  ms: number;
  /** Pages the pass produced. */
  pages: number;
}

export interface BuildProgress {
  /** 1-based placement pass. */
  pass: number;
  /** Top-level content blocks placed so far in this pass, and how many
   *  there are in the document. */
  blocks: number;
  totalBlocks: number;
  /** Pages opened so far in this pass. */
  pages: number;
}

export class BuildCancelledError extends Error {
  constructor() {
    super('Build cancelled');
    this.name = 'BuildCancelledError';
  }
}

/** Cross-pass hints a placement pass consumes. All keyed by content-block
 *  index; every map is optional so the plain first pass carries none. */
export interface PassHints {
  /** Column balancing: extra top spacing (px) per heading / list-end target. */
  balanceExtraPx?: ReadonlyMap<number, number>;
  /** Column balancing: K-P looseness per paragraph re-broken one line longer. */
  balanceLooseness?: ReadonlyMap<number, number>;
  /** Column balancing: shared budget of the loose candidates offered together
   *  (the pass stops loosening a column once it gained what it needs). */
  balanceLooseBudget?: ReadonlyMap<number, LooseBudget>;
  /** Band caps keyed by the span block's content index (see `bandCaps.ts`). */
  bandCaps?: ReadonlyMap<number, BandCap>;
  /** Figures (resource ids) whose side caption (`placement.captionSide`)
   *  goes under the figure instead: an earlier pass found the side column
   *  too short for a side box or side float once the caption had taken its
   *  foot, and the box spilled over the caption. */
  captionUnder?: ReadonlySet<string>;
  /** `footnotes.numbering: 'page'` / `'column'`: the number each note got
   *  where the previous build set it (see `numberFootnotesByPlacement`). */
  footnoteNumbers?: ReadonlyMap<string, string>;
  /** Trailing-cap passes: the page each floated resource took in the layout
   *  the caps level (see `proposeTrailingCap`). */
  floatPages?: ReadonlyMap<string, number>;
  /** Floats (resource ids) that head the page or column their citing line
   *  lands on (`placement.citingPage`, #633): an earlier pass found the line
   *  there and the float on a later page or column. The page is opened
   *  with the float at its head, before any text. */
  citingPageFloats?: ReadonlyMap<string, CitingPageSlot>;
}

/** Where a float set at the head of its citing page goes (#633): the page
 *  and the band-0 text column its citing line landed in. */
export interface CitingPageSlot {
  pageIndex: number;
  columnIndex: number;
}

export interface PassResult extends BandPassReport {
  doc: VDTDocument;
  /** Pages whose break into the next page was explicit (`:::pagebreak`,
   *  heading `breakBefore`, chapter opener) rather than natural content
   *  overflow — those pages keep their short last column. */
  forcedBreakPages: Set<number>;
  bandCapProposals: Map<number, BandCap>;
  spanPlacedInBand: Set<number>;
  bandCapsApplied: Set<number>;
  /** Column balancing: per loose paragraph tried in this pass, the tracking
   *  (thousandths of an em) that gained its extra line — `null` when no rung
   *  of the ladder did, so the driver can blacklist it. Candidates left
   *  untried because their column's budget was already met are absent. */
  looseOutcome: Map<number, number | null>;
  /** Column balancing on a character grid (#632): the loose paragraphs of
   *  this pass that would have gained their line only off the grid. */
  looseOffGrid: Set<number>;
  /** Figures whose side caption this pass found in the way of a side box or
   *  side float that had to overflow the side column: candidates for
   *  `PassHints.captionUnder` in the next pass. */
  captionUnderProposals: Set<string>;
  /** Floats that may head the page or column their citing line landed on
   *  in this pass (`placement.citingPage`, #633) and landed later:
   *  candidates for `PassHints.citingPageFloats`. */
  citingPageProposals: Map<string, CitingPageSlot>;
  /** Floats of `PassHints.citingPageFloats` this pass could not keep at the
   *  head of their citing page: not set there (it did not fit, an earlier
   *  float of its sequence was still waiting, the page opened at a break),
   *  or set there and the text it pushed down took the citing line to
   *  another page or column. With the reason, for the record. */
  citingPageRefused: Map<string, CitingPageRefusal>;
}

/** Why a float was not kept at the head of its citing page (#633). */
export type CitingPageRefusal = 'notSet' | 'citationMoved';

/** A resource set in the text, measured with its caption in the side
 *  column of the band of `col` (#729). */
export interface InlineAside {
  block: MeasuredContentBlock;
  opts: { captionAside: { dx: number; width: number } };
  sideCol: VDTColumn;
  col: VDTColumn;
}
