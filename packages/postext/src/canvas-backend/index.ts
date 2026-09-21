import type { VDTDocument, VDTPage } from '../vdt';
import { computePageTextExtent } from '../vdt';
import { dimensionToPx } from '../units';
import { renderBaselineGrid, renderColumnRule, renderCutLines, computeContentArea } from './decorations';
import { renderBlock } from './blockRender';
import { renderHeaderFooterSlot } from './headerFooter';
export {
  registerResourceImage,
  unregisterResourceImage,
  clearResourceImages,
  getResourceImage,
} from './renderResourceBlock';
export type { ResourceImageSource, RegisterResourceImageOptions } from './renderResourceBlock';

export interface RenderPageOptions {
  pageNegative?: boolean;
  /** Bitmap pixels per page pixel (1 = the page's own resolution, the
   *  document's dpi). A page shown smaller than its size is painted at the
   *  size it is shown, times the device pixel ratio: fewer pixels to fill
   *  and to keep. The drawing itself stays in page pixels. */
  scale?: number;
}

export function renderPageToCanvas(
  page: VDTPage,
  doc: VDTDocument,
  canvas: HTMLCanvasElement,
  options?: RenderPageOptions,
): void {
  const scale = options?.scale && options.scale > 0 ? options.scale : 1;
  canvas.width = Math.max(1, Math.round(page.width * scale));
  canvas.height = Math.max(1, Math.round(page.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (scale !== 1) ctx.scale(scale, scale);

  if (options?.pageNegative) {
    ctx.filter = 'invert(1)';
  }

  const bgColor = doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);

  if (bgColor && bgColor !== 'transparent') {
    const bleedPx = trimOff > 0 ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi) : 0;
    ctx.fillStyle = bgColor;
    ctx.fillRect(
      trimOff - bleedPx,
      trimOff - bleedPx,
      page.width - (trimOff - bleedPx) * 2,
      page.height - (trimOff - bleedPx) * 2,
    );
  }

  if (doc.config.page.baselineGrid.enabled) {
    // Bound the grid to the page's actual text: from the first text line to
    // the last. Pages with no text (blank parity pages) draw no grid, and
    // float bands at the top show no phantom baselines.
    const textExtent = computePageTextExtent(page);
    if (textExtent) {
      const contentArea = computeContentArea(page, doc);
      const gridLineWidthPx = dimensionToPx(doc.config.page.baselineGrid.lineWidth, doc.config.page.dpi);
      renderBaselineGrid(
        ctx,
        contentArea,
        doc.baselineGrid,
        doc.config.page.baselineGrid.color.hex,
        gridLineWidthPx,
        textExtent,
      );
    }
  }

  if (doc.config.layout.columnRule.enabled && page.columns.length > 1) {
    const crLineWidthPx = dimensionToPx(doc.config.layout.columnRule.lineWidth, doc.config.page.dpi);
    renderColumnRule(ctx, page.columns, doc.config.layout.columnRule.color.hex, crLineWidthPx);
  }

  // Opener / part bands are painted before the columns so their backgrounds
  // sit under the body text rather than over it.
  if (page.openerBand) renderHeaderFooterSlot(ctx, page.openerBand);

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
      if (block.tocPart && block.designOverlay) continue;
      renderBlock(ctx, block, col.bbox.width, col.bbox.x);
    }
    ctx.restore();
    // A part row of the contents carries a design of its own, which may
    // run past the column (a band reaching beyond the page numbers): it
    // is drawn outside the column clip, like a float.
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) renderBlock(ctx, block, col.bbox.width, col.bbox.x);
    }
  }

  // Out-of-flow blocks — floated resources and fixed-position callouts —
  // live outside the column clip (a `span: 'page'` float crosses the
  // gutter). They were positioned at build time, so they render straight
  // from their absolute bbox.
  if (page.floats) {
    for (const fb of page.floats) renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x);
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
