import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// EF-36: the words of a Markdown link carry its URL (`VDTLineSegment.href`)
// and the PDF makes them a live link — one URI link annotation per run of
// linked words on a line, and a `Link` element in a tagged PDF.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(360), height: pt(360), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  bodyText: { fontFamily: 'Lora' },
  headings: { fontFamily: 'Lora', levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

interface UriAnnot {
  uri: string;
  rect: number[];
  contents?: string;
  structParent?: number;
}

function uriAnnots(pdf: PDFDocument, pageIndex = 0): UriAnnot[] {
  const annots = pdf.getPage(pageIndex).node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return [];
  const out: UriAnnot[] = [];
  for (let i = 0; i < annots.size(); i++) {
    const a = annots.lookup(i);
    if (!(a instanceof PDFDict)) continue;
    const action = a.lookup(PDFName.of('A'));
    if (!(action instanceof PDFDict)) continue;
    const uri = action.lookup(PDFName.of('URI'));
    const rect = a.lookup(PDFName.of('Rect'));
    const contents = a.lookup(PDFName.of('Contents'));
    const sp = a.lookup(PDFName.of('StructParent'));
    out.push({
      uri: uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : String(uri),
      rect: rect instanceof PDFArray ? rect.asArray().map((n) => (n as PDFNumber).asNumber()) : [],
      ...(contents instanceof PDFHexString || contents instanceof PDFString ? { contents: contents.decodeText() } : {}),
      ...(sp instanceof PDFNumber ? { structParent: sp.asNumber() } : {}),
    });
  }
  return out;
}

async function render(markdown: string, accessible = true, resources: Resource[] = []): Promise<PDFDocument> {
  const doc = buildDocument({ markdown, resources }, config);
  const bytes = await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), accessible });
  return PDFDocument.load(bytes);
}

describe('renderToPdf — Markdown links (EF-36)', () => {
  it('annotates each linked run with a URI action, absolute URLs only', async () => {
    const pdf = await render('Visit [the site](https://postext.dev/docs) today, or [write](mailto:team@postext.example). A [relative guide](../guide) stays text.');
    const annots = uriAnnots(pdf);
    expect(annots.map((a) => a.uri)).toEqual(['https://postext.dev/docs', 'mailto:team@postext.example']);
    // "the site": one annotation spanning both words.
    const [site] = annots;
    expect(site!.rect[2]! - site!.rect[0]!).toBeGreaterThan(20);
    expect(site!.contents).toBe('the site');
    expect(site!.structParent).toBeTypeOf('number');
  });

  it('splits a link broken across lines into one annotation per line', async () => {
    const words = 'a long run of linked words that has to wrap over more than one line of this narrow page';
    const pdf = await render(`Before [${words}](https://postext.dev/wrap) after.`);
    const annots = uriAnnots(pdf).filter((a) => a.uri === 'https://postext.dev/wrap');
    expect(annots.length).toBeGreaterThan(1);
    // Lines go down the page.
    for (let i = 1; i < annots.length; i++) expect(annots[i]!.rect[1]!).toBeLessThan(annots[i - 1]!.rect[1]!);
  });

  it('annotates links in captions and table cells, and in an untagged PDF too', async () => {
    const resources: Resource[] = [{
      id: 't',
      typeId: 'table',
      kind: 'table',
      caption: 'From [the census](https://a.example/census).',
      createdAt: 0,
      updatedAt: 0,
      table: { model: { rows: [[{ content: 'See [row](https://a.example/row)' }]] } },
      placement: { position: 'here' },
    }];
    const pdf = await render('Text.\n\n::resource{id="t"}', false, resources);
    const uris = uriAnnots(pdf).map((a) => a.uri).sort();
    expect(uris).toEqual(['https://a.example/census', 'https://a.example/row']);
    expect(uriAnnots(pdf).every((a) => a.structParent === undefined)).toBe(true);
  });

  it('percent-encodes characters a PDF URI cannot hold', async () => {
    const pdf = await render('See [niño](https://a.example/año?q=(1)) here.');
    // Balanced parentheses belong to the destination, as CommonMark reads it.
    expect(uriAnnots(pdf)[0]!.uri).toBe('https://a.example/a%C3%B1o?q=(1)');
  });
});
