import { popGraphicsState, pushGraphicsState, setCharacterSpacing } from 'pdf-lib';
import type { Color, PDFFont } from 'pdf-lib';
import type { VDTBlock, VDTLine, VDTLineSegment, MathRender } from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import { type PageCtx, alphaOf, alphaStateOp, drawLinePx, drawMeasuredTextPx, drawSwatchPx, drawTextPx, colorFromHex } from './primitives';
import { paintChip } from './chip';
import { pickSegmentColor, pickSegmentFont } from './fontHelpers';
import { renderHeaderFooterSlot } from './headerFooter';
import {
  renderResourceBlock,
  type ResourceImageMap,
} from './renderResourceBlock';
import { LinkRegistry, RefRun, UriRuns } from './links';
import { tagArtifact, tagContent, type StructElem } from './tagging';
import type { StructureFlow } from './structureFlow';

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

function renderMathSegment(
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
): void {
  let x = startX;
  const refRun = new RefRun();
  const uris = new UriRuns(ctx, line, linkRegistry, elem);
  const repeatedAt = repeatedHyphenSegment(line, segments);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === 'space') {
      const inLink = uris.space(seg.text);
      if (ctx.tags && seg.text) {
        tagContent(ctx, inLink ?? elem);
        drawTextPx(ctx, seg.text, x, baseline, blockFont, blockSize, blockColor);
      }
      x += justifiedSpaceWidth ?? seg.width;
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
    if (seg.kind === 'swatch') {
      tagContent(ctx, elem);
      drawSwatchPx(ctx, x, baseline, seg.width, seg.swatch?.color, blockColor);
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
    // A footnote marker links to its note, like a `:ref` to its resource.
    const target = seg.refResourceId ?? (seg.footnoteId !== undefined ? footnoteDestination(linkRegistry, seg.footnoteId) : undefined);
    const link = refRun.enter(seg, x, elem, target);
    // A page number of the index links to its page.
    const pageElem = seg.pageLink !== undefined && elem && !link ? elem.child('Link') : undefined;
    tagContent(ctx, link ?? pageElem ?? uriElem ?? elem);
    // The hyphen repeated from the line before is painted but not read.
    const actualText = i === repeatedAt ? seg.text.slice(1) : undefined;
    drawTextPx(ctx, seg.text, x, baseline + (seg.baselineShift ?? 0), font, size, color, undefined, actualText);
    if (seg.pageLink !== undefined && linkRegistry) {
      const { scale, pageHeightPt } = ctx;
      linkRegistry.addPageLink(
        ctx.page,
        [x * scale, pageHeightPt - (line.bbox.y + line.bbox.height) * scale, (x + seg.width) * scale, pageHeightPt - line.bbox.y * scale],
        seg.pageLink,
        pageElem ? { elem: pageElem, contents: seg.text } : undefined,
      );
    }
    const ref = refRun.leave(seg, segments[i + 1], target);
    if (ref && linkRegistry) {
      const { scale, pageHeightPt } = ctx;
      const x1 = ref.startX * scale;
      const x2 = (x + seg.width) * scale;
      const y2 = pageHeightPt - line.bbox.y * scale;
      const y1 = pageHeightPt - (line.bbox.y + line.bbox.height) * scale;
      linkRegistry.addLink(ctx.page, [x1, y1, x2, y2], ref.resourceId, link ? { elem: link, contents: ref.text } : undefined);
    }
    x += seg.width;
  }
  uris.end();
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
): void {
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  if (tracking !== 0) ctx.page.pushOperators(setCharacterSpacing(tracking * ctx.scale));
  renderLineText(ctx, line, block, columnWidth, columnX, fontCache, linkRegistry, elem, tracking, trailingTracking(line, tracking));
  if (tracking !== 0) ctx.page.pushOperators(setCharacterSpacing(0));
}

/** The tracking a line's measured width carries after its last glyph:
 *  `tracking` when the line ends on text, else 0. It is advance, not ink,
 *  so centring and right alignment leave it out (EF-153), as the canvas
 *  and HTML backends do (`lineTrailingTracking` in postext). */
function trailingTracking(line: VDTLine, tracking: number): number {
  if (tracking === 0) return 0;
  const segments = line.segments;
  if (segments && segments.length > 0) {
    const last = segments[segments.length - 1]!;
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
): void {
  const blockFont = fontCache.get(block.fontString);
  if (!blockFont) return;
  const blockSize = parseFontString(block.fontString)?.sizePx ?? 0;
  const blockColor = colorFromHex(block.color, ctx.colorSpace);

  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;
  const segments = line.segments;

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  if (block.textAlign === 'justify' && segments && segments.length > 0) {
    let wordWidth = 0;
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segments) {
      if (seg.kind === 'space') spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      renderSegments(ctx, segments, line.bbox.x, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, justifiedSpaceWidth);
      return;
    }
  }

  if ((block.textAlign === 'center' || block.textAlign === 'right') && segments) {
    let contentWidth = 0;
    for (const seg of segments) contentWidth += seg.width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    const startX = line.bbox.x + (block.textAlign === 'center' ? slack / 2 : slack);
    renderSegments(ctx, segments, startX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref/own font or colour); otherwise one text
  // object paints the line.
  if (segments && segments.some((s) => s.bold || s.italic || s.kind === 'math' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined || s.href !== undefined || s.pageLink !== undefined || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined)) {
    renderSegments(ctx, segments, line.bbox.x, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem);
    return;
  }

  tagContent(ctx, elem);
  const plainSlack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
  const plainX = line.bbox.x + (block.textAlign === 'right' ? plainSlack : block.textAlign === 'center' ? plainSlack / 2 : 0);
  // Each word where the layout measured it (EF-137): the embedded face's
  // own widths could differ, most of all for a character it has no glyph
  // for, and would carry the rest of the line along. A line with
  // right-to-left letters stays one run, which the shaper turns around.
  // The hyphen repeated from the line before is painted but not read.
  const actualText = line.repeatedHyphen && line.text.startsWith('-') ? line.text.slice(1) : undefined;
  if (segments && segments.length > 0 && !hasRightToLeft(line.text)
    && drawMeasuredTextPx(ctx, withLineEndSpace(segments, line.text), plainX, line.baseline, blockFont, blockSize, blockColor, tracking, actualText)) return;
  drawTextPx(ctx, line.text, plainX, line.baseline, blockFont, blockSize, blockColor, undefined, actualText);
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

/** Whether `text` holds a right-to-left letter: Hebrew, Arabic, Syriac,
 *  Thaana, N'Ko and the scripts after them up to U+08FF, their
 *  presentation forms, and the right-to-left blocks of the supplementary
 *  planes. */
function hasRightToLeft(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x0590) continue;
    if (c <= 0x08ff || (c >= 0xfb1d && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfefe)) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const cp = text.codePointAt(i)!;
      if ((cp >= 0x10800 && cp <= 0x10fff) || (cp >= 0x1e800 && cp <= 0x1efff)) return true;
      i++;
    }
  }
  return false;
}

function renderBullet(ctx: PageCtx, block: VDTBlock, fontCache: FontCache, elem: StructElem | undefined): void {
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
  drawTextPx(ctx, block.bulletText, block.bulletOffsetX, baselinePx, font, size, color);

  // Ordered-list separator styled apart from the number (own font/colour).
  if (block.separatorText && block.separatorX !== undefined) {
    const sepFontString = block.separatorFontString ?? block.bulletFontString;
    const sepFont = fontCache.get(sepFontString);
    if (!sepFont) return;
    const sepSize = parseFontString(sepFontString)?.sizePx ?? size;
    const sepColor = colorFromHex(block.separatorColor ?? colorHex, ctx.colorSpace);
    drawTextPx(ctx, block.separatorText, block.separatorX, onBaseline ? baselineY : midY + sepSize * 0.3, sepFont, sepSize, sepColor);
  }
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

/** Annotation rectangle of a block's box, in PDF points. */
function rectOfBlock(ctx: PageCtx, block: VDTBlock): [number, number, number, number] {
  const { scale, pageHeightPt } = ctx;
  const { x, y, width, height } = block.bbox;
  return [x * scale, pageHeightPt - (y + height) * scale, (x + width) * scale, pageHeightPt - y * scale];
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
  const structure = resourceCtx?.structure;
  const linkRegistry = resourceCtx?.linkRegistry;
  // A row of the contents links to the page it lists: the whole row is
  // the annotation, its text the `Link` element in a tagged render.
  const targetPage = block.tocEntry?.pageIndex ?? block.tocPart?.pageIndex;
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
      textElem ? { text: textElem, artifact: { type: 'Layout' } } : undefined,
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
  // A note is where its markers link to.
  if (block.footnoteNote !== undefined && linkRegistry) {
    linkRegistry.addDestination(
      footnoteDestination(linkRegistry, block.footnoteNote),
      ctx.page,
      block.bbox.x * ctx.scale,
      ctx.pageHeightPt - block.bbox.y * ctx.scale,
    );
  }
  // Justify against the block's own measure (see the canvas backend): blocks
  // inside callouts are narrower than their column.
  void columnWidth;
  void columnX;
  for (const line of block.lines) {
    renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, elem);
  }
  if (targetPage !== undefined && linkRegistry) {
    const contents = block.lines.map((l) => l.text).join(' ');
    linkRegistry.addPageLink(ctx.page, rectOfBlock(ctx, block), targetPage, link ? { elem: link, contents } : undefined);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
