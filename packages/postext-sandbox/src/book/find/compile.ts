// A find query compiled once and run over the Markdown of each chapter.
// Pure, and bounded: a search stops at a match cap or at a deadline. A
// single step of a regular expression with catastrophic backtracking
// cannot be stopped from inside; the find bar runs searches in a worker
// it ends when they take too long (editor/find/findClient.ts).

import { foldWithMap, type FoldedText, type FoldOptions } from '../../text/fold.js';
import { isWholeWord } from './wordBounds.js';

export interface FindOptions {
  /** Upper and lower case differ. */
  matchCase: boolean;
  /** A match starts and ends at a word boundary. In Chinese, Japanese,
   *  Thai and the other scripts written without spaces the boundaries are
   *  the browser's word segmenter's. */
  wholeWord: boolean;
  /** The query is a JavaScript regular expression (Unicode, `^` and `$` at
   *  line ends). The replacement then reads `$1`…`$99`, `$<name>`, `$&`,
   *  `$$`, `\n`, `\t` and `\\`; everything else in it is literal. */
  regex: boolean;
  /** Accented and plain letters match each other (`celula` finds
   *  `célula`, `كتب` finds `كَتَبَ`). Ñ, ç, й and ё stay letters of their
   *  own. Plain text only. */
  ignoreAccents: boolean;
}

export const DEFAULT_FIND_OPTIONS: FindOptions = {
  matchCase: false,
  wholeWord: false,
  regex: false,
  ignoreAccents: false,
};

export interface FindMatch {
  from: number;
  to: number;
  /** The regular expression's capture groups (regex mode). */
  groups?: readonly (string | undefined)[];
  named?: Readonly<Record<string, string | undefined>>;
}

/** Why a search ended before the end of the text: the match cap or the
 *  time budget. */
export type FindStop = 'count' | 'time' | null;

export interface FindRun {
  matches: FindMatch[];
  stopped: FindStop;
}

export interface FindLimits {
  /** Most matches to list. */
  limit: number;
  /** `now()` past which the search stops. */
  deadline: number;
  now: () => number;
}

/** A compiled query. `key` names the query and its options: the same key
 *  on the same text finds the same matches. */
export interface CompiledFind {
  key: string;
  regex: boolean;
  find: (text: string, limits?: Partial<FindLimits>) => FindRun;
}

/** Past this many matches (in the whole search) the rest are not listed:
 *  a stray `.` in regex mode would otherwise list every character. */
export const MAX_MATCHES = 5000;

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function limitsOf(limits: Partial<FindLimits> = {}): FindLimits {
  return { limit: limits.limit ?? MAX_MATCHES, deadline: limits.deadline ?? Infinity, now: limits.now ?? clock };
}

function nextCodePoint(text: string, i: number): number {
  return i + (text.codePointAt(i)! > 0xffff ? 2 : 1);
}

function regexFind(re: RegExp, wholeWord: boolean): CompiledFind['find'] {
  return (text, limits) => {
    const { limit, deadline, now } = limitsOf(limits);
    const matches: FindMatch[] = [];
    re.lastIndex = 0;
    for (;;) {
      if (matches.length >= limit) return { matches, stopped: 'count' };
      if (now() > deadline) return { matches, stopped: 'time' };
      const m = re.exec(text);
      if (m === null) return { matches, stopped: null };
      const from = m.index;
      const to = from + m[0].length;
      if (to === from || (wholeWord && !isWholeWord(text, from, to))) {
        // An empty match finds nothing to show or replace, and a match
        // inside a word may have a shorter one further on: step past it.
        if (from >= text.length) return { matches, stopped: null };
        re.lastIndex = nextCodePoint(text, from);
        continue;
      }
      matches.push({ from, to, groups: m.slice(1), ...(m.groups ? { named: { ...m.groups } } : {}) });
    }
  };
}

/** A small cache of folded chapters: folding a long chapter costs more
 *  than searching it. */
const foldCache = new Map<string, Map<string, FoldedText>>();
const FOLD_CACHE_SIZE = 64;

function folded(text: string, options: FoldOptions): FoldedText {
  const flags = `${+options.accents}${+options.caseFold}`;
  let byText = foldCache.get(flags);
  if (!byText) foldCache.set(flags, (byText = new Map()));
  const hit = byText.get(text);
  if (hit) return hit;
  const f = foldWithMap(text, options);
  if (byText.size >= FOLD_CACHE_SIZE) byText.delete(byText.keys().next().value!);
  byText.set(text, f);
  return f;
}

/** Plain text: the query and the text compared folded (composed, and
 *  without case or accents as asked), so a query typed composed finds
 *  the same letters written decomposed. A match covers whole clusters. */
function plainFind(needle: string, options: FoldOptions, wholeWord: boolean): CompiledFind['find'] {
  return (text, limits) => {
    const { limit, deadline, now } = limitsOf(limits);
    const hay = folded(text, options);
    const matches: FindMatch[] = [];
    const start = (k: number) => (hay.starts ? hay.starts[k]! : k);
    const end = (k: number) => (hay.ends ? hay.ends[k]! : k + 1);
    let from = 0;
    for (;;) {
      if (matches.length >= limit) return { matches, stopped: 'count' };
      if (now() > deadline) return { matches, stopped: 'time' };
      const i = hay.text.indexOf(needle, from);
      if (i < 0) return { matches, stopped: null };
      const last = i + needle.length - 1;
      const clusterStart = i === 0 || start(i) !== start(i - 1);
      const clusterEnd = last === hay.text.length - 1 || start(last + 1) !== start(last);
      const a = start(i);
      const b = end(last);
      if (clusterStart && clusterEnd && (!wholeWord || isWholeWord(text, a, b))) {
        matches.push({ from: a, to: b });
        from = last + 1;
      } else {
        from = i + 1;
      }
    }
  };
}

/**
 * Compile `query` under `options`. Null for an empty query; `{ error }`
 * for a regular expression that does not compile (the message the
 * browser gives).
 */
export function compileFind(query: string, options: FindOptions): CompiledFind | { error: string } | null {
  if (query.length === 0) return null;
  const key = JSON.stringify([query, options.matchCase, options.wholeWord, options.regex, options.ignoreAccents && !options.regex]);
  if (options.regex) {
    try {
      const re = new RegExp(query, `gmu${options.matchCase ? '' : 'i'}`);
      return { key, regex: true, find: regexFind(re, options.wholeWord) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
  const fold = { accents: options.ignoreAccents, caseFold: !options.matchCase };
  const needle = foldWithMap(query, fold).text;
  if (needle.length === 0) return null;
  return { key, regex: false, find: plainFind(needle, fold, options.wholeWord) };
}
