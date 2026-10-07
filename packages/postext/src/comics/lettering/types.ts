// Inputs and outputs of the comics lettering (SPEC D3, D5): engine-made
// speech balloons, captions and sound effects laid over one panel.
//
// The lettering is self-contained: the page layout resolves the panel
// geometry, the speaker anchors and the balloon styles (all in page px)
// and calls `letterPanel`; it gets back balloons shaped like
// `VDTComicBalloon` (SPEC D5), whose text is ordinary design text.

import type { InlineSpan } from '../../parse/types';
import type { BoundingBox, VDTComicBalloon, VDTPoint } from '../../vdt';
import type { CjkLineBreakLevel } from '../../measure/cjkClasses';
import type { CjkRegion } from '../../types';

/** A point in page px. */
export type Point = VDTPoint;

/** An axis-aligned rectangle in page px. */
export type Rect = BoundingBox;

/** The outline of a balloon body (SPEC D3.2). `none` sets the text alone
 *  (sound effects, loose lettering), with an optional halo. */
export type BalloonShapeKind = 'oval' | 'rounded' | 'rectangle' | 'cloud' | 'burst' | 'wavy' | 'electric' | 'none';

/** The tail of a balloon (SPEC D3.2). */
export type BalloonTailKind = 'curved' | 'wedge' | 'bubbles' | 'zigzag' | 'none';

/** A corner or edge of the panel a caption (or any balloon) is butted
 *  against. `start` / `end` follow the panel's reading direction. */
export type LetteringPosition = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'top' | 'bottom';

/** A panel side, for an off-panel speaker (`tail=<side>`). `start` / `end`
 *  follow the panel's reading direction. */
export type PanelSide = 'top' | 'bottom' | 'start' | 'end';

/**
 * A balloon style with every length resolved to page px: the resolved
 * `BalloonStyleConfig` merged with the book's `LetteringConfig` (SPEC D4).
 * The font size already carries the style's `fontScale`.
 */
export interface LetteringStyle {
  /** The style id (`speech`, `thought`, `whisper`, `shout`, `caption`,
   *  `sfx`…); echoed as `ComicBalloonOut.style`. */
  id: string;
  shape: BalloonShapeKind;
  /** Body fill (hex). */
  fill: string;
  /** Outline colour (hex). */
  stroke: string;
  /** Visible outline width, px (0: no outline). */
  strokeWidth: number;
  /** A dashed outline (whisper): `true` takes dashes of 3 stroke widths
   *  apart by 2; an array gives the dash pattern in px. */
  dash?: boolean | number[];
  /** A second outline outside the first (`double`), `gap` px apart. */
  double?: boolean;
  doubleGap?: number;
  /** Seeded hand-drawn wobble of the outline, as a fraction of the radius
   *  (0 = none; 0.02–0.05 reads as hand drawn). */
  wobble?: number;
  /** Superellipse exponent of an oval (2 = ellipse; 2.2 default; 3–4 is a
   *  "loaf" or TV balloon). */
  roundness?: number;
  /** Burst: number of spikes (0 or absent: from the perimeter). */
  burstPoints?: number;
  /** Burst: spike length, px. Absent: `burstDepthRatio` of the body's
   *  mean radius (the config's unitless `burstDepth`), else 1.1 em. */
  burstDepth?: number;
  burstDepthRatio?: number;
  /** Air between the text and the outline, px, constant all round. */
  padding: number;
  /** Target width / height of the text block (horizontal text); vertical
   *  text reads it as height / width. Absent: 1.5 horizontal, 1.3 vertical. */
  aspect?: number;
  tail: BalloonTailKind;
  /** Width of the tail where it leaves the body, px. */
  tailWidth: number;
  /** How far the tail runs toward its target, as a fraction of the gap
   *  from the body edge to the target (default 0.55). */
  tailReach?: number;
  /** The tip never comes closer to its target than this, px (default
   *  0.5 em). */
  tailGap?: number;
  /** What the tail aims at: the speaker's mouth, or the head (thought). */
  target?: 'mouth' | 'head';
  /** Default position (captions: a corner); `auto` = placed freely. */
  position?: 'auto' | LetteringPosition;
  /** Flush against the panel border (captions): no inset from the border
   *  at a corner or edge position. */
  butt?: boolean;
  /** Corner radius of a `rounded` body, px (absent: 0.6 em). */
  radius?: number;
  // Text.
  fontFamily: string;
  fontSizePx: number;
  /** Leading as a multiplier of the font size. */
  lineHeight: number;
  fontWeight?: number;
  italic?: boolean;
  color: string;
  textTransform?: 'none' | 'uppercase';
  /** Tracking, px (never applied to joining scripts). */
  letterSpacing?: number;
  align?: 'center' | 'start';
  /** How `*emphasis*` prints: bold italic (the comics convention; bold only
   *  in scripts without italics), or as written. Default `bold-italic`. */
  emphasis?: 'bold-italic' | 'as-written';
  /** Latin text may be hyphenated (default never). */
  hyphenate?: boolean;
  /** Writing mode of this style: `auto` follows the panel (vertical in
   *  vertical locales); sound effects may force `horizontal`. */
  writingMode?: 'auto' | 'horizontal' | 'vertical';
  /** Vertical text: most characters per column (default 8). */
  maxColumnChars?: number;
  /** House rules (SPEC D3.1). `dropFinalStop`: drop a final 。 (ja / zh);
   *  `doubleDash`: em dash → `--` (US comics). Default: from the locale
   *  for `dropFinalStop`, off for `doubleDash`. */
  dropFinalStop?: boolean;
  doubleDash?: boolean;
  /** Outline around the glyphs, under them (sound effects, text on art),
   *  px; 0 / absent: none. */
  halo?: number;
  haloColor?: string;
  /** Default rotation in degrees (sound effects), clockwise. */
  rotate?: number;
}

/** Text of a lettering item: plain text (a newline or U+2028 is a forced
 *  line break), or inline spans as the Markdown parser gives them
 *  (`parseInlineFormatting` / `parseInlineSnippetSpans`). Bold, italic,
 *  superscript and subscript, and in vertical text `:tcy` / `:upright` /
 *  `:sideways` are set; ruby, isolates and other annotations print as
 *  their plain text. */
export type LetteringText = string | readonly InlineSpan[];

/** One balloon, caption, sound effect or note of a panel's script. */
export interface LetteringItem {
  /** Stable id; seeds every jittered outline (determinism). */
  id: string;
  /** Reading order within the page (the script order). */
  order: number;
  kind: 'balloon' | 'caption' | 'sfx' | 'note';
  /** Speaker id: matches `LetteringPanel.anchors[].id`. */
  speaker?: string;
  text: LetteringText;
  /** Source offsets of each character of the item's plain text (the
   *  concatenated span texts), for click-to-source. */
  sourceMap?: readonly number[];
  sourceStart: number;
  sourceEnd: number;
  style: LetteringStyle;
  /** Pinned centre of the balloon (`at="x% y%"`), page px. */
  pin?: Point;
  /** Pinned to a corner / edge (`at=top-start`…). */
  position?: LetteringPosition;
  /** Tail target override: a page point (`to=`), or a panel side for an
   *  off-panel speaker (`tail=<side>`). */
  tailTarget?: Point | PanelSide;
  /** `none` drops the tail; `auto` (default) aims it at the speaker. */
  tail?: 'auto' | 'none';
  /** Join with the previous balloon of the same speaker: `true` takes the
   *  default mode, `false` forbids it; absent: `LetteringEnv.joinSameSpeaker`. */
  join?: boolean | 'butt' | 'connector';
  /** May cross the panel border (fallback before covering avoid zones). */
  breakBorder?: boolean;
  /** Rotation in degrees (sound effects), clockwise; else the style's. */
  rotate?: number;
  /** Scale of the lettering size (sound effects, `size=`). */
  sizeScale?: number;
  /** The line's own writing mode (`vertical` / `horizontal`), over the
   *  style's and the panel's: an untranslated ドン kept in a column in a
   *  horizontal edition. A column of Japanese or Chinese in a book of
   *  another language is set by the rules of the language its text is in
   *  (kana: Japanese). */
  writingMode?: 'vertical' | 'horizontal';
}

/** A point of the art a balloon can aim at or must keep clear of. */
export interface LetteringAnchor {
  /** Speaker id (or any point id; `sfx` is where a sound effect goes). */
  id: string;
  /** Speech target (page px). */
  mouth: Point;
  /** Thought target (page px); else the mouth. */
  head?: Point;
  /** Region never covered by a balloon (page px). */
  face?: Rect;
  /** Whether the mouth is inside the visible panel (not cropped away). */
  visible: boolean;
}

/** One panel as the lettering sees it. */
export interface LetteringPanel {
  /** Index of the panel on its page; echoed as `ComicBalloonOut.panelIndex`. */
  index: number;
  /** The cell polygon (convex), page px, clockwise or not. */
  polygon: readonly Point[];
  bbox: Rect;
  /** Keep-out from the panel border for balloons (`lettering.inset`), px. */
  insetPx: number;
  /** Reading direction of the page. */
  direction: 'ltr' | 'rtl';
  /** Writing mode the balloons of this panel default to. */
  writingMode: 'horizontal' | 'vertical';
  /** Locale of the text (BCP 47). */
  locale: string;
  anchors: readonly LetteringAnchor[];
  /** Regions balloons must not cover (hands, key objects), page px. */
  avoid?: readonly Rect[];
  /** Regions better left uncovered, page px: a balloon over them costs a
   *  little per area, but is never a fault (the picture's safe area, when
   *  the art marks no face and no avoid zone); `weight` scales the cost
   *  (default 1). */
  softAvoid?: readonly (Rect & { weight?: number })[];
  dpi: number;
  /** The other panels of the page (their boxes, px): a balloon that runs
   *  out of its panel must never run into one of them. */
  neighbours?: readonly Rect[];
  /** The live area of the page (the comic's frame, px): lettering keeps
   *  inside it — a panel that bleeds is lettered in its part inside it —
   *  unless it breaks the border on purpose (`breakBorder`, a pin). */
  limit?: Rect;
  /** The trim of the sheet, px: a balloon that breaks its border on
   *  purpose may leave the live area, never the trim (less `insetPx`).
   *  Default: `limit`. */
  trim?: Rect;
  /** How far a sound effect that breaks its border on purpose may run,
   *  px: the trim, and the bleed on the sides the panel bleeds to (drawn
   *  sound runs off the page with the art). Default: `trim`. */
  sheet?: Rect;
  /** The balloons other panels of the page set already (their boxes, px):
   *  a balloon that leaves its panel never covers one. */
  foreign?: readonly Rect[];
  /** Width of the panel's border, px (centred on the polygon): a butted
   *  caption sits against its inner edge, its outline over the border. */
  borderPx?: number;
}

/** Measuring context and book-wide settings. Text is measured through the
 *  engine's measurer (`measureTextWidth`: the canvas in a browser, a stub
 *  in tests), as every design text is. */
export interface LetteringEnv {
  /** Join consecutive balloons of one speaker (SPEC D4
   *  `lettering.joinSameSpeaker`); default `butt`. */
  joinSameSpeaker?: 'butt' | 'connector' | 'none';
  /** CJK line-break level; default `ja-very-strict` for Japanese, `gb`
   *  for Chinese. */
  cjkLineBreak?: CjkLineBreakLevel;
  /** CJK region for vertical cells; default from the locale. */
  cjkRegion?: CjkRegion;
  /** Local improvement passes after the greedy placement (default 3). */
  passes?: number;
  /** First join-group number of this panel's balloons (group numbers run
   *  on across the panels of a page); default 0. */
  groupBase?: number;
  /** Mirror flag of the frame the text is painted in (balloons are painted
   *  on the sheet: false). */
  mirrored?: boolean;
}

/** Why a balloon could not be placed cleanly (warning
 *  `comicBalloonOverflow`). */
export interface LetteringDiagnostic {
  itemId: string;
  panelIndex: number;
  sourceStart: number;
  sourceEnd: number;
  /** What it still does wrong: covers a face, overlaps another balloon,
   *  runs outside the panel, covers an avoid zone or an anchor. */
  reasons: ('face' | 'balloon' | 'outside' | 'avoid' | 'anchor')[];
  /** Which fallbacks were taken (SPEC D3.3 step 5). */
  fallbacks: ('breakBorder' | 'coverAvoid' | 'reshape')[];
}

/** A lettered balloon, caption or sound effect: the VDT's
 *  `VDTComicBalloon` (SPEC D5). Its `shape` is one compound path (page px;
 *  M L C Z only) painted Comicraft's way: stroked at twice `strokeWidth`,
 *  then filled, so overlapping subpaths (joined bodies, the tail) merge
 *  into one outline. */
export type ComicBalloonOut = VDTComicBalloon;

/** `letterPanel` with its diagnostics. */
export interface LetteringResult {
  balloons: ComicBalloonOut[];
  diagnostics: LetteringDiagnostic[];
}
