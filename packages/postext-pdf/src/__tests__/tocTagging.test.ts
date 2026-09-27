import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// EF-145: the rows of a `:::toc` were tagged like body text. An unnumbered
// row was `P › Link`, and a numbered one, whose number is painted as a
// list marker, a one-item list of its own (`L › LI › Lbl + LBody › Link`).
// They are now one `TOC` with a `TOCI` per row, in row order: `Lbl` for the
// number, `Reference › Link` for the title and page (PDF 1.7 §14.8.4.3.2).

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
  },
  layout: { layoutType: 'single' },
  locale: 'en-us',
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
  headingStyles: [{ id: 'front', numbered: false }],
  toc: { levels: [{ level: 1 }, { level: 2 }], parts: { enabled: true } },
};

const book = `# Contents {style="front" toc="false"}

:::toc

# Preface {style="front"}

${filler(2)}

:::part{number="I" title="Foundations"}
:::

# The lantern

${filler(2)}

## Wicks

${filler(1)}

# Trimming

${filler(1)}`;

interface Elem { type: string; kids: Elem[]; contents?: string }

const textOf = (v: unknown): string | undefined => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : undefined);

function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const elem: Elem = { type: (dict.get(PDFName.of('S')) as PDFName).decodeText(), kids: [] };
  const k = dict.get(PDFName.of('K'));
  for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) {
    if (kid instanceof PDFRef) elem.kids.push(readElem(pdf, kid));
    else if (kid instanceof PDFDict && (kid.get(PDFName.of('Type')) as PDFName | undefined)?.decodeText() === 'OBJR') {
      elem.contents = textOf(kid.lookup(PDFName.of('Obj'), PDFDict).get(PDFName.of('Contents')));
    }
  }
  return elem;
}

let root: Elem;

beforeAll(async () => {
  const doc = buildDocument({ markdown: book, metadata: { title: 'Contents book' } }, config);
  const bytes = await renderToPdf(doc, { fontProvider });
  const out = process.env.POSTEXT_TOC_TAGS_PDF_OUT;
  if (out) fs.writeFileSync(out, bytes);
  const pdf = await PDFDocument.load(bytes);
  const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  root = readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
}, 60_000);

describe('contents rows in the tagged PDF (EF-145)', () => {
  it('tags the contents as one TOC, right after its heading', () => {
    const tocs = root.kids.filter((k) => k.type === 'TOC');
    expect(tocs).toHaveLength(1);
    expect(root.kids[0]!.type).toBe('H1');
    expect(root.kids[1]!.type).toBe('TOC');
    // No row left as a paragraph or a one-item list.
    expect(root.kids.slice(2, 4).map((k) => k.type)).not.toContain('L');
  });

  it('gives every row a TOCI, in row order, the part row included', () => {
    const toc = root.kids.find((k) => k.type === 'TOC')!;
    expect(toc.kids.every((k) => k.type === 'TOCI')).toBe(true);
    const linkText = (item: Elem): string => {
      const ref = item.kids.find((k) => k.type === 'Reference')!;
      return ref.kids.find((k) => k.type === 'Link')!.contents ?? '';
    };
    // The link's description: the row's text and page, a part's number and title.
    const rows = toc.kids.map(linkText);
    const expected = ['Preface', 'I Foundations', 'The lantern', 'Wicks', 'Trimming'];
    expect(rows).toHaveLength(expected.length);
    rows.forEach((row, i) => expect(row.startsWith(expected[i]!), `${row} / ${expected[i]}`).toBe(true));
  });

  it('labels a numbered row\'s number and links its title', () => {
    const toc = root.kids.find((k) => k.type === 'TOC')!;
    const lantern = toc.kids[2]!;
    expect(lantern.kids.map((k) => k.type)).toEqual(['Lbl', 'Reference']);
    expect(lantern.kids[1]!.kids.map((k) => k.type)).toEqual(['Link']);
    const preface = toc.kids[0]!;
    expect(preface.kids.map((k) => k.type)).toEqual(['Reference']);
  });
});
