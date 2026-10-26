import { concatTransformationMatrix, popGraphicsState, pushGraphicsState } from 'pdf-lib';
import { isJapaneseLanguage, joinsLetters, leaderRuleGeometry, lineTextAlign, markerRuns, markerSetText, segmentOrientation } from 'postext';
import type { Color, PDFFont } from 'pdf-lib';
import type { VDTBlock, VDTDropCap, VDTLine, VDTLineSegment, MathRender } from 'postext';
import { parseFontString } from '../fontString.js';
import { FontCache } from '../fontCache.js';
import { type PageCtx, alphaOf, alphaStateOp, beginActualTextSpan, cellPieces, counterFlipPx, cjkLineText, readText, compressedMarkSpacingPx, drawLinePx, drawMeasuredTextPx, drawTextPx, colorFromHex, endActualTextSpan, fillRectPx, setTrackingPx, textAdvancePx, type LineTextState, paintInScript } from './primitives.js';
import { paintChip } from './chip.js';
import { renderScoreSegment } from './scoreRender.js';
import { drawTaskBoxPx } from './taskBox.js';
import { drawRightToLeftRun } from './rtlRun.js';
import { pickSegmentColor, pickSegmentFont } from './fontHelpers.js';
import { renderHeaderFooterSlot } from './headerFooter.js';
import {
  renderResourceBlock,
  type ResourceImageMap,
} from './renderResourceBlock.js';
import { LinkRegistry, RefRun, refTarget, UriRuns } from './links.js';
import { tagArtifact, tagContent, type StructElem } from './tagging.js';
import type { StructureFlow } from './structureFlow.js';
import { paintKunten, paintLineHighlights, paintLineMarks, paintRuby, paintSideMarker, paintWarichu } from './annotations.js';
import { inkScaleOperators } from './inkScale.js';
import { paintSwatchSegmentPdf } from './inlineIcon.js';
import { drawShapedTextPx, drawStyledWordPx } from './shapedText.js';
import { segmentLanguages, segmentOffsets, wordParts } from './directedLine.js';
import { needsComplexShaping } from '../complexShaping.js';
import { shapesAsCanvas, shapesSegmentLanguages, withinWideText, withSegmentLanguage } from '../shapingLanguage.js';
import { wordSegments } from './wordPieces.js';

/** Per-document context for resource rendering, threaded through `renderBlock`. */
export interface ResourceRenderContext {
  images: ResourceImageMap;
  linkRegistry: LinkRegistry;
  /** Structure mapping of an accessible (tagged) render; absent otherwise. */
  structure?: StructureFlow;
}

/** The link destination of a footnote of the document being drawn
 *  (`LinkRegistry.documentIndex`: note ids repeat from chapter to chapter).
 *  A key no resource id takes: it opens with a NUL. */
function footnoteDestination(linkRegistry: LinkRegistry | undefined, id: string): string {
  return `\u0000fn${linkRegistry?.documentIndex ?? 0}:${id}`;
}

function renderMathRender(
  ctx: PageCtx,
  render: MathRender,
  topLeftXPx: number,
  topLeftYPx: number,
  fallbackColor: Color,
): void {
  if (!render.paths.length || render.viewBox.width <= 0 || render.viewBox.height <= 0) return;
  const { scale: pxToPt, pageHeightPt } = ctx;
  const pxPerVb = render.widthPx / render.viewBox.width;
  const S = pxPerVb * pxToPt;
  const x = topLeftXPx * pxToPt - render.viewBox.minX * S;
  const y = pageHeightPt - topLeftYPx * pxToPt + render.viewBox.minY * S;
  // A formula on a mirrored page reads unmirrored in its box.
  counterFlipPx(ctx, topLeftXPx, render.widthPx, () => paintMathPaths(ctx, render, x, y, S, fallbackColor));
}

function paintMathPaths(ctx: PageCtx, render: MathRender, x: number, y: number, S: number, fallbackColor: Color): void {
  for (const path of render.paths) {
    // MathJax fills are `currentColor` or a hex; an unpainted path (`none`,
    // as a stroke-only rule leaves after flattening) draws nothing, and any
    // other keyword falls back to the text colour.
    if (path.fill === 'none') continue;
    const color = path.fill.startsWith('#') ? colorFromHex(path.fill, ctx.colorSpace) : fallbackColor;
    // A translucent text colour: the constant alpha wraps the path (pdf-lib
    // would add an ExtGState per path otherwise).
    const gs = alphaStateOp(ctx, alphaOf(color));
    if (gs) ctx.page.pushOperators(pushGraphicsState(), gs);
    ctx.page.drawSvgPath(path.d, { x, y, scale: S, color });
    if (gs) ctx.page.pushOperators(popGraphicsState());
  }
}

/** Paint an inline formula segment on its line's baseline (body lines,
 *  and caption, note and cell lines, #541). */
export function renderMathSegment(
  ctx: PageCtx,
  seg: VDTLineSegment,
  xPx: number,
  baselinePx: number,
  fallbackColor: Color,
): void {
  if (!seg.mathRender) return;
  renderMathRender(ctx, seg.mathRender, xPx, baselinePx - seg.mathRender.ascentPx, fallbackColor);
}

/**
 * The text of a segment of a composed line (see {@link renderSegments}):
 * a compressed CJK mark painted before its box (`inkOffset`) with the
 * character spacing that advances it to its box's end, a segment's own
 * tracking, a dash of a 破折号 stretched over its em (`inkScale`), the
 * orientation forced down a vertical line, and a ruby base's reading.
 */
function paintComposedText(
  ctx: PageCtx,
  seg: VDTLineSegment,
  x: number,
  baseline: number,
  font: PDFFont,
  size: number,
  color: Color,
  colorHex: string,
  actualText: string | undefined,
  tracking: number,
  fontCache: FontCache,
  blockFont: PDFFont,
  rubyElem: StructElem | undefined,
  /** The character's text element, which its kanbun marks join. */
  textElem?: StructElem,
): void {
  // A compressed CJK mark is painted before its box (`inkOffset`) and
  // advances to its box's end.
  // (Down a vertical line every cell is one em: no mark shown narrower.)
  const markSpacing = ctx.vertical ? undefined : compressedMarkSpacingPx(font, seg, size);
  if (markSpacing !== undefined) setTrackingPx(ctx, markSpacing);
  else if (seg.tracking !== undefined) setTrackingPx(ctx, tracking + seg.tracking);
  // A dash of a 破折号 is stretched over its em (`inkScale`); down a
  // vertical line it is shown turned with the frame (sideways), so the
  // stretch runs down the column.
  const stretch = inkScaleOperators(seg.inkScale);
  const orient = ctx.vertical && seg.inkScale !== undefined ? 'sideways' : segmentOrientation(seg);
  ctx.page.pushOperators(...stretch.before);
  // Characters the composer measured one by one are painted one by one,
  // each in its place (#770): a face may kern them in one string.
  const cells = ctx.vertical || markSpacing !== undefined || seg.inkScale !== undefined ? undefined : cellPieces(font, seg.text, seg.width, size, ctx.trackingPx ?? 0);
  if (!cells || !drawMeasuredTextPx(ctx, cells, x + (seg.inkOffset ?? 0), baseline + (seg.baselineShift ?? 0), font, size, color, ctx.trackingPx ?? 0, actualText)) {
    drawTextPx(ctx, seg.text, x + (seg.inkOffset ?? 0), baseline + (seg.baselineShift ?? 0), font, size, color, undefined, actualText, orient);
  }
  ctx.page.pushOperators(...stretch.after);
  if (markSpacing !== undefined || seg.tracking !== undefined) setTrackingPx(ctx, tracking);
  if (seg.ruby) {
    if (tracking !== 0) setTrackingPx(ctx, 0);
    paintRuby(ctx, seg.ruby, x, baseline, colorHex, fontCache, blockFont, rubyElem);
    if (tracking !== 0) setTrackingPx(ctx, tracking);
  }
  if (seg.kunten) {
    // Kanbun marks (#430).
    if (tracking !== 0) setTrackingPx(ctx, 0);
    paintKunten(ctx, seg.kunten, x, baseline, colorHex, fontCache, blockFont, textElem);
    if (tracking !== 0) setTrackingPx(ctx, tracking);
  }
}

/**
 * Paint a line's segments left to right starting at `startX`. When
 * `justifiedSpaceWidth` is set, spaces advance by it instead of their
 * measured width. `:ref` segments record a link annotation rectangle so the
 * reference is clickable in the final PDF.
 *
 * In a tagged render (`elem` set) the text joins `elem`, each inline formula
 * gets its own `Formula` element (alt text = its TeX) and each ref a `Link`
 * element; word spaces are painted as real space glyphs so text extraction
 * never has to infer them from the gaps of a justified line. A ref painted
 * as several runs (small capitals; the later runs flagged `refContinues`)
 * is still one `Link` element with one annotation over all its runs.
 *
 * A line of the CJK composer and any line down a vertical page (`composed`)
 * read the composer's fields — a segment's `tracking`, `inkOffset`,
 * `inkScale`, `autospace`, `ruby` and `warichu` — and are read as one
 * `/ActualText`. Any other line was set word by word and carries none of
 * them: its segments are painted as every line was before the CJK
 * features, with no further look at each one.
 *
 * A line that carries directions ({@link isDirected}: a right-to-left run
 * on it) is laid out in `line.order`, left to right on the sheet (flow
 * order on a mirrored page), each right-to-left segment shaped as one run
 * by HarfBuzz (`shapedText.ts`), its glyphs shown in visual order, as every
 * right-to-left PDF shows them. The segments are then painted, and tagged,
 * in logical order, each at the place `order` gave it: the content stream,
 * the marked-content sequences and the structure tree read the line as it
 * was written, and readers that order text by position (Poppler) place it
 * by its glyphs. A run of such a line in another language than the
 * document's ({@link segmentLanguages}) is a `Span` with its own `/Lang`,
 * and so is one of a composed line of a Japanese document, or of a
 * composed line holding Japanese text (#427).
 *
 * A segment in a language of its own (`VDTLineSegment.lang`) is shaped in
 * that language, as it was measured (`shapingLanguage.ts`, #764): a
 * Japanese word in a Chinese book takes the Japanese forms of a pan-CJK
 * face, a Catalan name in an English one its `l·l`. In a document that
 * keeps the host's language only Japanese has forms of its own, and a
 * word HarfBuzz shapes is told no language, as before.
 *
 * A word set in several styles (`VDTLineSegment.runs`, a bold letter in an
 * Arabic word) is shaped whole and each glyph painted in its run's style
 * (`drawStyledWordPx`).
 *
 * `segments` are the line's own, or, in a document shaped in its own
 * language, those with the pieces of a word measured whole joined
 * (`wordPieces.ts`).
 */
function renderSegments(
  ctx: PageCtx,
  segments: VDTLineSegment[],
  startX: number,
  baseline: number,
  line: VDTLine,
  block: VDTBlock,
  blockFont: PDFFont,
  blockSize: number,
  blockColor: Color,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
  justifiedSpaceWidth?: number,
  /** The character spacing the line is painted with (block + line, px);
   *  a segment's own tracking (a justified CJK line) goes on top of it. */
  tracking = 0,
  /** The first line of a paragraph a drop cap opens (#623). */
  capLead?: CapLead,
): void {
  let x = startX;
  const refRun = new RefRun();
  // The first word, which the drop cap opens: its text segments on this
  // line read as the whole word (the initial reads as nothing) and join
  // the word's `Span`.
  let capPrefix = capLead?.prefix;
  let capRest = capLead?.rest ?? 0;
  const uris = new UriRuns(ctx, line, linkRegistry, elem);
  const repeatedAt = repeatedHyphenSegment(line, segments);
  const composed = line.cjkComposed === true || ctx.vertical !== undefined;
  const directed = isDirected(line);
  // The order segments are laid out in, left to right (by default
  // theirs), and the x it gives each: they are painted in logical order.
  const order = directed && line.order && line.order.length === segments.length ? line.order : undefined;
  const xs = order ? segmentOffsets(segments, order, startX, (seg) => (seg.kind === 'space' ? (composed && seg.autospace ? seg.width : justifiedSpaceWidth ?? seg.width) : seg.width)) : undefined;
  // Runs in another language than the document's (tagged render only):
  // on a line with directions, and on a composed line in Japanese.
  const docLang = elem?.tree.options.lang;
  const langs = elem && (directed || (composed && japaneseLine(segments, docLang))) ? segmentLanguages(segments, docLang) : undefined;
  let langSpan: { lang: string; elem: StructElem } | undefined;
  const textElemOf = (i: number): StructElem | undefined => {
    const lang = langs?.[i];
    if (!lang) {
      langSpan = undefined;
      return elem;
    }
    if (langSpan?.lang !== lang) langSpan = { lang, elem: elem!.child('Span', { lang }) };
    return langSpan.elem;
  };
  // A composed CJK line (spread characters, Han–Latin spaces) reads as
  // written, not with the gaps between its pieces.
  // A vertical line is painted in runs and cells down the column: it reads
  // as the line too.
  const actualLine = !composed ? undefined : ctx.vertical ? segments.map(readText).join('') : cjkLineText(segments);
  let lineState: LineTextState | undefined;
  if (actualLine !== undefined) {
    const first = segments.find((s) => s.kind === 'text' && !s.chip && s.text !== '');
    const fontStr = first ? first.fontString ?? pickSegmentFont(!!first.bold, !!first.italic, block) : block.fontString;
    lineState = {
      font: fontCache.get(fontStr) ?? blockFont,
      text: first?.text ?? '',
      sizePx: parseFontString(fontStr)?.sizePx ?? blockSize,
      xPx: startX,
      baselinePx: baseline,
    };
    beginActualTextSpan(ctx, actualLine, lineState);
  }
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (xs) x = xs[i]!;
    const textElem = langs ? textElemOf(i) : elem;
    if (seg.kind === 'space') {
      // A space inside a reference label (#702) is read in its `Link`.
      const inLink = uris.space(seg.text) ?? refRun.space(seg);
      if (ctx.tags && seg.text) {
        tagContent(ctx, inLink ?? textElem);
        // The gap of a poem's bayt holds the tab of its plain text (#378),
        // which no face draws: it reads as a space.
        drawTextPx(ctx, seg.text.replace(/\t/g, ' '), x, baseline, blockFont, blockSize, blockColor);
      }
      // A Han–Latin space keeps the width the composer set.
      x += composed && seg.autospace ? seg.width : justifiedSpaceWidth ?? seg.width;
      continue;
    }
    if (seg.leader) {
      // A leader (a contents row's, a tab stop's, #622): a layout artifact
      // under an empty `/ActualText`, so no text extraction reads it.
      uris.other();
      tagArtifact(ctx, { type: 'Layout' });
      if (seg.leader === 'rule') {
        const { dy, thickness } = leaderRuleGeometry(blockSize);
        fillRectPx(ctx, x, baseline + dy - thickness / 2, seg.width, thickness, blockColor);
      } else {
        const fontStr = seg.fontString ?? pickSegmentFont(!!seg.bold, !!seg.italic, block);
        const colorHex = seg.color ?? pickSegmentColor(!!seg.bold, !!seg.italic, block);
        drawTextPx(ctx, seg.text, x, baseline, fontCache.get(fontStr) ?? blockFont, parseFontString(fontStr)?.sizePx ?? blockSize,
          colorHex === block.color ? blockColor : colorFromHex(colorHex, ctx.colorSpace), undefined, '');
      }
      x += seg.width;
      continue;
    }
    if (seg.kind !== 'text' || seg.chip) uris.other();
    if (seg.kind === 'math') {
      if (elem) {
        const formula = elem.type === 'Formula' ? elem : elem.child('Formula', { alt: seg.mathRender?.tex ?? '' });
        tagContent(ctx, formula);
      }
      renderMathSegment(ctx, seg, x, baseline, blockColor);
      x += seg.width;
      continue;
    }
    if (seg.kind === 'score') {
      // A score system (#1172): a Figure in the structure tree, with the
      // score's alt text (each system its own, the first one carrying it).
      if (elem) {
        const figure = elem.type === 'Figure' ? elem : elem.child('Figure', { alt: block.score?.alt ?? '' });
        tagContent(ctx, figure);
      }
      renderScoreSegment(ctx, seg, x, baseline, block.color);
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      paintSwatchSegmentPdf(ctx, seg, x, baseline, blockColor, fontCache, blockFont, elem);
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      paintChip(ctx, seg.chip, x, baseline, fontCache, blockFont, blockSize, elem, (run) => {
        const hex = seg.chip!.color ?? pickSegmentColor(!!run.bold, !!run.italic, block);
        return hex === block.color ? blockColor : colorFromHex(hex, ctx.colorSpace);
      });
      x += seg.width;
      continue;
    }
    if (composed && seg.warichu) {
      // A warichu note's part: its two rows, not its text (#195), with no
      // character spacing.
      if (tracking !== 0) setTrackingPx(ctx, 0);
      paintWarichu(ctx, seg.warichu, x, baseline, pickSegmentColor(!!seg.bold, !!seg.italic, block), fontCache, blockFont, elem);
      if (tracking !== 0) setTrackingPx(ctx, tracking);
      x += seg.width;
      continue;
    }
    const fontStr = seg.fontString ?? pickSegmentFont(!!seg.bold, !!seg.italic, block);
    const font = fontCache.get(fontStr) ?? blockFont;
    const size = parseFontString(fontStr)?.sizePx ?? blockSize;
    const colorHex = seg.color
      ?? (seg.refResourceId !== undefined && block.refColor
        ? block.refColor
        : pickSegmentColor(!!seg.bold, !!seg.italic, block));
    const color = colorHex === block.color ? blockColor : colorFromHex(colorHex, ctx.colorSpace);
    // A `:ref` links to its resource — one `Link` for all the runs of one
    // set in small capitals —, a Markdown link's words to its URL.
    const uriElem = uris.word(seg.refResourceId === undefined ? seg.href : undefined, x, seg.width, seg.text);
    // A footnote marker links to its note, like a `:ref` to its resource
    // and a cross-reference to its anchor (#264).
    const target = refTarget(seg) ?? (seg.footnoteId !== undefined ? footnoteDestination(linkRegistry, seg.footnoteId) : undefined);
    // A marker in the line gap (JLReq §4.2.3) links where its run is:
    // before its segment, which takes no advance.
    const side = seg.sideMarker?.runs[0];
    const link = side ? refRun.enter(seg, x + side.dx, textElem, target, -side.dx) : refRun.enter(seg, x, textElem, target, seg.width);
    // A page number of the index links to its page.
    const pageElem = seg.pageLink !== undefined && elem && !link ? elem.child('Link') : undefined;
    // A ruby base is the `RB` of a `Ruby` whose `RT` holds its reading (#194).
    const holder = link ?? pageElem ?? uriElem ?? textElem;
    const rubyElem = composed && seg.ruby && holder ? holder.child('Ruby') : undefined;
    // The hyphen repeated from the line before is painted but not read.
    let actualText = i === repeatedAt ? seg.text.slice(1) : undefined;
    let capHolder: StructElem | undefined;
    if (capPrefix !== undefined || capRest > 0) {
      const at = Math.min(capRest, seg.text.length);
      actualText = (capPrefix ?? '') + seg.text.slice(at);
      capRest -= at;
      capPrefix = undefined;
      capHolder = capLead?.elem;
    }
    tagContent(ctx, rubyElem ? rubyElem.child('RB') : capHolder ?? holder);
    // On a line with directions each segment is one run: HarfBuzz shapes a
    // right-to-left one (and any complex text), and a word set in several
    // styles. The kashidas justification inserted are painted, not read.
    // A word with no letter is shaped in the script the layout measured it
    // in (`scriptContext`, #725), by HarfBuzz or by fontkit.
    const shaped = !seg.sideMarker && (seg.runs !== undefined || (directed && (seg.rtl || needsComplexShaping(seg.text))))
      && withSegmentLanguage(seg.lang, () => paintInScript(ctx, seg.scriptContext, () => paintShapedSegment(ctx, seg, x, baseline + (seg.baselineShift ?? 0), font, size, color, block, fontCache, actualText, kashidaOf(seg, line))));
    if (seg.sideMarker) {
      // Its run, not its text, with no character spacing.
      if (tracking !== 0) setTrackingPx(ctx, 0);
      paintSideMarker(ctx, seg.sideMarker, x, baseline, colorHex, fontCache, blockFont);
      if (tracking !== 0) setTrackingPx(ctx, tracking);
    } else if (shaped) {
      // Painted by HarfBuzz.
    } else {
      withSegmentLanguage(seg.lang, () => {
        if (!composed) paintInScript(ctx, seg.scriptContext, () => drawTextPx(ctx, seg.text, x, baseline + (seg.baselineShift ?? 0), font, size, color, undefined, actualText));
        else paintComposedText(ctx, seg, x, baseline, font, size, color, colorHex, actualText, tracking, fontCache, blockFont, rubyElem, holder);
      }, true);
    }
    if (seg.pageLink !== undefined && linkRegistry) {
      const { scale, pageHeightPt } = ctx;
      linkRegistry.addPageLink(
        ctx.page,
        sheetRect(ctx, [x * scale, pageHeightPt - (line.bbox.y + line.bbox.height) * scale, (x + seg.width) * scale, pageHeightPt - line.bbox.y * scale]),
        seg.pageLink,
        pageElem ? { elem: pageElem, contents: seg.text } : undefined,
      );
    }
    const ref = refRun.leave(seg, segments[i + 1], target);
    if (ref && linkRegistry) {
      const { scale, pageHeightPt } = ctx;
      const x1 = ref.left * scale;
      const x2 = Math.max(ref.right, x + seg.width) * scale;
      const y2 = pageHeightPt - line.bbox.y * scale;
      const y1 = pageHeightPt - (line.bbox.y + line.bbox.height) * scale;
      linkRegistry.addLink(ctx.page, sheetRect(ctx, [x1, y1, x2, y2]), ref.resourceId, link ? { elem: link, contents: ref.text } : undefined);
    }
    x += seg.width;
  }
  uris.end();
  if (lineState) endActualTextSpan(ctx, lineState);
}


/** Whether a composed line is Japanese text: its document's language is
 *  Japanese, or a segment's own. Its segments in other languages then take
 *  a `Span` with their `/Lang`; other composed lines keep the structure
 *  they always had. */
function japaneseLine(segments: readonly VDTLineSegment[], docLang: string | undefined): boolean {
  return isJapaneseLanguage(docLang) || segments.some((s) => s.lang !== undefined && isJapaneseLanguage(s.lang));
}

/**
 * Paint a segment HarfBuzz shapes: a word set in several styles
 * (`runs`), each glyph in its run's face and colour, else the segment as
 * one run in its direction. False when HarfBuzz is not loaded: the caller
 * paints it the fontkit way.
 */
function paintShapedSegment(
  ctx: PageCtx,
  seg: VDTLineSegment,
  x: number,
  baseline: number,
  font: PDFFont,
  size: number,
  color: Color,
  block: VDTBlock,
  fontCache: FontCache,
  actualText: string | undefined,
  hideTatweel: boolean | number,
): boolean {
  const direction = seg.rtl ? 'rtl' : 'ltr';
  if (seg.runs && drawStyledWordPx(ctx, seg.text, x, baseline, font, size, color, wordParts(seg, font, color, ctx, (bold, italic) => ({ font: fontCache.get(pickSegmentFont(bold, italic, block)) ?? undefined, color: colorFromHex(pickSegmentColor(bold, italic, block), ctx.colorSpace) })), { direction, actualText, hideTatweel })) return true;
  return drawShapedTextPx(ctx, seg.text, x, baseline, font, size, color, { direction, actualText, hideTatweel });
}

/** Tracking: the block (column balancing; negative for a runt set short)
 *  and the line (justification tracking) were measured with extra advance
 *  after every glyph, so paint the line with the matching character
 *  spacing (`Tc`, in points at the page scale) and reset it afterwards. */
function renderLine(
  ctx: PageCtx,
  line: VDTLine,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
  capLead?: CapLead,
): void {
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  if (tracking !== 0) setTrackingPx(ctx, tracking);
  renderLineText(ctx, line, block, columnWidth, columnX, fontCache, linkRegistry, elem, tracking, trailingTracking(line, tracking), capLead);
  if (tracking !== 0) setTrackingPx(ctx, 0);
}

/** The tracking a line's measured width carries after its last glyph:
 *  `tracking` when the line ends on text, else 0. It is advance, not ink,
 *  so centring and right alignment leave it out (EF-153), as the canvas
 *  and HTML backends do (`lineTrailingTracking` in postext). */
function trailingTracking(line: VDTLine, tracking: number): number {
  if (tracking === 0) return 0;
  const segments = line.segments;
  if (segments && segments.length > 0) {
    let i = segments.length - 1;
    // A mark hung past the line's end is outside it (CJK only).
    while (i > 0 && segments[i]!.hangs) i--;
    const last = segments[i]!;
    return last.kind === 'text' && last.text.length > 0 ? tracking : 0;
  }
  return /\S$/.test(line.text) ? tracking : 0;
}

function renderLineText(
  ctx: PageCtx,
  line: VDTLine,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
  tracking: number,
  trailing = 0,
  capLead?: CapLead,
): void {
  const blockFont = fontCache.get(block.fontString);
  if (!blockFont) return;
  const blockSize = parseFontString(block.fontString)?.sizePx ?? 0;
  const blockColor = colorFromHex(block.color, ctx.colorSpace);

  // A line whose block runs against its frame (a right-to-left paragraph
  // on a left-to-right page, an English quotation in an Arabic book)
  // carries its span (`measure`): it is justified across it and set ragged
  // from its start side, the right, as the canvas sets it.
  const span = line.measure;
  const lineX = span ? span.x : line.bbox.x;
  const align = lineTextAlign(line, block.textAlign);
  const lineIndent = lineX - columnX;
  const effectiveWidth = span ? span.width : columnWidth - lineIndent;
  // Only a line of the CJK composer (or down a vertical page) has hung
  // marks and Han–Latin spaces (see `renderSegments`).
  const composed = line.cjkComposed === true || ctx.vertical !== undefined;
  // The pieces of a word the layout measured whole are painted as that
  // word, in a document shaped in its own language (#764).
  const segments = wordSegments(line, composed, (seg, text, sizeOf) => {
    const fontStr = seg.fontString ?? pickSegmentFont(!!seg.bold, !!seg.italic, block);
    return withSegmentLanguage(seg.lang, () => textAdvancePx(fontCache.get(fontStr) ?? blockFont, text, sizeOf(parseFontString(fontStr)?.sizePx ?? blockSize), tracking).advance);
  });

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  if (block.textAlign === 'justify' && segments && segments.length > 0) {
    let wordWidth = 0;
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segments) {
      // A hung mark is outside the measure; a Han–Latin space keeps its
      // width.
      if (composed && seg.hangs) continue;
      if (seg.kind === 'space' && !(composed && seg.autospace)) spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      renderSegments(ctx, segments, lineX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, justifiedSpaceWidth, tracking, capLead);
      return;
    }
  }

  if ((align === 'center' || align === 'right') && segments) {
    // Hung marks stay out of the alignment, as trailing tracking does.
    let contentWidth = 0;
    for (const seg of segments) if (!(composed && seg.hangs)) contentWidth += seg.width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    const startX = lineX + (align === 'center' ? slack / 2 : slack);
    renderSegments(ctx, segments, startX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, undefined, tracking, capLead);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref/own font or colour), and when one is in a
  // language of its own, which it is shaped in (#764; in a document that
  // keeps the host's language, on a line of the CJK composer only, which
  // names it in Japanese text, #427); otherwise one text object paints the
  // line.
  const ownLanguage = segments !== undefined && (line.cjkComposed === true || shapesSegmentLanguages()) && segments.some((s) => s.lang !== undefined);
  if (segments && (capLead !== undefined || isDirected(line) || ownLanguage || segments.some(composed ? composedSegmentIsStyled : segmentIsStyled))) {
    renderSegments(ctx, segments, lineX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, undefined, tracking, capLead);
    return;
  }

  tagContent(ctx, capLead?.elem ?? elem);
  const plainSlack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
  const plainX = lineX + (align === 'right' ? plainSlack : align === 'center' ? plainSlack / 2 : 0);
  // Each word where the layout measured it (EF-137): the embedded face's
  // own widths could differ, most of all for a character it has no glyph
  // for, and would carry the rest of the line along.
  // The hyphen repeated from the line before is painted but not read.
  const actualText = capLead
    ? capLead.prefix + line.text.slice(capLead.rest)
    : line.repeatedHyphen && line.text.startsWith('-') ? line.text.slice(1) : undefined;
  // A line with right-to-left or joining letters and no directions (a VDT
  // from before the engine resolved bidi levels) is set as one text, cut
  // into bidi runs and shaped by HarfBuzz; with fontkit when HarfBuzz is
  // not loaded, which turns the whole line around.
  const complex = needsComplexShaping(line.text);
  if (segments && segments.length > 0 && !complex
    && drawMeasuredTextPx(ctx, measuredPieces(ctx, line, segments, blockFont, blockSize, tracking), plainX, line.baseline, blockFont, blockSize, blockColor, tracking, actualText)) return;
  if (complex && drawShapedTextPx(ctx, line.text, plainX, line.baseline, blockFont, blockSize, blockColor, { base: block.direction, actualText })) return;
  drawTextPx(ctx, line.text, plainX, line.baseline, blockFont, blockSize, blockColor, undefined, actualText);
}

/** Whether a segment of a line set word by word paints differently from
 *  the block's plain text, or is linked; an orientation mark (`:tcy`,
 *  `:upright`, `:sideways`) keeps its segment apart. */
function segmentIsStyled(s: VDTLineSegment): boolean {
  return s.bold || s.italic || s.runs !== undefined || s.sideMarker !== undefined || s.kind === 'math' || s.kind === 'score' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined || s.href !== undefined || s.pageLink !== undefined || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined
    || s.tcy !== undefined || s.orientation !== undefined || s.labelTab !== undefined || s.leader !== undefined
    // A word with no letter shaped in the script of its context (#725):
    // its line is painted word by word, each in its script.
    || s.scriptContext !== undefined;
}

/** {@link segmentIsStyled} for a line of the CJK composer or one down a
 *  vertical page, whose segments may carry the composer's fields. */
function composedSegmentIsStyled(s: VDTLineSegment): boolean {
  return segmentIsStyled(s) || s.tracking !== undefined || s.inkOffset !== undefined || s.hangs !== undefined || s.autospace !== undefined || s.ruby !== undefined || s.kunten !== undefined || s.warichu !== undefined;
}

/**
 * The index of the segment that opens with the hyphen repeated from the line
 * before (`VDTLine.repeatedHyphen`, "vencer-" | "-se"), or -1. The PDF paints
 * that segment with an `/ActualText` that leaves the hyphen out, so copying
 * and text extraction read the word once, as written ("vencer-se").
 */
function repeatedHyphenSegment(line: VDTLine, segments: readonly VDTLineSegment[]): number {
  if (!line.repeatedHyphen) return -1;
  const i = segments.findIndex((s) => s.kind !== 'space');
  const seg = segments[i];
  return seg && seg.kind === 'text' && !seg.chip && seg.text.startsWith('-') ? i : -1;
}

/** The pieces a line painted as one text is set from: its segments
 *  ({@link withLineEndSpace}), and on a line of the CJK composer the
 *  characters of a segment it measured one by one, each a piece of its own
 *  (`cellPieces`, #770). */
function measuredPieces(
  ctx: PageCtx,
  line: VDTLine,
  segments: readonly VDTLineSegment[],
  font: PDFFont,
  sizePx: number,
  tracking: number,
): ReadonlyArray<{ text: string; width: number }> {
  const pieces = withLineEndSpace(segments, line.text);
  if (line.cjkComposed !== true || ctx.vertical) return pieces;
  let cut: Array<{ text: string; width: number }> | undefined;
  pieces.forEach((piece, i) => {
    const cells = cellPieces(font, piece.text, piece.width, sizePx, tracking);
    if (cells) (cut ??= pieces.slice(0, i)).push(...cells);
    else cut?.push(piece);
  });
  return cut ?? pieces;
}

/** A ragged line's segments, plus the space that ends the line when its
 *  text has one and the segments leave it out. The space takes no room
 *  past the line, but it is painted, as it was when the whole text was one
 *  run, so extracted text keeps the words either side of the break apart. */
function withLineEndSpace(segments: readonly VDTLineSegment[], text: string): ReadonlyArray<{ text: string; width: number }> {
  let shown = '';
  for (const seg of segments) shown += seg.text;
  if (text.length <= shown.length || !text.startsWith(shown)) return segments;
  const rest = text.slice(shown.length);
  return /^\s+$/.test(rest) ? [...segments, { text: rest, width: 0 }] : segments;
}

/** Whether a line carries the engine's directions: an order to paint its
 *  segments in, or a right-to-left segment. Absent on every left-to-right
 *  line, which is painted as it always was. */
function isDirected(line: VDTLine): boolean {
  return line.order !== undefined || (line.segments?.some((s) => s.rtl) ?? false);
}

function renderBullet(ctx: PageCtx, block: VDTBlock, fontCache: FontCache, elem: StructElem | undefined): void {
  // A task item's drawn box (#765): paths in its `Lbl`, which reads as the
  // character the box stands for.
  if (block.bulletBox) {
    tagContent(ctx, elem);
    drawTaskBoxPx(ctx, block);
    return;
  }
  if (
    !block.bulletText ||
    !block.bulletFontString ||
    block.bulletOffsetX === undefined
  ) {
    return;
  }
  const firstLine = block.lines[0];
  if (!firstLine) return;
  const font = fontCache.get(block.bulletFontString);
  if (!font) return;
  const size = parseFontString(block.bulletFontString)?.sizePx ?? 0;
  const colorHex = block.bulletColor ?? block.color;
  const color = colorFromHex(colorHex, ctx.colorSpace);

  // Canvas uses `textBaseline='middle'` at bulletY; pdf-lib draws from the
  // alphabetic baseline. Shift the baseline down by ~0.3em so the em-square
  // midline aligns at bulletY, matching canvas placement within hinting tolerance.
  // A marker set as text (a contents number) has its baseline at
  // `bulletBaselineY` (postext 1.5); `bulletY` stays its em-box midpoint.
  const baselineY = block.bulletBaselineY;
  const onBaseline = baselineY !== undefined;
  const midY = block.bulletY ?? firstLine.baseline;
  const baselinePx = onBaseline ? baselineY : midY + size * 0.3;
  tagContent(ctx, elem);
  // Ordered-list separator styled apart from the number (own font/colour),
  // with the prefix run before the number in the same style: drawn in
  // reading order, prefix, number, separator, so text extraction reads
  // （一） and not 一）（.
  const sepFontString = block.separatorText && block.separatorX !== undefined ? block.separatorFontString ?? block.bulletFontString : undefined;
  const sepFont = sepFontString !== undefined ? fontCache.get(sepFontString) : undefined;
  const sepSize = sepFontString !== undefined ? parseFontString(sepFontString)?.sizePx ?? size : size;
  const sepColor = colorFromHex(block.separatorColor ?? colorHex, ctx.colorSpace);
  const sepY = onBaseline ? baselineY : midY + sepSize * 0.3;
  // A marker of a right-to-left item reads in its direction (#664).
  const put = (text: string, x: number, y: number, f: PDFFont, s: number, c: Color): void => {
    if (block.bulletDirection) drawMarkerRuns(ctx, text, x, y, f, s, c, block.bulletDirection);
    else drawTextPx(ctx, text, x, y, f, s, c);
  };
  if (sepFont && block.prefixText && block.prefixX !== undefined) {
    put(block.prefixText, block.prefixX, sepY, sepFont, sepSize, sepColor);
  }
  put(block.bulletText, block.bulletOffsetX, baselinePx, font, size, color);
  if (sepFont && block.separatorText && block.separatorX !== undefined) {
    put(block.separatorText, block.separatorX, sepY, sepFont, sepSize, sepColor);
  }
}

/** A character past Latin-1: a text that holds one is cut into script
 *  runs by the canvas (see `shapingLanguage.ts`). */
const WIDE_MARKER_RE = /[^\u0000-\u00FF]/;

/**
 * A marker that reads right to left (`VDTBlock.bulletDirection`, #664) at
 * `xPx`, its left edge in the flow: its runs (`markerRuns`, one bidi level
 * each, in visual order from the sheet's left) stand one after the other
 * along the flow's x axis, which on a mirrored page runs from the sheet's
 * right, each as wide as the face sets it; a right-to-left run is shaped
 * so and its brackets mirrored. They are drawn in reading order, so text
 * extraction reads `1-` whatever side the hyphen stands on.
 */
function drawMarkerRuns(ctx: PageCtx, text: string, xPx: number, baselinePx: number, font: PDFFont, sizePx: number, color: Color, direction: 'rtl' | 'rtl-arabic'): void {
  const draw = (): void => {
    const runs = markerRuns(text, direction);
    if (ctx.mirror) runs.reverse();
    let at = xPx;
    const placed = runs.map((run) => {
      const x = at;
      at += textAdvancePx(font, run.text, sizePx, joinsLetters(run.text) ? 0 : ctx.trackingPx ?? 0).advance;
      return { run, x };
    });
    placed.sort((a, b) => a.run.start - b.run.start);
    for (const { run, x } of placed) {
      if (run.rtl) drawRightToLeftRun(ctx, run.text, x, baselinePx, font, sizePx, color);
      else drawTextPx(ctx, run.text, x, baselinePx, font, sizePx, color);
    }
  };
  // In a document shaped in its own language the layout measures the
  // marker, and the canvas paints it, as one text set right to left
  // (`markerSetText`, #770). A run of it with no letter is shaped there as
  // a piece of that text, not as a word of its own: when the text holds a
  // character past U+00FF (an Arabic letter or digit, the Arabic letter
  // mark before European digits read as an Arabic number) such a piece
  // has no script and takes the face's default forms. Amiri bold: `(١)`
  // is 1.501 em wide so, and 1.153 em with its brackets in Latin forms.
  if (shapesAsCanvas() && WIDE_MARKER_RE.test(markerSetText(text, direction))) withinWideText(true, draw);
  else draw();
}

/** The first line of a paragraph a drop cap opens (#623): its first
 *  `rest` characters finish the word the initial starts, and the first of
 *  its text segments reads as `prefix` (the whole word, a word space after
 *  a one-letter one) followed by its own text past them, so copying and
 *  text extraction read the word once, where the line is. `elem` is the
 *  word's `Span` in a tagged render. */
interface CapLead {
  prefix: string;
  rest: number;
  elem?: StructElem;
}

function dropCapLead(cap: VDTDropCap, elem: StructElem | undefined): CapLead {
  const prefix = cap.wordRest > 0 ? cap.word : `${cap.word} `;
  return { prefix, rest: cap.wordRest, ...(elem ? { elem: elem.child('Span', { actualText: prefix }) } : {}) };
}

/** A paragraph's drop cap (#623) and an opening mark hung before it, part
 *  of the paragraph's text in a tagged render, read as nothing (the first
 *  line reads the word whole, see {@link CapLead}). */
function renderDropCap(ctx: PageCtx, cap: VDTDropCap, fontCache: FontCache, elem: StructElem | undefined): void {
  const color = colorFromHex(cap.color, ctx.colorSpace);
  const paint = (text: string, fontString: string, x: number, baseline: number): void => {
    const font = fontCache.get(fontString);
    if (!font) return;
    const size = parseFontString(fontString)?.sizePx ?? 0;
    tagContent(ctx, elem);
    drawTextPx(ctx, text, x, baseline, font, size, color, undefined, '');
  };
  if (cap.hang) paint(cap.hang.text, cap.hang.fontString, cap.hang.x, cap.hang.baselineY);
  paint(cap.text, cap.fontString, cap.x, cap.baselineY);
}

function renderStrikethrough(ctx: PageCtx, block: VDTBlock): void {
  if (!block.strikethroughText) return;
  tagArtifact(ctx, { type: 'Layout' });
  const color = colorFromHex(block.color, ctx.colorSpace);
  const thickness = Math.max(
    1,
    block.lines[0]?.bbox.height ? block.lines[0].bbox.height * 0.05 : 1,
  );
  for (const line of block.lines) {
    const y = line.baseline - line.bbox.height * 0.28;
    drawLinePx(ctx, line.bbox.x, y, line.bbox.x + line.bbox.width, y, color, thickness);
  }
}

/** A rect of the page's frame in PDF points, on the sheet: through the
 *  flow frame of a vertical page (`PageCtx.mapRectPt`), as it is on any
 *  other. Annotation rects and destinations live outside the content
 *  stream, so the frame's `cm` does not reach them. */
function sheetRect(ctx: PageCtx, rect: [number, number, number, number]): [number, number, number, number] {
  return ctx.mapRectPt ? ctx.mapRectPt(rect) : rect;
}

/** Annotation rectangle of a block's box, in PDF points, on the sheet. */
function rectOfBlock(ctx: PageCtx, block: VDTBlock): [number, number, number, number] {
  const { scale, pageHeightPt } = ctx;
  const { x, y, width, height } = block.bbox;
  return sheetRect(ctx, [x * scale, pageHeightPt - (y + height) * scale, (x + width) * scale, pageHeightPt - y * scale]);
}

/**
 * A strip's caption (`VDTBlock.stripCaption`, #590), in the flow: the bar
 * behind it (layout), the target of a `:ref` naming the strip, then its
 * lines, painted as a paragraph's (turned on a vertical page) and tagged
 * into `elem` — the `Caption` of the strip's `Div`. The strip's picture is
 * painted on the sheet later (`renderComicPage`).
 */
export function renderStripCaption(
  ctx: PageCtx,
  block: VDTBlock,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
): void {
  const caption = block.stripCaption;
  if (!caption || block.hidden) return;
  if (caption.id && linkRegistry) {
    const [left, , , top] = rectOfBlock(ctx, block);
    linkRegistry.addDestination(caption.id, ctx.page, left, top);
  }
  if (caption.bar) {
    tagArtifact(ctx, { type: 'Layout' });
    const { rect, background } = caption.bar;
    fillRectPx(ctx, block.bbox.x + rect.x, block.bbox.y + rect.y, rect.width, rect.height, colorFromHex(background, ctx.colorSpace));
  }
  for (const line of block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount)) {
    if (line.highlights) paintLineHighlights(ctx, line);
    renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, elem);
    if (line.marks) paintLineMarks(ctx, line, colorFromHex(block.color, ctx.colorSpace));
  }
}

export function renderBlock(
  ctx: PageCtx,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  resourceCtx?: ResourceRenderContext,
): void {
  if (block.hidden) return;
  // A box printed upside down (#1229): drawn turned about its centre, a
  // point (x, y) of the page landing at (2cx − x, 2cy − y).
  if (block.turn) {
    const { scale, pageHeightPt } = ctx;
    ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, -1, 2 * block.turn.cx * scale, 2 * (pageHeightPt - block.turn.cy * scale)));
    try {
      renderBlockUpright(ctx, block, columnWidth, columnX, fontCache, resourceCtx);
    } finally {
      ctx.page.pushOperators(popGraphicsState());
    }
    return;
  }
  renderBlockUpright(ctx, block, columnWidth, columnX, fontCache, resourceCtx);
}

function renderBlockUpright(
  ctx: PageCtx,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  resourceCtx?: ResourceRenderContext,
): void {
  const structure = resourceCtx?.structure;
  const linkRegistry = resourceCtx?.linkRegistry;
  // The head row of a cut contents block repeated at the top of the column
  // it goes on in (#850): pagination furniture, as a split box's repeated
  // title is. A tagged render reads it as an artifact, not as a second
  // `TOCI`, and it carries no link (the head row it repeats has one).
  const repeatedTocHead = block.tocEntry?.continued === true || block.tocPart?.continued === true;
  // A row of the contents links to the page it lists: the whole row is
  // the annotation, its text the `Link` element in a tagged render.
  const targetPage = repeatedTocHead ? undefined : block.tocEntry?.pageIndex ?? block.tocPart?.pageIndex;
  if (block.designOverlay && repeatedTocHead) {
    renderHeaderFooterSlot(ctx, block.designOverlay, fontCache, resourceCtx?.images, structure ? { artifact: { type: 'Pagination' } } : undefined);
    return;
  }
  if (repeatedTocHead) {
    if (structure) tagArtifact(ctx, { type: 'Pagination' });
    if (block.type === 'listItem') renderBullet(ctx, block, fontCache, undefined);
    for (const line of block.lines) renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, undefined);
    return;
  }
  if (block.designOverlay) {
    // A heading's advanced design or a callout frame: the overlay's text is
    // the heading / the callout title, its boxes and icons are decoration.
    let link: StructElem | undefined;
    const textElem = structure
      ? () => link ?? (targetPage !== undefined ? (link = structure.blockElem(block).child('Link')) : structure.blockElem(block))
      : undefined;
    renderHeaderFooterSlot(
      ctx,
      block.designOverlay,
      fontCache,
      resourceCtx?.images,
      textElem && structure
        ? { text: textElem, artifact: { type: 'Layout' }, figure: (alt, attributes, after) => structure.designFigure(alt, attributes, after) }
        : undefined,
    );
    if (targetPage !== undefined && linkRegistry) {
      const contents = block.tocPart ? `${block.tocPart.number} ${block.tocPart.title}`.trim() : block.lines.map((l) => l.text).join(' ');
      linkRegistry.addPageLink(ctx.page, rectOfBlock(ctx, block), targetPage, link ? { elem: link, contents } : undefined);
    }
    return;
  }
  if (block.type === 'resource') {
    renderResourceBlock(
      ctx,
      block,
      fontCache,
      resourceCtx?.images ?? new Map(),
      resourceCtx?.linkRegistry,
      structure,
    );
    return;
  }
  const blockElem = structure && (block.lines.length > 0 || block.bulletText) ? structure.blockElem(block) : undefined;
  const link = targetPage !== undefined && blockElem ? blockElem.child('Link') : undefined;
  const elem = link ?? blockElem;
  if (block.type === 'listItem') {
    renderBullet(ctx, block, fontCache, structure?.bulletElem(block) ?? elem);
  }
  // A drop cap (#623): the initial and the rest of its word are one `Span`
  // whose `/ActualText` is the word.
  const cap = block.dropCap;
  const capLead = cap ? dropCapLead(cap, elem) : undefined;
  if (cap) renderDropCap(ctx, cap, fontCache, capLead?.elem ?? elem);
  // A note is where its markers link to.
  if (block.footnoteNote !== undefined && linkRegistry) {
    // The top left of the note's box on the sheet.
    const [left, , , top] = rectOfBlock(ctx, block);
    linkRegistry.addDestination(footnoteDestination(linkRegistry, block.footnoteNote), ctx.page, left, top);
  }
  // Justify against the block's own measure (see the canvas backend): blocks
  // inside callouts are narrower than their column.
  void columnWidth;
  void columnX;
  block.lines.forEach((line, i) => {
    // Highlight bands (`:mark[…]`, #888), under the text.
    if (line.highlights) paintLineHighlights(ctx, line);
    renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, elem, i === 0 ? capLead : undefined);
    // Emphasis dots, proper-name and book-title lines (#193).
    if (line.marks) paintLineMarks(ctx, line, colorFromHex(block.color, ctx.colorSpace));
  });
  if (targetPage !== undefined && linkRegistry) {
    const contents = block.lines.map((l) => l.text).join(' ');
    linkRegistry.addPageLink(ctx.page, rectOfBlock(ctx, block), targetPage, link ? { elem: link, contents } : undefined);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}

/** The tatweels of a segment its text read leaves out: the ones kashida
 *  justification inserted (`VDTLineSegment.kashida`), so one the author
 *  typed stays; every one on a line of a VDT that only counts them
 *  (`VDTLine.kashida`, before the per-segment offsets). */
function kashidaOf(seg: VDTLineSegment, line: VDTLine): boolean | number {
  if (seg.kashida) return seg.kashida.length;
  return line.kashida !== undefined && !line.segments?.some((s) => s.kashida);
}
