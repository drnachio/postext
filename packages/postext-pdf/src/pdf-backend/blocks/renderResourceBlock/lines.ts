// Embedded resources drawn inline and the text lines of a resource
// (captions, cells) painted run by run (#1276: split out of renderResourceBlock.ts).
import { pushGraphicsState, setFillingColor, popGraphicsState, type Color } from 'pdf-lib';
import type { VDTBlock, VDTInlineIcon, VDTLine } from 'postext';
import { LinkRegistry, RefRun, UriRuns } from '../../structure/links.js';
import { parseFontString } from '../../../fontString.js';
import { FontCache } from '../../../fontCache.js';
import { type PageCtx, counterFlipPx, colorFromHex, setTrackingPx, textAdvancePx, cjkLineText, type LineTextState, beginActualTextSpan, drawTextPx, paintInScript, compressedMarkSpacingPx, cellPieces, drawMeasuredTextPx, endActualTextSpan } from '../../primitives.js';
import { paintChip } from '../chip.js';
import { renderMathSegment } from '../blockRender.js';
import { paintLineHighlights, paintLineMarks, paintWarichu, paintRuby, paintKunten } from '../../text/annotations.js';
import { type StructElem, tagContent } from '../../structure/tagging.js';
import { drawVectorDrawing } from '../../vector/svgVector.js';
import { inkScaleOperators } from '../../text/inkScale.js';
import { paintSwatchSegmentPdf } from '../inlineIcon.js';
import { drawStyledWordPx, drawShapedTextPx } from '../../text/shapedText.js';
import { segmentOffsets, segmentLanguages, wordParts } from '../../text/directedLine.js';
import { withSegmentLanguage } from '../../../shapingLanguage.js';
import { wordSegments } from '../../text/wordPieces.js';
import { needsComplexShaping } from '../../../complexShaping.js';
import { tintedDrawing } from '../../vector/tint.js';
import type { EmbeddedResource } from '../renderResourceBlock.js';

/** The inline symbols of a block's own lines that draw a picture. */
export function lineIcons(block: VDTBlock): VDTInlineIcon[] {
  const out: VDTInlineIcon[] = [];
  for (const line of block.lines ?? []) for (const seg of line.segments ?? []) if (seg.swatch?.icon?.fileId) out.push(seg.swatch.icon);
  return out;
}

/** Draw an embedded resource fitted to a box in document pixels (top-down). */
export function drawEmbeddedResource(
  ctx: PageCtx,
  res: EmbeddedResource,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  /** Paint the picture's silhouette in this colour (`#rrggbb`, #995): a
   *  vector drawing is recoloured, a bitmap goes through the stencil of
   *  its alpha. A print master (an embedded PDF page) cannot be
   *  recoloured and is drawn as it is. */
  tint?: string,
): void {
  const { scale, pageHeightPt } = ctx;
  const box = {
    x: xPx * scale,
    y: pageHeightPt - (yPx + hPx) * scale,
    width: wPx * scale,
    height: hPx * scale,
  };
  // A picture on a mirrored page reads unmirrored in its box.
  counterFlipPx(ctx, xPx, wPx, () => {
    if (res.kind === 'image') {
      if (tint && res.stencil) {
        ctx.page.pushOperators(pushGraphicsState(), setFillingColor(colorFromHex(tint, ctx.colorSpace)));
        ctx.page.drawImage(res.stencil.image, box);
        ctx.page.pushOperators(popGraphicsState());
      } else ctx.page.drawImage(res.image, box);
    } else if (res.kind === 'page') ctx.page.drawPage(res.page, box);
    else drawVectorDrawing(ctx, tint ? tintedDrawing(res.drawing, tint) : res.drawing, xPx, yPx, wPx, hPx);
  });
}

function pickFont(
  bold: boolean,
  italic: boolean,
  fonts: { normal: string; bold: string; italic: string; boldItalic: string },
): string {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.normal;
}

export interface PaintFonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** Paint one absolutely-positioned rich-text line; records ref link rects.
 *  In a tagged render the text joins `elem` (refs get a `Link` child) and
 *  word spaces are painted as real glyphs; without `elem` the line joins
 *  whatever sequence is open (an artifact for repeated table headers). */
/** A caption, note or cell line. A tracked line (a table header set with
 *  `headerLetterSpacing`) was measured with the tracking in its widths, so
 *  it is painted with the matching character spacing (`Tc`, in points at
 *  the page scale), reset afterwards. Ruby readings, warichu rows and the
 *  marks of the line are painted as on a body line (#429): a reading in
 *  the `RT` of a `Ruby` whose `RB` is its base, the marks as artifacts. */
export function paintLine(
  ctx: PageCtx,
  line: VDTLine,
  fonts: PaintFonts,
  fontCache: FontCache,
  color: Color,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  resolveRefId: ((seg: { refResourceId?: string; refAnchor?: true }) => string | undefined),
  labelColor: Color = color,
  elem?: StructElem,
): void {
  const tracking = line.letterSpacing ?? 0;
  // Highlight bands (`:mark[…]`, #888), under the text.
  if (line.highlights) paintLineHighlights(ctx, line);
  if (tracking !== 0) setTrackingPx(ctx, tracking);
  paintLineRuns(ctx, line, fonts, fontCache, color, linkColor, linkRegistry, resolveRefId, labelColor, elem, tracking);
  if (tracking !== 0) setTrackingPx(ctx, 0);
  if (line.marks) paintLineMarks(ctx, line, color);
}

function paintLineRuns(
  ctx: PageCtx,
  line: VDTLine,
  fonts: PaintFonts,
  fontCache: FontCache,
  color: Color,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  resolveRefId: ((seg: { refResourceId?: string; refAnchor?: true }) => string | undefined),
  labelColor: Color,
  elem: StructElem | undefined,
  tracking = 0,
): void {
  const baseFont = fontCache.get(fonts.normal);
  if (!baseFont) return;
  const baseSize = parseFontString(fonts.normal)?.sizePx ?? 0;
  if (line.segments && line.segments.length > 0) {
    const refRun = new RefRun();
    let x = line.bbox.x;
    const uris = new UriRuns(ctx, line, linkRegistry, elem);
    // Only a line of the CJK composer carries its fields (a segment's
    // tracking, ink offset and scale); any other is painted as every line
    // was before them (see `renderSegments` in blockRender.ts).
    const composed = line.cjkComposed === true || ctx.vertical !== undefined;
    // The pieces of a word the layout measured whole are painted as that
    // word, in a document shaped in its own language (#764).
    const segs = wordSegments(line, composed, (seg, text, sizeOf) => {
      const fontStr = seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, fonts);
      return withSegmentLanguage(seg.lang, () => textAdvancePx(fontCache.get(fontStr) ?? baseFont, text, sizeOf(parseFontString(fontStr)?.sizePx ?? baseSize), tracking).advance);
    }) ?? line.segments;
    // A composed CJK line reads as written, not with its gaps.
    const actualLine = composed ? cjkLineText(segs) : undefined;
    let lineState: LineTextState | undefined;
    if (actualLine !== undefined) {
      const first = segs.find((s) => s.kind === 'text' && !s.chip && s.text !== '');
      const fontStr = first ? first.fontString ?? pickFont(!!first.bold, !!first.italic, fonts) : fonts.normal;
      lineState = {
        font: fontCache.get(fontStr) ?? baseFont,
        text: first?.text ?? '',
        sizePx: parseFontString(fontStr)?.sizePx ?? baseSize,
        xPx: line.bbox.x,
        baselinePx: line.baseline,
      };
      beginActualTextSpan(ctx, actualLine, lineState);
    }
    // A line with right-to-left runs is laid out in `order` and painted
    // in logical order, each right-to-left segment shaped as one run (see
    // `renderSegments` in blockRender.ts).
    const directed = line.order !== undefined || segs.some((s) => s.rtl);
    const order = directed && line.order?.length === segs.length ? line.order : undefined;
    const xs = order ? segmentOffsets(segs, order, line.bbox.x, (s) => s.width) : undefined;
    const langs = elem && directed ? segmentLanguages(segs, elem.tree.options.lang) : undefined;
    let langSpan: { lang: string; elem: StructElem } | undefined;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (xs) x = xs[i]!;
      const lang = langs?.[i];
      if (lang && langSpan?.lang !== lang) langSpan = { lang, elem: elem!.child('Span', { lang }) };
      else if (!lang) langSpan = undefined;
      const textElem = langSpan?.elem ?? elem;
      if (seg.kind === 'space') {
        // A space inside a reference label (#702) is read in its `Link`.
        const inLink = uris.space(seg.text) ?? refRun.space(seg, resolveRefId(seg));
        if (ctx.tags && seg.text) {
          tagContent(ctx, inLink ?? textElem);
          drawTextPx(ctx, seg.text, x, line.baseline, baseFont, baseSize, color);
        }
        x += seg.width;
        continue;
      }
      if (seg.kind !== 'text' || seg.chip) uris.other();
      if (seg.kind === 'math') {
        // An inline formula (#541): vector paths, as in the text, tagged
        // as a `Formula` with its TeX for alternate text.
        if (elem) tagContent(ctx, elem.type === 'Formula' ? elem : elem.child('Formula', { alt: seg.mathRender?.tex ?? '' }));
        renderMathSegment(ctx, seg, x, line.baseline, color);
        x += seg.width;
        continue;
      }
      if (seg.kind === 'swatch') {
        paintSwatchSegmentPdf(ctx, seg, x, line.baseline, color, fontCache, baseFont, elem);
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        const chipColor = seg.chip.color ? colorFromHex(seg.chip.color, ctx.colorSpace) : color;
        paintChip(ctx, seg.chip, x, line.baseline, fontCache, baseFont, baseSize, elem, () => chipColor);
        x += seg.width;
        continue;
      }
      if (composed && seg.warichu) {
        // A warichu note's part: its two rows, not its text (#195), with
        // no character spacing.
        if (tracking !== 0) setTrackingPx(ctx, 0);
        paintWarichu(ctx, seg.warichu, x, line.baseline, color, fontCache, baseFont, textElem);
        if (tracking !== 0) setTrackingPx(ctx, tracking);
        x += seg.width;
        continue;
      }
      const fontStr = seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, fonts);
      const font = fontCache.get(fontStr) ?? baseFont;
      const size = parseFontString(fontStr)?.sizePx ?? baseSize;
      const refId = resolveRefId(seg);
      const segColor = refId !== undefined ? linkColor : seg.captionLabel ? labelColor : color;
      // A `:ref` links to its resource — a ref painted as several runs
      // (small capitals) is one link —, a Markdown link's words to its URL.
      const uriElem = uris.word(refId === undefined ? seg.href : undefined, x, seg.width, seg.text);
      const link = refId !== undefined ? refRun.enter(seg, x, textElem, refId, seg.width) : undefined;
      // A ruby base is the `RB` of a `Ruby` whose `RT` holds its reading.
      const holder = link ?? uriElem ?? textElem;
      const rubyElem = composed && seg.ruby && holder ? holder.child('Ruby') : undefined;
      tagContent(ctx, rubyElem ? rubyElem.child('RB') : holder);
      const baseline = line.baseline + (seg.baselineShift ?? 0);
      const direction = seg.rtl ? 'rtl' : 'ltr';
      // A segment that names its language is shaped in it (#764), in a
      // document shaped in its own.
      withSegmentLanguage(seg.lang, () => {
        if (seg.runs && drawStyledWordPx(ctx, seg.text, x, baseline, font, size, segColor, wordParts(seg, font, segColor, ctx, (bold, italic) => ({ font: fontCache.get(pickFont(bold, italic, fonts)) ?? undefined, color: segColor })), { direction })) {
          // A word set in several styles, shaped whole.
        } else if (directed && (seg.rtl || needsComplexShaping(seg.text)) && paintInScript(ctx, seg.scriptContext, () => drawShapedTextPx(ctx, seg.text, x, baseline, font, size, segColor, { direction }))) {
          // One run in its direction, shaped by HarfBuzz; a word with no
          // letter in the script the layout measured it in (#725).
        } else if (!composed) {
          paintInScript(ctx, seg.scriptContext, () => drawTextPx(ctx, seg.text, x, baseline, font, size, segColor));
        } else {
          // A justified CJK line spreads its characters per segment.
          // A compressed CJK mark advances to its box's end (see blockRender).
          const markSpacing = compressedMarkSpacingPx(font, seg, size);
          if (markSpacing !== undefined) setTrackingPx(ctx, markSpacing);
          else if (seg.tracking !== undefined) setTrackingPx(ctx, (tracking + seg.tracking));
          const stretch = inkScaleOperators(seg.inkScale);
          ctx.page.pushOperators(...stretch.before);
          // Characters the composer measured one by one, each in its
          // place (see `paintComposedText` in blockRender.ts, #770).
          const cells = ctx.vertical || markSpacing !== undefined || seg.inkScale !== undefined ? undefined : cellPieces(font, seg.text, seg.width, size, ctx.trackingPx ?? 0);
          if (!cells || !drawMeasuredTextPx(ctx, cells, x + (seg.inkOffset ?? 0), line.baseline + (seg.baselineShift ?? 0), font, size, segColor, ctx.trackingPx ?? 0)) {
            drawTextPx(ctx, seg.text, x + (seg.inkOffset ?? 0), line.baseline + (seg.baselineShift ?? 0), font, size, segColor);
          }
          ctx.page.pushOperators(...stretch.after);
          if (markSpacing !== undefined || seg.tracking !== undefined) setTrackingPx(ctx, tracking);
          if (seg.ruby) {
            if (tracking !== 0) setTrackingPx(ctx, 0);
            paintRuby(ctx, seg.ruby, x, line.baseline, segColor, fontCache, baseFont, rubyElem);
            if (tracking !== 0) setTrackingPx(ctx, tracking);
          }
          if (seg.kunten) {
            // Kanbun marks (#430), with the character's text.
            if (tracking !== 0) setTrackingPx(ctx, 0);
            paintKunten(ctx, seg.kunten, x, line.baseline, segColor, fontCache, baseFont, holder);
            if (tracking !== 0) setTrackingPx(ctx, tracking);
          }
        }
      });
      const ref = refId !== undefined ? refRun.leave(seg, segs[i + 1], refId, segs[i + 1] ? resolveRefId(segs[i + 1]!) : undefined) : undefined;
      if (ref && linkRegistry) {
        const { scale, pageHeightPt } = ctx;
        const x1 = ref.left * scale;
        const y2 = pageHeightPt - (line.bbox.y) * scale;
        const y1 = pageHeightPt - (line.bbox.y + line.bbox.height) * scale;
        const x2 = Math.max(ref.right, x + seg.width) * scale;
        const rect: [number, number, number, number] = [x1, y1, x2, y2];
        linkRegistry.addLink(ctx.page, ctx.mapRectPt ? ctx.mapRectPt(rect) : rect, ref.resourceId, link ? { elem: link, contents: ref.text } : undefined);
      }
      x += seg.width;
    }
    uris.end();
    if (lineState) endActualTextSpan(ctx, lineState);
    return;
  }
  tagContent(ctx, elem);
  drawTextPx(ctx, line.text, line.bbox.x, line.baseline, baseFont, baseSize, color);
}
