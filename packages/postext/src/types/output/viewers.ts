import type { PostextConfig } from '../config.js';

/** Partial document config that applies to the HTML viewer only (see
 *  `HtmlViewerConfig.overrides`). */
export type HtmlViewerOverrides = Omit<PostextConfig, 'htmlViewer'>;

export interface HtmlViewerConfig {
  /** Target column width in characters — drives the measured width of the
   *  single or multi-column layout in the HTML viewer. */
  maxCharsPerLine?: number;
  /** Horizontal gap between columns in multi-column mode, in pixels. */
  columnGap?: number;
  /** Use Knuth-Plass optimal line breaking in the HTML viewer. When false,
   *  overrides `bodyText.optimalLineBreaking` only for HTML rendering to
   *  favour performance. Default false. */
  optimalLineBreaking?: boolean;
  /** Screen-only alternative to parts of the document config. The HTML
   *  viewer merges it over the document config before laying out (see
   *  `applyHtmlViewerOverrides`); canvas and PDF ignore it. Objects merge
   *  recursively; a `levels` array (headings, lists) merges entry by entry
   *  on `level`; every other array — a design slot's `elements`,
   *  `calloutStyles`, `colorPalette`… — replaces the base array wholesale.
   *  Typical use: a chapter opener without the print bands, a part page
   *  whose title wraps against the number instead of a fixed trim-box
   *  width. */
  overrides?: HtmlViewerOverrides;
}

export interface ResolvedHtmlViewerConfig {
  maxCharsPerLine: number;
  columnGap: number;
  optimalLineBreaking: boolean;
  /** Carried through unchanged; absent when the config sets none. */
  overrides?: HtmlViewerOverrides;
}

/** How the Sandbox's Canvas lays the pages out on screen (#1002). Screen
 *  pixels at any zoom: the frame around the pages belongs to the viewer, not
 *  to the book, so changing it never lays the book out again. */
export interface CanvasViewerConfig {
  /** Space between the left and right page of a pair, in screen pixels
   *  (a whole number from 0 to 200). With 0 the two pages touch, so a
   *  picture or a design across a spread reads as one. Default 24. */
  pageGap?: number;
  /** Space between one row of pages and the next, in screen pixels (a
   *  whole number from 0 to 200). Default 24. */
  rowGap?: number;
}

export interface ResolvedCanvasViewerConfig {
  pageGap: number;
  rowGap: number;
}
