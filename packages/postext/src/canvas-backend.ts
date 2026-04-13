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
// Text rendering
// ---------------------------------------------------------------------------

function renderLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string | undefined,
  color: string,
  textAlign: 'left' | 'justify',
  columnWidth: number,
): void {
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';

  const hasBoldSegments = boldFont && line.segments && line.segments.some((s) => s.bold);

  // Justified rendering with per-segment spacing
  if (textAlign === 'justify' && !line.isLastLine && line.segments && line.segments.length > 0) {
    let wordWidth = 0;
    let spaceCount = 0;
    for (const seg of line.segments) {
      if (seg.kind === 'space') spaceCount++;
      else wordWidth += seg.width;
    }

    if (spaceCount > 0) {
      const justifiedSpaceWidth = (columnWidth - wordWidth) / spaceCount;
      let x = line.bbox.x;
      for (const seg of line.segments) {
        if (seg.kind === 'space') {
          x += justifiedSpaceWidth;
        } else {
          ctx.font = seg.bold && boldFont ? boldFont : font;
          ctx.fillText(seg.text, x, line.baseline);
          x += seg.width;
        }
      }
      return;
    }
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified blocks
  // If there are bold segments, render per-segment to apply correct fonts
  if (hasBoldSegments && line.segments) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else {
        ctx.font = seg.bold && boldFont ? boldFont : font;
        ctx.fillText(seg.text, x, line.baseline);
        x += seg.width;
      }
    }
    return;
  }

  ctx.font = font;
  ctx.fillText(line.text, line.bbox.x, line.baseline);
}

function renderBlock(
  ctx: CanvasRenderingContext2D,
  block: VDTBlock,
  columnWidth: number,
): void {
  for (const line of block.lines) {
    renderLine(ctx, line, block.fontString, block.boldFontString, block.color, block.textAlign, columnWidth);
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
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      renderBlock(ctx, block, col.bbox.width);
    }
    ctx.restore();
  }
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
