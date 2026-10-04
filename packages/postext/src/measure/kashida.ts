/**
 * Kashida justification (#375, arabic-typography §3). A justified line of
 * Arabic text is not letter-spaced (its letters join); it is stretched in
 * its word spaces and by elongating joins inside words, with tatweels
 * (U+0640, ـ) inserted between two connected letters. Fonts draw a run of
 * them as one stroke (Amiri's `rlig` turns one to seven into a curved
 * kashida of that length), so a kashida comes in whole tatweels.
 *
 * Two stages:
 * - Breaking: each Arabic word box carries its kashida capacity as stretch
 *   (`kashidaCapacity`: points × the longest elongation a point may take),
 *   so Knuth–Plass knows a line of Arabic words can widen there and picks
 *   its breaks accordingly.
 * - Setting (`justifyLinesWithKashida`): once the breaks are made, every
 *   justified line but the last fills its slack with tatweels first — one
 *   whole tatweel at a time, best points first, round after round, each
 *   word measured again whole with its tatweels — and leaves the remainder,
 *   less than one tatweel, to its word spaces, which renderers widen as on
 *   any justified line. So the word spaces keep close to their natural
 *   width, the Naskh norm.
 *
 * Where the points are and how good they are: `kashidaPatterns.ts` (the
 * raqim-kashida rules). One point per word by default (`perWord`), the
 * best-ranked one, the later of two that rank alike ("towards the end of
 * the word", the Microsoft rule). A word holding a tatweel the author typed
 * is elongated there and nowhere else.
 *
 * The inserted tatweels are in the segment's text, so every renderer paints
 * them as text, shaped with the word; `VDTLineSegment.kashida` lists where
 * they are, so plain text, source maps, links and extraction leave them out
 * (`writtenText`), and `VDTLine.kashida` counts them.
 */

import type { VDTLine, VDTLineSegment } from '../vdt';
import { findKashidaPoints, kashidaPatternSet, type KashidaPatternSetName } from './kashidaPatterns';
import { joiningScriptIn } from './joining';
import { joiningTypeOf } from '../bidi';
import { RAGGED_SPACE_RATIO } from '../knuthPlass/constants';
import type { ResolvedBodyTextConfig } from '../types';
import { resolvedKashida } from '../defaults/bodyText';

export const TATWEEL = 'ـ';

/** Kashida justification as the measurer applies it
 *  (`MeasureBlockOptions.kashida`). */
export interface KashidaOptions {
  patterns: KashidaPatternSetName;
  /** Most points elongated in one word. */
  perWord: number;
  /** Longest elongation at one point, px (whole tatweels within it). */
  maxLengthPx: number;
}

/** The pattern set a body font takes when `kashidaPatterns` is `'auto'`:
 *  none for a Ruqʿa or Dīwānī face, whose letters do not elongate (Aref
 *  Ruqaa); the Nastaʿlīq rules for a Nastaʿlīq face; Naskh otherwise. */
export function patternsForFont(fontFamily: string): KashidaPatternSetName | undefined {
  if (/ruq[ʿ']?a|diwani|dīwānī/i.test(fontFamily)) return undefined;
  if (/nasta[ʿ']?l[iī]q/i.test(fontFamily)) return 'nastaliq';
  return 'naskh';
}

/** The measurer's kashida options for text set in `fontString` at
 *  `fontSizePx` under `bodyText`, or `undefined` when it takes none
 *  (kashida off, or a face whose letters do not elongate). */
export function kashidaMeasureOptions(
  bodyText: Pick<ResolvedBodyTextConfig, 'kashida' | 'kashidaPatterns' | 'kashidaPerWord' | 'kashidaMaxLength'>,
  fontString: string,
  fontSizePx: number,
): KashidaOptions | undefined {
  const k = resolvedKashida(bodyText);
  if (!k) return undefined;
  const patterns = k.patterns === 'auto' ? patternsForFont(fontString) : k.patterns;
  if (!patterns || k.maxLength <= 0) return undefined;
  return { patterns, perWord: k.perWord, maxLengthPx: k.maxLength * fontSizePx };
}

/** A point chosen in a word: where the tatweels go (UTF-16 offset in the
 *  word as written) and its rank. */
interface ChosenPoint {
  offset: number;
  priority: number;
}

const chosenCache = new Map<string, readonly ChosenPoint[]>();
const CHOSEN_CACHE_LIMIT = 20000;

/** Whether `text[i]` is a tatweel the author typed as an elongation: one
 *  that carries no mark (a tatweel under a mark seats it). */
function bareTatweelAt(text: string, i: number): boolean {
  if (text[i] !== TATWEEL) return false;
  const next = text.codePointAt(i + 1);
  return next === undefined || joiningTypeOf(next) !== 'T';
}

/** The points of `word` that take its kashidas, best first: at most
 *  `perWord`, ranked by priority and, between equals, the later one. A word
 *  with a tatweel the author typed takes it alone (after the run it
 *  starts). */
export function chosenKashidaPoints(word: string, patterns: KashidaPatternSetName, perWord: number): readonly ChosenPoint[] {
  const key = `${patterns}${perWord}\x00${word}`;
  const hit = chosenCache.get(key);
  if (hit) return hit;
  let out: ChosenPoint[];
  const typed = word.indexOf(TATWEEL);
  let bare = -1;
  for (let i = typed; i >= 0 && i < word.length; i = word.indexOf(TATWEEL, i + 1)) {
    if (bareTatweelAt(word, i)) {
      bare = i;
      break;
    }
  }
  if (bare >= 0) {
    let end = bare;
    while (word[end] === TATWEEL) end++;
    out = [{ offset: end, priority: 9 }];
  } else {
    const all = findKashidaPoints(word, kashidaPatternSet(patterns));
    all.sort((a, b) => b.priority - a.priority || b.offset - a.offset);
    out = [];
    for (const p of all) {
      if (out.length >= perWord) break;
      if (!out.some((q) => q.offset === p.offset)) out.push({ offset: p.offset, priority: p.priority });
    }
  }
  if (chosenCache.size >= CHOSEN_CACHE_LIMIT) chosenCache.clear();
  chosenCache.set(key, out);
  return out;
}

/** Whether a segment is a word kashida may elongate: Arabic-script text,
 *  not a reference label, a footnote marker, a chip, a formula or
 *  characters the layout added. */
function elongatable(seg: VDTLineSegment): boolean {
  return seg.kind === 'text' && !seg.inserted && seg.refResourceId === undefined && seg.footnoteId === undefined
    && !seg.chip && !seg.mathRender && joiningScriptIn(seg.text);
}

/** How far kashidas can widen a word (px): its points times the whole
 *  tatweels one point may take, `tatweelPx` each. 0 for a word with no
 *  point (Latin, digits, a lone letter). The breaker's stretch of the
 *  word's box. */
export function kashidaCapacity(word: string, options: KashidaOptions, tatweelPx: number): number {
  if (tatweelPx <= 0 || !joiningScriptIn(word)) return 0;
  const units = Math.floor(options.maxLengthPx / tatweelPx + 1e-6);
  if (units <= 0) return 0;
  return chosenKashidaPoints(word, options.patterns, options.perWord).length * units * tatweelPx;
}

/** A segment's text as written: its text without the tatweels kashida
 *  justification inserted (see `VDTLineSegment.kashida`). */
export function writtenText(seg: Pick<VDTLineSegment, 'text' | 'kashida'>): string {
  const at = seg.kashida;
  if (!at || at.length === 0) return seg.text;
  let out = '';
  let k = 0;
  for (let i = 0; i < seg.text.length; i++) {
    if (k < at.length && at[k] === i) {
      k++;
      continue;
    }
    out += seg.text[i];
  }
  return out;
}

/** Insert one tatweel at `offset` (in the text as it now stands) into a
 *  segment: its text, its styled runs and its inserted offsets. */
function withTatweel(seg: VDTLineSegment, offset: number): VDTLineSegment {
  const text = seg.text.slice(0, offset) + TATWEEL + seg.text.slice(offset);
  const kashida = [...(seg.kashida ?? []).map((o) => (o >= offset ? o + 1 : o)), offset].sort((a, b) => a - b);
  let runs = seg.runs;
  if (runs) {
    // The tatweel joins the run of the letter before it.
    let pos = 0;
    let placed = false;
    runs = runs.map((r) => {
      const start = pos;
      pos += r.text.length;
      if (placed || offset <= start || offset > pos) return r;
      placed = true;
      return { ...r, text: r.text.slice(0, offset - start) + TATWEEL + r.text.slice(offset - start) };
    });
  }
  return { ...seg, text, kashida, ...(runs ? { runs } : {}) };
}

interface Candidate {
  seg: number;
  /** Offset in the segment's text as written. */
  offset: number;
  priority: number;
  /** Tatweels inserted so far, and the most it may take. */
  count: number;
  max: number;
  done: boolean;
}

/**
 * Fill `width` px of slack on a line's segments with kashidas: whole
 * tatweels, one at a time, the best points first and round after round (a
 * second tatweel on a point only once every point that could take one has
 * one), each word measured again whole (`widthOf`) after each, and none
 * that would overfill the slack. Returns the segments (copies where
 * elongated) and how many tatweels went in, or null when none did.
 */
export function distributeKashida(
  segments: readonly VDTLineSegment[],
  width: number,
  options: KashidaOptions,
  widthOf: (seg: VDTLineSegment, text: string) => number,
): { segments: VDTLineSegment[]; added: number; count: number } | null {
  if (width <= 0) return null;
  const cands: Candidate[] = [];
  const tatweel = new Map<number, number>();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (!elongatable(seg)) continue;
    const pts = chosenKashidaPoints(writtenText(seg), options.patterns, options.perWord);
    if (pts.length === 0) continue;
    const unit = widthOf(seg, TATWEEL);
    const max = unit > 0 ? Math.floor(options.maxLengthPx / unit + 1e-6) : 0;
    if (max <= 0) continue;
    tatweel.set(i, unit);
    for (const p of pts) cands.push({ seg: i, offset: p.offset, priority: p.priority, count: 0, max, done: false });
  }
  if (cands.length === 0) return null;
  // Best first; between equals, the one nearer the line's end.
  cands.sort((a, b) => b.priority - a.priority || b.seg - a.seg || b.offset - a.offset);

  const out = segments.slice();
  let remaining = width;
  let count = 0;
  const EPS = 1e-6;
  for (let progressed = true; progressed;) {
    progressed = false;
    for (const c of cands) {
      if (c.done || c.count >= c.max) continue;
      if (tatweel.get(c.seg)! > remaining + EPS) continue;
      const seg = out[c.seg]!;
      // Where the point stands in the text now: past the tatweels already
      // inserted before it, and after this point's own.
      let at = c.offset;
      for (const o of seg.kashida ?? []) if (o < at) at++;
      const next = withTatweel(seg, at);
      const w = widthOf(next, next.text);
      const delta = w - seg.width;
      if (delta <= 0 || delta > remaining + EPS) {
        c.done = true;
        continue;
      }
      out[c.seg] = { ...next, width: w };
      remaining -= delta;
      c.count++;
      count++;
      progressed = true;
    }
  }
  return count > 0 ? { segments: out, added: width - remaining, count } : null;
}

/** How far a line's word spaces widen before its kashidas take the rest
 *  of its slack: a quarter of their width, alreq's and Nemeth's advice to
 *  combine both levers (spaces alone open rivers, kashidas alone crowd the
 *  line with elongations). Whatever the kashidas leave, under one tatweel,
 *  goes to the spaces too. */
const SPACE_SHARE = 1.25;

/**
 * Kashida justification of a paragraph's lines (see the module comment):
 * every justified line but the last one, with its slack against
 * `lineWidth(i)` (the measure less its indent), takes its kashidas, then
 * its word spaces are measured again (`justifiedSpaceRatio`). A line whose
 * spaces would still stretch past the point where the pipeline sets it
 * ragged (`raggedLooseLines`) is left as it is, ragged lines take none.
 * Lines are replaced, never mutated.
 */
export function justifyLinesWithKashida(
  lines: VDTLine[],
  lineWidth: (index: number) => number,
  normalSpaceWidth: number,
  options: KashidaOptions,
  widthOf: (seg: VDTLineSegment, text: string) => number,
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.isLastLine || line.ragged || !line.segments || line.wordOverflow) continue;
    const target = lineWidth(i);
    const natural = line.segments.reduce((s, seg) => s + seg.width, 0);
    // The word spaces open up a little first (to `SPACE_SHARE` of their
    // width); the kashidas take what is beyond.
    const spaceCount = line.segments.reduce((n, seg) => n + (seg.kind === 'space' ? 1 : 0), 0);
    const spaceShare = spaceCount * normalSpaceWidth * (SPACE_SHARE - 1);
    const done = distributeKashida(line.segments, target - natural - spaceShare, options, widthOf);
    if (!done) continue;
    let words = 0;
    let spaces = 0;
    for (const seg of done.segments) {
      if (seg.kind === 'space') spaces++;
      else words += seg.width;
    }
    const ratio = spaces > 0 && normalSpaceWidth > 0 ? (target - words) / spaces / normalSpaceWidth : undefined;
    // Without the kashidas the pipeline would set this line ragged; it
    // still would with them: leave it to that.
    if (ratio !== undefined && ratio > RAGGED_SPACE_RATIO) continue;
    lines[i] = {
      ...line,
      segments: done.segments,
      bbox: { ...line.bbox, width: natural + done.added },
      ...(ratio !== undefined ? { justifiedSpaceRatio: ratio } : {}),
      kashida: done.count,
    };
  }
}
