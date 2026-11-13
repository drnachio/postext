import type { Dimension } from './page.js';

/** One die shape (#1565): a hole the die-maker cuts through a leaf, and
 *  through the next ones when `leaves` says so. Placed from the top-left
 *  corner of the trim of the page it is put on; the other side of the leaf
 *  carries it mirrored. */
export interface DieShape {
  /** What `dieCuts.pages` and `:::diecut{die=…}` name it by. */
  id: string;
  /** A name for people (the Sandbox shows it). */
  name?: string;
  shape: 'rect' | 'roundRect' | 'circle' | 'ellipse' | 'path';
  /** From the trim's left edge of the page the shape is placed on. */
  x: Dimension;
  /** From the trim's top edge. */
  y: Dimension;
  width: Dimension;
  height: Dimension;
  /** Corner radius of a `'roundRect'`. Default 3 mm. */
  radius?: Dimension;
  /** SVG path data of a `'path'` (`M L H V C S Q T A Z`), in `viewBox`
   *  units, stretched to the shape's box, as a design's `kind: 'path'`. */
  d?: string;
  /** Width and height of the space `d` is written in. Default `[1, 1]`. */
  viewBox?: [number, number];
  /** How many leaves the hole goes through, the one it is placed on
   *  first, then the next ones in page order. Default 1. */
  leaves?: number;
  /** Text keeps `gap` clear of the hole, on both sides of every leaf it
   *  cuts (default `{ gap: 3mm }`); `false` lets text run under it. */
  wrap?: false | { gap?: Dimension };
}

/** Where a die shape is put: on the pages `pages` lists (`'5'`, `'3-12'`,
 *  `'3,7,11-13'`, page numbers as printed by position, 1 = the first page
 *  of the document). */
export interface DieCutPlacement {
  pages: string;
  die: string;
}

/** The book's die-cuts (#1565): its die shapes, where they go, and the
 *  shape of the whole book (rounded corners, an outline). Part of the
 *  layout: text wraps around a hole. */
export interface DieCutsConfig {
  shapes?: DieShape[];
  pages?: DieCutPlacement[];
  /** Rounded corners on every leaf: the fore-edge corners (`'fore'`,
   *  default; the spine stays square) or all four. */
  corners?: { radius: Dimension; edges?: 'fore' | 'all' };
  /** A shaped book: every leaf cut to this outline, SVG path data in
   *  `viewBox` units stretched to the trim (a recto's; versos mirror it). */
  outline?: { d: string; viewBox?: [number, number] };
}

export interface ResolvedDieShape {
  id: string;
  name?: string;
  shape: DieShape['shape'];
  x: Dimension;
  y: Dimension;
  width: Dimension;
  height: Dimension;
  radius: Dimension;
  d?: string;
  viewBox: [number, number];
  leaves: number;
  wrap: false | { gap: Dimension };
}

export interface ResolvedDieCutsConfig {
  shapes: ResolvedDieShape[];
  pages: DieCutPlacement[];
  corners?: { radius: Dimension; edges: 'fore' | 'all' };
  outline?: { d: string; viewBox: [number, number] };
}
