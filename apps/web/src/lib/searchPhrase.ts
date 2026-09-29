/**
 * Literal-phrase ranking for the ⌘K palette. MiniSearch scores words, not
 * their order, so a page with the words scattered can outrank the one that
 * holds the exact phrase (a recipe title, a sentence). These helpers find
 * the query as a phrase, ignoring case, accents and punctuation, and tier
 * the hits so literal matches come first.
 *
 * Browser-safe, no dependencies.
 */

/** A text folded for phrase matching: lowercase, no diacritics, every run of
 *  non-letters/digits collapsed to one space, plus the original index of
 *  each folded character (so a match maps back to the text as shown). */
interface Folded {
  text: string;
  index: number[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const MARKS = /\p{M}/gu;

function fold(text: string): Folded {
  let out = "";
  const index: number[] = [];
  let space = true; // drops leading separators
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (WORD_CHAR.test(ch)) {
      const base = ch.normalize("NFD").replace(MARKS, "").toLowerCase();
      for (const c of base) {
        out += c;
        index.push(i);
      }
      space = false;
    } else if (!space) {
      out += " ";
      index.push(i);
      space = true;
    }
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
    index.pop();
  }
  return { text: out, index };
}

const cache = new Map<string, Folded>();

function folded(text: string): Folded {
  let f = cache.get(text);
  if (!f) {
    f = fold(text);
    // Bodies repeat across keystrokes; bound the cache so it cannot grow
    // without limit over a long session.
    if (cache.size > 5000) cache.clear();
    cache.set(text, f);
  }
  return f;
}

/** The query folded like the texts; empty when it holds no word. */
export function foldQuery(query: string): string {
  return fold(query).text;
}

/** Where the phrase occurs in `text`, as a [start, end) range of the
 *  original string, or null. The phrase must start a word; its last word
 *  may be a prefix, since the query is typed as the list updates. */
export function findPhrase(text: string, phrase: string): [number, number] | null {
  if (!text || !phrase) return null;
  const { text: hay, index } = folded(text);
  let from = 0;
  for (;;) {
    const at = hay.indexOf(phrase, from);
    if (at === -1) return null;
    if (at === 0 || hay[at - 1] === " ") {
      const last = at + phrase.length - 1;
      return [index[at]!, index[last]! + 1];
    }
    from = at + 1;
  }
}

/** Tiers, best first: the title is the phrase, the title contains it, the
 *  breadcrumb or body contains it, no literal match. A one-word query only
 *  earns the first. */
export const PHRASE_TIER = { titleExact: 3, title: 2, text: 1, none: 0 } as const;

export interface PhraseFields {
  sectionTitle: string;
  docTitle: string;
  breadcrumb: string;
  body: string;
}

/** How literally a result holds the (folded) query. */
export function phraseTier(fields: PhraseFields, phrase: string): number {
  if (!phrase) return PHRASE_TIER.none;
  const titles = [fields.sectionTitle, fields.docTitle];
  if (titles.some((title) => folded(title).text === phrase)) return PHRASE_TIER.titleExact;
  // One word has no order to honour: MiniSearch's own ranking stands.
  if (!phrase.includes(" ")) return PHRASE_TIER.none;
  if (titles.some((title) => findPhrase(title, phrase))) return PHRASE_TIER.title;
  if (findPhrase(fields.breadcrumb, phrase) || findPhrase(fields.body, phrase)) return PHRASE_TIER.text;
  return PHRASE_TIER.none;
}

/** Sorts scored hits by phrase tier, then by score, without mutating. */
export function rankByPhrase<T extends { tier: number; score: number }>(hits: readonly T[]): T[] {
  return [...hits].sort((a, b) => b.tier - a.tier || b.score - a.score);
}
