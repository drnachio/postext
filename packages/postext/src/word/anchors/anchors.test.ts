import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { base64Decode, base64Encode } from './base64.js';
import { bookmarkEndXml, bookmarkName, bookmarkStartXml, fragmentIdOf, newFragmentId } from './bookmarks.js';
import { decodeExportMap, decodeOffsetRuns, encodeExportMap, encodeOffsetRuns, readExportMap } from './exportMap.js';
import { guidFrom, hashText } from './hash.js';
import type { ExportMap } from './types.js';

function bigMap(n: number): ExportMap {
  const fragments = Array.from({ length: n }, (_, i) => {
    const text = `Fragmento ${i} — ñandú 漢字 \u{1F600}\n`.repeat(3);
    const map = Array.from(text, (_, k) => (k % 17 === 16 ? -1 : i * 1000 + k));
    return { id: newFragmentId(i), block: `b${i >> 1}`, part: i & 1, target: { kind: 'markdown' as const, chapter: 0 }, text, map, range: [i * 1000, i * 1000 + text.length] as [number, number] };
  });
  return {
    version: 1, exportId: 'x', variant: 'formatted', engine: '1.67.0', createdAt: '2026-11-04T00:00:00Z',
    chapters: [{ id: 'a', hash: hashText('a') }], fragments,
    snapshot: { chapters: [{ id: 'a', markdown: 'x'.repeat(200_000) }], resources: { r1: { kind: 'image', caption: 'Pie' } } },
  };
}

describe('export map codec', () => {
  it('round-trips deep-equal, including a large map', () => {
    const map = bigMap(500);
    const xml = encodeExportMap(map);
    expect(xml).toContain('xmlns="https://postext.dev/ns/docx-map/1"');
    expect(decodeExportMap(xml)).toEqual(map);
  });

  it('stores offset maps as runs with an exact round trip', () => {
    const cases = [[], [5], [-1], [0, 1, 2, -1, -1, 3, 4, 10, 9, 8, -1, -2, -1, 0], [-3, -2, -1, -1, 0]];
    for (const c of cases) expect(decodeOffsetRuns(encodeOffsetRuns(c))).toEqual(c);
    expect(encodeOffsetRuns([0, 1, 2, 3, -1, -1, 7, 8])).toEqual([0, 4, -1, 2, 7, 2]);
  });

  it('rejects other parts', () => {
    expect(() => decodeExportMap('<postextExportMap xmlns="urn:other">AAAA</postextExportMap>')).toThrow();
    expect(() => decodeExportMap('<postextWordTemplate xmlns="https://postext.dev/word-template">{}</postextWordTemplate>')).toThrow();
  });

  it('readExportMap checks the export id in docProps/custom.xml', () => {
    const map = bigMap(2);
    const custom = (id: string) => strToU8(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="postext.exportId"><vt:lpwstr>${id}</vt:lpwstr></property></Properties>`);
    const files = {
      'customXml/item1.xml': strToU8('<postextWordTemplate xmlns="https://postext.dev/word-template">{}</postextWordTemplate>'),
      'customXml/item2.xml': strToU8(encodeExportMap(map)),
    };
    expect(readExportMap(files)).toEqual(map);
    expect(readExportMap({ ...files, 'docProps/custom.xml': custom('x') })).toEqual(map);
    expect(readExportMap({ ...files, 'docProps/custom.xml': custom('other') })).toBeUndefined();
    expect(readExportMap({})).toBeUndefined();
  });
});

describe('base64', () => {
  it('encodes RFC 4648 vectors and round-trips large inputs', () => {
    const vectors: [string, string][] = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
    for (const [plain, enc] of vectors) {
      expect(base64Encode(strToU8(plain))).toBe(enc);
      expect(base64Decode(enc)).toEqual(strToU8(plain));
    }
    for (const n of [12_287, 12_288, 12_289, 100_001]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 131 + 7) & 0xff);
      expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
    }
    expect(base64Decode('aGVs\nbG8=')).toEqual(strToU8('hello'));
    expect(() => base64Decode('a*b')).toThrow();
  });
});

describe('hash and ids', () => {
  it('hashText is FNV-1a 64', () => {
    expect(hashText('')).toBe('cbf29ce484222325');
    expect(hashText('a')).toBe('af63dc4c8601ec8c');
    expect(hashText('foobar')).toBe('85944171f73967e8');
    expect(hashText('ñ')).not.toBe(hashText('n'));
  });

  it('guidFrom is stable and well-formed', () => {
    expect(guidFrom('x')).toBe(guidFrom('x'));
    expect(guidFrom('x')).not.toBe(guidFrom('y'));
    expect(guidFrom('x')).toMatch(/^\{[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}\}$/);
  });

  it('bookmark names and fragment ids', () => {
    expect(newFragmentId(0)).toBe('0');
    expect(newFragmentId(46655)).toBe('zzz');
    expect(bookmarkName('a1')).toBe('_ptx_a1');
    expect(fragmentIdOf('_ptx_a1')).toBe('a1');
    expect(fragmentIdOf('_Toc123')).toBeUndefined();
    expect(() => bookmarkName('x'.repeat(36))).toThrow();
    expect(bookmarkName('x'.repeat(35))).toHaveLength(40);
    expect(bookmarkStartXml(3, '_ptx_a"')).toBe('<w:bookmarkStart w:id="3" w:name="_ptx_a&quot;"/>');
    expect(bookmarkEndXml(3)).toBe('<w:bookmarkEnd w:id="3"/>');
  });
});
