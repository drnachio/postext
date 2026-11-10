import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { readDocx } from '../docxRead.js';
import { parseXml, descendants, attr, child, children } from '../xml.js';
import { bookmarkEndXml, bookmarkName, bookmarkStartXml, newFragmentId } from '../anchors/bookmarks.js';
import { readExportMap } from '../anchors/exportMap.js';
import type { ExportMap } from '../anchors/types.js';
import { createDocxPackage } from './package.js';
import { fontKeyFor, obfuscateFont } from './fonts.js';
import { validateDocxPackage } from './validate.js';
import type { DocxPackageInput, EmbeddedFontFace } from './types.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const TTF = new Uint8Array(96).map((_, i) => (i * 37 + 11) & 0xff);

const exportMap: ExportMap = {
  version: 1,
  exportId: 'exp-123',
  variant: 'semantic',
  engine: '1.67.0',
  createdAt: '2026-11-04T00:00:00Z',
  chapters: [{ id: 'ch1', title: 'Uno', hash: 'abc' }],
  fragments: [
    {
      id: newFragmentId(0),
      block: 'b0',
      part: 0,
      target: { kind: 'markdown', chapter: 0 },
      text: 'Hola mundo',
      map: [2, 3, 4, 5, 6, -1, 8, 9, 10, 11],
      formats: [{ start: 0, end: 4, flags: 'b' }],
      range: [2, 12],
      role: 'body',
    },
  ],
  snapshot: { chapters: [{ id: 'ch1', markdown: '# Hola mundo' }] },
};

function build(extra: Partial<DocxPackageInput> = {}): { bytes: Uint8Array; files: Record<string, Uint8Array> } {
  const pkg = createDocxPackage();
  const img = pkg.addMedia(PNG, 'png');
  expect(pkg.addMedia(PNG.slice(), 'png')).toBe(img);
  const link = pkg.addLink('https://postext.dev/?a=1&b=2');
  expect(pkg.addLink('https://postext.dev/?a=1&b=2')).toBe(link);
  const hdr = pkg.headerRel('default');
  const ftr = pkg.footerRel('default');
  const bm = pkg.nextBookmarkId();
  const docPr = pkg.nextDrawingId();
  const name = bookmarkName(exportMap.fragments[0]!.id);
  const body =
    `<w:p>${bookmarkStartXml(bm, name)}<w:r><w:t>Hola</w:t></w:r><w:hyperlink r:id="${link}"><w:r><w:t xml:space="preserve"> mundo</w:t></w:r></w:hyperlink>` +
    `<w:r><w:footnoteReference w:id="1"/></w:r>${bookmarkEndXml(bm)}</w:p>` +
    `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="${docPr}" name="Picture ${docPr}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPr}" name="p"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${img}"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
    `<w:sectPr><w:headerReference w:type="default" r:id="${hdr}"/><w:footerReference w:type="default" r:id="${ftr}"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`;
  const fonts: EmbeddedFontFace[] = [
    { family: 'Lora Postext', slot: 'regular', bytes: TTF, panose: '02000503000000000000', charset: '00', familyClass: 'roman' },
    { family: 'Lora Postext', slot: 'bold', bytes: TTF.map((b) => b ^ 1) },
  ];
  const bytes = pkg.build({
    body,
    styles: '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
    docDefaults: '<w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault>',
    numbering: '',
    footnotes: ['<w:footnote w:id="1"><w:p><w:r><w:t>Nota</w:t></w:r></w:p></w:footnote>'],
    endnotes: [],
    headers: { default: '<w:p><w:r><w:t>Cabecera</w:t></w:r></w:p>' },
    footers: { default: '<w:p><w:r><w:t>Pie</w:t></w:r></w:p>' },
    core: { title: 'Prueba & co', author: 'Postext', language: 'es', date: '2026-11-04T10:00:00.123Z' },
    settings: { embedFonts: true, openTypeFeatures: true, autoHyphenation: false, extra: '<w:doNotExpandShiftReturn/><w:hyphenationZone w:val="357"/>' },
    fonts,
    exportMap,
    customProps: { 'postext.configHash': 'cafe' },
    ...extra,
  });
  return { bytes, files: unzipSync(bytes) };
}

describe('createDocxPackage', () => {
  it('writes a package that validates', () => {
    const { files } = build();
    expect(validateDocxPackage(files)).toEqual([]);
    expect(Object.keys(files)[0]).toBe('[Content_Types].xml');
    for (const p of ['word/footnotes.xml', 'word/endnotes.xml', 'word/header1.xml', 'word/footer1.xml', 'word/media/image1.png', 'word/fonts/font1.odttf', 'word/fonts/font2.odttf', 'customXml/item1.xml', 'docProps/custom.xml']) {
      expect(files[p], p).toBeDefined();
    }
    expect(files['word/media/image2.png']).toBeUndefined();
  });

  it('declares every namespace and the ignorable prefixes on the document', () => {
    const { files } = build();
    const doc = parseXml(strFromU8(files['word/document.xml']!));
    for (const p of ['w', 'r', 'wp', 'wp14', 'a', 'pic', 'wps', 'wpg', 'mc', 'w14', 'w15', 'm', 'asvg', 'v', 'o']) expect(doc.attrs[`xmlns:${p}`], p).toBeTruthy();
    expect(doc.attrs['mc:Ignorable']).toBe('w14 w15 wp14');
  });

  it('writes settings in schema order without doNotExpandShiftReturn', () => {
    const { files } = build();
    const xml = strFromU8(files['word/settings.xml']!);
    expect(xml).not.toContain('doNotExpandShiftReturn');
    const names = children(parseXml(xml)).map((c) => c.name);
    expect(names).toEqual(['w:embedTrueTypeFonts', 'w:defaultTabStop', 'w:autoHyphenation', 'w:hyphenationZone', 'w:characterSpacingControl', 'w:footnotePr', 'w:endnotePr', 'w:compat', 'w:doNotAutoCompressPictures']);
    expect(xml).toContain('w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"');
    expect(xml).toContain('enableOpenTypeFeatures');
    expect(xml).toContain('<w:autoHyphenation w:val="false"/>');
  });

  it('embeds obfuscated fonts with their keys', () => {
    const { files } = build();
    const table = parseXml(strFromU8(files['word/fontTable.xml']!));
    const font = child(table, 'font')!;
    expect(attr(font, 'name')).toBe('Lora Postext');
    const reg = child(font, 'embedRegular')!;
    const key = attr(reg, 'fontKey')!;
    expect(key).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/);
    expect(key).toBe(fontKeyFor({ family: 'Lora Postext', slot: 'regular', bytes: TTF }));
    expect(child(font, 'embedBold')).toBeDefined();
    expect(obfuscateFont(files['word/fonts/font1.odttf']!, key)).toEqual(TTF);
  });

  it('round-trips the export map through the package', () => {
    const { files } = build();
    expect(readExportMap(files)).toEqual(exportMap);
    const custom = strFromU8(files['docProps/custom.xml']!);
    expect(custom).toContain('name="postext.exportId"><vt:lpwstr>exp-123<');
    expect(custom).toContain('name="postext.variant"><vt:lpwstr>semantic<');
    expect(custom).toContain('name="postext.version"><vt:lpwstr>1.67.0<');
    expect(custom).toContain('postext.configHash');
  });

  it('is deterministic with a fixed date', () => {
    expect(build().bytes).toEqual(build().bytes);
    const core = strFromU8(build().files['docProps/core.xml']!);
    expect(core).toContain('<dcterms:created xsi:type="dcterms:W3CDTF">2026-11-04T10:00:00Z</dcterms:created>');
    expect(core).toContain('Prueba &amp; co');
  });

  it('can still be read by readDocx', () => {
    const doc = readDocx(build().bytes);
    expect(doc.title).toBe('Prueba & co');
    expect(doc.blocks.length).toBeGreaterThan(0);
    expect(doc.footnotes.size ?? Object.keys(doc.footnotes).length).toBeGreaterThan(0);
  });

  it('works with a bare body (no optional parts)', () => {
    const bytes = createDocxPackage().build({ body: '<w:p/><w:sectPr/>', styles: '' });
    const files = unzipSync(bytes);
    expect(validateDocxPackage(files)).toEqual([]);
    expect(files['docProps/custom.xml']).toBeUndefined();
    expect(readExportMap(files)).toBeUndefined();
    expect(() => readDocx(bytes)).not.toThrow();
  });

  it('gives a footer that draws a picture its own relationships', () => {
    const pkg = createDocxPackage();
    const img = pkg.addMedia(PNG, 'png');
    const rel = pkg.footerRel('f1');
    const plain = pkg.headerRel('h1');
    const bytes = pkg.build({
      body: `<w:p/><w:sectPr><w:headerReference w:type="default" r:id="${plain}"/><w:footerReference w:type="default" r:id="${rel}"/></w:sectPr>`,
      styles: '',
      headers: { h1: '<w:p/>' },
      footers: { f1: `<w:p><w:r><w:drawing><a:blip r:embed="${img}"/></w:drawing></w:r></w:p>` },
    });
    const files = unzipSync(bytes);
    const rels = strFromU8(files['word/_rels/footer1.xml.rels']!);
    expect(rels).toContain(`Id="${img}"`);
    expect(rels).toContain('Target="media/image1.png"');
    expect(files['word/_rels/header1.xml.rels']).toBeUndefined();
    expect(validateDocxPackage(files)).toEqual([]);
  });

  it('rejects a referenced header without content', () => {
    const pkg = createDocxPackage();
    pkg.headerRel('first');
    expect(() => pkg.build({ body: '<w:p/>', styles: '' })).toThrow(/header "first"/);
  });

  it('the validator reports broken packages', () => {
    const { files } = build();
    const broken = { ...files };
    delete broken['word/media/image1.png'];
    delete broken['word/footer1.xml'];
    const errs = validateDocxPackage(broken);
    expect(errs.some((e) => e.includes('image1.png'))).toBe(true);
    expect(errs.some((e) => e.includes('footer1.xml'))).toBe(true);
    expect(descendants(parseXml(strFromU8(files['word/document.xml']!)), 'bookmarkStart')).toHaveLength(1);
  });
});

describe('obfuscateFont', () => {
  const key = '{001B70DC-AA60-4AD5-90EC-18A0948E1EAE}';
  it('changes only the first 32 bytes and is its own inverse', () => {
    const once = obfuscateFont(TTF, key);
    expect(once.slice(32)).toEqual(TTF.slice(32));
    // Key bytes reversed: AE 1E 8E 94 A0 18 EC 90 D5 4A 60 AA DC 70 1B 00.
    for (let i = 0; i < 32; i++) expect(once[i] === TTF[i]).toBe(i % 16 === 15);
    expect(obfuscateFont(once, key)).toEqual(TTF);
  });
  it('uses the key bytes in reverse order', () => {
    const zeros = new Uint8Array(40);
    const out = obfuscateFont(zeros, key);
    expect(out[0]).toBe(0xae);
    expect(out[15]).toBe(0x00);
    expect(out[16]).toBe(0xae);
    expect(out[1]).toBe(0x1e);
  });
});
