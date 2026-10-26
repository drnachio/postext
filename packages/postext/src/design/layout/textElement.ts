// layoutTextElement with the width-by-line wrapping, syllable fill and
// justification it uses (#1276: split out of layout.ts).
import { flowTextWidth, getMeasureWritingMode, lineBaselineOffset } from '../../measure/vertical.js';
import type { ResolvedDesignTextElement, ResolvedChipStyleConfig, DesignTextAlign } from '../../types.js';
import { resolveTextDots } from '../../paint/textDots.js';
import { resolveDesignLineHeight } from '../../defaults/structure/headerFooter.js';
import { buildFontString } from '../../measure/index.js';
import { graphemeCount } from '../../measure/graphemes.js';
import { joiningScriptIn } from '../../measure/rtl/joining.js';
import type { InlineSpan } from '../../parse/types.js';
import { withoutSlashJoints, hyphenateText } from '../../hyphenation/hyphenate.js';
import { withLineEndHyphen } from '../../measure/geminate.js';
import { BREAKING_SPACE_RUNS_SPLIT_RE, isBreakingSpaceRun } from '../../measure/spaces.js';
import { hasJoiningScript, joinsWithNext } from '../../writing/bidi.js';
import { measuresRunsAsPainted, directedTextWidth, designBaseDirection, directRuns, paintedRunWidth } from '../bidiText.js';
import { type CjkDesignFonts, composesDesignAsCjk, composeCjkDesignParagraph } from '../cjkText.js';
import { type DesignTextRun, parseRichDesignText, RichMeasurer, richFontSet, richDesignSpans, wrapRich } from '../richText.js';
import { repeatLine } from './elements.js';
import { dimPx, type AnchorResult, type AnchorReference, resolveBox, resolveFixedSize, fillToContainerEdge, fillToContainerEdgeY, edgeXFromPin, edgeYFromPin } from './geometry.js';
import { type ResolvedTextPrimitive, type ResolvedPadding, colorHex, type WrappedLine } from './primitives.js';
import { type TextMeasure, SOFT_HYPHEN, breakWordWithHyphenation, type TextMeasurement, trailingTracking, layoutCjkRows, layoutRichText, layoutText, textVerticalOffset } from './text.js';

/** A syllable break of `word` whose head, with its hyphen, still fits after
 *  `line` in `maxWidth`: the longest such head, or undefined. Used to fill
 *  a justified line (EF-109). */
function syllableFill(line: string, word: string, measure: TextMeasure, maxWidth: number): { head: string; tail: string } | undefined {
  if (hasJoiningScript(word)) return undefined;
  const hy = withoutSlashJoints(word, hyphenateText(word));
  if (!hy.includes(SOFT_HYPHEN) || hy.split(SOFT_HYPHEN).join('') !== word) return undefined;
  const parts = hy.split(SOFT_HYPHEN);
  let best: { head: string; tail: string } | undefined;
  for (let k = 1; k < parts.length; k++) {
    const head = withLineEndHyphen(parts.slice(0, k).join(''));
    if (measure(line + head) > maxWidth) break;
    best = { head, tail: parts.slice(k).join('') };
  }
  return best;
}

/** Greedy wrap of one paragraph where every line may have its own width
 *  (`widthFor(lineIndex)`), preserving existing line breaks. With `fill`
 *  (a justified text that hyphenates), a word that does not fit the rest
 *  of a line is cut at its last syllable break that does. */
function wrapWithWidths(text: string, measure: TextMeasure, widthFor: (i: number) => number, hyphenate: boolean, startLine = 0, fill = false, cuts?: ('syllable' | 'character' | undefined)[]): string[] {
  const out: string[] = [];
  let i = startLine;
  for (const para of text.split('\n')) {
    // Words part at breaking spaces only: a no-break space glues (EF-66).
    const words = para.split(BREAKING_SPACE_RUNS_SPLIT_RE);
    let current = '';
    let maxWidth = Math.max(1, widthFor(i));
    const flush = () => { out.push(current); current = ''; i++; maxWidth = Math.max(1, widthFor(i)); };
    for (const part of words) {
      const test = current + part;
      if (measure(test) <= maxWidth || (current.length === 0 && (part === '' || isBreakingSpaceRun(part)))) {
        current = test;
      } else if (current.length === 0) {
        let remaining = part;
        while (remaining.length > 0) {
          if (measure(remaining) <= maxWidth) { current = remaining; break; }
          const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
          if (!split || split.head.length === 0) { current = remaining; break; }
          current = split.head; flush();
          if (cuts) cuts[out.length - 1] = split.divided;
          remaining = split.tail;
        }
      } else {
        const word = part.trimStart();
        const cut = fill && hyphenate ? syllableFill(current, word, measure, maxWidth) : undefined;
        if (cut) {
          current += cut.head;
          flush();
          current = cut.tail;
        } else {
          flush();
          current = word;
        }
        if (measure(current) > maxWidth) {
          let remaining = current; current = '';
          while (remaining.length > 0) {
            if (measure(remaining) <= maxWidth) { current = remaining; break; }
            const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
            if (!split || split.head.length === 0) { current = remaining; break; }
            current = split.head; flush();
            if (cuts) cuts[out.length - 1] = split.divided;
            remaining = split.tail;
          }
        }
      }
    }
    out.push(current.trimEnd());
    i++;
    maxWidth = Math.max(1, widthFor(i));
  }
  return out;
}

/** The share of a letter's size its capitals take, for a drop cap's
 *  default size (the faces' own cap heights are not measured). */
const CAP_HEIGHT_RATIO = 0.72;

/** The spaces a justified line stretches: those CSS `word-spacing` widens
 *  (U+0020 and the no-break space U+00A0). */
const STRETCHABLE_SPACE_RE = /[ \u00A0]/g;
/** A line cut after each run of stretchable spaces. */
const WORD_WITH_SPACES_RE = /[^ \u00A0]+[ \u00A0]*|[ \u00A0]+/g;

function stretchableSpaces(text: string): number {
  return text.match(STRETCHABLE_SPACE_RE)?.length ?? 0;
}

/**
 * A wrapped line justified to `width` (EF-109): its word spaces stretched
 * by the same amount so the line ends at the right edge of its room. The
 * line is cut into runs after every space, each run's width taking its
 * spaces' share of the stretch, so the canvas and PDF paint it by advancing
 * run by run; `wordSpacingPx` gives the HTML its `word-spacing`. Runs of
 * inline marks are cut the same way, keeping their fonts; a subscript and
 * a superscript set over each other are left whole. A line with no space
 * to stretch, or already as wide as its room, is returned as it is (its
 * trailing spaces dropped).
 */
function justifyLine(
  line: { text: string; width: number; runs?: DesignTextRun[] },
  width: number,
  measure: TextMeasure,
  measureIn: (text: string, font: string) => number,
  font: string,
): { text: string; width: number; runs?: DesignTextRun[]; wordSpacingPx?: number } {
  // Trailing spaces (a plain wrapped line may keep them) are not stretched.
  let runs = line.runs;
  let text = line.text;
  let natural = line.width;
  if (!runs && /[ \u00A0]+$/.test(text)) {
    text = text.replace(/[ \u00A0]+$/, '');
    natural = measure(text);
  }
  const pieces: DesignTextRun[] = runs ?? [{ text, fontString: font, width: natural }];
  // A run the author oriented in vertical text is never cut at its spaces.
  const splittable = (i: number): boolean => !pieces[i]!.stacked && !pieces[i - 1]?.stacked && !pieces[i]!.tcy && !pieces[i]!.orientation && !pieces[i]!.chip;
  let spaces = 0;
  pieces.forEach((r, i) => { if (splittable(i)) spaces += stretchableSpaces(r.text); });
  const room = width - natural;
  if (spaces === 0 || room <= 0.01) return runs ? line : { text, width: natural };
  const extra = room / spaces;
  const out: DesignTextRun[] = [];
  pieces.forEach((r, i) => {
    if (!splittable(i)) { out.push(r); return; }
    const words = r.text.match(WORD_WITH_SPACES_RE) ?? [r.text];
    let sum = 0;
    words.forEach((w, k) => {
      // The last piece keeps what kerning across the cuts leaves, so the
      // run as a whole advances as far as it did.
      const own = k < words.length - 1 ? measureIn(w, r.fontString) : r.width - sum;
      sum += own;
      out.push({ ...r, text: w, width: own + extra * stretchableSpaces(w) });
    });
  });
  runs = out;
  return { text, width: natural + room, runs, wordSpacingPx: extra };
}

/** Distance between the baselines of a design text: its absolute leading
 *  (`lineHeightLength`), else its multiplier times the font size. Read
 *  through `resolveDesignLineHeight` as well, so a slot built by hand (not
 *  resolved) that carries a {@link Dimension} or a malformed value still
 *  lays out — at the default leading when unusable, never NaN. */
function designLineHeightPx(el: ResolvedDesignTextElement, fontSizePx: number, dpi: number): number {
  const leading = resolveDesignLineHeight(el.lineHeightLength ?? el.lineHeight, el.fontSize);
  const px = leading.lineHeightLength ? dimPx(leading.lineHeightLength, dpi) : fontSizePx * leading.lineHeight;
  return Number.isFinite(px) ? px : 0;
}

export function layoutTextElement(
  el: ResolvedDesignTextElement,
  resolvedText: string,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
  /** The document's direction and the slot's frame (`LayoutContext`),
   *  and the chip styles a heading title's chips are set in (#1162). */
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean; arabicNumbers?: boolean; chipStyles?: readonly ResolvedChipStyleConfig[] } = {},
  /** Offsets into the printed text (its inline marks dropped) where a
   *  number the layout wrote meets a text mirrored from the document
   *  (#724, {@link mirroredTextSeams}). */
  seams: readonly number[] = [],
): ResolvedTextPrimitive[] {
  let text = resolvedText;
  const seamsOf = (a: number, b: number): number[] => seams.filter((s) => s > a && s < b).map((s) => s - a);
  const fontSizePx = dimPx(el.fontSize, dpi);
  const weight = el.fontWeight === 400 ? 'normal' : String(el.fontWeight);
  const style = el.italic ? 'italic' : 'normal';
  const fontString = buildFontString(el.fontFamily, fontSizePx, weight, style);
  // Tracking advances every character (spaces included) by `letterSpacingPx`,
  // exactly as canvas `letterSpacing` / CSS `letter-spacing` / PDF `Tc` do.
  // Negative tracking tightens a display title (EF-82); a width never drops
  // below zero, however tight.
  // A text in a joining script (Arabic…) is set untracked: spacing its
  // letters apart breaks the joins (`measure/rtl/joining.ts`).
  const trackingPx = dimPx(el.letterSpacing, dpi, fontSizePx);
  const letterSpacingPx = Number.isFinite(trackingPx) && !joiningScriptIn(text) ? trackingPx : 0;
  // In a document shaped in its own language a text is as wide as its
  // runs are painted, each in its own direction (#770,
  // `measuresRunsAsPainted`): wrapping, justification and truncation then
  // read the widths the renderers set. `base`, the direction the runs are
  // resolved at, is read when a text is measured, further down.
  const asPainted = measuresRunsAsPainted();
  const flowIn = (t: string, font: string): number => (asPainted ? directedTextWidth(t, font, base, frame.arabicNumbers === true) : flowTextWidth(t, font));
  const measure: TextMeasure = (t) => Math.max(0, flowIn(t, fontString) + letterSpacingPx * graphemeCount(t));
  const measureIn = (t: string, font: string): number => Math.max(0, flowIn(t, font) + letterSpacingPx * graphemeCount(t));
  const box = resolveBox(el.box, dpi, fontSizePx);
  const padding: ResolvedPadding = box?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // Inline marks: a text that carries any is laid out in runs; one that
  // carries none (only escapes) is plain text with its markers resolved.
  // A heading title's chips (#1162): only a text that reads inline marks,
  // in a design given the document's chip styles, sets them.
  const chips = el.inlineMarks && frame.chipStyles ? { styles: frame.chipStyles, dpi, letterSpacingPx } : undefined;
  const rich = el.inlineMarks
    ? parseRichDesignText(text, { family: el.fontFamily, sizePx: fontSizePx, weight: el.fontWeight, italic: el.italic }, chips)
    : undefined;
  const richM = rich?.hasMarks ? new RichMeasurer(rich, letterSpacingPx, asPainted ? flowIn : undefined) : undefined;
  if (rich && !rich.hasMarks) text = rich.text;
  // The base direction: the element's, `'auto'` from its first strong
  // letter, else the document's. Vertical text is not reordered.
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  const base: 'ltr' | 'rtl' = vertical ? 'ltr' : designBaseDirection(el.direction, richM ? richM.rt.text : text, frame.direction ?? 'ltr');
  const mirrored = !vertical && frame.mirrored === true;
  const strokeWidthPx = el.stroke ? Math.max(0, dimPx(el.stroke.width, dpi, fontSizePx)) : 0;
  const stroke = el.stroke && strokeWidthPx > 0
    ? { widthPx: strokeWidthPx, color: colorHex(el.stroke.color ?? el.color), ...(el.stroke.hollow ? { hollow: true } : {}) }
    : undefined;
  // Dots to trace (#1017), on a horizontal text.
  const dotted = el.dotted && !vertical ? resolveTextDots(el.dotted, dpi, fontSizePx) : undefined;

  const widthSize = resolveFixedSize(el.placement.size?.width, dpi, fontSizePx);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi, fontSizePx);
  const maxWidthSize = resolveFixedSize(el.placement.size?.maxWidth, dpi, fontSizePx);

  // Determine content width budget.
  let contentMax: number | undefined;
  let elementWidth: number | undefined;
  let clampToContainer = false;
  if (widthSize === 'auto' || widthSize === undefined) {
    // Auto width: let the text size itself, but never overflow the container.
    // We compute the distance from the anchor to the container edge and use
    // that as an upper bound for wrapping/ellipsis.
    const fillW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    // `maxWidth` caps the budget below the container edge: the element keeps
    // sizing to its content, so whatever hangs off it stays attached, and a
    // long text truncates here instead of squeezing those elements out.
    const capW = typeof maxWidthSize === 'number' ? Math.min(fillW, maxWidthSize) : fillW;
    contentMax = Math.max(0, capW - padding.left - padding.right);
    clampToContainer = true;
  } else if (widthSize === 'fill') {
    const fillW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    elementWidth = Math.max(0, fillW);
    contentMax = Math.max(0, elementWidth - padding.left - padding.right);
  } else {
    elementWidth = widthSize;
    contentMax = Math.max(0, elementWidth - padding.left - padding.right);
  }

  // Paragraphs (a newline, which the `\n` escape of the template or of an
  // attribute value has become) with a first-line indent, and a drop cap on
  // the first: wrapping text only.
  const lineHeightPx = designLineHeightPx(el, fontSizePx, dpi);
  const paraIndentPx = Math.max(0, dimPx(el.paragraphIndent, dpi, fontSizePx));
  // Paragraph ranges of the text laid out (the plain text of a marked one),
  // each trimmed of surrounding whitespace; empty ones are dropped, so
  // consecutive newlines count as one.
  const source = richM ? richM.rt.text : text;
  const paraRanges: [number, number][] = [];
  let rowStart = 0;
  for (const row of source.split('\n')) {
    let a = rowStart;
    let b = rowStart + row.length;
    while (a < b && /\s/.test(source[a]!)) a++;
    while (b > a && /\s/.test(source[b - 1]!)) b--;
    if (b > a) paraRanges.push([a, b]);
    rowStart += row.length + 1;
  }
  const paragraphs = paraRanges.map(([a, b]) => source.slice(a, b));
  // A drop cap makes the text wrap whatever its `overflow` (EF-106): the
  // letter spans lines, so a single truncated line cannot hold it.
  const wraps = el.overflow === 'wrap' || el.dropCap !== undefined;
  const justify = el.align === 'justify' && wraps;
  // A letter joined to the next one (Arabic) is never set apart.
  const dropCap = el.dropCap && wraps && contentMax !== undefined && paragraphs.length > 0 && paragraphs[0]!.length > 1
    && !joinsWithNext(paragraphs[0]!, 0)
    ? el.dropCap
    : undefined;
  // Rows of Chinese or Japanese are set by the CJK composer (#637): the
  // fonts of their inline marks, and the spans of a range of `source`
  // (`plain`, the range's text, when the text has no marks).
  const cjkFonts: CjkDesignFonts = richM
    ? richFontSet({ family: el.fontFamily, sizePx: fontSizePx, weight: el.fontWeight, italic: el.italic })
    : { normal: fontString, bold: fontString, italic: fontString, boldItalic: fontString };
  const spansOf = (a: number, b: number, plain: string): InlineSpan[] =>
    richM ? richDesignSpans(richM.rt, a, b) : [{ text: plain, bold: false, italic: false }];
  let m: TextMeasurement;
  let cap: { text: string; font: string; fontPx: number; width: number; lines: number; color: string } | undefined;
  if ((dropCap || justify || (paraIndentPx > 0 && paragraphs.length > 1)) && wraps && contentMax !== undefined) {
    const maxW = contentMax;
    const wrapped: WrappedLine[] = [];
    let capLines = 0;
    let capRoom = 0;
    if (dropCap) {
      capLines = Math.max(1, Math.round(dropCap.lines ?? 2));
      // The letter stands on the baseline of the last line it spans; by
      // default its capitals reach those of the first line: the text's cap
      // height plus `lines - 1` line spacings, capitals being 0.72 of the
      // size (EF-127).
      const capFontPx = dropCap.fontSize
        ? dimPx(dropCap.fontSize, dpi, fontSizePx)
        : fontSizePx + ((capLines - 1) * lineHeightPx) / CAP_HEIGHT_RATIO;
      const capWeight = (dropCap.fontWeight ?? el.fontWeight) === 400 ? 'normal' : String(dropCap.fontWeight ?? el.fontWeight);
      const capFont = buildFontString(dropCap.fontFamily ?? el.fontFamily, capFontPx, capWeight, 'normal');
      const letter = paragraphs[0]!.slice(0, 1);
      paragraphs[0] = paragraphs[0]!.slice(1).trimStart();
      paraRanges[0]![0] = paraRanges[0]![1] - paragraphs[0].length;
      const capW = flowTextWidth(letter, capFont);
      capRoom = capW + Math.max(0, dimPx(dropCap.gap, dpi, fontSizePx));
      cap = { text: letter, font: capFont, fontPx: capFontPx, width: capW, lines: capLines, color: colorHex(dropCap.color ?? el.color) };
    }
    // Justified lines fill their room by stretching their word spaces, and
    // a word that does not fit may be cut at a syllable to fill (EF-109).
    const fill = justify && (el.hyphenate ?? false);
    let lineNo = 0;
    paragraphs.forEach((para, p) => {
      const offsetOf = (i: number): number => {
        if (p === 0 && i < capLines) return capRoom;
        if (p > 0 && i === 0) return paraIndentPx;
        return 0;
      };
      if (composesDesignAsCjk(para)) {
        // A paragraph of Chinese or Japanese (#637): set by the CJK
        // composer, ragged (its lines are not stretched at word spaces),
        // each line as far in as its offset says (the last entry repeats).
        const indents: number[] = [];
        for (let i = 0; i <= Math.max(capLines, 1); i++) indents.push(offsetOf(i));
        const [a, b] = paraRanges[p]!;
        for (const l of composeCjkDesignParagraph(spansOf(a, b, para), cjkFonts, maxW, lineHeightPx, letterSpacingPx, measureIn, indents, seamsOf(a, b))) {
          wrapped.push({
            text: l.text,
            width: l.width,
            xOffset: l.xOffset,
            topY: lineNo * lineHeightPx,
            baselineY: lineNo * lineHeightPx + lineHeightPx * 0.8,
            height: lineHeightPx,
            ...(l.runs ? { runs: l.runs } : {}),
          });
          lineNo++;
        }
        return;
      }
      const cuts: ('syllable' | 'character' | undefined)[] = [];
      const lines: { text: string; width: number; runs?: DesignTextRun[]; wordSpacingPx?: number; wordDivided?: 'syllable' | 'character' }[] = richM
        ? wrapRich(richM, paraRanges[p]![0], paraRanges[p]![1], (i) => maxW - offsetOf(i), el.hyphenate ?? false, fill)
        : wrapWithWidths(para, measure, (i) => maxW - offsetOf(i), el.hyphenate ?? false, 0, fill, cuts).map((t, i) => ({ text: t, width: measure(t), ...(cuts[i] ? { wordDivided: cuts[i] } : {}) }));
      lines.forEach((l, i) => {
        // The last line of a paragraph is set flush left. The others are
        // stretched until their last glyph ends on the edge: the tracking
        // after it runs past (EF-153).
        const line = justify && i < lines.length - 1
          ? justifyLine(l, maxW - offsetOf(i) + trailingTracking(l.text.trimEnd(), letterSpacingPx), measure, measureIn, fontString)
          : l;
        wrapped.push({
          text: line.text,
          width: line.width,
          xOffset: offsetOf(i),
          topY: lineNo * lineHeightPx,
          baselineY: lineNo * lineHeightPx + lineHeightPx * 0.8,
          height: lineHeightPx,
          ...(line.runs ? { runs: line.runs } : {}),
          ...(line.wordSpacingPx !== undefined ? { wordSpacingPx: line.wordSpacingPx } : {}),
          ...(l.wordDivided ? { wordDivided: l.wordDivided } : {}),
        });
        lineNo++;
      });
    });
    const w = wrapped.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
    m = { lines: wrapped, contentWidth: w, contentHeight: wrapped.length * lineHeightPx, needsClip: false };
  } else {
    const cjk = source.split('\n').some(composesDesignAsCjk)
      ? layoutCjkRows(source, (a, b) => spansOf(a, b, source.slice(a, b)), cjkFonts, richM, measure, measureIn, lineHeightPx, letterSpacingPx, el.overflow, contentMax, el.hyphenate, seamsOf)
      : undefined;
    if (cjk) m = cjk;
    else if (richM && contentMax !== undefined) m = layoutRichText(richM, lineHeightPx, el.overflow, contentMax, el.hyphenate);
    else m = layoutText(text, measure, lineHeightPx, el.overflow, contentMax, el.hyphenate);
  }
  // Set vertically (in a vertical flow, or turned by `writingMode`): each
  // line's characters stand on the middle of its line box, as a vertical
  // line of the body does (`lineBaselineOffset`).
  if (vertical) {
    for (const line of m.lines) line.baselineY = line.topY + lineBaselineOffset(line.height, fontString);
  } else {
    // Right-to-left text: each line's runs cut where the direction
    // changes, flagged and ordered for the frame the slot is painted in.
    // A justified run keeps its spaces' share of the stretch.
    let resized = false;
    for (const line of m.lines) {
      // An Arabic word wider than a wrapping line's room is left whole and
      // runs past it: flagged for a warning.
      if (wraps && contentMax !== undefined && line.width > contentMax - (line.xOffset ?? 0) + 0.5 && joiningScriptIn(line.text)) line.wordOverflow = true;
      const runs: DesignTextRun[] = line.runs ?? [{ text: line.text, fontString, width: line.width }];
      const spacing = line.wordSpacingPx ?? 0;
      const directed = directRuns(
        runs, base, mirrored,
        (r, t, rtl) => (asPainted ? Math.max(0, paintedRunWidth(t, r.fontString, rtl) + letterSpacingPx * graphemeCount(t)) : measureIn(t, r.fontString)) + spacing * stretchableSpaces(t),
        frame.arabicNumbers === true, asPainted,
      );
      if (!directed) continue;
      line.runs = directed.runs;
      if (directed.order) line.order = directed.order;
      if (!asPainted) continue;
      // Each run is now as wide as it is painted (#770): the line is as
      // wide as its runs. A justified line keeps its width, the edge it
      // ends on, and its word spaces take up what the runs moved by.
      const set = directed.runs.reduce((sum, r) => sum + r.width, 0);
      const spaces = spacing === 0 ? 0 : directed.runs.reduce((n, r) => n + (r.stacked || r.tcy || r.orientation ? 0 : stretchableSpaces(r.text)), 0);
      if (spaces > 0) {
        const more = (line.width - set) / spaces;
        for (const r of directed.runs) if (!r.stacked && !r.tcy && !r.orientation) r.width += more * stretchableSpaces(r.text);
        line.wordSpacingPx = spacing + more;
      } else if (Math.abs(set - line.width) > 1e-9) {
        line.width = set;
        resized = true;
      }
    }
    // A chip of a mirrored frame (#1162) advances through its runs along
    // the flow's x axis too: their order turned, as `mirrorFrame` turns a
    // body chip's.
    if (mirrored) {
      for (const line of m.lines) {
        for (const run of line.runs ?? []) {
          const chip = run.chip;
          if (!chip || chip.runs.length < 2) continue;
          const flow = [...(chip.order ?? chip.runs.map((_, i) => i))].reverse();
          const next = { ...chip };
          if (flow.every((v, i) => v === i)) delete next.order;
          else next.order = flow;
          run.chip = next;
        }
      }
    }
    // A text that sizes its own box is as wide as its widest line.
    if (resized) {
      const widest = m.lines.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
      m.contentWidth = m.needsClip && contentMax !== undefined ? Math.min(widest, contentMax) : widest;
    }
  }
  // A text of one line set again after itself (#1017).
  if (el.repeat && !vertical && !cap && m.lines.length === 1 && contentMax !== undefined) {
    const gapPx = el.repeat.gap ? Math.max(0, dimPx(el.repeat.gap, dpi, fontSizePx)) : fontSizePx;
    repeatLine(m, contentMax, gapPx, el.repeat.count, fontString, (base === 'rtl') !== mirrored);
  }
  // The tracking after a line's last glyph is advance, not ink: a box that
  // shrink-wraps its text leaves it out (EF-153), as the alignment of each
  // line does (`textPrimitiveToBlock`), so a tracked title anchored to a
  // corner or a centre sits where its letters are.
  let contentWidth = m.contentWidth;
  if (letterSpacingPx !== 0) {
    const inkWidth = m.lines.reduce((mx, l) => Math.max(mx, (l.xOffset ?? 0) + Math.max(0, l.width - trailingTracking(l.text, letterSpacingPx))), 0);
    contentWidth = m.needsClip && contentMax !== undefined ? Math.min(inkWidth, contentMax) : inkWidth;
  }
  if (elementWidth === undefined) elementWidth = contentWidth + padding.left + padding.right;
  if (clampToContainer) {
    const maxW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    elementWidth = Math.min(elementWidth, Math.max(0, maxW));
  }

  let elementHeight: number;
  if (heightSize === undefined || heightSize === 'auto') {
    elementHeight = m.contentHeight + padding.top + padding.bottom;
  } else if (heightSize === 'fill') {
    elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  } else {
    elementHeight = heightSize;
  }

  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);

  // When anchored to another element with auto-sized width, wrapped lines
  // should flow from the anchor side: right-of → left-align, left-of →
  // right-align. This keeps the first character of every wrapped line at the
  // same vertical gutter as the anchor, matching user intent.
  const autoWidth = el.placement.size?.width === undefined || el.placement.size?.width === 'auto';
  const effectiveAlign: DesignTextAlign = anchoredToElement && autoWidth
    ? (pin.pinX === 'start' ? 'left' : pin.pinX === 'end' ? 'right' : el.align)
    : el.align;

  const main: ResolvedTextPrimitive = {
    kind: 'text',
    id: el.id,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    lines: m.lines,
    fontString,
    fontSizePx,
    color: colorHex(el.color),
    align: effectiveAlign,
    verticalAlign: el.verticalAlign,
    needsClip: m.needsClip || el.overflow === 'clip',
    ...(m.truncated && el.overflow !== 'wrap' ? { truncated: el.overflow } : {}),
    letterSpacingPx,
    ...(base === 'rtl' ? { direction: 'rtl' as const } : {}),
    ...((base === 'rtl') !== mirrored ? { startRight: true as const } : {}),
    contentX: padding.left,
    contentY: padding.top,
    contentWidth: Math.max(0, elementWidth - padding.left - padding.right),
    contentHeight: Math.max(0, elementHeight - padding.top - padding.bottom),
    box,
    ...(stroke ? { stroke } : {}),
    ...(dotted ? { dotted } : {}),
  };
  if (!cap) return [main];
  // The drop cap: its baseline on the baseline of the last line it spans,
  // wherever `verticalAlign` moves those lines in the box.
  const capLineH = cap.fontPx * 1.2;
  const anchorLine = m.lines[Math.min(cap.lines, m.lines.length) - 1];
  const targetBaseline = anchorLine ? anchorLine.baselineY : lineHeightPx * 0.8;
  const linesOffset = textVerticalOffset(el.verticalAlign, main.contentHeight, m.lines);
  const capPrim: ResolvedTextPrimitive = {
    kind: 'text',
    id: `${el.id}-dropcap`,
    x: x + padding.left,
    y: y + padding.top + linesOffset + targetBaseline - capLineH * 0.8,
    width: cap.width,
    height: capLineH,
    lines: [{ text: cap.text, width: cap.width, topY: 0, baselineY: capLineH * 0.8, height: capLineH }],
    fontString: cap.font,
    fontSizePx: cap.fontPx,
    color: cap.color,
    align: 'left',
    verticalAlign: 'top',
    needsClip: false,
    dropCap: true,
    letterSpacingPx: 0,
    contentX: 0,
    contentY: 0,
    contentWidth: cap.width,
    contentHeight: capLineH,
    // The outline takes the cap's own colour unless it sets one.
    ...(stroke ? { stroke: { ...stroke, color: el.stroke?.color ? stroke.color : cap.color } } : {}),
  };
  return [main, capPrim];
}
