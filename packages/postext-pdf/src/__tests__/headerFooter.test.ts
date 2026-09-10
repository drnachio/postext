import { describe, it, expect } from 'vitest';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import type { VDTDesignSlot } from 'postext';
import { FontCache } from '../fontCache';
import { renderHeaderFooterSlot } from '../pdf-backend/headerFooter';
import { makeScale, type PageCtx } from '../pdf-backend/primitives';

/** The page's content stream operators, before pdf-lib deflates them. */
function pageContent(page: PDFPage): string {
  const stream = (page as unknown as {
    getContentStream(): { getUnencodedContents(): Uint8Array };
  }).getContentStream();
  return new TextDecoder('latin1').decode(stream.getUnencodedContents());
}

describe('design boxes in the PDF backend', () => {
  it('draws a rounded box at its page position (path anchored at the page top, y down)', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    // 72 dpi: 1 px = 1 pt, so the numbers below read directly as points.
    const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb' };
    const slot = {
      blocks: [{
        kind: 'box',
        id: 'dot',
        bbox: { x: 72, y: 144, width: 36, height: 36 },
        box: {
          backgroundColor: '#9bcdbf',
          borderWidthPx: 0,
          borderRadiusPx: 18,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }],
    } as unknown as VDTDesignSlot;
    const fontCache = new FontCache(pdfDoc, async () => new Uint8Array());

    renderHeaderFooterSlot(ctx, slot, fontCache);

    const content = pageContent(page);
    // pdf-lib's drawSvgPath translates to the given origin then flips y, so
    // the path must be anchored at the top-left of the page…
    expect(content).toContain('1 0 0 1 0 792 cm');
    expect(content).toContain('1 0 0 -1 0 0 cm');
    // …and start at the box's top edge in top-down points (x + r, y).
    expect(content).toMatch(/(^|\n)90 144 m\n/);
    // The old absolute-coordinate path (bottom edge at 792 - 180 = 612)
    // was mirrored below the page and never painted.
    expect(content).not.toMatch(/(^|\n)90 612 m\n/);
  });

  it('draws a square box with drawRectangle at its page position', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb' };
    const slot = {
      blocks: [{
        kind: 'box',
        id: 'tab',
        bbox: { x: 0, y: 0, width: 50, height: 20 },
        box: {
          backgroundColor: '#9bcdbf',
          borderWidthPx: 0,
          borderRadiusPx: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }],
    } as unknown as VDTDesignSlot;
    renderHeaderFooterSlot(ctx, slot, new FontCache(pdfDoc, async () => new Uint8Array()));
    const content = pageContent(page);
    // pdf-lib translates to the bottom-left corner (y = 792 - 20) and
    // traces the rectangle from the origin.
    expect(content).toContain('1 0 0 1 0 772 cm');
    expect(content).toContain('50 20 l');
  });
});
