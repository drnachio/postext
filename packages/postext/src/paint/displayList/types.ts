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
  footnoteId?: string;
  rtl?: boolean;
  /** Index of the run's first character in the line's `text`. */
  textStart: number;
  /** A space whose width justification set. */
  space?: boolean;
  /** Embedded non-text content drawn in place of the run. */
  inline?: { kind: 'math' | 'score' | 'swatch' | 'chip'; svg?: string; widthPx: number; heightPx: number; ascentPx?: number };
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
  /** How the backend aligned this line (the PDF rule in `lineText.ts`). */
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

export type DisplayItem =
  | {
      kind: 'text';
      /** What the text is, for writers that style by role. */
      role: 'body' | 'heading' | 'list' | 'quote' | 'code' | 'caption' | 'note' | 'continues' | 'footnote' | 'callout' | 'header' | 'footer' | 'opener' | 'design' | 'label' | 'cell' | 'dropCap' | 'marker';
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
      /** Clip rectangle the backend applies (columns clip their blocks). */
      clip?: DisplayRect;
    }
  | { kind: 'rule'; x1: number; y1: number; x2: number; y2: number; color: string; widthPx: number; dash?: number[] }
  | { kind: 'rect'; rect: DisplayRect; fill?: string; stroke?: string; strokeWidthPx?: number; radius?: number; rotate?: number; box?: VDTDesignBoxStyle }
  | { kind: 'path'; bbox: DisplayRect; subpaths: VDTPathCommand[][]; fill?: string; stroke?: VDTPathStroke }
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
    };

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
