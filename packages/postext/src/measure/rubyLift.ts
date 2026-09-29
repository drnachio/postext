/**
 * How far a Latin reading (pinyin, romaji) over its base is lifted so that
 * its descenders clear the base (#194, found on Nº 086).
 *
 * A reading's em box stands on the base's em box, its baseline where a CJK
 * face puts it: 0.12 em above the box's foot (`CENTRAL` is 0.38). That
 * suits kana and bopomofo, whose ink stays inside the box, but the g, j, p,
 * q and y of a Latin face reach about a quarter of an em under the
 * baseline: at half the text size, the g of tīng ran into the top of a
 * bold 汀 under it. A reading that holds a Latin letter is raised until the
 * descenders of its face end a little clear of the base's em box
 * ({@link LATIN_RUBY_GAP_EM} of the text). The lift is measured on the
 * face (`gjpqy`), not on the reading, so every reading of a line keeps one
 * baseline whether it has a descender or not. In vertical text the reading
 * runs sideways right of the column, its descenders towards it, and the
 * same lift moves it right. Readings under the base are left where they
 * are.
 */
import { DEFAULT_CENTRAL_BASELINE } from '../vdt';
import { measureInkBox, onTextWidthCacheClear } from './canvas';
import { fontEm } from './vertical';

/** The room between a Latin reading's descenders and its base's em box,
 *  in em of the text (the gap zhuyin keeps from its character). */
export const LATIN_RUBY_GAP_EM = 0.04;

/** Letters that reach under the baseline in a Latin face. */
const DESCENDERS = 'gjpqy';
const LATIN_RE = /\p{Script=Latin}/u;

const descents = new Map<string, number | null>();
onTextWidthCacheClear(() => descents.clear());

/** How far under its baseline `font`'s descenders ink, px, or null when
 *  the measurer gives no ink box. */
function descentOf(font: string): number | null {
  let d = descents.get(font);
  if (d === undefined) {
    const box = measureInkBox(DESCENDERS, font);
    d = box ? box.descent : null;
    descents.set(font, d);
  }
  return d;
}

/**
 * How far (px, towards the reading's side) a reading over its base moves
 * away from the base: 0 for a reading with no Latin letter, when the
 * measurer gives no ink box, or when the face's descenders already stay in
 * the reading's own em box with the gap to spare.
 */
export function latinReadingLift(reading: string, fontString: string, em: number): number {
  if (!LATIN_RE.test(reading)) return 0;
  const descent = descentOf(fontString);
  if (descent === null) return 0;
  const rtEm = fontEm(fontString);
  const lift = descent + LATIN_RUBY_GAP_EM * em - (0.5 - DEFAULT_CENTRAL_BASELINE) * rtEm;
  return lift > 1e-9 ? lift : 0;
}
