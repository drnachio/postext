/**
 * Spaces a line must not break at, though nothing marks them in the text
 * (`bodyText.bindCitations`, `bodyText.bindOperators`): each becomes a
 * no-break space (U+00A0), which the breakers keep inside the run it glues.
 * The substitution is one character for one, so every source offset, span
 * boundary and index computed on the block still holds.
 *
 * - A numbered citation in brackets or parentheses stays with the word
 *   before it, and is not divided itself: "autores [12]", "[12, 14]",
 *   "(12–15)". Not after a number: "2016 (3)" is no citation.
 * - A relation or operator set between spaces stays with both of its
 *   terms: "LR+ = 18.29", "p < 0.05", "3 × 4". A line never ends on it nor
 *   starts with it.
 *
 * Paragraphs, list items and quotations set horizontally, in the alphabetic
 * scripts that break at spaces: a block with right-to-left or CJK text is
 * left as it is.
 */

import type { ContentBlock, InlineSpan } from '../../parse/index.js';

export interface BoundSpacesRules {
  citations: boolean;
  operators: boolean;
}

const NBSP = '\u00A0';
/** Scripts whose text the rules leave alone: right-to-left text (a number
 *  in brackets there is measured and ordered in the script around it) and
 *  CJK, Thai and the like, which break lines by their own rules. */
const OTHER_SCRIPTS_RE = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;

/** A space before a numbered citation, and the spaces inside it: after a
 *  word or the punctuation that ends one, never after a number ("2016 (3)"
 *  is a year and an issue, not a citation). */
const CITATION_RE = /(?<=[\p{L}\p{M}.,;:!?»”’)\]]) ([[(]\d+[a-z]?(?:\s*[,;–-]\s*\d+[a-z]?)*[\])])/gu;
/** A relation or operator set between spaces, and those spaces. */
const OPERATOR_RE = /(?<=\S) ([=<>≤≥±×≈≠÷−]) (?=\S)/gu;

/** The offsets of `text` whose space becomes a no-break space. */
export function boundSpaceOffsets(text: string, rules: BoundSpacesRules): number[] {
  const out: number[] = [];
  if (OTHER_SCRIPTS_RE.test(text)) return out;
  if (rules.citations && text.includes(' ')) {
    for (const m of text.matchAll(CITATION_RE)) {
      const start = m.index;
      out.push(start);
      for (let k = 1; k < m[0].length; k++) if (m[0][k] === ' ') out.push(start + k);
    }
  }
  if (rules.operators) {
    for (const m of text.matchAll(OPERATOR_RE)) out.push(m.index, m.index + 2);
  }
  return out;
}

/** `text` with a no-break space at each of `offsets`. */
function bind(text: string, offsets: ReadonlySet<number>, from = 0): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += offsets.has(from + i) && text[i] === ' ' ? NBSP : text[i];
  return out;
}

function boundSpans(spans: readonly InlineSpan[], offsets: ReadonlySet<number>): InlineSpan[] {
  let at = 0;
  return spans.map((span) => {
    const from = at;
    at += span.text.length;
    const text = bind(span.text, offsets, from);
    return text === span.text ? span : { ...span, text };
  });
}

const memo = new WeakMap<ContentBlock, Map<string, ContentBlock>>();

/**
 * `block` with the spaces of {@link BoundSpacesRules} made no-break spaces,
 * or `block` itself when there are none (or its spans do not spell its text
 * one for one). The same block comes back for the same block and rules.
 */
export function withBoundSpaces(block: ContentBlock, rules: BoundSpacesRules): ContentBlock {
  if (!rules.citations && !rules.operators) return block;
  const key = `${rules.citations ? 'c' : ''}${rules.operators ? 'o' : ''}`;
  let byRules = memo.get(block);
  const known = byRules?.get(key);
  if (known) return known;
  let bound = block;
  const offsets = boundSpaceOffsets(block.text, rules);
  if (offsets.length > 0 && block.spans.map((s) => s.text).join('') === block.text) {
    const set = new Set(offsets);
    bound = { ...block, text: bind(block.text, set), spans: boundSpans(block.spans, set) };
  }
  if (!byRules) {
    byRules = new Map();
    memo.set(block, byRules);
  }
  byRules.set(key, bound);
  return bound;
}
