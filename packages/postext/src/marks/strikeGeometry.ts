/** Where the line through struck-through text (`~~…~~`) sits over the
 *  baseline, and how thick it is, in em of the struck text, for a face
 *  whose own strikeout is not known (`fonts/strikeout.ts` reads it from the
 *  face's files): about the middle of the lowercase letters. Shared by the
 *  lines of the text (`marks/strikethrough.ts`) and those inside a chip
 *  (`VDTChip.strikes`). */
export const STRIKE_AT = 0.28;
export const STRIKE_STROKE = 0.05;
