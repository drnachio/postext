/**
 * List nesting from indentation (#465).
 *
 * A list item nests under the item it is indented past, not under a fixed
 * number of spaces per level. Up to postext 1.15 the depth was
 * `floor(spaces / 2) + 1`, which is right for bullets indented two spaces a
 * level but wrong as soon as the step is wider: a third-level item under
 * `1.` sits at column 6 (the content column of the `1.` above it, as
 * CommonMark §5.2 places it) and came out at depth 4, with the numbering
 * style of the wrong level; `- a` / `    - b` put `b` at depth 3.
 *
 * The rule here follows CommonMark's nesting with one relaxation. An item
 * belongs inside an open item when its marker is at least two columns right
 * of that item's marker; it closes every open item it is not that far
 * past, and its depth is the number of items still open around it, plus
 * one. Two columns is the content column of a bullet (`- `), so bullets
 * nest exactly as in CommonMark. A wider marker (`1. `, `10. `) has its
 * content column further right, and CommonMark would make an item indented
 * two spaces under it a sibling; authors indent two spaces under `1.` all
 * the time and Postext has always nested it, so it still does. A list's
 * first item opens depth 1 wherever it is indented. Tabs advance to the next
 * multiple of four columns (CommonMark §2.2).
 *
 * With two-space steps (and any list whose depths only change by one level
 * at a time in two-space steps) the result is the depth the old formula
 * gave, so the books written that way keep their layout.
 */

/** The deepest list level the engine styles (`unorderedLists.levels`,
 *  `orderedLists.levels`); deeper items take this one. */
export const MAX_LIST_DEPTH = 5;

/** How far right of an open item's marker a marker must sit to nest in it:
 *  the content column of a bullet and its space. */
const NEST_STEP = 2;

/** Tab stop width (CommonMark §2.2). */
const TAB_STOP = 4;

/**
 * The column the leading whitespace of a line reaches. A tab advances to
 * the next multiple of four, any other whitespace character one column.
 */
export function indentColumn(leading: string): number {
  let col = 0;
  for (const ch of leading) col = ch === '\t' ? col + TAB_STOP - (col % TAB_STOP) : col + 1;
  return col;
}

/**
 * The open list items after one whose marker sits at `column`, given the
 * marker columns of those open before it (outermost first): every item the
 * new one is not at least two columns past is closed, and the new item is
 * pushed. Its depth is the length of the result, capped at
 * {@link MAX_LIST_DEPTH} by {@link listDepth}; the stack itself is not
 * capped, so a dedent finds the right ancestor under a sixth level.
 */
export function nestListItem(open: readonly number[], column: number): number[] {
  const next = open.slice();
  while (next.length > 0 && column < next[next.length - 1]! + NEST_STEP) next.pop();
  next.push(column);
  return next;
}

/** The 1-based depth of the item last pushed by {@link nestListItem}. */
export function listDepth(open: readonly number[]): number {
  return Math.max(1, Math.min(MAX_LIST_DEPTH, open.length));
}
