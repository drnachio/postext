/** Where the line through struck-through text (`~~…~~`) sits over the
 *  baseline, and how thick it is, in em of the struck text, for a face
 *  whose own strikeout is not known (`fonts/strikeout.ts` reads it from the
 *  face's files): about the middle of the lowercase letters. Shared by the
 *  lines of the text (`marks/strikethrough.ts`) and those inside a chip
 *  (`VDTChip.strikes`). */
export const STRIKE_AT = 0.28;
export const STRIKE_STROKE = 0.05;

/** The same for the line under underlined text (`++…++`) of a face whose
 *  own underline is not known: its middle 0.12 em under the baseline, clear
 *  of the letters' feet, 0.05 em thick. */
export const UNDERLINE_AT = -0.12;
export const UNDERLINE_STROKE = 0.05;
