import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend';

// EF-183: an SVG drawn on several pages (here a frame in every page's
// header design) used to be written into every page's content stream, so
// a class of thirty certificates carried thirty copies of the frame. It is
// written once, as a form XObject, and every page paints it with `Do`.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));

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

/** A frame of `n` small paths whose coordinates do not repeat, so the
 *  compressed drawing is some kilobytes. */
function frameSvg(n: number): Uint8Array {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 200;
  const paths = Array.from({ length: n }, () =>
    `<path d="M${rnd().toFixed(2)} ${rnd().toFixed(2)} C${rnd().toFixed(2)} ${rnd().toFixed(2)} ${rnd().toFixed(2)} ${rnd().toFixed(2)} ${rnd().toFixed(2)} ${rnd().toFixed(2)}" fill="none" stroke="#7a5c2e" stroke-width="0.4"/>`);
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${paths.join('')}</svg>`);
}

const FRAME = frameSvg(250);

const resources: Resource[] = [{
  id: 'frame', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'frame.svg', width: 200, height: 200 },
}];

const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), dpi: 72, margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: {
    elements: [{
      kind: 'image', id: 'frame', resourceId: 'frame',
      placement: { anchor: { to: 'page', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } },
    }],
  },
  footer: { elements: [] },
};

const pages = (n: number) => Array.from({ length: n }, (_, i) => `Certificate ${i + 1}.`).join('\n\n:::pagebreak\n\n');

async function render(n: number): Promise<{ bytes: Uint8Array; pdf: PDFDocument }> {
  const doc = buildDocument({ markdown: pages(n), resources }, config);
  expect(doc.pages).toHaveLength(n);
  const bytes = await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    resourceBytes: (id) => (id === 'frame.svg' ? FRAME : undefined),
    accessible: false,
  });
  return { bytes, pdf: await PDFDocument.load(bytes) };
}

function pageContent(pdf: PDFDocument, index: number): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** The form XObjects of the document that hold path operators. */
function drawingForms(pdf: PDFDocument): PDFRawStream[] {
  return pdf.context.enumerateIndirectObjects()
    .map(([, obj]) => obj)
    .filter((obj): obj is PDFRawStream => obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'))
    .filter((form) => / c\n/.test(new TextDecoder('latin1').decode(decodePDFRawStream(form).decode())));
}

describe('EF-183: an SVG drawn on several pages is written once', () => {
  it('stores the frame once and paints it on every page with Do', async () => {
    const { pdf } = await render(3);
    const forms = drawingForms(pdf);
    expect(forms).toHaveLength(1);
    const formRef = pdf.context.getObjectRef(forms[0]!);
    for (let i = 0; i < 3; i++) {
      const content = pageContent(pdf, i);
      // No path of the frame in the page itself…
      expect(content).not.toMatch(/ c\n/);
      // …but the form, named in the page's resources.
      const xobjects = pdf.getPage(i).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      const names = [...xobjects.entries()].filter(([, ref]) => ref === formRef).map(([name]) => name.asString());
      expect(names).toHaveLength(1);
      expect(content).toContain(`${names[0]} Do`);
    }
  }, 60_000);

  it('each further page costs a few hundred bytes, not the drawing again', async () => {
    const one = (await render(1)).bytes.length;
    const three = (await render(3)).bytes.length;
    const { pdf } = await render(1);
    const formBytes = drawingForms(pdf)[0]!.getContentsSize();
    expect(formBytes).toBeGreaterThan(4000);
    expect(three - one).toBeLessThan(formBytes / 2);
  }, 60_000);
});
