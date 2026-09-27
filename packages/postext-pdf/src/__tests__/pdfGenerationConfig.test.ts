import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PdfGenerationConfig, PostextConfig, VDTDocument } from 'postext';
import { renderToPdf, type RenderToPdfOptions } from '../pdf-backend';

// EF-124. `config.pdfGeneration` was documented as read by postext-pdf, but
// only the Sandbox mapped it onto `renderToPdf`'s options. `renderToPdf`
// now takes each setting from its options first, then from the first
// document's `pdfGeneration`, then from the defaults.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

function config(pdfGeneration?: PdfGenerationConfig): PostextConfig {
  return {
    page: { dpi: 72, width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    ...(pdfGeneration ? { pdfGeneration } : {}),
  };
}

const MARKDOWN = '# Title\n\nSome body text.';

interface Facts {
  outlines: boolean;
  tagged: boolean;
  /** The text colour operator of the first page: `rg`, `k` or `g`. */
  textColor: string | undefined;
}

async function facts(input: VDTDocument | VDTDocument[], options: Partial<RenderToPdfOptions> = {}): Promise<Facts> {
  const pdf = await PDFDocument.load(await renderToPdf(input, { fontProvider, ...options }));
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  const content = streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
  // The fill colour set inside the first text object.
  const text = /BT\s[\s\S]*?\s(rg|k|g)\s/.exec(content);
  return {
    outlines: pdf.catalog.has(PDFName.of('Outlines')),
    tagged: pdf.catalog.has(PDFName.of('StructTreeRoot')),
    textColor: text?.[1],
  };
}

describe('renderToPdf and config.pdfGeneration (EF-124)', () => {
  it('uses the defaults when neither the options nor the config say anything', async () => {
    const doc = buildDocument({ markdown: MARKDOWN }, config());
    expect(doc.config.pdfGeneration).toBeUndefined();
    expect(await facts(doc)).toEqual({ outlines: true, tagged: true, textColor: 'rg' });
  }, 60_000);

  it('reads the settings the options leave out from the document config', async () => {
    const doc = buildDocument({ markdown: MARKDOWN }, config({ forceColorSpace: true, colorSpace: 'cmyk', outlines: false, accessible: false }));
    expect(await facts(doc)).toEqual({ outlines: false, tagged: false, textColor: 'k' });
  }, 60_000);

  it('lets an explicit option win over the config, setting by setting', async () => {
    const doc = buildDocument({ markdown: MARKDOWN }, config({ forceColorSpace: true, colorSpace: 'grayscale', outlines: false, accessible: false }));
    expect(await facts(doc, { colorSpace: 'rgb', outlines: true })).toEqual({ outlines: true, tagged: false, textColor: 'rg' });
    expect(await facts(doc, { accessible: true })).toEqual({ outlines: false, tagged: true, textColor: 'g' });
  }, 60_000);

  it('ignores colorSpace while forceColorSpace is off, as the Sandbox does', async () => {
    const doc = buildDocument({ markdown: MARKDOWN }, config({ colorSpace: 'cmyk' }));
    expect((await facts(doc)).textColor).toBe('rg');
  }, 60_000);

  it('takes a book\'s settings from its first document', async () => {
    const first = buildDocument({ markdown: MARKDOWN }, config({ outlines: false }));
    const second = buildDocument({ markdown: '# Next\n\nMore text.' }, config());
    expect((await facts([first, second])).outlines).toBe(false);
    expect((await facts([second, first])).outlines).toBe(true);
  }, 60_000);
});
