import type { ElementPlacement, PageParity, PageRoleFilter } from './designPlacement.js';
import type { Dimension } from './page.js';

/** A die-cut drawn by a page template (#1565): a hole through the leaf of
 *  every composed page the template's decoration is laid on, placed and
 *  sized like a path element (`when` / `unless` and `parity` as any
 *  decoration). It is never painted: the layout takes it out of the
 *  decoration and puts it on the page's `dieCut`, mirrored on the other
 *  side of the leaf. Its outline is the die shape `die` names stretched to
 *  the element's box, else the path data `d` in `viewBox` units, else the
 *  box itself. */
export interface DesignCutElement {
  kind: 'cut';
  id: string;
  parity?: PageParity;
  pages?: PageRoleFilter;
  /** Drawn only on a composed page whose fence sets this attribute. */
  when?: string;
  /** Not drawn on a composed page whose fence sets this attribute. */
  unless?: string;
  /** Anchored to a frame, stay where the template puts that frame. */
  pin?: boolean;
  placement: ElementPlacement;
  /** A shape of `dieCuts.shapes`: its kind, corner radius, path data,
   *  `leaves` and `wrap` (its own box is not read: the element's is). */
  die?: string;
  /** SVG path data, in `viewBox` units, when no `die` is named. */
  d?: string;
  viewBox?: [number, number];
  preserveAspectRatio?: 'none' | 'meet';
  /** Leaves the hole goes through (default: the die's, else 1). */
  leaves?: number;
  /** Text keeps `gap` clear of the hole (default: the die's, else 3 mm);
   *  `false` lets it run under. */
  wrap?: false | { gap?: Dimension };
}

/** What a cut element carries past its outline (#1565): the die it names,
 *  its leaves and its wrap, as written (the die's fill in where it sets
 *  none, when the page's die-cuts are stamped). */
export interface ResolvedDesignCut {
  die?: string;
  leaves?: number;
  wrap?: false | { gap?: Dimension };
}
