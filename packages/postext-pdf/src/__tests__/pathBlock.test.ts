import { describe, it, expect } from 'vitest';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import type { VDTDesignPathBlock, VDTDesignSlot } from 'postext';
import { FontCache } from '../fontCache.js';
import { renderHeaderFooterSlot } from '../pdf-backend/page/headerFooter.js';
import { makeScale, type PageCtx } from '../pdf-backend/primitives.js';
import { PageTagger } from '../pdf-backend/structure/tagging.js';

/** The page's content stream operators, before pdf-lib deflates them. */
function pageContent(page: PDFPage): string {
  const stream = (page as unknown as {
    getContentStream(): { getUnencodedContents(): Uint8Array };
  }).getContentStream();
  return new TextDecoder('latin1').decode(stream.getUnencodedContents());
}

/** Paint `blocks` as a design slot on a 400 × 400 pt page at 72 dpi (1 px
 *  = 1 pt, y up from 400), optionally tagged. */
async function paint(blocks: VDTDesignPathBlock[], tagged = false): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 400]);
  const ctx: PageCtx = { page, pageHeightPt: 400, scale: makeScale(72), colorSpace: 'rgb', ...(tagged ? { tags: new PageTagger(page, 0) } : {}) };
  const slot: VDTDesignSlot = { bbox: { x: 0, y: 0, width: 400, height: 400 }, blocks };
  renderHeaderFooterSlot(ctx, slot, new FontCache(pdfDoc, async () => new Uint8Array()), undefined, tagged ? { artifact: { type: 'Layout' } } : undefined);
  ctx.tags?.close();
  return pageContent(page);
}

describe('path blocks in the PDF backend (#1055)', () => {
  it('fills an outline with m l h and the even-odd rule', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 10, y: 10, width: 40, height: 30 },
      subpaths: [[{ op: 'M', x: 10, y: 40 }, { op: 'L', x: 30, y: 10 }, { op: 'L', x: 50, y: 40 }, { op: 'Z' }]],
      fill: '#ff0000',
      fillRule: 'evenodd',
    }]);
    expect(content).toMatch(/1 0 0 rg\n10 360 m\n30 390 l\n50 360 l\nh\nf\*\n/);
    expect(content).not.toMatch(/\nS\n/);
  });

  it('strokes with its width, dash, cap and join, and draws a quadratic as a cubic', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 0, y: 0, width: 60, height: 30 },
      subpaths: [[{ op: 'M', x: 0, y: 0 }, { op: 'Q', x1: 30, y1: 30, x: 60, y: 0 }]],
      stroke: { color: '#0000ff', widthPx: 2, dash: [6, 3], cap: 'round', join: 'bevel' },
    }]);
    expect(content).toContain('0 0 1 RG\n2 w\n1 J\n2 j\n[6 3] 0 d\n0 400 m\n20 380 40 380 60 400 c\nS\n');
  });

  it('fills and strokes in one operator when it has both', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      subpaths: [[{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 10, y: 0 }, { op: 'L', x: 10, y: 10 }, { op: 'Z' }]],
      fill: '#00ff00',
      stroke: { color: '#000000', widthPx: 1 },
    }]);
    expect(content).toMatch(/h\nB\n/);
  });

  it('fills a dot as a circle of four cubics and an arrow as a triangle pointing along its angle', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      subpaths: [],
      markers: [
        { kind: 'dot', x: 50, y: 50, angle: 0, sizePx: 10, color: '#00ff00' },
        { kind: 'arrow', x: 90, y: 50, angle: 0, sizePx: 10, color: '#ff0000' },
      ],
    }]);
    // The dot: from its right point, four curves, closed and filled.
    expect(content).toMatch(/0 1 0 rg\n55 350 m\n(.* c\n){4}h\nf\n/);
    // The arrow: tip at (90, 50), base 10 px back, 7 px wide.
    expect(content).toContain('1 0 0 rg\n90 350 m\n80 346.5 l\n80 353.5 l\nh\nf\n');
  });

  it('strokes a ring as its circle and a bar as a segment, in their width, solid (#1079)', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      subpaths: [[{ op: 'M', x: 10, y: 50 }, { op: 'L', x: 90, y: 50 }]],
      stroke: { color: '#000000', widthPx: 2, dash: [4, 2] },
      markers: [
        { kind: 'ring', x: 10, y: 50, angle: Math.PI, sizePx: 12, color: '#ff0000', widthPx: 2 },
        { kind: 'bar', x: 90, y: 50, angle: 0, sizePx: 10, color: '#0000ff', widthPx: 2 },
      ],
    }]);
    // The ring: its middle 5 px out (outer edge 6), four curves, stroked.
    expect(content).toMatch(/q\n1 0 0 RG\n2 w\n15 350 m\n(.* c\n){4}h\nS\nQ\n/);
    // The bar: across the line at its end, 10 px long, stroked.
    expect(content).toMatch(/q\n0 0 1 RG\n2 w\n90 34[05] m\n90 3[56]5 l\nS\nQ\n/);
    // Nothing of the marks is filled.
    expect(content).not.toMatch(/rg\n[^Q]*f\n/);
  });

  it('a translucent line and its marks go through an ExtGState stroke alpha (#1079)', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      subpaths: [[{ op: 'M', x: 10, y: 50 }, { op: 'L', x: 90, y: 50 }]],
      stroke: { color: '#ffffff80', widthPx: 6 },
      markers: [{ kind: 'ring', x: 90, y: 50, angle: 0, sizePx: 12, color: '#ffffff80', widthPx: 2 }],
    }]);
    expect(content.match(/\/GS-?\w* gs\n1 1 1 RG/g)?.length ?? content.match(/ gs\n1 1 1 RG/g)?.length).toBe(2);
  });

  it('is a Layout artifact in a tagged PDF, like a rule', async () => {
    const content = await paint([{
      kind: 'path',
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      subpaths: [[{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 10, y: 10 }]],
      stroke: { color: '#000000', widthPx: 1 },
    }], true);
    const artifact = content.indexOf('/Artifact <<');
    expect(artifact).toBeGreaterThanOrEqual(0);
    expect(content.slice(artifact, content.indexOf('BDC', artifact))).toContain('/Type /Layout');
    expect(content.indexOf(' m\n')).toBeGreaterThan(artifact);
    expect(content).toContain('EMC');
  });
});
