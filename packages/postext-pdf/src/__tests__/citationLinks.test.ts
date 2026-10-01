import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, registerCitationEngine } from 'postext';
import type { CitationEngine, PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A citation engine that writes "(key)" and lists the keys. */
const stub: CitationEngine = {
  styles: () => [],
  createProcessor: ({ items }) => ({
    kind: 'in-text',
    numeric: false,
    cite: (clusters) => clusters.map((c) => `(${c.items.map((i) => i.id).join('; ')})`),
    bibliography: (ids) => ({
      entries: items.filter((i) => !ids || ids.includes(i.id)).map((i) => ({ id: i.id, html: `<i>${String(i.title)}</i>.` })),
      hangingIndent: true,
      labelColumn: false,
      entrySpacing: 0,
    }),
    citationNumbers: () => new Map(),
  }),
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  locale: 'en-us',
};
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Paragraph ${i} with enough words to consume vertical space and force the page to overflow.`).join('\n\n');

/** Every structure type in the tree, in document order. */
function structTypes(pdf: PDFDocument): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    const dict = node instanceof PDFRef ? pdf.context.lookup(node) : node;
    if (dict instanceof PDFArray) { for (const k of dict.asArray()) visit(k); return; }
    if (!(dict instanceof PDFDict)) return;
    const s = dict.get(PDFName.of('S'));
    if (s instanceof PDFName) out.push(s.decodeText());
    const k = dict.get(PDFName.of('K'));
    if (k) visit(k);
  };
  visit(pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict).get(PDFName.of('K')));
  return out;
}

describe('citations in the PDF (#269)', () => {
  let doc: VDTDocument;
  let pdf: PDFDocument;
  beforeAll(async () => {
    registerCitationEngine(stub);
    const markdown = `---\nnocite: "@beta"\nreferences:\n  - {id: alpha, title: Alpha}\n  - {id: beta, title: Beta}\n---\n# One\n\nAs [@alpha] and [the second](#ref-beta) show.\n\n${filler(8)}\n`;
    doc = buildDocument({ markdown }, config);
    pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: true }));
    registerCitationEngine(undefined);
  }, 60_000);

  it('links a citation and an internal Markdown link to their entries', () => {
    const pages = pdf.getPages();
    const dests: unknown[] = [];
    pages.forEach((page) => {
      for (const ref of page.node.Annots()?.asArray() ?? []) {
        const annot = pdf.context.lookup(ref, PDFDict);
        const dest = annot.lookup(PDFName.of('Dest'));
        if (dest instanceof PDFArray) dests.push(dest.get(0));
      }
    });
    const entryPage = (id: string) => pages[doc.anchors!.find((a) => a.id === `ref-${id}`)!.pageIndex]!.ref;
    expect(dests).toEqual([entryPage('alpha'), entryPage('beta')]);
  });

  it('tags each entry as a BibEntry', () => {
    expect(structTypes(pdf).filter((t) => t === 'BibEntry')).toHaveLength(2);
  });
});
