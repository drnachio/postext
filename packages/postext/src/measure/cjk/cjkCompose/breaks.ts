// Where a line may break and how gaps stretch: Latin and question-mark
// spaces, number glue, line-start and line-end prohibitions, title
// brackets, note and keep-all breaks (#1276: split out of cjkCompose.ts).
import { isCjkGrapheme, cjkClassOf, isFullwidthDigit, isFullwidthAlnum, type CjkLineBreakLevel, isJapaneseLineBreak, isLineStartProhibited, isLineEndProhibited, isLabelEndProhibited, cjkBreakAllowed, type CjkClass } from '../cjkClasses.js';
import { lastGrapheme } from '../../graphemes.js';
import { type CjkComposition, isLatinSpacingLatin, isLatinSpacingHan, latinSpacingPx } from '../cjkPunctuation.js';
import { emOfFont, charUnitIn, QUESTION_MARKS } from './prepareUnits.js';
import type { Unit } from './units.js';

/** The character a chip's words open (`first`) or close (`last`) with, in
 *  their logical order; undefined for a unit that is not a chip, or a chip
 *  in a superscript or a subscript. */
function chipEdgeGrapheme(u: Unit, edge: 'first' | 'last'): string | undefined {
  const text = chipText(u);
  if (text === '') return undefined;
  return edge === 'first' ? String.fromCodePoint(text.codePointAt(0)!) : lastGrapheme(text);
}

/** The words of a chip in their logical order; empty for a unit that is
 *  not a chip, or a chip in a superscript or a subscript. */
function chipText(u: Unit): string {
  const runs = u.kind === 'atomic' && !u.style.script ? u.token?.chip?.runs : undefined;
  return runs ? runs.map((r) => r.text).join('') : '';
}

/** `units` with the Han–Latin spaces of `cjk.latinSpacing` (see
 *  {@link prepareUnits}).
 *
 *  A chip (`:chip[…]`) is a box of text: on each side it takes the space
 *  its own words would (#462). `:chip[unicodedata]` between kana is Latin
 *  on both sides and gets the quarter em JLReq §3.2.2 puts between
 *  Japanese and Western text, as `unicodedata` set plain would;
 *  `:chip[漢字]` is Han on both sides, so a Latin word touching it gets
 *  the space and a kana does not. Its line-break class stays that of an
 *  inline box. The rest follows from the rule for plain text: the space
 *  goes at a line end and is dropped at a line start like any space, and
 *  a bracket, a mark or a sign next to the chip is neither Han nor Latin,
 *  so 「:chip[x]」 takes none. Down a vertical line the chip is set
 *  sideways, as a Latin run is, and the same rule holds.
 *
 *  Which edge of a Western word is Latin follows `cjk.latinSpacingEdge`
 *  (#721). `'letters'`: one that is a letter or a digit. `'western'` (the
 *  Japan region's): any edge of a word that holds a letter or a digit,
 *  its brackets and signs being Western characters too (JLReq §3.2.6,
 *  §3.9.2), but for a mark that binds to the other side: an opening
 *  bracket or a prefix sign that ends the word, a closing bracket, a
 *  pause, a stop or a postfix sign that opens it. A word of marks alone
 *  (`(`, `!`) stands in Japanese context and takes none. */
export function latinSpaces(units: Unit[], c: CjkComposition): Unit[] {
  const out: Unit[] = [];
  const western = c.latinSpacingEdge === 'western';
  /** Whether `text` holds a letter or a digit that is not CJK. */
  const holdsLetter = (text: string): boolean => {
    for (const g of text) if (isLatinSpacingLatin(g) && !isCjkGrapheme(g) && !isLatinSpacingHan(g)) return true;
    return false;
  };
  /** Whether the edge `g` of the Western word `text` takes the space. */
  const latinEdge = (text: string, g: string, edge: 'first' | 'last'): boolean => {
    if (isLatinSpacingLatin(g)) return true;
    if (!western || g === '\u00A0' || g === '\u202F') return false;
    const cls = cjkClassOf(g);
    if (edge === 'last' ? cls === 'opening' || cls === 'prefix' : cls === 'closing' || cls === 'pause' || cls === 'stop' || cls === 'postfix') return false;
    return holdsLetter(text);
  };
  const han = (u: Unit | undefined, edge: 'first' | 'last'): boolean => {
    if (!u) return false;
    const chipEdge = chipEdgeGrapheme(u, edge);
    if (chipEdge !== undefined) return isLatinSpacingHan(chipEdge);
    return u.kind === 'text' && !u.run && !u.note && u.firstCjk && u[edge] === 'ideograph' && !u.style.script && isLatinSpacingHan(u.text);
  };
  // A run whose edge is a number set in one upright cell (vertical text)
  // takes no Han–Latin space on that side; neither does a unit the author
  // set upright or in one cell. A chip's edge is Latin when its character
  // is a letter or a digit that is not CJK (a full-width Ａ is not).
  const latin = (u: Unit | undefined, edge: 'first' | 'last'): boolean => {
    if (!u) return false;
    const chipEdge = chipEdgeGrapheme(u, edge);
    if (chipEdge !== undefined) {
      return !isCjkGrapheme(chipEdge) && !isLatinSpacingHan(chipEdge) && latinEdge(chipText(u), chipEdge, edge);
    }
    return u.kind === 'text' && !!u.run && !u.note && !u.style.script && !(edge === 'first' ? u.cellStart : u.cellEnd)
      && latinEdge(u.text, edge === 'first' ? String.fromCodePoint(u.text.codePointAt(0)!) : lastGrapheme(u.text), edge);
  };
  const spaceOf = (h: Unit): number => latinSpacingPx(c, emOfFont(h.style.font));
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    const prev = out[out.length - 1];
    if (u.kind === 'space' && /^ +$/.test(u.text)) {
      // A space typed between Han and Latin is replaced by the Han–Latin
      // space (CSS `text-autospace: replace`).
      const next = units[k + 1];
      const h = han(prev, 'last') && latin(next, 'first') && !next!.glueBefore ? prev
        : latin(prev, 'last') && han(next, 'first') && !next!.glueBefore ? next : undefined;
      if (h) {
        out.push({ ...u, width: spaceOf(h), auto: true });
        continue;
      }
    } else if (prev && !u.glueBefore && ((han(prev, 'last') && latin(u, 'first')) || (latin(prev, 'last') && han(u, 'first')))) {
      const h = han(prev, 'last') ? prev : u;
      out.push({
        kind: 'space',
        text: '',
        width: spaceOf(h),
        graphemes: 0,
        first: 'western',
        last: 'western',
        firstCjk: false,
        lastCjk: false,
        style: h.style,
        at: u.at,
        auto: true,
      });
    }
    out.push(u);
  }
  return out;
}

/**
 * `units` with the one-em space JLReq §3.1.6 sets after a ？ or ！ that
 * ends a sentence inside the paragraph (`cjk.spaceAfterQuestion`,
 * `Unit.aki`): after the mark and what keeps to it (a note marker), unless
 * the paragraph ends there or a closing bracket or another ？！ follows. A
 * space the author typed there (U+3000, or a run of word spaces) becomes
 * the aki, keeping its text. A line may break after it, and it goes at the
 * line end, as any space does.
 */
export function questionSpaces(units: Unit[]): Unit[] {
  const out: Unit[] = [];
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    out.push(u);
    if (!charUnitIn(u, QUESTION_MARKS)) continue;
    // A note marker or a superscript keeps to the mark: the space follows it.
    while (k + 1 < units.length && units[k + 1]!.glueBefore) out.push(units[++k]!);
    const next = units[k + 1];
    if (!next || charUnitIn(next, QUESTION_MARKS)) continue;
    if (next.kind === 'text' && next.first === 'closing') continue;
    const aki: Unit = {
      kind: 'space',
      text: '',
      width: emOfFont(u.style.font),
      graphemes: 0,
      first: 'western',
      last: 'western',
      firstCjk: false,
      lastCjk: false,
      style: u.style,
      at: u.at + u.text.length,
      aki: true,
    };
    if (next.kind === 'space' && !next.auto) {
      // A typed space is replaced: the aki keeps its text.
      if (units[k + 2] === undefined) continue;
      out.push({ ...aki, text: next.text, at: next.at });
      k++;
    } else if (next.kind === 'text' && next.first === 'ideoSpace' && next.graphemes === 1) {
      if (units[k + 2] === undefined) continue;
      out.push({ ...aki, text: next.text, at: next.at });
      k++;
    } else {
      out.push(aki);
    }
  }
  return out;
}

const isDigitCode = (c: number): boolean => (c >= 0x30 && c <= 0x39) || isFullwidthDigit(c);

/** Whether a number keeps to the sign or unit next to it (`50 %`, `50％`,
 *  `￥５９９`, `−3 ℃`): a unit ending in a digit before a unit sign, or a
 *  currency or plus-minus sign before a digit. At every level. */
function numberGlue(a: Unit, b: Unit): boolean {
  if (a.kind !== 'text' || b.kind !== 'text') return false;
  if (b.first === 'postfix' && isDigitCode(a.text.charCodeAt(a.text.length - 1))) return true;
  return a.last === 'prefix' && isDigitCode(b.text.charCodeAt(0));
}

/** A fullwidth character unit (one grapheme, not a Western run) whose code
 *  point passes `test`. */
function fullwidthUnit(u: Unit | undefined, test: (cp: number) => boolean): boolean {
  return u !== undefined && u.kind === 'text' && !u.run && u.graphemes === 1 && test(u.text.charCodeAt(0));
}

/** Marks that join fullwidth digits into one number: a decimal point, a
 *  thousands separator, the colon of a time, the solidus of a fraction
 *  (３．１４, １２：３０, １／２). */
const isFullwidthNumberJoin = (cp: number): boolean => cp === 0xFF0E || cp === 0xFF0C || cp === 0xFF1A || cp === 0xFF0F;

/** Whether units `k - 1` and `k` belong to one fullwidth number or word
 *  (１２３, ＡＢＣ, ３．１４): each character is a unit of its own, spread
 *  like Han when the line is justified, but the line never breaks inside. */
function fullwidthGlue(units: readonly Unit[], k: number): boolean {
  const a = units[k - 1];
  const b = units[k];
  if (fullwidthUnit(a, isFullwidthAlnum) && fullwidthUnit(b, isFullwidthAlnum)) return true;
  if (fullwidthUnit(a, isFullwidthDigit) && fullwidthUnit(b, isFullwidthNumberJoin) && fullwidthUnit(units[k + 1], isFullwidthDigit)) return true;
  return fullwidthUnit(a, isFullwidthNumberJoin) && fullwidthUnit(b, isFullwidthDigit) && fullwidthUnit(units[k - 2], isFullwidthDigit);
}

/** The grapheme a unit opens (`first`) or ends (`last`) with, which a
 *  Japanese level reads the unit's class from (small kana, ー, hyphens…:
 *  `breakClassOf`); undefined under a Chinese level, and for an inline box
 *  (a chip, a formula, a marker), whose class stands as it is. */
function edgeGrapheme(u: Unit, edge: 'first' | 'last', level: CjkLineBreakLevel): string | undefined {
  if (u.kind !== 'text' || u.text === '' || !isJapaneseLineBreak(level)) return undefined;
  return edge === 'first' ? String.fromCodePoint(u.text.codePointAt(0)!) : lastGrapheme(u.text);
}

/** Whether unit `b` may not open a line at `level` (see
 *  {@link edgeGrapheme}). */
export function startProhibited(b: Unit, level: CjkLineBreakLevel): boolean {
  return isLineStartProhibited(b.first, level, edgeGrapheme(b, 'first', level));
}

/** Whether unit `a` may not close a line at `level`: its class, or a
 *  circled number that labels the text after it ({@link labelEnd}). */
export function endProhibited(a: Unit, level: CjkLineBreakLevel): boolean {
  return isLineEndProhibited(a.last, level, edgeGrapheme(a, 'last', level)) || labelEnd(a, level);
}

/** Whether unit `a` ends with a circled number set as a Chinese character
 *  (①, #637), which no line ends on at `level` (`isLabelEndProhibited`). */
function labelEnd(a: Unit, level: CjkLineBreakLevel): boolean {
  return a.kind === 'text' && a.lastCjk && a.text !== '' && isLabelEndProhibited(lastGrapheme(a.text), level);
}

/** Whether a line may break before each unit (index 0 is never a break).
 *  A word space is a break unless the unit after it may not open a line,
 *  the last one before it may not close one, or they are a number and its
 *  sign; a zero-width space is a break at every level. A kanji number
 *  never breaks at the 、 or ・ set solid inside it (`Unit.solid`). */
export function breakOpportunities(units: readonly Unit[], level: CjkLineBreakLevel): Uint8Array {
  const out = new Uint8Array(units.length);
  // The last unit before `k` that is not a space.
  let ink = -1;
  for (let k = 1; k < units.length; k++) {
    const a = units[k - 1]!;
    const b = units[k]!;
    if (a.kind !== 'space') ink = k - 1;
    if (b.kind === 'space') continue;
    // A line never opens with a warichu note's word space.
    if (b.noteSpace) continue;
    if (b.zwspBefore) {
      out[k] = 1;
      continue;
    }
    if (a.kind === 'space') {
      const p = ink >= 0 ? units[ink]! : undefined;
      if (!p || (!numberGlue(p, b) && !startProhibited(b, level) && !endProhibited(p, level))) out[k] = 1;
      continue;
    }
    if (a.noteSpace) {
      // A word space inside a warichu note: the note's words part there.
      let q = k - 1;
      while (q > 0 && units[q]!.noteSpace) q--;
      const p = units[q]!;
      if (!p.noteSpace && !numberGlue(p, b) && !startProhibited(b, level) && !endProhibited(p, level)) out[k] = 1;
      continue;
    }
    if (b.glueBefore || a.solid || b.solid) continue;
    if (numberGlue(a, b) || fullwidthGlue(units, k)) continue;
    if (cjkBreakAllowed(a.last, a.lastCjk, b.first, b.firstCjk, level, edgeGrapheme(a, 'last', level), edgeGrapheme(b, 'first', level)) && !labelEnd(a, level)) out[k] = 1;
  }
  return out;
}

/** Opening and closing brackets of a book title: 《》 and 〈〉 and their
 *  vertical presentation forms. */
const TITLE_OPEN = '《〈︽︿';
const TITLE_CLOSE = '》〉︾﹀';

/** The kind of title bracket unit `u` is, when it is one: the index of a
 *  typed 《〈 (or 》〉) in {@link TITLE_OPEN} ({@link TITLE_CLOSE}), or -1 for
 *  a bracket `cjk.bookTitleMark` added round a `:book[…]` title (『』 in
 *  Japan); undefined for any other unit. */
function titleBracket(u: Unit, side: 'open' | 'close'): number | undefined {
  if (u.kind !== 'text' || u.graphemes !== 1 || u.note) return undefined;
  const typed = (side === 'open' ? TITLE_OPEN : TITLE_CLOSE).indexOf(u.text);
  if (typed >= 0) return typed;
  return u.style.inserted && u.first === (side === 'open' ? 'opening' : 'closing') ? -1 : undefined;
}

/**
 * The extents of the book titles among `units`, as `[from, to)` of the
 * title's own units (its brackets left out): every `《…》` or `〈…〉`
 * (nested ones too, each matched with its own closing bracket; one never
 * closed is no title) and every `:book[…]` title, in the brackets
 * `cjk.bookTitleMark` adds or, set with the wavy line or bare, as the run
 * of units that carries its mark (`VDTSegmentMarks.bookTitle`).
 */
function titleExtents(units: readonly Unit[]): [number, number][] {
  const out: [number, number][] = [];
  const open: { at: number; kind: number }[] = [];
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    const o = titleBracket(u, 'open');
    if (o !== undefined) {
      open.push({ at: k, kind: o });
      continue;
    }
    const c = titleBracket(u, 'close');
    if (c === undefined) continue;
    // The innermost title this bracket closes; brackets opened inside it
    // and never closed are dropped.
    let q = open.length - 1;
    while (q >= 0 && open[q]!.kind !== c) q--;
    if (q < 0) continue;
    out.push([open[q]!.at + 1, k]);
    open.length = q;
  }
  let k = 0;
  while (k < units.length) {
    const id = units[k]!.style.marks?.bookTitle;
    if (id === undefined) {
      k++;
      continue;
    }
    let end = k + 1;
    while (end < units.length && units[end]!.style.marks?.bookTitle === id) end++;
    out.push([k, end]);
    k = end;
  }
  return out;
}

/**
 * The breaks of `breaks` that leave fewer than `min` characters of a book
 * title on either side of them taken out (`cjk.titleMinChars`, #637): a
 * line never ends on `《說` with `文》` opening the next. A character is a
 * unit (a Western word inside the title counts as one); spaces do not
 * count. `breaks` itself when no title holds such a break.
 */
export function titleBreaks(units: readonly Unit[], breaks: Uint8Array, min: number): Uint8Array {
  if (min <= 1) return breaks;
  let out: Uint8Array | undefined;
  for (const [from, to] of titleExtents(units)) {
    // Characters of the title before each of its units.
    let before = 0;
    let total = 0;
    for (let k = from; k < to; k++) if (units[k]!.kind !== 'space') total++;
    for (let k = from; k < to; k++) {
      if (k > from && breaks[k] && (before < min || total - before < min)) {
        out ??= breaks.slice();
        out[k] = 0;
      }
      if (units[k]!.kind !== 'space') before++;
    }
  }
  return out ?? breaks;
}

/**
 * The breaks of `breaks` that leave fewer than `min` characters of a
 * warichu note on either side of them taken out (`cjk.warichu.minChars`,
 * #720): a line never ends on the first character of a note, and none
 * opens on its last one with the stop that closes it. A character is a
 * unit of the note that is a letter ({@link isLetterEdge}: a CJK
 * character, a Western word, an inline box); marks and the note's word
 * spaces do not count, so `異。` is one character. The note's brackets are
 * not part of it. `breaks` itself when no note holds such a break.
 */
export function noteBreaks(units: readonly Unit[], breaks: Uint8Array, min: number): Uint8Array {
  if (min <= 1) return breaks;
  const counts = (u: Unit): boolean => !u.noteSpace && (isLetterEdge(u, 'first') || isLetterEdge(u, 'last'));
  let out: Uint8Array | undefined;
  for (let from = 0; from < units.length;) {
    const note = units[from]!.note;
    if (!note) {
      from++;
      continue;
    }
    let to = from + 1;
    while (to < units.length && units[to]!.note === note) to++;
    let total = 0;
    for (let k = from; k < to; k++) if (counts(units[k]!)) total++;
    let before = 0;
    for (let k = from; k < to; k++) {
      if (k > from && breaks[k] && (before < min || total - before < min)) {
        out ??= breaks.slice();
        out[k] = 0;
      }
      if (counts(units[k]!)) before++;
    }
    from = to;
  }
  return out ?? breaks;
}

/** Whether a unit opens (`first`) or ends (`last`) with a letter, which
 *  `keep-all` never parts from a letter next to it: a CJK character (kanji,
 *  kana, hangul, an iteration mark, ー), a Western run or a sign glued to
 *  a number, an inline box. Punctuation, dashes, ellipses, connectors and
 *  the ideographic space are not letters: lines still break next to them
 *  where the level allows (after 、。」, before 「). */
function isLetterEdge(u: Unit, edge: 'first' | 'last'): boolean {
  if (u.kind === 'space') return false;
  const cls = edge === 'first' ? u.first : u.last;
  return cls === 'ideograph' || cls === 'iteration' || cls === 'western' || cls === 'prefix' || cls === 'postfix';
}

/** The breaks of `cjk.wordBreak: 'keep-all'` (CSS `word-break: keep-all`)
 *  out of the paragraph's `breaks`: those after a space the author typed,
 *  a warichu note's word space or before a zero-width space stay, and so
 *  do those next to punctuation; none is left between two letters
 *  ({@link isLetterEdge}), so a phrase of kana written between spaces
 *  (分かち書き) is never divided while it fits a line. The Han–Latin space
 *  the composition inserts (`Unit.auto`, no text) is no space between
 *  phrases: `Tシャツ` stays whole. */
export function keepAllBreaks(units: readonly Unit[], breaks: Uint8Array): Uint8Array {
  const out = breaks.slice();
  for (let k = 1; k < units.length; k++) {
    if (!out[k]) continue;
    let a = units[k - 1]!;
    const b = units[k]!;
    if (a.noteSpace || b.zwspBefore) continue;
    if (a.kind === 'space') {
      if (!(a.auto && a.text === '') || k < 2) continue;
      a = units[k - 2]!;
    }
    if (isLetterEdge(a, 'last') && isLetterEdge(b, 'first')) out[k] = 0;
  }
  return out;
}

/** Whether justification may add space between two units that touch on a
 *  line: between characters, never inside a Western run or a 2-em mark
 *  (those are single units), never between two Western runs, next to a
 *  connector or a solidus, after an atomic box, or before a mark that
 *  keeps to the text before it. Spaces take their own share. With `jlreq`
 *  (Japanese full-width text) also JLReq §3.1.11's inseparable places:
 *  never after an opening bracket or before a closing one (but before the
 *  one and after the other), never next to 、，。．・：；？！ or U+3000. */
function gapStretches(a: Unit, b: Unit, jlreq = false): boolean {
  if (a.kind !== 'text' || b.kind === 'space') return false;
  // Never inside a jukugo word (JLReq §3.3.7).
  if (a.ruby?.jis && a.ruby.jis === b.ruby?.jis) return false;
  if (b.glueBefore || a.stacked) return false;
  if (a.last === 'connector' || a.last === 'solidus' || b.first === 'connector' || b.first === 'solidus') return false;
  if (!a.lastCjk && !b.firstCjk) return false;
  if (a.last === b.first && (a.last === 'dash' || a.last === 'ellipsis')) return false;
  if (jlreq && (a.last === 'opening' || b.first === 'closing' || jlreqFixed(a.last) || jlreqFixed(b.first))) return false;
  return true;
}

/** The classes JLReq never spreads next to (§3.1.11): pause and stop
 *  marks, middle dots and the ideographic space. */
function jlreqFixed(cls: CjkClass): boolean {
  return cls === 'pause' || cls === 'stop' || cls === 'interpunct' || cls === 'ideoSpace';
}

/** Whether the gap after unit `j` of a line takes tracking. A footnote
 *  marker in the line gap (`footnotes.markerPosition: 'side'`) takes no
 *  room in the line: the gap between the characters around it is theirs,
 *  and is set after the marker, which stays against the character it
 *  marks. */
export function gapAfterStretches(us: readonly Unit[], j: number, jlreq = false): boolean {
  const next = us[j + 1]!;
  if (isSideMarker(next)) return false;
  const u = us[j]!;
  if (isSideMarker(u)) return j > 0 && gapStretches(us[j - 1]!, next, jlreq);
  return gapStretches(u, next, jlreq);
}

function isSideMarker(u: Unit): boolean {
  return u.token?.sideRuns !== undefined;
}
