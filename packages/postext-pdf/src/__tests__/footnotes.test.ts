import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString, PDFHexString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// Footnotes (#162): a marker links to its note, the note is tagged `Note`
// with an `/ID` listed in the structure tree's `/IDTree`.

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
const config: PostextConfig = {
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'double' },
  locale: 'en-us',
};

const md = `The lantern must stay lit all night.[^wick] Keepers trimmed it twice.

A second paragraph with its own note.[^oil]

[^wick]: The wick was trimmed at dusk and at midnight.

[^oil]: Whale oil until the 1860s, then kerosene.`;

let pdf: PDFDocument;

beforeAll(async () => {
  const doc = buildDocument({ markdown: md, metadata: { title: 'Notes' } }, config);
  const bytes = await renderToPdf(doc, { fontProvider, accessible: true });
  pdf = await PDFDocument.load(bytes);
}, 60_000);

const textOf = (v: unknown): string | undefined => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : undefined);

describe('footnotes in the PDF', () => {
  it('links each marker to its note', () => {
    const page = pdf.getPages()[0]!;
    const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
    const links = annots.asArray().map((r) => pdf.context.lookup(r, PDFDict)).filter((a) => a.get(PDFName.of('Subtype')) === PDFName.of('Link'));
    expect(links).toHaveLength(2);
    for (const link of links) {
      const dest = link.lookup(PDFName.of('Dest'), PDFArray);
      expect(dest.get(0)).toBe(page.ref);
    }
  });

  it('tags the notes as Note elements with unique ids', () => {
    const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const idTree = root.lookup(PDFName.of('IDTree'), PDFDict);
    const names = idTree.lookup(PDFName.of('Names'), PDFArray).asArray();
    const ids = names.filter((_, i) => i % 2 === 0).map(textOf);
    expect(ids).toEqual(['note-oil', 'note-wick']);
    for (let i = 1; i < names.length; i += 2) {
      const elem = pdf.context.lookup(names[i] as PDFRef, PDFDict);
      expect(elem.get(PDFName.of('S'))).toBe(PDFName.of('Note'));
    }
  });
});
