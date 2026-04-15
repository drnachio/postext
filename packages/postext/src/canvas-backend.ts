import type { VDTDocument, VDTPage, VDTBlock, VDTLine, VDTColumn, BoundingBox } from './vdt';
import { dimensionToPx } from './units';

// ---------------------------------------------------------------------------
// Baseline grid overlay
// ---------------------------------------------------------------------------

function renderBaselineGrid(
  ctx: CanvasRenderingContext2D,
  contentArea: BoundingBox,
  baselineIncrement: number,
  color: string,
  lineWidth: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Draw one baseline per line that actually fits in the content area.
  // Must match the placement logic: Math.floor(height / lineHeight) lines.
  const maxLines = Math.floor(contentArea.height / baselineIncrement);
  let y = contentArea.y + baselineIncrement * 0.8;
  const right = contentArea.x + contentArea.width;

  for (let i = 0; i < maxLines; i++) {
    ctx.beginPath();
    ctx.moveTo(contentArea.x, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += baselineIncrement;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Column rule (vertical line between columns)
// ---------------------------------------------------------------------------

function renderColumnRule(
  ctx: CanvasRenderingContext2D,
  columns: VDTColumn[],
  color: string,
  lineWidth: number,
): void {
  if (columns.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (let i = 0; i < columns.length - 1; i++) {
    const left = columns[i]!.bbox;
    const right = columns[i + 1]!.bbox;
    const x = (left.x + left.width + right.x) / 2;
    const top = Math.min(left.y, right.y);
    const bottom = Math.max(left.y + left.height, right.y + right.height);

    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Crop marks (trim marks)
// ---------------------------------------------------------------------------

function renderCutLines(
  ctx: CanvasRenderingContext2D,
  page: VDTPage,
  doc: VDTDocument,
): void {
  const { cutLines, dpi } = doc.config.page;
  if (!cutLines.enabled) return;

  const bleedPx = dimensionToPx(cutLines.bleed, dpi);
  const markOffsetPx = dimensionToPx(cutLines.markOffset, dpi);
  const markLengthPx = dimensionToPx(cutLines.markLength, dpi);
  const markWidthPx = dimensionToPx(cutLines.markWidth, dpi);
  const totalExpansion = bleedPx + markOffsetPx + markLengthPx;

  // Trim rect (the final page after cutting)
  const trimX = totalExpansion;
  const trimY = totalExpansion;
  const trimW = page.width - totalExpansion * 2;
  const trimH = page.height - totalExpansion * 2;

  ctx.save();
  ctx.strokeStyle = cutLines.color.hex;
  ctx.lineWidth = markWidthPx;

  // Each corner has two perpendicular marks.
  // Marks start at markOffset outside the trim edge and extend markLength further out.
  const corners = [
    { x: trimX, y: trimY },                    // top-left
    { x: trimX + trimW, y: trimY },            // top-right
    { x: trimX, y: trimY + trimH },            // bottom-left
    { x: trimX + trimW, y: trimY + trimH },    // bottom-right
  ];

  for (const corner of corners) {
    const isLeft = corner.x === trimX;
    const isTop = corner.y === trimY;

    // Horizontal mark
    const hDir = isLeft ? -1 : 1;
    const hStart = corner.x + hDir * markOffsetPx;
    const hEnd = corner.x + hDir * (markOffsetPx + markLengthPx);
    ctx.beginPath();
    ctx.moveTo(hStart, corner.y);
    ctx.lineTo(hEnd, corner.y);
    ctx.stroke();

    // Vertical mark
    const vDir = isTop ? -1 : 1;
    const vStart = corner.y + vDir * markOffsetPx;
    const vEnd = corner.y + vDir * (markOffsetPx + markLengthPx);
    ctx.beginPath();
    ctx.moveTo(corner.x, vStart);
    ctx.lineTo(corner.x, vEnd);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Text rendering
// ---------------------------------------------------------------------------

function pickSegmentFont(
  bold: boolean,
  italic: boolean,
  font: string,
  boldFont: string | undefined,
  italicFont: string | undefined,
  boldItalicFont: string | undefined,
): string {
  if (bold && italic && boldItalicFont) return boldItalicFont;
  if (bold && boldFont) return boldFont;
  if (italic && italicFont) return italicFont;
  return font;
}

function renderLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string | undefined,
  italicFont: string | undefined,
  boldItalicFont: string | undefined,
  color: string,
  textAlign: 'left' | 'justify',
  columnWidth: number,
  columnX: number,
): void {
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';

  const hasRichSegments =
    line.segments && line.segments.some((s) => s.bold || s.italic);

  // Effective width accounts for line-level indent (e.g. first-line or hanging indent)
  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;

  // Justified rendering with per-segment spacing
  if (textAlign === 'justify' && !line.isLastLine && line.segments && line.segments.length > 0) {
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
          ctx.font = pickSegmentFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
          ctx.fillText(seg.text, x, line.baseline);
          x += seg.width;
        }
      }
      return;
    }
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified blocks
  // If there are bold/italic segments, render per-segment to apply correct fonts
  if (hasRichSegments && line.segments) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else {
        ctx.font = pickSegmentFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
        ctx.fillText(seg.text, x, line.baseline);
        x += seg.width;
      }
    }
    return;
  }

  ctx.font = font;
  ctx.fillText(line.text, line.bbox.x, line.baseline);
}

function renderBullet(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  if (!block.bulletText || !block.bulletFontString || block.bulletOffsetX === undefined) return;
  const firstLine = block.lines[0];
  if (!firstLine) return;
  ctx.save();
  ctx.fillStyle = block.bulletColor ?? block.color;
  ctx.textBaseline = 'middle';
  ctx.font = block.bulletFontString;
  const y = block.bulletY ?? firstLine.baseline;
  ctx.fillText(block.bulletText, block.bulletOffsetX, y);
  ctx.restore();
}

function renderBlock(
  ctx: CanvasRenderingContext2D,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
): void {
  if (block.type === 'listItem') {
    renderBullet(ctx, block);
  }
  for (const line of block.lines) {
    renderLine(
      ctx,
      line,
      block.fontString,
      block.boldFontString,
      block.italicFontString,
      block.boldItalicFontString,
      block.color,
      block.textAlign,
      columnWidth,
      columnX,
    );
  }
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

function computeContentArea(page: VDTPage, doc: VDTDocument): BoundingBox {
  const { dpi, margins } = doc.config.page;

  // We can derive content area from page dimensions and margins
  // (same logic as pipeline, but we recalculate from resolved config)
  const pxPerCm = dpi / 2.54;
  const marginTop = margins.top.unit === 'cm' ? margins.top.value * pxPerCm : margins.top.value;
  const marginLeft = margins.left.unit === 'cm' ? margins.left.value * pxPerCm : margins.left.value;

  // Use the first column's bbox to infer content area bounds
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

export function renderPageToCanvas(
  page: VDTPage,
  doc: VDTDocument,
  canvas: HTMLCanvasElement,
): void {
  canvas.width = Math.round(page.width);
  canvas.height = Math.round(page.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  const bgColor = doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;

  // Always fill the full canvas white first (mark area stays white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fill the trim+bleed area with the page background
  if (bgColor && bgColor !== 'transparent') {
    const bleedPx = trimOff > 0 ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi) : 0;
    ctx.fillStyle = bgColor;
    ctx.fillRect(
      trimOff - bleedPx,
      trimOff - bleedPx,
      canvas.width - (trimOff - bleedPx) * 2,
      canvas.height - (trimOff - bleedPx) * 2,
    );
  }

  // Baseline grid overlay
  if (doc.config.page.baselineGrid.enabled) {
    const contentArea = computeContentArea(page, doc);
    const isLastPage = page.index === doc.pages.length - 1;

    // On non-last pages, limit the grid to the height actually used by
    // placed blocks so that no "phantom" baselines appear at the bottom
    // when the split / orphan-control algorithm leaves unused space.
    if (!isLastPage && page.columns.length > 0) {
      const maxUsed = Math.max(
        ...page.columns.map((col) => col.bbox.height - col.availableHeight),
      );
      contentArea.height = maxUsed;
    }

    const gridLineWidthPx = dimensionToPx(doc.config.page.baselineGrid.lineWidth, doc.config.page.dpi);
    renderBaselineGrid(
      ctx,
      contentArea,
      doc.baselineGrid,
      doc.config.page.baselineGrid.color.hex,
      gridLineWidthPx,
    );
  }

  // Column rule between columns
  if (doc.config.layout.columnRule.enabled && page.columns.length > 1) {
    const crLineWidthPx = dimensionToPx(doc.config.layout.columnRule.lineWidth, doc.config.page.dpi);
    renderColumnRule(ctx, page.columns, doc.config.layout.columnRule.color.hex, crLineWidthPx);
  }

  // Render all blocks (clip to column bounds to prevent overflow)
  for (const col of page.columns) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(col.bbox.x, col.bbox.y, col.bbox.width, col.bbox.height);
    ctx.clip();
    for (const block of col.blocks) {
      renderBlock(ctx, block, col.bbox.width, col.bbox.x);
    }
    ctx.restore();
  }

  // Crop marks (drawn last, on top of everything)
  renderCutLines(ctx, page, doc);
}

export function renderPage(
  page: VDTPage,
  doc: VDTDocument,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  renderPageToCanvas(page, doc, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderToCanvas(doc: VDTDocument): HTMLCanvasElement[] {
  return doc.pages.map((page) => renderPage(page, doc));
}
