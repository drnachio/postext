/**
 * The CJK line composer: Chinese (and Japanese, Korean) paragraphs, on both
 * the plain and the formatted path, broken between characters under the
 * clreq prohibitions of the document's `cjk.lineBreak` and, when justified,
 * spread between characters.
 *
 * Linear in the paragraph: every unit (one grapheme, a Western run a line
 * never breaks inside, a 2-em dash or ellipsis, an atomic box) is measured
 * once — the width cache holds single characters, not prefixes — and the
 * breaker walks the units once with a running width. A line that would
 * start with a prohibited mark gives up characters to the next line
 * (push-out), back to the last break the rules allow.
 *
 * Justification (clreq §6.2.2.4): a justified line that is not its
 * paragraph's last is stretched to the measure — word spaces first, up to
 * ½ em each, then every gap between characters equally, never inside a
 * Western run (a word, a number with its signs), a 2-em dash or ellipsis,
 * and never next to a connector or a solidus. The spread is carried as
 * segment `tracking` (px after each grapheme, in the segment's width); a
 * Western run or a dash pair that a gap follows gives its last grapheme a
 * segment of its own. A line that needs more than the cap (½ em, or
 * `bodyText.maxJustifyTracking` when set) is set with the cap and flagged
 * `cjkLoose` and `ragged`; a line with no CJK character on it (the head of
 * a long web address) is set `ragged` without the flag.
 *
 * Segments: a Western run keeps one of its own, and single characters
 * share one only when they have one style, link and spacing and advance
 * alike, so a caret spread evenly over a segment lands on its characters
 * and a Markdown link covers only its own.
 */

import type { InlineSpan } from '../parse';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import { lineMeasure, type MeasuredBlock, type MeasureBlockOptions } from './types';
import { measureTextWidth, normalSpaceWidthFor } from './canvas';
import {
  atomicSpanToken,
  emergencySplit,
  expandSmallCaps,
  pickSpanFont,
  scriptMetrics,
  spanScriptFields,
  stackedScriptPairs,
  textWidth,
  tokenSegment,
  URL_LIKE_RE,
  urlBreakIndices,
  type PendingSegment,
  type RichToken,
} from './rich';
import {
  cjkBreakAllowed,
  cjkClassOf,
  getCjkLineBreak,
  isCjkGrapheme,
  isFullwidthAlnum,
  isFullwidthDigit,
  isLineEndProhibited,
  isLineStartProhibited,
  isWordInnerMark,
  type CjkClass,
  type CjkLineBreakLevel,
} from './cjkClasses';
import { hasCJK } from './cjk';
import { graphemeCount, graphemesOf, lastGrapheme } from './graphemes';
import { isBreakingSpace } from './spaces';
import { trimChipLineEdges } from './chipEdges';
import { cellAdvance, getMeasureWritingMode, withMeasureWritingMode } from './vertical';
import {
  applyLineEdges,
  boxCut,
  compositionFor,
  compressPair,
  getCjkComposition,
  isLatinSpacingHan,
  isLatinSpacingLatin,
  isPlainComposition,
  latinSpacingPx,
  lineEdgeCut,
  mayHang,
  punctuationBox,
  punctuationShrink,
  routesSharedMarks,
  shrinkPunctuation,
  shrinkStep,
  type CjkComposition,
  type PunctuationBox,
} from './cjkPunctuation';

/** Fit tolerance of the breaker (px): running sums of many widths may
 *  land a hair past a measure they fill exactly. */
const FIT_EPS = 1e-6;

const FONT_SIZE_RE = /(\d*\.?\d+)px/;

/** Letters of the scripts set without spaces (Han, kana, bopomofo, hangul),
 *  as {@link isCjkParagraph} counts them. */
const CJK_LETTER_RE = /[\u3005-\u3007\u3040-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3100-\u312F\u31A0-\u31BF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F\u{20000}-\u{3FFFF}]/u;

/**
 * Whether a paragraph is set by the CJK composer: it holds more CJK letters
 * than word spaces. A Latin paragraph that quotes a Chinese title or name
 * ("the novel 紅樓夢 was …") has more spaces, stays with Knuth–Plass and
 * breaks next to the characters it quotes; a Chinese paragraph with Latin
 * words in it ("用 iPhone 拍照") is composed.
 */
export function isCjkParagraph(text: string): boolean {
  let letters = 0;
  let spaces = 0;
  let inSpace = false;
  for (const ch of text) {
    if (isBreakingSpace(ch)) {
      if (!inSpace) spaces++;
      inSpace = true;
      continue;
    }
    inSpace = false;
    if (CJK_LETTER_RE.test(ch)) letters++;
  }
  return letters > spaces;
}

/** Whether the CJK composer sets a paragraph of this text: it holds CJK
 *  text (not only unit squares or marks Latin shares with Chinese) and more
 *  CJK letters than word spaces (see {@link isCjkParagraph}). Both
 *  measuring paths ask this, so they agree. */
export function composesAsCjk(text: string): boolean {
  return hasCJK(text) && isCjkParagraph(text);
}

/** The style a unit is painted in: every unit of a span shares it, and
 *  consecutive text units with the same `key` merge into one segment. */
interface UnitStyle {
  key: string;
  bold: boolean;
  italic: boolean;
  captionLabel?: boolean;
  script?: 'sup' | 'sub';
  scriptFont?: string;
  baselineShift?: number;
  smallCaps?: boolean;
  /** The font the unit is measured and painted with. */
  font: string;
}

/** What the composer breaks and spreads. */
interface Unit {
  kind: 'text' | 'space' | 'atomic';
  /** The text as painted (soft hyphens and zero-width spaces left out). */
  text: string;
  /** Advance in px, the block's tracking included. */
  width: number;
  /** Graphemes of `text`: the characters tracking spreads. */
  graphemes: number;
  first: CjkClass;
  last: CjkClass;
  /** Whether the first / last grapheme is a CJK character: a line may break
   *  next to it. */
  firstCjk: boolean;
  lastCjk: boolean;
  style: UnitStyle;
  /** Offset of the unit's first character in its span's text. */
  at: number;
  /** No break before this unit: a superscript, a subscript, a footnote
   *  marker or a `:ref` stays with the text it marks. */
  glueBefore?: boolean;
  /** A zero-width space before it: a break at any level. */
  zwspBefore?: boolean;
  /** An atomic unit's token (a chip, a formula, a swatch, a `:ref`, a
   *  footnote marker). */
  token?: RichToken;
  /** A run of Western text (a word, a number with its signs): no tracking
   *  inside, divided only when wider than a line. */
  run?: boolean;
  /** A web address: cut at its joints when it does not fit. */
  url?: boolean;
  /** One of a subscript and a superscript set over each other. */
  stacked?: 'first' | 'second';
  /** The Markdown link the unit is part of (its span and range), so a
   *  segment never holds linked and unlinked characters. */
  link?: string;
  /** A full-width mark whose blank the composition adjusts (see
   *  `cjkPunctuation.ts`): `width` is its advance less the blank it gave
   *  up. */
  punct?: PunctuationBox;
  /** A space between Han and Latin (`cjk.latinSpacing`): inserted (`text`
   *  empty) or replacing the space the author typed. */
  auto?: boolean;
  /** A mark Latin text shares with Chinese (“ ” ‘ ’ … — ·) set in a
   *  Chinese mark's box (see {@link routeSharedMarks}): where each of its
   *  graphemes' glyph starts in its one-em cell, px. Set only when a glyph
   *  is not one em wide, so its box and its advance differ. */
  place?: number[];
}

interface Fonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

function styleOf(span: InlineSpan, fonts: Fonts): UnitStyle {
  const script = spanScriptFields(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  const font = script.scriptFont ?? pickSpanFont(span.bold, span.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  return {
    key: `${span.bold ? 'b' : ''}${span.italic ? 'i' : ''}${span.captionLabel ? 'c' : ''}${span.smallCaps ? 's' : ''}|${script.script ?? ''}|${font}|${script.baselineShift ?? ''}`,
    bold: span.bold,
    italic: span.italic,
    ...(span.captionLabel ? { captionLabel: true } : {}),
    ...script,
    ...(span.smallCaps ? { smallCaps: true } : {}),
    font,
  };
}

/** A grapheme set as a Chinese character here: a CJK grapheme, unless it
 *  is the apostrophe or the interpunct of a Latin word ("don’t", "l·l"). */
function isCjkHere(g: string, prev: string | undefined, next: string | undefined): boolean {
  return isCjkGrapheme(g) && !isWordInnerMark(g, prev, next);
}

/** Marks that pair up into one 2-em unit (破折号, 省略号). */
function pairable(g: string): boolean {
  return g === '\u2014' || g === '\u2015' || g === '\u2026' || g === '\u22EF'; // — ― … ⋯
}

/**
 * The units of a paragraph's spans, in order. `letterSpacingPx` (the
 * block's tracking) is measured into every width, per grapheme. In
 * `vertical` text a CJK character advances by its cell (`cellAdvance`).
 */
function buildUnits(spans: readonly InlineSpan[], fonts: Fonts, letterSpacingPx: number, vertical = false, route = false): Unit[] {
  const units: Unit[] = [];
  const track = (n: number): number => (letterSpacingPx === 0 ? 0 : letterSpacingPx * n);
  let zwsp = false;
  // Which units open a span and hold all of it (the candidates for stacked
  // scripts), by index.
  const wholeSpan = new Set<number>();

  for (let si = 0; si < spans.length; si++) {
    const span = spans[si]!;
    const atomic = atomicSpanToken(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, letterSpacingPx);
    if (atomic) {
      const style = styleOf(span, fonts);
      const graphemes = graphemesOf(atomic.text);
      const object = atomic.chip !== undefined || atomic.mathRender !== undefined || atomic.swatch !== undefined;
      const firstG = graphemes[0] ?? '';
      const lastG = graphemes[graphemes.length - 1] ?? '';
      units.push({
        kind: 'atomic',
        text: atomic.text,
        width: atomic.width,
        graphemes: graphemes.length,
        first: object ? 'ideograph' : cjkClassOf(firstG),
        last: object ? 'ideograph' : cjkClassOf(lastG),
        firstCjk: object || isCjkGrapheme(firstG),
        lastCjk: object || isCjkGrapheme(lastG),
        style,
        at: 0,
        token: atomic,
        ...(atomic.refResourceId !== undefined || atomic.footnoteId !== undefined ? { glueBefore: true } : {}),
        ...(zwsp ? { zwspBefore: true } : {}),
      });
      zwsp = false;
      continue;
    }
    if (span.text.length === 0) continue;
    const style = styleOf(span, fonts);
    const graphemes = graphemesOf(span.text);
    const spanFirst = units.length;
    let run: string[] = [];
    let runAt = 0;
    let runLink: string | undefined;
    let space = '';
    let spaceAt = 0;
    // A lone mark that may pair with the next one (—, …), by unit index.
    let pairOpen = -1;
    let at = 0;
    // The link a character at `offset` of the span is part of: its span and
    // range, so two links to one target stay apart.
    const links = span.links;
    const linkAt = (offset: number): string | undefined => {
      if (!links || links.length === 0) return undefined;
      for (let li = 0; li < links.length; li++) {
        const l = links[li]!;
        if (offset >= l.start && offset < l.end) return `${si}:${li}`;
      }
      return undefined;
    };
    const push = (u: Omit<Unit, 'style' | 'glueBefore' | 'zwspBefore'>): void => {
      units.push({
        ...u,
        style,
        ...(zwsp ? { zwspBefore: true } : {}),
        ...(style.script && units.length === spanFirst ? { glueBefore: true } : {}),
      });
      zwsp = false;
    };
    const flushRun = (): void => {
      if (run.length === 0) return;
      const text = run.join('');
      const firstG = run[0]!;
      const lastG = run[run.length - 1]!;
      push({
        kind: 'text',
        text,
        width: textWidth(text, style.font, style.smallCaps) + track(run.length),
        graphemes: run.length,
        first: cjkClassOf(firstG),
        last: cjkClassOf(lastG),
        firstCjk: false,
        lastCjk: false,
        at: runAt,
        run: true,
        ...(URL_LIKE_RE.test(text) ? { url: true } : {}),
        ...(runLink !== undefined ? { link: runLink } : {}),
      });
      run = [];
      pairOpen = -1;
    };
    const flushSpace = (): void => {
      if (space === '') return;
      units.push({
        kind: 'space',
        text: space,
        width: measureTextWidth(space, style.font) + track(graphemeCount(space)),
        graphemes: graphemeCount(space),
        first: 'western',
        last: 'western',
        firstCjk: false,
        lastCjk: false,
        style,
        at: spaceAt,
      });
      space = '';
      pairOpen = -1;
    };
    for (let i = 0; i < graphemes.length; i++) {
      const g = graphemes[i]!;
      const gAt = at;
      at += g.length;
      if (isBreakingSpace(g[0])) {
        flushRun();
        if (space === '') spaceAt = gAt;
        space += g;
        continue;
      }
      flushSpace();
      if (g === '\u200B') {
        flushRun();
        zwsp = true;
        pairOpen = -1;
        continue;
      }
      // A soft hyphen: the composer breaks Western words only when they are
      // wider than the line, so it is left out, and the word stays whole.
      if (g === '\u00AD') continue;
      const link = linkAt(gAt);
      if (!isCjkHere(g, graphemes[i - 1], graphemes[i + 1])) {
        // A link that starts or ends inside a run cuts it: the two parts
        // still never part (neither is CJK) and take no space between them.
        if (run.length > 0 && link !== runLink) flushRun();
        if (run.length === 0) {
          runAt = gAt;
          runLink = link;
        }
        run.push(g);
        continue;
      }
      flushRun();
      // —— and …… are one unit of two ems; a third mark opens another.
      if (pairOpen >= 0 && units[pairOpen]!.text === g && !zwsp && units[pairOpen]!.link === link) {
        const u = units[pairOpen]!;
        u.text += g;
        u.width += cellAdvance(g, style.font, vertical, u.first) + track(1);
        u.graphemes = 2;
        u.first = u.last = g === '\u2026' || g === '\u22EF' ? 'ellipsis' : 'dash';
        pairOpen = -1;
        continue;
      }
      let cls = cjkClassOf(g);
      // A single em dash (or horizontal bar) joins two words as a connector
      // (clreq §6.1.1): never at a line start.
      if (g === '\u2014' || g === '\u2015') cls = 'connector';
      push({
        kind: 'text',
        text: g,
        width: (style.smallCaps && !vertical ? textWidth(g, style.font, true) : cellAdvance(g, style.font, vertical, cls)) + track(1),
        graphemes: 1,
        first: cls,
        last: cls,
        firstCjk: true,
        lastCjk: true,
        at: gAt,
        ...(link !== undefined ? { link } : {}),
      });
      pairOpen = pairable(g) ? units.length - 1 : -1;
    }
    flushRun();
    flushSpace();
    if (units.length === spanFirst + 1 && units[spanFirst]!.kind === 'text') wholeSpan.add(spanFirst);
  }

  // A subscript and a superscript that touch are set one over the other
  // (EF-80): the first advances nothing, the second the pair's advance, and
  // the two never part.
  if (units.some((u) => u.style.script)) {
    const scripts = units.map((u, i) => (wholeSpan.has(i) && u.style.script && !u.style.smallCaps ? u.style.script : undefined));
    for (const i of stackedScriptPairs(scripts)) {
      const a = units[i]!;
      const b = units[i + 1]!;
      const sub = a.style.script === 'sub' ? a : b;
      sub.style = {
        ...sub.style,
        key: `${sub.style.key}|stacked`,
        baselineShift: scriptMetrics(pickSpanFont(sub.style.bold, sub.style.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic), 'sub', true).baselineShift,
      };
      b.width = Math.max(a.width, b.width);
      a.width = 0;
      a.stacked = 'first';
      b.stacked = 'second';
      b.glueBefore = true;
    }
  }
  if (route && !vertical) routeSharedMarks(units, letterSpacingPx);
  return units;
}

/** The marks Latin text shares with Chinese (East Asian Width ambiguous):
 *  quotes, the ellipsis, the em dash and horizontal bar, interpuncts. */
const SHARED_MARKS = new Set(['\u201C', '\u201D', '\u2018', '\u2019', '\u2026', '\u22EF', '\u2014', '\u2015', '\u00B7', '\u2027']);

/** Whether a unit is one shared mark, or a pair of them (—— ……). */
function isSharedMarkUnit(u: Unit): boolean {
  if (u.kind !== 'text' || u.run || u.stacked || u.style.script || u.style.smallCaps) return false;
  if (u.graphemes === 1) return SHARED_MARKS.has(u.text);
  return u.graphemes === 2 && SHARED_MARKS.has(u.text[0]!) && u.text[0] === u.text[1];
}

/** The script a unit sets for the shared marks next to it: Chinese (a CJK
 *  character or mark), Western (a Latin run or a word space), or none for
 *  one that is transparent to them (another shared mark, an inline box). */
function unitScript(v: Unit): 'cjk' | 'western' | undefined {
  if (v.kind === 'space') return 'western';
  if (v.kind === 'atomic' || isSharedMarkUnit(v)) return undefined;
  return !v.run && v.firstCjk ? 'cjk' : 'western';
}

/**
 * The marks Latin text shares with Chinese (“ ” ‘ ’ … — ·, East Asian
 * Width ambiguous) take the box of a Chinese mark when they stand in
 * Chinese text (clreq §3.1; research note on context routing): a text on
 * either side is Chinese, or none is Western. A font whose glyphs for them
 * are proportional (LXGW WenKai sets “ ” at 0.35 em, Noto Serif SC the em
 * dash at 0.89 em and · at a third) would otherwise crowd them against the
 * characters they belong to. Each grapheme advances one em (with the
 * block's tracking) whatever its font's advance, and its glyph sits where
 * a Chinese font puts it: an opening quote at the end of its box, a
 * closing one at its start, an interpunct, an ellipsis and a single dash
 * centred; a pair (—— ……) is set as the font sets the two together and
 * centred in its two ems, so a 破折号 reads as one line and the six dots
 * of an ellipsis keep one spacing. The composition then adjusts the box as
 * it does any mark's (`cjk.punctuationWidth`). A glyph one em wide already changes
 * nothing. Next to Western text on both sides (`He said “yes”`) they keep
 * their own advance, and so do they in Japanese and Korean text (the
 * composer calls this for Chinese text only, `routesSharedMarks`).
 */
function routeSharedMarks(units: Unit[], letterSpacingPx: number): void {
  if (!units.some(isSharedMarkUnit)) return;
  // The script of the nearest unit on each side that is not transparent
  // (`unitScript`), past runs of shared marks and inline boxes: two
  // linear passes, so a long run of marks costs no more than its length.
  const n = units.length;
  const before: ('cjk' | 'western' | undefined)[] = new Array(n);
  const after: ('cjk' | 'western' | undefined)[] = new Array(n);
  let seen: 'cjk' | 'western' | undefined;
  for (let k = 0; k < n; k++) {
    before[k] = seen;
    seen = unitScript(units[k]!) ?? seen;
  }
  seen = undefined;
  for (let k = n - 1; k >= 0; k--) {
    after[k] = seen;
    seen = unitScript(units[k]!) ?? seen;
  }
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (!isSharedMarkUnit(u)) continue;
    const b = before[k];
    const a = after[k];
    if (b !== 'cjk' && a !== 'cjk' && (b !== undefined || a !== undefined)) continue;
    const em = emOfFont(u.style.font);
    const font = u.style.font;
    let place: number[];
    if (u.graphemes === 2) {
      // —— ……: the pair as the font sets it (a face may kern the dashes
      // into one line), centred in its two ems.
      const g = u.text[0]!;
      const adv = measureTextWidth(g, font);
      const pair = measureTextWidth(u.text, font);
      if (Math.abs(adv - em) < 1e-6 && Math.abs(pair - 2 * em) < 1e-6) continue;
      const start = em - pair / 2;
      place = [start, start + pair - adv - em];
    } else {
      const adv = measureTextWidth(u.text, font);
      if (Math.abs(adv - em) < 1e-6) continue;
      const slack = em - adv;
      const cls = cjkClassOf(u.text);
      place = [cls === 'opening' ? slack : cls === 'closing' ? 0 : slack / 2];
    }
    u.width = u.graphemes * (em + letterSpacingPx);
    u.place = place;
  }
}

/** The em (px) of a font shorthand: its size. */
function emOfFont(font: string): number {
  const m = FONT_SIZE_RE.exec(font);
  return m ? parseFloat(m[1]!) : 16;
}

/** Whether a unit is a single CJK mark (a bracket, a pause, stop or
 *  interpunct mark, a dash or an ellipsis): two of them in a row never
 *  hang. */
function isMarkUnit(u: Unit | undefined): boolean {
  if (!u || u.kind !== 'text' || u.run || !u.firstCjk) return false;
  switch (u.first) {
    case 'opening': case 'closing': case 'pause': case 'stop': case 'interpunct': case 'dash': case 'ellipsis':
      return true;
    default:
      return false;
  }
}

/**
 * The punctuation widths and Han–Latin spaces of a paragraph's units, as
 * the composition sets them (see `cjkPunctuation.ts`): each full-width mark
 * takes the width its style gives it (`Unit.punct`), two marks that meet
 * give up the blank between them (`compressAdjacent`), and a space unit
 * (`Unit.auto`) goes between each Han character and a Latin letter or digit
 * it touches — the space the author typed there turns into one. The line
 * edges (and the reduction a line makes to take one more character) are
 * the breaker's and the line's business. A plain composition changes
 * nothing but the mainland interpunct, half an em under every style
 * (`punctuationBox`), as its cell is in vertical text.
 */
function prepareUnits(units: Unit[], c: CjkComposition, letterSpacingPx: number): Unit[] {
  const plain = isPlainComposition(c);
  // Down the line the mainland interpunct's cell is half an em already.
  if (plain && (c.region !== 'mainland' || c.vertical)) return units;
  const full = new Map<Unit, number>();
  for (const u of units) {
    if (u.kind !== 'text' || u.run || u.graphemes !== 1 || !u.firstCjk || u.style.script || u.stacked) continue;
    if (plain && u.first !== 'interpunct') continue;
    const box = punctuationBox(u.text, u.first, u.width - letterSpacingPx, emOfFont(u.style.font), c);
    if (!box) continue;
    full.set(u, u.width);
    u.punct = box;
    u.width -= boxCut(box);
  }
  if (plain) return units;
  if (c.compressAdjacent && full.size > 1) {
    for (let k = 1; k < units.length; k++) {
      const a = units[k - 1]!;
      const b = units[k]!;
      if (!a.punct || !b.punct || b.zwspBefore) continue;
      compressPair(a.punct, b.punct);
      a.width = full.get(a)! - boxCut(a.punct);
      b.width = full.get(b)! - boxCut(b.punct);
    }
  }
  if ((c.latinSpacing.px ?? c.latinSpacing.em ?? 0) <= 0) return units;
  const out: Unit[] = [];
  const han = (u: Unit | undefined, edge: 'first' | 'last'): boolean =>
    !!u && u.kind === 'text' && !u.run && u.firstCjk && u[edge] === 'ideograph' && !u.style.script && isLatinSpacingHan(u.text);
  const latin = (u: Unit | undefined, edge: 'first' | 'last'): boolean =>
    !!u && u.kind === 'text' && !!u.run && !u.style.script && isLatinSpacingLatin(edge === 'first' ? String.fromCodePoint(u.text.codePointAt(0)!) : lastGrapheme(u.text));
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

/** Whether a line may break before each unit (index 0 is never a break).
 *  A word space is a break unless the unit after it may not open a line,
 *  the last one before it may not close one, or they are a number and its
 *  sign; a zero-width space is a break at every level. */
function breakOpportunities(units: readonly Unit[], level: CjkLineBreakLevel): Uint8Array {
  const out = new Uint8Array(units.length);
  // The last unit before `k` that is not a space.
  let ink = -1;
  for (let k = 1; k < units.length; k++) {
    const a = units[k - 1]!;
    const b = units[k]!;
    if (a.kind !== 'space') ink = k - 1;
    if (b.kind === 'space') continue;
    if (b.zwspBefore) {
      out[k] = 1;
      continue;
    }
    if (a.kind === 'space') {
      const p = ink >= 0 ? units[ink]! : undefined;
      if (!p || (!numberGlue(p, b) && !isLineStartProhibited(b.first, level) && !isLineEndProhibited(p.last, level))) out[k] = 1;
      continue;
    }
    if (b.glueBefore) continue;
    if (numberGlue(a, b) || fullwidthGlue(units, k)) continue;
    if (cjkBreakAllowed(a.last, a.lastCjk, b.first, b.firstCjk, level)) out[k] = 1;
  }
  return out;
}

/** Whether justification may add space between two units that touch on a
 *  line: between characters, never inside a Western run or a 2-em mark
 *  (those are single units), never between two Western runs, next to a
 *  connector or a solidus, after an atomic box, or before a mark that
 *  keeps to the text before it. Spaces take their own share. */
function gapStretches(a: Unit, b: Unit): boolean {
  if (a.kind !== 'text' || b.kind === 'space') return false;
  if (b.glueBefore || a.stacked) return false;
  if (a.last === 'connector' || a.last === 'solidus' || b.first === 'connector' || b.first === 'solidus') return false;
  if (!a.lastCjk && !b.firstCjk) return false;
  if (a.last === b.first && (a.last === 'dash' || a.last === 'ellipsis')) return false;
  return true;
}

/** One line as the breaker found it: units `start` to `end` (exclusive),
 *  the first replaced by `first` (the rest of a unit the line before cut)
 *  and `head` appended (the part of unit `end` that fits). */
interface LineRange {
  start: number;
  end: number;
  first?: Unit;
  head?: Unit;
  hyphenated: boolean;
  hardHyphen?: boolean;
  /** The line's last unit hangs past its end (`cjk.hangingPunctuation`). */
  hang?: boolean;
}

/**
 * What the breaker asks of a composition (see `cjkPunctuation.ts`): the
 * blank a mark gives up at a line start (`lead`) or end (`tail`) — less
 * the blank it gave to a mark across the break, which comes back, so
 * either may be negative —, and what a unit gives when its line is
 * compressed to take one more character (`give`, at the line's start or
 * end or inside it): a mark down to half an em as its style allows, a word
 * space down to a quarter em, a Han–Latin space down to an eighth. `edge`
 * sets a mark as it stands at a line edge (its `punct` must be the line's
 * own copy) and returns what it gave up.
 */
interface LineFit {
  lead(u: Unit): number;
  tail(u: Unit): number;
  give(u: Unit, atStart: boolean, atEnd: boolean): number;
  edge(u: Unit, start: boolean, end: boolean): number;
  /** Whether unit `k` may hang when it ends a line: a pause or stop mark
   *  the composition lets hang, with no other mark before or after it. */
  hangs(units: readonly Unit[], k: number, unitAt: (k: number) => Unit): boolean;
  hanging: 'none' | 'allow' | 'force';
}

function lineFitOf(c: CjkComposition): LineFit | undefined {
  if (isPlainComposition(c)) return undefined;
  return {
    lead: (u) => (u.punct ? lineEdgeCut(u.punct, c, true, false) : 0),
    tail: (u) => (u.punct ? lineEdgeCut(u.punct, c, false, true) : 0),
    give(u, atStart, atEnd) {
      if (u.kind === 'space') {
        const em = emOfFont(u.style.font);
        return Math.max(0, u.width - (u.auto ? em / 8 : em / 4));
      }
      if (!u.punct) return 0;
      if (!atStart && !atEnd) return punctuationShrink(u.punct, c);
      const box = { ...u.punct };
      applyLineEdges(box, c, atStart, atEnd);
      return punctuationShrink(box, c);
    },
    edge: (u, start, end) => (u.punct ? applyLineEdges(u.punct, c, start, end) : 0),
    hangs(units, k, unitAt) {
      const u = unitAt(k);
      if (u.kind !== 'text' || u.run || u.graphemes !== 1 || !mayHang(u.text, u.first, c)) return false;
      if (k > 0 && isMarkUnit(unitAt(k - 1))) return false;
      return k + 1 >= units.length || !isMarkUnit(units[k + 1]);
    },
    hanging: c.hangingPunctuation,
  };
}

/** The last unit that must share a line with unit `k` when `k` ends one:
 *  the units after it up to the next break (a closing quote after a
 *  full stop). -1 when that is more than a few units away or crosses a
 *  space the line may not break after. */
function groupEnd(units: readonly Unit[], breaks: Uint8Array, k: number): number {
  const n = units.length;
  for (let q = k; q < k + 6; q++) {
    if (q + 1 >= n) return q;
    if (units[q + 1]!.kind === 'space') {
      let r = q + 1;
      while (r < n && units[r]!.kind === 'space') r++;
      return r >= n || breaks[r] ? q : -1;
    }
    if (breaks[q + 1]) return q;
  }
  return -1;
}

/** The advance of the first `idx` UTF-16 units of a Western run, the
 *  block's tracking included. */
function prefixWidth(u: Unit, idx: number, letterSpacingPx: number): number {
  const head = u.text.slice(0, idx);
  return textWidth(head, u.style.font, u.style.smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(head));
}

/** Characters of a run kept past the first that does not fit when it is
 *  cut: enough for the dictionary and the joints of a web address to read
 *  the text around every cut that fits as they read the whole run. */
const CUT_CONTEXT = 32;

/** The shortest prefix of a Western run (in UTF-16 units) wider than
 *  `room`, or its length when all of it fits: found by doubling, then
 *  halving, so a run many lines long costs what one line of it does. */
function overflowAt(u: Unit, room: number, letterSpacingPx: number): number {
  const len = u.text.length;
  let fit = 0;
  let over = len;
  for (let step = 1; fit + step < len; step *= 2) {
    if (prefixWidth(u, fit + step, letterSpacingPx) > room + FIT_EPS) {
      over = fit + step;
      break;
    }
    fit += step;
  }
  if (over === len && u.width <= room + FIT_EPS) return len;
  while (over - fit > 1) {
    const mid = (fit + over) >> 1;
    if (prefixWidth(u, mid, letterSpacingPx) > room + FIT_EPS) over = mid;
    else fit = mid;
  }
  return over;
}

/** The rest of a run after its first `from` UTF-16 units (`cutWidth` px). */
function runTail(u: Unit, from: number, cutWidth: number): Unit {
  const tail = u.text.slice(from);
  return {
    ...u,
    text: tail,
    width: u.width - cutWidth,
    graphemes: u.graphemes - graphemeCount(u.text.slice(0, from)),
    first: cjkClassOf(tail),
    at: u.at + from,
    glueBefore: false,
    zwspBefore: false,
  };
}

/** Cut a web address at its last joint (after a slash, before a dot…)
 *  whose head fits `room`: nothing is added at the break. Only the joints
 *  before the first character that does not fit are tried. */
function cutAtJoint(u: Unit, room: number, letterSpacingPx: number): { head: Unit; tail: Unit } | null {
  const over = overflowAt(u, room, letterSpacingPx);
  const joints = urlBreakIndices(u.text.slice(0, Math.min(u.text.length, over + CUT_CONTEXT)));
  for (let j = joints.length - 1; j >= 0; j--) {
    const idx = joints[j]!;
    if (idx >= over) continue;
    const head = u.text.slice(0, idx);
    const w = prefixWidth(u, idx, letterSpacingPx);
    if (w > room + FIT_EPS) continue;
    return {
      head: { ...u, text: head, width: w, graphemes: graphemeCount(head), last: cjkClassOf(lastGrapheme(head)), url: false },
      tail: runTail(u, idx, w),
    };
  }
  return null;
}

/** Divide a Western run wider than the whole line (see `emergencySplit`):
 *  at a dictionary syllable with a hyphen, else at the last character that
 *  fits. Only the run up to a little past the first character that does not
 *  fit is handed to the divider, so each line of a long run costs what the
 *  line holds. */
function divideRun(u: Unit, room: number, letterSpacingPx: number): { head: Unit; tail: Unit; hyphen: boolean; hard: boolean } | null {
  const end = Math.min(u.text.length, overflowAt(u, room, letterSpacingPx) + CUT_CONTEXT);
  const text = end === u.text.length ? u.text : u.text.slice(0, end);
  const width = end === u.text.length ? u.width : prefixWidth(u, end, letterSpacingPx);
  const token: RichToken = {
    text,
    bold: u.style.bold,
    italic: u.style.italic,
    kind: 'text',
    width,
    ...(u.style.smallCaps ? { smallCaps: true } : {}),
  };
  const split = emergencySplit(token, u.style.font, letterSpacingPx, room);
  if (!split) return null;
  const headText = split.head.text;
  const hyphen = headText.length > 0 && headText.endsWith('-') && !u.text.startsWith(headText);
  // Where the rest starts (past a no-break space the divider parted at)
  // and the advance of what comes before it.
  const from = text.length - split.tail.text.length;
  return {
    head: { ...u, text: headText, width: split.head.width, graphemes: graphemeCount(headText), last: cjkClassOf(lastGrapheme(headText)), url: false },
    tail: runTail(u, from, width - split.tail.width),
    hyphen,
    hard: split.hard === true,
  };
}

/**
 * Break the units into lines, first fit with push-out: a line takes units
 * while they fit its measure less `reserve`; the unit that does not fit
 * opens the next line when a break before it is allowed, else (when the
 * composition cannot push it in or hang it) the line ends
 * at the last allowed break (the characters after it go down with the
 * unit). A space never overflows: the line ends before it, when the line
 * may break after it. A unit wider
 * than the whole line is divided when it is a Western run (a web address
 * at a joint first), else set on a line of its own.
 */
function breakUnits(
  units: readonly Unit[],
  breaks: Uint8Array,
  measureOf: (line: number) => number,
  reserve: number,
  letterSpacingPx: number,
  fit?: LineFit,
): LineRange[] {
  const out: LineRange[] = [];
  const n = units.length;
  let i = 0;
  let carried: Unit | undefined;
  let carriedAt = -1;
  const unitAt = (k: number): Unit => (k === carriedAt && carried ? carried : units[k]!);
  for (let li = 0; ; li++) {
    while (i < n && unitAt(i).kind === 'space') i++;
    if (i >= n) break;
    const max = measureOf(li) - reserve;
    let w = 0;
    let lastBreak = -1;
    let end = -1;
    let head: Unit | undefined;
    let tail: Unit | undefined;
    let hyphenated = false;
    let hardHyphen = false;
    let hang = false;
    // What the line could give up to take one more character (push-in).
    let give = 0;
    for (let k = i; k < n; k++) {
      const u = unitAt(k);
      if (k > i && breaks[k]) lastBreak = k;
      const lead = fit && k === i ? fit.lead(u) : 0;
      if (w + u.width - lead - (fit ? fit.tail(u) : 0) <= max + FIT_EPS) {
        w += u.width - lead;
        if (fit) give += fit.give(u, k === i, false);
        continue;
      }
      if (fit && k > i && u.kind !== 'space') {
        // A pause or stop mark that does not fit hangs past the measure:
        // at once under 'force', after compressing the line failed under
        // 'allow'. Else, when the unit may not open the next line (no
        // break before it), the line gives up blank to take it and what
        // must stay with it (push-in, clreq §6.2.2.3), before it would
        // push characters down. A unit that may open a line goes down and
        // the line is spread: compressing marks to take one more
        // character there would narrow Kaiming's stop marks inside the
        // line.
        const canHang = fit.hanging !== 'none' && groupEnd(units, breaks, k) === k && fit.hangs(units, k, unitAt);
        if (canHang && fit.hanging === 'force') {
          end = k + 1;
          hang = true;
          break;
        }
        const m = breaks[k] ? -1 : groupEnd(units, breaks, k);
        if (m >= k) {
          let width = w;
          let room = give;
          for (let q = k; q <= m; q++) {
            const uq = unitAt(q);
            const t = q === m ? fit.tail(uq) : 0;
            width += uq.width - t;
            room += fit.give(uq, false, q === m);
          }
          if (width - room <= max + FIT_EPS) {
            end = m + 1;
            break;
          }
        }
        if (canHang) {
          end = k + 1;
          hang = true;
          break;
        }
      }
      if (u.kind === 'space') {
        // The line ends before the space when it may break after it; else
        // it gives up characters to the next line, as for any other unit.
        let m = k + 1;
        while (m < n && units[m]!.kind === 'space') m++;
        if (m >= n || breaks[m]) {
          end = k;
          break;
        }
      }
      if (u.url) {
        const cut = cutAtJoint(u, max - w, letterSpacingPx);
        if (cut) {
          end = k;
          head = cut.head;
          tail = cut.tail;
          hyphenated = true;
          hardHyphen = false;
          break;
        }
      }
      if (k > i && breaks[k]) {
        end = k;
        break;
      }
      if (lastBreak > i) {
        end = lastBreak;
        break;
      }
      if (k === i) {
        if (u.run) {
          const split = divideRun(u, max, letterSpacingPx);
          if (split) {
            end = k;
            head = split.head;
            tail = split.tail;
            hyphenated = true;
            hardHyphen = split.hard;
            break;
          }
        }
        end = k + 1;
        break;
      }
      // Nothing on the line may end it: break before the unit anyway.
      end = k;
      break;
    }
    if (end < 0) end = n;
    out.push({
      start: i,
      end,
      ...(carriedAt === i && carried ? { first: carried } : {}),
      ...(head ? { head } : {}),
      hyphenated,
      ...(hardHyphen ? { hardHyphen: true } : {}),
      ...(hang ? { hang: true } : {}),
    });
    if (tail) {
      carried = tail;
      carriedAt = end;
    } else if (carriedAt < end) {
      carried = undefined;
      carriedAt = -1;
    }
    i = end;
  }
  return out;
}

/** A segment being built: its texts, joined once it is done. */
interface Piece {
  seg: PendingSegment;
  parts: string[];
  /** Consecutive text units of this style, link and tracking may join it. */
  key: string | undefined;
  /** The advance of each character of a piece others may join: only
   *  characters that advance alike share a segment, so the Sandbox's caret
   *  can spread a segment's width evenly over its characters. */
  cell?: number;
}

interface ComposeContext {
  fonts: Fonts;
  textAlign: string;
  letterSpacingPx: number;
  em: number;
  cap: number;
  normalSpace: number;
  lineHeightPx: number;
  indentOf: (line: number) => number;
  measureOf: (line: number) => number;
  /** Vertical text: a Western run keeps the gap after it in its width. */
  vertical?: boolean;
  /** The composition's line edges, push-in and hanging; undefined for a
   *  plain one. */
  fit?: LineFit;
}

/** Share `amount` among `caps` equally, none past its cap: what each
 *  takes. */
function spread(amount: number, caps: readonly number[]): number[] {
  const takes = caps.map(() => 0);
  const order = caps.map((_, i) => i).sort((a, b) => caps[a]! - caps[b]!);
  let rest = amount;
  for (let o = 0; o < order.length && rest > 1e-12; o++) {
    const i = order[o]!;
    const take = Math.min(caps[i]!, rest / (order.length - o));
    takes[i] = take;
    rest -= take;
  }
  return takes;
}

/**
 * A line's units as its edges and its measure set them (see
 * `cjkPunctuation.ts`): the first mark gives up its lead and the last its
 * tail, each taking back the blank it gave to a mark on the other side of
 * the break (the two no longer meet); a mark that hangs is taken out and
 * returned apart; and a line wider than its measure (it took one more
 * character that may not open a line, clreq §6.2.2.3) gives up
 * blank in clreq's order — word spaces to a quarter em, interpuncts,
 * brackets, pause marks, Han–Latin spaces to an eighth of an em, stop marks
 * last — each step shared equally, until it fits. `us` holds the line's
 * units and is changed in place; a unit that changes is replaced by a copy,
 * since the paragraph's units serve every attempt at breaking it.
 */
function fitLine(us: Unit[], units: readonly Unit[], range: LineRange, lastK: number, isLast: boolean, measure: number, fit: LineFit): Unit | undefined {
  const copy = (j: number): Unit => {
    const u = us[j]!;
    const c: Unit = { ...u, ...(u.punct ? { punct: { ...u.punct } } : {}) };
    us[j] = c;
    return c;
  };
  let hang: Unit | undefined;
  if (us.length > 1) {
    const unitAt = (k: number): Unit => (k === range.start && range.first ? range.first : units[k]!);
    const forced = fit.hanging === 'force' && !isLast && !range.head && fit.hangs(units, lastK, unitAt);
    if (range.hang || forced) {
      hang = copy(us.length - 1);
      us.pop();
      hang.width -= fit.edge(hang, false, true);
      while (us.length > 0 && us[us.length - 1]!.kind === 'space') us.pop();
    }
  }
  if (us.length === 0) return hang;
  // The marks at the edges: what they gave to a mark across the break
  // comes back, then the edge trims.
  if (fit.lead(us[0]!) !== 0) {
    const c = copy(0);
    c.width -= fit.edge(c, true, false);
  }
  if (fit.tail(us[us.length - 1]!) !== 0) {
    const c = copy(us.length - 1);
    c.width -= fit.edge(c, false, true);
  }
  let over = -measure;
  for (const u of us) over += u.width;
  if (over <= FIT_EPS) return hang;
  // Steps of the reduction order: word spaces (1), interpuncts (2),
  // brackets (3), pause marks (4), Han–Latin spaces (5), stop marks (6).
  const stepOf = (u: Unit): number => (u.kind === 'space' ? (u.auto ? 5 : 1) : u.punct ? shrinkStep(u.punct) : 0);
  for (let step = 1; step <= 6 && over > FIT_EPS; step++) {
    const members: number[] = [];
    const caps: number[] = [];
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      if (stepOf(u) !== step) continue;
      // The marks at the edges already gave up their lead and tail.
      const cap = fit.give(u, false, false);
      if (cap <= 0) continue;
      members.push(j);
      caps.push(cap);
    }
    if (members.length === 0) continue;
    const takes = spread(over, caps);
    for (let m = 0; m < members.length; m++) {
      const take = takes[m]!;
      if (take <= 0) continue;
      const c = copy(members[m]!);
      const given = c.punct ? shrinkPunctuation(c.punct, take) : take;
      c.width -= given;
      over -= given;
    }
  }
  return hang;
}

/** Where a unit's glyph (its `grapheme`th) is painted from its segment's
 *  start, px (`VDTLineSegment.inkOffset`): a shared mark's place in its
 *  box, less the blank its box gave up before it. Undefined for a unit
 *  painted at its own advances. */
function inkOffsetOf(u: Unit, grapheme = 0): number | undefined {
  const cutStart = u.punct?.cutStart ?? 0;
  if (u.place) return u.place[grapheme]! - cutStart;
  if (u.punct && boxCut(u.punct) > 0) return cutStart > 0 ? -cutStart : 0;
  return undefined;
}

/** The segments, text and flags of one line (see the module comment for
 *  the spreading). */
function composeLine(units: readonly Unit[], range: LineRange, li: number, isLast: boolean, ctx: ComposeContext): VDTLine {
  const us: Unit[] = [];
  for (let k = range.start; k < range.end; k++) us.push(k === range.start && range.first ? range.first : units[k]!);
  if (range.head) us.push(range.head);
  let lastK = range.end - 1;
  while (us.length > 0 && us[us.length - 1]!.kind === 'space') {
    us.pop();
    lastK--;
  }

  const measure = ctx.measureOf(li);
  const hang = ctx.fit ? fitLine(us, units, range, lastK, isLast, measure, ctx.fit) : undefined;
  const justify = ctx.textAlign === 'justify' && !isLast;
  let spaceWidth: number | undefined;
  let tracking = 0;
  let loose = false;
  let spaceRatio: number | undefined;
  let ragged = false;
  const stretches: boolean[] = [];
  if (justify) {
    let content = 0;
    let spaces = 0;
    let natural = 0;
    let widest = 0;
    let gaps = 0;
    // Han–Latin spaces (`cjk.latinSpacing`): they flex apart from word
    // spaces, and the renderers leave them as set.
    const autos: number[] = [];
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      content += u.width;
      if (u.kind === 'space' && u.auto) autos.push(j);
      else if (u.kind === 'space') {
        spaces++;
        natural += u.width;
        widest = Math.max(widest, u.width);
      }
      const s = j < us.length - 1 && gapStretches(u, us[j + 1]!);
      stretches.push(s);
      if (s) gaps++;
    }
    let slack = measure - content;
    if (slack > FIT_EPS) {
      if (gaps > 0 || autos.length > 0) {
        if (spaces > 0) {
          // Word spaces first, up to half an em each, all set alike.
          spaceWidth = Math.max(widest, Math.min((natural + slack) / spaces, Math.max(ctx.em / 2, widest)));
          slack -= spaceWidth * spaces - natural;
          if (ctx.normalSpace > 0) spaceRatio = spaceWidth / ctx.normalSpace;
        }
        if (autos.length > 0 && slack > FIT_EPS) {
          // Then the Han–Latin spaces, up to half an em each (clreq
          // §6.2.2.4).
          const caps = autos.map((j) => Math.max(0, emOfFont(us[j]!.style.font) / 2 - us[j]!.width));
          const takes = spread(slack, caps);
          autos.forEach((j, m) => {
            if (takes[m]! <= 0) return;
            us[j] = { ...us[j]!, width: us[j]!.width + takes[m]! };
            slack -= takes[m]!;
          });
        }
        if (slack > FIT_EPS) {
          // Then every gap between characters, the Han–Latin spaces too.
          tracking = slack / (gaps + autos.length);
          if (tracking > ctx.cap + 1e-9) {
            tracking = ctx.cap;
            loose = true;
          }
          for (const j of autos) us[j] = { ...us[j]!, width: us[j]!.width + tracking };
        }
      } else if (spaces > 0) {
        // No gap between characters: the spaces take it all, as in a Latin
        // line (the renderers stretch them).
        if (ctx.normalSpace > 0) spaceRatio = (natural + slack) / spaces / ctx.normalSpace;
      } else if (us.some((u) => u.kind === 'text' && (u.firstCjk || u.lastCjk))) {
        // A CJK character with nothing to spread against.
        loose = true;
      } else {
        // Western text only (the head of a web address, a divided word): set
        // ragged, as a Latin line of one word is, and not reported.
        ragged = true;
      }
    }
  }

  const pieces: Piece[] = [];
  const addText = (u: Unit, text: string, width: number, t: number | undefined): void => {
    // Single characters (not Western runs, which keep a segment each) of
    // one style, link and spacing that advance alike share a segment.
    // A mark that gave up blank is a segment of its own: its glyph may be
    // painted before its box (`inkOffset`), and the caret spreads a
    // segment's width evenly over its characters.
    const cut = u.punct ? boxCut(u.punct) : 0;
    const key = u.stacked || u.run || u.graphemes !== 1 || cut > 0 || u.place ? undefined : `${u.style.key}|${u.link ?? ''}|${t ?? ''}`;
    const last = pieces[pieces.length - 1];
    if (key !== undefined && last && last.key === key && last.cell !== undefined && Math.abs(last.cell - width) < 1e-3) {
      last.parts.push(text);
      last.seg.width += width;
      return;
    }
    pieces.push({ seg: segmentOf(u, width, t), parts: [text], key, ...(key !== undefined ? { cell: width } : {}) });
  };
  const segmentOf = (u: Unit, width: number, t: number | undefined, grapheme = 0): PendingSegment => {
    const s = u.style;
    const ink = inkOffsetOf(u, grapheme);
    return {
      kind: 'text',
      text: '',
      width,
      bold: s.bold || undefined,
      italic: s.italic || undefined,
      ...(s.captionLabel ? { captionLabel: true } : {}),
      ...(s.script ? { script: s.script, fontString: s.scriptFont, baselineShift: s.baselineShift } : {}),
      ...(u.stacked === 'first' ? { stacked: true } : {}),
      ...(s.smallCaps ? { smallCaps: true } : {}),
      ...(t !== undefined ? { tracking: t } : {}),
      // Every mark that gave up blank carries its ink offset (0 when only
      // the blank after its glyph went), and so does a shared mark set in
      // a Chinese box, so no renderer paints its line in one run at the
      // glyphs' own advances.
      ...(ink !== undefined ? { inkOffset: ink } : {}),
    };
  };
  for (let j = 0; j < us.length; j++) {
    const u = us[j]!;
    if (u.kind === 'space' && u.auto) {
      pieces.push({ seg: { kind: 'space', text: u.text, width: u.width, autospace: true }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'space') {
      pieces.push({ seg: { kind: 'space', text: u.text, width: spaceWidth ?? u.width }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'atomic') {
      const seg = tokenSegment(u.token!);
      pieces.push({ seg, parts: [seg.text], key: undefined });
      continue;
    }
    const gap = tracking > 0 && stretches[j] ? tracking : 0;
    if (u.place && u.graphemes === 2) {
      // A pair (—— ……) set in Chinese boxes: one segment per grapheme,
      // each glyph placed in its own em.
      const cell = u.width / 2;
      pieces.push({ seg: { ...segmentOf(u, cell, undefined, 0), text: u.text[0]! }, parts: [u.text[0]!], key: undefined });
      pieces.push({ seg: { ...segmentOf(u, cell + gap, gap > 0 ? gap : undefined, 1), text: u.text[1]! }, parts: [u.text[1]!], key: undefined });
    } else if (gap === 0) {
      addText(u, u.text, u.width, undefined);
    } else if (ctx.vertical && u.run) {
      // In vertical text a run is painted whole, its cells and sideways
      // letters as it was measured: the gap after it is advance only, and
      // cutting its last letter off would lose the neighbour an apostrophe
      // or an interpunct inside it is read with (`verticalRuns`).
      addText(u, u.text, u.width + gap, undefined);
    } else if (u.graphemes <= 1) {
      addText(u, u.text, u.width + gap, gap);
    } else {
      // A run the gap follows: its last grapheme carries the gap, the rest
      // keeps its natural spacing.
      const lastG = lastGrapheme(u.text);
      const head = u.text.slice(0, u.text.length - lastG.length);
      const headWidth = textWidth(head, u.style.font, u.style.smallCaps) + (ctx.letterSpacingPx === 0 ? 0 : ctx.letterSpacingPx * (u.graphemes - 1));
      addText(u, head, headWidth, undefined);
      addText(u, lastG, u.width - headWidth + gap, gap);
    }
  }
  const segments: VDTLineSegment[] = [];
  for (const p of pieces) {
    if (p.parts.length > 1 || p.seg.text === '') p.seg.text = p.parts.join('');
    segments.push(p.seg);
  }
  const trimmed = trimChipLineEdges(segments);
  let width = 0;
  for (const s of trimmed) width += s.width;
  if (hang) {
    // The hung mark follows the line, outside its measure and its width.
    trimmed.push({ ...segmentOf(hang, hang.width, undefined), text: hang.text, hangs: true });
  }
  const text = trimmed.map((s) => s.text).join('');
  const y = li * ctx.lineHeightPx;
  return {
    text,
    bbox: createBoundingBox(ctx.indentOf(li), y, width, ctx.lineHeightPx),
    baseline: y + ctx.lineHeightPx * 0.8,
    hyphenated: range.hyphenated,
    ...(range.hyphenated && range.hardHyphen ? { hardHyphen: true } : {}),
    segments: trimmed,
    isLastLine: isLast,
    ...(spaceRatio !== undefined && !loose ? { justifiedSpaceRatio: spaceRatio } : {}),
    ...(loose ? { ragged: true, cjkLoose: true } : ragged ? { ragged: true } : {}),
    cjkComposed: true,
  };
}

/**
 * Set a Chinese, Japanese or Korean paragraph (see the module comment):
 * `options.cjkLineBreak` (else the document's level) decides where lines
 * may break; `textAlign: 'justify'` spreads every line but the last to the
 * measure. First-line and hanging indents, the block's tracking
 * (`letterSpacingPx`), other measures for later lines (`restWidths`) and a
 * positive `looseness` (one line more, for column balancing: the lines are
 * broken a little short of the measure and spread to it) are honoured;
 * Knuth–Plass options are not used.
 */
export function composeCjkParagraph(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): MeasuredBlock {
  // A writing mode asked for this paragraph alone: the Latin runs' widths
  // (`textWidth`) read it too.
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => composeCjkParagraph(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, opts));
  }
  const fonts: Fonts = { normal: normalFont, bold: boldFont, italic: italicFont, boldItalic: boldItalicFont };
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  // The composition works along the line in either writing mode; vertical
  // text keeps ：；？！ at one em (`CjkComposition.vertical`).
  const composition = compositionFor(options?.cjkComposition ?? getCjkComposition(), vertical);
  // The marks Latin text shares with Chinese take Chinese boxes in Chinese
  // text only (`routesSharedMarks`).
  const route = routesSharedMarks(composition, spans.map((s) => s.text).join(''));
  const units = prepareUnits(buildUnits(spans, fonts, letterSpacingPx, vertical, route), composition, letterSpacingPx);
  if (!units.some((u) => u.kind !== 'space')) return { lines: [], totalHeight: 0 };
  const fit = lineFitOf(composition);
  const level = options?.cjkLineBreak ?? getCjkLineBreak();
  const breaks = breakOpportunities(units, level);
  const indentPx = options?.firstLineIndentPx ?? 0;
  const hanging = options?.hangingIndent ?? false;
  const indentOf = (li: number): number => (indentPx > 0 ? (hanging ? (li === 0 ? 0 : indentPx) : (li === 0 ? indentPx : 0)) : 0);
  const measureOf = (li: number): number => lineMeasure(maxWidthPx, options?.restWidths, li) - indentOf(li);
  const sizeMatch = FONT_SIZE_RE.exec(normalFont);
  const em = sizeMatch ? parseFloat(sizeMatch[1]!) : 16;
  const trackingCap = options?.justifyTrackingPx && options.justifyTrackingPx > 0 ? Math.min(em / 2, options.justifyTrackingPx) : em / 2;
  const textAlign = options?.textAlign ?? 'left';
  const ctx: ComposeContext = {
    fonts,
    textAlign,
    letterSpacingPx,
    em,
    cap: trackingCap,
    normalSpace: textAlign === 'justify' ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0,
    lineHeightPx,
    indentOf,
    measureOf,
    ...(vertical ? { vertical: true } : {}),
    ...(fit ? { fit } : {}),
  };
  const compose = (ranges: LineRange[]): VDTLine[] => ranges.map((r, li) => composeLine(units, r, li, li === ranges.length - 1, ctx));

  let lines = compose(breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit));
  // Column balancing asks for a paragraph one line longer: break each line
  // a little short of its measure, in eighths of an em, until the paragraph
  // gains the lines without a line past the tracking cap.
  const looseness = options?.looseness ?? 0;
  if (looseness > 0) {
    const target = lines.length + looseness;
    for (let step = 1; step <= 16; step++) {
      const ranges = breakUnits(units, breaks, measureOf, (step * em) / 8, letterSpacingPx, fit);
      if (ranges.length < target) continue;
      if (ranges.length > target) break;
      const loose = compose(ranges);
      if (!loose.some((l) => l.cjkLoose)) {
        lines = loose;
        break;
      }
    }
  }
  if (lines.some((l) => l.segments?.some((s) => (s as PendingSegment).smallCaps))) {
    expandSmallCaps(lines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  }
  return { lines, totalHeight: lines.length * lineHeightPx };
}

/** Where a word that holds CJK characters may break, and its widths: see
 *  {@link cjkWordBreaks}. */
export interface CjkWordBreaks {
  /** Offsets into the word a line may break at, ascending. */
  breaks: number[];
  /** The word's advance: the sum of its units'. */
  width: number;
  /** The advance of the word's first `idx` characters. */
  widthBefore: (idx: number) => number;
}

/**
 * The breaks of one word (no breaking space inside) that holds CJK
 * characters, in a paragraph set by the word-by-word breaker (a Latin
 * paragraph quoting CJK): next to its CJK characters, under the document's
 * line-break rules. Each unit is measured once and the widths before a
 * break come from their running sums, so a long run of ideographs costs
 * linear time.
 */
export function cjkWordBreaks(word: string, font: string, smallCaps: boolean | undefined, letterSpacingPx: number, level: CjkLineBreakLevel = getCjkLineBreak()): CjkWordBreaks {
  const span: InlineSpan = { text: word, bold: false, italic: false, ...(smallCaps ? { smallCaps: true } : {}) };
  const units = buildUnits([span], { normal: font, bold: font, italic: font, boldItalic: font }, letterSpacingPx, getMeasureWritingMode() === 'vertical-rl');
  const opportunities = breakOpportunities(units, level);
  const starts: number[] = [];
  const sums: number[] = [0];
  const breaks: number[] = [];
  let total = 0;
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    starts.push(u.at);
    if (k > 0 && opportunities[k]) breaks.push(u.at);
    total += u.width;
    sums.push(total);
  }
  const widthBefore = (idx: number): number => {
    // The last unit that starts at or before `idx`.
    let lo = 0;
    let hi = starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= idx) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return 0;
    const u = units[found]!;
    const inside = idx - u.at;
    if (inside <= 0) return sums[found]!;
    if (inside >= u.text.length) return sums[found + 1]!;
    const part = u.text.slice(0, inside);
    return sums[found]! + textWidth(part, font, smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(part));
  };
  return { breaks, width: total, widthBefore };
}
