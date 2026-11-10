// Full-page plates set to the trim or the bleed (#1461).
import { createBoundingBox, type BoundingBox, type VDTPage } from '../../../vdt.js';
import { composeSource } from '../../resources/safeArea.js';
import { shiftLines } from '../../resources/resourceLayout/snippets.js';
import { dimensionToPx } from '../../../units.js';
import type { PageMetrics } from '../../blocks/buildHelpers.js';

/** The air the paper band keeps round a plate's caption and note. */
const BAND_PADDING = { value: 2, unit: 'mm' } as const;

/**
 * Spreads the body of each plate on `page` set to the trim or the bleed
 * (`VDTResourceBlock.plateArea`) from the content area, where the layout
 * set it, to that edge of the sheet: the picture is enlarged to cover it
 * and cropped about its centre (`bodySource`, which the print preflight
 * reads for the resolution it prints at), its scale noted in `plateScale`.
 * Its caption and note go to the foot of the content area and get a band
 * of the paper colour (`paper`) to read on, unless their caption style
 * draws a bar of its own. The page is marked (`edgePlate`); its role is
 * `'plate'` (`classifyPage`), so design elements, running heads and folio
 * included, skip it unless they name that role. A vertical page sets no
 * plate.
 */
export function spreadPlatesToEdge(page: VDTPage, metrics: PageMetrics, paper: string, dpi: number): void {
  for (const block of page.floats ?? []) {
    const rb = block.resourceBlock;
    if (!rb?.plateArea || rb.rotation) continue;
    // The trim and bleed boxes are centred on the sheet, so a right-to-left
    // page's mirrored flow has the same ones.
    const edge = rb.plateArea === 'trim' ? metrics.physical.trimBox : metrics.physical.bleedBox;
    const { width: bw, height: bh } = rb.bodyRect;
    if (!(bw > 0 && bh > 0)) continue;
    const k = Math.max(edge.width / bw, edge.height / bh);
    const w = edge.width / (bw * k);
    const h = edge.height / (bh * k);
    rb.bodySource = composeSource(rb.bodySource, { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h });
    rb.bodyRect = createBoundingBox(edge.x - block.bbox.x, edge.y - block.bbox.y, edge.width, edge.height);
    rb.plateScale = (rb.plateScale ?? 1) * k;
    // The caption and note go down to the foot of the content area: under
    // a wide picture the layout left them halfway down the page.
    const text = [...rb.captionLines, ...rb.noteLines];
    if (text.length > 0) {
      const foot = page.contentArea.y + page.contentArea.height;
      const dy = Math.max(0, foot - Math.max(...text.map((l) => l.bbox.y + l.bbox.height)));
      rb.captionLines = shiftLines(rb.captionLines, 0, dy);
      rb.noteLines = shiftLines(rb.noteLines, 0, dy);
      if (rb.captionBar) {
        const r = rb.captionBar.rect;
        rb.captionBar = { ...rb.captionBar, rect: createBoundingBox(r.x, r.y + dy, r.width, r.height) };
      } else {
        const pad = dimensionToPx(BAND_PADDING, dpi);
        const top = Math.min(...text.map((l) => l.bbox.y)) + dy - pad;
        rb.captionBar = { rect: bandRect(page.contentArea, top, foot + pad, pad), background: paper };
      }
    }
    page.edgePlate = rb.plateArea;
  }
}

/** The band across the content area, `pad` wider on each side. */
function bandRect(area: BoundingBox, top: number, bottom: number, pad: number): BoundingBox {
  return createBoundingBox(area.x - pad, top, area.width + pad * 2, bottom - top);
}
