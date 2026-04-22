import type { VDTDocument, VDTPage } from '../vdt';
import { dimensionToPx } from '../units';
import { renderBaselineGrid, renderColumnRule, renderCutLines, computeContentArea } from './decorations';
import { renderBlock } from './blockRender';
import { renderHeaderFooterSlot } from './headerFooter';

export interface RenderPageOptions {
  pageNegative?: boolean;
}

export function renderPageToCanvas(
  page: VDTPage,
  doc: VDTDocument,
  canvas: HTMLCanvasElement,
  options?: RenderPageOptions,
): void {
  canvas.width = Math.round(page.width);
  canvas.height = Math.round(page.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (options?.pageNegative) {
    ctx.filter = 'invert(1)';
  }

  const bgColor = doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  if (doc.config.layout.columnRule.enabled && page.columns.length > 1) {
    const crLineWidthPx = dimensionToPx(doc.config.layout.columnRule.lineWidth, doc.config.page.dpi);
    renderColumnRule(ctx, page.columns, doc.config.layout.columnRule.color.hex, crLineWidthPx);
  }

  // Clip to column bounds, widened horizontally by a small buffer so that
  // glyph ink extending past its advance width (e.g. the tail of an "s" at the
  // column edge) is not chopped. Between-column gutters absorb the buffer.
  const clipOverhang = dimensionToPx({ value: 2, unit: 'pt' }, doc.config.page.dpi);
  for (const col of page.columns) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      col.bbox.x - clipOverhang,
      col.bbox.y,
      col.bbox.width + clipOverhang * 2,
      col.bbox.height,
    );
    ctx.clip();
    for (const block of col.blocks) {
      renderBlock(ctx, block, col.bbox.width, col.bbox.x);
    }
    ctx.restore();
  }

  if (page.header) renderHeaderFooterSlot(ctx, page.header);
  if (page.footer) renderHeaderFooterSlot(ctx, page.footer);

  if (options?.pageNegative) {
    ctx.filter = 'none';
  }

  renderCutLines(ctx, page, doc);
}

export function renderPage(page: VDTPage, doc: VDTDocument): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  renderPageToCanvas(page, doc, canvas);
  return canvas;
}

export function renderToCanvas(doc: VDTDocument): HTMLCanvasElement[] {
  return doc.pages.map((page) => renderPage(page, doc));
}
