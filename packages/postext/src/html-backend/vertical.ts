// Lines, markers, bullets and design text of a vertical page, with
// upright boxes and annotation runs down the line
// (#1276: split out of html-backend.ts).
import { DEFAULT_CENTRAL_BASELINE, type VDTAnnotationRun, type VDTLine, type VDTBlock, type VDTLineSegment, type VDTDesignTextBlock } from '../vdt.js';
import { lineTrailingTracking, lineInkExtent } from '../paint/lineInk.js';
import { shapingTagOf } from '../hyphenation/locale.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import type { CjkRegion } from '../types.js';
import { type ForcedOrientation, holdsTurnedMark, verticalRuns, type VerticalRun, segmentOrientation } from '../writing/writingMode.js';
import { graphemesOf, graphemeCount } from '../measure/graphemes.js';
import { measureTextWidth, withMeasureLanguage } from '../measure/canvas.js';
import { lineWordSegmentsInOrder } from '../paint/wordPieces.js';
import { fontFamilyOf } from '../measure/vertical.js';
import { RT_OPEN, verticalKuntenTateHtml, verticalLineMarksHtml } from './htmlAnnotations.js';
import { extractFontSizePx } from './design.js';
import { renderSwatchSegment, renderChip, renderTaskBox } from './lines.js';
import { shapedText, type HtmlPaint } from './render.js';
import { rubyRuns, renderMathSegmentSvg, pickSegmentColor, segmentHref, refLinks, refKey, refAnchorHref, LINE_END_DECL, lineEndText } from './segmentText.js';
import { DASH_FEATURES_DECL, quoteFontString, pickSegmentFont, ligaturesDecl, lineCjkDecl, cjkTextDecl, CJK_TEXT_DECL } from './styles.js';
import { esc, trackedIn, trackedTextHtml } from './textRuns.js';

/** What vertical lines need: the CJK region, the central axis of each
 *  family (`VDTFlowFrame.centralBaselines`), `cjk.uprightDigits`, and the
 *  advance of each dash stretched to its cell (`VDTFlowFrame.dashAdvances`). */
export interface VerticalHtml {
  region: CjkRegion;
  axes?: Record<string, number>;
  uprightDigits: number;
  dashes?: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Vertical text (`VDTPage.flow`)
//
// A vertical page's flow is rendered in a box turned a quarter turn
// clockwise (`pt-flow`, see `renderPageDetailed`), so boxes, rules,
// pictures, turned resource blocks and everything else of the flow land on
// the sheet as the canvas paints them. Each text line is turned back
// upright inside it — one box per line, the line's physical rectangle — and
// set with `writing-mode: vertical-rl`: the browser stands Chinese
// characters upright, takes the fonts' vertical forms and sets Latin words
// sideways. Every segment is placed where the layout put it along the line
// (`top`), its em boxes centred on the column's central axis; tate-chu-yoko
// cells are `text-combine-upright: all`, `:upright` and `:sideways` runs
// `text-orientation`.
// ---------------------------------------------------------------------------

/** The central axis of a font (em above the baseline). */
function centralOf(v: VerticalHtml, fontString: string): number {
  return v.axes?.[fontFamilyOf(fontString)] ?? DEFAULT_CENTRAL_BASELINE;
}

/** Characters of Japanese vertical text the HTML sets otherwise than the
 *  browser would: “ ” (set as 〝 〟) and the marks of a pair set in one
 *  cell (`isUprightMarkPair`). */
const JAPANESE_VERTICAL_RE = /[“”!?！？]/;

/** Escaped text of a vertical run, with its tate-chu-yoko cells, the
 *  orientation its author forced, and each turned mark in a box of its
 *  cell ({@link turnedCellHtml}). `font` is the run's font string (whose
 *  family's `dashes` stretch a dash) and `tracking` the letter spacing it
 *  is set with, px, which follows each cell. A Japanese “ ” is written as
 *  the 〝 〟 the canvas and the PDF paint (`VerticalGlyph.paintAs`), whose
 *  vertical form the browser takes; a pair of ！？ in one cell is combined
 *  as written, the browser fitting it to the cell. */
function verticalTextHtml(text: string, v: VerticalHtml, orient?: ForcedOrientation, font?: string, tracking = 0): string {
  if (orient === 'tcy') return `<span style="text-combine-upright:all;">${esc(text)}</span>`;
  if (orient === 'upright') return `<span style="text-orientation:upright;">${esc(text)}</span>`;
  // A sideways Latin word of a tracked line in the canvas's pieces, its
  // ligatures with the tracking of each letter (#770).
  const tracked = font !== undefined ? trackedIn(font, tracking) : undefined;
  if (orient === 'sideways') return `<span style="text-orientation:sideways;">${trackedTextHtml(text, tracked)}</span>`;
  const digits = v.uprightDigits > 0 && /[0-9]/.test(text);
  const japanese = v.region === 'japan' && JAPANESE_VERTICAL_RE.test(text);
  if (!digits && !japanese && !holdsTurnedMark(text)) return trackedTextHtml(text, tracked);
  const runs = verticalRuns(graphemesOf(text), v.region, v.uprightDigits);
  if (!runs.some((r) => r.glyph.orient === 'tcy' || r.glyph.orient === 'rotate' || r.glyph.paintAs !== undefined)) return trackedTextHtml(text, tracked);
  const advances = font !== undefined ? v.dashes?.[fontFamilyOf(font)] : undefined;
  // A number in one cell combined upright; a turned mark in its cell.
  return runs.map((r) => (r.glyph.orient === 'tcy'
    ? `<span style="text-combine-upright:all;">${esc(r.text)}</span>`
    : r.glyph.orient === 'rotate' ? turnedCellHtml(r, advances?.[r.text], tracking)
    : r.glyph.paintAs !== undefined ? esc(r.glyph.paintAs) : trackedTextHtml(r.text, tracked))).join('');
}

/**
 * A mark a vertical line turns in a cell of its own (`rotate`: a dash, an
 * ellipsis, an interpunct, a wave dash). The browser sets it sideways at
 * its horizontal advance (Noto's · is a third of an em), where the layout
 * gave it its cell (one em; half an em for the mainland interpunct), as
 * the canvas and the PDF paint it: so it stands in a box the cell's
 * length, centred in it, with the line's tracking after the box as after
 * any cell. A dash is stretched to fill its cell, as they stretch it: by
 * its advance the layout measured (`advance`, ems), with the glyph it
 * measured (the face's Chinese form off, see {@link DASH_FEATURES_DECL});
 * with no measured advance, in the font's full-width form (Noto's —).
 */
function turnedCellHtml(run: VerticalRun, advance: number | undefined, tracking: number): string {
  const cell = run.cell ?? 1;
  let inner = esc(run.text);
  if (run.glyph.stretch) {
    inner = advance !== undefined && advance > 0
      ? `<span style="${advance < cell ? `transform:scaleY(${(cell / advance).toFixed(4)});` : ''}${DASH_FEATURES_DECL}">${inner}</span>`
      : `<span style="font-variant-east-asian:full-width;">${inner}</span>`;
  }
  return `<span style="display:inline-flex;justify-content:center;inline-size:${cell}em;letter-spacing:0;${tracking !== 0 ? `margin-inline-end:${tracking}px;` : ''}">${inner}</span>`;
}

/**
 * A box of the turned flow (`left`, `top`, `width` along the line,
 * `height` across it) holding a box turned back upright, set vertically:
 * `content` is placed inside that one with physical `top` (along the line)
 * and `right` (from the box's physical right edge, the flow's top).
 */
function uprightBox(left: number, top: number, width: number, height: number, decl: string, content: string, attrs = '', sideways = ''): string {
  return (
    `<div${attrs ? ` ${attrs}` : ''} style="position:absolute;left:${left.toFixed(3)}px;top:${top.toFixed(3)}px;width:${Math.max(0, width).toFixed(3)}px;height:${height.toFixed(3)}px;">` +
    uprightInner(width, height, decl, content) +
    // What is set in the turned flow itself (a chip, #1162): sideways.
    sideways +
    `</div>`
  );
}

/** The box of {@link uprightBox} turned back upright: `height` wide on the
 *  sheet, `width` tall, set vertically. */
function uprightInner(width: number, height: number, decl: string, content: string): string {
  return (
    `<div style="position:absolute;left:0;top:0;width:${height.toFixed(3)}px;height:${Math.max(0, width).toFixed(3)}px;` +
    `transform:translate(0,${height.toFixed(3)}px) rotate(-90deg);transform-origin:0 0;` +
    `writing-mode:vertical-rl;text-orientation:mixed;${decl}">${content}</div>`
  );
}

/** A run of vertical text at `at` along its box, its em boxes centred
 *  `axis` px from the box's flow top (the physical right edge). The
 *  line height that centres them comes after `decl`: a `font` shorthand
 *  in it resets `line-height` to `normal`. */
function verticalSpan(at: number, axis: number, inner: string, decl = ''): string {
  const lh = Math.max(0, 2 * axis);
  return `<span style="position:absolute;top:${at.toFixed(3)}px;right:0;white-space:pre;${decl}line-height:${lh.toFixed(3)}px;">${inner}</span>`;
}

/** A run of vertical text whose em boxes are centred `axis` px from the
 *  box's flow top, on either side of it (a ruby reading or a warichu row
 *  sits outside the line's own box); `hidden` from assistive technology
 *  (a warichu row, which its note box reads). */
function verticalSpanAt(at: number, axis: number, size: number, inner: string, decl = '', hidden = true): string {
  const lh = Math.max(1, 2 * size);
  return `<span${hidden ? ' aria-hidden="true"' : ''} style="position:absolute;top:${at.toFixed(3)}px;right:${(axis - lh / 2).toFixed(3)}px;white-space:pre;${decl}line-height:${lh.toFixed(3)}px;">${inner}</span>`;
}

/** Annotation runs of a vertical line (a ruby reading, a warichu note's
 *  rows, #194, #195) from `x` along it: set down the column in their own
 *  face, centred across it on their baseline (`dy`) less their face's
 *  axis, a zhuyin tone mark standing upright (`VDTAnnotationRun.upright`).
 *  `hidden` from assistive technology unless they are a ruby reading's,
 *  which its `<rt>` holds (#428). */
function verticalAnnotationRuns(runs: readonly VDTAnnotationRun[], x: number, color: string, v: VerticalHtml, axisOf: (fontString: string, shift?: number) => number, hidden = true): string {
  return runs.map((run) => {
    const decl = `font:${quoteFontString(run.fontString)};color:${run.color ?? color};letter-spacing:0;`;
    return verticalSpanAt(x + run.dx, axisOf(run.fontString, run.dy), extractFontSizePx(run.fontString), verticalTextHtml(run.text, v, run.upright ? 'upright' : undefined, run.fontString), decl, hidden);
  }).join('');
}

/**
 * The advance of `text` down a vertical line, as the layout measures it
 * (`verticalTextWidth`): its sideways runs at the width the measurer
 * gives them, every cell at its length in ems, `tracking` px after each
 * character and each cell.
 */
function verticalAdvance(text: string, font: string, v: VerticalHtml, tracking: number): number {
  const em = extractFontSizePx(font);
  let width = 0;
  for (const run of verticalRuns(graphemesOf(text), v.region, v.uprightDigits)) {
    width += run.cell === undefined
      ? measureTextWidth(run.text, font) + (tracking === 0 ? 0 : tracking * graphemeCount(run.text))
      : em * run.cell + tracking;
  }
  return width;
}

/**
 * The segments a line down a vertical page is written from (#770): the
 * line's own, the pieces of a word set sideways joined into one box where
 * the word was measured whole (`lineWordSegments`, the rule of a
 * horizontal line, see {@link wordSegmentsOf}).
 *
 * A Latin word runs sideways down the column, shaped as on a horizontal
 * line, and a piece of it is as wide as the word grew by it. Chrome 154,
 * Noto Sans TC at 15.63 px under `zh-Hant`: the layout holds `BY-` 22.51
 * and `SA` 18.46 px, `BY-SA` being 40.97 px, where `SA` alone is 18.81 px
 * (the face draws the hyphen 0.34 px narrower before the capital). In a
 * box of its own `SA` ended 0.35 px past its place; the word in one box
 * is 40.98 px. A line of the CJK composer, which measures a Western run
 * whole, and a line that carries an order are written as they are; so is
 * every line where the language is not known.
 */
function verticalWordSegments(line: VDTLine, block: VDTBlock, v: VerticalHtml, tracking: number): VDTLineSegment[] | undefined {
  const shaped = shapedText;
  if (!shaped || !line.segments || line.cjkComposed || line.order !== undefined) return line.segments;
  return lineWordSegmentsInOrder(line, false, (seg, text) =>
    withMeasureLanguage(seg.lang !== undefined ? shapingTagOf(seg.lang) : shaped.lang, () => verticalAdvance(text, pickSegmentFont(seg, block), v, tracking))).segments;
}

/** A body line of a vertical page: its text segments down an upright box,
 *  its formulas, swatches and chips sideways where the canvas paints them
 *  (see the section comment). */
export function renderVerticalLine(line: VDTLine, block: VDTBlock, v: VerticalHtml, targets?: ReadonlySet<string>, next?: VDTLine, paint?: HtmlPaint): string {
  const lineTracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, lineTracking);
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = block.bbox.width - lineIndent;
  const baseline = line.baseline - line.bbox.y;
  const blockFont = quoteFontString(block.fontString);
  const axisOf = (fontString: string, shift = 0): number => baseline + shift - centralOf(v, fontString) * extractFontSizePx(fontString);
  const inner: string[] = [];
  const sideways: string[] = [];
  // The pieces of a sideways word in one box (see `verticalWordSegments`).
  const own = verticalWordSegments(line, block, v, lineTracking);
  const segs = own && own.length > 0
    ? own
    : [{ kind: 'text', text: line.text, width: line.bbox.width } as VDTLineSegment];
  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of segs) {
    if (seg.hangs) continue;
    if (seg.kind === 'space' && !seg.autospace) spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = line.segments && line.segments.length > 0 ? lineInkExtent(line, 0).width : line.bbox.width;
  const useJustify = block.textAlign === 'justify' && spaceCount > 0
    && !line.tabbed && ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify ? (effectiveWidth - wordWidth) / spaceCount : 0;
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  let x = block.textAlign === 'center' ? slack / 2 : block.textAlign === 'right' ? slack : 0;
  const spaceAxis = axisOf(block.fontString);
  // The `<ruby>` open across the bases of one annotation (#428).
  const ruby = rubyRuns();
  for (const seg of segs) {
    inner.push(ruby.before(seg));
    if (seg.kind === 'space') {
      // The space as text, for copying (#403).
      if (seg.text) inner.push(verticalSpan(x, spaceAxis, esc(seg.text)));
      x += useJustify && !seg.autospace ? justifiedSpaceWidth : seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      sideways.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      sideways.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, block.color, paint, seg.rtl === true));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      sideways.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, blockFont, block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block)));
      x += seg.width;
      continue;
    }
    if (seg.warichu) {
      // A warichu note's part: its two rows down the column, the upper
      // row the right one, read once (#195).
      const w = seg.warichu;
      inner.push(`<span role="note" aria-label="${esc(w.upper + w.lower)}">${verticalAnnotationRuns(w.runs, x, w.color ?? pickSegmentColor(seg, block), v, axisOf)}</span>`);
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap, right of the column (JLReq
      // §4.2.3), read as the marker and linked to its note.
      const runs = verticalAnnotationRuns(seg.sideMarker.runs, x, pickSegmentColor(seg, block), v, axisOf, false);
      const href = segmentHref(seg);
      inner.push(href !== undefined ? `<a href="${esc(href)}" style="color:inherit;text-decoration:none;">${runs}</a>` : runs);
      x += seg.width;
      continue;
    }
    const fontString = pickSegmentFont(seg, block);
    const font = quoteFontString(fontString);
    const color = pickSegmentColor(seg, block);
    // A dash of a 破折号 (`inkScale`): turned with the flow (sideways) and
    // stretched down the column from where the layout put its glyph, the
    // face's own Chinese form off, as the canvas and the PDF paint it.
    const stretched = seg.inkScale !== undefined;
    // A run in another face of a tracked line asks for its ligatures
    // again after its `font`, which resets them (#703).
    const decl = (font !== blockFont ? `font:${font};${lineTracking !== 0 ? ligaturesDecl() : ''}` : '')
      + (color !== block.color ? `color:${color};` : '')
      + (seg.tracking !== undefined ? `letter-spacing:${lineTracking + seg.tracking}px;` : '')
      + (stretched ? `transform:scaleY(${seg.inkScale!.toFixed(4)});transform-origin:0 0;${DASH_FEATURES_DECL}` : '');
    const segTracking = seg.tracking !== undefined ? lineTracking + seg.tracking : lineTracking;
    let text = verticalTextHtml(seg.text, v, stretched ? 'sideways' : segmentOrientation(seg), fontString, segTracking);
    // Text set with emphasis dots is emphasis (#193); the dots are the
    // line's marks.
    if (seg.cjkMarks?.dots) text = `<em style="font-style:inherit;">${text}</em>`;
    const href = seg.refResourceId !== undefined
      ? (refLinks(refKey(seg), targets) ? refAnchorHref(refKey(seg)) : undefined)
      : segmentHref(seg);
    if (href !== undefined) text = `<a href="${esc(href)}" style="color:inherit;text-decoration:none;"${seg.href !== undefined && seg.refResourceId === undefined ? ' rel="noopener noreferrer"' : ''}>${text}</a>`;
    // A ruby base and its reading beside it (#194), in a `<ruby>` (#428).
    if (seg.ruby) inner.push(ruby.open(seg));
    inner.push(verticalSpan(x + (seg.inkOffset ?? 0), axisOf(fontString, seg.baselineShift ?? 0), text, decl));
    if (seg.ruby) inner.push(RT_OPEN, verticalAnnotationRuns(seg.ruby.runs, x, seg.ruby.color ?? color, v, axisOf, false), '</rt>', ruby.after(seg));
    if (seg.kunten) {
      // Kanbun marks beside the character (#430), after its `<ruby>`; its
      // 送り仮名 read and copy after it, as transparent text.
      inner.push(ruby.end(), verticalAnnotationRuns(seg.kunten.runs, x, seg.kunten.color ?? color, v, axisOf));
      if (seg.kunten.tate) sideways.push(verticalKuntenTateHtml(seg.kunten, x, line, color));
      if (seg.kunten.okuri) inner.push(verticalSpan(x + seg.width, spaceAxis, esc(seg.kunten.okuri), LINE_END_DECL));
    }
    x += seg.width;
  }
  inner.push(ruby.end());
  // Emphasis dots, proper-name and book-title lines (#193), in the turned
  // flow with the line's box.
  if (line.marks) sideways.push(verticalLineMarksHtml(line, block.color));
  const end = lineEndText(line, next);
  if (end) inner.push(verticalSpan(x, spaceAxis, esc(end), LINE_END_DECL));
  const width = Math.max(line.bbox.width, effectiveWidth);
  const decl = `font:${blockFont};color:${block.color};`
    + (block.strikethroughText ? 'text-decoration:line-through;' : '')
    // A tracked line keeps the ligatures of its sideways Latin runs, as
    // they were measured (#703).
    + (lineTracking !== 0 ? `letter-spacing:${lineTracking}px;${ligaturesDecl()}` : '')
    + (lineCjkDecl(line) || hasCJK(line.text) ? cjkTextDecl(lineTracking !== 0) : '');
  return (
    `<div class="pt-line" data-block="${esc(block.id)}" style="position:absolute;left:${line.bbox.x}px;top:${line.bbox.y}px;width:${width}px;height:${line.bbox.height}px;">` +
    uprightInner(width, line.bbox.height, decl, inner.join('')) +
    sideways.join('') +
    `</div>`
  );
}

/** A list marker of a vertical line (the bullet, the number, its prefix
 *  and separator), set down the column from `x`. */
function renderVerticalMarker(cls: string, x: number, block: VDTBlock, v: VerticalHtml, fontString: string, color: string, text: string): string {
  const line = block.lines[0]!;
  const size = extractFontSizePx(fontString);
  const lineTop = line.bbox.y;
  const h = line.bbox.height;
  // A marker set as text sits on its baseline; a bullet is centred on
  // `bulletY` (its axis).
  const axis = block.bulletBaselineY !== undefined
    ? block.bulletBaselineY - lineTop - centralOf(v, fontString) * size
    : (block.bulletY ?? line.baseline) - lineTop;
  const width = size * graphemesOf(text).length;
  const decl = `font:${quoteFontString(fontString)};color:${color};${hasCJK(text) ? CJK_TEXT_DECL : ''}`;
  return uprightBox(x, lineTop, width, h, decl, verticalSpan(0, axis, verticalTextHtml(text, v, undefined, fontString)), `class="${cls}" aria-hidden="true"`);
}

export function renderVerticalBullet(block: VDTBlock, v: VerticalHtml): string {
  if (block.type === 'listItem' && block.bulletBox) return renderTaskBox(block, true);
  if (block.type !== 'listItem' || !block.bulletText || block.bulletOffsetX === undefined || !block.lines[0]) return '';
  const bulletFont = block.bulletFontString ?? block.fontString;
  const bulletColor = block.bulletColor ?? block.color;
  let html = renderVerticalMarker('pt-bullet', block.bulletOffsetX, block, v, bulletFont, bulletColor, block.bulletText);
  if (block.separatorText && block.separatorX !== undefined) {
    const sepFont = block.separatorFontString ?? bulletFont;
    const sepColor = block.separatorColor ?? bulletColor;
    if (block.prefixText && block.prefixX !== undefined) html = renderVerticalMarker('pt-separator', block.prefixX, block, v, sepFont, sepColor, block.prefixText) + html;
    html += renderVerticalMarker('pt-separator', block.separatorX, block, v, sepFont, sepColor, block.separatorText);
  }
  return html;
}

/** The lines of a design text set vertically: in the flow of a vertical
 *  page (an opener, a box title), or on its own (a running head set down
 *  the fore-edge, `VDTDesignTextBlock.writingMode`) inside the block's own
 *  turned frame. Each line's box runs from its baseline's line top. */
export function verticalDesignLines(block: VDTDesignTextBlock, v: VerticalHtml, originX: number, originY: number): string {
  const size = extractFontSizePx(block.fontString);
  const font = quoteFontString(block.fontString);
  // A tracked text keeps its ligatures (#703): asked for after each
  // `font`, which resets them.
  const tracked = !!block.letterSpacingPx;
  const parts: string[] = [];
  const h = size * 2;
  for (const line of block.lines) {
    const top = line.baselineY - size * 1.5;
    const axisOf = (fontString: string, shift = 0): number => size * 1.5 + shift - centralOf(v, fontString) * extractFontSizePx(fontString);
    const runs = line.runs ?? [{ text: line.text, fontString: block.fontString, width: line.width }];
    let x = 0;
    const inner: string[] = [];
    const sideways: string[] = [];
    for (const run of runs) {
      // A heading title's chip (#1162): turned with the column, as the
      // canvas and the PDF paint it, its baseline the line's (0.8 of the
      // size under the top of a box one line high).
      if (run.chip) {
        sideways.push(
          `<span style="position:absolute;left:0;top:${(line.baselineY - top - size * 0.8).toFixed(3)}px;font:${font};line-height:1;color:${block.color};">`
          + renderChip(run.chip, x + (run.inkOffset ?? 0), size * 0.8, font, block.color, () => block.color)
          + '</span>',
        );
        x += run.width;
        continue;
      }
      const runFont = quoteFontString(run.fontString);
      // A dash of a 破折号 (`inkScale`, #652): turned with the flow and
      // stretched down the column, as a body segment's is.
      const stretched = run.inkScale !== undefined;
      const decl = (runFont !== font ? `font:${runFont};${tracked ? ligaturesDecl() : ''}` : '')
        + (stretched ? `transform:scaleY(${run.inkScale!.toFixed(4)});transform-origin:0 0;${DASH_FEATURES_DECL}` : '');
      // A run whose width is its box (a CJK mark that gave up blank, #637)
      // sets its glyphs `inkOffset` into it.
      inner.push(verticalSpan(x + (run.inkOffset ?? 0), axisOf(run.fontString, run.baselineShift ?? 0), verticalTextHtml(run.text, v, stretched ? 'sideways' : segmentOrientation(run), run.fontString, block.letterSpacingPx ?? 0), decl));
      x += run.width;
    }
    const width = Math.max(line.width, x);
    const decl = `font:${font};color:${block.color};${hasCJK(line.text) ? cjkTextDecl(tracked) : tracked ? ligaturesDecl() : ''}`
      + (line.wordSpacingPx ? `word-spacing:${line.wordSpacingPx.toFixed(3)}px;` : '');
    parts.push(uprightBox(originX + line.xOffset, originY + top, width, h, decl, inner.join(''), '', sideways.join('')));
  }
  return parts.join('');
}
