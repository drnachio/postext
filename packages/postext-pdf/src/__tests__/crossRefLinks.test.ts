import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildBundle, buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i} with enough words to consume vertical space and force the page to overflow.`).join('\n\n');

const config: PostextConfig = {
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  locale: 'en-us',
  headings: { levels: [{ level: 1, numberingTemplate: '{1}' }, { level: 2, numberingTemplate: '{1}.{2}' }] },
};

const textOf = (v: unknown): string | undefined => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : undefined);

/** Every link annotation of the file: its page, destination and text. */
function links(pdf: PDFDocument): { page: number; dest: PDFArray; contents?: string }[] {
  const out: { page: number; dest: PDFArray; contents?: string }[] = [];
  pdf.getPages().forEach((page, index) => {
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const annot = pdf.context.lookup(ref, PDFDict);
      const dest = annot.lookup(PDFName.of('Dest'));
      if (dest instanceof PDFArray) out.push({ page: index, dest, contents: textOf(annot.get(PDFName.of('Contents'))) });
    }
  });
  return out;
}

describe('cross-references as PDF links (#264)', () => {
  let pdf: PDFDocument;
  let doc: VDTDocument;
  beforeAll(async () => {
    const markdown = `# Opening\n\nSee :ref{id="method"} and the [claim]{#claim} on :ref{id="claim" style=page}.\n\n${filler(10)}\n\n## Method {#method}\n\nText.`;
    doc = buildDocument({ markdown }, config);
    pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: true }));
  }, 60_000);

  it('links each reference to its anchor, tagged as a Link', () => {
    const pages = pdf.getPages();
    const found = links(pdf);
    expect(found).toHaveLength(2);
    const method = doc.anchors!.find((a) => a.id === 'method')!;
    expect(found[0]!.dest.get(0)).toEqual(pages[method.pageIndex]!.ref);
    expect(found[0]!.contents).toBe('section 1.1');
    const claim = doc.anchors!.find((a) => a.id === 'claim')!;
    expect(found[1]!.dest.get(0)).toEqual(pages[claim.pageIndex]!.ref);
  });

  it('names every anchor in the catalog’s destination tree', () => {
    const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict);
    const dests = names.lookup(PDFName.of('Dests'), PDFDict);
    const leaf = dests.lookup(PDFName.of('Names'), PDFArray).asArray();
    const keys = leaf.filter((_, i) => i % 2 === 0).map(textOf);
    expect(keys).toEqual(['claim', 'method']);
  });
});

describe('cross-references between chapters (#264)', () => {
  it('links a reference to an anchor of another chapter', async () => {
    const docs = buildBundle({
      chapters: [
        { markdown: `# One\n\nAs :ref{id="later"} shows.\n\n${filler(2)}` },
        { markdown: `# Two\n\n${filler(6)}\n\n## Later {#later}\n\nText.` },
      ],
      config,
      resources: [],
    });
    const pdf = await PDFDocument.load(await renderToPdf(docs, { fontProvider }));
    const target = docs[1]!.anchors!.find((a) => a.id === 'later')!;
    const physical = docs[0]!.pages.length + target.pageIndex;
    const found = links(pdf);
    expect(found).toHaveLength(1);
    expect(found[0]!.page).toBe(0);
    expect(found[0]!.dest.get(0)).toEqual(pdf.getPage(physical).ref);
  }, 60_000);
});
