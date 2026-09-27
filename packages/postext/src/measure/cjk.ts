import { prepareWithSegments } from '@chenglou/pretext';

/**
 * Chinese, Japanese and Korean: scripts set without spaces between words.
 * The ranges pretext's line breaker treats as breakable between characters
 * (CJK punctuation and fullwidth forms included), so the plain and the rich
 * breaker agree on where such text may break.
 */
const CJK_RE = /[\u3000-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u{20000}-\u{2A6DF}\u{2A700}-\u{2EE5D}\u{2F800}-\u{2FA1F}\u{30000}-\u{33479}]/u;

/** Whether the text holds any CJK character. */
export function hasCJK(text: string): boolean {
  return CJK_RE.test(text);
}

/**
 * Words set without spaces: two ideographs, kana or hangul syllables in a
 * row (the iteration marks 々 〆 〇 count as ideographs). CJK punctuation,
 * brackets (〈 「), the middle dot ・ alone and fullwidth signs (％ ＋) do
 * not: quoted in Latin text they need no break between characters.
 */
const CJK_RUN_RE = /[\u3005-\u3007\u3040-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F\u{20000}-\u{2A6DF}\u{2A700}-\u{2EE5D}\u{2F800}-\u{2FA1F}\u{30000}-\u{33479}]{2}/u;

/** Whether the text holds words set without spaces between them (see
 *  {@link CJK_RUN_RE}), which only a first-fit breaker can divide: optimal
 *  line breaking breaks at spaces and hyphenation points. */
export function hasCJKRun(text: string): boolean {
  return CJK_RUN_RE.test(text);
}

/**
 * Where a line may break inside a run of text with no spaces, as pretext's
 * own breaker finds it: between two characters when either is CJK. Pretext's
 * segments carry its kinsoku rules, so no line starts with closing
 * punctuation (。、」ー…) and none ends with an opening bracket (「（…).
 * Offsets into `text`, ascending; none when the run holds no CJK.
 */
export function cjkBreakIndices(text: string, font: string): number[] {
  if (!CJK_RE.test(text)) return [];
  const segments = prepareWithSegments(text, font).segments;
  if (segments.join('') !== text) return [];
  const out: number[] = [];
  let at = 0;
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k]!;
    if (k > 0 && at > 0 && (CJK_RE.test(lastChar(segments[k - 1]!)) || CJK_RE.test(firstChar(seg)))) out.push(at);
    at += seg.length;
  }
  return out;
}

/** Whether a line may break where two runs meet with no space between them
 *  (`**日本**語`): only between ideographs, under the same kinsoku rules as
 *  inside a run. */
export function cjkJoinBreaks(left: string, right: string, font: string): boolean {
  const a = lastChar(left);
  const b = firstChar(right);
  if (a === '' || b === '') return false;
  return cjkBreakIndices(a + b, font).length > 0;
}

function firstChar(text: string): string {
  const cp = text.codePointAt(0);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

function lastChar(text: string): string {
  if (text.length === 0) return '';
  const low = text.charCodeAt(text.length - 1);
  const start = low >= 0xdc00 && low <= 0xdfff && text.length > 1 ? text.length - 2 : text.length - 1;
  return text.slice(start);
}
