/**
 * Where a kashida may go in an Arabic word, and how good a place it is: a
 * port of raqim-kashida (Khaled Hosny, aliftype, MIT licence,
 * https://github.com/aliftype/raqim-kashida, at e217f98c), its pattern
 * language and its built-in sets.
 *
 * A pattern set scores the connections of a word's joined runs (letters
 * that connect to each other: `المبتعث` is the run ا and the run لمبتعث). A
 * pattern is a row of tokens (a letter, a joining group `@Beh` that folds
 * the letters sharing its skeleton in a given position, a set `{…}`, `*`
 * any joining letter, `.` the run's edge) with a priority digit 0–9, or
 * `!` (forbidden), in the gaps between them; `9\6` drops by one per letter
 * the run is longer than the guard's floor (`[4:]`) or, with `[:4:]`, away
 * from it either way. The last rule that speaks at a connection wins. A
 * point is only ever a real connection: never after a right-joining letter
 * (ا د ذ ر ز و ة), never at a run's edge, never across a ZWNJ.
 *
 * The sets:
 * - `naskh` — Benatia, Elyaakoubi & Lazrek's matrix (TUGboat 27(2), 2006)
 *   overridden by Fawzi Salim Afifi's calligraphy manual: nothing after kāf
 *   or lām (so never inside lām-alif), nothing before ṣād, ʿayn, wāw, ḥāʾ
 *   or a final fāʾ/qāf/yāʾ, 4-letter runs best, a final pronoun hāʾ best
 *   stretched just before it. For Amiri, Noto Naskh, Scheherazade…
 * - `simple` — the Microsoft priorities (IE 5.5's `text-kashida`): after
 *   an initial or medial sīn/ṣād, before a final hāʾ/dāl, alif/ṭāʾ/lām/
 *   kāf, wāw/ʿayn/qāf/fāʾ, before any other final letter; never inside
 *   lām-alif.
 * - `nastaliq` — naskh tailored after Afifi's Persian volume.
 *
 * Indices: the points are given as UTF-16 offsets in the word where a
 * tatweel (U+0640) goes: after the whole cluster of the letter before the
 * connection (its harakat included) and after a tatweel that seats a mark.
 * A tatweel the author typed is a letter of its run like any other.
 */

import { joiningTypeOf, type JoiningType } from '../bidi';
import { JOINING_GROUP_NAMES, JOINING_GROUP_RANGES } from './joiningGroups';

/** A place a kashida may go. */
export interface KashidaPoint {
  /** UTF-16 offset in the word where the tatweel is inserted. */
  offset: number;
  /** Index of the grapheme cluster the tatweel goes after (raqim's index). */
  index: number;
  /** 0–9, higher is better. */
  priority: number;
}

/** The built-in pattern sets. */
export type KashidaPatternSetName = 'naskh' | 'simple' | 'nastaliq';

const TATWEEL = 0x0640;
const ZWNJ = 0x200C;
const ZWJ = 0x200D;

// ---------------------------------------------------------------------------
// Graphemes and joining

type Form = 'isolated' | 'initial' | 'medial' | 'final';

interface Grapheme {
  start: number;
  end: number;
  base: number;
  group: string | undefined;
  type: JoiningType;
  /** A tatweel carrying a mark: a seat, not an elongation; transparent to
   *  the runs, and a kashida after its letter goes after it. */
  seat: boolean;
}

function joiningGroupOf(cp: number): string | undefined {
  if (cp < 0x0600 || cp > 0x08FF) return undefined;
  const r = JOINING_GROUP_RANGES;
  let lo = 0;
  let hi = r.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < r[mid * 3]!) hi = mid - 1;
    else if (cp > r[mid * 3 + 1]!) lo = mid + 1;
    else return JOINING_GROUP_NAMES[r[mid * 3 + 2]!];
  }
  return undefined;
}

/** A character that stays in the cluster of the one before it (UAX #29
 *  extenders as far as Arabic needs: the transparent marks, ZWJ, ZWNJ). */
function extendsCluster(cp: number): boolean {
  return cp === ZWJ || cp === ZWNJ || joiningTypeOf(cp) === 'T';
}

function isJoining(t: JoiningType): boolean {
  return t === 'D' || t === 'R' || t === 'L' || t === 'C';
}

function splitGraphemes(text: string): Grapheme[] {
  const out: Grapheme[] = [];
  for (let i = 0; i < text.length;) {
    const base = text.codePointAt(i)!;
    const start = i;
    i += base > 0xFFFF ? 2 : 1;
    let type = joiningTypeOf(base);
    let nonJoiningAfter = false;
    let joinCausingAfter = false;
    let mark = false;
    while (i < text.length) {
      const cp = text.codePointAt(i)!;
      if (!extendsCluster(cp)) break;
      const t = joiningTypeOf(cp);
      if (t === 'U') nonJoiningAfter = true;
      else if (t === 'C') joinCausingAfter = true;
      else if (t === 'T') mark = true;
      i += cp > 0xFFFF ? 2 : 1;
    }
    // A ZWNJ in the cluster cuts the join after it; a ZWJ makes a
    // dual-joining letter join on.
    if (nonJoiningAfter) {
      if (type === 'D' || type === 'C') type = 'R';
      else if (type === 'L' || type === 'T') type = 'U';
    } else if (type === 'D' && joinCausingAfter) {
      type = 'C';
    }
    out.push({ start, end: i, base, group: joiningGroupOf(base), type, seat: base === TATWEEL && mark });
  }
  return out;
}

function joinsLeft(g: readonly Grapheme[], i: number): boolean {
  const cur = g[i]!;
  if (!isJoining(cur.type) || cur.type === 'R') return false;
  const next = g[i + 1];
  return next !== undefined && isJoining(next.type) && next.type !== 'L';
}

function joinsRight(g: readonly Grapheme[], i: number): boolean {
  const cur = g[i]!;
  if (!isJoining(cur.type) || cur.type === 'L') return false;
  const prev = g[i - 1];
  return prev !== undefined && isJoining(prev.type) && prev.type !== 'R';
}

function formOf(g: readonly Grapheme[], i: number): Form {
  const right = joinsRight(g, i);
  const left = joinsLeft(g, i);
  return right ? (left ? 'medial' : 'final') : (left ? 'initial' : 'isolated');
}

/** The joined runs: maximal rows of letters connected to each other
 *  (grapheme indices). Marks and seat tatweels are no letters of a run. */
function joinedRuns(g: readonly Grapheme[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < g.length; i++) {
    const x = g[i]!;
    if (x.type === 'T' || x.seat) continue;
    if (!isJoining(x.type)) {
      if (cur.length > 0) out.push(cur);
      cur = [];
      continue;
    }
    const last = cur[cur.length - 1];
    if (last !== undefined && (g[last]!.type === 'R' || x.type === 'L')) {
      out.push(cur);
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// Rasm folding: groups sharing a skeleton in some positions. Only the first
// group of a class folds the others (@Beh takes an initial noon, @Noon never
// takes a beh).

const RASM_CLASSES: readonly { groups: readonly string[]; forms: readonly Form[] }[] = [
  { groups: ['Beh', 'Noon', 'African_Noon', 'Nya', 'Yeh', 'Farsi_Yeh'], forms: ['initial', 'medial'] },
  { groups: ['Feh', 'African_Feh', 'Qaf', 'African_Qaf'], forms: ['initial', 'medial'] },
  { groups: ['Feh', 'African_Feh'], forms: ['final', 'isolated'] },
  { groups: ['Qaf', 'African_Qaf'], forms: ['final', 'isolated'] },
  { groups: ['Heh', 'Heh_Goal', 'Teh_Marbuta', 'Teh_Marbuta_Goal'], forms: ['final', 'isolated'] },
  { groups: ['Noon', 'African_Noon', 'Nya'], forms: ['final', 'isolated'] },
  { groups: ['Yeh', 'Farsi_Yeh', 'Yeh_With_Tail'], forms: ['final', 'isolated'] },
  { groups: ['Yeh_Barree', 'Burushaski_Yeh_Barree'], forms: ['final', 'isolated'] },
  { groups: ['Kaf', 'Gaf'], forms: ['initial', 'medial'] },
];

function rasmMatches(token: string, group: string | undefined, form: Form): boolean {
  for (const cls of RASM_CLASSES) {
    if (!cls.forms.includes(form) || !cls.groups.includes(token)) continue;
    return cls.groups[0] === token && group !== undefined && cls.groups.includes(group);
  }
  return token === group;
}

// ---------------------------------------------------------------------------
// Compiled patterns

type Token =
  | { kind: 'group'; group: string }
  | { kind: 'exact'; group: string }
  | { kind: 'set'; members: Token[] }
  | { kind: 'notSet'; members: Token[] }
  | { kind: 'literal'; cp: number }
  | { kind: 'any' };

type Weight = { base: number; min: number } | 'suppress';

type Guard =
  | { kind: 'exact'; n: number }
  | { kind: 'min'; n: number }
  | { kind: 'range'; lo: number; hi: number }
  | { kind: 'open'; n: number };

interface Pattern {
  guard?: Guard;
  tokens: Token[];
  /** `weights[k]`: the gap before token k; the last, the gap after the
   *  last token. */
  weights: (Weight | undefined)[];
  leading: boolean;
  trailing: boolean;
}

/** A compiled pattern set. */
export interface KashidaPatternSet {
  readonly patterns: readonly Pattern[];
}

/** A pattern line that does not compile: `line` is 1-based. */
export class KashidaPatternError extends Error {
  constructor(message: string, readonly line: number) {
    super(`${message} (line ${line})`);
    this.name = 'KashidaPatternError';
  }
}

const KNOWN_GROUPS = new Set(JOINING_GROUP_NAMES);

function referenceToken(name: string): Token {
  const bare = name.slice(1);
  if (bare === 'Tatweel') return { kind: 'literal', cp: TATWEEL };
  if (!KNOWN_GROUPS.has(bare)) throw new Error(`Unknown Unicode Joining_Group name “${name}”`);
  return name[0] === '@' ? { kind: 'group', group: bare } : { kind: 'exact', group: bare };
}

function isLetter(cp: number): boolean {
  return isJoining(joiningTypeOf(cp));
}

/** Parse one comment-stripped, non-empty pattern line. */
function parsePattern(line: string): Pattern {
  const chars = Array.from(line);
  let pos = 0;
  const peek = () => chars[pos];
  let guard: Guard | undefined;
  if (peek() === '[') {
    const close = chars.indexOf(']', pos);
    if (close < 0) throw new Error('Unterminated length guard');
    const body = chars.slice(pos + 1, close).join('').trim();
    pos = close + 1;
    const bound = (s: string) => {
      if (!/^\d+$/.test(s)) throw new Error(`Invalid length guard “${body}”`);
      return Number(s);
    };
    if (body.startsWith(':') && body.endsWith(':') && body.length > 1) guard = { kind: 'open', n: bound(body.slice(1, -1)) };
    else if (body.endsWith(':')) guard = { kind: 'min', n: bound(body.slice(0, -1)) };
    else if (body.includes(':')) {
      const c = body.indexOf(':');
      guard = { kind: 'range', lo: bound(body.slice(0, c)), hi: bound(body.slice(c + 1)) };
    } else guard = { kind: 'exact', n: bound(body) };
    const ok = guard.kind === 'range' ? guard.lo >= 2 && guard.lo <= guard.hi : guard.n >= 2;
    if (!ok) throw new Error(`Invalid length guard “${body}”`);
  }

  const tokens: Token[] = [];
  const weights: (Weight | undefined)[] = [];
  let leading = false;
  let trailing = false;

  const readReference = (): Token => {
    let name = chars[pos]!;
    pos++;
    while (pos < chars.length && /[A-Za-z_]/.test(chars[pos]!)) name += chars[pos++];
    if (name.length === 1) throw new Error('Empty group name');
    return referenceToken(name);
  };
  const readSet = (): Token[] => {
    const close = chars.indexOf('}', pos);
    if (close < 0) throw new Error('Unterminated “{”');
    const body = chars.slice(pos + 1, close).join('');
    pos = close + 1;
    if (body.trim() === '') throw new Error('Empty “{}”');
    const members: Token[] = [];
    for (const part of body.trim().split(/\s+/)) {
      if (part[0] === '@' || part[0] === '=') members.push(referenceToken(part));
      else for (const ch of part) {
        const cp = ch.codePointAt(0)!;
        if (!isLetter(cp)) throw new Error(`Stray character “${ch}”`);
        members.push({ kind: 'literal', cp });
      }
    }
    return members;
  };
  const setWeight = (w: Weight) => {
    const k = tokens.length;
    if (weights[k] !== undefined) throw new Error('Conflicting weights');
    weights[k] = w;
  };

  for (;;) {
    while (peek() === ' ' || peek() === '\t') pos++;
    const ch = peek();
    if (ch === undefined) break;
    if (ch === '.') {
      pos++;
      if (tokens.length === 0) leading = true;
      else trailing = true;
      continue;
    }
    if (trailing) throw new Error('Token after a trailing “.”');
    if (ch === '!') {
      pos++;
      setWeight('suppress');
      continue;
    }
    if (ch === '\\') throw new Error('“\\” must follow a priority digit');
    if (/\d/.test(ch)) {
      pos++;
      const base = Number(ch);
      let min = base;
      if (peek() === '\\') {
        pos++;
        const d = peek();
        if (d === undefined || !/\d/.test(d)) throw new Error('Expected a digit after “\\”');
        pos++;
        min = Number(d);
        if (min > base) throw new Error('A priority must not increase with the run length');
      }
      setWeight({ base, min });
      continue;
    }
    if (ch === '*') {
      pos++;
      tokens.push({ kind: 'any' });
    } else if (ch === '{') {
      tokens.push({ kind: 'set', members: readSet() });
    } else if (ch === '^') {
      pos++;
      const n = peek();
      if (n === '{') tokens.push({ kind: 'notSet', members: readSet() });
      else if (n === '@' || n === '=') tokens.push({ kind: 'notSet', members: [readReference()] });
      else throw new Error('“^” must be followed by “{”, “@”, or “=”');
    } else if (ch === '@' || ch === '=') {
      tokens.push(readReference());
    } else {
      pos++;
      const cp = ch.codePointAt(0)!;
      if (!isLetter(cp)) throw new Error(`Stray character “${ch}”`);
      tokens.push({ kind: 'literal', cp });
    }
  }
  if (tokens.length === 0) throw new Error('Pattern has no letters');
  weights.length = tokens.length + 1;
  if ((leading && weights[0] !== undefined) || (trailing && weights[tokens.length] !== undefined)) {
    throw new Error('Weight outside the run');
  }
  return { ...(guard ? { guard } : {}), tokens, weights, leading, trailing };
}

/** Compile pattern text (raqim's language; `use <set>` splices a built-in
 *  set in, `naskh` / `simple` / `nastaliq` or raqim's `arabic-…` names). */
export function compileKashidaPatterns(text: string): KashidaPatternSet {
  const patterns: Pattern[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hash = lines[i]!.indexOf('#');
    const line = (hash >= 0 ? lines[i]!.slice(0, hash) : lines[i]!).replace(/\r$/, '').trim();
    if (line === '') continue;
    const use = /^use[ \t]+(.+)$/.exec(line);
    try {
      if (use) {
        const name = use[1]!.trim().replace(/^arabic-/, '');
        if (name !== 'naskh' && name !== 'simple' && name !== 'nastaliq') throw new Error(`Unknown pattern set “${use[1]!.trim()}”`);
        patterns.push(...kashidaPatternSet(name).patterns);
        continue;
      }
      patterns.push(parsePattern(line));
    } catch (e) {
      if (e instanceof KashidaPatternError) throw e;
      throw new KashidaPatternError((e as Error).message, i + 1);
    }
  }
  return { patterns };
}

// ---------------------------------------------------------------------------
// Matching

function matchToken(t: Token, g: readonly Grapheme[], i: number): boolean {
  const x = g[i]!;
  switch (t.kind) {
    case 'any': return isJoining(x.type);
    case 'literal': return x.base === t.cp;
    case 'group': return rasmMatches(t.group, x.group, formOf(g, i));
    case 'exact': return x.group === t.group;
    case 'set': return t.members.some((m) => matchToken(m, g, i));
    case 'notSet': return isJoining(x.type) && !t.members.some((m) => matchToken(m, g, i));
  }
}

function guardMatches(guard: Guard | undefined, len: number): boolean {
  if (!guard) return true;
  switch (guard.kind) {
    case 'exact': return len === guard.n;
    case 'min': return len >= guard.n;
    case 'range': return len >= guard.lo && len <= guard.hi;
    case 'open': return true;
  }
}

function guardFloor(guard: Guard | undefined): number {
  if (!guard) return 2;
  return guard.kind === 'range' ? guard.lo : guard.n;
}

function resolveRun(g: readonly Grapheme[], run: readonly number[], set: KashidaPatternSet, out: KashidaPoint[]): void {
  const len = run.length;
  if (len < 2) return;
  const priorities: (number | undefined)[] = new Array(len - 1).fill(undefined);
  for (const p of set.patterns) {
    if (!guardMatches(p.guard, len)) continue;
    const floor = guardFloor(p.guard);
    const m = p.tokens.length;
    if (m > len) continue;
    for (let start = 0; start + m <= len; start++) {
      if (p.leading && start !== 0) continue;
      // A join-causing last member (a tatweel, a ZWJ tail) joins on, so
      // nothing in that run is final.
      if (p.trailing && (start + m !== len || g[run[len - 1]!]!.type === 'C')) continue;
      let matched = true;
      for (let k = 0; k < m && matched; k++) matched = matchToken(p.tokens[k]!, g, run[start + k]!);
      if (!matched) continue;
      for (let gap = 0; gap <= m; gap++) {
        const w = p.weights[gap];
        if (w === undefined) continue;
        const point = start + gap - 1;
        if (point < 0 || point > len - 2) continue;
        priorities[point] = w === 'suppress' ? undefined : Math.max(w.min, w.base - Math.abs(len - floor));
      }
    }
  }
  for (let point = 0; point < len - 1; point++) {
    const priority = priorities[point];
    if (priority === undefined) continue;
    let index = run[point]!;
    while (g[index + 1]?.seat) index++;
    out.push({ offset: g[index]!.end, index, priority });
  }
}

/** The kashida points of `word` under `set`, in logical order. Text that
 *  is not Arabic-like (no joining letter) has none. */
export function findKashidaPoints(word: string, set: KashidaPatternSet): KashidaPoint[] {
  const g = splitGraphemes(word);
  const out: KashidaPoint[] = [];
  for (const run of joinedRuns(g)) resolveRun(g, run, set, out);
  return out;
}

// ---------------------------------------------------------------------------
// Built-in sets (data/*.pat of raqim-kashida, verbatim but for comments
// shortened)

const NASKH = String.raw`
# Classical Arabic Naskh, after Benatia, Elyaakoubi & Lazrek (2006),
# TUGboat 27(2):137–146, fig. 25, overridden by Fawzi Salim Afifi,
# "Learning Arabic Calligraphy", part 3. 9\6 recommended, 6\3 neutral,
# 3\0 discouraged; [:4:] makes 4-letter runs best.
[:4:] @Beh 9\6 @Tah
[:4:] @Beh 6\3 {@Alef @Meem @Noon @Heh}
[:4:] @Beh 3\0 {@Hah @Dal @Reh @Lam}
[:4:] @Hah 9\6 @Tah
[:4:] @Hah 3\0 {@Alef @Hah @Dal @Reh @Ain @Kaf @Lam @Meem @Noon @Heh @Waw}
[:4:] @Ain 9\6 @Tah
[:4:] @Ain 3\0 {@Alef @Hah @Dal @Reh @Ain @Lam @Meem @Noon @Heh}
[:4:] {@Seen @Sad @Tah} 6\3 {@Alef @Beh @Reh @Seen @Sad @Tah @Kaf @Lam @Noon}
[:4:] {@Seen @Sad @Tah} 3\0 {@Hah @Dal @Ain @Feh @Qaf @Meem @Heh @Waw}
[:4:] @Feh 9\6 @Tah
[:4:] @Feh 6\3 @Alef
[:4:] @Feh 3\0 {@Hah @Dal @Reh @Ain @Lam @Meem @Waw}
[:4:] @Meem 6\3 {@Tah @Dal @Reh}
[:4:] @Meem 3\0 {@Alef @Hah @Ain @Kaf @Lam @Meem @Noon @Heh @Waw}
[:4:] @Heh 6\3 @Beh
[:4:] @Heh 3\0 {@Alef @Seen @Reh @Dal @Lam @Heh}
# A word ending in a pronoun heh is best stretched just before it.
* 9 @Heh .
# Afifi: nothing before sad, ain, waw, heh or a final feh/qaf/yeh (hah
# connects from the top), nothing after kaf or lam.
! {@Hah @Sad @Ain @Waw}
! {@Feh @Qaf @Yeh @Yeh_Barree} .
{@Kaf @Lam} !
# An initial beh before a high medial tooth, or before the ascending one.
. @Beh 2 @Beh {@Beh @Seen}
. @Beh 6 @Beh {@Noon @Reh} .
. @Beh ! @Beh @Beh {@Reh @Noon} .
`;

const SIMPLE = String.raw`
# The Microsoft rules, weakest first.
3 * .
4 {@Waw @Ain @Qaf @Feh} .
5 @Beh {@Reh @Yeh @Yeh_Barree} .
6 {@Alef @Tah @Lam @Kaf @Gaf} .
7 {@Heh @Dal} .
{@Seen @Sad} 8 *
@Tatweel 9
@Lam ! @Alef
`;

const NASTALIQ = String.raw`
# Naskh tailored after Afifi's Silsilat taalim al-khatt al-arabi, part 9.
use naskh
* 6\3 @Heh .
@Seen 9
{@Kaf @Lam} !
. @Beh !
! {@Ain @Feh @Qaf @Tah @Hah @Sad @Waw}
! @Heh *
! {@Yeh @Yeh_Barree} .
`;

const compiled = new Map<KashidaPatternSetName, KashidaPatternSet>();

/** A built-in pattern set, compiled on first use. */
export function kashidaPatternSet(name: KashidaPatternSetName): KashidaPatternSet {
  let set = compiled.get(name);
  if (!set) {
    set = compileKashidaPatterns(name === 'naskh' ? NASKH : name === 'simple' ? SIMPLE : NASTALIQ);
    compiled.set(name, set);
  }
  return set;
}
