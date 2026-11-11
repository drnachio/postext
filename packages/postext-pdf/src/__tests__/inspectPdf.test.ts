import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildDocument } from 'postext';
import type { ColorValue, PostextConfig, PrintConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { inspectPrintPdf } from '../print/inspectPdf.js';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const mm = (value: number) => ({ value, unit: 'mm' as const });

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

const spot: ColorValue = { hex: '#1f3f99', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } } };

async function render(print: PrintConfig | undefined, extra: PostextConfig = {}) {
  const doc = buildDocument({ markdown: 'Some text.\n\n# A heading' }, {
    page: { width: mm(150), height: mm(210), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    bodyText: { fontFamily: 'Lora' },
    headings: { fontFamily: 'Lora', color: spot },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  });
  const bytes = await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), outputProfile: fogra39, accessible: true, ...(print ? { print } : {}) });
  return inspectPrintPdf(bytes);
}

describe('inspectPrintPdf', () => {
  it('reads a PDF/X-4 back: identification, intent, boxes, fonts and inks', async () => {
    const r = await render({ standard: 'pdfx4' }, { page: { width: mm(150), height: mm(210), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) }, cutLines: { enabled: true, bleed: mm(3) } } });
    expect(r.version).toBe('1.6');
    expect(r.pdfx).toBe('PDF/X-4');
    expect(r.outputIntent?.profileEmbedded).toBe(true);
    expect(r.outputIntent?.registry).toBeDefined();
    expect(r.trimMm).toEqual({ width: 150, height: 210 });
    expect(r.pagesWithoutTrimBox).toBe(0);
    expect(r.bleedMm).toBeCloseTo(3, 0);
    expect(r.fonts.length).toBeGreaterThan(0);
    expect(r.fonts.every((f) => f.embedded)).toBe(true);
    expect(r.color.spots).toEqual(['PANTONE 286 C']);
    expect(r.color.cmyk).toBe(true);
    expect(r.color.rgb).toBe(false);
    expect(r.color.registration).toBe(true);
    expect(r.tagged).toBe(true);
  });

  it('reads an ordinary RGB PDF as one', async () => {
    const r = await render(undefined);
    expect(r.pdfx).toBeUndefined();
    expect(r.outputIntent).toBeUndefined();
    expect(r.color.rgb).toBe(true);
    expect(r.color.spots).toEqual([]);
    expect(r.bleedMm).toBe(0);
    expect(r.pageCount).toBeGreaterThan(0);
  });
});
