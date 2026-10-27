/**
 * Where a box's fragment starts or ends, as plain types (#943): the
 * document types name them, so they live apart from the layouters.
 */

/** A box width the first child of a continuation was counted at (see
 *  `CalloutLayoutInput.lineWidths`). */
export interface CalloutLineWidth {
  fromLine: number;
  width: number;
}

/** A position in a `:::columns` group's galley (#634): before child
 *  `child` (a position in the box's children), past its first `line`
 *  lines. A stream that is done sits at the next stream's first child (or
 *  the group's closing marker). */
export interface GroupPos {
  child: number;
  line: number;
  /** For a cut inside a paragraph: the sub-column widths its lines up to
   *  `line` were set at, from line `fromLine` on. */
  widths?: readonly CalloutLineWidth[];
}

/** A position inside a box's children where a fragment starts or ends:
 *  before child `child` (a position in `children`), past its first
 *  `line` text lines. `line: 0` is the child's head; a cut with
 *  `line > 0` falls inside that child, between two of its lines. */
export interface CalloutCut {
  child: number;
  line: number;
  /** For a cut inside a child (`line > 0`): the box widths that child's
   *  lines up to `line` were counted at, from line `fromLine` on (see
   *  `CalloutLayoutInput.lineWidths`). A box that goes on in a column of
   *  another width breaks the child again from them. */
  widths?: readonly CalloutLineWidth[];
  /** A cut inside the `:::columns` group whose opening marker is at
   *  position `open` (#634): where each of its streams stands (one for a
   *  snake group). `child` is then the earliest of them, `line` 0. */
  group?: { open: number; pos: readonly GroupPos[] };
}
