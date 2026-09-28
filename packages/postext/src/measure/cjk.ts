import { cjkBreakAllowed, cjkClassOf, getCjkLineBreak, isCjkGrapheme, type CjkLineBreakLevel } from './cjkClasses';
import { lastGrapheme } from './graphemes';

/**
 * Chinese, Japanese and Korean: scripts set without spaces between words.
 * The Han, kana and hangul ranges, the CJK punctuation and symbol blocks,
 * and the halfwidth and fullwidth forms — never the marks Latin text shares
 * with Chinese (— … · “ ”), which alone say nothing about the language.
 */
const CJK_RE = /[\u1100-\u11FF\u2E80-\u2FDF\u2FF0-\u2FFF\u3000-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE10-\uFE1F\uFE30-\uFE6F\uFF00-\uFFEF\u{16FE0}-\u{16FFF}\u{1B000}-\u{1B16F}\u{1F200}-\u{1F2FF}\u{20000}-\u{3FFFF}]/u;

/** Whether the text holds any CJK character. */
export function hasCJK(text: string): boolean {
  return CJK_RE.test(text);
}

/**
 * Words set without spaces: two ideographs, kana, bopomofo or hangul
 * syllables in a row (the iteration marks 々 〆 〇 count as ideographs). CJK
 * punctuation, brackets (〈 「), the middle dot ・ alone and fullwidth signs
 * (％ ＋) do not: quoted in Latin text they need no break between
 * characters.
 */
const CJK_RUN_RE = /[\u3005-\u3007\u3040-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3100-\u312F\u31A0-\u31BF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F\u{20000}-\u{3FFFF}]{2}/u;

/** Whether the text holds words set without spaces between them (see
 *  {@link CJK_RUN_RE}): such a paragraph breaks between characters. */
export function hasCJKRun(text: string): boolean {
  return CJK_RUN_RE.test(text);
}

/** Whether a line may break where two runs meet with no space between them
 *  (`**日本**語`), in a paragraph set word by word: next to a CJK character
 *  only — the marks Latin text shares with Chinese (— … “ ”) count as
 *  Latin here — under the prohibitions of `level` (the document's
 *  `cjk.lineBreak` by default), so no line starts with closing punctuation
 *  (。、」…) and none ends with an opening bracket (「（…). */
export function cjkJoinBreaks(left: string, right: string, level: CjkLineBreakLevel = getCjkLineBreak()): boolean {
  const a = lastGrapheme(left);
  const cp = right.codePointAt(0);
  if (a === '' || cp === undefined) return false;
  const b = String.fromCodePoint(cp);
  const aCjk = CJK_RE.test(a);
  const bCjk = CJK_RE.test(b);
  if (!aCjk && !bCjk) return false;
  return cjkBreakAllowed(cjkClassOf(a), isCjkGrapheme(a), cjkClassOf(b), isCjkGrapheme(b), level);
}
