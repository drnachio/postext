import { describe, it, expect } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { preloadResourceImages } from '../pdf-backend/renderResourceBlock';
import { parseFontString } from '../fontString';

// EF-06: a figure's vector print master (`svg.pdfFileId`) is what
// `renderToPdf` embeds — the host hands over bytes by id, it does not have
// to swap the master in for the SVG's own id (only the bundle adapter did).

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
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

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#000000"/></svg>',
);

async function masterPdf(): Promise<Uint8Array> {
  const master = await PDFDocument.create();
  master.addPage([200, 100]).drawRectangle({ x: 0, y: 0, width: 200, height: 100 });
  return master.save();
}

function vdt(resource: Partial<Resource>, singleInk = false): VDTDocument {
  return {
    config: { page: { dpi: 72 }, diagramStyle: { singleInk, inkColor: { hex: '#295aa3' } } },
    blocks: [{
      bbox: { x: 0, y: 0, width: 100, height: 80 },
      resourceBlock: {
        kind: 'svg',
        fileId: 'fig.svg',
        resource: { id: 'fig', kind: 'svg', ...resource },
        bodyRect: { x: 0, y: 0, width: 100, height: 50 },
      },
    }],
    pages: [],
  } as unknown as VDTDocument;
}

describe('preloadResourceImages — print masters (EF-06)', () => {
  it('asks for the master by its own id and embeds it in place of the SVG', async () => {
    const master = await masterPdf();
    const asked: string[] = [];
    const bytes = (id: string) => {
      asked.push(id);
      return id === 'fig.pdf' ? master : id === 'fig.svg' ? SVG : undefined;
    };
    const pdfDoc = await PDFDocument.create();
    const images = await preloadResourceImages(pdfDoc, vdt({ svg: { fileId: 'fig.svg', pdfFileId: 'fig.pdf' } }), bytes);
    expect(asked[0]).toBe('fig.pdf');
    expect(images.get('fig.svg')?.kind).toBe('page');
  });

  it('falls back to the SVG when the master is missing or does not decode', async () => {
    const pdfDoc = await PDFDocument.create();
    const missing = await preloadResourceImages(
      pdfDoc,
      vdt({ svg: { fileId: 'fig.svg', pdfFileId: 'fig.pdf' } }),
      (id) => (id === 'fig.svg' ? SVG : undefined),
    );
    expect(missing.get('fig.svg')?.kind).toBe('vector');
    const broken = await preloadResourceImages(
      pdfDoc,
      vdt({ svg: { fileId: 'fig.svg', pdfFileId: 'fig.pdf' } }),
      (id) => (id === 'fig.pdf' ? new TextEncoder().encode('%PDF-1.7 truncated') : id === 'fig.svg' ? SVG : undefined),
    );
    expect(broken.get('fig.svg')?.kind).toBe('vector');
  });

  it('ignores the master in single-ink mode, which recolours SVG markup only', async () => {
    const master = await masterPdf();
    const asked: string[] = [];
    const pdfDoc = await PDFDocument.create();
    const images = await preloadResourceImages(
      pdfDoc,
      vdt({ svg: { fileId: 'fig.svg', pdfFileId: 'fig.pdf' } }, true),
      (id) => {
        asked.push(id);
        return id === 'fig.pdf' ? master : SVG;
      },
    );
    expect(asked).not.toContain('fig.pdf');
    expect(images.get('fig.svg')?.kind).toBe('vector');
  });

  it('still takes a master a host swapped in under the SVG id (bundleResourceBytes)', async () => {
    const master = await masterPdf();
    const pdfDoc = await PDFDocument.create();
    const images = await preloadResourceImages(
      pdfDoc,
      vdt({ svg: { fileId: 'fig.svg', pdfFileId: 'fig.pdf' } }),
      (id) => (id === 'fig.svg' ? master : undefined),
    );
    expect(images.get('fig.svg')?.kind).toBe('page');
  });
});

describe('renderToPdf — print masters (EF-06)', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config: PostextConfig = {
    page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  };
  const resources: Resource[] = [{
    id: 'fig',
    typeId: 'figure',
    kind: 'svg',
    createdAt: 0,
    updatedAt: 0,
    svg: { fileId: 'fig.svg', width: 200, height: 100, pdfFileId: 'fig.pdf' },
    placement: { position: 'here' },
  }];

  it('embeds the master page as a form XObject from plain resourceBytes', async () => {
    const master = await masterPdf();
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources }, config);
    const bytes = await renderToPdf(doc, {
      fontProvider: async () => new Uint8Array(fontBytes),
      resourceBytes: (id) => (id === 'fig.pdf' ? master : id === 'fig.svg' ? SVG : undefined),
    });
    const pdf = await PDFDocument.load(bytes);
    const contents = pdf.getPage(0).node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const content = refs
      .map((ref) => {
        const s = pdf.context.lookup(ref);
        return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
      })
      .join('\n');
    expect(content).toMatch(/\/EmbeddedPdfPage[^\s]* Do/);
  });

  it('embeds the master wherever the SVG is drawn: a table cell, a design image, a box icon', async () => {
    const master = await masterPdf();
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: 'Cell', image: { resourceId: 'fig' } }]] } },
      placement: { position: 'here' },
    };
    const uses: Array<[string, PostextConfig, string]> = [
      ['cell', config, 'Text.\n\n::resource{id="tab"}'],
      ['design image', {
        ...config,
        header: { elements: [{ kind: 'image', id: 'logo', resourceId: 'fig', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(40) } } }] },
      }, 'Text.'],
      ['box icon', { ...config, calloutStyles: [{ id: 'note', icon: { kind: 'resource', resourceId: 'fig' } }] }, ':::callout{type="note"}\nBoxed.\n:::'],
    ];
    for (const [use, cfg, markdown] of uses) {
      const doc = buildDocument({ markdown, resources: [...resources, table] }, cfg);
      const asked: string[] = [];
      const pdfDoc = await PDFDocument.create();
      const images = await preloadResourceImages(pdfDoc, doc, (id) => {
        asked.push(id);
        return id === 'fig.pdf' ? master : id === 'fig.svg' ? SVG : undefined;
      });
      expect(asked[0], use).toBe('fig.pdf');
      expect(images.get('fig.svg')?.kind, use).toBe('page');
    }
  });

  it('gives every chapter of a book the master, whichever chapter draws the SVG first', async () => {
    const master = await masterPdf();
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: 'Cell', image: { resourceId: 'fig' } }]] } },
      placement: { position: 'here' },
    };
    const chapter1 = buildDocument({ markdown: 'One.\n\n::resource{id="tab"}', resources: [...resources, table] }, config);
    const chapter2 = buildDocument({ markdown: 'Two.\n\n::resource{id="fig"}', resources: [...resources, table] }, config);
    const pdfDoc = await PDFDocument.create();
    const bytes = (id: string) => (id === 'fig.pdf' ? master : id === 'fig.svg' ? SVG : undefined);
    const shared = await preloadResourceImages(pdfDoc, chapter1, bytes);
    await preloadResourceImages(pdfDoc, chapter2, bytes, undefined, undefined, shared);
    expect(shared.get('fig.svg')?.kind).toBe('page');
  });
});
