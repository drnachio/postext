// Arabic joining: Joining_Type lookup and whether two letters join.
import { JOINING_TYPE_RANGES } from '../bidiData.js';
import { rangeLookup } from './chars.js';

// ---------------------------------------------------------------------------
// Arabic joining

/** A Unicode `Joining_Type` (ArabicShaping.txt): `D` dual-joining (most
 *  Arabic letters), `R` right-joining (alef, dal, ra, waw…: joined only to
 *  the letter before them), `L` left-joining, `C` join-causing (tatweel,
 *  ZWJ), `T` transparent (harakat and other marks, skipped when deciding
 *  what joins), `U` non-joining. */
export type JoiningType = 'U' | 'C' | 'D' | 'R' | 'L' | 'T';

const JOINING_TYPE_NAMES: readonly JoiningType[] = ['U', 'C', 'D', 'R', 'L', 'T'];
// The joining codes.
const JT_U = 0, JT_C = 1, JT_D = 2, JT_R = 3, JT_L = 4, JT_T = 5;

function joiningCode(cp: number): number {
  // Below U+00AD every character is non-joining.
  if (cp < 0xAD) return JT_U;
  return rangeLookup(JOINING_TYPE_RANGES, cp, JT_U);
}

/** A code point's Unicode `Joining_Type`. */
export function joiningTypeOf(cp: number): JoiningType {
  return JOINING_TYPE_NAMES[joiningCode(cp)]!;
}

/** Whether a text holds a letter of a joining script: a character that is
 *  dual-, right- or left-joining (Arabic, Syriac, N'Ko, Mongolian, Adlam…).
 *  Join-causing characters alone do not count: a ZWJ also sits inside emoji
 *  sequences. */
export function hasJoiningScript(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp > 0xFFFF) i++;
    const j = joiningCode(cp);
    if (j === JT_D || j === JT_R || j === JT_L) return true;
  }
  return false;
}

/**
 * Whether the character starting at `index` is joined to the next
 * non-transparent character of `text` (cursive Arabic: the two letters
 * connect, so a cut, a style change or a kashida between them must keep
 * the connection). It joins when it joins forward (`D`, `L`, `C`) and the
 * next one joins backward (`D`, `R`, `C`); transparent marks between them
 * (harakat) are skipped. `false` at the end of the text, and when `index`
 * itself is a transparent mark.
 */
export function joinsWithNext(text: string, index: number): boolean {
  const cp = text.codePointAt(index);
  if (cp === undefined) return false;
  const a = joiningCode(cp);
  if (a !== JT_D && a !== JT_L && a !== JT_C) return false;
  for (let i = index + (cp > 0xFFFF ? 2 : 1); i < text.length;) {
    const next = text.codePointAt(i)!;
    const b = joiningCode(next);
    if (b === JT_T) {
      i += next > 0xFFFF ? 2 : 1;
      continue;
    }
    return (b === JT_D || b === JT_R || b === JT_C) && !(a === JT_C && b === JT_C);
  }
  return false;
}

/** Whether any two characters of a text join (see {@link joinsWithNext}):
 *  a word that must be measured, cut and painted as one shaped run. */
export function joinsLetters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (joinsWithNext(text, i)) return true;
    if (text.charCodeAt(i) >= 0xD800 && text.charCodeAt(i) <= 0xDBFF) i++;
  }
  return false;
}
