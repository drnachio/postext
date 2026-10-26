// The page flipper's numbers: mesh columns and rows, the gaps leaves keep
// over the paper below, field of view, roll radius, turn and block timings
// and where a page is taken (#1276: split out of pageFlip.ts).


/** Columns and rows of a leaf's mesh: fine enough for a tight roll. */
export const NX = 96;
/** How far a leaf's folded paper stays over its own paper beneath it. */
export const OWN_GAP = 1.2;
/** How much higher than at rest a leaf in the air stays over a block. */
export const BLOCK_GAP = 1.5;
export const NY = 120;
/** Columns of a page lying open (its curve runs across only). */
export const NX_OPEN = 72;
/** Vertical field of view. */
export const FOV = 24;
/** Radius of the roll at mid-turn for 90 g/m² offset, against the page's width. */
export const ROLL = 0.11;
/** Milliseconds one leaf takes to turn. */
export const DURATION = 1000;
/** A jump of more pages than this is made in one move: the block of
 *  leaves in between is lifted together and laid over on the other side,
 *  instead of every leaf turning on its own. */
export const BLOCK_PAGES = 10;
/** How long a block of leaves takes to go over (ms), a little longer for
 *  a thicker one. */
export const BLOCK_DURATION = 1150;
/** A page is taken by its outer part only: from this fraction of its
 *  width from the spine out to the fore-edge (#494). */
export const GRIP = 0.5;
/** A leaf follows the one before it once that one is this far through its turn. */
export const GAP = 0.14;
