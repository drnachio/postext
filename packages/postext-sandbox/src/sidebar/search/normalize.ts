// Accent-insensitive, word-prefix matching for the settings search. Pure.
//
// `normalizeText` maps every UTF-16 unit of the input to exactly one unit of
// output (accents stripped, lowercased), so an index into the normalized
// string is also an index into the original — `matchRanges` relies on that
// to highlight the original label.
//
// Chinese and Japanese labels have no spaces between words: every Han
// character and every kana starts a word, so 位置 finds ルビの位置. Kana
// keep their voicing marks: が is not か, ぱ not は (the dakuten and
// handakuten tell words apart, they are not accents).

const charCache = new Map<string, string>();

/** Hiragana and katakana (with their voiced forms), kept as they are. */
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Characters that start a word wherever they stand. */
const IDEOGRAPHIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function normalizeUnit(ch: string): string {
  const cached = charCache.get(ch);
  if (cached !== undefined) return cached;
  if (KANA.test(ch)) {
    charCache.set(ch, ch);
    return ch;
  }
  let out = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (out.length === 0) out = ' ';
  else if (out.length > 1) out = out[0];
  charCache.set(ch, out);
  return out;
}

/** Lowercase, accent-free copy of `s` with the same length. */
export function normalizeText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) out += normalizeUnit(s[i]);
  return out;
}

/** Search words of a query, normalized; empty query → no tokens. */
export function tokenize(query: string): string[] {
  return normalizeText(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordStart(s: string, i: number): boolean {
  return i === 0 || !WORD_CHAR.test(s[i - 1]) || IDEOGRAPHIC.test(s[i]);
}

/** Positions (in `normalized`) where `token` starts a word. */
function wordStarts(normalized: string, token: string): number[] {
  const out: number[] = [];
  let from = 0;
  while (from <= normalized.length - token.length) {
    const i = normalized.indexOf(token, from);
    if (i < 0) break;
    if (isWordStart(normalized, i)) out.push(i);
    from = i + 1;
  }
  return out;
}

/** True when every token is the prefix of some word in `normalized`.
 *  No tokens → true. */
export function matchesTokens(normalized: string, tokens: readonly string[]): boolean {
  for (const t of tokens) {
    if (wordStarts(normalized, t).length === 0) return false;
  }
  return true;
}

/** Merged, sorted `[start, end)` ranges of every token hit in `original`,
 *  expressed in the original string's indices. */
export function matchRanges(original: string, tokens: readonly string[]): Array<[number, number]> {
  if (tokens.length === 0) return [];
  const normalized = normalizeText(original);
  const raw: Array<[number, number]> = [];
  for (const t of tokens) {
    for (const i of wordStarts(normalized, t)) raw.push([i, i + t.length]);
  }
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

export interface SearchMatcher {
  readonly tokens: readonly string[];
  /** `haystack` must already be normalized. */
  test(haystack: string): boolean;
}

export function compileMatcher(query: string): SearchMatcher {
  const tokens = tokenize(query);
  return { tokens, test: (haystack) => matchesTokens(haystack, tokens) };
}
