import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// EF-146: a tagged page painted, and tagged, its opener, then each column,
// then its floats, so the structure tree read every figure, table and
// floated box after all the text of its page (after the closing table,
// too), and a list that went on after the page was cut in two by the
// float. A float is now read right after the text that first cites it —
// on its own page or an earlier one —, a floated box after the text
// before its fence, and the lists and contents around it stay whole.

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
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
));
const figure = (id: string, extra: Partial<Resource> = {}): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: `Figure ${id}.`, altText: `Alt ${id}`, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'x.png', format: 'png', width: 400, height: 240 }, ...extra,
});
const resources: Resource[] = [
  figure('cited'),
  figure('embedded', { placement: { position: 'top' } }),
  figure('late'),
];

const words = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
const markdown = [
  '# Chapter',
  '',
  `${words(40, 'opening')}.`,
  '',
  `The figure is cited here, :ref{id=cited}, ${words(30, 'citing')}.`,
  '',
  `${words(60, 'after')}.`,
  '',
  ...Array.from({ length: 14 }, (_, i) => `- Item ${i} ${words(12, `item${i}w`)}.`),
  '',
  `${words(50, 'before')}.`,
  '',
  '::resource{id="embedded"}',
  '',
  `${words(80, 'middle')}.`,
  '',
  ':::callout{placement="top"}',
  'A floated box.',
  ':::',
  '',
  `${words(150, 'tail')}.`,
  '',
  `The late figure, :ref{id=late}, ${words(120, 'end')}.`,
  '',
  `${words(200, 'closing')}.`,
].join('\n');

const config: PostextConfig = {
  page: { width: pt(360), height: pt(420), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  layout: { layoutType: 'double' },
  locale: 'en-us',
  header: { elements: [] },
  footer: { elements: [] },
};

interface Elem { type: string; kids: Elem[]; alt?: string }

function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const alt = dict.get(PDFName.of('Alt'));
  const elem: Elem = { type: (dict.get(PDFName.of('S')) as PDFName).decodeText(), kids: [], ...(alt ? { alt: (alt as unknown as { decodeText(): string }).decodeText() } : {}) };
  const k = dict.get(PDFName.of('K'));
  for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) {
    if (kid instanceof PDFRef) elem.kids.push(readElem(pdf, kid));
  }
  return elem;
}

let doc: VDTDocument;
let root: Elem;

beforeAll(async () => {
  doc = buildDocument({ markdown, resources }, config);
  const bytes = await renderToPdf(doc, { fontProvider, resourceBytes: () => PNG });
  const out = process.env.POSTEXT_FLOAT_ORDER_PDF_OUT;
  if (out) fs.writeFileSync(out, bytes);
  const pdf = await PDFDocument.load(bytes);
  const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  root = readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
  if (process.env.POSTEXT_DUMP_FLOATS) {
    for (const page of doc.pages) {
      console.log(`page ${page.index}`, page.columns.map((c) => c.blocks.map((b) => `${b.type}@${b.contentIndex}`).join(' ')),
        (page.floats ?? []).map((f) => `${f.type}:${f.resourceBlock?.resource.id ?? f.containerId}@${f.contentIndex}`));
    }
    console.log(root.kids.map((k) => (k.type === 'Figure' ? `Figure(${k.alt})` : k.type)).join(' '));
  }
}, 60_000);

const topTypes = () => root.kids.map((k) => (k.type === 'Figure' ? `Figure:${k.alt}` : k.type));
const floatPage = (id: string) => doc.pages.find((p) => (p.floats ?? []).some((f) => f.resourceBlock?.resource.id === id))?.index;

describe('floats in the reading order of a tagged PDF (EF-146)', () => {
  it('lays the sample out with its floats where the test expects them', () => {
    expect(floatPage('cited')).toBeDefined();
    expect(floatPage('embedded')).toBeDefined();
    expect(floatPage('late')).toBeDefined();
    expect(doc.pages.some((p) => (p.floats ?? []).some((f) => f.type === 'callout'))).toBe(true);
    // The late figure is cited on one page and placed on a later one.
    const citing = doc.blocks.find((b) => b.lines.some((l) => (l.segments ?? []).some((s) => s.refResourceId === 'late')));
    expect(floatPage('late')!).toBeGreaterThan(citing!.pageIndex);
  });

  it('reads a figure right after the paragraph that cites it', () => {
    const types = topTypes();
    // H1, the opening paragraph, the citing one, then the figure.
    expect(types.slice(0, 4)).toEqual(['H1', 'P', 'P', 'Figure:Alt cited']);
  });

  it('reads a figure placed on a later page after its citation too', () => {
    const types = topTypes();
    const late = types.indexOf('Figure:Alt late');
    // The citing paragraph is the one right before, and the text after it
    // (the closing paragraph) comes after the figure.
    expect(late).toBeGreaterThan(0);
    expect(types[late - 1]).toBe('P');
    expect(types.slice(late + 1)).toContain('P');
    expect(late).toBeLessThan(types.length - 1);
  });

  it('reads an embedded figure and a floated box where their lines stand', () => {
    const types = topTypes();
    const list = types.indexOf('L');
    const embedded = types.indexOf('Figure:Alt embedded');
    const box = types.indexOf('Div');
    // list, "before…" paragraph, embedded figure, "middle…" paragraph, box.
    expect(types.slice(list, list + 5)).toEqual(['L', 'P', 'Figure:Alt embedded', 'P', 'Div']);
    expect(embedded).toBeLessThan(box);
  });

  it('keeps a list that goes on after a page with a float in one element', () => {
    expect(topTypes().filter((t) => t === 'L')).toHaveLength(1);
    const list = root.kids.find((k) => k.type === 'L')!;
    expect(list.kids).toHaveLength(14);
  });
});

// A heading inside a floated box used to be clamped where the box was
// painted (after the page's columns), then read at its fence, ahead of
// headings painted before it: `# Chapter`, a box holding `### Inside the
// box`, then `## Section` came out as H1, Div›H3, H2, which skips a level
// (PDF/UA-1 7.4.2). The box's headings are now clamped where it is read.
describe('headings of a float are clamped where the float is read (EF-146)', () => {
  const headingsOf = (elem: Elem, out: string[] = []): string[] => {
    if (/^H\d$/.test(elem.type) || elem.type === 'Div') out.push(elem.type);
    for (const kid of elem.kids) headingsOf(kid, out);
    return out;
  };
  const skips = (sequence: string[]): string[] => {
    let last = 0;
    const found: string[] = [];
    for (const type of sequence) {
      const level = /^H(\d)$/.exec(type)?.[1];
      if (!level) continue;
      if (Number(level) > last + 1) found.push(`H${last}→${type}`);
      last = Number(level);
    }
    return found;
  };
  const tagged = async (md: string) => {
    const layout = buildDocument({ markdown: md }, {
      ...config,
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    });
    const pdf = await PDFDocument.load(await renderToPdf(layout, { fontProvider }));
    const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    return { layout, tree: readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef) };
  };
  const boxIsFloat = (layout: VDTDocument) => layout.pages.some((p) => (p.floats ?? []).some((f) => f.type === 'callout'));

  it('reads a deeper heading of a box ahead of flow headings painted before it without a skip', async () => {
    const { layout, tree } = await tagged([
      '# Chapter', '', `${words(30, 'a')}.`, '',
      ':::callout{placement="bottom"}', '### Inside the box', '', 'Box text.', ':::', '',
      '## Section', '', `${words(60, 'b')}.`, '', '## Another', '', `${words(300, 'c')}.`,
    ].join('\n'));
    expect(boxIsFloat(layout)).toBe(true);
    const sequence = headingsOf(tree);
    expect(sequence).toEqual(['H1', 'Div', 'H2', 'H2', 'H2']);
    expect(skips(sequence)).toEqual([]);
  });

  it('keeps a shallower heading of a box from opening a skip before the next flow heading', async () => {
    const { layout, tree } = await tagged([
      '# Chapter', '', '## Section', '', '### Topic', '', `${words(30, 'a')}.`, '',
      ':::callout{placement="bottom"}', '# Box title', '', 'Box text.', ':::', '',
      '#### Detail', '', `${words(60, 'b')}.`, '', `${words(300, 'c')}.`,
    ].join('\n'));
    expect(boxIsFloat(layout)).toBe(true);
    const sequence = headingsOf(tree);
    // The box's title may not drop below H3, or the H4 after it would skip.
    expect(sequence).toEqual(['H1', 'H2', 'H3', 'Div', 'H3', 'H4']);
    expect(skips(sequence)).toEqual([]);
  });
});

// #633: a float set at the head of the page that cites it is painted above
// its citing paragraph, and still read after it.
describe('a float heading the page that cites it is read after its citation (#633)', () => {
  it('follows the citing paragraph in the structure tree', async () => {
    const md = [
      ...Array.from({ length: 16 }, (_, i) => `${words(40, `p${i}w`)}.`),
      `${words(10, 'lead')} the figure :ref{id=fig} ${words(10, 'citing')}.`,
      ...Array.from({ length: 20 }, (_, i) => `${words(40, `q${i}w`)}.`),
    ].join('\n\n');
    const fig = figure('fig', { placement: { position: 'top', span: 'page', citingPage: true } });
    const layout = buildDocument({ markdown: md, resources: [fig] }, { ...config, headings: { levels: [] } });
    const page = layout.pages.find((p) => (p.floats ?? []).length > 0)!;
    const float = page.floats![0]!;
    const citing = layout.blocks.find((b) => b.lines.some((l) => (l.segments ?? []).some((s) => s.refResourceId === 'fig')))!;
    const line = citing.lines.find((l) => (l.segments ?? []).some((s) => s.refResourceId === 'fig'))!;
    // Painted above the citing line, on its page.
    expect(citing.pageIndex).toBe(page.index);
    expect(float.bbox.y + float.bbox.height).toBeLessThan(line.bbox.y);
    const bytes633 = await renderToPdf(layout, { fontProvider, resourceBytes: () => PNG });
    if (process.env.POSTEXT_633_OUT) fs.writeFileSync(process.env.POSTEXT_633_OUT, bytes633);
    const pdf = await PDFDocument.load(bytes633);
    const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const tree = readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
    const types = tree.kids.map((k) => (k.type === 'Figure' ? `Figure:${k.alt}` : k.type));
    // Sixteen paragraphs, the citing one, then the figure.
    expect(types.indexOf('Figure:Alt fig')).toBe(17);
    expect(types.slice(0, 17).every((t) => t === 'P')).toBe(true);
  }, 60_000);
});
