/**
 * The box of a task-list item (`- [ ]`, `- [x]`) as the engine draws it
 * (#765). Up to postext 1.28 the box was the character ☐ (☑ when ticked)
 * set in the list's face; no text face holds it, so the browser took it
 * from a font of the system and the PDF from whatever the face answered,
 * and its width, which the item's text starts after, was another on every
 * machine. The engine now draws it: a square outline, with a tick when
 * the item is done, the same on the canvas, in the PDF, in the HTML and in
 * the EPUB, and its room is worked out with no font.
 *
 * The square's side is {@link TASK_BOX_SIDE_EM} of the marker's size (the
 * list level's `fontSize`) and that is all the room it takes: the list's
 * `gap` comes after it. It is centred on the marker's `bulletY`, as a
 * bullet is, so at the text's own size it stands on the first line's
 * baseline. Its outline is drawn inside the square, as heavy as the
 * level's `fontWeight` asks ({@link taskBoxSize}); the tick has the same
 * stroke, with round ends.
 */

import { DEFAULT_TASK_CHECKBOX_CHAR, DEFAULT_TASK_CHECKED_CHAR } from '../defaults/text/lists-shared.js';

/** The side of the box, in ems of the marker's size. */
export const TASK_BOX_SIDE_EM = 0.6;

/** The tick of a ticked box: its three points in units of the side, from
 *  the box's top left corner, y down. */
export const TASK_BOX_TICK: ReadonlyArray<readonly [number, number]> = [[0.22, 0.52], [0.42, 0.72], [0.78, 0.28]];

/** The side and the stroke (px) of the box of a marker `markerSizePx`
 *  large in a level of weight `fontWeight`: the stroke is a tenth of the
 *  side at 700, the default weight of a bullet, lighter and heavier with
 *  the weight, and never under a twentieth. */
export function taskBoxSize(markerSizePx: number, fontWeight: number): { side: number; stroke: number } {
  const side = markerSizePx * TASK_BOX_SIDE_EM;
  return { side, stroke: side * Math.max(0.05, fontWeight / 7000) };
}

/** Whether a task item's box is drawn: `char`, the character the list
 *  settings give its state, is the default one (☐, or ☑ when `checked`).
 *  Any other character is the author's own and is set as text. */
export function isDrawnTaskBox(char: string, checked: boolean): boolean {
  return char === (checked ? DEFAULT_TASK_CHECKED_CHAR : DEFAULT_TASK_CHECKBOX_CHAR);
}

/** The character a drawn box stands for: what assistive technology reads
 *  and a copy takes. */
export function taskBoxText(checked: boolean): string {
  return checked ? DEFAULT_TASK_CHECKED_CHAR : DEFAULT_TASK_CHECKBOX_CHAR;
}

/**
 * The tick's points (px) from the centre of a box of `side`, in the axes
 * of the flow it is painted in, y down. A tick reads the same on every
 * page, so in a flow the sheet shows turned or mirrored its points are
 * turned or mirrored back: `'vertical'` for the flow of a vertical page
 * (a quarter turn clockwise on the sheet), `'mirrored'` for the flow of a
 * right-to-left page (turned over the sheet's vertical axis).
 */
export function taskBoxTick(side: number, flow?: 'vertical' | 'mirrored'): Array<[number, number]> {
  return TASK_BOX_TICK.map(([x, y]) => {
    const dx = (x - 0.5) * side;
    const dy = (y - 0.5) * side;
    if (flow === 'vertical') return [dy, -dx];
    if (flow === 'mirrored') return [-dx, dy];
    return [dx, dy];
  });
}

/**
 * The box as the content of an `<svg viewBox="0 0 100 100">`, painted in
 * `currentColor`: the outline inside the square and, when `checked`, the
 * tick. `strokeRatio` is the stroke over the side; `flow` as in
 * {@link taskBoxTick}.
 */
export function taskBoxSvgBody(strokeRatio: number, checked: boolean, flow?: 'vertical' | 'mirrored'): string {
  const n = (v: number): string => String(Math.round(v * 100) / 100);
  const w = strokeRatio * 100;
  let body = `<rect x="${n(w / 2)}" y="${n(w / 2)}" width="${n(100 - w)}" height="${n(100 - w)}" fill="none" stroke="currentColor" stroke-width="${n(w)}"/>`;
  if (checked) {
    const d = taskBoxTick(100, flow).map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x + 50)} ${n(y + 50)}`).join('');
    body += `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return body;
}
