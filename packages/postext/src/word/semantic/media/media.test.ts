// Composed-page frames, figure words, code listings and columns in a box in
// the semantic .docx (#1444, round three): each set as print shows it, and
// an unedited export reading back into the exact Markdown.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const at = { createdAt: 0, updatedAt: 0 };
const pic = (id: string, extra: Partial<Resource> = {}): Resource => ({ id, typeId: 'figure', kind: 'bitmap', ...at, bitmap: { fileId: 'f1', format: 'png', width: 2000, height: 1000 }, ...extra });
const bytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

/** Unzip, change the document part, zip again. */
function edit(b: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(b);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

/** Read an export back: no edits, the same Markdown. */
function readsBack(b: Uint8Array, md: string, resources?: Resource[]): void {
  const same = applyDocxEdits(b, { chapters: [{ id: 'ch1', markdown: md }], ...(resources ? { resources } : {}) });
  expect(same.edits).toEqual([]);
  expect(same.chapters[0]!.markdown).toBe(md);
}

describe('semantic docx: composed-page frames', () => {
  const config = {
    colorPalette: [{ id: 'tint', name: 'Tint', value: hex('#e1f0fa') }],
    calloutStyles: [
      { id: 'card', background: { ...hex('#e1f0fa'), paletteId: 'tint' }, label: { position: 'top-left', background: hex('#1b6aa0'), color: hex('#ffffff') } },
      { id: 'mat', background: hex('#ffffff') },
    ],
    pageTemplates: [
      {
        id: 'sheet',
        palette: 'tint=#fcefd2',
        decoration: { elements: [{ kind: 'text', id: 'n', content: '{headingNumber}', placement: { anchor: { to: '#title', edge: 'top-left' } } }] },
        frames: [
          { name: 'title', takes: 'h1' },
          { name: 'text', flow: true },
          { name: 'card', style: 'card' },
          { name: 'photo', style: 'mat', layer: 2, width: { value: 40, unit: 'mm' }, placement: { anchor: { to: '#card', edge: 'top-right' } } },
        ],
        groups: [{ name: 'qs', modules: true }],
      },
      {
        id: 'q',
        role: 'module',
        frames: [
          { name: 'box', style: 'card' },
          { name: 'lines', optional: true, height: { value: 24, unit: 'mm' }, rules: { every: { value: 8, unit: 'mm' }, color: hex('#7e98ab') } },
        ],
      },
    ],
  } as unknown as PostextConfig;
  const md =
    '# River\n\n::::page{template="sheet"}\n# Where it starts\n\nText.\n\n' +
    ':::frame{slot="card" label="Try it"}\nSqueeze a sponge.\n:::\n\n' +
    ':::figure{resource="p1" slot="photo"}\n::alt[A sponge.]\n:::\n\n' +
    ':::module{template="q"}\n:::frame{slot="box" label="Think 1"}\nWhere does it start?\n:::\n:::\n::::\n';

  it('draws a frame in its box style, with its label, the answer lines and the photo set over it', async () => {
    const e = await exportDocx(md, { config, resources: [pic('p1')], resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const card = e.doc.slice(e.doc.indexOf('ptx:frame:card'));
    // A shaded one-cell table, in the page's own tint, its label first.
    expect(card).toMatch(/^[^]*?<w:tbl>[^]*?w:fill="FCEFD2"/);
    expect(e.frag('Try it').role).toBe('attr:frame:label');
    // The photo the template sets over the card is inside it (after the
    // label's own plate, a table of its own).
    const cardEnd = card.indexOf('</w:tbl>', card.indexOf('</w:tbl>') + 1);
    expect(card.indexOf('name="p1"')).toBeGreaterThan(0);
    expect(card.indexOf('name="p1"')).toBeLessThan(cardEnd);
    // The module's empty ruled frame: three rows of 8 mm, ruled.
    const module = e.doc.slice(e.doc.indexOf('ptx:module:q'));
    expect((module.match(/<w:trHeight w:val="\d+" w:hRule="exact"\/>/g) ?? []).length).toBe(3);
    expect(module).toContain('w:insideH w:val="single" w:sz="4" w:space="0" w:color="7E98AB"');
    // The badge's number goes before the title the frame takes.
    expect(e.frag('2 ').role).toBe('number');
    readsBack(e.bytes, md);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('Squeeze a sponge.', 'Squeeze a wet sponge.')), { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('Squeeze a sponge.', 'Squeeze a wet sponge.'));
  });
});

describe('semantic docx: figure words', () => {
  const config = { captionStyle: { descriptionItalic: true, note: { fontSize: { value: 7, unit: 'pt' }, color: hex('#6b6259') } } } as unknown as PostextConfig;
  const md = 'Before.\n\n:::figure{resource="map"}\n::caption[The valley.]\n::note[Drawn for the book.]\n::label[White Range]{at="40% 10%"}\n::label[Sea]{at="90% 60%"}\n:::\n\nAfter.\n';

  it('keeps a map label line, an italic caption and a small grey note, and room after', async () => {
    const e = await exportDocx(md, { config, resources: [pic('map')], resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag('White Range').role).toBe('figure:label');
    expect(e.frag('Sea').target).toEqual({ kind: 'markdown', chapter: 0 });
    expect(e.frag(' · ').target).toEqual({ kind: 'generated' });
    const styles = e.part('word/styles.xml');
    expect(styles).toMatch(/w:styleId="PostextCaptionitalic"[^]*?<w:i\/>/);
    expect(styles).toMatch(/w:styleId="PostextCaptionnote"[^]*?<w:color w:val="6B6259"\/>[^]*?<w:sz w:val="14"\/>/);
    // The label stays upright beside an italic description.
    expect(e.doc).toMatch(/<w:i w:val="0"\/>(?:(?!<\/w:r>)[^])*<w:t[^>]*>Figure/);
    // An empty paragraph a body line tall after the figure.
    expect(e.doc.slice(e.doc.indexOf('Drawn for the book.'))).toMatch(/^[^]*?<\/w:sdtContent><\/w:sdt><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="\d+" w:lineRule="exact"\/>/);
    readsBack(e.bytes, md, [pic('map')]);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('>Sea<', '>Open sea<')), { chapters: [{ id: 'ch1', markdown: md }], resources: [pic('map')] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('::label[Sea]', '::label[Open sea]'));
  });

  it('sets a side-column figure at the side column width, a page-wide one across the page', async () => {
    const cfg = { layout: { layoutType: 'oneAndHalf', sideColumnPercent: 30, sideColumnRole: 'floats' } } as unknown as PostextConfig;
    const side = pic('s1', { placement: { span: 'side' } });
    const main = pic('m1');
    const md2 = '::resource{id="s1"}\n\n::resource{id="m1"}\n';
    const e = await exportDocx(md2, { config: cfg, resources: [side, main], resourceBytes: bytes });
    const width = (id: string): number => Number(new RegExp(`<wp:extent cx="(\\d+)" cy="\\d+"/><wp:effectExtent[^>]*/><wp:docPr id="\\d+" name="${id}"`).exec(e.doc)![1]);
    expect(width('s1')).toBeLessThan(width('m1') * 0.6);
  });
});

describe('semantic docx: code listings', () => {
  const md = 'Before.\n\n```js {title="chapter.js" lineNumbers highlight="2"}\nconst a = 1;\nconst b = 2;\n\nexport { a, b };\n```\n\nAfter.\n';

  it('writes the title, a number before each line and a tint on a highlighted one', async () => {
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag('chapter.js').role).toBe('attr:code:title');
    expect(e.map.fragments.filter((f) => f.role === 'code:number').map((f) => f.text.trim())).toEqual(['1', '2', '3', '4']);
    expect(e.frag('const b = 2;').target).toEqual({ kind: 'markdown', chapter: 0 });
    expect(e.doc).toMatch(/<w:shd w:val="clear" w:color="auto" w:fill="[0-9A-F]{6}"\/>(?:(?!<\/w:p>)[^])*const b = 2;/);
    // The numbers keep a column of their own: each numbered line hangs by
    // the number's width, and a tab after the number reaches the code, so
    // a wrapped line starts under the code, not under its number.
    const lines = e.doc.split('<w:p>').filter((p) => p.includes('const a = 1;') || p.includes('export { a, b };'));
    expect(lines).toHaveLength(2);
    for (const p of lines) {
      const m = /<w:ind w:left="(\d+)" w:hanging="(\d+)"\/>/.exec(p);
      expect(m && Number(m[1]) > 0 && m[1] === m[2]).toBe(true);
      expect(p).toContain('<w:tab/>');
    }
    readsBack(e.bytes, md);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('const b = 2;', 'const b = 3;').replace('>chapter.js<', '>book.js<')), { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('const b = 2;', 'const b = 3;').replace('chapter.js', 'book.js'));
  });

  it('leaves a plain listing as one paragraph', async () => {
    const plain = '```js\nconst a = 1;\n```\n';
    const e = await exportDocx(plain);
    expect(e.doc).not.toContain('ptx:code');
  });
});

describe('semantic docx: columns in a box', () => {
  it('sets each column in a cell of its own, split where the fence says', async () => {
    const md = ':::callout{title="In brief"}\n:::columns{count=3}\n**8** features\n\n**2** observatories\n\n**18** images\n:::\n:::\n\n:::callout\n:::columns{count=2 breaks="3"}\nOne.\n\nTwo.\n\nThree.\n:::\n:::\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const tables = e.doc.split('<w:tag w:val="ptx:columns"/>').slice(1).map((s) => s.slice(0, s.indexOf('</w:tbl>')));
    expect(tables.map((t) => (t.match(/<w:tc>/g) ?? []).length)).toEqual([3, 2]);
    // `breaks="3"`: the third paragraph opens the second column.
    expect(tables[1]!.indexOf('Two.')).toBeLessThan(tables[1]!.indexOf('</w:tc>'));
    expect(tables[1]!.indexOf('Three.')).toBeGreaterThan(tables[1]!.indexOf('</w:tc>'));
    readsBack(e.bytes, md);
  });
});
