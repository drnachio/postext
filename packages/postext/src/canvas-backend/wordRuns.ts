import { shapingTagOf } from '../hyphenation/locale.js';
import type { VDTLineSegment } from '../vdt.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { mirroredPaintActive } from './mirrorFrame.js';
import { fillTrackedWord, setLetterTracking } from './trackedText.js';
import { fillScriptWord } from './scriptText.js';
import { scriptContextUntracked } from '../measure/script.js';
import { restoreContext, saveContext, setLetterSpacing } from './contextState.js';
import { contextTextWidth } from './contextText.js';

/** One styled run of a word set as one shaped run (`VDTLineSegment.runs`). */
export type WordRun = NonNullable<VDTLineSegment['runs']>[number];

/** How far above and below the baseline a run's clip reaches: past any
 *  ascender, stacked vowel sign or descender. */
const CLIP_REACH = 4096;

const MARK_RE = /\p{M}/u;

/**
 * Paint the text of a segment set word by word with `paint` (the caller's
 * `fillText`), as the canvas paints any segment. A right-to-left segment
 * (`rtl`, bidi level odd) is painted as a right-to-left run: the context's
 * `direction` is `rtl` for it, so the browser shapes it right to left and
 * mirrors its brackets, and its `textAlign` is `left`, so the run's left
 * edge is at `x` (the page paints with `ltr`, which every other run
 * keeps). And two rules for words of a joining script (Arabic…):
 * - no letter-spacing: the line's or the block's `tracking` (the context's
 *   `letterSpacing` on entry) is lifted while the word is painted, since
 *   spacing its letters apart breaks the joins (the measurer left such a
 *   word untracked, `measure/rtl/joining.ts`);
 * - a word set in several styles (`runs`, `كتا**ب**`) is painted whole in
 *   the segment's style, then once more in each other run's style, clipped
 *   to that run's stretch of the word ({@link paintWordRuns}).
 *
 * A word of a tracked line that the browser would shape without its
 * ligatures under letter-spacing is painted with them, as it was measured
 * (`fillTrackedWord`, #663): in pieces, which a mirrored page turns back
 * as one run (#685). A right-to-left word of a script that does not join
 * (Hebrew) too, its pieces from the right end of its box (#703). A word of
 * a joining script and a word set in several styles are never painted in
 * pieces.
 *
 * A word with no letter that the layout gave a script
 * (`VDTLineSegment.scriptContext`, #725) is painted in it, beside a mark
 * of the script that is clipped away (`fillScriptWord`), whole: where it
 * could also be painted in pieces (a face that ligates `!=`), the script
 * takes it. In the Arabic script it is painted with no letter-spacing, as
 * it was measured (`scriptContextUntracked`).
 */
export function fillSegmentWord(
  ctx: CanvasRenderingContext2D,
  seg: VDTLineSegment,
  x: number,
  y: number,
  tracking: number,
  paint: (text: string, x: number, y: number) => void,
  runStyle: (run: WordRun) => { font: string; fill: string },
): void {
  inSegmentLanguage(ctx, seg, () => fillWord(ctx, seg, x, y, tracking, paint, runStyle));
}

/**
 * Run `paint`, which paints the text of `seg`, with the context in the
 * segment's language when it names one (`:ltr[…]{lang=en}`): a word of
 * such a run is painted in it, as it was measured (#764), and the context
 * gets the document's back. The language holds through the saves inside
 * (a word's clip, a mirrored page's turn: `saveContext`). Any other
 * segment, and every segment of a document shaped in the host's language,
 * is painted as the context is.
 */
export function inSegmentLanguage(ctx: CanvasRenderingContext2D, seg: VDTLineSegment, paint: () => void): void {
  if (!segmentLanguages || seg.lang === undefined || !('lang' in ctx)) {
    paint();
    return;
  }
  const context = ctx as CanvasRenderingContext2D & { lang: string };
  const language = context.lang;
  context.lang = shapingTagOf(seg.lang);
  try {
    paint();
  } finally {
    context.lang = language;
  }
}

/** Whether a segment's own language is painted (see
 *  {@link setSegmentLanguages}). */
let segmentLanguages = false;

/** Paint the segments that name a language in it from now on (`on`), or
 *  in the page's as up to postext 1.28: the page painter says which for
 *  the document it paints (`bodyText.shapingLanguage`). The same
 *  documents have the ligatures of their tracked words take the tracking
 *  of each letter (`setLetterTracking`, #770). */
export function setSegmentLanguages(on: boolean): void {
  segmentLanguages = on;
  setLetterTracking(on);
}

/** Whether a segment that names its language is painted on its own. */
export function paintsSegmentLanguage(seg: VDTLineSegment): boolean {
  return segmentLanguages && seg.lang !== undefined;
}

function fillWord(
  ctx: CanvasRenderingContext2D,
  seg: VDTLineSegment,
  x: number,
  y: number,
  tracking: number,
  paint: (text: string, x: number, y: number) => void,
  runStyle: (run: WordRun) => { font: string; fill: string },
): void {
  const untracked = tracking !== 0 && (joiningScriptIn(seg.text) || scriptContextUntracked(seg.scriptContext));
  if (untracked) setLetterSpacing(ctx, 0);
  const rtl = seg.rtl === true && 'direction' in ctx;
  const direction = rtl ? ctx.direction : undefined;
  const textAlign = rtl ? ctx.textAlign : undefined;
  if (rtl) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'left';
  }
  if (seg.scriptContext !== undefined && !seg.runs) fillScriptWord(ctx, seg.text, seg.scriptContext, rtl, x, y, paint);
  else if (tracking !== 0 && !untracked && !seg.runs) fillTrackedWord(ctx, seg.text, x, y, tracking, paint);
  else paint(seg.text, x, y);
  if (seg.runs) paintWordRuns(ctx, seg, x, y, paint, runStyle);
  if (rtl) {
    ctx.direction = direction!;
    ctx.textAlign = textAlign!;
  }
  if (untracked) setLetterSpacing(ctx, tracking);
}

/**
 * The runs of a word set in several styles, each painted over the whole
 * word (already painted in the segment's style, the context's font) in its
 * own font and colour, clipped to the stretch of the word its letters
 * occupy.
 *
 * The canvas has no way to ask where a cluster of a shaped word lies, so
 * the stretch is estimated from widths of the word's two ends: the letters
 * before a run (in reading order) occupy about the width of the whole word
 * less the width of the word from the run on, and the letters after it
 * likewise. Measured in pieces an Arabic word's letters at the cut take
 * other forms, so the bounds can be off by part of a letter; the clip
 * then cuts a letter in two colours. A run of vowel signs alone (a
 * coloured fatha) advances nothing: it is widened to its letter, which
 * takes the run's colour with it. A run in another weight is painted
 * scaled to the word's width, so its letters stay over the others. On a
 * mirrored page (`mirrorFrame.ts`) each run is turned back about the
 * word's box as it is painted, so the letters of a stretch land at the
 * other end of the box: the clip is turned with them. The
 * PDF shapes the word with HarfBuzz and colours exact clusters.
 */
export function paintWordRuns(
  ctx: CanvasRenderingContext2D,
  seg: VDTLineSegment,
  x: number,
  y: number,
  paint: (text: string, x: number, y: number) => void,
  runStyle: (run: WordRun) => { font: string; fill: string },
): void {
  const text = seg.text;
  const runs = seg.runs!;
  const whole = contextTextWidth(ctx, text);
  if (!(whole > 0)) return;
  const rtl = seg.rtl === true;
  let at = 0;
  for (const run of runs) {
    let from = at;
    at += run.text.length;
    if (!!run.bold === !!seg.bold && !!run.italic === !!seg.italic) continue;
    let to = at;
    // A cluster is a letter and its marks: widen the run to whole ones.
    while (from > 0 && MARK_RE.test(text[from]!)) from--;
    while (to < text.length && MARK_RE.test(text[to]!)) to++;
    const before = whole - contextTextWidth(ctx, text.slice(from));
    const after = whole - contextTextWidth(ctx, text.slice(0, to));
    let left = x + Math.max(0, rtl ? after : before);
    let right = x + whole - Math.max(0, rtl ? before : after);
    if (mirroredPaintActive()) [left, right] = [2 * x + whole - right, 2 * x + whole - left];
    if (right <= left) continue;
    const { font, fill } = runStyle(run);
    saveContext(ctx);
    ctx.beginPath();
    ctx.rect(left, y - CLIP_REACH, right - left, 2 * CLIP_REACH);
    ctx.clip();
    ctx.font = font;
    ctx.fillStyle = fill;
    const w = contextTextWidth(ctx, text);
    if (w > 0 && Math.abs(w - whole) > 0.01) {
      ctx.translate(x, 0);
      ctx.scale(whole / w, 1);
      paint(text, 0, y);
    } else {
      paint(text, x, y);
    }
    restoreContext(ctx);
  }
}
