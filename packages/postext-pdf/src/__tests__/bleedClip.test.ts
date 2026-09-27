import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const MM = 72 / 25.4;

/** A 170 × 227 mm page with a 150 mm yellow square anchored to the page's
 *  top-right corner and pushed 30 mm out: most of it lies past the bleed. */
function config(cutLines: boolean): PostextConfig {
  return {
    page: { sizePreset: 'custom', width: mm(170), height: mm(227), dpi: 150, ...(cutLines ? { cutLines: { enabled: true, bleed: mm(5) } } : {}) },
    header: {
      elements: [{
        kind: 'box', id: 'sun',
        placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: mm(30), y: mm(25) }, size: { width: mm(150), height: mm(150) } },
        style: { backgroundColor: { hex: '#ffff00', model: 'hex' } },
      }],
    },
    footer: { elements: [] },
  };
}

async function content(cutLines: boolean): Promise<string> {
  const doc = buildDocument({ markdown: 'A paragraph of text.' }, config(cutLines));
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
}

/** Every `x y w h re W n` clip of a content stream, in points, with its offset. */
function clips(text: string): Array<{ at: number; box: number[] }> {
  return [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\nW\nn/g)].map((m) => ({ at: m.index!, box: m.slice(1, 5).map(Number) }));
}

describe('page art clipped to the bleed box with cut lines (EF-133)', () => {
  it('clips everything the page paints to the BleedBox, and strokes the marks outside the clip', async () => {
    const text = await content(true);
    // The sheet is 170 + 2 × 13 mm wide; the bleed box starts 8 mm in.
    const bleed = clips(text).find((c) => Math.abs(c.box[0]! - 8 * MM) < 1e-3 && Math.abs(c.box[2]! - 180 * MM) < 1e-3);
    expect(bleed).toBeDefined();
    expect(bleed!.box[1]! / MM).toBeCloseTo(8, 3);
    expect(bleed!.box[3]! / MM).toBeCloseTo(237, 3);
    // The yellow square is painted after the clip…
    const yellow = text.indexOf('1 1 0 rg');
    expect(yellow).toBeGreaterThan(bleed!.at);
    // …and the clip's graphics state closes before the first crop mark.
    const firstMark = text.search(/-?[\d.]+ -?[\d.]+ m\s+-?[\d.]+ -?[\d.]+ l\s+S/);
    expect(firstMark).toBeGreaterThan(yellow);
    expect(text.slice(yellow, firstMark)).toMatch(/\nQ\n/);
    // The marked-content sequences nest inside it: as many BDC/BMC as EMC
    // between the clip and its Q.
    const q = text.lastIndexOf('\nQ\n', firstMark);
    const inside = text.slice(bleed!.at, q);
    const opened = (inside.match(/ (?:BDC|BMC)(?=\n)/g) ?? []).length;
    const closed = (inside.match(/(?<=\n)EMC(?=\n|$)/g) ?? []).length;
    expect(opened).toBeGreaterThan(0);
    expect(opened).toBe(closed);
  });

  it('adds no page clip without cut lines', async () => {
    const text = await content(false);
    const pageWide = clips(text).filter((c) => Math.abs(c.box[0]!) < 1e-3 && Math.abs(c.box[2]! - 170 * MM) < 1e-3);
    expect(pageWide).toHaveLength(0);
  });
});
