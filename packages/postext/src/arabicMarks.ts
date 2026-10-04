/**
 * Arabic vowel marks (ḥarakāt, tashkīl) in a laid-out document (#376).
 *
 * The marks a vocalised text carries (fatḥa, ḍamma, kasra, tanwīn, sukūn,
 * shadda, the dagger alef, the Qurʾānic annotation signs) stack over and
 * under the letters, so the ink of a vocalised line reaches far past the
 * letters' own ascenders and descenders: a shadda with a fatḥa over a lām
 * stands about 1.3 em above the baseline in Amiri, a kasra under a final yāʾ
 * hangs about 0.7 em under it. The line pitch never changes for them, as
 * for the Chinese marks (`cjkMarks.ts`): they live in the leading. Two
 * things follow from that.
 *
 * - The renderers clip each column to its box (`columnClipRect`). The
 *   first line of a column may hold marks that rise above the column's top
 *   and the last one marks that hang under its foot; the clip takes them
 *   in. A line holding marks carries how far its ink reaches
 *   (`VDTLine.markInk`), measured once here, so every renderer reads the
 *   same extent without measuring (the PDF backend has no canvas).
 * - Where the marks of one line meet the ink of the line above or below,
 *   the paragraph is reported (`arabicMarksExceedLeading`). Two lines are
 *   compared word by word: a mark over a word of the lower line only
 *   collides with what hangs under the words of the upper line standing
 *   above it, which keeps tall marks on an alif from being reported against
 *   a descender at the other end of the line. Ink boxes are what the
 *   measurer gives (`TextMetrics.actualBoundingBox*`); without them (no
 *   canvas metrics) a word's box is estimated from its size and from the
 *   marks it holds.
 *
 * A document without vowel marks is looked at once per line (one regular
 * expression test) and left as it was.
 */

import type { ContentWarning, VDTBlock, VDTDocument, VDTLine } from './vdt';
import { measureInkBox } from './measure/canvas';
import { fontEm } from './measure/vertical';
import { segmentFont, segmentPositions } from './cjkMarks';

/** The combining marks of Arabic vocalisation and Qurʾānic annotation:
 *  the honorific and Qurʾānic signs U+0610–U+061A, the ḥarakāt and their
 *  extensions U+064B–U+065F, the superscript (dagger) alef U+0670, the
 *  small high and low Qurʾānic marks U+06D6–U+06ED (the symbols and
 *  letters among them left out: U+06DD end of āya, U+06DE rubʿ el-ḥizb,
 *  U+06E5–U+06E6 small wāw and yāʾ, U+06E9 place of sajda), and the
 *  extended Arabic marks U+08CA–U+08FF (U+08E2, a format character, left
 *  out). */
export const ARABIC_MARK_RE = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ࣊-ࣣ࣡-ࣿ]/;

/** The marks among {@link ARABIC_MARK_RE} set under the letter: kasra,
 *  kasratan, hamza below, subscript alef, the dots and small letters below
 *  of other orthographies, the low Qurʾānic signs. */
const ARABIC_MARK_BELOW_RE = /[ٍِٕٖٜٟۣ۪ۭ࣏࣍-࣒ࣣࣦࣩ࣭-࣯ࣶࣹࣺ]/;

/** Arabic-script letters (and marks): what is estimated as Arabic. */
const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿࡰ-ࣿﭐ-﷿ﹰ-﻿]/;

/** Whether `text` holds an Arabic vowel or Qurʾānic mark. */
export function hasArabicMarks(text: string): boolean {
  return ARABIC_MARK_RE.test(text);
}

/**
 * Estimated ink of a word when the measurer gives no ink metrics, in em
 * of its font, above and below the baseline. Arabic letters: the Naskh
 * ascender of alif and lām and the descenders of rāʾ, nūn and yāʾ (about
 * the typographic ascender and descender of Noto Naskh Arabic, 1.07 and
 * 0.63 em, less the room those keep for marks); a mark over a letter adds
 * about a third of an em above it, one under it a fifth below. With the
 * marks of both sides the box is 1.75 em tall, Amiri's line spacing:
 * fully vocalised text set solid at that leading touches. Any other text:
 * a Latin face's ascender and descender.
 */
const ESTIMATE = {
  arabicAscent: 0.8,
  arabicDescent: 0.45,
  markAbove: 0.3,
  markBelow: 0.2,
  latinAscent: 0.75,
  latinDescent: 0.25,
} as const;

/** How far a word's ink reaches above and below the baseline, px. */
interface Ink {
  ascent: number;
  descent: number;
}

/** Ink boxes measured, per font and text (cleared with each document's
 *  annotation pass: fonts may have changed between builds). */
let inkCache = new Map<string, Ink>();
const MAX_INK_ENTRIES = 50_000;

/** The ink box of `text` set in `font`, px above and below the baseline:
 *  measured, else estimated (see `ESTIMATE`). */
export function inkBoxOf(text: string, font: string): Ink {
  const key = `${font}\u0000${text}`;
  const cached = inkCache.get(key);
  if (cached) return cached;
  if (inkCache.size >= MAX_INK_ENTRIES) inkCache = new Map();
  let ink: Ink | null = measureInkBox(text, font);
  if (!ink) {
    const em = fontEm(font);
    const marks = hasArabicMarks(text);
    if (ARABIC_SCRIPT_RE.test(text)) {
      ink = {
        ascent: em * (ESTIMATE.arabicAscent + (marks && aboveMark(text) ? ESTIMATE.markAbove : 0)),
        descent: em * (ESTIMATE.arabicDescent + (marks && ARABIC_MARK_BELOW_RE.test(text) ? ESTIMATE.markBelow : 0)),
      };
    } else {
      ink = { ascent: em * ESTIMATE.latinAscent, descent: em * ESTIMATE.latinDescent };
    }
  }
  inkCache.set(key, ink);
  return ink;
}

/** Whether `text` holds a mark set over its letter. */
function aboveMark(text: string): boolean {
  for (const ch of text) if (ARABIC_MARK_RE.test(ch) && !ARABIC_MARK_BELOW_RE.test(ch)) return true;
  return false;
}

/** A word of a line: where it is painted along the line, its ink, and
 *  whether it holds a vowel mark. */
interface WordInk {
  x0: number;
  x1: number;
  ascent: number;
  descent: number;
  marked: boolean;
}

type BlockLike = Parameters<typeof segmentPositions>[1];

/** The words of a line with their ink, at the x the renderers paint them
 *  (the flow order `VDTLine.order` followed when the line has one). Spaces,
 *  formulas, chips and swatches hold no Arabic and are left out. */
export function lineWordInks(line: VDTLine, block: BlockLike): WordInk[] {
  const segments = line.segments;
  if (!segments || segments.length === 0) {
    if (!line.text.trim()) return [];
    const ink = inkBoxOf(line.text, block.fontString);
    return [{ x0: line.bbox.x, x1: line.bbox.x + line.bbox.width, ...ink, marked: hasArabicMarks(line.text) }];
  }
  const { xs, widths } = segmentPositions(line, block);
  const at = xs.slice();
  if (line.order && line.order.length === segments.length) {
    let x = xs[0] ?? line.bbox.x;
    for (const i of line.order) {
      at[i] = x;
      x += widths[i]!;
    }
  }
  const out: WordInk[] = [];
  segments.forEach((seg, i) => {
    if (seg.kind !== 'text' || !seg.text.trim()) return;
    const ink = inkBoxOf(seg.text, segmentFont(seg, block));
    const shift = seg.baselineShift ?? 0;
    out.push({
      x0: at[i]!,
      x1: at[i]! + widths[i]!,
      ascent: ink.ascent - shift,
      descent: ink.descent + shift,
      marked: hasArabicMarks(seg.text),
    });
  });
  return out;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Two lines' ink may touch by this much (px) before they are reported:
 *  antialiasing, not a collision. */
const TOUCH_PX = 0.5;

/**
 * Set `VDTLine.markInk` on every line of the document that holds an
 * Arabic vowel mark, and report the paragraphs where those marks meet the
 * ink of a neighbouring line of their column (`arabicMarksExceedLeading`,
 * once per paragraph, on the lower line's paragraph). See the module
 * comment.
 */
export function annotateArabicMarks(doc: VDTDocument): ContentWarning[] {
  // The document's vowel marks: none, and nothing is done.
  let any = false;
  for (const block of doc.blocks) {
    if (block.type === 'resource' || !block.lines) continue;
    if (block.lines.some((l) => hasArabicMarks(l.text))) {
      any = true;
      break;
    }
  }
  if (!any) return [];
  inkCache = new Map();
  /** Lines of the columns that hold a marked line, with their words. */
  const columns = new Map<string, { line: VDTLine; block: VDTBlock; words: WordInk[]; em: number }[]>();
  const marked = new Set<string>();
  for (const block of doc.blocks) {
    if (block.type === 'resource' || block.designOverlay || block.hidden || !block.lines) continue;
    for (const line of block.lines) {
      if (!hasArabicMarks(line.text)) continue;
      const words = lineWordInks(line, block);
      let above = 0;
      let below = 0;
      for (const w of words) {
        if (!w.marked) continue;
        above = Math.max(above, w.ascent);
        below = Math.max(below, w.descent);
      }
      if (above > 0 || below > 0) line.markInk = { above: round(above), below: round(below) };
      if (block.pageIndex >= 0) marked.add(`${block.pageIndex}:${block.columnIndex}`);
    }
  }
  for (const block of doc.blocks) {
    if (block.type === 'resource' || block.designOverlay || block.hidden || !block.lines || block.pageIndex < 0) continue;
    const key = `${block.pageIndex}:${block.columnIndex}`;
    if (!marked.has(key)) continue;
    let column = columns.get(key);
    if (!column) columns.set(key, (column = []));
    const em = fontEm(block.fontString);
    for (const line of block.lines) column.push({ line, block, words: lineWordInks(line, block), em });
  }

  const warnings: ContentWarning[] = [];
  const reported = new Set<VDTBlock>();
  for (const column of columns.values()) {
    column.sort((a, b) => a.line.baseline - b.line.baseline);
    for (let i = 1; i < column.length; i++) {
      const a = column[i - 1]!;
      const b = column[i]!;
      if (reported.has(b.block)) continue;
      const pitch = b.line.baseline - a.line.baseline;
      if (pitch <= 0) continue;
      let need = 0;
      for (const lower of b.words) {
        for (const upper of a.words) {
          if (!lower.marked && !upper.marked) continue;
          if (Math.min(lower.x1, upper.x1) - Math.max(lower.x0, upper.x0) <= 0) continue;
          need = Math.max(need, lower.ascent + upper.descent);
        }
      }
      if (need <= pitch + TOUCH_PX) continue;
      reported.add(b.block);
      const block = b.block;
      const sourceStart = block.sourceStart ?? block.lines[0]?.sourceStart;
      warnings.push({
        kind: 'arabicMarksExceedLeading',
        text: b.line.text,
        lineHeightEm: round(pitch / b.em),
        neededEm: round(need / b.em),
        ...(sourceStart !== undefined ? { sourceStart } : {}),
        ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
        pageIndex: block.pageIndex,
      });
    }
  }
  return warnings;
}

/** How far the vowel marks of a column's lines reach above `y0` (its top)
 *  and below `y1` (its foot), px (`VDTLine.markInk`; 0 when they stay
 *  inside). */
export function markInkOverhang(blocks: readonly VDTBlock[], y0: number, y1: number): [number, number] {
  let above = 0;
  let below = 0;
  for (const block of blocks) {
    if (block.hidden || !block.lines) continue;
    for (const line of block.lines) {
      const ink = line.markInk;
      if (!ink) continue;
      above = Math.max(above, y0 - (line.baseline - ink.above));
      below = Math.max(below, line.baseline + ink.below - y1);
    }
  }
  return [above, below];
}
