// Two marks that meet, and the blanks a line gives up or keeps at its
// start and end.
import { type PunctuationBox, isMarkClass, boxCut, blankEnd, blankStart, isStop } from './box.js';
import { type CjkComposition, isJlreqSpacing } from './composition.js';

/**
 * Two marks that meet (`a` then `b`) give up the blank between them, so the
 * pair takes 1.5 em instead of 2 (clreq §6.3.2.2, the eight rules of the
 * earlier clreq drafts): a closing bracket after another or after a
 * mainland pause or stop mark (。」, not the centred marks of Taiwan and
 * Hong Kong), a pause or stop mark after a closing bracket (」，), an
 * opening bracket after any of them or after another opening one (，「
 * 》（ 「『); a quarter em between an interpunct and a closing bracket
 * before it or an opening one after it. Only the blank between the two is
 * given up — the bracket's first — and never more than takes the pair to
 * 1.5 em, so a Kaiming pair that already takes 1.5 em (。”) keeps it.
 *
 * With `jlreq` ({@link isJlreqSpacing}) the same rules give JLReq §3.1.4's
 * table: 、」 。」 」、 」。 」」 「「 solid, 、「 」「 half an em between,
 * and 」・ ・「 (and ：； in place of ・) a quarter em between: the
 * bracket's whole half em goes, the middle dot keeps its quarter.
 */
export function compressPair(a: PunctuationBox, b: PunctuationBox, jlreq = false): void {
  if (!isMarkClass(a.cls) || !isMarkClass(b.cls)) return;
  let limit = Math.max(a.em, b.em) / 2;
  let ok = false;
  if (b.cls === 'closing' && (a.cls === 'closing' || ((a.cls === 'pause' || a.cls === 'stop') && a.side === 'end'))) ok = true;
  else if (a.cls === 'closing' && (b.cls === 'pause' || b.cls === 'stop')) ok = true;
  else if (b.cls === 'opening' && a.cls !== 'interpunct') ok = true;
  else if ((a.cls === 'closing' && b.cls === 'interpunct') || (a.cls === 'interpunct' && b.cls === 'opening')) {
    ok = true;
    if (!jlreq) limit = Math.max(a.em, b.em) / 4;
  }
  if (!ok) return;
  // The pair's advance over 1.5 em: what may go.
  const over = (a.blank - boxCut(a)) + (b.blank - boxCut(b)) - Math.max(a.em, b.em) / 2;
  let want = Math.min(limit, over);
  if (want <= 1e-9) return;
  // The blank between them: a's end side, b's start side — a bracket's
  // half-em blank before a centred mark's quarter.
  const takeEnd = (box: PunctuationBox, n: number): number => {
    const t = Math.min(n, Math.max(0, blankEnd(box)));
    box.cutEnd += t;
    if (t > 0) box.pairEnd = (box.pairEnd ?? 0) + t;
    return t;
  };
  const takeStart = (box: PunctuationBox, n: number): number => {
    const t = Math.min(n, Math.max(0, blankStart(box)));
    box.cutStart += t;
    if (t > 0) box.pairStart = (box.pairStart ?? 0) + t;
    return t;
  };
  if (a.side === 'end' || a.side === 'start') {
    want -= takeEnd(a, want);
    want -= takeStart(b, want);
  } else {
    want -= takeStart(b, want);
    want -= takeEnd(a, want);
  }
}

/**
 * Under Kaiming a stop mark keeps its blank inside the line and a closing
 * mark gives its own up, so where the two meet (。” ？” 。）) the stop's half
 * em would stand between them and the quote would read as the next
 * character's. The blank goes after the closing mark instead: 。”␣, the
 * glyphs together, as full width with `compressAdjacent` sets them; the
 * pair keeps its width. A closing mark after that one takes the blank on
 * (。”）␣). The blank is still the stop's: it goes at a line end
 * ({@link lineEndTrim}), gives way with the stop marks' to take in a
 * character ({@link punctuationShrink}), and returns to the stop when the
 * line breaks between the two. Mainland marks only (in the corner of their
 * box): a centred mark keeps its blank on both sides.
 */
export function carryStopBlank(a: PunctuationBox, b: PunctuationBox): void {
  if (b.cls !== 'closing' || b.side !== 'end' || a.side !== 'end') return;
  if (!isStop(a) && !a.carry) return;
  const moved = Math.min(Math.max(0, blankEnd(a)), b.cutEnd);
  if (moved <= 1e-9) return;
  a.cutEnd += moved;
  a.pairEnd = (a.pairEnd ?? 0) + moved;
  if (a.carry) a.carry = Math.max(0, a.carry - moved);
  b.cutEnd -= moved;
  b.carry = (b.carry ?? 0) + moved;
}

/** The blank a mark gives up when it opens a line: an opening bracket or
 *  quote its start half, with `trimLineStart` (clreq §6.3.2.3). */
export function lineStartTrim(box: PunctuationBox | undefined, c: CjkComposition): number {
  if (!box || !c.trimLineStart || box.cls !== 'opening') return 0;
  return Math.max(0, blankStart(box));
}

/** The blank a mark gives up when it ends a line: every mark under
 *  `lineEndHalf` (GB/T 15834—2011 §5.1.10), the stop marks under
 *  `kaiming` (the rest are half already, but for a closing mark holding a
 *  stop's blank, {@link carryStopBlank}), a closing bracket or quote with
 *  `trimLineStart` (clreq §6.3.2.3) but in JLReq spacing, which keeps it
 *  (§3.1.9: the line gives it up only to take one more character,
 *  {@link punctuationShrink}). A centred mark gives up a quarter em each
 *  side. */
export function lineEndTrim(box: PunctuationBox | undefined, c: CjkComposition): number {
  if (!box || box.side === 'start') return 0;
  const rest = box.side === 'both' ? Math.max(0, blankStart(box)) + Math.max(0, blankEnd(box)) : Math.max(0, blankEnd(box));
  if (c.punctuationWidth === 'lineEndHalf') return rest;
  if (c.punctuationWidth === 'kaiming' && (isStop(box) || box.cls === 'closing')) return rest;
  if (c.trimLineStart && box.cls === 'closing' && !isJlreqSpacing(c)) return rest;
  return 0;
}

/** Apply the edge trims of a line to a mark: `start` from
 *  {@link lineStartTrim}, `end` from {@link lineEndTrim}. */
export function applyLineTrim(box: PunctuationBox, start: number, end: number): void {
  if (start > 0) box.cutStart += start;
  if (end <= 0) return;
  if (box.side === 'both') {
    // A centred mark gives up what it holds on both sides.
    const s = Math.min(end, Math.max(0, blankStart(box)));
    box.cutStart += s;
    box.cutEnd += end - s;
  } else box.cutEnd += end;
}

/**
 * A mark at a line edge — it opens the line (`start`), ends it (`end`) or
 * both: the blank it gave up to the mark across the break comes back, as
 * the two no longer meet (clreq §6.3.2.2 compresses marks that meet on a
 * line), then the edge trims apply ({@link lineStartTrim},
 * {@link lineEndTrim}). Changes `box`; returns the blank given up at the
 * edges less the blank that came back, px (negative when the mark grows:
 * a full-width `，` whose `「` went to the next line is one em again).
 */
export function applyLineEdges(box: PunctuationBox, c: CjkComposition, start: boolean, end: boolean): number {
  const before = boxCut(box);
  if (start) {
    if (box.pairStart) {
      box.cutStart -= box.pairStart;
      box.pairStart = 0;
    }
    if (box.carry) {
      // The stop whose blank it held ends the line before.
      box.cutEnd += box.carry;
      box.carry = 0;
    }
    applyLineTrim(box, lineStartTrim(box, c), 0);
  }
  if (end) {
    if (box.pairEnd) {
      box.cutEnd -= box.pairEnd;
      box.pairEnd = 0;
    }
    applyLineTrim(box, 0, lineEndTrim(box, c));
  }
  return boxCut(box) - before;
}

/** What {@link applyLineEdges} would give up at the edges, leaving `box`
 *  as it is. */
export function lineEdgeCut(box: PunctuationBox, c: CjkComposition, start: boolean, end: boolean): number {
  if (!(start && (box.pairStart || box.carry)) && !(end && box.pairEnd)) {
    // Nothing comes back: the trims alone (an opening mark's start trim and
    // an end trim never touch the same blank).
    return (start ? lineStartTrim(box, c) : 0) + (end ? lineEndTrim(box, c) : 0);
  }
  return applyLineEdges({ ...box }, c, start, end);
}
