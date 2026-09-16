import { setCharacterSpacing } from 'pdf-lib';
import type { Color, PDFFont } from 'pdf-lib';
import type { VDTBlock, VDTLine, VDTLineSegment, MathRender } from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import { type PageCtx, drawLinePx, drawTextPx, colorFromHex } from './primitives';
import { pickSegmentColor, pickSegmentFont } from './fontHelpers';
import { renderHeaderFooterSlot } from './headerFooter';
import {
  renderResourceBlock,
  type ResourceImageMap,
} from './renderResourceBlock';
import { LinkRegistry } from './links';
import { tagArtifact, tagContent, type StructElem } from './tagging';
import type { StructureFlow } from './structureFlow';

/** Per-document context for resource rendering, threaded through `renderBlock`. */
export interface ResourceRenderContext {
  images: ResourceImageMap;
  linkRegistry: LinkRegistry;
  /** Structure mapping of an accessible (tagged) render; absent otherwise. */
  structure?: StructureFlow;
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
    const color = path.fill === 'currentColor' ? fallbackColor : colorFromHex(path.fill, ctx.colorSpace);
    ctx.page.drawSvgPath(path.d, { x, y, scale: S, color });
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
 * never has to infer them from the gaps of a justified line.
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
  for (const seg of segments) {
    if (seg.kind === 'space') {
      if (ctx.tags && seg.text) {
        tagContent(ctx, elem);
        drawTextPx(ctx, seg.text, x, baseline, blockFont, blockSize, blockColor);
      }
      x += justifiedSpaceWidth ?? seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      if (elem) {
        const formula = elem.type === 'Formula' ? elem : elem.child('Formula', { alt: seg.mathRender?.tex ?? '' });
        tagContent(ctx, formula);
      }
      renderMathSegment(ctx, seg, x, baseline, blockColor);
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
    const link = seg.refResourceId !== undefined && elem ? elem.child('Link') : undefined;
    tagContent(ctx, link ?? elem);
    drawTextPx(ctx, seg.text, x, baseline + (seg.baselineShift ?? 0), font, size, color);
    if (seg.refResourceId !== undefined && linkRegistry) {
      const { scale, pageHeightPt } = ctx;
      const x1 = x * scale;
      const x2 = (x + seg.width) * scale;
      const y2 = pageHeightPt - line.bbox.y * scale;
      const y1 = pageHeightPt - (line.bbox.y + line.bbox.height) * scale;
      linkRegistry.addLink(ctx.page, [x1, y1, x2, y2], seg.refResourceId, link ? { elem: link, contents: seg.text } : undefined);
    }
    x += seg.width;
  }
}

/** Column-balancing tracking: the block was measured with extra advance
 *  after every glyph, so paint it with the matching character spacing
 *  (`Tc`, in points at the page scale) and reset it afterwards. */
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
  const tracked = block.letterSpacing !== undefined && block.letterSpacing > 0;
  if (tracked) ctx.page.pushOperators(setCharacterSpacing(block.letterSpacing! * ctx.scale));
  renderLineText(ctx, line, block, columnWidth, columnX, fontCache, linkRegistry, elem);
  if (tracked) ctx.page.pushOperators(setCharacterSpacing(0));
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
    const slack = Math.max(0, effectiveWidth - contentWidth);
    const startX = line.bbox.x + (block.textAlign === 'center' ? slack / 2 : slack);
    renderSegments(ctx, segments, startX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref/own font or colour); otherwise one drawTextPx
  // paints the line.
  if (segments && segments.some((s) => s.bold || s.italic || s.kind === 'math' || s.refResourceId !== undefined || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined)) {
    renderSegments(ctx, segments, line.bbox.x, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem);
    return;
  }

  tagContent(ctx, elem);
  const plainX = block.textAlign === 'right' ? line.bbox.x + Math.max(0, effectiveWidth - line.bbox.width) : line.bbox.x;
  drawTextPx(ctx, line.text, plainX, line.baseline, blockFont, blockSize, blockColor);
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
  const midY = block.bulletY ?? firstLine.baseline;
  const baselinePx = midY + size * 0.3;
  tagContent(ctx, elem);
  drawTextPx(ctx, block.bulletText, block.bulletOffsetX, baselinePx, font, size, color);

  // Ordered-list separator styled apart from the number (own font/colour).
  if (block.separatorText && block.separatorX !== undefined) {
    const sepFontString = block.separatorFontString ?? block.bulletFontString;
    const sepFont = fontCache.get(sepFontString);
    if (!sepFont) return;
    const sepSize = parseFontString(sepFontString)?.sizePx ?? size;
    const sepColor = colorFromHex(block.separatorColor ?? colorHex, ctx.colorSpace);
    drawTextPx(ctx, block.separatorText, block.separatorX, midY + sepSize * 0.3, sepFont, sepSize, sepColor);
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
