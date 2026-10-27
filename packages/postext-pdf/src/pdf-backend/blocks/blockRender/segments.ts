// The segments of a line: maths, composed text, shaped and Japanese
// segments, and renderSegments painting them in order
// (#1276: split out of blockRender.ts).
import { type Color, pushGraphicsState, popGraphicsState, type PDFFont } from 'pdf-lib';
import { type MathRender, type VDTLineSegment, segmentOrientation, type VDTLine, type VDTBlock, leaderRuleGeometry, isJapaneseLanguage } from 'postext';
import { parseFontString } from '../../../fontString.js';
import { FontCache } from '../../../fontCache.js';
import { type PageCtx, counterFlipPx, colorFromHex, alphaStateOp, alphaOf, compressedMarkSpacingPx, setTrackingPx, cellPieces, drawMeasuredTextPx, drawTextPx, readText, cjkLineText, type LineTextState, beginActualTextSpan, fillRectPx, paintInScript, endActualTextSpan } from '../../primitives.js';
import { paintChip } from '../chip.js';
import { renderScoreSegment } from '../scoreRender.js';
import { pickSegmentFont, pickSegmentColor } from '../../text/fontHelpers.js';
import { LinkRegistry, RefRun, UriRuns, refTarget } from '../../structure/links.js';
import { type StructElem, tagContent, tagArtifact } from '../../structure/tagging.js';
import { paintRuby, paintKunten, paintWarichu, paintSideMarker } from '../../text/annotations.js';
import { inkScaleOperators } from '../../text/inkScale.js';
import { paintSwatchSegmentPdf } from '../inlineIcon.js';
import { drawStyledWordPx, drawShapedTextPx } from '../../text/shapedText.js';
import { segmentOffsets, segmentLanguages, wordParts } from '../../text/directedLine.js';
import { needsComplexShaping } from '../../../complexShaping.js';
import { withSegmentLanguage } from '../../../shapingLanguage.js';
import { repeatedHyphenSegment, isDirected } from './lineText.js';
import type { CapLead } from './markers.js';

/** The link destination of a footnote of the document being drawn
 *  (`LinkRegistry.documentIndex`: note ids repeat from chapter to chapter).
 *  A key no resource id takes: it opens with a NUL. */
export function footnoteDestination(linkRegistry: LinkRegistry | undefined, id: string): string {
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
export function renderSegments(
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

/** A rect of the page's frame in PDF points, on the sheet: through the
 *  flow frame of a vertical page (`PageCtx.mapRectPt`), as it is on any
 *  other. Annotation rects and destinations live outside the content
 *  stream, so the frame's `cm` does not reach them. */
export function sheetRect(ctx: PageCtx, rect: [number, number, number, number]): [number, number, number, number] {
  return ctx.mapRectPt ? ctx.mapRectPt(rect) : rect;
}

/** The tatweels of a segment its text read leaves out: the ones kashida
 *  justification inserted (`VDTLineSegment.kashida`), so one the author
 *  typed stays; every one on a line of a VDT that only counts them
 *  (`VDTLine.kashida`, before the per-segment offsets). */
function kashidaOf(seg: VDTLineSegment, line: VDTLine): boolean | number {
  if (seg.kashida) return seg.kashida.length;
  return line.kashida !== undefined && !line.segments?.some((s) => s.kashida);
}
