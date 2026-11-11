import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib';
import { parseIccProfile, resolvePrintConfig } from 'postext';
import type { Resource, VDTDocument } from 'postext';
import { preloadResourceImages } from '../pdf-backend/blocks/renderResourceBlock.js';
import { createPrintColorMode } from '../print/colorMode.js';
import { platePlan } from '../print/plates.js';
import { SpotInkRegistry, type MixPaint } from '../print/spot.js';

// #1476 adaptations: picture plates and curves named through the ink
// table, one plate per name, no process fallback in a job on a few
// plates, print masters set through the plates and placed PDFs reported.

const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const PANTONE = { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 100, overprint: false };
const inks = [{ name: 'PANTONE 286 C', aliases: ['Corporate blue'] }];

describe('plate names through the ink table', () => {
  it('finds a picture plate and its curve by an alias', () => {
    const plan = platePlan(
      resolvePrintConfig({ inks, plates: { inks: ['Black', 'PANTONE 286 C'], images: ['Corporate blue'], curves: { 'corporate blue': [[0, 0], [100, 40]] } } }),
      [PANTONE],
    )!;
    expect(plan.images.map((p) => p.name)).toEqual(['PANTONE 286 C']);
    expect(plan.curves[0]!(1)).toBeCloseTo(0.4);
  });

  it('keeps one plate for two names of one ink', () => {
    const plan = platePlan(resolvePrintConfig({ inks, plates: { inks: ['Black', 'PANTONE 286 C', 'Corporate blue'] } }), [PANTONE])!;
    expect(plan.plates.map((p) => p.name)).toEqual(['Black', 'PANTONE 286 C']);
  });
});

describe('the ink registry of a job on a few plates', () => {
  const black = { name: 'Black', cmyk: { c: 0, m: 0, y: 0, k: 100 }, overprint: false, process: 'k' as const };
  const blue = { name: 'PANTONE 286 C', cmyk: PANTONE.cmyk, overprint: false };

  it('merges a plate named twice in a mix, so a DeviceN never names one twice', () => {
    const registry = new SpotInkRegistry();
    const c = registry.mixStandIn([black, blue, { ...blue }], [0.2, 0.3, 0.4]) as unknown as { cyan: number; magenta: number; yellow: number; key: number };
    const paint = registry.paintOf(c.cyan, c.magenta, c.yellow, c.key) as MixPaint;
    expect(paint.mix.map((p) => p.name)).toEqual(['Black', 'PANTONE 286 C']);
    expect(paint.tints).toEqual([0.2, 0.7]);
    const pdf = PDFDocument.create();
    return pdf.then((doc) => {
      const space = doc.context.lookup(registry.inkSpace(doc.context, paint.mix)) as PDFArray;
      expect(space.lookup(0)?.toString()).toBe('/DeviceN');
      expect((space.lookup(1) as PDFArray).asArray().map((n) => (n as PDFName).decodeText())).toEqual(['Black', 'PANTONE 286 C']);
    });
  });

  it('past the codes, takes the nearest coded mix instead of printing in process', () => {
    const registry = new SpotInkRegistry(2, true);
    registry.mixStandIn([black, blue], [0.2, 0.2]);
    registry.mixStandIn([black, blue], [0.8, 0.8]);
    const third = registry.mixStandIn([black, blue], [0.7, 0.75]) as unknown as { cyan: number; magenta: number; yellow: number; key: number };
    const paint = registry.paintOf(third.cyan, third.magenta, third.yellow, third.key) as MixPaint;
    expect(paint.tints).toEqual([0.8, 0.8]);
    expect(registry.approximated()).toBe(1);
    expect(registry.exhausted().size).toBe(0);
  });

  it('elsewhere still prints in process past the codes', () => {
    const registry = new SpotInkRegistry(1);
    registry.standIn(PANTONE, 0.1);
    const c = registry.standIn(PANTONE, 0.2) as unknown as { cyan: number; magenta: number; yellow: number; key: number };
    expect(registry.paintOf(c.cyan, c.magenta, c.yellow, c.key)).toBeUndefined();
    expect(registry.exhausted().get('PANTONE 286 C')).toBe(1);
  });
});

const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10"><rect width="20" height="10" fill="#c00020"/></svg>');

async function onePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([20, 10]).drawRectangle({ x: 0, y: 0, width: 20, height: 10 });
  return doc.save();
}

function vdt(resource: Partial<Resource>, fileId: string, kind: 'svg' | 'bitmap'): VDTDocument {
  return {
    config: { page: { dpi: 72 } },
    blocks: [{ bbox: { x: 0, y: 0, width: 100, height: 80 }, resourceBlock: { kind, fileId, resource: { id: 'fig', kind, ...resource }, bodyRect: { x: 0, y: 0, width: 100, height: 50 } } }],
    pages: [],
  } as unknown as VDTDocument;
}

function mode(plates?: string[]) {
  const condition = { registryName: 'http://www.color.org', condition: 'FOGRA39', name: 'Coated FOGRA39' };
  return createPrintColorMode(parseIccProfile(fogra39), resolvePrintConfig({ standard: 'pdfx4', ...(plates ? { plates: { inks: plates } } : {}) }), condition);
}

describe('artwork in a job on a few plates', () => {
  it('sets an SVG with a print master from the SVG, on the plates', async () => {
    const master = await onePagePdf();
    const bytes = (id: string) => (id === 'fig.pdf' ? master : id === 'fig.svg' ? SVG : undefined);
    const resource = { svg: { fileId: 'fig.svg', pdfFileId: 'fig.pdf' } } as Partial<Resource>;
    const plain = await preloadResourceImages(await PDFDocument.create(), vdt(resource, 'fig.svg', 'svg'), bytes, undefined, undefined, undefined, undefined, mode());
    expect(plain.get('fig.svg')?.kind).toBe('page');
    const twoInk = await preloadResourceImages(await PDFDocument.create(), vdt(resource, 'fig.svg', 'svg'), bytes, undefined, undefined, undefined, undefined, mode(['Black']));
    expect(twoInk.get('fig.svg')?.kind).toBe('vector');
  });

  it('counts a placed PDF page, which keeps its own inks', async () => {
    const page = await onePagePdf();
    const m = mode(['Black']);
    const images = await preloadResourceImages(await PDFDocument.create(), vdt({ bitmap: { fileId: 'art.pdf' } } as Partial<Resource>, 'art.pdf', 'bitmap'), (id) => (id === 'art.pdf' ? page : undefined), undefined, undefined, undefined, undefined, m);
    expect(images.get('art.pdf')?.kind).toBe('page');
    expect(m.inkRegistry.offPlateArtwork().get('pdf')).toBe(1);
  });
});
