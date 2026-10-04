/**
 * Words of a joining script (Arabic, Syriac, N'Ko, Mongolian, Adlam…) stay
 * whole: their letters connect, and the shape of each letter depends on
 * its neighbours. A piece of such a word measured alone has the wrong
 * width (in Amiri `مكت` alone is wider than the whole `مكتبة`), and painted
 * alone it shows the wrong letter forms. So the measurer never hyphenates
 * one, never cuts one between letters, never measures a prefix of one, and
 * never spreads letter-spacing on one (tracking breaks the joins on every
 * renderer, as CSS `letter-spacing` does). See engine-ltr-audit §1.3–1.4
 * and §2.2.
 *
 * The predicates here are the measurer's gate: they cost one comparison
 * per UTF-16 unit for text with nothing past U+05FF (every Latin, Greek,
 * Cyrillic, Hebrew or CJK word), which never holds a joining letter.
 */

import { hasJoiningScript, joiningTypeOf } from '../bidi';

/** The first code unit a joining letter can have: the Arabic block. */
const FIRST_JOINING_UNIT = 0x0600;

/** Whether `text` holds a letter of a joining script (dual-, right- or
 *  left-joining, see `hasJoiningScript`): a word to keep whole and set
 *  without tracking. */
export function joiningScriptIn(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= FIRST_JOINING_UNIT) return hasJoiningScript(text);
  }
  return false;
}

/** Whether the code point is a letter of a joining script, or a
 *  join-causing character (tatweel, ZWJ) or a mark riding on one. */
function joinsInWord(cp: number): boolean {
  const t = joiningTypeOf(cp);
  return t === 'D' || t === 'R' || t === 'L' || t === 'C' || t === 'T';
}

/**
 * Whether a cut before `text[idx]` falls inside a word of a joining script:
 * between two of its letters (whether or not those two connect: an Arabic
 * word is not divided at a line end either way), or before a mark, which
 * stays with its letter. A cut between an Arabic word and a Latin one or a
 * digit run glued to it (`ABCكتاب`, `و2020`) is not inside one.
 */
export function insideJoiningWord(text: string, idx: number): boolean {
  if (idx <= 0 || idx >= text.length) return false;
  const next = text.codePointAt(idx)!;
  // A surrogate pair is never cut.
  if (next >= 0xDC00 && next <= 0xDFFF) return true;
  if (next < FIRST_JOINING_UNIT && text.charCodeAt(idx - 1) < FIRST_JOINING_UNIT) return false;
  const nextType = joiningTypeOf(next);
  if (nextType === 'T') return joiningScriptIn(text.slice(0, idx));
  let k = idx - 1;
  if (k > 0 && text.charCodeAt(k) >= 0xDC00 && text.charCodeAt(k) <= 0xDFFF) k--;
  // The letter before, looking past the marks on it.
  while (k > 0 && joiningTypeOf(text.codePointAt(k)!) === 'T') k--;
  const prev = text.codePointAt(k)!;
  return joinsInWord(prev) && joiningTypeOf(prev) !== 'T' && joinsInWord(next);
}

const LETTER_RE = /\p{L}/u;

/**
 * Whether most of a paragraph's letters belong to a joining script: an
 * Arabic paragraph, which no tracking lever may reach (column balancing's
 * paragraph tracking, the runt fix's negative tracking). Those levers then
 * fall through to the others. A Latin paragraph quoting an Arabic word
 * keeps them: the quoted word alone is set without tracking.
 */
export function mostlyJoiningScript(text: string): boolean {
  if (!joiningScriptIn(text)) return false;
  let letters = 0;
  let joining = 0;
  for (const ch of text) {
    if (!LETTER_RE.test(ch)) continue;
    letters++;
    const t = joiningTypeOf(ch.codePointAt(0)!);
    if (t === 'D' || t === 'R' || t === 'L') joining++;
  }
  return joining * 2 > letters;
}

/** The tracking (letter-spacing) a word of `text` takes, `letterSpacingPx`
 *  after each grapheme: none on a word of a joining script. */
export function wordLetterSpacing(text: string, letterSpacingPx: number): number {
  return letterSpacingPx !== 0 && joiningScriptIn(text) ? 0 : letterSpacingPx;
}
