import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, computeOutlineFor, parseMarkdown } from 'postext';
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
  page: {
    width: pt(360), height: pt(300),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
    pageNumbering: { format: 'lower-roman', startAt: 1 },
  },
  layout: { layoutType: 'single' },
  locale: 'en-us',
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
  headingStyles: [{ id: 'front', numbered: false }],
  toc: { subtitle: { enabled: true, attr: 'author' }, parts: { enabled: true } },
};

const book = `# Contents {style="front" toc="false"}

:::toc

# Preface {style="front"}

${filler(2)}

:::numbering{format="decimal" startAt=1}

:::part{number="I" title="Foundations"}
:::

# The lantern {author="A. Author"}

${filler(3)}

# Trimming {author="B. Author"}

${filler(1)}`;

const textOf = (v: unknown): string | undefined => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : undefined);

let pdf: PDFDocument;
let doc: ReturnType<typeof buildDocument>;

beforeAll(async () => {
  doc = buildDocument({ markdown: book, metadata: { title: 'Linked book' } }, config);
  const bytes = await renderToPdf(doc, { fontProvider });
  const out = process.env.POSTEXT_TOC_PDF_OUT;
  if (out) fs.writeFileSync(out, bytes);
  pdf = await PDFDocument.load(bytes);
}, 60_000);

describe('contents rows as links', () => {
  it('links every row to the top of the page it lists', () => {
    const rows = doc.blocks.filter((b) => (b.tocEntry ?? b.tocPart) && b.pageIndex === 0);
    expect(rows.length).toBe(4); // Preface, part I, The lantern, Trimming
    const annots = pdf.getPage(0).node.Annots()!.asArray().map((r) => pdf.context.lookup(r, PDFDict));
    expect(annots).toHaveLength(4);
    const pages = pdf.getPages();
    // Rows by the text the annotation describes (a part row is drawn after
    // the column's other blocks, so annotation order is not row order).
    const rowText = (b: (typeof rows)[number]) => (b.tocPart ? `${b.tocPart.number} ${b.tocPart.title}` : b.lines.map((l) => l.text).join(' '));
    const seen = new Set<string>();
    for (const annot of annots) {
      expect(annot.get(PDFName.of('Subtype'))).toEqual(PDFName.of('Link'));
      const contents = textOf(annot.get(PDFName.of('Contents')))!;
      const row = rows.find((b) => rowText(b) === contents)!;
      expect(row).toBeDefined();
      seen.add(contents);
      const target = pages[row.tocEntry?.pageIndex ?? row.tocPart!.pageIndex!]!;
      const dest = annot.lookup(PDFName.of('Dest'), PDFArray).asArray();
      expect(dest[0]).toEqual(target.ref);
      expect(dest[1]).toEqual(PDFName.of('XYZ'));
      expect((dest[3] as PDFNumber).asNumber()).toBeCloseTo(target.getHeight(), 3);
      // Tagged: the annotation joins a `Link` element and describes its target.
      expect(annot.get(PDFName.of('StructParent'))).toBeInstanceOf(PDFNumber);
    }
    expect(seen.has('I Foundations')).toBe(true);
    expect([...seen].some((t) => t.startsWith('The lantern'))).toBe(true);
  });

  it('wraps each row\'s text in a Link structure element with its annotation', () => {
    const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const links: PDFDict[] = [];
    const visit = (ref: PDFRef | PDFDict) => {
      const dict = ref instanceof PDFRef ? pdf.context.lookup(ref, PDFDict) : ref;
      if (dict.get(PDFName.of('S')) === PDFName.of('Link')) links.push(dict);
      const k = dict.get(PDFName.of('K'));
      const kids = k instanceof PDFArray ? k.asArray() : k ? [k] : [];
      for (const kid of kids) {
        if (kid instanceof PDFRef) visit(kid);
        else if (kid instanceof PDFDict && kid.get(PDFName.of('S'))) visit(kid);
      }
    };
    visit(root);
    expect(links).toHaveLength(4);
    for (const link of links) {
      const k = link.lookup(PDFName.of('K'), PDFArray).asArray().map((x) => (x instanceof PDFRef ? pdf.context.lookup(x) : x));
      const types = k.map((x) => (x instanceof PDFDict ? textOf(x.get(PDFName.of('Type'))) ?? (x.get(PDFName.of('Type')) as PDFName | undefined)?.decodeText() : 'mcid'));
      expect(types.filter((t) => t === 'OBJR')).toHaveLength(1);
      expect(types.filter((t) => t === 'MCR' || t === 'mcid').length).toBeGreaterThan(0);
    }
  });

  it('skips rows whose page lies outside a chapter rendered on its own', async () => {
    // The chapter with the contents, laid out after ten pages of another
    // chapter, listing a host outline that points into the book.
    const outline = computeOutlineFor(parseMarkdown(book), config).map((e, i) => ({ ...e, pageLabel: String(i + 1), pageIndex: 100 + i }));
    const alone = buildDocument({ markdown: book, outline, continuation: { pageIndexOffset: 10 } }, config);
    const out = await PDFDocument.load(await renderToPdf(alone, { fontProvider }));
    expect(out.getPage(0).node.Annots()?.asArray() ?? []).toHaveLength(0);
  });
});
