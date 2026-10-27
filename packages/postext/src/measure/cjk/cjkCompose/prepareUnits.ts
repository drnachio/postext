// Units prepared for breaking: mark pairs combined, marks shared between
// scripts routed, 2-em dashes ruled, label ends found
// (#1276: split out of cjkCompose.ts).
import { measureTextWidth, measureInkExtent, measureInkBox } from '../../canvas.js';
import { findPxSize } from '../../fontString.js';
import { type CjkClass, cjkClassOf } from '../cjkClasses.js';
import { lastGrapheme, graphemesOf } from '../../graphemes.js';
import { fontEm, measureCentralBaseline, fontFamilyOf } from '../../vertical.js';
import { isUprightMarkPair } from '../../../writing/writingMode.js';
import { type CjkComposition, isPlainComposition, punctuationBox, boxCut, shrinkPunctuation, isJlreqSpacing, compressPair, carryStopBlank } from '../cjkPunctuation.js';
import { latinSpaces, questionSpaces } from './breaks.js';
import type { Unit } from './units.js';

/** A unit's characters (a mark pair's possible neighbour). */
function isPlainTextUnit(u: Unit | undefined): u is Unit {
  return u !== undefined && u.kind === 'text' && !u.token && !u.orient && !u.ruby && !u.kunten && !u.note && !u.stacked && !u.place;
}

/**
 * Japanese vertical text: each pair of exclamation and question marks
 * (!! !? ?! ?? and ！！ ！？ ？！ ？？, JLReq §3.1.10) becomes one upright cell
 * of one em, as an author's `:tcy[…]` (`Unit.orient`), which breaks like a
 * single ！ and keeps a segment of its own (`VDTLineSegment.tcy`). The rule
 * is `isUprightMarkPair`, read over what a segment would hold: a Western
 * run that is the pair alone (`Wow!!` and `(!?)` stay one sideways run),
 * or two full-width marks of one style and link, a mark beside them of the
 * same style and link leaving all three as they are. The painters then
 * read the segment as the measurer did.
 */
export function combineMarkPairs(units: Unit[], letterSpacingPx: number): void {
  const fullwidth = (g: string): string => String.fromCodePoint(g.codePointAt(0)! + 0xFEE0);
  const pairUnit = (u: Unit, text: string, cls: CjkClass): Unit => {
    const out: Unit = {
      ...u,
      text,
      width: fontEm(u.style.font) + (letterSpacingPx === 0 ? 0 : letterSpacingPx),
      graphemes: 1,
      first: cls,
      last: cls,
      firstCjk: true,
      lastCjk: true,
      orient: 'tcy',
    };
    delete out.run;
    delete out.cellStart;
    delete out.cellEnd;
    delete out.url;
    return out;
  };
  const sameSegment = (a: Unit, b: Unit | undefined): b is Unit => isPlainTextUnit(b) && !b.run && b.style.key === a.style.key && b.link === a.link;
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    if (!isPlainTextUnit(u)) continue;
    if (u.run) {
      // A Western run that is the pair alone: its own segment.
      if (u.graphemes === 2 && /^[!?]{2}$/.test(u.text) && isUprightMarkPair([...u.text], 0, 'japan')) {
        units[k] = pairUnit(u, u.text, cjkClassOf(fullwidth(u.text[0]!)));
      }
      continue;
    }
    const v = units[k + 1];
    if (u.graphemes !== 1 || !sameSegment(u, v) || v.graphemes !== 1) continue;
    const prev = units[k - 1];
    const next = units[k + 2];
    const context = [
      ...(sameSegment(u, prev) ? [lastGrapheme(prev.text)] : []),
      u.text,
      v.text,
      ...(sameSegment(u, next) ? [graphemesOf(next.text)[0]!] : []),
    ];
    if (!isUprightMarkPair(context, sameSegment(u, prev) ? 1 : 0, 'japan')) continue;
    units.splice(k, 2, pairUnit(u, u.text + v.text, cjkClassOf(u.text)));
  }
}

/** How the marks Latin text shares with Chinese are set in a paragraph
 *  (see {@link routeSharedMarks}): in Chinese boxes (`true`, Chinese
 *  text), only its dash pairs joined (`'dashes'`, Japanese text), or as
 *  the font sets them (`false`). */
export type MarkRouting = boolean | 'dashes';

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
 * centred; an ellipsis pair (……) is set as the font sets the two
 * together and centred in its two ems, so its six dots keep one spacing,
 * and a 破折号 (——) is stretched into one rule over its two ems
 * (`dashRule`). The composition then adjusts the box as
 * it does any mark's (`cjk.punctuationWidth`). A glyph one em wide already changes
 * nothing. Next to Western text on both sides (`He said “yes”`) they keep
 * their own advance, and so do they in Japanese and Korean text (the
 * composer routes them for Chinese text only, `routesSharedMarks`). In
 * Japanese text (`dashesOnly`, #680) only a two-em dash is set here: its
 * dashes keep the advance the face gives them and are stretched into one
 * stroke, as JLReq's double dash is one mark.
 *
 * A row of dashes longer than two (a rule drawn with ――――) is cut into
 * pairs, and an odd dash at its end: each runs on into the dashes it
 * touches (`continuesDash`), so the row is one rule.
 *
 * Down a vertical line (`vertical`) every mark stands in a cell of its own
 * already; only the 破折号 is set here: the font's vertical form of a dash
 * leaves blank at both ends of its cell (Noto CJK's, 0.07 em), so the pair
 * would print as two strokes. Its dashes are stretched into one rule as in
 * horizontal text, and the renderers paint them turned with the page's
 * frame (sideways), the stretch running down the column
 * (`VDTLineSegment.inkScale`).
 */
export function routeSharedMarks(units: Unit[], letterSpacingPx: number, vertical = false, dashesOnly = false): void {
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
    // A row of dashes (――――) is one rule: a pair, or the odd dash of the
    // row, runs on into the dashes that touch it (#680).
    const joinsBefore = continuesDash(units[k - 1], u);
    const joinsAfter = continuesDash(u, units[k + 1]);
    const dashChar = !(vertical && u.orient) && (u.text[0] === '\u2014' || u.text[0] === '\u2015');
    const dash = dashChar && (u.graphemes === 2 || joinsBefore || joinsAfter);
    // Vertical text, and Japanese text in either direction: a dash pair
    // only, and not one whose orientation the author set (`:upright[…]`,
    // `:sideways[…]`).
    if ((vertical || dashesOnly) && !dash) continue;
    const b = before[k];
    const a = after[k];
    if (b !== 'cjk' && a !== 'cjk' && (b !== undefined || a !== undefined)) continue;
    const em = emOfFont(u.style.font);
    const font = u.style.font;
    let place: number[];
    // Japanese text keeps each dash the advance its face gives it, so no
    // line moves; Chinese text gives it an em.
    const cell = dashesOnly ? u.width / u.graphemes : em + letterSpacingPx;
    const rule = dash ? dashRule(u.text[0]!, font, em, cell, vertical, u.graphemes, joinsBefore, joinsAfter) : undefined;
    if (rule) {
      place = rule.place;
      if (rule.scale !== undefined) u.scale = rule.scale;
      if (rule.shift !== undefined) u.shift = rule.shift;
      if (vertical || dashesOnly) {
        // The cells keep their length along the line.
        u.place = place;
        continue;
      }
    } else if (vertical || dashesOnly) {
      // No ink metrics: each dash in its vertical form, as it was.
      continue;
    } else if (u.graphemes === 2) {
      // ……, or —— when the measurer gives no ink metrics: the pair as the
      // font sets it (a face may kern the dashes into one line), centred
      // in its two ems.
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

/** The dash a unit is made of (— or ―): a pair, or a single dash; none for
 *  a unit whose orientation the author set. */
function dashOfUnit(u: Unit | undefined): string | undefined {
  if (!u || u.orient || !isSharedMarkUnit(u)) return undefined;
  const g = u.text[0]!;
  return g === '\u2014' || g === '\u2015' ? g : undefined;
}

/** Whether the dashes of `b` go on the rule of `a`, the unit before it:
 *  the same dash in the same face, with nothing between them. */
function continuesDash(a: Unit | undefined, b: Unit | undefined): boolean {
  const g = dashOfUnit(a);
  return g !== undefined && g === dashOfUnit(b) && a!.style.font === b!.style.font && !b!.zwspBefore && a!.link === b!.link;
}

/** How far past the join each dash of a 破折号 runs, em: the two strokes
 *  overlap, so no seam shows between them at any resolution. */
const DASH_JOIN_EM = 0.02;

/**
 * A 破折号 (——) in Chinese text is one unbroken rule two ems long, on the
 * characters' centre line (GB/T 15834). Faces whose em dash is a
 * proportional Latin stroke (Noto Serif SC: 0.89 em advance, ink from 0.04
 * to 0.85 em, at the height of a Latin dash) print the pair as a short
 * rule with blank on both sides, and low. Each dash is stretched over its
 * cell (`cell`, px: an em and the block's tracking): the rule starts and
 * ends the face's own side bearing inside the pair's two cells (at most a
 * tenth of an em) and each stroke runs `DASH_JOIN_EM` past the join. Its
 * glyphs move to the centre of the ideographic em box
 * (`measureCentralBaseline`). Undefined when the measurer gives no ink
 * metrics, or when the dash already fills its em (a face whose two dashes
 * join by themselves). Down a vertical line (`vertical`) the scale is set
 * even when it is 1: it tells the renderers to paint the dash turned. A
 * unit of a longer row (#680) overlaps the dashes it touches on that side
 * by the join instead of ending the side bearing short of its cells.
 */
function dashRule(
  g: string,
  font: string,
  em: number,
  cell: number,
  vertical = false,
  /** The dashes of the unit: a pair, or the odd dash of a longer row. */
  count = 2,
  /** The rule runs on from the dashes before the unit, and into those
   *  after it: on that side it overlaps them instead of ending the face's
   *  side bearing inside its cells. */
  joinsBefore = false,
  joinsAfter = false,
): { place: number[]; scale?: number; shift?: number } | undefined {
  const ink = measureInkExtent(g, font);
  // No ink metrics, or a dash already drawn edge to edge across its em.
  if (!ink || (ink.start <= 0.01 * em && ink.end >= cell - 0.01 * em)) return undefined;
  const side = Math.min(Math.max(ink.start, 0), 0.1 * em);
  const join = DASH_JOIN_EM * em;
  // Where the unit's ink starts and ends in its cells, and the length of
  // each stroke: two strokes overlap by twice the join.
  const start = joinsBefore ? -join : side;
  const end = count * cell + (joinsAfter ? join : -side);
  const stroke = (end - start + (count - 1) * 2 * join) / count;
  const scale = stroke / (ink.end - ink.start);
  const place = count === 1 ? [start - ink.start * scale] : [start - ink.start * scale, end - stroke - cell - ink.start * scale];
  const box = measureInkBox(g, font);
  const shift = box ? (box.ascent - box.descent) / 2 - measureCentralBaseline(fontFamilyOf(font)) * em : 0;
  return {
    place,
    ...(vertical || Math.abs(scale - 1) > 1e-3 ? { scale } : {}),
    ...(Math.abs(shift) > 0.01 * em ? { shift } : {}),
  };
}

/** The em (px) of a font shorthand: its size. */
export function emOfFont(font: string): number {
  const m = findPxSize(font);
  return m ? parseFloat(m.value) : 16;
}

/** Whether a unit is a single CJK mark (a bracket, a pause, stop or
 *  interpunct mark, a dash or an ellipsis): two of them in a row never
 *  hang. */
export function isMarkUnit(u: Unit | undefined): boolean {
  if (!u || u.kind !== 'text' || u.run || !u.firstCjk) return false;
  switch (u.first) {
    case 'opening': case 'closing': case 'pause': case 'stop': case 'interpunct': case 'dash': case 'ellipsis':
      return true;
    default:
      return false;
  }
}

/** Kanji numerals a 、 or ・ is set solid between (二、三日 "two or three
 *  days", 三・一四 "3.14", JLReq §3.1.3). */
const KANJI_DIGITS = new Set('〇一二三四五六七八九十');

/** ？ and ！ (and their doubles) as Japanese sets them: full-width marks
 *  with a full-width space after them inside a paragraph. */
export const QUESTION_MARKS = new Set(['？', '！', '‼', '⁇', '⁈', '⁉']);

/** A single character unit (not a run, a ruby base, a note…) whose text is
 *  in `set`. */
export function charUnitIn(u: Unit | undefined, set: ReadonlySet<string>): boolean {
  return !!u && u.kind === 'text' && !u.run && u.graphemes === 1 && !u.ruby && !u.kunten && !u.note && !u.orient && !u.style.script && set.has(u.text);
}

/** The unit that holds the last character of a block's opening label
 *  (`MeasureBlockOptions.labelLength`, UTF-16 units of the text): the
 *  units before it and itself are the label. -1 when the text is shorter
 *  than the label. */
function labelEndUnit(units: readonly Unit[], labelLength: number): number {
  let seen = 0;
  for (let k = 0; k < units.length; k++) {
    seen += units[k]!.text.length;
    if (seen >= labelLength) return k;
  }
  return -1;
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
 * (`punctuationBox`), as its cell is in vertical text. In Japan, a 、 or
 * ・ between kanji numerals is set solid (`Unit.solid`), and with
 * `spaceAfterQuestion` a ？ or ！ takes its one-em space (`Unit.aki`).
 */
export function prepareUnits(units: Unit[], c: CjkComposition, letterSpacingPx: number, labelLength = 0, seams?: readonly number[]): Unit[] {
  const plain = isPlainComposition(c);
  // Down the line the mainland interpunct's cell is half an em already.
  if (plain && (c.region !== 'mainland' || c.vertical)) return units;
  const full = new Map<Unit, number>();
  for (const u of units) {
    if (u.kind !== 'text' || u.run || u.graphemes !== 1 || !u.firstCjk || u.style.script || u.stacked || u.orient || u.ruby || u.kunten || u.note) continue;
    if (plain && u.first !== 'interpunct') continue;
    const box = punctuationBox(u.text, u.first, u.width - letterSpacingPx, emOfFont(u.style.font), c);
    if (!box) continue;
    full.set(u, u.width);
    u.punct = box;
    u.width -= boxCut(box);
  }
  if (plain) return units;
  if (c.region === 'japan') {
    // 二、三日, 三・一四: the mark between two kanji numerals is its glyph
    // alone (JLReq §3.1.3), and the number is not broken there.
    // A heading's number is not half of a number with its title (#679):
    // the unit that ends it is where the rule stops reading. So is the
    // seam between a number and a title in a design text (#724).
    const labelEnd = labelLength > 0 ? labelEndUnit(units, labelLength) : -1;
    const seamEnds = seams?.length ? new Set(seams.filter((s) => s > 0).map((s) => labelEndUnit(units, s))) : undefined;
    for (let k = 1; k + 1 < units.length; k++) {
      const u = units[k]!;
      if (!u.punct || (u.text !== '、' && u.text !== '・')) continue;
      if (k === labelEnd || k - 1 === labelEnd) continue;
      if (seamEnds && (seamEnds.has(k) || seamEnds.has(k - 1))) continue;
      if (!charUnitIn(units[k - 1], KANJI_DIGITS) || !charUnitIn(units[k + 1], KANJI_DIGITS) || units[k + 1]!.glueBefore) continue;
      shrinkPunctuation(u.punct, u.punct.blank);
      u.width = full.get(u)! - boxCut(u.punct);
      u.solid = true;
    }
  }
  // Kaiming sets a stop's blank after the closing mark that follows it (。”␣).
  const carry = c.punctuationWidth === 'kaiming';
  const jlreq = isJlreqSpacing(c);
  if ((c.compressAdjacent || carry) && full.size > 1) {
    for (let k = 1; k < units.length; k++) {
      const a = units[k - 1]!;
      const b = units[k]!;
      if (!a.punct || !b.punct || b.zwspBefore || a.solid || b.solid) continue;
      if (c.compressAdjacent) compressPair(a.punct, b.punct, jlreq);
      if (carry) carryStopBlank(a.punct, b.punct);
      a.width = full.get(a)! - boxCut(a.punct);
      b.width = full.get(b)! - boxCut(b.punct);
    }
  }
  const spaced = (c.latinSpacing.px ?? c.latinSpacing.em ?? 0) > 0 ? latinSpaces(units, c) : units;
  return c.spaceAfterQuestion ? questionSpaces(spaced) : spaced;
}
