import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { parseLocator } from '../../parse/citations';
import { htmlToSpans } from '../../citations/html';
import { documentReferences, nociteKeys, normalizeCslItem } from '../../citations/data';
import { bookCitationContexts } from '../../citations/context';
import { parseBibtex } from '../../citations/bibtex';

const cites = (md: string) => parseMarkdown(md).flatMap((b) => b.spans.filter((s) => s.citation).map((s) => s.citation!));

describe('citation syntax (#268)', () => {
  it('reads parenthetical citations with prefixes, locators, suffixes and suppressed authors', () => {
    const [c] = cites('As [see @garcia2020, p. 33; -@lopez2019, chap. 2, emphasis added] show.');
    expect(c!.cluster).toEqual({
      mode: 'parenthetical',
      items: [
        { id: 'garcia2020', prefix: 'see', locator: '33', label: 'page' },
        { id: 'lopez2019', suppressAuthor: true, locator: '2', label: 'chapter', suffix: ', emphasis added' },
      ],
    });
    expect(c!.raw).toBe('[see @garcia2020, p. 33; -@lopez2019, chap. 2, emphasis added]');
  });

  it('reads narrative citations, with a locator in brackets after them', () => {
    expect(cites('@knuth81 says so; @garcia2020 [pp. 4–6] agrees.').map((c) => [c.cluster.mode, c.cluster.items])).toEqual([
      ['narrative', [{ id: 'knuth81' }]],
      ['narrative', [{ id: 'garcia2020', locator: '4–6', label: 'page' }]],
    ]);
  });

  it('leaves e-mail addresses, code, escapes, links and footnotes alone', () => {
    expect(cites('Write to me@example.com, `@code`, \\@nope, [a @x link](http://a) and a note.[^1]')).toEqual([]);
    const [p] = parseMarkdown('Text \\@nope stays.');
    expect(p!.text).toBe('Text @nope stays.');
  });

  it('keeps the cross-reference prefixes for :ref (@sec:x is no citation)', () => {
    expect(cites('See @sec:intro and [@fig:map].')).toEqual([]);
  });

  it('reads locators in other languages and plain numbers', () => {
    expect(parseLocator(', pág. 12')).toEqual({ locator: '12', label: 'page' });
    expect(parseLocator(', 页 12')).toEqual({ locator: '12', label: 'page' });
    expect(parseLocator(', 12-14, my words')).toEqual({ locator: '12-14', label: 'page', suffix: ', my words' });
    expect(parseLocator(', § 4.2')).toEqual({ locator: '4.2', label: 'section' });
    expect(parseLocator(', see also')).toEqual({ suffix: 'see also' });
  });

  it('parses :::references blocks raw and :::bibliography as a directive', () => {
    const blocks = parseMarkdown(':::references{format=bibtex}\n@book{a, title={T}}\n:::\n\n:::bibliography{title="Works"}');
    expect(blocks.map((b) => [b.type, b.directiveName, b.rawBody])).toEqual([
      ['directive', 'references', '@book{a, title={T}}'],
      ['directive', 'bibliography', undefined],
    ]);
  });
});

describe('reference data (#268)', () => {
  it('normalises YAML items: dates, names and numbers', () => {
    expect(normalizeCslItem({ id: 'a', author: ['García, Ana', '张三'], issued: 2020, volume: 12 })).toEqual({
      id: 'a', type: 'book', author: [{ family: 'García', given: 'Ana' }, { family: '张三' }], issued: { 'date-parts': [[2020]] }, volume: '12',
    });
    expect(normalizeCslItem({ id: 'b', issued: new Date(Date.UTC(2019, 4, 3)) })!.issued).toEqual({ 'date-parts': [[2019, 5, 3]] });
    expect(normalizeCslItem({ title: 'no id' })).toBeUndefined();
  });

  it('reads nocite lists', () => {
    expect(nociteKeys('@a, @b')).toEqual(['a', 'b']);
    expect(nociteKeys(['@*'])).toEqual(['*']);
  });

  it('collects front matter, BibTeX, CSL-JSON and CSL-YAML references, first key winning', () => {
    const blocks = parseMarkdown([
      ':::references{format=bibtex}', '@book{bib1, author={Ruiz, Eva}, title={Uno}, year=2001}', ':::',
      '', ':::references{format=csl-json}', '[{"id": "json1", "type": "book", "title": "Dos"}]', ':::',
      '', ':::references', '- id: yaml1', '  title: Tres', ':::',
      '', ':::references{format=csl-json}', '[oops', ':::',
    ].join('\n'));
    const data = documentReferences({ references: [{ id: 'bib1', title: 'Front' }] }, blocks);
    expect(data.items.map((i) => [i.id, i.title])).toEqual([['bib1', 'Front'], ['json1', 'Dos'], ['yaml1', 'Tres']]);
    expect(data.issues).toHaveLength(1);
  });

  it('keeps the short titles Zotero and BibLaTeX write', () => {
    const [item] = parseBibtex('@article{k, title={Letters of {John} Keats}, shorttitle={Letters}, journal={The Journal of Hellenic Studies}, shortjournal={J. Hell. Stud.}}');
    expect(item).toMatchObject({ title: 'Letters of John Keats', 'title-short': 'Letters', 'container-title-short': 'J. Hell. Stud.' });
  });
});

describe('book contexts (#272)', () => {
  it('orders citations by note and maps each document to its share', () => {
    const one = { blocks: parseMarkdown('A [@x].[^n] B [@y].\n\n[^n]: In a note [@z].') };
    const two = { blocks: parseMarkdown('C [@x].') };
    const [c1, c2] = bookCitationContexts([one, two]);
    // The note's citation sits at its note (2), between the two text citations.
    expect(c1!.clusters.map((c) => [c.items[0]!.id, c.noteIndex])).toEqual([['x', 1], ['z', 2], ['y', 3], ['x', 4]]);
    expect(c1!.local).toEqual([0, 2, 1]);
    expect(c2!.local).toEqual([3]);
    expect([c1!.last, c2!.last]).toEqual([false, true]);
  });
});

describe('citeproc HTML (#269)', () => {
  it('becomes spans with emphasis, small capitals, scripts and links', () => {
    expect(htmlToSpans('García, <i>Tipo <span style="font-style:normal;">y</span></i> &#38; <span style="font-variant:small-caps;">ed</span><sup>2</sup> <a href="https://doi.org/x">doi</a>')).toEqual([
      { text: 'García, ', bold: false, italic: false },
      { text: 'Tipo ', bold: false, italic: true },
      { text: 'y & ', bold: false, italic: false },
      { text: 'ed', bold: false, italic: false, smallCaps: true },
      { text: '2', bold: false, italic: false, script: 'sup' },
      { text: ' ', bold: false, italic: false },
      { text: 'doi', bold: false, italic: false, links: [{ start: 0, end: 3, href: 'https://doi.org/x' }] },
    ]);
  });
});

describe('citation keys next to Chinese text', () => {
  it('ends a Latin key where Chinese text begins, and reads a key right after a Chinese word', () => {
    expect(cites('周明远@zhou2019认为如此。').map((c) => [c.cluster.mode, c.cluster.items[0]!.id])).toEqual([['narrative', 'zhou2019']]);
    expect(cites('见[@zhou2019]。').map((c) => c.cluster.items[0]!.id)).toEqual(['zhou2019']);
    expect(cites('[@张三2020]').map((c) => c.cluster.items[0]!.id)).toEqual(['张三2020']);
    expect(cites('Write to me@example.com.')).toEqual([]);
  });
});
