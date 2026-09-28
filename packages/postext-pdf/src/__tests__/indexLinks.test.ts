import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
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
};

const markdown = `# Chapter

The :index[heart]{main} pumps blood.

${filler(12)}

The heart:index{term="heart"} again, and the :index[lungs].

# Index

:::index`;

const textOf = (v: unknown): string | undefined => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : undefined);

let pdf: PDFDocument;
let doc: ReturnType<typeof buildDocument>;

beforeAll(async () => {
  doc = buildDocument({ markdown }, config);
  const bytes = await renderToPdf(doc, { fontProvider });
  pdf = await PDFDocument.load(bytes);
}, 60_000);

describe('index page numbers as links', () => {
  it('links each page number to its page, tagged as a Link', () => {
    const indexPage = doc.blocks.find((b) => b.lines.some((l) => l.segments?.some((s) => s.pageLink !== undefined)))!.pageIndex;
    const targets = doc.blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).filter((s) => s.pageLink !== undefined);
    expect(targets.map((s) => s.text)).toEqual([
      doc.pages[doc.indexMarks![0]!.pageIndex]!.pageLabel, // bold (main): a run of its own
      doc.pages[doc.indexMarks![1]!.pageIndex]!.pageLabel,
      doc.pages[doc.indexMarks![2]!.pageIndex]!.pageLabel,
    ]);
    const annots = pdf.getPage(indexPage).node.Annots()!.asArray().map((r) => pdf.context.lookup(r, PDFDict));
    expect(annots).toHaveLength(3);
    const pages = pdf.getPages();
    annots.forEach((annot, i) => {
      expect(annot.get(PDFName.of('Subtype'))).toEqual(PDFName.of('Link'));
      const dest = annot.lookup(PDFName.of('Dest'), PDFArray).asArray();
      expect(dest[0]).toEqual(pages[targets[i]!.pageLink!]!.ref);
      expect(textOf(annot.get(PDFName.of('Contents')))).toBe(targets[i]!.text);
    });
  });
});
