import { describe, it, expect } from 'vitest';
import { parseXml, scanXmlMarkup } from './xml.js';
import { topLevelElements } from './ooxml/parts.js';
import { xeField } from './semantic/marks.js';

const HOSTILE = ['<'.repeat(200_000), '<" b="'.repeat(40_000), '<!--'.repeat(50_000), '</'.repeat(100_000), '<![CDATA['.repeat(20_000), '<?'.repeat(100_000)];

describe('scanXmlMarkup (#1419)', () => {
  it('reads tags, comments, sections and instructions', () => {
    const kinds: string[] = [];
    scanXmlMarkup(`<?xml version="1.0"?><!-- <no> --><a b='1' c = "x > y"><![CDATA[<z>]]><d/></a >`, (m) => {
      kinds.push(m.open ?? (m.close ? `/${m.close}` : m.cdata !== undefined ? `cdata:${m.cdata}` : 'other'));
    });
    expect(kinds).toEqual(['other', 'other', 'a', 'cdata:<z>', 'd', '/a']);
  });

  it('takes no `<` into a name: the tag starts at the last one', () => {
    expect(parseXml('<<a/>').name).toBe('a');
    expect(topLevelElements('<<a/><b/>').map((e) => e.name)).toEqual(['a', 'b']);
  });

  it('takes hostile input in linear time', () => {
    for (const text of HOSTILE) {
      const start = performance.now();
      expect(topLevelElements(text)).toEqual([]);
      expect(() => parseXml(text)).toThrow('no root element');
      expect(performance.now() - start, text.slice(0, 12)).toBeLessThan(500);
    }
  });
});

describe('topLevelElements', () => {
  it('splits siblings with their local names, past comments and nesting', () => {
    const xml = `<w:a x="1"><w:a/></w:a><!-- <w:no/> --><w14:b/>`;
    expect(topLevelElements(xml)).toEqual([
      { name: 'a', xml: '<w:a x="1"><w:a/></w:a>' },
      { name: 'b', xml: '<w14:b/>' },
    ]);
  });
});

describe('xeField', () => {
  const labels = { see: 'see', seeAlso: 'see also' };
  it('escapes backslashes, quotes and colons of a term, and only then joins the path', () => {
    const field = xeField({ path: ['a\\b', 'c"d', 'e:f'] } as never, labels);
    expect(field).toContain('XE "a\\\\b:c\\"d:e\\:f"');
  });
  it('leaves the colon of a see reference alone', () => {
    expect(xeField({ path: ['t'], see: 'x:y"z' } as never, labels)).toContain('\\t "see x:y\\"z"');
  });
});
