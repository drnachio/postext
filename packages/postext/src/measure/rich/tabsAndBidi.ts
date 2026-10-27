// Tab stops on a measured line, the kashida capacity of Arabic words, and
// the bidi levels and line directions of a paragraph
// (#1276: split out of rich.ts).
import type { TabRun } from '../tabs.js';
import type { VDTLineSegment, VDTLine } from '../../vdt.js';
import type { InlineSpan } from '../../parse/index.js';
import type { MeasureBlockOptions } from '../types.js';
import { cleanSoftHyphens, measureTextWidth } from '../canvas.js';
import { graphemeCount } from '../graphemes.js';
import { wordLetterSpacing, joiningScriptIn } from '../rtl/joining.js';
import { getMeasureDirection, getMeasureArabicNumbers, applyLineDirections } from '../rtl/bidiLines.js';
import { kashidaCapacity, TATWEEL } from '../rtl/kashida.js';
import { type BidiParagraph, needsBidi, resolveParagraph, spanIsolates } from '../../writing/bidi.js';
import { type RichToken, tokenFont, textWidth, pickSpanFont } from './tokens.js';

/** The text a tab at `at` sends to its stop (#622): the tokens after it up
 *  to the next tab or the paragraph's end, spaces at either end left out. */
export function tabRun(
  tokens: readonly RichToken[],
  at: number,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  letterSpacingPx: number,
): TabRun {
  let from = at + 1;
  while (from < tokens.length && tokens[from]!.kind === 'space' && !tokens[from]!.tab) from++;
  let to = from;
  while (to < tokens.length && !tokens[to]!.tab) to++;
  while (to > from && tokens[to - 1]!.kind === 'space') to--;
  let width = 0;
  for (let k = from; k < to; k++) width += tokens[k]!.width;
  return {
    width,
    decimalWidth: (char: string) => {
      if (char.length === 0) return undefined;
      let before = 0;
      for (let k = from; k < to; k++) {
        const t = tokens[k]!;
        const idx = t.kind === 'text' && !t.mathRender && !t.chip && !t.swatch ? t.text.indexOf(char) : -1;
        if (idx >= 0) {
          const head = cleanSoftHyphens(t.text.slice(0, idx));
          const font = tokenFont(t, normalFont, boldFont, italicFont, boldItalicFont);
          return before + textWidth(head, font, t.smallCaps) + (letterSpacingPx === 0 ? 0 : wordLetterSpacing(head, letterSpacingPx) * graphemeCount(head));
        }
        before += t.width;
      }
      return undefined;
    },
  };
}

/**
 * The segments of a line holding a tab at its stop (#622): each tab with a
 * leader becomes the tab's space up to the leader, the leader (`leader`,
 * no character of the text) and the gap after it (an empty space). In a
 * justified paragraph the word spaces after the line's last tab take the
 * slack, the line not being the paragraph's last (the renderers set the
 * line as it is: it is `ragged`); in a centred or right-aligned one an empty
 * space fills the line to its measure, so it is set from its start side as
 * its stops are.
 */
export function setTabbedLine(
  segments: VDTLineSegment[],
  lineTokens: readonly RichToken[],
  lineMaxWidth: number,
  textAlign: string,
  isLastLine: boolean,
): VDTLineSegment[] {
  const out: VDTLineSegment[] = [];
  let lastTab = -1;
  segments.forEach((seg, i) => {
    const token = lineTokens[i];
    if (token?.tab) lastTab = out.length;
    const placed = token?.tabPlaced;
    const leader = token?.tabLeader;
    const tabSeg = placed ? { ...seg, tab: { align: placed.align, at: placed.at } } : seg;
    if (!token?.tab || !leader) {
      out.push(tabSeg);
      return;
    }
    out.push({ ...tabSeg, width: Math.max(0, leader.end - leader.width) });
    out.push({ kind: 'text', text: leader.text, width: leader.width, leader: leader.rule ? 'rule' : 'text' });
    const after = seg.width - leader.end;
    if (after > 0) out.push({ kind: 'space', text: '', width: after, labelTab: true });
    lastTab = out.length - 1;
  });
  const natural = out.reduce((sum, seg) => sum + seg.width, 0);
  const slack = lineMaxWidth - natural;
  if (slack > 0.01 && textAlign === 'justify' && !isLastLine) {
    const spaces = out.map((seg, k) => (k > lastTab && seg.kind === 'space' && !seg.labelTab ? k : -1)).filter((k) => k >= 0);
    if (spaces.length > 0) {
      const share = slack / spaces.length;
      for (const k of spaces) out[k] = { ...out[k]!, width: out[k]!.width + share };
    }
  } else if (slack > 0.01 && (textAlign === 'center' || textAlign === 'right')) {
    out.push({ kind: 'space', text: '', width: slack, labelTab: true });
  }
  return out;
}

/** `spans` with their tabs (#622) set as word spaces: vertical text, and a
 *  paragraph the CJK composer sets for its ruby, warichu or kanbun marks. */
export function tabsAsSpaces(spans: readonly InlineSpan[]): InlineSpan[] {
  return spans.map((s) => {
    if (!s.tab) return s;
    const { tab: _tab, ...rest } = s;
    void _tab;
    return { ...rest, text: ' ' };
  });
}

/** Give each Arabic word of a justified paragraph its kashida capacity
 *  (`RichToken.kashida`), which Knuth–Plass counts as the stretch of its
 *  box. A word in pieces (styled runs of a Latin word, a reference label, a
 *  footnote marker) takes none. */
export function markKashidaCapacity(
  tokens: RichToken[],
  options: NonNullable<MeasureBlockOptions['kashida']>,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): void {
  for (const t of tokens) {
    if (t.kind !== 'text' || t.inserted || t.mathRender || t.swatch || t.chip || t.refResourceId !== undefined || t.footnoteId !== undefined || t.script) continue;
    if (!joiningScriptIn(t.text)) continue;
    const font = tokenFont(t, normalFont, boldFont, italicFont, boldItalicFont);
    const capacity = kashidaCapacity(t.text, options, measureTextWidth(TATWEEL, font));
    if (capacity > 0) t.kashida = capacity;
  }
}

/** A paragraph's bidi levels (UAX #9, with its inline `:rtl[…]` /
 *  `:ltr[…]` isolates), when it is set right to left, holds a
 *  right-to-left letter or sets a right-to-left isolate; undefined for any
 *  other, which is measured as it always was. */
export function paragraphBidi(spans: readonly InlineSpan[], plainText: string, options: MeasureBlockOptions | undefined): BidiParagraph | undefined {
  const base = options?.direction ?? getMeasureDirection();
  const isolated = spans.some((s) => s.direction?.dir === 'rtl');
  if (base !== 'rtl' && !isolated && !needsBidi(plainText)) return undefined;
  return resolveParagraph(plainText, base, spans.some((s) => s.direction) ? spanIsolates(spans) : undefined, getMeasureArabicNumbers() ? { arabicNumbers: true } : undefined);
}

/** The directions of a paragraph's lines (`measure/rtl/bidiLines.ts`). A piece
 *  of a segment is measured in its font. */
export function withDirections(
  lines: VDTLine[],
  bidi: BidiParagraph,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): void {
  applyLineDirections(lines, bidi, (seg, piece) =>
    textWidth(piece, seg.fontString ?? pickSpanFont(!!seg.bold, !!seg.italic, normalFont, boldFont, italicFont, boldItalicFont), false));
}
