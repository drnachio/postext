// Where a word may break and how it is cut: the rest of a word measured
// as a line's opening text, URL and syllable breaks, the emergency split,
// and a token split at a break with its hyphen (#1276: split out of rich.ts).
import type { InlineSpan } from '../../parse/index.js';
import { withoutSlashJoints, hyphenateByDictionary, hyphenateText, softHyphenBreaks, getHyphenationRulesKey } from '../../hyphenation/hyphenate.js';
import { SOFT_HYPHEN } from '../types.js';
import { measureTextWidth, getMeasureLanguage } from '../canvas.js';
import { hasCJK } from '../cjk/cjk.js';
import type { CjkWordBreaks } from '../cjk/cjkCompose.js';
import { graphemeCount } from '../graphemes.js';
import { measuringVertically } from '../vertical.js';
import { NO_BREAK_SPACES, isBreakingSpace } from '../spaces.js';
import { withoutZeroWidthSpaces, ZERO_WIDTH_SPACE, isDash, breaksAfterDash, breaksAfterHardHyphen, slashBreakIndices, getSlashBreaks, hasCompound } from '../breakRules.js';
import { endsInsideGeminate, GEMINATE_DOT, withLineEndHyphen } from '../geminate.js';
import { joiningScriptIn, insideJoiningWord } from '../rtl/joining.js';
import { scriptContextUntracked } from '../script.js';
import { type RichToken, tokenTextWidth, scriptOf, pieceScriptFields, type RichBreakPoint, textWidth } from './tokens.js';

/** How many characters of the rest of a word are measured with what
 *  follows the break (see {@link ownRest}): past any kerned pair,
 *  ligature or contextual form a face draws across one cut. */
const REST_WINDOW = 32;

/**
 * The rest of a word from the break at `from`, measured as the text a
 * line opens with (#770): the function gives the width of the word's
 * characters `[from, to)` set as a text of their own, `lead` (the hyphen
 * a compound repeats at the line's start) before them, with the tracking
 * the word was measured with.
 *
 * Up to postext 1.29 that rest was the whole word less what stayed on the
 * line above, and its pieces what the whole word grew by. The browser
 * measured those strings whole, so whatever the face draws across the
 * break stayed in the rest's box, and nothing paints it there. Crimson
 * Pro sets the dot of a Catalan `l·l` 0.586 em wide: `instal·lar` broken
 * as `instal-` | `lar` left `lar` a box of 28.54 px at 20 px for a text
 * painted 21.62 px wide. EB Garamond's `of-` | `fice` left 24.7 px for
 * 25.9 (the `ffi` ligature undone by the break), and Fira Sans's `lar`
 * 20.74 px for 24.36 (its `l·` ligature). Measured in Chrome 154.
 *
 * The pieces after the break are measured as that text grows, so a rest
 * that breaks again is right too, and the pieces a line carries add up to
 * the text painted. Only the first {@link REST_WINDOW} characters are
 * measured from the break; a piece that ends past them is what the word
 * grew by from there on, which no break before it changes. A word many
 * lines long then costs what a line of it does.
 *
 * `token` is the word as it stands (itself the rest of an earlier break,
 * or the whole word); a document that keeps the host's language never
 * asks.
 */
export function ownRest(token: RichToken, from: number, font: string, lead = ''): (to: number) => number {
  const text = token.text;
  const spacing = token.ownPieces ?? 0;
  const tracked = (width: number, piece: string): number => (spacing === 0 ? width : width + spacing * graphemeCount(piece));
  const whole = tokenTextWidth(token, font);
  const before = (idx: number): number => (idx >= text.length ? token.width : tracked(whole(text.slice(0, idx)), text.slice(0, idx)));
  const rest = tokenTextWidth({ ...scriptOf(token), ...pieceScriptFields(token, from, text.length) }, font);
  const own = (piece: string): number => tracked(rest(piece), piece);
  let end = Math.min(text.length, from + REST_WINDOW);
  // Not between the two halves of a character outside the BMP.
  if (end < text.length && (text.charCodeAt(end) & 0xFC00) === 0xDC00) end++;
  let window: number | undefined;
  let anchor: number | undefined;
  return (to) => {
    if (to <= end) return own(lead + text.slice(from, to));
    window ??= own(lead + text.slice(from, end));
    anchor ??= before(end);
    return window + before(to) - anchor;
  };
}

/** The break points of `token` after `at`, for its rest measured as a
 *  text of its own (`width`, see {@link ownRest}): each as far into that
 *  text as it is, the dot of an `l·l` measured there too. */
function ownRestBreaks(token: RichToken, at: number, width: (to: number) => number, shift = 0): RichBreakPoint[] {
  return (token.breakPoints ?? [])
    .filter((b) => b.charIndex > at)
    .map((b) => {
      const { restShift: _shift, ...rest } = b;
      void _shift;
      const widthBefore = width(b.charIndex);
      return {
        ...rest,
        charIndex: b.charIndex - at + shift,
        widthBefore,
        ...(b.replacesWidth !== undefined ? { replacesWidth: widthBefore - width(b.charIndex - 1) } : {}),
      };
    });
}

/**
 * Knuth–Plass in a document shaped in its own language (#770): give each
 * break point of the words measured so ({@link RichToken.ownPieces}) what
 * the rest of its word is wider, opening the next line as a text of its
 * own, than the pieces after the break add up to
 * (`RichBreakPoint.restShift`). `lead`: the hyphen a compound repeats at
 * that line's start (`repeatHyphen`) is part of the text measured, and its
 * own width, which the breaker counts apart, is taken off.
 * One measure a break point, two for a rest longer than
 * {@link REST_WINDOW} characters.
 */
export function markRestShifts(tokens: readonly RichToken[], fontOf: (token: RichToken) => string, repeatHyphen: boolean): void {
  for (const token of tokens) {
    if (token.ownPieces === undefined || !token.breakPoints) continue;
    const font = fontOf(token);
    for (const bp of token.breakPoints) {
      if (bp.greedyOnly) continue;
      const repeated = repeatHyphen && bp.bare === true && !token.bareBreaks;
      const own = ownRest(token, bp.charIndex, font, repeated ? '-' : '')(token.text.length);
      bp.restShift = own - (repeated ? token.hyphenWidth ?? 0 : 0) - (token.width - bp.widthBefore);
    }
  }
}

/**
 * Tokenize inline spans into word/space tokens with bold/italic flags and measured widths.
 */
/** A word that is a URL or a bare DOI: never hyphenated by the dictionary,
 *  but breakable at its own joints so a long link cannot force an
 *  unfillable line. */
export const URL_LIKE_RE = /^(?:(?:https?|ftp):\/\/|www\.|10\.\d{4,}\/)\S+$/i;

/** Break opportunities inside a URL, following the usual editorial rule:
 *  after a slash (never inside the `//` of the scheme) or before a dot,
 *  hyphen or query/fragment punctuation, so the punctuation opens the next
 *  line and no hyphen is added. Never within the first few characters. */
export function urlBreakIndices(text: string): number[] {
  const out: number[] = [];
  for (let i = 4; i < text.length - 1; i++) {
    const prev = text[i - 1]!;
    const ch = text[i]!;
    if (prev === '/' && ch !== '/' && text[i - 2] !== '/') out.push(i);
    else if ('.?#&=_~%-'.includes(ch) && prev !== '/' && !'.?#&=_~%-'.includes(prev)) out.push(i);
  }
  return out;
}

interface SoftBreak {
  /** Offset into the word as laid out. */
  index: number;
  /** Typed in the source rather than found by the dictionary. */
  author: boolean;
}

/**
 * A word as laid out (its soft hyphens removed) and the breaks its soft
 * hyphens mark: the dictionary's when `hyphenate` is on, and the author's
 * own — the U+00AD the source carries between two letters or digits
 * (`softHyphenBreaks`), which the dictionary leaves as they are (it does not
 * hyphenate a word that already has them). The zero-width
 * space the dictionary puts after a slash is dropped: the rich breaker does
 * not break there, and it must not reach the line text. `byDictionary`
 * leaves the document's rules out (#699): every point of the patterns.
 */
export function syllabify(word: string, hyphenate: boolean, byDictionary = false): { clean: string; soft: SoftBreak[] } {
  // A word of a joining script is never divided, not even at a soft hyphen
  // its author typed: its letters connect (`measure/rtl/joining.ts`).
  if (joiningScriptIn(word)) return { clean: word.includes(SOFT_HYPHEN) ? word.split(SOFT_HYPHEN).join('') : word, soft: [] };
  const hyphenated = hyphenate ? withoutSlashJoints(word, byDictionary ? hyphenateByDictionary(word) : hyphenateText(word)) : word;
  if (!hyphenated.includes(SOFT_HYPHEN)) return { clean: hyphenated, soft: [] };
  let clean = '';
  const soft: SoftBreak[] = [];
  let j = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    // A soft hyphen the dictionary inserted is not the source's character.
    const fromSource = j < word.length && ch === word[j];
    if (fromSource) j++;
    if (ch !== SOFT_HYPHEN) clean += ch;
    // One the author typed at the word's edge or next to punctuation is no
    // break (#700).
    else if (!fromSource || softHyphenBreaks(word, j - 1)) soft.push({ index: clean.length, author: fromSource });
  }
  return { clean, soft };
}

/** {@link withoutZeroWidthSpaces} of a syllabified word: its soft breaks
 *  moved to the text left. */
export function dropZeroWidthSpaces(clean: string, soft: SoftBreak[]): { clean: string; soft: SoftBreak[]; zeroWidth: number[] } {
  const dropped = withoutZeroWidthSpaces(clean);
  if (dropped.text === clean) return { clean, soft, zeroWidth: [] };
  // How many zero-width spaces stand before each offset of `clean`.
  const before: number[] = [];
  let n = 0;
  for (let i = 0; i <= clean.length; i++) {
    before.push(n);
    if (clean[i] === ZERO_WIDTH_SPACE) n++;
  }
  return {
    clean: dropped.text,
    soft: soft.map((s) => ({ ...s, index: s.index - before[s.index]! })),
    zeroWidth: dropped.breaks,
  };
}

/** Break opportunities inside a word (`clean`, the text as laid out):
 *  - after each soft hyphen, the dictionary's or the author's (`soft`); a
 *    hyphen is added when the line ends there;
 *  - after a hard hyphen between two letters — "enseñanza-aprendizaje" —
 *    where the line ends on the hyphen the word already carries;
 *  - after an em or en dash: with `dashBreaks`, one set closed between words
 *    as `breaksAfterDash` reads it ("say—that’s", "riddles.—I"), for both
 *    breakers — `touching` is the end (the last two characters) of the word
 *    run this word touches, with no space in between, which a dash at the
 *    start of the word needs; without it, one between two letters
 *    ("largas—separadas"), for the greedy breaker only, as pretext breaks a
 *    plain paragraph there;
 *  - next to CJK characters, under the line-break rules of the document's
 *    `cjk.lineBreak` (`cjk`: the word's units, measured once each, whose
 *    running sums give the widths before its breaks);
 *  - in a word with no CJK character, after a slash between two words
 *    ("and/or", "ACC/AHA", see `slashBreakIndices`) and where the author
 *    typed a zero-width space (`zeroWidthBreaks`, offsets into `clean`,
 *    which no longer holds the character), #1164: the line ends as it is
 *    and nothing is added. */
export function wordBreakPoints(
  clean: string,
  soft: SoftBreak[],
  font: string,
  letterSpacingPx: number,
  smallCaps?: boolean,
  dashBreaks = false,
  touching?: string,
  cjk?: CjkWordBreaks,
  /** How the word's pieces are measured when not as any text: in the
   *  script of a word with no letter (#725). */
  measure?: (text: string) => number,
  /** A document shaped in its own language (#770): the head of a break
   *  inside an `l·l` is as wide as the text painted, `col` and its hyphen.
   *  Taking the dot's own width off `col·` is short of it where the face
   *  draws the two together: Lora ligates `l·`, and left `col-` 1.32 px
   *  narrower than painted at 20 px (36.14 px for 37.46); Fira Sans,
   *  0.2 px. */
  ownHeads = false,
  zeroWidthBreaks: readonly number[] = [],
): RichBreakPoint[] {
  const widthBefore = cjk
    ? cjk.widthBefore
    : (idx: number): number => (measure ? measure(clean.slice(0, idx)) : textWidth(clean.slice(0, idx), font, smallCaps)) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(clean.slice(0, idx)));
  const byIndex = new Map<number, RichBreakPoint>();
  const add = (bp: Omit<RichBreakPoint, 'widthBefore'>): void => {
    if (bp.charIndex <= 0 || bp.charIndex >= clean.length) return;
    // One break per position; the word's own hyphen wins over a soft one.
    const existing = byIndex.get(bp.charIndex);
    if (existing && !(bp.bare && !existing.bare)) return;
    byIndex.set(bp.charIndex, { ...bp, widthBefore: widthBefore(bp.charIndex) });
  };
  // The character at `k`, reading back into the run this word touches.
  const charAt = (k: number): string | undefined => (k >= 0 ? clean[k] : touching?.[touching.length + k]);
  for (let i = dashBreaks ? 0 : 1; i < clean.length - 1; i++) {
    const ch = clean[i]!;
    if (ch !== '-' && !isDash(ch)) continue;
    if (dashBreaks && ch !== '-') {
      if (breaksAfterDash(charAt(i - 1), ch, clean[i + 1], charAt(i - 2))) add({ charIndex: i + 1, free: true });
      continue;
    }
    if (i === 0 || !breaksAfterHardHyphen(clean[i - 1], clean[i + 1])) continue;
    add(ch === '-' ? { charIndex: i + 1, bare: true } : { charIndex: i + 1, free: true, greedyOnly: true });
  }
  for (const s of soft) {
    const geminate = endsInsideGeminate(clean.slice(0, s.index))
      ? { replacesWidth: ownHeads ? widthBefore(s.index) - widthBefore(s.index - 1) : textWidth(GEMINATE_DOT, font, smallCaps) + letterSpacingPx }
      : {};
    add(s.author ? { charIndex: s.index, author: true, ...geminate } : { charIndex: s.index, ...geminate });
  }
  if (cjk) for (const idx of cjk.breaks) add({ charIndex: idx, free: true, cjk: true });
  else {
    for (const idx of slashBreakIndices(clean)) add({ charIndex: idx, free: true });
    for (const idx of zeroWidthBreaks) add({ charIndex: idx, free: true });
  }
  return [...byIndex.values()].sort((a, b) => a.charIndex - b.charIndex);
}

/**
 * A word wider than the whole line (a table cell, a narrow column): divide
 * it at the last no-break space that leaves a head that fits ("300 000 |
 * 000", nothing added), else at the last syllable that fits — the
 * dictionary's, a hyphen added — or, when none does, at the last character
 * that fits, so no word ever runs past its measure. A cut next to a hyphen
 * the word carries falls after it and adds none (`hard`): never "fisica-" |
 * "-universitaria" nor "fisica--". Null when not even one character fits,
 * or, with `syllablesOnly`, when no no-break space or syllable does.
 *
 * A word of a joining script (Arabic…) is never cut between its letters,
 * and no hyphen marks a cut in it: only at a no-break space, or where it
 * touches a run of another script (`ABCكتاب`), with nothing added. Null
 * when no such place fits: the word then runs past the measure, and the
 * line says so (`VDTLine.wordOverflow`).
 *
 * Before a syllable, it is divided after a slash or at a zero-width space
 * the author typed, nothing added (#1164).
 *
 * `divided` says how a word was cut (#1150): at a syllable (`'syllable'`)
 * or between two characters (`'character'`); absent for a cut at a
 * no-break space, after a slash, at a zero-width space, at the edge of a run of another script, or next to an
 * ideograph, which divide no word.
 */
export function emergencySplit(
  token: RichToken,
  font: string,
  letterSpacingPx: number,
  lineMaxWidth: number,
  syllablesOnly = false,
): { head: RichToken; tail: RichToken; hard?: boolean; divided?: 'syllable' | 'character' } | null {
  const text = token.text;
  if (text.length < 2) return null;
  // Styled runs of one Arabic word (`RichToken.runs`) are one shaped word.
  if (token.runs) return null;
  const joining = joiningScriptIn(text);
  // The word was measured untracked (`wordLetterSpacing`): its pieces too.
  // So was a word with no letter shaped in the Arabic script (#725).
  const spacing = joining || scriptContextUntracked(token.scriptContext) ? 0 : letterSpacingPx;
  const hyphenW = measureTextWidth('-', font) + spacing;
  const measure = tokenTextWidth(token, font);
  const widthBefore = (idx: number): number => measure(text.slice(0, idx)) + (spacing === 0 ? 0 : spacing * graphemeCount(text.slice(0, idx)));
  const flags = { bold: token.bold, italic: token.italic, captionLabel: token.captionLabel, ...scriptOf(token) };
  // In a document shaped in its own language the rest is measured as the
  // text that opens the next line (#770, `ownRest`), with the tracking
  // this division measures the word with.
  const own = getMeasureLanguage() !== undefined && !measuringVertically() && !hasCJK(text) ? { ...token, ownPieces: spacing } : undefined;
  const restFrom = (at: number): RichToken => (own ? tailAfter(own, at, 0, font) : tailAfter(token, at, widthBefore(at)));
  // A group glued by no-break spaces too wide for any line: the space is
  // the least bad place to part it (EF-66). The line ends before it and the
  // next one opens after it.
  for (let idx = text.length - 2; idx >= 1; idx--) {
    if (!NO_BREAK_SPACES.includes(text[idx]!) || NO_BREAK_SPACES.includes(text[idx - 1]!)) continue;
    const headWidth = widthBefore(idx);
    if (headWidth > lineMaxWidth) continue;
    return {
      head: { ...flags, ...pieceScriptFields(token, 0, idx), text: text.slice(0, idx), kind: 'text', width: headWidth },
      tail: { ...restFrom(idx + 1), ...flags, ...pieceScriptFields(token, idx + 1, text.length) },
    };
  }
  // After a slash ("ACC/" | "AHA/AAPA"), any slash but the `//` of an
  // address (with `bodyText.breakAfterSlashes`), or at a free break of the
  // token's (a zero-width space the author typed, a dash): no word is
  // divided and nothing is added (#1164). The
  // last one that leaves a head that fits wins over a syllable and over a
  // cut between letters.
  const joints = new Set<number>();
  if (getSlashBreaks()) for (let idx = 2; idx < text.length; idx++) {
    if (text[idx - 1] === '/' && text[idx] !== '/' && text[idx - 2] !== '/') joints.add(idx);
  }
  for (const bp of token.breakPoints ?? []) if (bp.free && !bp.cjk && !token.bareBreaks) joints.add(bp.charIndex);
  if (joints.size > 0 && !hasCJK(text)) {
    const sorted = [...joints].filter((idx) => idx > 0 && idx < text.length).sort((a, b) => b - a);
    for (const idx of sorted) {
      const headWidth = widthBefore(idx);
      if (headWidth > lineMaxWidth) continue;
      return {
        head: { ...flags, ...pieceScriptFields(token, 0, idx), text: text.slice(0, idx), kind: 'text', width: headWidth },
        tail: { ...restFrom(idx), ...flags, ...pieceScriptFields(token, idx, text.length) },
      };
    }
  }
  // No hyphen where the cut falls next to an ideograph, or right after a
  // hyphen of the text.
  const afterHyphen = (idx: number): boolean => text[idx - 1] === '-';
  const markW = (idx: number): number => (joining || afterHyphen(idx) || hasCJK(text.slice(idx - 1, idx + 1)) ? 0 : hyphenW);
  const fits = (idx: number): boolean => widthBefore(idx) + markW(idx) <= lineMaxWidth;
  // The longest prefix that fits without its mark, found by doubling then
  // halving (prefix widths grow with their length): no cut past it fits,
  // so a word many lines long costs what one line of it does, not a
  // measurement of every prefix.
  let reach = 0;
  let over = text.length;
  for (let step = 1; reach + step < text.length; step *= 2) {
    if (widthBefore(reach + step) > lineMaxWidth) {
      over = reach + step;
      break;
    }
    reach += step;
  }
  while (over - reach > 1) {
    const mid = (reach + over) >> 1;
    if (widthBefore(mid) <= lineMaxWidth) reach = mid;
    else over = mid;
  }
  let at = 0;
  let divided: 'syllable' | 'character' | undefined;
  // The dictionary's syllables, as offsets into the text: `syllabify` maps
  // them past anything else the dictionary might put in.
  const { clean, soft } = syllabify(text, true);
  if (clean === text) {
    for (const s of soft) {
      if (s.index > 0 && s.index <= reach && fits(s.index)) at = s.index;
    }
  }
  if (at > 0) divided = 'syllable';
  // A word the document keeps whole (`hyphenation.exceptions`, capitalised
  // words, cited names) is still divided when it is wider than its measure:
  // at its entry's points above, else at the dictionary's syllables (#699).
  if (at === 0 && getHyphenationRulesKey() !== '') {
    const whole = syllabify(text, true, true);
    if (whole.clean === text) {
      for (const s of whole.soft) {
        if (s.index > 0 && s.index <= reach && fits(s.index)) at = s.index;
      }
    }
    if (at > 0) divided = 'syllable';
  }
  if (at === 0 && !syllablesOnly) {
    for (let idx = reach; idx >= 1; idx--) {
      // Not right before a hyphen of the text: the next line would open
      // on it.
      if (text[idx] === '-') continue;
      // Never between the letters of a word of a joining script.
      if (joining && insideJoiningWord(text, idx)) continue;
      if (fits(idx)) { at = idx; break; }
    }
    // Between two letters of one word: not where a word of a joining script
    // meets another run, nor beside an ideograph, nor after a hyphen.
    if (at > 0 && !joining && !afterHyphen(at) && !hasCJK(text.slice(at - 1, at + 1))) divided = 'character';
  }
  if (at === 0) return null;
  const mark = markW(at) > 0 ? '-' : '';
  // A syllable inside an `l·l`: the hyphen takes the dot's place.
  const geminate = mark !== '' && endsInsideGeminate(text.slice(0, at));
  return {
    head: geminate
      ? { ...flags, text: withLineEndHyphen(text.slice(0, at)), kind: 'text', width: widthBefore(at - 1) + markW(at) }
      : { ...flags, ...pieceScriptFields(token, 0, at), text: text.slice(0, at) + mark, kind: 'text', width: widthBefore(at) + markW(at) },
    tail: { ...restFrom(at), ...flags, ...pieceScriptFields(token, at, text.length) },
    ...(afterHyphen(at) ? { hard: true } : {}),
    ...(divided && !afterHyphen(at) ? { divided } : {}),
  };
}

/** What is left of `token` after a cut at `at` (`cutWidth` px in): its text
 *  and width from there, the break points after the cut moved with it, and
 *  what they need (the hyphen's width; a web address's joints stay bare),
 *  so the next line breaks the rest where it could break the whole.
 *  With `font`, for a word whose halves are measured as the texts painted
 *  (`RichToken.ownPieces`, #770): the rest and its break points are
 *  measured from the cut on ({@link ownRest}), and `cutWidth` is not read. */
function tailAfter(token: RichToken, at: number, cutWidth: number, font?: string): RichToken {
  const own = font !== undefined && token.ownPieces !== undefined ? ownRest(token, at, font) : undefined;
  const residual = own
    ? ownRestBreaks(token, at, own)
    : (token.breakPoints ?? [])
      .filter((b) => b.charIndex > at)
      .map((b) => ({ ...b, charIndex: b.charIndex - at, widthBefore: b.widthBefore - cutWidth }));
  return {
    text: token.text.slice(at),
    bold: token.bold,
    italic: token.italic,
    kind: 'text',
    width: own ? own(token.text.length) : token.width - cutWidth,
    ...(residual.length > 0 ? { breakPoints: residual, hyphenWidth: token.hyphenWidth } : {}),
    ...(token.bareBreaks ? { bareBreaks: true } : {}),
    ...(token.dashJoin ? { dashJoin: true } : {}),
    ...(own ? { ownPieces: token.ownPieces } : {}),
  };
}

/** For each character of the spans' joined text, whether it sits in a
 *  compound: a run of text between breaking spaces with a hyphen between
 *  two letters (see `hasCompound`). */
export function compoundMask(spans: readonly InlineSpan[]): boolean[] {
  const text = spans.map((s) => s.text).join('');
  const mask = new Array<boolean>(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    if (isBreakingSpace(text[i])) { i++; continue; }
    let j = i;
    while (j < text.length && !isBreakingSpace(text[j])) j++;
    if (hasCompound(text.slice(i, j))) mask.fill(true, i, j);
    i = j;
  }
  return mask;
}

/** Ragged hyphenation: at most this many lines in a row end on a
 *  dictionary syllable (a "ladder" of hyphens down the edge). */
export const MAX_RAGGED_HYPHEN_RUN = 2;

/** Width of the spaces a line's tokens end with (trimmed when it is set). */
export function trailingSpaceWidth(tokens: RichToken[]): number {
  let w = 0;
  for (let k = tokens.length - 1; k >= 0 && tokens[k]!.kind === 'space'; k--) w += tokens[k]!.width;
  return w;
}

/** How many of a line's last tokens touch the next one with no space in
 *  between (two runs of one word, "**Nota**:"): the line may not break
 *  inside that group. */
export function gluedTailLength(tokens: RichToken[]): number {
  let k = 0;
  for (let i = tokens.length - 1; i >= 0 && tokens[i]!.kind !== 'space'; i--) k++;
  return k;
}

/** A token the emergency division may cut: a word, not an atomic box nor
 *  one of two stacked scripts. */
export function isDivisible(token: RichToken): boolean {
  return token.kind === 'text' && !token.mathRender && !token.swatch && !token.chip && token.refResourceId === undefined && token.footnoteId === undefined && !token.stacked;
}

/** Cut a word at one of its break points: the head ends the line (with
 *  `mark`, `markWidth` px wide, appended — or in place of the middle dot of
 *  an `l·l`), the tail keeps the break points after the cut. */
export function splitToken(token: RichToken, bp: RichBreakPoint, mark: string, markWidth: number, font?: string): { head: RichToken; tail: RichToken } {
  const flags = { bold: token.bold, italic: token.italic, captionLabel: token.captionLabel, ...scriptOf(token) };
  // The rest measured as the text that opens the next line (#770).
  const own = font !== undefined && token.ownPieces !== undefined ? ownRest(token, bp.charIndex, font) : undefined;
  const residual = own
    ? ownRestBreaks(token, bp.charIndex, own)
    : (token.breakPoints ?? [])
      .filter((b) => b.charIndex > bp.charIndex)
      .map((b) => ({ ...b, charIndex: b.charIndex - bp.charIndex, widthBefore: b.widthBefore - bp.widthBefore }));
  return {
    head: mark !== '' && bp.replacesWidth !== undefined
      ? { ...flags, text: withLineEndHyphen(token.text.slice(0, bp.charIndex)), kind: 'text', width: bp.widthBefore - bp.replacesWidth + markWidth }
      : { ...flags, ...pieceScriptFields(token, 0, bp.charIndex), text: token.text.slice(0, bp.charIndex) + mark, kind: 'text', width: bp.widthBefore + markWidth },
    tail: {
      ...flags,
      ...pieceScriptFields(token, bp.charIndex, token.text.length),
      text: token.text.slice(bp.charIndex),
      kind: 'text',
      width: own ? own(token.text.length) : token.width - bp.widthBefore,
      ...(residual.length > 0 ? { breakPoints: residual, hyphenWidth: token.hyphenWidth } : {}),
      ...(token.bareBreaks ? { bareBreaks: true } : {}),
      ...(token.dashJoin ? { dashJoin: true } : {}),
      ...(own ? { ownPieces: token.ownPieces } : {}),
    },
  };
}

/** `token` (the tail of a compound broken after its hyphen) opening with
 *  that hyphen repeated, `hyphenWidth` px wide; its break points move with
 *  it. */
export function withLeadingHyphen(token: RichToken, hyphenWidth: number, font?: string): RichToken {
  // A word measured as the text painted (#770): the hyphen is part of the
  // text the line opens with, and the word is measured with it.
  if (font !== undefined && token.ownPieces !== undefined) {
    const own = ownRest(token, 0, font, '-');
    const breakPoints = ownRestBreaks(token, 0, own, 1);
    const { breakPoints: _points, ...rest } = token;
    void _points;
    return { ...rest, text: `-${token.text}`, width: own(token.text.length), ...(breakPoints.length > 0 ? { breakPoints } : {}) };
  }
  return {
    ...token,
    text: `-${token.text}`,
    width: token.width + hyphenWidth,
    ...(token.breakPoints
      ? { breakPoints: token.breakPoints.map((bp) => ({ ...bp, charIndex: bp.charIndex + 1, widthBefore: bp.widthBefore + hyphenWidth })) }
      : {}),
  };
}

/** The latest break inside a line's last `glued` tokens that adds nothing
 *  to the line — between ideographs, after a dash, a hard hyphen, a URL
 *  joint — with the token's position in the line. `join`: the break falls
 *  after that whole token, at a dash that closes it (`dashJoin`); the
 *  group's last token joins the token that did not fit. */
export function lastPlainBreakInGroup(
  lineTokens: RichToken[],
  glued: number,
): { at: number; token: RichToken; bp: RichBreakPoint } | { at: number; join: true } | null {
  for (let at = lineTokens.length - 1; at >= lineTokens.length - glued; at--) {
    const token = lineTokens[at]!;
    if (token.dashJoin) return { at, join: true };
    const points = token.breakPoints ?? [];
    for (let k = points.length - 1; k >= 0; k--) {
      const bp = points[k]!;
      if (token.bareBreaks || bp.bare || bp.free) return { at, token, bp };
    }
  }
  return null;
}

/** The latest syllable (the dictionary's or the author's soft hyphen)
 *  inside a line's last `glued` tokens where the line, with the hyphen it
 *  adds, still fits `lineMaxWidth`, with the token's position in the
 *  line. */
export function lastSyllableInGroup(lineTokens: RichToken[], glued: number, lineMaxWidth: number): { at: number; token: RichToken; bp: RichBreakPoint } | null {
  let before = 0;
  for (let k = 0; k < lineTokens.length - glued; k++) before += lineTokens[k]!.width;
  const widthsBefore: number[] = [];
  for (let at = lineTokens.length - glued; at < lineTokens.length; at++) {
    widthsBefore[at] = before;
    before += lineTokens[at]!.width;
  }
  for (let at = lineTokens.length - 1; at >= lineTokens.length - glued; at--) {
    const token = lineTokens[at]!;
    if (!isDivisible(token) || token.bareBreaks) continue;
    const points = token.breakPoints ?? [];
    for (let k = points.length - 1; k >= 0; k--) {
      const bp = points[k]!;
      if (bp.bare || bp.free || bp.greedyOnly) continue;
      if (widthsBefore[at]! + bp.widthBefore + (token.hyphenWidth ?? 0) - (bp.replacesWidth ?? 0) <= lineMaxWidth) return { at, token, bp };
    }
  }
  return null;
}
