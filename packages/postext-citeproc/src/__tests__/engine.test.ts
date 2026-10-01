import { describe, expect, it } from 'vitest';
import type { CslItem } from 'postext';
import { type BibtexIssue, createCiteprocEngine, LOCALES, parseBibtex, pickLocale, STYLES, STYLE_CATALOG } from '../index';

const engine = createCiteprocEngine({ styles: STYLES, locales: LOCALES });

const items: CslItem[] = [
  { id: 'garcia2020', type: 'book', author: [{ family: 'García', given: 'Ana' }], title: 'Tipografía y lectura', issued: { 'date-parts': [[2020]] }, publisher: 'Trea', 'publisher-place': 'Gijón', language: 'es' },
  { id: 'lopez2019', type: 'article-journal', author: [{ family: 'López', given: 'Luis' }, { family: 'Ruiz', given: 'Eva' }], title: 'Leer en pantalla', 'container-title': 'Revista de Letras', volume: '12', issue: '3', page: '45-67', issued: { 'date-parts': [[2019]] }, DOI: '10.1000/xyz', language: 'es' },
  { id: 'zhang2018', type: 'book', language: 'zh-CN', author: [{ family: '张三' }, { family: '李四' }, { family: '王五' }, { family: '赵六' }], title: '排版学', issued: { 'date-parts': [[2018]] }, publisher: '商务印书馆', 'publisher-place': '北京' },
];

describe('the bundled catalog', () => {
  it('ships every style it lists, and the locales', () => {
    expect(engine.styles().map((s) => s.id)).toEqual(STYLE_CATALOG.map((s) => s.id));
    for (const tag of ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'zh-CN', 'zh-TW']) expect(LOCALES[tag]).toBeDefined();
    expect(pickLocale(LOCALES, 'es')).toBe('es-ES');
    expect(pickLocale(LOCALES, 'zh-Hant')).toBe('zh-TW');
    expect(pickLocale(LOCALES, 'zz')).toBe('en-US');
  });
});

describe('formatting', () => {
  it('APA: parenthetical with a locator, narrative, author suppressed', () => {
    const p = engine.createProcessor({ style: 'apa', locale: 'es-ES', items });
    expect(p.kind).toBe('in-text');
    expect(p.numeric).toBe(false);
    const out = p.cite([
      { mode: 'parenthetical', items: [{ id: 'garcia2020', locator: '33', label: 'page' }, { id: 'lopez2019' }] },
      { mode: 'narrative', items: [{ id: 'garcia2020' }] },
      { mode: 'parenthetical', items: [{ id: 'lopez2019', suppressAuthor: true }] },
    ]);
    expect(out[0]).toBe('(García, 2020, p. 33; López &#38; Ruiz, 2019)');
    expect(out[1]).toBe('García (2020)');
    expect(out[2]).toBe('(2019)');
    const bib = p.bibliography();
    expect(bib.hangingIndent).toBe(true);
    expect(bib.entries.map((e) => e.id)).toEqual(['garcia2020', 'lopez2019']);
    expect(bib.entries[0]!.html).toContain('<i>Tipografía y lectura</i>');
    expect(bib.entries[1]!.html).toContain('<a href="https://doi.org/10.1000/xyz">');
  });

  it('IEEE: numbers in citation order, a label column, narrative authors', () => {
    const p = engine.createProcessor({ style: 'ieee', locale: 'en-US', items });
    expect(p.numeric).toBe(true);
    const out = p.cite([
      { mode: 'parenthetical', items: [{ id: 'lopez2019' }] },
      { mode: 'narrative', items: [{ id: 'garcia2020' }] },
    ]);
    expect(out).toEqual(['[1]', 'García [2]']);
    expect([...p.citationNumbers()]).toEqual([['lopez2019', 1], ['garcia2020', 2]]);
    const bib = p.bibliography();
    expect(bib.labelColumn).toBe(true);
    expect(bib.entries.map((e) => e.label)).toEqual(['[1]', '[2]']);
  });

  it('GB/T 7714: superscript numbers, type codes, 等 for a Chinese work', () => {
    const p = engine.createProcessor({ style: 'china-national-standard-gb-t-7714-2015-numeric', locale: 'zh-CN', items });
    const out = p.cite([{ mode: 'parenthetical', items: [{ id: 'zhang2018' }, { id: 'lopez2019' }] }, { mode: 'narrative', items: [{ id: 'zhang2018' }] }]);
    expect(out[0]).toBe('<sup>[1,2]</sup>');
    expect(out[1]).toBe('张三等<sup>[1]</sup>');
    const bib = p.bibliography();
    expect(bib.entries[0]!.html).toContain('张三, 李四, 王五, 等. 排版学[M]');
    expect(bib.entries[1]!.html).toContain('[J/OL]');
  });

  it('Chicago notes: a note style, with uncited works in the bibliography', () => {
    const p = engine.createProcessor({ style: 'chicago-notes-bibliography', locale: 'en-US', items });
    expect(p.kind).toBe('note');
    const out = p.cite([
      { mode: 'parenthetical', noteIndex: 1, items: [{ id: 'garcia2020', locator: '33', label: 'page' }] },
      { mode: 'parenthetical', noteIndex: 2, items: [{ id: 'garcia2020', locator: '34', label: 'page' }] },
    ]);
    expect(out[0]).toContain('García, <i>Tipografía y lectura</i>');
    // Chicago 18 repeats a short form where earlier editions wrote ibid.
    expect(out[1]).toBe('García, <i>Tipografía y lectura</i>, 34.');
    const bib = p.bibliography(['garcia2020', 'zhang2018']);
    expect(bib.entries.map((e) => e.id)).toEqual(['garcia2020', 'zhang2018']);
  });

  it('OSCOLA: ibid. for the same work in the next note', () => {
    const p = engine.createProcessor({ style: 'oscola', locale: 'en-GB', items });
    const out = p.cite([
      { mode: 'parenthetical', noteIndex: 1, items: [{ id: 'garcia2020', locator: '33', label: 'page' }] },
      { mode: 'parenthetical', noteIndex: 2, items: [{ id: 'garcia2020', locator: '34', label: 'page' }] },
    ]);
    expect(out[1]).toMatch(/^[Ii]bid 34/);
  });

  it('accepts a whole CSL style and ignores unknown keys', () => {
    const p = engine.createProcessor({ style: STYLES.nature!, locale: 'en-US', items });
    expect(p.cite([{ mode: 'parenthetical', items: [{ id: 'nope' }, { id: 'garcia2020' }] }])).toEqual(['<sup>1</sup>']);
  });
});

describe('BibTeX', () => {
  it('reads entries, names, accents, dashes and macros', () => {
    const issues: BibtexIssue[] = [];
    const out = parseBibtex(String.raw`
@string{rl = "Revista de Letras"}
% a comment
@article{lopez2019, author = {L{\'o}pez, Luis and Ruiz, Eva}, title = {Leer en {P}antalla},
  journal = rl # " (Madrid)", year = 2019, volume = {12}, number = 3, pages = {45--67}, doi = {https://doi.org/10.1000/xyz}}
@book{zhang2018, author = {张三 and 李四}, title = {排版学}, publisher = {商务印书馆}, address = {北京}, year = {2018}, langid = {chinese}}
@inproceedings{knuth81, author = {Donald E. Knuth and Ludwig van Beethoven and {World Health Organization}},
  title = "Breaking paragraphs into lines", booktitle = {Software}, year = {1981}, month = nov, url = {https://x.org/a_b}}
@phdthesis{t, author = {Ruiz, Jr., Eva}, title = {Tesis}, school = {UNED}, date = {2021-05-03}}
`, issues);
    expect(issues).toEqual([]);
    expect(out[0]).toMatchObject({ id: 'lopez2019', type: 'article-journal', title: 'Leer en Pantalla', 'container-title': 'Revista de Letras (Madrid)', issue: '3', page: '45–67', DOI: '10.1000/xyz', issued: { 'date-parts': [[2019]] } });
    expect(out[0]!.author).toEqual([{ family: 'López', given: 'Luis' }, { family: 'Ruiz', given: 'Eva' }]);
    expect(out[1]).toMatchObject({ type: 'book', language: 'zh-CN', 'publisher-place': '北京', author: [{ family: '张三' }, { family: '李四' }] });
    expect(out[2]!.author).toEqual([
      { family: 'Knuth', given: 'Donald E.' },
      { family: 'Beethoven', given: 'Ludwig', 'non-dropping-particle': 'van' },
      { literal: 'World Health Organization' },
    ]);
    expect(out[2]).toMatchObject({ type: 'paper-conference', issued: { 'date-parts': [[1981, 11]] }, URL: 'https://x.org/a_b' });
    expect(out[3]).toMatchObject({ type: 'thesis', publisher: 'UNED', genre: 'PhD thesis', issued: { 'date-parts': [[2021, 5, 3]] } });
    expect(out[3]!.author).toEqual([{ family: 'Ruiz', given: 'Eva', suffix: 'Jr.' }]);
  });
});
