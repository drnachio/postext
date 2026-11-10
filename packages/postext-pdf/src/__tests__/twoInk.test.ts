import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import UPNG from '@pdf-lib/upng';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { buildDocument, deltaE, outputTransform, srgbToLab, parseIccProfile, resolvePrintConfig } from 'postext';
import type { ColorValue, PostextConfig, PrintConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { plateMix, platePlan } from '../print/plates.js';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const pt = (value: number) => ({ value, unit: 'pt' as const });

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const PANTONE = { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } };
const blue: ColorValue = { hex: '#1f3f99', model: 'spot', spot: { ...PANTONE } };
const varnish: ColorValue = { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 }, overprint: true } };
const red: ColorValue = { hex: '#c00020', model: 'hex' };

/** A 2 × 2 RGBA PNG: red, half-transparent green, blue, white. */
const PNG = new Uint8Array(UPNG.encode([new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 255]).buffer], 2, 2, 0));
const resources: Resource[] = [{
  id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'pic.png', format: 'png', width: 2, height: 2 },
  placement: { position: 'here' },
}];

function band(id: string, edge: 'top-left' | 'bottom-left' | 'top-right' | 'bottom-right', color: ColorValue, size = 40) {
  return { kind: 'box' as const, id, placement: { anchor: { to: 'container' as const, edge }, size: { width: pt(120), height: pt(size) } }, style: { backgroundColor: color } };
}

function config(): PostextConfig {
  return {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    bodyText: { fontFamily: 'Lora', color: blue },
    headings: { fontFamily: 'Lora', color: { hex: '#555555', model: 'hex' } },
    header: { elements: [band('red', 'top-left', red), band('varnish', 'bottom-left', varnish, 10), band('black', 'top-right', { hex: '#000000', model: 'hex' }, 60), band('navy', 'bottom-right', { hex: '#0d1a4d', model: 'hex' }, 20)] },
    footer: { elements: [] },
  };
}

function streamText(pdf: PDFDocument, obj: PDFObject | undefined): string {
  const s = obj instanceof PDFStream ? obj : obj ? pdf.context.lookup(obj) : undefined;
  return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
}

async function render(print: PrintConfig) {
  const doc = buildDocument({ markdown: '# Grey heading\n\nBlue text on the page.\n\n::resource{id="pic"}', resources }, config());
  const bytes = await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    outputProfile: fogra39,
    accessible: false,
    resourceBytes: (id) => (id === 'pic.png' ? PNG : undefined),
    print,
  });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return { pdf, content: refs.map((r) => streamText(pdf, r)).join('\n') };
}

/** Every Separation and DeviceN in the file: its ink names. */
function inkSpaces(pdf: PDFDocument): { kind: string; inks: string[] }[] {
  const out: { kind: string; inks: string[] }[] = [];
  pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFArray)) return;
    const kind = obj.lookup(0)?.toString();
    if (kind === '/Separation') out.push({ kind, inks: [(obj.lookup(1) as PDFName).decodeText()] });
    if (kind === '/DeviceN') out.push({ kind, inks: (obj.lookup(1) as PDFArray).asArray().map((n) => (n as PDFName).decodeText()) });
  });
  return out;
}

/** The process colours the content sets (`k` / `K`), as numbers. */
function processColors(content: string): number[][] {
  return [...content.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) [kK]\b/g)].map((m) => m.slice(1, 5).map(Number));
}

describe('a job on two plates', () => {
  const plates = { inks: ['Black', 'PANTONE 286 C'] };

  it('sets every colour on the two plates: no cyan, magenta or yellow, and no other ink', async () => {
    const { pdf, content } = await render({ standard: 'pdfx4', plates });
    for (const [c, m, y] of processColors(content)) expect([c, m, y]).toEqual([0, 0, 0]);
    const inks = new Set(inkSpaces(pdf).flatMap((s) => s.inks));
    expect([...inks].sort()).toEqual(['Black', 'PANTONE 286 C']);
    // The navy band needs both inks: a DeviceN mix of the two plates.
    expect(inkSpaces(pdf).some((s) => s.kind === '/DeviceN')).toBe(true);
  });

  it('keeps greys on black alone and drops rich black', async () => {
    const { content } = await render({ standard: 'pdfx4', plates });
    expect(content).toMatch(/0 0 0 0\.\d+ k/);
    expect(content).not.toMatch(/0\.6 0\.4 0\.4 1 k/);
  });

  it('prints a picture as a monotone on black by default, and as a duotone on two plates', async () => {
    const mono = await render({ standard: 'pdfx4', plates });
    const image = (pdf: PDFDocument) => {
      let found: { space: PDFObject | undefined; bytes: Uint8Array } | undefined;
      pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
        if (obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image' && obj.dict.lookup(PDFName.of('Width'))?.toString() === '2' && !found) {
          const space = obj.dict.lookup(PDFName.of('ColorSpace'));
          if (space instanceof PDFArray) found = { space, bytes: decodePDFRawStream(obj).decode() };
        }
      });
      return found!;
    };
    const m = image(mono.pdf);
    expect((m.space as PDFArray).lookup(0)?.toString()).toBe('/Separation');
    expect(((m.space as PDFArray).lookup(1) as PDFName).decodeText()).toBe('Black');
    expect(m.bytes.length).toBe(4);
    // The white pixel is paper; blue is darker than red.
    expect(m.bytes[3]).toBe(0);
    expect(m.bytes[2]!).toBeGreaterThan(m.bytes[0]!);

    const duo = await render({ standard: 'pdfx4', plates: { ...plates, images: ['Black', 'PANTONE 286 C'] } });
    const d = image(duo.pdf);
    expect((d.space as PDFArray).lookup(0)?.toString()).toBe('/DeviceN');
    expect(d.bytes.length).toBe(8);
  });

  it('follows a curve given for a picture plate', async () => {
    const { pdf } = await render({ standard: 'pdfx4', plates: { ...plates, images: ['PANTONE 286 C'], curves: { 'PANTONE 286 C': [[0, 0], [100, 50]] } } });
    let max = 0;
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image' && obj.dict.lookup(PDFName.of('ColorSpace')) instanceof PDFArray) {
        for (const b of decodePDFRawStream(obj).decode()) max = Math.max(max, b);
      }
    });
    expect(max).toBeLessThanOrEqual(128);
    expect(max).toBeGreaterThan(0);
  });

  it('a one-ink job prints in black only', async () => {
    const { pdf, content } = await render({ standard: 'pdfx4', plates: { inks: ['black'] } });
    for (const [c, m, y] of processColors(content)) expect([c, m, y]).toEqual([0, 0, 0]);
    expect(new Set(inkSpaces(pdf).flatMap((s) => s.inks))).toEqual(new Set(['Black']));
  });
});

describe('a job with no plates named', () => {
  it('prints as before: every process plate, the spot ink in its Separation, no DeviceN', async () => {
    const plain = await render({ standard: 'pdfx4' });
    expect(inkSpaces(plain.pdf).some((s) => s.kind === '/DeviceN')).toBe(false);
    expect(processColors(plain.content).some(([c, m, y]) => c! + m! + y! > 0)).toBe(true);
    // An empty plate list is the same job, page for page.
    for (const plates of [{}, { inks: [] }]) {
      const same = await render({ standard: 'pdfx4', plates });
      expect(same.content).toBe(plain.content);
      expect(inkSpaces(same.pdf)).toEqual(inkSpaces(plain.pdf));
    }
  });
});

describe('plateMix', () => {
  const transform = outputTransform(parseIccProfile(fogra39));
  const plan = platePlan(resolvePrintConfig({ plates: { inks: ['Black', 'PANTONE 286 C'] } }), [{ ...PANTONE, tint: 100, overprint: false }])!;

  it('sets an ink the job prints, and CMYK on its plates, as they are', () => {
    const spot = plateMix(plan, { kind: 'spot', spot: { ...PANTONE, tint: 100, overprint: false }, tint: 0.4 }, transform, true);
    expect(spot.plates.map((p) => p.name)).toEqual(['PANTONE 286 C']);
    expect(spot.tints).toEqual([0.4]);
    expect(spot.deltaE).toBe(0);
    const k = plateMix(plan, { kind: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 70 } }, transform, true);
    expect(k.plates.map((p) => p.name)).toEqual(['Black']);
    expect(k.tints).toEqual([0.7]);
  });

  it('projects a blue onto the blue ink, and a navy onto both', () => {
    const light = plateMix(plan, { kind: 'rgb', r: 0.55, g: 0.65, b: 0.85 }, transform, true);
    expect(light.plates.map((p) => p.name)).toEqual(['PANTONE 286 C']);
    const navy = plateMix(plan, { kind: 'rgb', r: 0.05, g: 0.1, b: 0.3 }, transform, true);
    expect(navy.plates.map((p) => p.name).sort()).toEqual(['Black', 'PANTONE 286 C']);
    // No mix of the two inks does better (a fine grid of both tints).
    let best = Infinity;
    for (let a = 0; a <= 50; a++) {
      for (let b = 0; b <= 50; b++) {
        const lab = transform.toLab({ c: Math.min(1, a / 50), m: Math.min(1, (a / 50) * 0.66), y: 0, k: Math.min(1, (a / 50) * 0.02 + b / 50) });
        best = Math.min(best, deltaE(lab, srgbToLab(0.05, 0.1, 0.3)));
      }
    }
    expect(navy.deltaE).toBeLessThanOrEqual(best + 0.5);
  });

  it('prints nothing for white', () => {
    expect(plateMix(plan, { kind: 'rgb', r: 1, g: 1, b: 1 }, transform, false).plates).toEqual([]);
  });
});
