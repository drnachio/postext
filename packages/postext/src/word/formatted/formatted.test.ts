import { describe, it, expect } from 'vitest';
import { strFromU8 } from 'fflate';
import type { PostextConfig, Resource, TableCell, VDTDocument } from '../../index.js';
import { documentDisplayList } from '../../paint/displayList/index.js';
import type { DisplayItem, DisplayPage } from '../../paint/displayList/types.js';
import { readExportMap } from '../anchors/exportMap.js';
import { validateDocxPackage } from '../ooxml/validate.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { parseXml, localName } from '../xml.js';
import { formattedDocx } from './index.js';
import { HOLDER } from './runs.js';
import { SLACK_PT } from './paragraphs.js';
import {
  ANCHOR_ORDER, bookmarkTexts, build, childNames, config, documentXml, els, inSchemaOrder, kids, LOREM, mm, pageBoxTexts,
  PPR_ORDER, RPR_ORDER, SECTPR_ORDER, TBLPR_ORDER, TCPR_ORDER, unzip, WSP_ORDER,
} from './formatted.test-helper.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
const DATE = '2026-11-04T00:00:00Z';
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

interface Built {
  doc: VDTDocument;
  pages: DisplayPage[];
  files: Record<string, Uint8Array>;
  xml: string;
  bytes: Uint8Array;
  warnings: string[];
}

async function exportOne(md: string, cfg: PostextConfig, resources?: Resource[]): Promise<Built> {
  const doc = build(md, cfg, resources);
  const warnings: string[] = [];
  const bytes = await formattedDocx({
    docs: [doc], chapters: [{ id: 'ch1', title: 'One', markdown: md }], ...(resources ? { resources } : {}),
    resourceBytes: () => PNG, date: DATE, exportId: 'test-export', onWarning: (w) => warnings.push(`${w.code}: ${w.message}`),
  });
  const files = unzip(bytes);
  return { doc, pages: documentDisplayList(doc), files, xml: documentXml(files), bytes, warnings };
}

const textItems = (page: DisplayPage): TextItem[] => page.items.filter((i): i is TextItem => i.kind === 'text');
const squash = (s: string): string => s.replace(/[\n⁠]/g, '').replace(/\t/g, ' ');

/** Package valid, one section per page, every page's boxes spell its
 *  text items' lines in order. */
function expectFaithful(b: Built): void {
  expect(validateDocxPackage(b.files)).toEqual([]);
  expect(xmlProblems(b.xml)).toEqual([]);
  const root = parseXml(b.xml);
  expect(els(root, 'sectPr').length).toBe(b.doc.pages.length);
  const boxes = pageBoxTexts(b.xml);
  expect(boxes.length).toBe(b.pages.length);
  b.pages.forEach((page, i) => {
    if (page.items.some((it) => it.kind === 'table')) return;
    const expected = textItems(page).map((t) => t.lines.map((l) => l.text).join('')).join('');
    expect(squash(boxes[i]!.join(''))).toBe(squash(expected));
  });
}

/** Map fragments: text as written in the bookmark, mapped characters are
 *  the source's own. */
function expectMap(b: Built, md: string, resources: Resource[] = []): number {
  const map = readExportMap(b.files)!;
  expect(map.variant).toBe('formatted');
  expect(map.exportId).toBe('test-export');
  expect(map.snapshot!.chapters[0]!.markdown).toBe(md);
  const marks = bookmarkTexts(b.xml);
  expect(marks.size).toBe(map.fragments.length);
  let checked = 0;
  for (const f of map.fragments) {
    expect(marks.get(`_ptx_${f.id}`)).toBe(f.text);
    expect(f.map.length).toBe(f.text.length);
    const atomAt = new Set((f.atoms ?? []).map((a) => a.at));
    const src = f.target.kind === 'markdown' ? md : f.target.kind === 'resource' ? (() => {
      const t = f.target;
      const r = resources.find((x) => x.id === t.resourceId)!;
      return t.field === 'cell' ? r.table!.model.rows[t.row!]![t.col!]!.content : ((r as unknown as Record<string, string>)[t.field] ?? '');
    })() : '';
    for (let i = 0; i < f.text.length; i++) {
      if (f.text[i] === '\n') expect(f.map[i]).toBe(-1);
      if (f.map[i]! < 0 || atomAt.has(i) || f.text[i] === HOLDER) continue;
      expect(src[f.map[i]!], `${f.id} ${JSON.stringify(f.text)}[${i}]`).toBe(f.text[i]);
      checked++;
    }
  }
  return checked;
}

function expectOrders(xml: string): void {
  const root = parseXml(xml);
  for (const p of els(root, 'pPr')) expect(inSchemaOrder(childNames(p), PPR_ORDER), childNames(p).join(',')).toBe(true);
  for (const r of els(root, 'rPr')) expect(inSchemaOrder(childNames(r), RPR_ORDER), childNames(r).join(',')).toBe(true);
  for (const s of els(root, 'sectPr')) expect(inSchemaOrder(childNames(s), SECTPR_ORDER), childNames(s).join(',')).toBe(true);
  for (const a of els(root, 'anchor')) expect(inSchemaOrder(childNames(a), ANCHOR_ORDER)).toBe(true);
  for (const w of els(root, 'wsp')) {
    expect(inSchemaOrder(childNames(w), WSP_ORDER)).toBe(true);
    expect(childNames(w).at(-1)).toBe('bodyPr');
    const body = kids(w).at(-1)!;
    if (childNames(w).includes('txbx')) {
      for (const k of ['lIns', 'tIns', 'rIns', 'bIns']) expect(body.attrs[k]).toBe('0');
      expect(childNames(body)).toEqual(['noAutofit']);
    }
  }
  for (const t of els(root, 'tcPr')) expect(inSchemaOrder(childNames(t), TCPR_ORDER)).toBe(true);
  for (const t of els(root, 'tblPr')) expect(inSchemaOrder(childNames(t), TBLPR_ORDER)).toBe(true);
}

describe('formattedDocx (#1392)', () => {
  it('sets a single justified column with hyphens, one section per page', async () => {
    const md = `# A heading\n\n${LOREM}\n\n${LOREM}\n\n${LOREM}\n\n${LOREM}\n\n${LOREM}`;
    const b = await exportOne(md, config());
    expect(b.doc.pages.length).toBeGreaterThan(1);
    expectFaithful(b);
    expectOrders(b.xml);
    expect(expectMap(b, md)).toBeGreaterThan(1500);
    // Exact page size, no margins.
    const pgSz = els(parseXml(b.xml), 'pgSz')[0]!;
    expect(pgSz.attrs['w:w']).toBe(String(Math.round((b.doc.pages[0]!.width * 1440) / 72)));
    expect(els(parseXml(b.xml), 'pgMar').every((m) => ['w:top', 'w:right', 'w:bottom', 'w:left', 'w:header', 'w:footer'].every((k) => m.attrs[k] === '0'))).toBe(true);
    // Every justified line ends in a break; an added hyphen is written.
    const map = readExportMap(b.files)!;
    const all = map.fragments.map((f) => f.text).join('');
    const lines = b.pages.flatMap((p) => textItems(p).flatMap((t) => t.lines));
    let hyphens = 0;
    for (const l of lines) {
      if (l.align === 'justify') expect(all.includes(`${l.text}\n`), l.text).toBe(true);
      if (l.addedHyphen) hyphens++;
    }
    expect(hyphens).toBeGreaterThan(0);
    expect(lines.filter((l) => l.align === 'justify').length).toBeGreaterThan(20);
    // Justified paragraphs, exact pitch, Word hyphenation off.
    const settings = strFromU8(b.files['word/settings.xml']!);
    expect(settings).toContain('<w:autoHyphenation w:val="false"/>');
    expect(settings).not.toContain('doNotExpandShiftReturn');
    expect(settings).toContain('enableOpenTypeFeatures');
    expect(b.xml).toContain('<w:jc w:val="both"/>');
    expect(b.xml).toMatch(/w:lineRule="exact"/);
  });

  it('places text boxes on the measure, first baseline on the engine\'s', async () => {
    const md = `${LOREM}\n\n${LOREM}`;
    const b = await exportOne(md, config());
    const root = parseXml(b.xml);
    const page0 = kids(els(root, 'body')[0]!)[0]!;
    const anchors = els(page0, 'anchor').filter((a) => els(a, 'txbxContent').length > 0);
    const items = textItems(b.pages[0]!);
    const first = items[0]!;
    const a = anchors[0]!;
    const posX = Number(els(a, 'posOffset')[0]!.children[0]);
    const posY = Number(els(a, 'posOffset')[1]!.children[0]);
    const cx = Number(els(a, 'extent')[0]!.attrs.cx);
    const emu = (px: number): number => Math.round((px * 914400) / 72);
    const L = Math.min(...first.lines.map((l) => l.x));
    const R = Math.max(...first.lines.map((l) => l.x + l.width));
    expect(Math.abs(posX - emu(L))).toBeLessThanOrEqual(1);
    expect(Math.abs(cx - emu(R - L + SLACK_PT))).toBeLessThanOrEqual(1);
    // Top = baseline − (pitch − descent), descent 0.2 em without metrics.
    const line = first.lines[0]!;
    const pitchTw = Math.round(((first.lines[1]!.baseline - line.baseline) * 1440) / 72);
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(line.runs[0]!.fontString)![1]);
    const top = line.baseline - ((pitchTw * 72) / 1440 - 0.2 * size);
    expect(Math.abs(posY - emu(top))).toBeLessThanOrEqual(1);
    expect(b.xml).toContain(`w:line="${pitchTw}" w:lineRule="exact"`);
    // Locked, unwrapped, stacked in order.
    const zs = anchors.map((x) => Number(x.attrs.relativeHeight));
    expect([...zs].sort((p, q) => p - q)).toEqual(zs);
    for (const x of anchors) {
      expect(x.attrs.locked).toBe('1');
      expect(childNames(x)).toContain('wrapNone');
      expect(els(x, 'positionH')[0]!.attrs.relativeFrom).toBe('page');
    }
  });

  it('sets two columns and a column-and-a-half page', async () => {
    const md = Array.from({ length: 6 }, () => LOREM).join('\n\n');
    const two = await exportOne(md, config({ layout: { layoutType: 'double' } } as Partial<PostextConfig>));
    expectFaithful(two);
    expectMap(two, md);
    const xs = new Set(els(parseXml(two.xml), 'positionH').map((p) => textOf0(p)));
    expect(xs.size).toBeGreaterThanOrEqual(2);
    // The column rule-free page still writes one anchor paragraph per page.
    const oneHalf = await exportOne(md, config({ layout: { layoutType: 'oneAndHalf' } } as Partial<PostextConfig>));
    expectFaithful(oneHalf);
    expectOrders(oneHalf.xml);
    expect(expectMap(oneHalf, md)).toBeGreaterThan(500);
  });

  it('gives footnotes their own boxes and fragments, and keeps parts in order', async () => {
    const md = `Text with a note[^a] in the middle of it.\n\n${LOREM}\n\n[^a]: The note says something.\n`;
    const b = await exportOne(md, config());
    expectFaithful(b);
    expectMap(b, md);
    const map = readExportMap(b.files)!;
    const note = map.fragments.find((f) => f.block === 'c0:fna')!;
    expect(note.role).toBe('footnote');
    expect(note.text).toContain('The note says');
    const body = map.fragments.find((f) => f.atoms?.some((a) => a.kind === 'footnote'))!;
    const atom = body.atoms!.find((a) => a.kind === 'footnote')!;
    expect(md.slice(atom.start, atom.end)).toBe('[^a]');
    // The note marker is raised (position or superscript).
    expect(b.xml).toMatch(/<w:position w:val="\d+"\/>|w:vertAlign w:val="superscript"/);
    // The footnote rule is a line shape.
    expect(b.xml).toContain('prst="line"');
  });

  it('places a figure, its caption mapped into the resource', async () => {
    const md = `See the plate :ref{id="f1"} below.\n\n${LOREM}`;
    const res = [{
      id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'A *small* plate of type.', altText: 'Type', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'f1.png', format: 'png', width: 300, height: 200 },
    } as Resource];
    const b = await exportOne(md, config(), res);
    expectFaithful(b);
    expectOrders(b.xml);
    expect(expectMap(b, md, res)).toBeGreaterThan(100);
    expect(b.xml).toContain('<pic:pic>');
    expect(b.xml).toContain('descr="Type"');
    expect(Object.keys(b.files).some((p) => /^word\/media\/image\d+\.png$/.test(p))).toBe(true);
    const map = readExportMap(b.files)!;
    const caption = map.fragments.find((f) => f.target.kind === 'resource')!;
    expect(caption.target).toEqual({ kind: 'resource', resourceId: 'f1', field: 'caption' });
    expect(caption.map[0]).toBe(-1);
    expect(map.snapshot!.resources).toHaveProperty('f1');
  });

  it('writes a table as a fixed-layout Word table in a text box', async () => {
    const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
    const res = [{
      id: 't1', typeId: 'table', kind: 'table', caption: 'Services and benefits.', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[cell('Item', { isHeader: true }), cell('Grade', { isHeader: true })], ...Array.from({ length: 3 }, (_, i) => [cell(`Item ${i}`), cell('Yes')])] } },
    } as unknown as Resource];
    const md = `The table :ref{id="t1"} follows.\n\n${LOREM}`;
    const b = await exportOne(md, config(), res);
    expect(validateDocxPackage(b.files)).toEqual([]);
    expectOrders(b.xml);
    expectMap(b, md, res);
    const tbl = els(parseXml(b.xml), 'tbl')[0]!;
    expect(els(tbl, 'tblLayout')[0]!.attrs['w:type']).toBe('fixed');
    expect(els(tbl, 'gridCol').length).toBeGreaterThanOrEqual(2);
    expect(els(tbl, 'tr').length).toBeGreaterThanOrEqual(4);
    for (const h of els(tbl, 'trHeight')) expect(h.attrs['w:hRule']).toBe('exact');
    const map = readExportMap(b.files)!;
    const cells = map.fragments.filter((f) => f.target.kind === 'resource' && f.target.field === 'cell');
    expect(cells.map((f) => f.text)).toEqual(expect.arrayContaining(['Item', 'Grade', 'Item 0', 'Yes']));
  });

  it('sets a right-to-left page with bidi paragraphs', async () => {
    const md = 'هذا نص عربي قصير لتجربة الصفحة من اليمين إلى اليسار في المحرك مع كلمات كثيرة تملأ عدة أسطر من العمود الواحد.\n\nفقرة ثانية قصيرة.';
    const b = await exportOne(md, config({ locale: 'ar', direction: 'rtl', bodyText: { textAlign: 'justify', firstLineIndent: mm(0) } } as Partial<PostextConfig>));
    expectFaithful(b);
    expectOrders(b.xml);
    expectMap(b, md);
    expect(b.xml).toContain('<w:bidi/>');
    expect(b.xml).toContain('<w:rtl/>');
    expect(b.xml).toContain('w:bidi="ar"');
  });

  it('is deterministic with a fixed date and reports progress', async () => {
    const md = `${LOREM}\n\n${LOREM}`;
    const doc = build(md, config());
    const progress: number[] = [];
    const run = () => formattedDocx({ docs: [doc], chapters: [{ id: 'a', markdown: md }], date: DATE, onProgress: (d) => progress.push(d) });
    const x = await run();
    const y = await run();
    expect(x).toEqual(y);
    expect(progress.slice(0, doc.pages.length)).toEqual(doc.pages.map((_, i) => i + 1));
    const custom = strFromU8(unzip(x)['docProps/custom.xml']!);
    expect(custom).toContain('postext.variant');
    expect(custom).toContain('formatted');
  });

  it('exports a book: chapters in order, fragments pointing at their own chapter', async () => {
    const a = `# One\n\n${LOREM}`;
    const c = `# Two\n\n${LOREM.replace('Typesetting', 'Composition')}`;
    const docs = [build(a, config()), build(c, config())];
    const bytes = await formattedDocx({ docs, chapters: [{ id: 'a', markdown: a }, { id: 'b', markdown: c }], date: DATE });
    const files = unzip(bytes);
    expect(validateDocxPackage(files)).toEqual([]);
    expect(els(parseXml(documentXml(files)), 'sectPr').length).toBe(docs[0]!.pages.length + docs[1]!.pages.length);
    const map = readExportMap(files)!;
    expect(map.chapters.map((ch) => ch.id)).toEqual(['a', 'b']);
    for (const f of map.fragments) {
      if (f.target.kind !== 'markdown') continue;
      const src = f.target.chapter === 0 ? a : c;
      f.map.forEach((m, i) => { if (m >= 0 && f.text[i] !== HOLDER && !(f.atoms ?? []).some((at) => at.at === i)) expect(src[m]).toBe(f.text[i]); });
    }
    expect(map.fragments.some((f) => f.target.kind === 'markdown' && f.target.chapter === 1)).toBe(true);
  });
});

function textOf0(el: { children: unknown[] }): string {
  const off = (el.children as { name?: string; children: unknown[] }[]).find((c) => typeof c !== 'string' && localName(c.name ?? '') === 'posOffset');
  return off ? String(off.children[0]) : '';
}
