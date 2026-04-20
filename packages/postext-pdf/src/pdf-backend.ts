import {
  PDFDocument,
  rgb,
  BlendMode,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  type PDFPage,
  type PDFFont,
  type RGB,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {
  VDTDocument,
  VDTPage,
  VDTColumn,
  VDTBlock,
  VDTLine,
  BoundingBox,
} from 'postext';
import { dimensionToPx } from 'postext';
import { hexToRgb } from './colors';
import { parseFontString } from './fontString';
import { FontCache, type PdfFontProvider } from './fontCache';

export interface RenderToPdfOptions {
  fontProvider: PdfFontProvider;
  pageNegative?: boolean;
}

export type { PdfFontProvider };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScale(dpi: number): number {
  return 72 / dpi;
}

function rgbFromHex(hex: string): RGB {
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
}

/** Collect every fontString referenced anywhere in the VDT. */
function collectFontStrings(doc: VDTDocument): string[] {
  const out = new Set<string>();
  for (const block of doc.blocks) {
    if (block.fontString) out.add(block.fontString);
    if (block.boldFontString) out.add(block.boldFontString);
    if (block.italicFontString) out.add(block.italicFontString);
    if (block.boldItalicFontString) out.add(block.boldItalicFontString);
    if (block.bulletFontString) out.add(block.bulletFontString);
  }
  return [...out];
}

function pickSegmentFont(
  bold: boolean,
  italic: boolean,
  block: VDTBlock,
): string {
  if (bold && italic && block.boldItalicFontString) return block.boldItalicFontString;
  if (bold && block.boldFontString) return block.boldFontString;
  if (italic && block.italicFontString) return block.italicFontString;
  return block.fontString;
}

function pickSegmentColor(
  bold: boolean,
  italic: boolean,
  block: VDTBlock,
): string {
  if (bold && block.boldColor) return block.boldColor;
  if (italic && block.italicColor) return block.italicColor;
  return block.color;
}

// ---------------------------------------------------------------------------
// Drawing primitives (pixel-space → PDF point-space)
// ---------------------------------------------------------------------------

interface PageCtx {
  page: PDFPage;
  pageHeightPt: number;
  scale: number;
}

function fillRectPx(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  color: RGB,
  blendMode?: BlendMode,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    ...(blendMode ? { blendMode } : {}),
  });
}

function drawLinePx(
  ctx: PageCtx,
  x1Px: number,
  y1Px: number,
  x2Px: number,
  y2Px: number,
  color: RGB,
  thicknessPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  ctx.page.drawLine({
    start: { x: x1Px * scale, y: pageHeightPt - y1Px * scale },
    end: { x: x2Px * scale, y: pageHeightPt - y2Px * scale },
    color,
    thickness: Math.max(0.01, thicknessPx * scale),
  });
}

function drawTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: RGB,
): void {
  if (!text) return;
  const { scale, pageHeightPt } = ctx;
  ctx.page.drawText(text, {
    x: xPx * scale,
    y: pageHeightPt - baselinePx * scale,
    size: sizePx * scale,
    font,
    color,
  });
}

function pushClipRect(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  ctx.page.pushOperators(
    pushGraphicsState(),
    rectangle(x, y, width, height),
    clip(),
    endPath(),
  );
}

function popClip(ctx: PageCtx): void {
  ctx.page.pushOperators(popGraphicsState());
}

// ---------------------------------------------------------------------------
// Element renderers
// ---------------------------------------------------------------------------

function renderBaselineGrid(
  ctx: PageCtx,
  contentArea: BoundingBox,
  baselineIncrement: number,
  colorHex: string,
  lineWidthPx: number,
): void {
  const color = rgbFromHex(colorHex);
  const maxLines = Math.floor(contentArea.height / baselineIncrement);
  let y = contentArea.y + baselineIncrement * 0.8;
  const right = contentArea.x + contentArea.width;
  for (let i = 0; i < maxLines; i++) {
    drawLinePx(ctx, contentArea.x, y, right, y, color, lineWidthPx);
    y += baselineIncrement;
  }
}

function renderColumnRule(
  ctx: PageCtx,
  columns: VDTColumn[],
  colorHex: string,
  lineWidthPx: number,
): void {
  if (columns.length < 2) return;
  const color = rgbFromHex(colorHex);
  for (let i = 0; i < columns.length - 1; i++) {
    const left = columns[i]!.bbox;
    const right = columns[i + 1]!.bbox;
    const x = (left.x + left.width + right.x) / 2;
    const top = Math.min(left.y, right.y);
    const bottom = Math.max(left.y + left.height, right.y + right.height);
    drawLinePx(ctx, x, top, x, bottom, color, lineWidthPx);
  }
}

function renderCutLines(ctx: PageCtx, page: VDTPage, doc: VDTDocument): void {
  const { cutLines, dpi } = doc.config.page;
  if (!cutLines.enabled) return;
  const bleedPx = dimensionToPx(cutLines.bleed, dpi);
  const markOffsetPx = dimensionToPx(cutLines.markOffset, dpi);
  const markLengthPx = dimensionToPx(cutLines.markLength, dpi);
  const markWidthPx = dimensionToPx(cutLines.markWidth, dpi);
  const totalExpansion = bleedPx + markOffsetPx + markLengthPx;
  const trimX = totalExpansion;
  const trimY = totalExpansion;
  const trimW = page.width - totalExpansion * 2;
  const trimH = page.height - totalExpansion * 2;
  const color = rgbFromHex(cutLines.color.hex);

  const corners = [
    { x: trimX, y: trimY },
    { x: trimX + trimW, y: trimY },
    { x: trimX, y: trimY + trimH },
    { x: trimX + trimW, y: trimY + trimH },
  ];

  for (const corner of corners) {
    const isLeft = corner.x === trimX;
    const isTop = corner.y === trimY;
    const hDir = isLeft ? -1 : 1;
    const hStart = corner.x + hDir * markOffsetPx;
    const hEnd = corner.x + hDir * (markOffsetPx + markLengthPx);
    drawLinePx(ctx, hStart, corner.y, hEnd, corner.y, color, markWidthPx);
    const vDir = isTop ? -1 : 1;
    const vStart = corner.y + vDir * markOffsetPx;
    const vEnd = corner.y + vDir * (markOffsetPx + markLengthPx);
    drawLinePx(ctx, corner.x, vStart, corner.x, vEnd, color, markWidthPx);
  }
}

function renderLine(
  ctx: PageCtx,
  line: VDTLine,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
): void {
  const blockFont = fontCache.get(block.fontString);
  if (!blockFont) return;
  const blockSize = parseFontString(block.fontString)?.sizePx ?? 0;
  const blockColor = rgbFromHex(block.color);

  const hasRichSegments =
    !!line.segments && line.segments.some((s) => s.bold || s.italic);

  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;

  if (block.textAlign === 'justify' && !line.isLastLine && line.segments && line.segments.length > 0) {
    let wordWidth = 0;
    let spaceCount = 0;
    for (const seg of line.segments) {
      if (seg.kind === 'space') spaceCount++;
      else wordWidth += seg.width;
    }
    if (spaceCount > 0) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      let x = line.bbox.x;
      for (const seg of line.segments) {
        if (seg.kind === 'space') {
          x += justifiedSpaceWidth;
        } else {
          const fontStr = pickSegmentFont(!!seg.bold, !!seg.italic, block);
          const font = fontCache.get(fontStr) ?? blockFont;
          const size = parseFontString(fontStr)?.sizePx ?? blockSize;
          const colorHex = pickSegmentColor(!!seg.bold, !!seg.italic, block);
          const color = colorHex === block.color ? blockColor : rgbFromHex(colorHex);
          drawTextPx(ctx, seg.text, x, line.baseline, font, size, color);
          x += seg.width;
        }
      }
      return;
    }
  }

  if (hasRichSegments && line.segments) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else {
        const fontStr = pickSegmentFont(!!seg.bold, !!seg.italic, block);
        const font = fontCache.get(fontStr) ?? blockFont;
        const size = parseFontString(fontStr)?.sizePx ?? blockSize;
        const colorHex = pickSegmentColor(!!seg.bold, !!seg.italic, block);
        const color = colorHex === block.color ? blockColor : rgbFromHex(colorHex);
        drawTextPx(ctx, seg.text, x, line.baseline, font, size, color);
        x += seg.width;
      }
    }
    return;
  }

  drawTextPx(ctx, line.text, line.bbox.x, line.baseline, blockFont, blockSize, blockColor);
}

function renderBullet(ctx: PageCtx, block: VDTBlock, fontCache: FontCache): void {
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
  const color = rgbFromHex(colorHex);

  // Canvas uses `textBaseline='middle'` at bulletY; pdf-lib draws from the
  // alphabetic baseline. Shift the baseline down by ~0.3em so the em-square
  // midline aligns at bulletY, matching canvas placement within hinting tolerance.
  const midY = block.bulletY ?? firstLine.baseline;
  const baselinePx = midY + size * 0.3;
  drawTextPx(ctx, block.bulletText, block.bulletOffsetX, baselinePx, font, size, color);
}

function renderStrikethrough(ctx: PageCtx, block: VDTBlock): void {
  if (!block.strikethroughText) return;
  const color = rgbFromHex(block.color);
  const thickness = Math.max(
    1,
    block.lines[0]?.bbox.height ? block.lines[0].bbox.height * 0.05 : 1,
  );
  for (const line of block.lines) {
    const y = line.baseline - line.bbox.height * 0.28;
    drawLinePx(ctx, line.bbox.x, y, line.bbox.x + line.bbox.width, y, color, thickness);
  }
}

function renderBlock(
  ctx: PageCtx,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
): void {
  if (block.type === 'listItem') {
    renderBullet(ctx, block, fontCache);
  }
  for (const line of block.lines) {
    renderLine(ctx, line, block, columnWidth, columnX, fontCache);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

function computeContentArea(page: VDTPage, doc: VDTDocument): BoundingBox {
  const { dpi, margins } = doc.config.page;
  const pxPerCm = dpi / 2.54;
  const marginTop = margins.top.unit === 'cm' ? margins.top.value * pxPerCm : margins.top.value;
  const marginLeft = margins.left.unit === 'cm' ? margins.left.value * pxPerCm : margins.left.value;
  if (page.columns.length > 0) {
    const firstCol = page.columns[0]!;
    const lastCol = page.columns[page.columns.length - 1]!;
    return {
      x: firstCol.bbox.x,
      y: firstCol.bbox.y,
      width: (lastCol.bbox.x + lastCol.bbox.width) - firstCol.bbox.x,
      height: firstCol.bbox.height,
    };
  }
  return { x: marginLeft, y: marginTop, width: 0, height: 0 };
}

function renderPage(
  pdfDoc: PDFDocument,
  vdtPage: VDTPage,
  doc: VDTDocument,
  fontCache: FontCache,
  pageNegative: boolean,
): void {
  const scale = makeScale(doc.config.page.dpi);
  const pageWidthPt = vdtPage.width * scale;
  const pageHeightPt = vdtPage.height * scale;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  const ctx: PageCtx = { page, pageHeightPt, scale };

  // Background: full page white first (cut-mark area stays white), then the
  // trim+bleed area filled with the configured page background colour.
  fillRectPx(ctx, 0, 0, vdtPage.width, vdtPage.height, rgb(1, 1, 1));

  const bgHex = doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;
  if (bgHex && bgHex !== 'transparent') {
    const bleedPx = trimOff > 0
      ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)
      : 0;
    fillRectPx(
      ctx,
      trimOff - bleedPx,
      trimOff - bleedPx,
      vdtPage.width - (trimOff - bleedPx) * 2,
      vdtPage.height - (trimOff - bleedPx) * 2,
      rgbFromHex(bgHex),
    );
  }

  if (doc.config.page.baselineGrid.enabled) {
    const contentArea = computeContentArea(vdtPage, doc);
    const isLastPage = vdtPage.index === doc.pages.length - 1;
    if (!isLastPage && vdtPage.columns.length > 0) {
      const maxUsed = Math.max(
        ...vdtPage.columns.map((col) => col.bbox.height - col.availableHeight),
      );
      contentArea.height = maxUsed;
    }
    const gridLineWidthPx = dimensionToPx(
      doc.config.page.baselineGrid.lineWidth,
      doc.config.page.dpi,
    );
    renderBaselineGrid(
      ctx,
      contentArea,
      doc.baselineGrid,
      doc.config.page.baselineGrid.color.hex,
      gridLineWidthPx,
    );
  }

  if (doc.config.layout.columnRule.enabled && vdtPage.columns.length > 1) {
    const crLineWidthPx = dimensionToPx(
      doc.config.layout.columnRule.lineWidth,
      doc.config.page.dpi,
    );
    renderColumnRule(
      ctx,
      vdtPage.columns,
      doc.config.layout.columnRule.color.hex,
      crLineWidthPx,
    );
  }

  const clipOverhang = dimensionToPx({ value: 2, unit: 'pt' }, doc.config.page.dpi);
  for (const col of vdtPage.columns) {
    pushClipRect(
      ctx,
      col.bbox.x - clipOverhang,
      col.bbox.y,
      col.bbox.width + clipOverhang * 2,
      col.bbox.height,
    );
    for (const block of col.blocks) {
      renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache);
    }
    popClip(ctx);
  }

  // Page negative: overlay white rect with Difference blend across trim+bleed.
  // Crop marks remain un-inverted (drawn afterwards).
  if (pageNegative) {
    const bleedPx = trimOff > 0
      ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)
      : 0;
    const invX = trimOff - bleedPx;
    const invY = trimOff - bleedPx;
    const invW = vdtPage.width - (trimOff - bleedPx) * 2;
    const invH = vdtPage.height - (trimOff - bleedPx) * 2;
    fillRectPx(ctx, invX, invY, invW, invH, rgb(1, 1, 1), BlendMode.Difference);
  }

  renderCutLines(ctx, vdtPage, doc);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderToPdf(
  doc: VDTDocument,
  options: RenderToPdfOptions,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  if (doc.metadata?.title) pdfDoc.setTitle(doc.metadata.title);
  if (doc.metadata?.author) pdfDoc.setAuthor(doc.metadata.author);
  pdfDoc.setCreator('postext');
  pdfDoc.setProducer('postext-pdf');

  const fontCache = new FontCache(pdfDoc, options.fontProvider);
  await fontCache.preloadFontStrings(collectFontStrings(doc));

  const missing = fontCache.missing();
  if (missing.length > 0) {
    throw new Error(
      `postext-pdf: failed to load font(s): ${missing.join(', ')}`,
    );
  }

  for (const page of doc.pages) {
    renderPage(pdfDoc, page, doc, fontCache, options.pageNegative ?? false);
  }

  return pdfDoc.save();
}
