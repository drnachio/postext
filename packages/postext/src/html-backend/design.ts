// Design slot blocks as markup: design text with its directed runs, cells
// and dotted letters, rules, paths, boxes and images
// (#1276: split out of html-backend.ts).
import type { VDTDesignTextBlock, VDTTextDots, VDTDesignTextRun, VDTDesignBoxStyle, BoundingBox, VDTDesignRuleBlock, VDTDesignPathBlock, VDTDesignBoxBlock, VDTDesignImageBlock, VDTDesignBlock, VDTDesignSlot } from '../vdt.js';
import { pathSvgData, markerSvgElement } from '../design/pathBlock.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { isLetterless, faceReadsScript, scriptTextWidth, rtlTextWidth } from '../measure/script.js';
import { graphemeCount, graphemesOf } from '../measure/graphemes.js';
import { withMeasureLanguage, measureTextWidth } from '../measure/canvas.js';
import { sameSetWidth, cellsOf } from '../paint/wordPieces.js';
import { textDots } from '../paint/textDots.js';
import { clipToOutline, imageUrl, tintFilterDecl, inkFilterDecl } from './images.js';
import { renderChip } from './lines.js';
import { shapedText, type HtmlPaint, ownShaping } from './render.js';
import { CELLS_DECL, quoteFontString, cjkTextDecl, cjkFeaturesDecl, ligaturesDecl, inkScaleDecl, dirAttr } from './styles.js';
import { scriptTextHtml, wordsHtml, trackedIn, esc, wordBoxesHtml } from './textRuns.js';
import { type VerticalHtml, verticalDesignLines } from './vertical.js';

/**
 * A run of design text with no letter, set in the forms the canvas
 * painted it in (#770), or undefined when it is written as it is.
 *
 * A word of body text with no letter carries the script it was measured
 * in (`scriptContext`, #725). A design text carries none: its runs are
 * measured as the canvas paints them, each alone, and a current Chrome
 * gives such a run the face's Latin forms there, while the browser's
 * layout gives a run with no letter the default ones. Chrome 154, Amiri
 * at 25 px: the `(` that opens a date set right to left is 6.38 px on the
 * canvas and 11.45 px in a box, alone or beside the Arabic text; with a
 * Latin mark of no size after it the box is 6.38 px wide. So where the
 * face draws such characters by script and the run is as wide as the
 * canvas sets it in Latin forms (`width` px, `tracking` after each
 * character), it is written beside that mark, in a box of its own
 * direction so the mark's letter orders nothing around it. One word
 * only: in a text of several the mark would reach the others. Asked in
 * the language the text is shaped in ({@link shapedText}); nothing
 * changes where that is not known.
 */
function letterlessRunHtml(text: string, font: string, rtl: boolean, width: number, tracking: number): string | undefined {
  const shaped = shapedText;
  if (!shaped || text.indexOf(' ') >= 0 || !isLetterless(text)) return undefined;
  return withMeasureLanguage(shaped.lang, () => {
    if (!faceReadsScript(font)) return undefined;
    const set = scriptTextWidth(text, font, 'Latn', rtl) + (tracking === 0 ? 0 : tracking * graphemeCount(text));
    return sameSetWidth(set, width) ? scriptTextHtml(text, 'Latn', rtl) : undefined;
  });
}

/**
 * {@link CELLS_DECL} for a line or a run of design text set at the
 * glyphs' own advances (#770): when its characters are cells and spaces
 * and the layout holds it `width` px wide, the sum of their advances
 * (`tracking` after each). The canvas, which measured it, kerns fewer
 * pairs of kana than the browser's layout does: the running head
 * `日本語テキスト処理` in Noto Sans JP at 15.6 px is 140.58 px on the
 * canvas, its nine cells, and 140.13 px in a box. Asked in the language
 * the text is shaped in ({@link shapedText}); nothing where that is not
 * known, or where the canvas kerned the text itself.
 */
function designCellsDecl(text: string, font: string, width: number, tracking: number): string {
  const shaped = shapedText;
  if (!shaped || !hasCJK(text)) return '';
  const cells = cellsOf(text.replace(/[ \u3000]+/g, ''));
  if (!cells) return '';
  const graphemes = graphemesOf(text);
  const sum = withMeasureLanguage(shaped.lang, () => graphemes.reduce((w, g) => w + measureTextWidth(g, font), 0));
  return sameSetWidth(sum + tracking * graphemes.length, width) ? CELLS_DECL : '';
}

/**
 * A line of design text that carries directions (`VDTDesignTextLine.order`),
 * as the markup inside its line box (#770): each run in a box of its own,
 * at the place the layout gave it along the line and in its own direction.
 *
 * The canvas paints such a line run by run, each run a text of its own
 * shaped right to left or left to right, and since #770 the layout
 * measures each run so. Set inline in one line box, the browser shapes
 * across the runs: a bracket takes the script of the run beside it and of
 * the bracket it closes (the date `(٧٣٢–٨٠٨هـ)` in Amiri at 25 px is 122.5
 * px run by run and 127.6 px as one line), and the browser orders the
 * runs itself. A box per run is shaped alone, as the canvas shapes it;
 * the markup stays in logical order, so the text copies as written. The
 * boxes carry `white-space:pre` and their line box does not: a mirrored
 * flow turns each of them back about itself (`MIRRORED_FLOW_STYLE`).
 */
function directedDesignRunsHtml(line: VDTDesignTextBlock['lines'][number], block: VDTDesignTextBlock, font: string, tracked: boolean): string {
  const runs = line.runs!;
  const at = new Array<number>(runs.length).fill(0);
  let x = 0;
  // The order the canvas advances in: the line's when it lists every run,
  // else the runs' own (a mirrored flow may leave it out).
  const order = line.order && line.order.length === runs.length ? line.order : runs.map((_, i) => i);
  for (const i of order) {
    at[i] = x;
    x += runs[i]!.width;
  }
  return runs.map((run, i) => {
    const runFont = quoteFontString(run.fontString);
    const cjkDecl = hasCJK(run.text) ? cjkTextDecl(tracked) : '';
    // A run of several words in the line's font: a box per word, in a run
    // box as wide as the run (see `runWordBoxesHtml`).
    const words = runFont === font && !cjkDecl && !tracked ? runWordBoxesHtml(run.text, run.fontString, run.rtl === true, run.width) : undefined;
    const text = words ?? letterlessRunHtml(run.text, run.fontString, run.rtl === true, run.width, block.letterSpacingPx ?? 0) ?? wordsHtml(run.text, trackedIn(run.fontString, block.letterSpacingPx));
    const top = run.baselineShift ? `${run.baselineShift.toFixed(3)}px` : '0';
    // A run in a colour of its own (a part row's leader, #1121).
    const colorDecl = run.color ? `color:${run.color};` : '';
    const pos = `position:absolute;left:${at[i]!.toFixed(3)}px;top:${top};white-space:pre;${words !== undefined ? `width:${run.width.toFixed(3)}px;` : ''}${cjkDecl}${colorDecl}`;
    // A run in another face sits on the baseline of the line's own.
    const inner = runFont !== font
      ? `<span style="font:${runFont};line-height:0;${cjkDecl ? cjkFeaturesDecl(tracked) : tracked ? ligaturesDecl() : ''}">${text}</span>`
      : text;
    return `<span dir="${run.rtl ? 'rtl' : 'ltr'}" style="${pos}">${inner}</span>`;
  }).join('');
}

/**
 * A run of a directed design line as a box per word and per run of
 * spaces, each at the place the canvas gives it (#770), or undefined
 * where {@link wordsHtml} sets it.
 *
 * {@link wordsHtml} puts each run of spaces in an inline box, and a box
 * in a line is as wide as a whole number of layout units: the opener
 * `الإخراج مجموعة صفحات، …` of the Arabic guide, 17 words in Amiri at
 * 47.92 px, has 16 spaces of 13.98 px, each 14 px in its box, and the
 * run ended 0.30 px past its 1699.42 px. With every word at its own
 * place nothing adds up ({@link wordBoxesHtml}, which sets a line with no
 * runs so). The places are the canvas's, which shapes a run word by
 * word: each word alone in the run's direction, each run of spaces
 * alone, from the run's start side (its right for a right-to-left run);
 * the caller gives the run's box its width. Only where the words set so
 * add up to the run as the layout measured it (0.01 px), so a run
 * measured otherwise (a document that keeps its host's language, a
 * tracked text) is written as it was; not for a run with a word with no
 * letter, which alone takes other forms than in its text, nor where the
 * language is not known.
 */
function runWordBoxesHtml(text: string, font: string, rtl: boolean, width: number): string | undefined {
  const shaped = shapedText;
  if (!shaped || text.indexOf(' ') < 0 || text.trim() === '') return undefined;
  const parts = text.split(/( +)/).filter((part) => part !== '');
  if (parts.some((part) => part[0] !== ' ' && isLetterless(part))) return undefined;
  return withMeasureLanguage(shaped.lang, () => {
    const side = rtl ? 'right' : 'left';
    let x = 0;
    let out = '';
    for (const part of parts) {
      out += `<span style="position:absolute;${side}:${x.toFixed(3)}px;top:0;">${esc(part)}</span>`;
      x += part[0] !== ' ' && rtl ? rtlTextWidth(part, font) : measureTextWidth(part, font);
    }
    return Math.abs(x - width) <= 0.01 ? out : undefined;
  });
}

/** Inline chip (`:chip[…]`): the box — fill, outline, radius — as one
 *  decorative span (`x` is the segment's left edge; the box starts after its
 *  gap margin), then the text runs as ordinary text spans on the line's
 *  baseline (`baselineOffset` from the line top), so the words stay real,
 *  selectable text. `lineFont` / `lineColor` are the line box's own. */
/**
 * Letters to trace (#1017): the dots of `text` (its run painted at `left`
 * on the baseline `baseline`, `width` wide) in an SVG as wide as the run,
 * so that a mirrored flow turns them back about the run's box as it turns
 * every SVG; each dot a round cap of a stroke a hundredth of a pixel long.
 * `null` where there is no canvas to read the letters from.
 */
export function textDotsSvg(
  text: string,
  fontString: string,
  dots: VDTTextDots,
  color: string,
  left: number,
  baseline: number,
  letterSpacingPx: number,
  rtl: boolean,
): string | null {
  const found = textDots({ text, font: fontString, spacingPx: dots.spacingPx, letterSpacingPx: joiningScriptIn(text) ? 0 : letterSpacingPx, rtl });
  if (!found) return null;
  if (found.points.length === 0) return '';
  let d = '';
  for (let i = 0; i < found.points.length; i += 2) d += `M${found.points[i]!.toFixed(2)} ${found.points[i + 1]!.toFixed(2)}h.01`;
  const w = Math.max(0.01, found.width);
  return (
    `<svg aria-hidden="true" focusable="false" width="${w.toFixed(3)}" height="1" viewBox="0 0 ${w.toFixed(3)} 1" ` +
    `style="position:absolute;left:${left.toFixed(3)}px;top:${baseline.toFixed(3)}px;overflow:visible;">` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${dots.sizePx.toFixed(3)}" stroke-linecap="round"/></svg>`
  );
}

/** The dots of every run of a design text block, in its box's frame
 *  (see {@link textDotsSvg}); `null` when they cannot be drawn. */
function designTextDotsHtml(block: VDTDesignTextBlock, dots: VDTTextDots): string | null {
  const out: string[] = [];
  for (const line of block.lines) {
    const baseline = line.baselineY - block.bbox.y;
    const runs = line.runs ?? [{ text: line.text, fontString: block.fontString, width: line.width }];
    const order = line.order && line.order.length === runs.length ? line.order : runs.map((_, i) => i);
    let x = line.xOffset;
    for (const i of order) {
      const run = runs[i]! as VDTDesignTextRun;
      if (!run.leader && !run.chip) {
        const svg = textDotsSvg(run.text, run.fontString, dots, block.color, x + (run.inkOffset ?? 0), baseline + (run.baselineShift ?? 0), block.letterSpacingPx ?? 0, run.rtl === true);
        if (svg === null) return null;
        out.push(svg);
      }
      x += run.width;
    }
  }
  return out.join('');
}

export function extractFontSizePx(fontString: string): number {
  // From a number's first digit only (`\D` before it): linear on long digit runs.
  const m = fontString.match(/(?:^|\D)(\d+(?:\.\d+)?)px/);
  return m ? parseFloat(m[1]) : 16;
}

function boxStyleDecls(style: VDTDesignBoxStyle): string {
  const bg = style.backgroundColor ? `background:${style.backgroundColor};` : '';
  const border = style.borderColor && style.borderWidthPx > 0
    ? `border:${style.borderWidthPx}px solid ${style.borderColor};box-sizing:border-box;`
    : '';
  const radius = style.borderRadiusPx > 0 ? `border-radius:${style.borderRadiusPx}px;` : '';
  if (!style.borderRadiiPx && !style.borderSides) return `${bg}${border}${radius}`;
  // Corners of their own and a border per side (#1059), as CSS draws them.
  const radii = style.borderRadiiPx
    ? `border-radius:${style.borderRadiiPx.map((r) => `${Math.max(0, r)}px`).join(' ')};`
    : radius;
  const sides = style.borderSides;
  if (!sides) return `${bg}${border}${radii}`;
  const each = (['top', 'right', 'bottom', 'left'] as const)
    .map((side) => {
      const b = sides[side];
      return b && b.widthPx > 0 ? `border-${side}:${b.widthPx}px solid ${b.color};` : '';
    })
    .join('');
  return `${bg}${each ? `${each}box-sizing:border-box;` : ''}${radii}`;
}

function renderBoxAt(bbox: BoundingBox, style: VDTDesignBoxStyle): string {
  if (bbox.width <= 0 || bbox.height <= 0) return '';
  if (!style.backgroundColor && !style.borderColor && !style.borderSides) return '';
  return (
    `<div aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${bbox.x}px;top:${bbox.y}px;` +
    `width:${bbox.width}px;height:${bbox.height}px;` +
    boxStyleDecls(style) +
    `"></div>`
  );
}

/** Whether a line of design text carries one run that is its whole text
 *  in the block's own font, set at its advance with nothing of its own (no
 *  shift, no box, no direction) and no CJK character, which the composer
 *  measures alone: a line without runs by another name. */
function isPlainRun(line: VDTDesignTextBlock['lines'][number], block: VDTDesignTextBlock): boolean {
  const run = line.runs?.length === 1 ? line.runs[0]! : undefined;
  return run !== undefined && line.order === undefined && run.text === line.text && run.fontString === block.fontString && !hasCJK(run.text)
    && !run.baselineShift && !run.stacked && !run.tcy && !run.orientation && !run.rtl && run.inkOffset === undefined && run.inkScale === undefined && !run.chip;
}

export function renderDesignTextBlock(block: VDTDesignTextBlock, options?: HtmlPaint): string {
  const parts: string[] = [];
  if (block.box) parts.push(renderBoxAt(block.bbox, block.box));
  if (options?.vertical) return parts.join('') + renderVerticalDesignText(block, options.vertical);
  if (block.vertical) return parts.join('') + renderTurnedDesignText(block);
  const font = quoteFontString(block.fontString);
  const fontSize = extractFontSizePx(block.fontString);
  // A tracked text keeps its ligatures, as it was measured (#703): the
  // block's box asks for them after its `letter-spacing`, each run in
  // another face after its `font`, and a box that takes the CJK
  // declarations holds both sets of features.
  const tracked = !!block.letterSpacingPx;
  const lineParts: string[] = [];
  for (const line of block.lines) {
    const top = line.baselineY - block.bbox.y - fontSize * 0.8;
    // Inline marks: the runs as inline spans on the line's baseline, each
    // in its own font; a script is shifted off the baseline. Of a subscript
    // and a superscript set over each other, the first sits in a box that
    // takes no room and the second in one as wide as the pair (EF-80).
    // Each run was measured whole, and so was a line without runs: the
    // browser's punctuation trimming is off on those that hold CJK text.
    // A line of several words in the block's font: a box per word (see
    // `wordBoxesHtml`), in a line box as wide as the line. So is a line
    // of one run that is its text in the block's font (the CJK composer
    // gives every line of a design text its runs): written through
    // `wordsHtml`, the colophon `Set in Noto Serif TC, … (SIL OFL).` in
    // Source Serif 4 at 13.54 px ended 0.31 px past its 520.63 px, a 64th
    // of a pixel and more at each of its 16 spaces.
    const words = line.runs && !isPlainRun(line, block) ? undefined : wordBoxesHtml(line.text, block.fontString, block.letterSpacingPx ?? 0, line.wordSpacingPx ?? 0);
    const inner = words !== undefined ? words
      : line.runs
      ? line.runs.map((run, i) => {
          // A heading title's chip (#1162): a box as wide as its advance
          // at the top of the line, holding the chip's box and words where
          // the line's baseline is (0.8 of the size down, as the line is
          // placed).
          if (run.chip) {
            const indent = run.inkOffset ? run.inkOffset : 0;
            return `<span style="display:inline-block;vertical-align:top;position:relative;width:${run.width.toFixed(3)}px;height:1em;">`
              + renderChip(run.chip, indent, fontSize * 0.8, font, block.color, () => block.color, options?.dir ?? 'ltr')
              + '</span>';
          }
          const runFont = quoteFontString(run.fontString);
          const cjkDecl = hasCJK(run.text) ? cjkTextDecl(tracked) : '';
          // The `font` shorthand resets `line-height` to `normal`: a run in
          // another face would grow the line box and push the line's
          // baseline down. It keeps the line's own.
          const fontDecl = runFont !== font ? `font:${runFont};line-height:1;${tracked && !cjkDecl ? ligaturesDecl() : ''}` : '';
          // A run whose width is its box comes from the CJK composer,
          // which measured its characters one by one: its cells are set
          // with no kerning between them (see {@link CELLS_DECL}).
          const cellsDecl = run.inkOffset !== undefined ? (cellsOf(run.text) ? CELLS_DECL : '')
            : designCellsDecl(run.text, run.fontString, run.width, block.letterSpacingPx ?? 0);
          const stackDecl = run.stacked
            ? 'display:inline-block;width:0;'
            : line.runs![i - 1]?.stacked ? `display:inline-block;min-width:${run.width.toFixed(3)}px;` : '';
          const shiftDecl = run.baselineShift ? `position:relative;top:${run.baselineShift.toFixed(3)}px;` : '';
          // A run whose width is its box, not its glyphs' advance (a CJK
          // mark that gave up blank, a Han–Latin space, #637): a box that
          // wide, its glyphs set `inkOffset` into it.
          const boxDecl = run.inkOffset !== undefined && !run.stacked
            ? `display:inline-block;width:${run.width.toFixed(3)}px;${run.inkOffset !== 0 ? `text-indent:${run.inkOffset.toFixed(3)}px;` : ''}`
            : '';
          // A dash of a 破折号 (`inkScale`, #652): a box of its own inside
          // the run's, stretched from where the run's indent puts its
          // glyph, as a body segment's is.
          const text = run.inkScale !== undefined
            ? `<span style="display:inline-block;text-indent:0;${inkScaleDecl(run.inkScale)}">${esc(run.text)}</span>`
            // A run whose width is its box holds no word space: its box
            // indents its text, and so would a box inside it.
            : run.inkOffset !== undefined ? esc(run.text)
            : wordsHtml(run.text, trackedIn(run.fontString, block.letterSpacingPx));
          // A contents part row's leader (#889): painted, hidden from
          // assistive technology, as an entry row's is.
          const hidden = run.leader ? ' aria-hidden="true"' : '';
          // In a colour of its own when the contents give it one (#1121).
          const colorDecl = run.color ? `color:${run.color};` : '';
          return fontDecl || cjkDecl || stackDecl || shiftDecl || boxDecl || hidden || colorDecl ? `<span${hidden} style="${fontDecl}${cjkDecl}${cellsDecl}${stackDecl}${shiftDecl}${boxDecl}${colorDecl}">${text}</span>` : text;
        }).join('')
      : letterlessRunHtml(line.text, block.fontString, false, line.width, block.letterSpacingPx ?? 0) ?? wordsHtml(line.text, trackedIn(block.fontString, block.letterSpacingPx));
    // A line that carries directions (an order, a right-to-left run): a box
    // per run (see `directedDesignRunsHtml`), unless a run is set otherwise
    // than as its text at its advance (a stacked script, a box of the CJK
    // composer).
    const apartable = line.runs !== undefined
      && line.runs.every((run) => !run.stacked && run.inkOffset === undefined && run.inkScale === undefined && !run.tcy && !run.orientation && !run.chip);
    // So is a line of several runs with no CJK text, in a document shaped
    // in its own language: the canvas starts each run where the widths
    // before it end, and inline every run, every space in its box and
    // every span is as wide as a whole number of 64ths of a pixel. The
    // byline `John Jumper¹,⁴, Richard Evans¹,⁴, …` in Noto Sans at 15.42
    // px, fifteen runs and fourteen spaces, had its last run 0.32 px past
    // its place, and three more lines of it 0.30 to 0.46 px; a box per
    // run, 0.02 px at most.
    const apart = ownShaping && apartable && words === undefined && line.runs!.length > 1 && !line.runs!.some((run) => hasCJK(run.text));
    const directed = apart || (apartable && (line.order !== undefined || line.runs!.some((run) => run.rtl)));
    const lineDecl = !line.runs && hasCJK(line.text) ? cjkTextDecl(tracked) + designCellsDecl(line.text, block.fontString, line.width, block.letterSpacingPx ?? 0) : '';
    // A justified line: its word spaces widened as the canvas and the PDF
    // advance its runs (EF-109).
    const wordSpacingDecl = line.wordSpacingPx ? `word-spacing:${line.wordSpacingPx.toFixed(3)}px;` : '';
    // A right-to-left text: the line box reads at that base direction, and
    // the browser orders its runs (written in logical order) as the engine
    // did (`VDTDesignTextLine.order`), which keeps copied text logical.
    const lineDir = dirAttr(block.direction === 'rtl' ? 'rtl' : 'ltr', options?.dir ?? 'ltr');
    lineParts.push(
      `<span${lineDir} style="` +
      `position:absolute;` +
      `left:${line.xOffset.toFixed(3)}px;` +
      `top:${top.toFixed(3)}px;` +
      (directed ? 'line-height:1;' : 'line-height:1;white-space:pre;') +
      (words !== undefined ? `width:${line.width.toFixed(3)}px;` : '') +
      wordSpacingDecl +
      lineDecl +
      `">${directed ? directedDesignRunsHtml(line, block, font, tracked) : inner}</span>`,
    );
  }
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;${ligaturesDecl()}` : '';
  // Letters to trace (#1017): the dots over the text, which stays,
  // transparent, to be selected and read.
  const dots = block.dotted ? designTextDotsHtml(block, block.dotted) : null;
  if (dots !== null) lineParts.push(dots);
  // An outline over the glyphs (centred on their edges, as on canvas and in
  // the PDF); hollow letters leave the fill transparent.
  const strokeDecl = dots !== null ? '' : block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` +
      (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  // Pagination furniture (a split callout's repeated title and marker) is
  // read once: hidden from assistive technology.
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  parts.push(
    `<div${hidden} style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${block.bbox.width}px;height:${block.bbox.height}px;` +
    `font:${font};color:${dots !== null ? 'transparent' : block.color};` +
    clipDecl + trackingDecl + strokeDecl +
    `">${lineParts.join('')}</div>`,
  );
  return parts.join('');
}

/** A design text of a vertical page's flow: its lines set down the
 *  column, clipped, tracked and outlined as a horizontal one. A line's
 *  `xOffset` is from the block's own edge (as in `renderDesignTextBlock`),
 *  its `baselineY` in the flow: only the latter is taken back to the box. */
function renderVerticalDesignText(block: VDTDesignTextBlock, v: VerticalHtml): string {
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;` : '';
  const strokeDecl = block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` + (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  return (
    `<div${hidden} style="position:absolute;left:${block.bbox.x}px;top:${block.bbox.y}px;width:${block.bbox.width}px;height:${block.bbox.height}px;${clipDecl}${trackingDecl}${strokeDecl}">` +
    verticalDesignLines(block, v, 0, -block.bbox.y) +
    `</div>`
  );
}

/** A design text set vertically on a page or slot whose text is
 *  horizontal (`VDTDesignTextBlock.vertical`): its lines in the block's own
 *  frame, turned a quarter turn clockwise about the box's top right corner,
 *  each line turned back upright and set vertically. */
function renderTurnedDesignText(block: VDTDesignTextBlock): string {
  const vt = block.vertical!;
  const v: VerticalHtml = { region: vt.region, uprightDigits: vt.uprightDigits, axes: vt.centralBaselines };
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;` : '';
  const strokeDecl = block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` + (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  const { x, y, width, height } = block.bbox;
  return (
    `<div${hidden} style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;${clipDecl}${trackingDecl}${strokeDecl}">` +
    `<div style="position:absolute;left:${width}px;top:0;width:${height}px;height:${width}px;transform:rotate(90deg);transform-origin:0 0;">` +
    verticalDesignLines(block, v, 0, 0) +
    `</div></div>`
  );
}

function renderDesignRuleBlock(block: VDTDesignRuleBlock): string {
  const w = block.direction === 'vertical' ? block.thicknessPx : block.bbox.width;
  const h = block.direction === 'vertical' ? block.bbox.height : block.thicknessPx;
  return (
    `<div aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${w}px;height:${h}px;` +
    `background:${block.color};` +
    `"></div>`
  );
}

/** A vector shape (DESIGN §12.1, #1055): an inline `<svg>` placed on its
 *  box like a rule, its outline and markers drawn in the box's own
 *  coordinates (ink past the box, a mitre, still shows). Decoration:
 *  hidden from assistive technology. */
export function renderDesignPathBlock(block: VDTDesignPathBlock, mirrored = false): string {
  const { x, y, width, height } = block.bbox;
  const parts: string[] = [];
  const stroke = block.stroke && block.stroke.widthPx > 0 ? block.stroke : undefined;
  if ((block.fill || stroke) && block.subpaths.length > 0) {
    const attrs = [`d="${pathSvgData(block.subpaths, x, y)}"`, `fill="${block.fill ? esc(block.fill) : 'none'}"`];
    if (block.fill && block.fillRule === 'evenodd') attrs.push('fill-rule="evenodd"');
    if (stroke) {
      attrs.push(`stroke="${esc(stroke.color)}"`, `stroke-width="${stroke.widthPx}"`);
      if (stroke.dash && stroke.dash.length > 0) attrs.push(`stroke-dasharray="${stroke.dash.join(' ')}"`);
      if (stroke.cap && stroke.cap !== 'butt') attrs.push(`stroke-linecap="${stroke.cap}"`);
      if (stroke.join && stroke.join !== 'miter') attrs.push(`stroke-linejoin="${stroke.join}"`);
    }
    parts.push(`<path ${attrs.join(' ')}/>`);
  }
  for (const m of block.markers ?? []) parts.push(markerSvgElement(m, x, y, esc));
  if (parts.length === 0) return '';
  return (
    `<svg${mirrored ? ' class="pt-path"' : ''} aria-hidden="true" focusable="false" width="${width}" height="${height}" ` +
    `style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:visible;">` +
    parts.join('') +
    `</svg>`
  );
}

function renderDesignBoxBlock(block: VDTDesignBoxBlock): string {
  const html = renderBoxAt(block.bbox, block.box);
  // A callout stripe on a rounded frame: clipped to the frame's outline.
  return block.clip ? clipToOutline(html, block.clip) : html;
}

/** Image block (a callout icon, a picture a design draws): `<img>` from
 *  `resourceImageUrl` — with its alternative text when it is content
 *  (`VDTDesignImageBlock.altText`), else `alt=""` and
 *  `role="presentation"` — or a neutral placeholder box when the host
 *  cannot supply the image. */
function renderDesignImageBlock(block: VDTDesignImageBlock, options?: HtmlPaint): string {
  const { x, y, width, height } = block.bbox;
  if (width <= 0 || height <= 0) return '';
  const url = imageUrl(options, block.fileId);
  if (url) {
    const svg = block.imageKind === undefined ? undefined : block.imageKind === 'svg';
    const tinted = options ? tintFilterDecl(options, block.tint) : '';
    const filter = tinted || (options ? inkFilterDecl(options, svg, url) : '');
    const alt = block.altText ? `alt="${esc(block.altText)}"` : 'alt="" role="presentation"';
    if (options?.vertical) {
      // A picture of a vertical page's flow stands upright on the sheet:
      // turned back inside its box, which runs `width` down the sheet and
      // `height` across it (sized for that when `upright`, else fitted
      // keeping its proportions, as the canvas draws it).
      const k = block.upright ? 1 : Math.min(height / width, width / height);
      // A cover crop (#946): the whole picture over its uncropped box in
      // the upright frame, the box clipping it.
      const c = block.upright ? block.crop : undefined;
      const dw = c ? height / c.width : block.upright ? height : width * k;
      const dh = c ? width / c.height : block.upright ? width : height * k;
      const ox = c ? -c.x * dw : block.upright ? 0 : (height - dw) / 2;
      const oy = c ? -c.y * dh : block.upright ? 0 : (width - dh) / 2;
      return (
        `<div style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;${c ? 'overflow:hidden;' : ''}">` +
        `<img src="${esc(url)}" ${alt} style="position:absolute;left:0;top:0;width:${dw}px;height:${dh}px;` +
        `transform:translate(0,${height}px) rotate(-90deg) translate(${ox}px,${oy}px);transform-origin:0 0;${filter}" /></div>`
      );
    }
    if (block.crop) {
      // A cover crop (#923): the whole picture over its uncropped box, in a
      // box that clips it to the element's.
      const c = block.crop;
      const w = width / c.width;
      const h = height / c.height;
      return (
        `<div style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:hidden;">` +
        `<img src="${esc(url)}" ${alt} style="position:absolute;left:${-c.x * w}px;top:${-c.y * h}px;width:${w}px;height:${h}px;max-width:none;${filter}" /></div>`
      );
    }
    return (
      `<img src="${esc(url)}" ${alt} style="position:absolute;` +
      `left:${x}px;top:${y}px;width:${width}px;height:${height}px;${filter}" />`
    );
  }
  return (
    `<div aria-hidden="true" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${width}px;height:${height}px;` +
    `background:rgba(160,160,160,0.12);border:1px solid rgba(160,160,160,0.5);box-sizing:border-box;` +
    `"></div>`
  );
}

function renderDesignBlock(block: VDTDesignBlock, options?: HtmlPaint, mirroredPaths = false): string {
  if (block.kind === 'text') return renderDesignTextBlock(block, options);
  if (block.kind === 'rule') return renderDesignRuleBlock(block);
  if (block.kind === 'image') return renderDesignImageBlock(block, options);
  if (block.kind === 'path') return renderDesignPathBlock(block, mirroredPaths);
  return renderDesignBoxBlock(block);
}

export function renderDesignSlot(slot: VDTDesignSlot, options?: HtmlPaint, mirroredPaths = false): string {
  const parts: string[] = [];
  for (const block of slot.blocks) parts.push(renderDesignBlock(block, options, mirroredPaths));
  return parts.join('');
}
