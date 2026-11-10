// Find and replace over the Markdown of a chapter or of the whole book.
// Pure: the find bar (editor/FindBar.tsx) compiles a query once and runs it
// over each chapter's text; replacements come back as `TextChange`s that
// carry the text they expect, so a change computed on an older text never
// lands (see `EDIT_CHAPTER_MARKDOWN`).

import type { TextChange } from './textChanges.js';

export interface FindOptions {
  /** Upper and lower case differ. */
  matchCase: boolean;
  /** The match is a whole word: no letter, digit or `_` right before or
   *  after it. */
  wholeWord: boolean;
  /** The query is a JavaScript regular expression (Unicode, `^` and `$` at
   *  line ends). The replacement is read against it piece by piece: a
   *  piece written on both sides (`\d`, `\w+`, `.`, a class, a group)
   *  keeps the text it matched, so `\d\.\d` → `\d,\d` turns 1.7 into
   *  1,7; a piece only in the replacement is written as it is (`\,` is a
   *  comma), one only in the query is dropped. `$1`, `$<name>`, `$&`, `$$`,
   *  `\n` and `\t` read as usual. */
  regex: boolean;
  /** Accented and plain letters match each other (`celula` finds
   *  `célula`). Ñ and ç stay letters of their own. Plain text only. */
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
  /** Regex mode: the query's top-level pieces and the text each matched,
   *  for a replacement that writes the same pieces (see
   *  {@link FindOptions.regex}). */
  pieces?: { readonly atoms: readonly string[]; readonly texts: readonly string[] };
}

/** A compiled query: `find` lists the matches of a text, in order. */
export interface CompiledFind {
  find: (text: string) => FindMatch[];
  regex: boolean;
}

/** Past this many matches in one text the rest are not listed (a stray
 *  `.` in regex mode would otherwise list every character). */
export const MAX_MATCHES = 5000;

const WORD_BEFORE = '(?<![\\p{L}\\p{N}_])';
const WORD_AFTER = '(?![\\p{L}\\p{N}_])';
const WORD_CHAR = /[\p{L}\p{N}_]/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const QUANTIFIER = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/;
const DOLLAR_REF = /^\$(?:\$|&|<[^>]*>|\d{1,2})/;

/** The length of the escape at `i` (a backslash and what it takes). */
function escapeLength(src: string, i: number): number {
  const c = src[i + 1];
  if (c === undefined) return 1;
  const braced = /^[uxpPk]/.test(c) ? /^\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[pP]\{[^}]*\}|k<[^>]*>)/.exec(src.slice(i)) : null;
  if (braced) return braced[0].length;
  if (c === 'c' && /[A-Za-z]/.test(src[i + 2] ?? '')) return 3;
  return 1 + (src.codePointAt(i + 1)! > 0xffff ? 2 : 1);
}

/**
 * The top-level pieces of a regular expression, each with its quantifier:
 * `\d+\.\d` → `\d+`, `\.`, `\d`. A class or a group is one piece. Null
 * when the pieces cannot be told apart: an alternation at the top level,
 * a backreference (wrapping the pieces in groups would renumber it), or a
 * bracket left open.
 */
export function patternAtoms(src: string): string[] | null {
  const atoms: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = i;
    const c = src[i]!;
    if (c === '|' || c === ')') return null;
    if (c === '\\') {
      if (/^\\(?:[1-9]|k<)/.test(src.slice(i))) return null;
      i += escapeLength(src, i);
    } else if (c === '[') {
      i++;
      while (i < src.length && src[i] !== ']') i += src[i] === '\\' ? escapeLength(src, i) : 1;
      if (i >= src.length) return null;
      i++;
    } else if (c === '(') {
      let depth = 0;
      while (i < src.length) {
        const d = src[i]!;
        if (d === '\\') {
          if (/^\\(?:[1-9]|k<)/.test(src.slice(i))) return null;
          i += escapeLength(src, i);
          continue;
        }
        if (d === '[') {
          i++;
          while (i < src.length && src[i] !== ']') i += src[i] === '\\' ? escapeLength(src, i) : 1;
        } else if (d === '(') depth++;
        else if (d === ')' && --depth === 0) break;
        i++;
      }
      if (i >= src.length) return null;
      i++;
    } else {
      i += src.codePointAt(i)! > 0xffff ? 2 : 1;
    }
    const q = QUANTIFIER.exec(src.slice(i));
    if (q) i += q[0].length;
    atoms.push(src.slice(start, i));
  }
  return atoms;
}

/** The pieces of a replacement, read the way {@link patternAtoms} reads a
 *  query (an escape or a character, with its quantifier), and `$`
 *  references. A group or a class is a piece only when the query has the
 *  same one (`(\d+) mg`); otherwise brackets and parentheses are plain
 *  characters there (`[1]`, `(véase)`). */
function replacementAtoms(src: string, queryAtoms: readonly string[] = []): string[] {
  const bracketed = queryAtoms.filter((a) => a.startsWith('(') || a.startsWith('[')).sort((a, b) => b.length - a.length);
  const atoms: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = i;
    const ref = src[i] === '$' ? DOLLAR_REF.exec(src.slice(i)) : null;
    if (ref) {
      atoms.push(ref[0]);
      i += ref[0].length;
      continue;
    }
    const shared = src[i] === '(' || src[i] === '[' ? bracketed.find((a) => src.startsWith(a, i)) : undefined;
    if (shared) {
      atoms.push(shared);
      i += shared.length;
      continue;
    }
    i += src[i] === '\\' ? escapeLength(src, i) : src.codePointAt(i)! > 0xffff ? 2 : 1;
    const q = QUANTIFIER.exec(src.slice(i));
    if (q) i += q[0].length;
    atoms.push(src.slice(start, i));
  }
  return atoms;
}

/** A piece that stands for one fixed character: a plain one, or an
 *  escaped sign (`\.`, `\,`). The replacement writes its own. */
function isLiteralAtom(atom: string): boolean {
  if (atom.startsWith('\\')) return atom.length === 2 && !/[A-Za-z0-9]/.test(atom[1]!);
  return !/^[.^$]$/.test(atom) && [...atom].length === 1;
}

/** What a replacement piece writes when no piece of the query stands
 *  behind it. */
function writeAtom(atom: string, match: FindMatch, text: string): string {
  if (atom.startsWith('$')) return expandDollar(atom, match, text);
  if (atom === '\\n') return '\n';
  if (atom === '\\t') return '\t';
  if (atom.length === 2 && atom[0] === '\\' && !/[A-Za-z0-9]/.test(atom[1]!)) return atom[1]!;
  return atom;
}

/** Pairs of equal pieces, in order (longest common subsequence). */
function alignAtoms(a: readonly string[], b: readonly string[]): Map<number, number> {
  const n = a.length;
  const m = b.length;
  const len: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i]![j] = a[i] === b[j] ? len[i + 1]![j + 1]! + 1 : Math.max(len[i + 1]![j]!, len[i]![j + 1]!);
    }
  }
  const pairs = new Map<number, number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) {
      pairs.set(j, i);
      i++;
      j++;
    } else if (len[i + 1]![j]! >= len[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

/** Letters that are letters of their own in Spanish and Catalan, not an
 *  accented form of another. */
const KEEP = new Set(['ñ', 'Ñ', 'ç', 'Ç']);
/** The scripts whose accents are folded. Kana keep their voicing marks
 *  (が is not か) and Hangul its syllables. */
const FOLDED_SCRIPT = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
const foldCache = new Map<string, string>();

/** One UTF-16 unit without its accent: the first unit of its canonical
 *  decomposition (Latin, Greek and Cyrillic letters only), so indices of
 *  the folded text are indices of the original. */
function foldUnit(ch: string): string {
  const cached = foldCache.get(ch);
  if (cached !== undefined) return cached;
  let out = ch;
  if (!KEEP.has(ch) && FOLDED_SCRIPT.test(ch)) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    out = base.length > 0 ? base[0]! : ch;
  }
  foldCache.set(ch, out);
  return out;
}

/** `s` with its accents stripped (and lowercased unless `matchCase`),
 *  unit for unit: same length as `s`. */
export function foldText(s: string, matchCase: boolean): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const f = foldUnit(s[i]!);
    // A unit whose lowercase is longer (İ) stays as it is: one for one.
    const lower = matchCase ? f : f.toLowerCase();
    out += lower.length === 1 ? lower : f;
  }
  return out;
}

function isWordAt(text: string, i: number): boolean {
  return i >= 0 && i < text.length && WORD_CHAR.test(text[i]!);
}

/** The query's pieces, and a sticky expression with each of them in a
 *  group of its own that splits a match into the text of each. */
interface PieceSplitter {
  atoms: readonly string[];
  re: RegExp;
}

function pieceSplitter(query: string, options: FindOptions): PieceSplitter | null {
  const atoms = patternAtoms(query);
  if (!atoms || atoms.length === 0) return null;
  const body = atoms.map((a, i) => `(?<__pt${i}>${a})`).join('');
  try {
    const re = new RegExp(options.wholeWord ? `${WORD_BEFORE}${body}${WORD_AFTER}` : body, `ymu${options.matchCase ? '' : 'i'}`);
    return { atoms, re };
  } catch {
    return null;
  }
}

function regexFinder(re: RegExp, splitter: PieceSplitter | null = null): (text: string) => FindMatch[] {
  return (text) => {
    const out: FindMatch[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && out.length < MAX_MATCHES) {
      if (m[0].length === 0) {
        // An empty match finds nothing to show or replace: step past it.
        re.lastIndex = m.index + (text.codePointAt(m.index)! > 0xffff ? 2 : 1);
        continue;
      }
      const match: FindMatch = { from: m.index, to: m.index + m[0].length, groups: m.slice(1), ...(m.groups ? { named: { ...m.groups } } : {}) };
      if (splitter) {
        // The same expression, grouped, at the same place: the same match.
        splitter.re.lastIndex = m.index;
        const p = splitter.re.exec(text);
        if (p && p.index === m.index && p[0].length === m[0].length) {
          match.pieces = { atoms: splitter.atoms, texts: splitter.atoms.map((_, i) => p.groups?.[`__pt${i}`] ?? '') };
        }
      }
      out.push(match);
    }
    return out;
  };
}

/**
 * Compile `query` under `options`. Null for an empty query; `{ error }`
 * for a regular expression that does not compile (the message the
 * browser gives).
 */
export function compileFind(query: string, options: FindOptions): CompiledFind | { error: string } | null {
  if (query.length === 0) return null;
  if (options.regex) {
    try {
      const source = options.wholeWord ? `${WORD_BEFORE}(?:${query})${WORD_AFTER}` : query;
      const re = new RegExp(source, `gmu${options.matchCase ? '' : 'i'}`);
      return { find: regexFinder(re, pieceSplitter(query, options)), regex: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
  if (!options.ignoreAccents) {
    const body = escapeRegExp(query);
    const source = options.wholeWord ? `${WORD_BEFORE}${body}${WORD_AFTER}` : body;
    return { find: regexFinder(new RegExp(source, `gu${options.matchCase ? '' : 'i'}`)), regex: false };
  }
  const needle = foldText(query, options.matchCase);
  return {
    regex: false,
    find: (text) => {
      const hay = foldText(text, options.matchCase);
      const out: FindMatch[] = [];
      let from = 0;
      while (out.length < MAX_MATCHES) {
        const i = hay.indexOf(needle, from);
        if (i < 0) break;
        const end = i + needle.length;
        if (!options.wholeWord || (!isWordAt(text, i - 1) && !isWordAt(text, end))) {
          out.push({ from: i, to: end });
          from = end;
        } else {
          from = i + 1;
        }
      }
      return out;
    },
  };
}

/** One `$` reference of a replacement: `$$`, `$&`, `$<name>`, `$n`. */
function expandDollar(ref: string, match: FindMatch, text: string): string {
  const groups = match.groups ?? [];
  if (ref === '$$') return '$';
  if (ref === '$&') return text.slice(match.from, match.to);
  if (ref.startsWith('$<')) return match.named?.[ref.slice(2, -1)] ?? '';
  const num = ref.slice(1);
  // `$12` is group 12 when there is one, else group 1 and a "2".
  const n = parseInt(num, 10);
  if (n >= 1 && n <= groups.length) return groups[n - 1] ?? '';
  if (num.length === 2) {
    const first = parseInt(num[0]!, 10);
    if (first >= 1 && first <= groups.length) return (groups[first - 1] ?? '') + num[1];
  }
  return ref;
}

/** The text that replaces `match` in `text`: the template as it is, or (in
 *  regex mode) read piece by piece against the query (see
 *  {@link FindOptions.regex}). */
export function expandReplacement(template: string, match: FindMatch, text: string, regex: boolean): string {
  if (!regex) return template;
  const atoms = replacementAtoms(template, match.pieces?.atoms);
  const pairs = match.pieces ? alignAtoms(match.pieces.atoms, atoms) : new Map<number, number>();
  return atoms
    .map((atom, j) => {
      const i = pairs.get(j);
      // A fixed character is the replacement's own (its case, say); any
      // other piece written on both sides keeps what it matched.
      return i !== undefined && !isLiteralAtom(atom) ? match.pieces!.texts[i]! : writeAtom(atom, match, text);
    })
    .join('');
}

/** The changes that replace every match of `matches` in `text`: only the
 *  part that differs (1.7 → 1,7 changes the point), each carrying the text
 *  it replaces as `expect`. */
export function replaceChanges(text: string, matches: readonly FindMatch[], template: string, regex: boolean): TextChange[] {
  return matches.map((m) => {
    const before = text.slice(m.from, m.to);
    const after = expandReplacement(template, m, text, regex);
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;
    let tail = 0;
    while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
    // Never between the two halves of a surrogate pair.
    if (head > 0 && /[\uD800-\uDBFF]/.test(before[head - 1]!)) head--;
    if (tail > 0 && /[\uDC00-\uDFFF]/.test(before[before.length - tail]!)) tail--;
    return {
      from: m.from + head,
      to: m.to - tail,
      insert: after.slice(head, after.length - tail),
      expect: before.slice(head, before.length - tail),
    };
  });
}

export interface MatchSnippet {
  /** 1-based line of the match. */
  line: number;
  before: string;
  match: string;
  after: string;
}

/** The line around a match for a results list: up to `radius` characters
 *  each side (cut at a word where it can be), the match itself, and the
 *  line number. A match that runs past its line shows its first line. */
export function matchSnippet(text: string, match: FindMatch, radius = 40): MatchSnippet {
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < match.from; i = text.indexOf('\n', i + 1)) line++;
  return snippetAt(text, match, line, radius);
}

/** {@link matchSnippet} of the first `limit` matches (in text order),
 *  counting lines in one pass over the text. */
export function matchSnippets(text: string, matches: readonly FindMatch[], limit = matches.length, radius = 40): MatchSnippet[] {
  const out: MatchSnippet[] = [];
  let line = 1;
  let scanned = 0;
  for (const m of matches.slice(0, limit)) {
    for (let i = text.indexOf('\n', scanned); i >= 0 && i < m.from; i = text.indexOf('\n', i + 1)) {
      line++;
      scanned = i + 1;
    }
    out.push(snippetAt(text, m, line, radius));
  }
  return out;
}

function snippetAt(text: string, match: FindMatch, line: number, radius: number): MatchSnippet {
  const lineStart = text.lastIndexOf('\n', match.from - 1) + 1;
  const nl = text.indexOf('\n', match.from);
  const lineEnd = nl < 0 ? text.length : nl;
  let start = Math.max(lineStart, match.from - radius);
  if (start > lineStart) {
    const space = text.indexOf(' ', start);
    if (space >= 0 && space < match.from) start = space + 1;
  }
  const matchEnd = Math.min(match.to, lineEnd);
  let end = Math.min(lineEnd, matchEnd + radius);
  if (end < lineEnd) {
    const space = text.lastIndexOf(' ', end);
    if (space > matchEnd) end = space;
  }
  return {
    line,
    before: (start > lineStart ? '…' : '') + text.slice(start, match.from),
    match: text.slice(match.from, matchEnd),
    after: text.slice(matchEnd, end) + (end < lineEnd ? '…' : ''),
  };
}
