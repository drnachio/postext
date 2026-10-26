import { describe, it, expect } from 'vitest';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import { boxOutline, shapePathBlocks, type VDTDesignBlock, type VDTDesignBoxStyle, type VDTDesignSlot } from 'postext';
import { FontCache } from '../fontCache.js';
import { renderHeaderFooterSlot } from '../pdf-backend/page/headerFooter.js';
import { makeScale, type PageCtx } from '../pdf-backend/primitives.js';
import { PageTagger } from '../pdf-backend/structure/tagging.js';

// #1059: box shapes in PDF — corners of their own, a border per side and a
// card joined to its tab, as vector paths.

function pageContent(page: PDFPage): string {
  const stream = (page as unknown as {
    getContentStream(): { getUnencodedContents(): Uint8Array };
  }).getContentStream();
  return new TextDecoder('latin1').decode(stream.getUnencodedContents());
}

async function paint(blocks: VDTDesignBlock[], tagged = false): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 400]);
  const ctx: PageCtx = { page, pageHeightPt: 400, scale: makeScale(72), colorSpace: 'rgb', ...(tagged ? { tags: new PageTagger(page, 0) } : {}) };
  const slot: VDTDesignSlot = { bbox: { x: 0, y: 0, width: 400, height: 400 }, blocks };
  renderHeaderFooterSlot(ctx, slot, new FontCache(pdfDoc, async () => new Uint8Array()), undefined, tagged ? { artifact: { type: 'Layout' } } : undefined);
  ctx.tags?.close();
  return pageContent(page);
}
const box = (style: VDTDesignBoxStyle): VDTDesignBlock => ({ kind: 'box', bbox: { x: 10, y: 20, width: 100, height: 50 }, box: style });

describe('box shapes in the PDF backend (#1059)', () => {
  it('fills a box with a border on its top only: the fill, then the top piece', async () => {
    const content = await paint([box({
      backgroundColor: '#ffffff', borderColor: '#ff0000', borderWidthPx: 2, borderRadiusPx: 0,
      borderSides: { top: { color: '#ff0000', widthPx: 2 }, right: null, bottom: null, left: null },
    })]);
    // The fill: the box's rectangle (y up from 400).
    expect(content).toMatch(/1 1 1 rg\n10 380 m\n110 380 l\n110 330 l\n10 330 l\n10 380 l\nh\nf\n/);
    // The border: the top edge, then back along the inner edge 2 pt down.
    expect(content).toMatch(/1 0 0 rg\n10 380 m\n110 380 l\n110 378 l\n10 378 l\nh\nf\n/);
  });

  it('rounds only the corners a style names, with cubic curves', async () => {
    const content = await paint([box({ backgroundColor: '#00ff00', borderWidthPx: 0, borderRadiusPx: 8, borderRadiiPx: [8, 0, 8, 0] })]);
    expect(content.match(/ c\n/g)).toHaveLength(2);
    // A square corner is a plain point of the outline: the top right.
    expect(content).toContain('110 380 l\n');
  });

  it('paints a card joined to its tab, inside a Layout artifact', async () => {
    const outline = boxOutline({ x: 10, y: 30, width: 100, height: 50 }, [6, 6, 6, 6], { edge: 'top', x0: 20, x1: 60, height: 12, radius: 6, fillet: 6 });
    const content = await paint(shapePathBlocks(outline, '#fafafa', {
      top: { color: '#336699', widthPx: 1 }, right: { color: '#336699', widthPx: 1 }, bottom: { color: '#336699', widthPx: 1 }, left: { color: '#336699', widthPx: 1 },
    }), true);
    expect(content).toContain('/Artifact <<');
    expect(content).toMatch(/h\nf\*\n/);
    // The tab's top stands 12 pt over the box: y = 400 - 18.
    expect(content).toMatch(/ 382 [lc]\n/);
  });
});
