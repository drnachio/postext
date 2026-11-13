// The page display list (#1388): every page as resolved, positioned
// primitives in paint order, so page-faithful writers (the formatted Word
// export) need not re-derive word positions from the VDT. Physical page
// coordinates in px at `config.page.dpi`, origin at the sheet's top-left,
// y down. Pure data: no pdf-lib, no DOM.

import type { VDTDesignBoxStyle, VDTPathCommand, VDTPathStroke } from '../../vdt/design.js';

export interface DisplayRect { x: number; y: number; width: number; height: number }

/** Where a piece of text comes from (#1389 anchors). */
export interface DisplaySource {
  /** Chapter file the offsets point into: `undefined` = the document's own
   *  file, otherwise `VDTBlock.sourceChapter` (carried stories). */
  chapter?: string;
  /** Logical block identity, stable across the fragments of one block that
   *  a column or page break split (e.g. `b<contentIndex>`, `fn<id>`). */
  blockKey: string;
  /** Absolute Markdown offset (file start, front matter included) of each
   *  plain character of `text`; -1 for a character with no source (an
   *  added or repeated hyphen, a generated number, kashida, leaders). */
  map: number[];
  /** Atoms: one plain character standing for a whole construct (ref,
   *  citation, footnote ref, maths, chip, swatch, gap, tab). `at` indexes
   *  `text`; [start, end) is the construct's full source range. */
  atoms?: { at: number; start: number; end: number; kind: string }[];
  /** Text the engine generated (running heads, TOC rows, caption numbers,
   *  index entries): shown, never imported. */
  generated?: boolean;
  /** Generated text an editor takes for body text (a strip caption, a
   *  repeated resource caption): written with a `generated` map fragment
   *  so a Word edit to it comes back rejected instead of vanishing. */
  reportEdits?: boolean;
  /** For text that lives in a resource (captions, notes, table cells). */
  resource?: { resourceId: string; field: 'caption' | 'note' | 'alt' | 'cell' | 'label'; row?: number; col?: number };
}

/** One run of uniformly styled text inside a line, at its painted x. */
export interface DisplayRun {
  text: string;
  x: number;
  width: number;
  /** CSS font shorthand, as in the VDT (`italic 700 16px "EB Garamond"`). */
  fontString: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  smallCaps?: boolean;
  /** Extra advance after every glyph (px). */
  tracking?: number;
  script?: 'sup' | 'sub';
  /** Baseline shift in px, positive = up. */
  baselineShift?: number;
  href?: string;
  /** Struck through (`~~…~~`): the whole run. A word struck only in part
   *  (`~~old~~.`) is not flagged; its line is the layout's
   *  (`VDTLine.marks`). */
  strike?: boolean;
  /** Underlined (`++…++`), as {@link strike}. */
  underline?: boolean;
  footnoteId?: string;
  /** The named style that gave the run its look, when one did: a
   *  character style (`:span[…]{style="id"}`) or a chip style (every run
   *  of a chip's words). Writers that keep named styles (InDesign's
   *  character styles, #1555) name the run's style after it. */
  namedStyle?: { kind: 'span' | 'chip'; id: string };
  /** A `:ref` run's target: a resource id, or an anchor's id (`anchor`). */
  refTarget?: { id: string; anchor?: boolean };
  /** Book page index the run links to (an index entry's page number). */
  pageLink?: number;
  /** The leader before a tab stop (#622, a contents row's): its dots, or
   *  the empty run a rule leader is drawn on. */
  leader?: true;
  rtl?: boolean;
  /** Index of the run's first character in the line's `text`. */
  textStart: number;
  /** A space whose width justification set. */
  space?: boolean;
  /** Px of `width` before / after the run's characters (a chip's gap,
   *  border and padding), for writers that set the text themselves. */
  padStart?: number;
  padEnd?: number;
  /** A blank's answer (`:chip` with `blank`, #1227): it takes its room
   *  on the line but is never painted. */
  blank?: true;
  /** Embedded non-text content drawn in place of the run. A chip that is
   *  a form field (#1445) carries the field: a writer that makes forms puts
   *  one on the box, the run's text its value (`formatFieldNumber` shows a
   *  number as the canvas and the PDF do). */
  inline?: { kind: 'math' | 'score' | 'swatch' | 'chip'; svg?: string; widthPx: number; heightPx: number; ascentPx?: number; box?: DisplayChipBox; swatch?: DisplaySwatch; field?: import('../../parse/formFields.js').FormFieldSpec };
  /** The run is a ruby base (#1394, `VDTLineSegment.ruby`): its reading. */
  ruby?: DisplayRuby;
  /** Vertical text: one tate-chu-yoko cell set by `:tcy[…]` (short
   *  numbers `cjk.uprightDigits` sets upright carry no flag: writers find
   *  them as the measurer does, `verticalRuns`). */
  tcy?: boolean;
  /** Vertical text: the author's orientation (`:upright[…]`, `:sideways[…]`). */
  orientation?: 'upright' | 'sideways';
  /** The part of a warichu note set on this line: `text` is the upper
   *  row then the lower one, painted as two rows. */
  warichu?: { upper: string; lower: string; fontString: string; color?: string };
  /** Kanbun marks (返り点, 送り仮名, 竪点) painted from where the run starts. */
  kunten?: DisplayKunten;
}

/** A chip's box (`:chip[…]`, inline code), told from its first run:
 *  `dx` px from the run's x, `ascent` / `descent` px about the baseline
 *  (padding and border included). The outline is stroked inside the edge;
 *  `underline` draws it as a line under the box only. */
export interface DisplayChipBox {
  dx: number;
  width: number;
  ascent: number;
  descent: number;
  fill?: string;
  stroke?: string;
  strokeWidthPx?: number;
  radius?: number;
  underline?: 'solid' | 'dotted' | 'dashed';
}

/** A colour swatch's paint (`:swatch{…}`): the fill, the outline's ink
 *  (its own border colour, else the text's) and the shape it sets
 *  (`swatchGeometry`); `icon`: an inline symbol, not a square. */
export interface DisplaySwatch {
  color?: string;
  ink: string;
  side?: number;
  borderWidth?: number;
  radius?: number;
  icon?: boolean;
}

/** Text an annotation paints (a ruby reading, a kanbun mark), placed from
 *  its run: `dx` px along the line from the run's start, `dy` px from the
 *  line's baseline across it (positive towards the line's foot: down in
 *  horizontal text, left in vertical text), in the item's unturned frame. */
export interface DisplayAnnotation {
  text: string;
  dx: number;
  dy: number;
  fontString: string;
  color?: string;
}

export interface DisplayRuby {
  /** The reading. */
  text: string;
  /** Its font (CSS shorthand at the ruby size). */
  fontString: string;
  /** Over or under the base (over is the right side of vertical text),
   *  or beside each character (zhuyin). */
  position: 'over' | 'under' | 'right';
  /** One reading over the whole base. */
  group?: boolean;
  /** Runs of one line with the same id are one ruby (a jukugo word). */
  id?: number;
  color?: string;
  /** Distance from the base's baseline to the reading's, px (positive:
   *  over the base, the right of vertical text). */
  raise?: number;
  /** The reading as painted, placed from the run (a Japanese reading
   *  spread one run per character). */
  runs?: DisplayAnnotation[];
}

export interface DisplayKunten {
  /** The marks as painted: 返り点 (`kaeri`) and 送り仮名 (`okuri`). */
  runs: (DisplayAnnotation & { role: 'kaeri' | 'okuri' })[];
  /** The 竪点: a thin rule along the line from `dx`, centred `dy` from the
   *  baseline. */
  tate?: { dx: number; dy: number; length: number; thickness: number };
  color?: string;
}

export type LineAlign = 'justify' | 'left' | 'right' | 'center';

export interface DisplayLine {
  /** The line's characters as painted, added hyphens included. */
  text: string;
  /** Left edge of the measure the line is set in, and its width. */
  x: number;
  width: number;
  baseline: number;
  /** Height of the line box (leading) in px. */
  lineHeight: number;
  /** How the backend aligned this line (the PDF rule in `lineText.ts`),
   *  as it stands on the sheet: a ragged line of a mirrored (right-to-left)
   *  page set from its start reads `right`. */
  align: LineAlign;
  /** Width of each justified space, when `align === 'justify'`. */
  spaceWidth?: number;
  runs: DisplayRun[];
  /** Source of each character of `text` (same length), -1 = synthetic. */
  map: number[];
  /** The line ends with a hyphen the break added (not in the source). */
  addedHyphen?: boolean;
  /** The line starts with a repeated hyphen (not in the source). */
  repeatedHyphen?: boolean;
  /** Last line of its paragraph (ragged when justified). */
  last?: boolean;
  /** The line ends with a forced break in the source (`\\`). */
  hardBreak?: boolean;
  rtl?: boolean;
  vertical?: boolean;
}

/** What every item may carry: the composed-page frame (`VDTFrame.id`) it
 *  is set in, absent outside frames. */
export interface DisplayItemCommon {
  frame?: string;
}

export type DisplayItem = DisplayItemCommon & (
  | {
      kind: 'text';
      /** What the text is, for writers that style by role. */
      role: 'body' | 'heading' | 'list' | 'quote' | 'code' | 'caption' | 'note' | 'continues' | 'footnote' | 'callout' | 'header' | 'footer' | 'opener' | 'design' | 'label' | 'cell' | 'dropCap' | 'marker' | 'balloon';
      /** The block's frame on the page (column fragment, caption box…). */
      bbox: DisplayRect;
      lines: DisplayLine[];
      source?: DisplaySource;
      /** Heading level for `role === 'heading'`. */
      level?: number;
      /** Rotation of the whole item around its bbox centre, degrees clockwise. */
      rotate?: number;
      /** Engine block kind, for diagnostics. */
      blockType?: string;
      /** The paragraph style the block is set in (`VDTBlock.paragraphStyleId`),
       *  for writers that carry a paragraph's tab stops and spacing. */
      paragraphStyle?: string;
      /** Clip rectangle the backend applies (columns clip their blocks). */
      clip?: DisplayRect;
      /** A halo round the glyphs (a figure label on a busy picture, a
       *  comic's sound effect): the glyphs stroked `widthPx` out from
       *  their outline in `color`, under the text. */
      halo?: { color: string; widthPx: number };
    }
  | { kind: 'rule'; x1: number; y1: number; x2: number; y2: number; color: string; widthPx: number; dash?: number[] }
  | { kind: 'rect'; rect: DisplayRect; fill?: string; stroke?: string; strokeWidthPx?: number; radius?: number; rotate?: number; box?: VDTDesignBoxStyle }
  | { kind: 'path'; bbox: DisplayRect; subpaths: VDTPathCommand[][]; fill?: string; fillRule?: 'nonzero' | 'evenodd'; stroke?: VDTPathStroke }
  | {
      kind: 'image';
      rect: DisplayRect;
      fileId: string;
      imageKind?: 'bitmap' | 'svg';
      pdfFileId?: string;
      /** Visible part of the picture in its own unit square (safe-area crop). */
      crop?: { x: number; y: number; width: number; height: number };
      tint?: string;
      alt?: string;
      rotate?: number;
      /** Drawn flipped left to right inside `rect` (`crop` is told in the
       *  picture as stored, unflipped): comic art set mirrored. */
      flipH?: boolean;
    }
  | {
      kind: 'table';
      rect: DisplayRect;
      rotate?: number;
      columnEdges: number[];
      rowEdges: number[];
      cells: { row: number; col: number; rowSpan: number; colSpan: number; rect: DisplayRect; background?: string; align?: string; verticalAlign?: string; item: Extract<DisplayItem, { kind: 'text' }> | null; image?: Extract<DisplayItem, { kind: 'image' }> }[];
      borderColor?: string;
      borderWidthPx?: number;
      /** Which edges the border strokes, as the PDF draws them: every cell
       *  edge (`'grid'`, the default), the row edges (`'horizontal'`), the
       *  table's frame (`'outer'`) or none. */
      rules?: 'grid' | 'horizontal' | 'outer' | 'none';
      /** Radii of a rounded frame (top left, top right, bottom right,
       *  bottom left), px: the fills are clipped to it and it is stroked. */
      frameRadii?: [number, number, number, number];
    }
);

export interface DisplayPage {
  index: number;
  width: number;
  height: number;
  dpi: number;
  background?: string;
  /** Trim/bleed geometry when print production is on. */
  trim?: DisplayRect;
  /** Page label (folio as printed). */
  label?: string;
  rtl?: boolean;
  vertical?: boolean;
  items: DisplayItem[];
}

export interface DisplayListOptions {
  /** Measure a text advance (px) when joined word pieces need re-measuring;
   *  absent = sum the VDT segment widths. */
  measure?: (text: string, fontString: string, trackingPx: number) => number;
}
