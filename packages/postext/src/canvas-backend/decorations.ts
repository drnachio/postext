import type { VDTDocument, VDTPage, VDTColumn, BoundingBox } from '../vdt';
import { dimensionToPx } from '../units';
import { columnRuleSegments, footnoteRuleSegments } from '../columnRule';
import { cropMarkSegments } from '../cropMarks';
import { CHARACTER_GRID_COLOR, type CjkGridCells } from '../pipeline/cjkGrid';

export function renderBaselineGrid(
  ctx: CanvasRenderingContext2D,
  contentArea: BoundingBox,
  baselineIncrement: number,
  color: string,
  lineWidth: number,
  textExtent: { top: number; bottom: number },
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Baselines live on the global grid anchored at the content-area top
  // (first baseline at 0.8 × increment, matching line placement). The drawn
  // range is bounded by where text actually sits — from the first text line
  // to the last — so float bands and unused tail space show no lines.
  // `k0` may be negative: when column 0 carries a top float band,
  // `contentArea.y` (derived from that column) sits below the global top
  // while another column's text starts at it; band heights are grid
  // multiples, so those earlier baselines still lie on the global grid.
  const eps = 0.5;
  const firstBaseline = contentArea.y + baselineIncrement * 0.8;
  const k0 = Math.ceil((textExtent.top - eps - firstBaseline) / baselineIncrement);
  let y = firstBaseline + k0 * baselineIncrement;
  const right = contentArea.x + contentArea.width;

  while (y <= textExtent.bottom + eps) {
    ctx.beginPath();
    ctx.moveTo(contentArea.x, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += baselineIncrement;
  }

  ctx.restore();
}

/** The character grid (稿纸) over the type area (`cjk.grid.show`): one
 *  square per character position, drawn in a light grey (see
 *  `cjkGridCells`). */
export function renderCharacterGrid(ctx: CanvasRenderingContext2D, cells: CjkGridCells): void {
  ctx.save();
  ctx.strokeStyle = CHARACTER_GRID_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const { cell } = cells;
  cells.columns.forEach((x0, c) => {
    const chars = cells.columnChars[c] ?? cells.chars;
    const x1 = x0 + chars * cell;
    for (const y of cells.rows) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.moveTo(x0, y + cell);
      ctx.lineTo(x1, y + cell);
      for (let i = 0; i <= chars; i++) {
        ctx.moveTo(x0 + i * cell, y);
        ctx.lineTo(x0 + i * cell, y + cell);
      }
    }
  });
  ctx.stroke();
  ctx.restore();
}

export function renderColumnRule(
  ctx: CanvasRenderingContext2D,
  columns: VDTColumn[],
  color: string,
  lineWidth: number,
  footnoteAreas?: VDTPage['footnoteAreas'],
): void {
  if (columns.length < 2) return;

  // One segment per gutter of each column band; span columns interrupt the
  // rule (see `columnRuleSegments`).
  const segments = columnRuleSegments(columns, footnoteAreas);
  if (segments.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (const seg of segments) {
    ctx.beginPath();
    ctx.moveTo(seg.x, seg.top);
    ctx.lineTo(seg.x, seg.bottom);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderCutLines(
  ctx: CanvasRenderingContext2D,
  page: VDTPage,
  doc: VDTDocument,
): void {
  const { cutLines, dpi } = doc.config.page;
  if (!cutLines.enabled) return;

  ctx.save();
  ctx.strokeStyle = cutLines.color.hex;
  ctx.lineWidth = dimensionToPx(cutLines.markWidth, dpi);

  // Two marks at each trim corner, clear of the bleed (see `cropMarkSegments`).
  for (const seg of cropMarkSegments(page, doc.config.page, doc.trimOffset)) {
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  }

  ctx.restore();
}

/** The page's content area. Pages built by the pipeline carry it directly
 *  (`page.contentArea` — per page, so mirrored margins are honoured); the
 *  column-bbox inference below only serves hand-built pages. */
export function computeContentArea(page: VDTPage, doc: VDTDocument): BoundingBox {
  if (page.contentArea) return page.contentArea;
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

/** The separator rules above the footnotes of a page's columns. */
export function renderFootnoteRules(ctx: CanvasRenderingContext2D, page: VDTPage): void {
  const rules = footnoteRuleSegments(page);
  if (rules.length === 0) return;
  ctx.save();
  for (const r of rules) {
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.lineWidthPx;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + r.width, r.y);
    ctx.stroke();
  }
  ctx.restore();
}
