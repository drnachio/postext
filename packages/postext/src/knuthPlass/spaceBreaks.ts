/**
 * Word spaces a line should not break at (#1519, `bodyText.citationBreaks`,
 * `bodyText.operatorBreaks`), found in the text and priced for the line
 * breaker. The spaces stay what they are, word spaces that stretch and
 * shrink with the others; a break at one costs demerits (`KPGlue.
 * breakDemerits`), so the breaker takes it only when every other setting of
 * the paragraph is worse.
 *
 * - A numbered citation in brackets or parentheses, after a word or the
 *   punctuation that ends one: the space before it and the spaces inside
 *   it ("autores [12]", "[12, 14]", "(12–15)", "[3, p. 12]"), so no line
 *   starts with it. Not after a number: "2016 (3)" is a year and an issue.
 * - A relation or operator set between spaces: both spaces ("p < 0.05",
 *   "LR+ = 18.29", "3 × 4"), so no line ends or starts on it.
 *
 * Each match is read in the script around it: right-to-left text (a number
 * in brackets there is ordered in the script around it) and CJK, Thai and
 * the like, which break lines by their own rules, are left alone.
 */

/** Demerits a break at each kind of space costs; 0 leaves it free. */
export interface SpaceBreakCosts {
  citations: number;
  operators: number;
}

/** Scripts whose text the rules leave alone. */
const OTHER_SCRIPTS = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;

/** A space before a numbered citation and the citation: after a word or
 *  the punctuation that ends one, never after a number. The numbers may be
 *  a list or a range, and the marker the engine writes for `[@key, p. 12]`
 *  ends on a locator ("[3, p. 12]", its word joined by a no-break space). */
const CITATION = /(?<=[\p{L}\p{M}.,;:!?»”’)\]]) ([[(]\d+[a-z]?(?:\s*[,;–-]\s*\d+[a-z]?)*(?:,\s*[^\s\])]+(?: [^\s\])]+)?)?[\])])/gu;
/** A relation or operator set between spaces. */
const OPERATOR = /(?<=\S) ([=<>≤≥±×≈≠÷−+·→]) (?=\S)/gu;

/** The word around `from`–`to` in `text`: out to the spaces either side. */
function around(text: string, from: number, to: number): string {
  const start = text.lastIndexOf(' ', from - 1) + 1;
  const end = text.indexOf(' ', to);
  return text.slice(start, end < 0 ? text.length : end);
}

/** Where a space in `text` is one of the kind: its offset and which rule. */
export interface RuledSpace {
  at: number;
  rule: 'citation' | 'operator';
  /** The citation or the operator the space belongs to. */
  text: string;
}

/** The spaces of `text` the rules price, in order of offset. */
export function ruledSpaces(text: string, rules: { citations: boolean; operators: boolean }): RuledSpace[] {
  const out: RuledSpace[] = [];
  if (!text.includes(' ')) return out;
  if (rules.citations && (text.includes('[') || text.includes('('))) {
    for (const m of text.matchAll(CITATION)) {
      const start = m.index;
      if (OTHER_SCRIPTS.test(around(text, start, start + m[0].length))) continue;
      const cite = m[1]!;
      out.push({ at: start, rule: 'citation', text: cite });
      for (let k = 1; k < m[0].length; k++) if (m[0][k] === ' ') out.push({ at: start + k, rule: 'citation', text: cite });
    }
  }
  if (rules.operators) {
    for (const m of text.matchAll(OPERATOR)) {
      const start = m.index;
      if (OTHER_SCRIPTS.test(around(text, start, start + 3))) continue;
      const sign = m[1]!;
      out.push({ at: start, rule: 'operator', text: sign }, { at: start + 2, rule: 'operator', text: sign });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The demerits of a break at each space piece of a paragraph set in
 * `pieces` (words and spaces, in order, spelling the text), by piece index;
 * undefined when none costs anything.
 */
export function spaceBreakDemerits(
  pieces: readonly string[],
  isSpace: (i: number) => boolean,
  costs: SpaceBreakCosts,
): Map<number, number> | undefined {
  const text = pieces.join('');
  const found = ruledSpaces(text, { citations: costs.citations > 0, operators: costs.operators > 0 });
  if (found.length === 0) return undefined;
  const out = new Map<number, number>();
  let at = 0;
  let f = 0;
  for (let i = 0; i < pieces.length && f < found.length; i++) {
    const end = at + pieces[i]!.length;
    while (f < found.length && found[f]!.at < end) {
      const s = found[f++]!;
      if (s.at >= at && isSpace(i)) {
        const cost = s.rule === 'citation' ? costs.citations : costs.operators;
        out.set(i, Math.max(out.get(i) ?? 0, cost));
      }
    }
    at = end;
  }
  return out.size > 0 ? out : undefined;
}
