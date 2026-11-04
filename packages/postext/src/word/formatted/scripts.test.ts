// The formatted Word export beyond Latin running text (#1394): Arabic set
// right to left with kashida, vertical Japanese with ruby, tate-chu-yoko,
// warichu and kanbun marks, a composed page with a turned frame on a
// layer of its own, and a comic page (panel art, lettered balloons).

import { describe, it, expect } from 'vitest';
import type { PostextConfig, Resource } from '../../index.js';
import { documentDisplayList } from '../../paint/displayList/index.js';
import type { DisplayItem, DisplayPage } from '../../paint/displayList/types.js';
import { readExportMap } from '../anchors/exportMap.js';
import { validateDocxPackage } from '../ooxml/validate.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { parseXml, localName, type XmlElement } from '../xml.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { formattedDocx } from './index.js';
import { HOLDER } from './runs.js';
import { bookmarkTexts, build, childNames, config, documentXml, els, inSchemaOrder, kids, mm, pageBoxTexts, RPR_ORDER, unzip } from './formatted.test-helper.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
const DATE = '2026-11-04T00:00:00Z';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function exportDoc(md: string, cfg: PostextConfig, resources?: Resource[]) {
  const doc = build(md, cfg, resources);
  const warnings: string[] = [];
  const bytes = await formattedDocx({
    docs: [doc], chapters: [{ id: 'c', markdown: md }], ...(resources ? { resources } : {}),
    resourceBytes: () => PNG, date: DATE, exportId: 'x', onWarning: (w) => warnings.push(w.code),
  });
  const files = unzip(bytes);
  const xml = documentXml(files);
  expect(validateDocxPackage(files)).toEqual([]);
  expect(xmlProblems(xml)).toEqual([]);
  for (const r of els(parseXml(xml), 'rPr')) expect(inSchemaOrder(childNames(r), RPR_ORDER), childNames(r).join(',')).toBe(true);
  return { bytes, doc, pages: documentDisplayList(doc), files, xml, root: parseXml(xml), warnings, map: readExportMap(files)! };
}

/** Bookmarks hold the fragment text; mapped characters (atoms aside) are
 *  the source's own. Returns how many were checked. */
/** An unedited export reads back with no edit. */
function expectUnedited(b: Awaited<ReturnType<typeof exportDoc>>, md: string): void {
  const r = applyDocxEdits(b.bytes, { chapters: [{ id: 'c', markdown: md }] });
  expect(r.edits).toEqual([]);
  expect(r.chapters[0]!.markdown).toBe(md);
}

function expectMapped(b: Awaited<ReturnType<typeof exportDoc>>, md: string): number {
  const marks = bookmarkTexts(b.xml);
  expect(marks.size).toBe(b.map.fragments.length);
  let checked = 0;
  for (const f of b.map.fragments) {
    expect(marks.get(`_ptx_${f.id}`)).toBe(f.text);
    expect(f.map.length).toBe(f.text.length);
    const atom = new Set<number>();
    for (const a of f.atoms ?? []) for (let k = a.at; k < f.text.length && (k === a.at || f.map[k] === a.start); k++) atom.add(k);
    f.map.forEach((off, i) => {
      if (off < 0 || atom.has(i) || f.text[i] === HOLDER) return;
      expect(md[off], `${JSON.stringify(f.text)}[${i}]`).toBe(f.text[i]);
      checked++;
    });
  }
  return checked;
}

const textOf = (el: XmlElement): string => els(el, 't').map((t) => t.children.filter((c): c is string => typeof c === 'string').join('')).join('');
const textItems = (page: DisplayPage): TextItem[] => page.items.filter((i): i is TextItem => i.kind === 'text');
/** Text runs (`w:r` with `w:t` children, not a drawing's run). */
const textRuns = (root: XmlElement): XmlElement[] => els(root, 'r').filter((r) => kids(r).some((k) => localName(k.name) === 't'));
const docPrNames = (root: XmlElement): string[] => els(root, 'docPr').map((d) => d.attrs.name!.replace(/ \d+$/, ''));

describe('formatted Word export: Arabic, vertical CJK, composed and comic pages (#1394)', () => {
  it('sets Arabic right to left in logical order, with the engine\'s kashida mapped to nothing', async () => {
    const ar = 'قال AAA إن كلمة يهتم مسعد كتاب جميلة وكانت المدينة عامرة بالناس والكتب والعلماء في كل زمان ومكان وفي كل بلد.';
    const md = `${ar}\n\n${ar}`;
    const b = await exportDoc(md, config({ locale: 'ar', direction: 'rtl', bodyText: { textAlign: 'justify', firstLineIndent: mm(0), kashida: 'auto', fontSize: pt(20) } } as Partial<PostextConfig>));
    const inserted = b.doc.blocks.flatMap((bl) => bl.lines).flatMap((l) => l.segments ?? []).reduce((n, s) => n + (s.kashida?.length ?? 0), 0);
    expect(inserted).toBeGreaterThan(0);
    expect(expectMapped(b, md)).toBeGreaterThan(150);
    expectUnedited(b, md);
    // The tatweels the engine inserted are written, each mapped -1; the
    // fragment text without them reads as the source.
    const all = b.map.fragments.map((f) => f.text).join('');
    const synthetic = b.map.fragments.reduce((n, f) => n + [...f.text].filter((c, i) => c === 'ـ' && f.map[i] === -1).length, 0);
    expect(synthetic).toBe(inserted);
    expect(all.replace(/ـ/g, '').replace(/\n/g, ' ')).toContain('مسعد');
    // Lines in logical order: each box's paragraphs spell the lines as the
    // engine stores them (Word lays a bidi paragraph right to left itself).
    const boxes = pageBoxTexts(b.xml);
    b.pages.forEach((page, i) => {
      const expected = textItems(page).map((t) => t.lines.map((l) => l.text).join('')).join('');
      expect(boxes[i]!.join('').replace(/\n/g, '')).toBe(expected);
    });
    // Bidi paragraphs, right-to-left runs; the Latin word stays left to right.
    const paras = els(b.root, 'txbxContent').flatMap((t) => kids(t));
    expect(paras.every((p) => els(p, 'bidi').length === 1)).toBe(true);
    const runs = textRuns(b.root);
    const latin = runs.find((r) => textOf(r).includes('AAA'))!;
    expect(els(latin, 'rtl')).toHaveLength(0);
    const arabic = runs.find((r) => textOf(r).includes('مسعد'))!;
    expect(els(arabic, 'rtl')).toHaveLength(1);
    expect(els(arabic, 'lang')[0]!.attrs['w:bidi']).toBe('ar');
  });

  it('sets vertical Japanese in eaVert boxes with ruby, tate-chu-yoko, warichu and kanbun marks', async () => {
    const md = '吾輩は{猫|ねこ}である。名前はまだ無い。:tcy[12]月:ruby[東京]{rt="とう きょう" group}にて生れた。どこで生れたかとんと見当がつかぬ。:warichu[甲乙丙丁]何でも薄暗いじめじめした所で泣いていた事だけは記憶している。子曰、:kunten[學]{okuri="ビテ"}而:kunten[習]{kaeri="レ" okuri="フ"}之。';
    const b = await exportDoc(md, {
      ...config(), locale: 'ja',
      page: { dpi: 72, width: pt(215), height: pt(240), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
    } as PostextConfig);
    expect(expectMapped(b, md)).toBeGreaterThan(60);
    expectUnedited(b, md);
    // Body boxes are East Asian vertical, unturned, taller than wide.
    const body = els(b.root, 'wsp').filter((w) => els(w, 'txbx').length > 0 && els(w, 'pStyle').some((s) => s.attrs['w:val'] === 'PostextBody'));
    expect(body.length).toBeGreaterThan(0);
    for (const w of body) {
      expect(els(w, 'bodyPr')[0]!.attrs.vert).toBe('eaVert');
      expect(els(w, 'xfrm')[0]!.attrs.rot).toBeUndefined();
      const ext = els(w, 'ext').find((e) => e.attrs.cx !== undefined)!;
      expect(Number(ext.attrs.cy)).toBeGreaterThan(Number(ext.attrs.cx));
    }
    // Ruby: reading over its base, sizes in half-points, in schema order.
    const rubies = els(b.root, 'ruby');
    expect(rubies.map((r) => textOf(els(r, 'rubyBase')[0]!))).toEqual(['猫', '東京']);
    expect(rubies.map((r) => textOf(els(r, 'rt')[0]!))).toEqual(['ねこ', 'とう きょう']);
    for (const r of rubies) {
      expect(childNames(r)).toEqual(['rubyPr', 'rt', 'rubyBase']);
      expect(childNames(els(r, 'rubyPr')[0]!)).toEqual(['rubyAlign', 'hps', 'hpsRaise', 'hpsBaseText', 'lid']);
    }
    expect(els(rubies[1]!, 'rubyAlign')[0]!.attrs['w:val']).toBe('distributeSpace');
    // Tate-chu-yoko and two lines in one.
    const layouts = els(b.root, 'eastAsianLayout');
    const tcy = layouts.find((l) => l.attrs['w:vert'] === '1')!;
    expect(textOf(textRuns(b.root).find((r) => els(r, 'eastAsianLayout').includes(tcy))!)).toBe('12');
    const combine = layouts.find((l) => l.attrs['w:combine'] === '1')!;
    expect(textOf(textRuns(b.root).find((r) => els(r, 'eastAsianLayout').includes(combine))!)).toBe('甲乙丙丁');
    // Kanbun marks: small vertical boxes outside every bookmark.
    const marks = els(b.root, 'anchor').filter((a) => els(a, 'docPr')[0]!.attrs.name!.startsWith('ptx mark'));
    expect(marks.map((m) => textOf(m)).sort()).toEqual(['ビテ', 'フ', 'レ']);
    for (const m of marks) expect(els(m, 'bodyPr')[0]!.attrs.vert).toBe('eaVert');
    expect(b.map.fragments.map((f) => f.text).join('')).not.toContain('ビテ');
    // Word's own CJK spacing is off, the engine's kept.
    for (const p of els(b.root, 'pPr').filter((p) => els(p, 'pStyle').some((s) => s.attrs['w:val'] !== 'PostextAnchor'))) {
      expect(els(p, 'autoSpaceDE')[0]?.attrs['w:val']).toBe('0');
      expect(els(p, 'autoSpaceDN')[0]?.attrs['w:val']).toBe('0');
    }
  });

  it('writes boxes as empty text boxes that read back with no edit (#1406)', async () => {
    const md = `Before the box.\n\n:::callout{type="note"}\nBoxed text inside a note, a few words long.\n:::\n\nAfter the box.`;
    const b = await exportDoc(md, config());
    expectUnedited(b, md);
    const shapes = els(b.root, 'anchor').filter((a) => /^ptx (box|rule|path)/.test(els(a, 'docPr')[0]!.attrs.name!));
    expect(shapes.length).toBeGreaterThan(0);
    for (const a of shapes) {
      const wsp = els(a, 'wsp')[0]!;
      expect(childNames(wsp)).toEqual(['cNvSpPr', 'spPr', 'txbx', 'bodyPr']);
      expect(els(wsp, 'cNvSpPr')[0]!.attrs.txBox).toBe('1');
      expect(childNames(els(wsp, 'txbxContent')[0]!)).toEqual(['p']);
      expect(textOf(wsp)).toBe('');
      expect(els(wsp, 'noAutofit')).toHaveLength(1);
    }
  });

  it('places a composed page\'s turned frame by its layer', async () => {
    const md = '::::page{template="sheet"}\nMain text of the page set in the flow frame.\n\n:::frame{slot="side"}\nSide text turned with its frame, a few words long.\n:::\n::::\n';
    const b = await exportDoc(md, {
      ...config(),
      pageTemplates: [{ id: 'sheet', frames: [
        { name: 'side', layer: 2, rotate: 12, width: pt(120), height: pt(120), placement: { anchor: { to: 'container', edge: 'top-right' } } },
        { name: 'main', flow: true, width: pt(200), height: pt(200), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      ] }],
    } as PostextConfig);
    expect(expectMapped(b, md)).toBeGreaterThan(60);
    const boxes = els(b.root, 'anchor').filter((a) => els(a, 'txbx').length > 0);
    const turned = boxes.filter((a) => els(a, 'xfrm')[0]!.attrs.rot === String(12 * 60000));
    expect(turned.length).toBeGreaterThan(0);
    expect(turned.map((a) => textOf(a)).join(' ')).toContain('Side text');
    // The higher layer stacks over the flow frame.
    const flat = boxes.find((a) => textOf(a).includes('Main text'))!;
    expect(Number(turned[0]!.attrs.relativeHeight)).toBeGreaterThan(Number(flat.attrs.relativeHeight));
  });

  it('writes a comic page as cropped panel art, balloon outlines and lettered text boxes', async () => {
    const picture = (id: string, width: number, height: number, extra: Partial<Resource> = {}): Resource =>
      ({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: `file-${id}`, format: 'png', width, height }, ...extra }) as Resource;
    const resources = [picture('p1-wide', 3000, 1000, { safeArea: { x: 0.3, y: 0, width: 0.4, height: 1 } }), picture('p1-door', 1000, 1500)];
    const md = '# Chapter\n\nSome text.\n\n:::page{split="40 / *" gutter=4mm}\n::panel{art=p1-wide}\ncaption: Lyon, 1943.\nana: Did you hear that?\n::panel{art=p1-door}\nsfx{rotate=-8}: KRAK\n:::\n\nAfter.\n';
    const b = await exportDoc(md, { ...config(), page: { sizePreset: '17x24', dpi: 72 } } as PostextConfig, resources);
    expect(b.doc.pages.some((p) => p.comic)).toBe(true);
    expectMapped(b, md);
    // Panel art: both pictures, cropped to their panels.
    const pics = els(b.root, 'pic');
    expect(pics).toHaveLength(2);
    expect(pics.every((p) => els(p, 'srcRect').length === 1)).toBe(true);
    // Paint order on the comic page: art, then balloon outlines, then text.
    const page = kids(els(b.root, 'body')[0]!).filter((p) => localName(p.name) === 'p').find((p) => els(p, 'pic').length > 0)!;
    const names = docPrNames(page);
    // (Panel: background, art, border; then per balloon group the
    // outline strokes, the fills, the lettering.)
    expect(names.slice(0, 6)).toEqual(['ptx path', 'ptx picture', 'ptx path', 'ptx path', 'ptx picture', 'ptx path']);
    expect(names.slice(6, 9)).toEqual(['ptx path', 'ptx path', 'ptx balloon']);
    // Balloon lettering maps to the script lines; the sound effect turns.
    const balloons = b.map.fragments.filter((f) => f.role === 'balloon');
    expect(balloons.map((f) => f.text.replace(/\n/g, ' '))).toEqual(expect.arrayContaining(['Lyon, 1943.', 'Did you hear that?', 'KRAK']));
    const krak = els(page, 'anchor').find((a) => textOf(a) === 'KRAK')!;
    expect(els(krak, 'xfrm')[0]!.attrs.rot).toBe(String(-8 * 60000));
  });
});
