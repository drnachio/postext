import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { children, parseXml } from '../xml.js';
import { bookmarkName } from '../anchors/bookmarks.js';
import { encodeExportMap, readCustomProp, readExportMap } from '../anchors/exportMap.js';
import type { ExportMap } from '../anchors/types.js';
import { createDocxPackage } from './package.js';
import { settingsXml } from './parts.js';
import { validateDocxPackage } from './validate.js';
import { xmlProblems } from './wellFormed.js';

const ctx = { hasFootnotes: false, hasEndnotes: false };

describe('settings merge', () => {
  it('merges a caller w:compat instead of replacing it, dropping doNotExpandShiftReturn', () => {
    const xml = settingsXml(
      {
        extra:
          '<w:compat><w:doNotExpandShiftReturn/><w:useFELayout/>' +
          '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14"/>' +
          '<w:compatSetting w:name="allowSpaceOfSameStyleInTable" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/></w:compat>',
      },
      ctx,
    );
    expect(xml).not.toContain('doNotExpandShiftReturn');
    const compat = children(parseXml(xml), 'compat')[0]!;
    const names = children(compat).map((c) => c.attrs['w:name'] ?? c.name);
    expect(names).toEqual(['w:useFELayout', 'compatibilityMode', 'overrideTableStyleFontSizeAndJustification', 'doNotFlipMirrorIndents', 'differentiateMultirowTableHeaders', 'allowSpaceOfSameStyleInTable']);
    expect(xml).toContain('w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14"');
    expect(children(parseXml(xml), 'compat')).toHaveLength(1);
  });

  it('declares the namespaces extra children use', () => {
    const xml = settingsXml({ extra: '<w15:chartTrackingRefBased/><m:mathPr><m:mathFont m:val="Cambria Math"/></m:mathPr>' }, ctx);
    expect(xmlProblems(xml)).toEqual([]);
    const names = children(parseXml(xml)).map((c) => c.name);
    expect(names.indexOf('m:mathPr')).toBeLessThan(names.indexOf('w:doNotAutoCompressPictures'));
    expect(names.indexOf('m:mathPr')).toBeGreaterThan(names.indexOf('w:compat'));
  });

  it('embeds fonts when faces are present unless embedFonts is false', () => {
    expect(settingsXml({}, { ...ctx, hasFonts: true })).toContain('<w:embedTrueTypeFonts/>');
    expect(settingsXml({ embedFonts: false }, { ...ctx, hasFonts: true })).not.toContain('embedTrueTypeFonts');
    expect(settingsXml({}, ctx)).not.toContain('embedTrueTypeFonts');
  });
});

describe('validator strictness', () => {
  const good = (): Record<string, Uint8Array> => unzipSync(createDocxPackage().build({ body: '<w:p><w:r><w:t>a</w:t></w:r></w:p><w:sectPr/>', styles: '' }));

  it('flags malformed parts the lenient reader accepts', () => {
    for (const [body, want] of [
      ['<w:p><w:r><w:t>a</w:r></w:t></w:p>', /closes/],
      ['<w:p><x:foo/></w:p>', /undeclared prefix x/],
      ['<w:p><w:r><w:t>a & b</w:t></w:r></w:p>', /unescaped "&"/],
      ['<w:p><w:r><w:t>a</w:t></w:r>', /never closed/],
    ] as const) {
      const files = good();
      files['word/document.xml'] = strToU8(strFromU8(files['word/document.xml']!).replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}</w:body>`));
      expect(validateDocxPackage(files).join('\n'), body).toMatch(want);
    }
  });

  it('requires the main document content type', () => {
    const files = good();
    files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']!).replace(/<Override PartName="\/word\/document.xml"[^>]*\/>/, ''));
    expect(validateDocxPackage(files).join('\n')).toMatch(/word\/document.xml: content type/);
  });

  it('checks mc:Ignorable prefixes', () => {
    expect(xmlProblems('<a xmlns:mc="m" mc:Ignorable="w14"/>')).toEqual(['<a>: ignorable prefix w14 is not declared']);
  });
});

describe('export map as Word re-saves it', () => {
  const map: ExportMap = {
    version: 1, exportId: 'e1', variant: 'formatted', engine: '1.67.0', createdAt: '2026-11-04T00:00:00Z',
    chapters: [{ id: 'c', hash: 'h' }],
    fragments: [{ id: 'a', block: 'b', part: 0, target: { kind: 'markdown', chapter: 0 }, text: 'ab', map: [0, 1], range: [0, 2] }],
  };
  const custom = '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="postext.exportId"><vt:lpwstr>e1</vt:lpwstr></property></Properties>';
  const utf16le = (s: string): Uint8Array => {
    const out = new Uint8Array(2 + s.length * 2);
    out[0] = 0xff;
    out[1] = 0xfe;
    for (let i = 0; i < s.length; i++) {
      out[2 + i * 2] = s.charCodeAt(i) & 0xff;
      out[3 + i * 2] = s.charCodeAt(i) >> 8;
    }
    return out;
  };

  it('reads UTF-16 and BOM-prefixed UTF-8 parts', () => {
    const xml = encodeExportMap(map).replace('encoding="UTF-8"', 'encoding="UTF-16"');
    expect(readExportMap({ 'customXml/item3.xml': utf16le(xml), 'docProps/custom.xml': utf16le(custom) })).toEqual(map);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(encodeExportMap(map))]);
    expect(readExportMap({ 'customXml/item1.xml': bom, 'docProps/custom.xml': new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(custom)]) })).toEqual(map);
    expect(readCustomProp({ 'docProps/custom.xml': utf16le(custom) }, 'postext.exportId')).toBe('e1');
  });

  it('reads a prefixed root with the payload wrapped over lines', () => {
    const xml = encodeExportMap(map);
    const payload = /<postextExportMap[^>]*>([^<]*)</.exec(xml)![1]!;
    const wrapped = `<ns0:postextExportMap xmlns:ns0="https://postext.dev/ns/docx-map/1" v="1">\n${payload.replace(/(.{20})/g, '$1\n  ')}\n</ns0:postextExportMap>`;
    expect(readExportMap({ 'customXml/item2.xml': strToU8(wrapped) })).toEqual(map);
  });
});

describe('ids', () => {
  it('rejects fragment ids Word would rename', () => {
    expect(() => bookmarkName('a-b')).toThrow(/letters, digits/);
    expect(() => bookmarkName('a.b')).toThrow();
    expect(bookmarkName('z9_')).toBe('_ptx_z9_');
  });

  it('accepts only picture extensions in addMedia', () => {
    const pkg = createDocxPackage();
    expect(() => pkg.addMedia(new Uint8Array([1]), 'xml' as 'png')).toThrow(/unsupported/);
    expect(() => pkg.addMedia(new Uint8Array([1]), 'odttf' as 'png')).toThrow(/unsupported/);
  });
});
