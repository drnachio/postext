// The Word styles of an exercise's paragraphs (#1458): `Exercise` for its
// statement, options, gaps and bank, `Exercise instruction` for its
// prompt. In the book's design they take the face, size and leading of
// the exercise's box and the prompt its own weight and face; in the plain
// design they only name what the paragraph is.

import type { ResolvedExerciseStyle } from '../../../defaults/boxes/exercises.js';
import type { WriterContext } from '../context.js';
import { STYLE } from '../styles.js';
import { halfPoints, hex } from '../wml.js';

/** The paragraph styles of exercise style `style`. */
export function exerciseStyles(ctx: WriterContext, style: ResolvedExerciseStyle): { text: string; instruction: string } {
  // One pair of styles for the book's default exercise style, one more a
  // named style (the part's palette copy shares its base's).
  const id = style.id.replace(/-[0-9a-f]{6}(?:-[0-9a-f]{6})*$/, '');
  const tail = id === 'exercise' ? '' : ` ${id}`;
  const box = !ctx.plain && style.box ? ctx.styles.callout(style.box) : undefined;
  const base = box ? ctx.styles.calloutStyles(box).body : STYLE.normal;
  const text = ctx.styles.custom(`exercise:${id}`, `Exercise${tail}`, () => ({ basedOn: base, pPr: { ind: { firstLine: 0 } } }));
  const instruction = ctx.styles.custom(`exercise:${id}:instruction`, `Exercise instruction${tail}`, () => {
    const i = style.instruction;
    const face = ctx.plain ? {} : { ...(i.fontFamily ? ctx.styles.font(i.fontFamily, i.bold ? 700 : 400, !!i.italic) : {}), ...(i.fontSize ? { sz: halfPoints(ctx.units, i.fontSize) } : {}), ...(hex(i.color) ? { color: hex(i.color) } : {}) };
    return { basedOn: text, pPr: { keepNext: true, ind: { firstLine: 0 } }, rPr: { ...face, ...(i.bold ? { b: true } : {}), ...(i.italic ? { i: true } : {}) } };
  });
  return { text, instruction };
}
