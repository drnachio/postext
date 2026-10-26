import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { VDTChip, VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from 'postext';
import { FontCache } from '../fontCache.js';
import { renderHeaderFooterSlot } from '../pdf-backend/page/headerFooter.js';
import { paintChip } from '../pdf-backend/blocks/chip.js';
import { collectFontStrings } from '../pdf-backend/text/fontHelpers.js';
import { colorFromHex, makeScale, type PageCtx } from '../pdf-backend/primitives.js';

// The dots the painters are given (no canvas in the node test env).
const fake = vi.hoisted(() => ({ dots: undefined as undefined | { points: Float32Array; width: number } | null }));
vi.mock('postext', async (original) => {
  const actual = await original<typeof import('postext')>();
  return { ...actual, textDots: (req: Parameters<typeof actual.textDots>[0]) => (fake.dots !== undefined ? fake.dots : actual.textDots(req)) };
});
afterEach(() => {
  fake.dots = undefined;
});

const REGULAR = readFileSync(new URL('../../../../apps/web/public/fonts/Fraunces-Regular.ttf', import.meta.url));

function pageContent(page: PDFPage): string {
  const stream = (page as unknown as { getContentStream(): { getUnencodedContents(): Uint8Array } }).getContentStream();
  return new TextDecoder('latin1').decode(stream.getUnencodedContents());
}

const block = (): VDTDesignTextBlock => ({
  kind: 'text',
  bbox: { x: 72, y: 72, width: 300, height: 30 },
  fontString: '20px Fraunces',
  color: '#111111',
  lines: [{ text: 'gato', xOffset: 0, baselineY: 96, width: 40 }],
  clip: false,
  dotted: { spacingPx: 2, sizePx: 1.2 },
});

async function setUp(mirror = false) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([612, 792]);
  const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb', ...(mirror ? { mirror: true } : {}) };
  const fontCache = new FontCache(pdfDoc, async () => new Uint8Array(REGULAR));
  return { page, ctx, fontCache };
}

async function renderBlock(b: VDTDesignTextBlock, mirror = false): Promise<string> {
  const { page, ctx, fontCache } = await setUp(mirror);
  const slot = { bbox: { x: 0, y: 0, width: 612, height: 792 }, blocks: [b] } as unknown as VDTDesignSlot;
  await fontCache.preloadFontStrings(collectFontStrings({ blocks: [], pages: [{ columns: [], header: slot }] } as unknown as VDTDocument));
  renderHeaderFooterSlot(ctx, slot, fontCache);
  return pageContent(page);
}

describe('dotted text in the PDF (#1017)', () => {
  it('draws the dots as round caps the dot wide, and the text invisible under them', async () => {
    fake.dots = { points: new Float32Array([1, -2, 5, -10]), width: 40 };
    const content = await renderBlock(block());
    expect(content).toMatch(/1\.2 w\n1 J\n/);
    // On the baseline 792 − 96 = 696, from x = 72.
    expect(content).toMatch(/(^|\n)73 698 m\n73\.01 698 l\n77 706 m\n77\.01 706 l\nS\n/);
    expect(content).toMatch(/\n3 Tr\n/);
  });

  it('turns the dots back about the run on a mirrored page', async () => {
    fake.dots = { points: new Float32Array([1, -2]), width: 40 };
    const content = await renderBlock(block(), true);
    // 72 + (40 − 1).
    expect(content).toMatch(/(^|\n)111 698 m\n/);
  });

  it('fills the letters where no dots can be drawn', async () => {
    fake.dots = null;
    const content = await renderBlock(block());
    expect(content).not.toMatch(/ Tr\n/);
    expect(content).not.toMatch(/1 J\n/);
  });

  it('a dotted chip draws its dots and its words invisible', async () => {
    fake.dots = { points: new Float32Array([3, -4]), width: 30 };
    const { page, ctx, fontCache } = await setUp();
    await fontCache.preloadFontStrings(new Set(['20px Fraunces']));
    const chip = {
      styleId: 'dots', runs: [{ text: 'sol', fontString: '20px Fraunces', width: 30 }],
      marginLeft: 0, marginRight: 0, boxWidth: 30, ascent: 16, descent: 5, paddingX: 0, borderWidth: 0, borderRadius: 0,
      dotted: { spacingPx: 2, sizePx: 1 },
    } as VDTChip;
    paintChip(ctx, chip, 100, 200, fontCache, fontCache.get('20px Fraunces')!, 20, undefined, () => colorFromHex('#222222', 'rgb'));
    const content = pageContent(page);
    expect(content).toMatch(/(^|\n)103 596 m\n103\.01 596 l\nS\n/);
    expect(content).toMatch(/\n3 Tr\n/);
  });
});
