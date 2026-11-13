// Jump Object and Jump to Next Column text wrap (#1554).
//
// InDesign sets no text beside an object whose wrap is Jump Object: the
// text of a frame behind it stops above the object (less the top offset)
// and goes on below it (past the bottom offset). Jump to Next Column stops
// it above the object and sends the rest to the next column or frame.
// Postext's `exclude: 'push'` only sets lines short beside a frame, which
// leaves the narrow strip between the object and the margin to the text,
// one letter per line.
//
// The page importer therefore cuts such a text frame into the bands the
// objects leave free and chains them: the text runs down the band above,
// then the band below, then on to the frame the thread went to. Lines
// break as InDesign breaks them, mid-paragraph included, with nothing new
// in the engine.

import type { IdmlPageItem } from '../model/document.js';
import type { Box } from '../model/geometry.js';

/** An object on a page whose wrap keeps text off its whole width. */
export interface JumpObject {
  item: IdmlPageItem;
  /** Its box on the page. */
  box: Box;
  /** `'jump'`: the text goes on below it; `'next'`: in the next frame. */
  mode: 'jump' | 'next';
  /** Top, left, bottom, right (pt), as `TextWrapOffset` writes them. */
  offset: [number, number, number, number];
}

/** The jump object an item's wrap makes of it, if any. */
export function jumpObjectOf(item: IdmlPageItem, box: Box): JumpObject | undefined {
  const mode = item.wrap?.mode;
  if (mode !== 'JumpObjectTextWrap' && mode !== 'NextColumnTextWrap') return undefined;
  // An inverted wrap keeps text inside the object: not a jump.
  if (item.wrap!.inverse) return undefined;
  return { item, box, mode: mode === 'JumpObjectTextWrap' ? 'jump' : 'next', offset: item.wrap!.offset };
}

/** Whether `j` meets `frame` across, with its side offsets. */
function meetsAcross(j: JumpObject, frame: Box): boolean {
  const [, l, , r] = j.offset;
  return j.box.left - l < frame.right && j.box.right + r > frame.left;
}

/** Whether `j`, grown by its offsets, overlaps `frame` (a Jump to Next
 *  Column object reaches down to the frame's foot). */
export function meetsWithOffsets(j: JumpObject, frame: Box): boolean {
  const [t, , b] = j.offset;
  const bottom = j.mode === 'next' ? Infinity : j.box.bottom + b;
  return meetsAcross(j, frame) && j.box.top - t < frame.bottom && bottom > frame.top;
}

/** Whether `j` covers the whole measure of a frame of several columns,
 *  inside its insets: only then do all its columns jump alike. */
export function spansColumns(j: JumpObject, frame: Box, inset: readonly [number, number, number, number]): boolean {
  const [, l, , r] = j.offset;
  return j.box.left - l <= frame.left + inset[1] + 0.5 && j.box.right + r >= frame.right - inset[3] - 0.5;
}

/** The bands of `frame` (top to bottom) the jump objects leave to its
 *  text, each at least `minHeight` tall; the frame itself when none of
 *  them meets it. `undefined` when they leave no band at all: the caller
 *  keeps the frame whole. */
export function freeBands(frame: Box, jumps: readonly JumpObject[], minHeight: number): Box[] | undefined {
  const cuts: [number, number][] = [];
  for (const j of jumps) {
    if (!meetsAcross(j, frame)) continue;
    const [t, , b] = j.offset;
    const from = j.box.top - t;
    const to = j.mode === 'next' ? Infinity : j.box.bottom + b;
    if (to <= frame.top || from >= frame.bottom) continue;
    cuts.push([from, to]);
  }
  if (cuts.length === 0) return [frame];
  cuts.sort((a, b) => a[0] - b[0]);
  const bands: Box[] = [];
  let y = frame.top;
  for (const [from, to] of cuts) {
    if (from > y) bands.push({ ...frame, top: y, bottom: Math.min(from, frame.bottom) });
    y = Math.max(y, to);
    if (y >= frame.bottom) break;
  }
  if (y < frame.bottom) bands.push({ ...frame, top: y, bottom: frame.bottom });
  const kept = bands.filter((b) => b.bottom - b.top >= minHeight);
  return kept.length > 0 ? kept : undefined;
}
