import { describe, it, expect } from 'vitest';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import type { VDTDesignBoxStyle, VDTDesignSlot } from 'postext';
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

async function render(box: Partial<VDTDesignBoxStyle>, bbox = { x: 10, y: 20, width: 100, height: 50 }): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  // 72 dpi: 1 px = 1 pt, so the numbers below read directly as points.
  const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb' };
  const slot = {
    bbox: { x: 0, y: 0, width: 612, height: 792 },
    blocks: [{ kind: 'box', bbox, box: { borderWidthPx: 0, borderRadiusPx: 0, ...box } }],
  } as unknown as VDTDesignSlot;
  renderHeaderFooterSlot(ctx, slot, new FontCache(pdfDoc, async () => new Uint8Array()));
  return pageContent(page);
}

describe('design box borders in the PDF (EF-131)', () => {
  it('strokes a square frame inside the box, its outer edge on the box edge', async () => {
    const content = await render({ backgroundColor: '#eeeeee', borderColor: '#ff2d9b', borderWidthPx: 4 });
    // The fill covers the whole box: bottom-left at (10, 792 - 70).
    expect(content).toContain('1 0 0 1 10 722 cm');
    expect(content).toContain('100 50 l');
    // The stroke is centred 2 pt inside every edge: bottom-left at
    // (12, 792 - 68), 96 × 46.
    expect(content).toMatch(/4 w\n(?:[^\n]*\n)*?1 0 0 1 12 724 cm/);
    expect(content).toContain('96 46 l');
  });

  it('fills a rounded frame as the ring CSS draws: outer radius on the box edge, inner radius less the width', async () => {
    const content = await render({ borderColor: '#ff2d9b', borderWidthPx: 4, borderRadiusPx: 10 });
    // No stroke: the box's outline from its top edge past the radius (10),
    // then the inner edge 4 pt in, its radius 6, traced the other way round
    // so that the fill leaves the inside empty.
    expect(content).not.toMatch(/(^|\n)S\n/);
    expect(content).not.toContain('4 w');
    expect(content).toMatch(/(^|\n)20 20 m\n/);
    expect(content).toMatch(/(^|\n)100 20 l\n/);
    expect(content).toMatch(/(^|\n)20 24 m\n/);
    expect(content).toMatch(/(^|\n)f\n/);
    const inner = content.slice(content.indexOf('20 24 m'));
    // Counter-clockwise: down the left side first.
    expect(inner).toMatch(/^20 24 m\n[^\n]* c\n14 60 l\n/);
  });

  it('keeps the outer corner round when the radius is under half the border width', async () => {
    const content = await render({ backgroundColor: '#eeeeee', borderColor: '#ff2d9b', borderWidthPx: 8, borderRadiusPx: 2 });
    expect(content).not.toMatch(/(^|\n)S\n/);
    // Rounded outside (radius 2) …
    expect(content).toMatch(/(^|\n)12 20 m\n/);
    // … square inside: 8 pt in, radius 0, no curve.
    expect(content).toMatch(/(^|\n)18 28 m\n18 62 l\n102 62 l\n102 28 l\n/);
  });

  it('fills a box narrower than its border with the border colour', async () => {
    const content = await render({ borderColor: '#ff0000', borderWidthPx: 4 }, { x: 0, y: 0, width: 3, height: 40 });
    expect(content).toContain('1 0 0 rg');
    expect(content).not.toContain('4 w');
  });
});
