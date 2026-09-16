import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { buildXmp } from '../pdf-backend/tagging';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

// Text measurement stub with the real metrics of the face the PDF embeds
// (no DOM in the node test env), so justified lines space like real output.
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

// 1×1 PNG.
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
));

const resources: Resource[] = [
  {
    id: 'f1',
    typeId: 'figure',
    kind: 'bitmap',
    caption: 'A square.',
    altText: 'A red square on white',
    createdAt: 0,
    updatedAt: 0,
    bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 300 },
  },
  {
    id: 't1',
    typeId: 'table',
    kind: 'table',
    caption: 'Sizes.',
    altText: 'Two sizes and their widths',
    createdAt: 0,
    updatedAt: 0,
    table: {
      model: {
        headerRowCount: 1,
        rows: [
          [{ content: 'Size' }, { content: 'Width' }],
          [{ content: 'Small' }, { content: '10' }],
          [{ content: 'Large' }, { content: '20' }],
        ],
      },
    },
  },
];

const para = 'Body text that runs on for a while so the page fills and the paragraph wraps over several lines. ';
const markdown = [
  '# Opening chapter',
  '',
  `See :ref{id=f1} and :ref{id=t1}. ${para.repeat(3)}`,
  '',
  '### Skipped level',
  '',
  'Words with **bold** and *italic* runs.',
  '',
  '- First item',
  '  - Nested item',
  '- Second item',
  '',
  '1. One',
  '2. Two',
  '',
  '> A quoted paragraph.',
  '',
  para.repeat(40),
  '',
  '## Second section',
  '',
  para.repeat(4),
].join('\n');

const config: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  locale: 'en-us',
  footer: {
    elements: [{
      kind: 'text', id: 'pn', content: '{pageNumber}', fontSize: pt(8), overflow: 'ellipsis-end',
      placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
    }],
  },
};

// --- PDF inspection helpers ------------------------------------------------

interface Elem {
  type: string;
  alt?: string;
  attrs: Record<string, string>[];
  kids: Elem[];
  mcids: number;
  objrs: number;
}

function nameOf(v: unknown): string | undefined {
  return v instanceof PDFName ? v.decodeText() : undefined;
}

function textOf(v: unknown): string | undefined {
  if (v instanceof PDFHexString || v instanceof PDFString) return v.decodeText();
  return undefined;
}

function readAttrs(pdf: PDFDocument, a: unknown): Record<string, string>[] {
  const dicts = a instanceof PDFRef ? [pdf.context.lookup(a)] : a instanceof PDFArray ? a.asArray().map((x) => pdf.context.lookup(x)) : [a];
  return dicts.filter((d): d is PDFDict => d instanceof PDFDict).map((d) => {
    const out: Record<string, string> = {};
    for (const [k, v] of d.entries()) {
      out[k.decodeText()] = nameOf(v) ?? textOf(v) ?? (v instanceof PDFNumber ? String(v.asNumber()) : v.toString());
    }
    return out;
  });
}

function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const elem: Elem = { type: nameOf(dict.get(PDFName.of('S')))!, attrs: readAttrs(pdf, dict.get(PDFName.of('A'))), kids: [], mcids: 0, objrs: 0 };
  const alt = textOf(dict.get(PDFName.of('Alt')));
  if (alt !== undefined) elem.alt = alt;
  const k = dict.get(PDFName.of('K'));
  const kids = k instanceof PDFArray ? k.asArray() : k ? [k] : [];
  for (const kid of kids) {
    if (kid instanceof PDFRef) {
      elem.kids.push(readElem(pdf, kid));
    } else if (kid instanceof PDFDict) {
      const type = nameOf(kid.get(PDFName.of('Type')));
      if (type === 'MCR') elem.mcids++;
      else if (type === 'OBJR') elem.objrs++;
    }
  }
  return elem;
}

function structRoot(pdf: PDFDocument): Elem {
  const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  const k = root.get(PDFName.of('K')) as PDFArray;
  return readElem(pdf, k.get(0) as PDFRef);
}

function walk(elem: Elem, visit: (e: Elem, parent: Elem | null) => void, parent: Elem | null = null): void {
  visit(elem, parent);
  for (const kid of elem.kids) walk(kid, visit, elem);
}

function pageContent(pdf: PDFDocument, index: number): string {
  const page = pdf.getPage(index);
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let out = '';
  for (const ref of refs) {
    const stream = pdf.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) throw new Error('page content is not a raw stream');
    out += new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
  }
  return out;
}

/** Split a content stream into the runs outside / inside marked content,
 *  reporting whether any painting operator sits outside a sequence. */
function unmarkedPainting(content: string): string[] {
  const painting = /^(?:Tj|TJ|f|f\*|B|B\*|b|b\*|S|s|Do|sh|EI)$/;
  const out: string[] = [];
  let depth = 0;
  for (const line of content.split('\n')) {
    const op = line.trim().split(' ').pop() ?? '';
    if (op === 'BDC' || op === 'BMC') depth++;
    else if (op === 'EMC') depth--;
    else if (painting.test(op) && depth === 0) out.push(line.trim());
  }
  return out;
}

let bytes: Uint8Array;
let pdf: PDFDocument;

beforeAll(async () => {
  const doc = buildDocument({ markdown, metadata: { title: 'Sample book', author: 'Ada' }, resources }, config);
  expect(doc.pages.length).toBeGreaterThan(1);
  bytes = await renderToPdf(doc, {
    fontProvider,
    resourceBytes: (fileId) => (fileId === 'f1.png' ? PNG : undefined),
  });
  const out = process.env.POSTEXT_A11Y_PDF_OUT;
  if (out) fs.writeFileSync(out, bytes);
  pdf = await PDFDocument.load(bytes);
}, 60_000);

describe('accessible (tagged) PDF output', () => {
  it('declares the document tagged, titled and in its language', () => {
    const markInfo = pdf.catalog.lookup(PDFName.of('MarkInfo'), PDFDict);
    expect(markInfo.get(PDFName.of('Marked'))?.toString()).toBe('true');
    expect(pdf.catalog.has(PDFName.of('StructTreeRoot'))).toBe(true);
    expect(textOf(pdf.catalog.get(PDFName.of('Lang')))).toBe('en-US');
    expect(pdf.getTitle()).toBe('Sample book');
    const prefs = pdf.catalog.lookup(PDFName.of('ViewerPreferences'), PDFDict);
    expect(prefs.get(PDFName.of('DisplayDocTitle'))?.toString()).toBe('true');
    const metadata = pdf.catalog.lookup(PDFName.of('Metadata'));
    if (!(metadata instanceof PDFRawStream)) throw new Error('metadata is not a raw stream');
    const xmp = new TextDecoder().decode(metadata.getContents());
    expect(xmp).toContain('<pdfuaid:part>1</pdfuaid:part>');
    expect(xmp).toContain('<rdf:li xml:lang="x-default">Sample book</rdf:li>');
    expect(xmp).toContain('<rdf:li>Ada</rdf:li>');
    expect(metadata.dict.has(PDFName.of('Filter'))).toBe(false);
  });

  it('gives every page a structure-parent key and structure tab order', () => {
    for (const page of pdf.getPages()) {
      expect(page.node.get(PDFName.of('StructParents'))).toBeInstanceOf(PDFNumber);
      expect(nameOf(page.node.get(PDFName.of('Tabs')))).toBe('S');
    }
  });

  it('marks every painting operator as content or artifact, properly nested', () => {
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const content = pageContent(pdf, i);
      expect(unmarkedPainting(content), `page ${i + 1}`).toEqual([]);
      const opens = (content.match(/\b(BDC|BMC)\n/g) ?? []).length;
      const closes = (content.match(/\bEMC\n/g) ?? []).length;
      expect(opens).toBe(closes);
      // Sequences never nest and never straddle the column clip: the `W n`
      // clip is always preceded by an `EMC` (or by nothing marked yet).
      expect(content).not.toMatch(/BDC\n(?:(?!EMC\n)[^])*?\bW\nn\n/);
    }
    const first = pageContent(pdf, 0);
    expect(first).toMatch(/\/Artifact <<\n\/Type \/Background\n>> BDC/);
    expect(first).toMatch(/\/Artifact <<\n\/Type \/Pagination\n\/Subtype \/Footer\n>> BDC/);
    expect(first).toMatch(/\/H1 <<\n\/MCID \d+\n>> BDC/);
    expect(first).toMatch(/\/P <<\n\/MCID \d+\n>> BDC/);
  });

  it('builds the reading-order structure tree', () => {
    const root = structRoot(pdf);
    expect(root.type).toBe('Document');
    const types: string[] = [];
    walk(root, (e) => types.push(e.type));
    // Heading levels never skip: the `###` after the `#` becomes H2.
    expect(types).toContain('H1');
    expect(types).toContain('H2');
    expect(types).not.toContain('H3');
    for (const t of ['P', 'L', 'LI', 'Lbl', 'LBody', 'BlockQuote', 'Figure', 'Caption', 'Table', 'TR', 'TH', 'TD', 'Link']) {
      expect(types, t).toContain(t);
    }
    // The document's top-level order: heading, paragraph(s), heading, …
    const top = root.kids.map((k) => k.type);
    expect(top[0]).toBe('H1');
    expect(top.filter((t) => t === 'L')).toHaveLength(2);
  });

  it('nests lists by depth and labels their bullets', () => {
    const root = structRoot(pdf);
    const lists: Elem[] = [];
    walk(root, (e) => { if (e.type === 'L') lists.push(e); });
    const outer = lists.find((l) => l.kids.length === 2 && l.attrs[0]?.ListNumbering === 'Disc')!;
    expect(outer).toBeDefined();
    const [first, second] = outer.kids;
    expect(first!.type).toBe('LI');
    expect(first!.kids.map((k) => k.type)).toEqual(['Lbl', 'LBody']);
    expect(first!.kids[0]!.mcids).toBeGreaterThan(0);
    const body = first!.kids[1]!;
    expect(body.mcids).toBeGreaterThan(0);
    expect(body.kids.map((k) => k.type)).toEqual(['L']);
    expect(body.kids[0]!.kids[0]!.kids.map((k) => k.type)).toEqual(['Lbl', 'LBody']);
    expect(second!.kids.map((k) => k.type)).toEqual(['Lbl', 'LBody']);
    const ordered = lists.find((l) => l.attrs[0]?.ListNumbering === 'Decimal')!;
    expect(ordered.kids).toHaveLength(2);
  });

  it('describes the figure and captions it', () => {
    const root = structRoot(pdf);
    let figure: Elem | undefined;
    walk(root, (e) => { if (e.type === 'Figure') figure = e; });
    expect(figure!.alt).toBe('A red square on white');
    expect(figure!.mcids).toBe(1);
    expect(figure!.attrs[0]?.O).toBe('Layout');
    expect(figure!.attrs[0]?.Placement).toBe('Block');
    expect(figure!.attrs[0]?.BBox).toBeDefined();
    const caption = figure!.kids.find((k) => k.type === 'Caption')!;
    expect(caption.mcids).toBeGreaterThan(0);
  });

  it('tags the table with header cells, scopes and a summary', () => {
    const root = structRoot(pdf);
    let table: Elem | undefined;
    walk(root, (e) => { if (e.type === 'Table') table = e; });
    expect(table!.attrs[0]).toEqual({ O: 'Table', Summary: 'Two sizes and their widths' });
    expect(table!.kids.map((k) => k.type)).toEqual(['TR', 'TR', 'TR', 'Caption']);
    const [head, ...body] = table!.kids.filter((k) => k.type === 'TR');
    expect(head!.kids.map((k) => k.type)).toEqual(['TH', 'TH']);
    expect(head!.kids[0]!.attrs[0]).toEqual({ O: 'Table', Scope: 'Column' });
    expect(head!.kids[0]!.mcids).toBeGreaterThan(0);
    for (const row of body) {
      expect(row.kids.map((k) => k.type)).toEqual(['TD', 'TD']);
      for (const cell of row.kids) expect(cell.mcids).toBeGreaterThan(0);
    }
  });

  it('wraps each reference in a Link element that owns its annotation', () => {
    const root = structRoot(pdf);
    const links: Elem[] = [];
    walk(root, (e) => { if (e.type === 'Link') links.push(e); });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.mcids).toBe(1);
      expect(link.objrs).toBe(1);
    }
    const annots = pdf.getPage(0).node.Annots()!.asArray().map((r) => pdf.context.lookup(r, PDFDict));
    expect(annots).toHaveLength(2);
    for (const annot of annots) {
      expect(annot.get(PDFName.of('StructParent'))).toBeInstanceOf(PDFNumber);
      // The ref text itself (`Fig. 1.1`, `Table 1.1`) describes the target.
      expect(textOf(annot.get(PDFName.of('Contents')))).toMatch(/\b1\.1$/);
    }
  });

  it('maps every marked-content id and annotation back through the parent tree', () => {
    const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const parentTree = root.lookup(PDFName.of('ParentTree'), PDFDict);
    const nums = parentTree.lookup(PDFName.of('Nums'), PDFArray).asArray();
    const keys = nums.filter((_, i) => i % 2 === 0).map((n) => (n as PDFNumber).asNumber());
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(root.get(PDFName.of('ParentTreeNextKey'))).toEqual(PDFNumber.of(keys.length));
    // Page 1: one owner per MCID used in its content stream.
    const pageKey = (pdf.getPage(0).node.get(PDFName.of('StructParents')) as PDFNumber).asNumber();
    const owners = pdf.context.lookup(nums[keys.indexOf(pageKey) * 2 + 1]!, PDFArray);
    const mcids = new Set([...pageContent(pdf, 0).matchAll(/\/MCID (\d+)/g)].map((m) => Number(m[1])));
    expect(owners.size()).toBe(mcids.size);
    for (const owner of owners.asArray()) expect(owner).toBeInstanceOf(PDFRef);
  });

  it('paints word spaces as glyphs so extraction needs no gap heuristics', () => {
    const content = pageContent(pdf, 0);
    // pdf-lib shows text as hex CIDs; a run made of the single space glyph
    // appears between the words of every justified line.
    const spaceRuns = content.match(/<[0-9a-f]{4}> Tj/g) ?? [];
    expect(spaceRuns.length).toBeGreaterThan(10);
  });

  it('keeps a split paragraph in one element across pages', () => {
    const root = structRoot(pdf);
    // The long paragraph runs over a page break: one P, several MCIDs, no
    // links to account for the extra sequences.
    const multiPage = root.kids.filter((k) => k.type === 'P' && k.kids.length === 0 && k.mcids >= 2);
    expect(multiPage.length).toBeGreaterThan(0);
  });

  it('can be switched off', async () => {
    const doc = buildDocument({ markdown: '# T\n\nText.' }, config);
    const plain = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
    expect(plain.catalog.has(PDFName.of('StructTreeRoot'))).toBe(false);
    expect(plain.catalog.has(PDFName.of('MarkInfo'))).toBe(false);
    expect(pageContent(plain, 0)).not.toContain('BDC');
  });

  it('falls back to the first heading as the title', async () => {
    const doc = buildDocument({ markdown: '# Untitled chapter\n\nText.' }, config);
    const out = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    expect(out.getTitle()).toBe('Untitled chapter');
  });
});

describe('XMP packet', () => {
  it('escapes markup in the title', () => {
    const xmp = buildXmp({ title: 'A <b> & "c"', producer: 'p', creatorTool: 'c' });
    expect(xmp).toContain('<rdf:li xml:lang="x-default">A &lt;b&gt; &amp; &quot;c&quot;</rdf:li>');
    expect(xmp).not.toContain('<dc:creator>');
  });
});
