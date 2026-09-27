import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDict, PDFDocument, PDFName, PDFNumber, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from 'postext';
import { FontCache } from '../fontCache';
import { renderHeaderFooterSlot } from '../pdf-backend/headerFooter';
import { collectFontStrings } from '../pdf-backend/fontHelpers';
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

// Kerned TrueType faces from the demo app's static fonts (OFL).
const REGULAR = readFileSync(new URL('../../../../apps/web/public/fonts/Fraunces-Regular.ttf', import.meta.url));
const BOLD = readFileSync(new URL('../../../../apps/web/public/fonts/Fraunces-Bold.ttf', import.meta.url));

describe('design text runs and outlines in the PDF backend (EF-25)', () => {
  const block = (extra: Partial<VDTDesignTextBlock>): VDTDesignTextBlock => ({
    kind: 'text',
    bbox: { x: 72, y: 72, width: 300, height: 30 },
    fontString: '20px Fraunces',
    color: '#111111',
    lines: [{
      text: 'Ana bold2', xOffset: 0, baselineY: 96, width: 120,
      runs: [
        { text: 'Ana ', fontString: '20px Fraunces', width: 40 },
        { text: 'bold', fontString: '700 20px Fraunces', width: 50 },
        { text: '2', fontString: '11.66px Fraunces', width: 7, baselineShift: -6.66 },
      ],
    }],
    clip: false,
    ...extra,
  });

  async function render(slot: VDTDesignSlot) {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([612, 792]);
    const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb' };
    const fontCache = new FontCache(pdfDoc, async (_family, weight) => new Uint8Array(weight >= 700 ? BOLD : REGULAR));
    const doc = { blocks: [], pages: [{ columns: [], header: slot }] } as unknown as VDTDocument;
    const fonts = collectFontStrings(doc);
    await fontCache.preloadFontStrings(fonts);
    renderHeaderFooterSlot(ctx, slot, fontCache);
    return { content: pageContent(page), fonts };
  }

  it('asks for the fonts of every run and draws each run in its font, size and shift', async () => {
    const { content, fonts } = await render({ bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [block({})] } as unknown as VDTDesignSlot);
    expect(fonts).toEqual(expect.arrayContaining(['20px Fraunces', '700 20px Fraunces', '11.66px Fraunces']));
    const tf = [...content.matchAll(/\/(\S+) ([\d.]+) Tf/g)].map((m) => [m[1], m[2]]);
    expect(tf).toHaveLength(3);
    expect(tf[0]![0]).not.toBe(tf[1]![0]); // bold is its own face
    expect(tf.map((t) => t[1])).toEqual(['20', '20', '11.66']);
    // Runs follow one another on the baseline (792 - 96 = 696); the script
    // is raised by its shift.
    const tm = [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(tm).toEqual([[72, 696], [112, 696], [162, 702.66]]);
    expect(content).not.toMatch(/ Tr\n/);
  });

  it('strokes the glyphs over the fill (render mode 2), or alone for hollow letters (mode 1)', async () => {
    const stroke = { widthPx: 2, color: '#aa0000' };
    const filled = await render({ bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [block({ stroke, lines: [{ text: '1863', xOffset: 0, baselineY: 96, width: 60 }] })] } as unknown as VDTDesignSlot);
    expect(filled.content).toMatch(/0\.6\d+ 0 0 RG\n2 w\n2 Tr\n/);
    const hollow = await render({ bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [block({ stroke: { ...stroke, hollow: true } })] } as unknown as VDTDesignSlot);
    expect(hollow.content.match(/1 Tr\n/g)).toHaveLength(3);
  });

  it('paints a negative tracking (a tightened display title) with its character spacing, and resets it (EF-82)', async () => {
    const plain = { text: 'Title', xOffset: 0, baselineY: 96, width: 60 };
    const tight = await render({ bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [block({ letterSpacingPx: -0.3, lines: [plain] })] } as unknown as VDTDesignSlot);
    const spacings = [...tight.content.matchAll(/(-?[\d.]+) Tc/g)].map((m) => Number(m[1]));
    expect(spacings).toEqual([-0.3, 0]);
    const untracked = await render({ bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [block({ lines: [plain] })] } as unknown as VDTDesignSlot);
    expect(untracked.content).not.toMatch(/ Tc\n/);
  });

  it('strokes with the outline colour\'s own alpha, the fill with the text\'s (EF-30 with EF-25)', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([612, 792]);
    const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb' };
    const fontCache = new FontCache(pdfDoc, async () => new Uint8Array(REGULAR));
    const slot = { bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [block({ stroke: { widthPx: 2, color: '#aa000080' }, lines: [{ text: '1863', xOffset: 0, baselineY: 96, width: 60 }] })] } as unknown as VDTDesignSlot;
    await fontCache.preloadFontStrings(collectFontStrings({ blocks: [], pages: [{ columns: [], header: slot }] } as unknown as VDTDocument));
    renderHeaderFooterSlot(ctx, slot, fontCache);
    // One graphics state, set right before the outline operators.
    const name = /\/(\S+) gs\n[^\n]*RG\n2 w\n2 Tr\n/.exec(pageContent(page))?.[1];
    expect(name).toBeDefined();
    const states = page.node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict);
    const state = states.lookup(PDFName.of(name!), PDFDict);
    // Fill opaque (no `ca`, or 1), stroke at the outline's alpha.
    expect(state.lookup(PDFName.of('ca'), PDFNumber).asNumber()).toBe(1);
    expect(state.lookup(PDFName.of('CA'), PDFNumber).asNumber()).toBeCloseTo(0x80 / 255, 2);
  });
});
