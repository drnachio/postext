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

/** What stands before the space of a numbered citation: a word or the
 *  punctuation that ends one, never a number. */
const BEFORE_CITATION = /[\p{L}\p{M}.,;:!?»”’)\]]$/u;
const WHITESPACE = /\s/u;
const NO_BREAK_SPACE = '\u00a0';

const isDigit = (code: number): boolean => code >= 48 && code <= 57;
const isLowerLetter = (code: number): boolean => code >= 97 && code <= 122;
const isCloser = (ch: string | undefined): boolean => ch === ']' || ch === ')';
const isSeparator = (ch: string | undefined): boolean => ch === ',' || ch === ';' || ch === '–' || ch === '-';

/**
 * Where the numbered citation that opens at `open` (its bracket or
 * parenthesis) ends in `text`, past its closing one; -1 when what opens
 * there is no citation. The numbers may be a list or a range ("[12, 14]",
 * "(12–15)", "[3a; 4]"), and the marker the engine writes for
 * `[@key, p. 12]` ends on a locator after a comma: one word, or two
 * joined by a no-break space ("[3, p.~12]", the tilde standing for it).
 *
 * Read by hand, each character a bounded number of times: an expression
 * whose list and locator may both read the same numbers takes quadratic
 * time on a long list that never closes (code scanning #346).
 */
function citationEnd(text: string, open: number): number {
  const n = text.length;
  /** The end of a number and its letter at `p`, or -1. */
  const numberEnd = (p: number): number => {
    let q = p;
    while (q < n && isDigit(text.charCodeAt(q))) q++;
    if (q === p) return -1;
    return q < n && isLowerLetter(text.charCodeAt(q)) ? q + 1 : q;
  };
  const pastSpace = (p: number): number => {
    while (p < n && WHITESPACE.test(text[p]!)) p++;
    return p;
  };
  let end = numberEnd(open + 1);
  if (end < 0) return -1;
  // Where each number of the list ends: the locator may start at any.
  const ends = [end];
  for (;;) {
    let p = pastSpace(end);
    if (!isSeparator(text[p])) break;
    p = numberEnd(pastSpace(p + 1));
    if (p < 0) break;
    ends.push(end = p);
  }
  if (isCloser(text[end])) return end + 1;
  // The end of the word that starts at `p`: the first space or closing
  // sign. Words are read from the last backwards and kept, so a later
  // start runs into one already read and takes its end.
  const wordEnds = new Map<number, number>();
  const wordEnd = (p: number): number => {
    let q = p;
    while (q < n) {
      const known = wordEnds.get(q);
      if (known !== undefined) {
        q = known;
        break;
      }
      const ch = text[q]!;
      if (isCloser(ch) || WHITESPACE.test(ch)) break;
      q++;
    }
    wordEnds.set(p, q);
    return q;
  };
  for (let k = ends.length - 1; k >= 0; k--) {
    const at = ends[k]!;
    if (text[at] !== ',') continue;
    const first = pastSpace(at + 1);
    const firstEnd = wordEnd(first);
    if (firstEnd === first) continue;
    if (isCloser(text[firstEnd])) return firstEnd + 1;
    if (text[firstEnd] !== NO_BREAK_SPACE) continue;
    const secondEnd = wordEnd(firstEnd + 1);
    if (secondEnd > firstEnd + 1 && isCloser(text[secondEnd])) return secondEnd + 1;
  }
  return -1;
}

/** Each numbered citation of `text` with the space before it: where that
 *  space is and where the citation ends. */
function citations(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let i = text.indexOf(' ');
  while (i >= 0) {
    const ch = text[i + 1];
    const end = (ch === '[' || ch === '(') && i > 0 && BEFORE_CITATION.test(text.slice(Math.max(0, i - 2), i)) ? citationEnd(text, i + 1) : -1;
    if (end < 0) {
      i = text.indexOf(' ', i + 1);
      continue;
    }
    out.push({ start: i, end });
    i = text.indexOf(' ', end);
  }
  return out;
}
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
    for (const { start, end } of citations(text)) {
      if (OTHER_SCRIPTS.test(around(text, start, end))) continue;
      const cite = text.slice(start + 1, end);
      out.push({ at: start, rule: 'citation', text: cite });
      for (let k = start + 1; k < end; k++) if (text[k] === ' ') out.push({ at: k, rule: 'citation', text: cite });
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
