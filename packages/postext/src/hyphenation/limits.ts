// The document's hyphenation limits (#1466): the shortest word divided and
// the letters left at least before and after a break. Each set of limits
// has its own dictionaries and word memo, kept for the last few sets used,
// so two books that alternate in one session (or a Sandbox edit undone)
// do not rebuild every language's patterns on each switch.
import type Hypher from 'hypher';
import type { HyphenationLimits, HyphenationLocale } from '../types.js';

/** The dictionaries and word memo of one set of limits. */
export interface LimitSet {
  /** A number per set of limits, stable for the session: `0` is the
   *  languages' own. The measurement cache key carries it. */
  readonly id: number;
  readonly limits: Readonly<HyphenationLimits>;
  /** The patterns of each language, built with these limits. */
  readonly hyphenators: Map<HyphenationLocale, Hypher>;
  /** The dictionary's division of each token, per language. */
  readonly memo: Map<HyphenationLocale, Map<string, string>>;
}

/** Sets of limits kept besides the active one: enough for a book, its
 *  previous edit and another book open in the same session. */
const KEPT = 4;

const ids = new Map<string, number>([['{}', 0]]);
const sets = new Map<string, LimitSet>();
const evicted: ((id: number) => void)[] = [];

function newSet(key: string, limits: HyphenationLimits): LimitSet {
  let id = ids.get(key);
  if (id === undefined) {
    id = ids.size;
    ids.set(key, id);
  }
  return { id, limits, hyphenators: new Map(), memo: new Map() };
}

let active: LimitSet = newSet('{}', {});
let activeKey = '{}';
sets.set(activeKey, active);

/** The limits in force: their dictionaries and memo. */
export function activeLimits(): LimitSet {
  return active;
}

/** Run `drop` with the id of each set of limits let go, so memos keyed by
 *  it elsewhere (the document's rules) let go of it too. */
export function onLimitsEvicted(drop: (id: number) => void): void {
  evicted.push(drop);
}

/** `next` with each limit a whole number in range, unset ones left out. */
export function cleanLimits(next: HyphenationLimits | undefined): HyphenationLimits {
  const clean: HyphenationLimits = {};
  if (next?.minWordLength !== undefined && Number.isFinite(next.minWordLength)) clean.minWordLength = Math.max(2, Math.round(next.minWordLength));
  if (next?.leftMin !== undefined && Number.isFinite(next.leftMin)) clean.leftMin = Math.max(1, Math.round(next.leftMin));
  if (next?.rightMin !== undefined && Number.isFinite(next.rightMin)) clean.rightMin = Math.max(1, Math.round(next.rightMin));
  return clean;
}

/**
 * Set the document's hyphenation limits, as a typesetter's hyphenation
 * settings have them: the shortest word divided and the letters left at
 * least before and after a break. A limit left unset keeps the language's
 * own. Words of the exceptions list are divided where it says, whatever the
 * limits (`setHyphenationRules`). Setting the same limits again costs
 * nothing; a set used recently is taken back as it was; others build their
 * dictionaries on first use.
 */
export function setHyphenationLimits(next: HyphenationLimits | undefined): void {
  const clean = cleanLimits(next);
  // `cleanLimits` adds the keys in one order: equal limits, equal keys.
  const key = JSON.stringify(clean);
  if (key === activeKey) return;
  let set = sets.get(key);
  if (set) sets.delete(key);
  else set = newSet(key, clean);
  // Most recently used last.
  sets.set(key, set);
  active = set;
  activeKey = key;
  while (sets.size > KEPT + 1) {
    const [oldKey, old] = sets.entries().next().value as [string, LimitSet];
    sets.delete(oldKey);
    for (const drop of evicted) drop(old.id);
  }
}

/** The id of the limits in force (see {@link LimitSet.id}), for cache keys:
 *  text measured under other limits breaks elsewhere. */
export function hyphenationLimitsId(): number {
  return active.id;
}
