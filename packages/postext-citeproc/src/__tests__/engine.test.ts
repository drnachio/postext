import { describe, expect, it } from 'vitest';
import type { CslItem } from 'postext';
import { type BibtexIssue, createCiteprocEngine, LOCALES, parseBibtex, pickLocale, STYLES, STYLE_CATALOG } from '../index';
import { LOCALE_TAGS } from '../catalog';

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

  it('ships one Arabic locale for every Arabic tag', () => {
    expect(LOCALES.ar).toContain('xml:lang="ar"');
    expect(LOCALE_TAGS).toContain('ar');
    for (const tag of ['ar', 'ar-EG', 'ar_MA', 'ar-u-nu-arab']) expect(pickLocale(LOCALES, tag), tag).toBe('ar');
  });
});

describe('Arabic', () => {
  const arabic: CslItem[] = [
    { id: 'jahiz', type: 'book', language: 'ar', author: [{ family: 'الجاحظ', given: 'عمرو' }], title: 'البيان والتبيين', issued: { 'date-parts': [[1998]] }, publisher: 'مكتبة الخانجي', 'publisher-place': 'القاهرة', edition: '7' },
    { id: 'hilal', type: 'article-journal', language: 'ar', author: [{ family: 'حسين', given: 'طه' }, { family: 'أمين', given: 'أحمد' }, { family: 'زكي', given: 'محمد' }], title: 'في الأدب', 'container-title': 'الهلال', volume: '3', page: '10-20', issued: { 'date-parts': [[1926, 5]] } },
  ];

  it('writes the terms of the Arabic locale: ص, وآخرون, و, ط, month names', () => {
    const apa = engine.createProcessor({ style: 'apa', locale: 'ar', items: arabic });
    expect(apa.cite([{ mode: 'parenthetical', items: [{ id: 'jahiz', locator: '12', label: 'page' }, { id: 'hilal' }] }])[0])
      .toMatch(/^\(الجاحظ, 1998, ص\s12; حسين وآخرون, 1926\)$/u);
    expect(apa.bibliography().entries[0]!.html).toBe('الجاحظ, ع. (1998). <i>البيان والتبيين</i> (7 ط). مكتبة الخانجي.');
    const chicago = engine.createProcessor({ style: 'chicago-notes-bibliography', locale: 'ar-EG', items: arabic });
    chicago.cite([{ mode: 'parenthetical', noteIndex: 1, items: [{ id: 'jahiz' }, { id: 'hilal' }] }]);
    const bib = chicago.bibliography().entries.map((e) => e.html);
    expect(bib[1]).toContain('و محمد زكي');
    expect(bib[1]).toContain('(مايو، 1926)');
  });
});

describe('Japanese (#426)', () => {
  const japanese: CslItem[] = [
    { id: 'natsume1914', type: 'book', language: 'ja', author: [{ family: '夏目', given: '漱石' }], title: 'こころ', issued: { 'date-parts': [[1914]] }, publisher: '岩波書店', 'publisher-place': '東京' },
    { id: 'yamada2015', type: 'article-journal', language: 'ja', author: [{ family: '山田', given: '太郎' }, { family: '佐藤', given: '花子' }], title: '縦組みの行間について', 'container-title': '印刷雑誌', volume: '98', issue: '4', page: '12-19', issued: { 'date-parts': [[2015]] } },
    { id: 'suzuki2010', type: 'chapter', language: 'ja', author: [{ family: '鈴木', given: '一郎' }, { family: '田中', given: '次郎' }, { family: '高橋', given: '三郎' }], title: '活字の歴史', 'container-title': '日本の印刷文化', editor: [{ family: '中村', given: '四郎' }], publisher: '朝倉書店', 'publisher-place': '東京', page: '45-67', issued: { 'date-parts': [[2010]] } },
  ];

  it('ships the ja-JP locale and the SIST 02 style', () => {
    expect(LOCALES['ja-JP']).toContain('xml:lang="ja-JP"');
    expect(LOCALE_TAGS).toContain('ja-JP');
    for (const tag of ['ja', 'ja-JP', 'ja_JP', 'ja-Jpan']) expect(pickLocale(LOCALES, tag), tag).toBe('ja-JP');
    expect(STYLE_CATALOG.find((s) => s.id === 'sist02')).toMatchObject({ format: 'numeric' });
    expect(STYLES.sist02).toContain('default-locale="ja-JP"');
  });

  it('SIST 02: numbers in parentheses, a book, an article and a chapter', () => {
    const p = engine.createProcessor({ style: 'sist02', locale: 'ja-JP', items: japanese });
    expect(p.numeric).toBe(true);
    const out = p.cite([
      { mode: 'parenthetical', items: [{ id: 'natsume1914', locator: '12', label: 'page' }] },
      { mode: 'parenthetical', items: [{ id: 'yamada2015' }, { id: 'suzuki2010' }] },
    ]);
    expect(out).toEqual(['(1, p. 12)', '(2, 3)']);
    const bib = p.bibliography();
    expect(bib.entries.map((e) => e.label)).toEqual(['(1)', '(2)', '(3)']);
    // Family name first, set solid; no italics.
    expect(bib.entries[0]!.html).toBe('夏目漱石. こころ. 東京, 岩波書店, 1914.');
    expect(bib.entries[1]!.html).toBe('山田太郎, 佐藤花子. 縦組みの行間について. 印刷雑誌. 2015, vol. 98, no. 4, p. 12–19.');
    // A chapter's title is quoted, as the style asks; its editor takes 編.
    expect(bib.entries[2]!.html).toBe('鈴木一郎, 田中次郎, 高橋三郎. “活字の歴史”. 日本の印刷文化. 中村四郎編. 東京, 朝倉書店, 2010, p. 45–67.');
  });

  it('names two and three authors with the ja-JP terms, not 、 and 等', () => {
    const p = engine.createProcessor({ style: 'sist02', locale: 'ja-JP', items: japanese });
    expect(p.terms).toEqual({ and: 'と', etAl: 'ほか' });
    const out = p.cite([
      { mode: 'narrative', items: [{ id: 'natsume1914' }] },
      { mode: 'narrative', items: [{ id: 'yamada2015' }] },
      { mode: 'narrative', items: [{ id: 'suzuki2010' }] },
    ]);
    expect(out).toEqual(['夏目(1)', '山田と佐藤(2)', '鈴木ほか(3)']);
    expect(out.join('')).not.toMatch(/[等、]/);
    // Chinese keeps 、 and 等.
    const zh = engine.createProcessor({ style: 'ieee', locale: 'zh-CN', items: [...items, ...japanese] });
    expect(zh.cite([{ mode: 'narrative', items: [{ id: 'zhang2018' }] }, { mode: 'narrative', items: [{ id: 'suzuki2010' }] }]))
      .toEqual(['张三等[1]', '鈴木等[2]']);
  });

  it('quotes an article title in 「」 and an inner title in 『』 from the ja-JP locale', () => {
    const p = engine.createProcessor({ style: 'chicago-author-date', locale: 'ja-JP', items: japanese });
    expect(p.cite([{ mode: 'parenthetical', items: [{ id: 'natsume1914' }] }])[0]).toBe('(夏目 1914年)');
    const bib = p.bibliography(['natsume1914', 'yamada2015']);
    expect(bib.entries.find((e) => e.id === 'yamada2015')!.html).toContain('「縦組みの行間について」');
    const inner = engine.createProcessor({ style: 'chicago-author-date', locale: 'ja-JP', items: [{ ...japanese[1]!, title: '"こころ"の版面' }] });
    expect(inner.bibliography(['yamada2015']).entries[0]!.html).toContain('「『こころ』の版面」');
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
    expect(out[0]).toBe('(García, 2020, p.\u00a033; López &#38; Ruiz, 2019)');
    expect(out[1]).toBe('García (2020)');
    expect(out[2]).toBe('(2019)');
    const bib = p.bibliography();
    expect(bib.hangingIndent).toBe(true);
    expect(bib.entries.map((e) => e.id)).toEqual(['garcia2020', 'lopez2019']);
    expect(bib.entries[0]!.html).toContain('<i>Tipografía y lectura</i>');
    expect(bib.entries[1]!.html).toContain('<a href="https://doi.org/10.1000/xyz">');
  });

  it('MLA: a narrative citation with no page ends with the name', () => {
    const p = engine.createProcessor({ style: 'modern-language-association', locale: 'en-US', items });
    const out = p.cite([{ mode: 'narrative', items: [{ id: 'garcia2020' }] }, { mode: 'narrative', items: [{ id: 'garcia2020', locator: '4', label: 'page' }] }]);
    expect(out).toEqual(['García', 'García (4)']);
  });

  it('OSCOLA: a case paragraph stays in brackets in later notes and ibid', () => {
    const law: CslItem[] = [
      { id: 'rob', type: 'legal_case', title: 'Robinson v Chief Constable of West Yorkshire Police', 'title-short': 'Robinson', authority: 'UKSC', number: '4', 'container-title': 'AC', volume: '[2018]', page: '736', issued: { 'date-parts': [[2018]] } },
      { id: 'act', type: 'legislation', title: 'Compensation Act 2006' },
      { id: 'other', type: 'book', author: [{ family: 'Stapleton', given: 'Jane' }], title: 'Product Liability', issued: { 'date-parts': [[1994]] }, publisher: 'Butterworths' },
    ];
    const p = engine.createProcessor({ style: 'oscola', locale: 'en-GB', items: law });
    const out = p.cite([
      { mode: 'parenthetical', noteIndex: 1, items: [{ id: 'rob', locator: '21', label: 'paragraph' }] },
      { mode: 'parenthetical', noteIndex: 2, items: [{ id: 'rob', locator: '27', label: 'paragraph' }] },
      { mode: 'parenthetical', noteIndex: 3, items: [{ id: 'other' }] },
      { mode: 'parenthetical', noteIndex: 4, items: [{ id: 'rob', locator: '55', label: 'paragraph' }] },
      { mode: 'parenthetical', noteIndex: 5, items: [{ id: 'act', locator: '6', label: 'section' }] },
      { mode: 'parenthetical', noteIndex: 6, items: [{ id: 'act', locator: '7', label: 'section' }] },
    ]);
    expect(out[0]).toContain('[21]');
    expect(out[1]).toMatch(/^ibid \[27\]/i);
    expect(out[3]).toMatch(/Robinson<\/i> \(n 1\) \[55\]/);
    expect(out[5]).toMatch(/^ibid s\u00a0?\s?7/i);
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
  it('reads a CJK name with a space family first (#426)', () => {
    const [item] = parseBibtex('@book{k, author = {夏目 漱石 and 森 鷗外 and 张三 and Smith, John and Tanaka Kakuei}, title = {こころ}, year = {1914}}');
    expect(item!.author).toEqual([
      { family: '夏目', given: '漱石' }, { family: '森', given: '鷗外' }, { family: '张三' },
      { family: 'Smith', given: 'John' },
      // A romanised name keeps the BibTeX reading, given name first.
      { family: 'Kakuei', given: 'Tanaka' },
    ]);
  });
});

describe('what the cookbook recipes turned up', () => {
  const nums: CslItem[] = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, type: 'book', title: `T${i}`, author: [{ family: `F${i}`, given: 'G' }], issued: { 'date-parts': [[2000 + i]] } }));
  const western: CslItem = { id: 'rayner', type: 'article-journal', language: 'en', title: 'So much to read', 'container-title': 'PSPI', issued: { 'date-parts': [[2016]] }, author: [1, 2, 3, 4, 5].map((n) => ({ family: `Rayner${n}`, given: 'K' })) };

  it('IEEE joins consecutive numbers into a range unless asked not to', () => {
    const cluster = [{ mode: 'parenthetical' as const, items: [{ id: 'a' }] }, { mode: 'parenthetical' as const, items: [{ id: 'b' }, { id: 'c' }, { id: 'd' }] }];
    expect(engine.createProcessor({ style: 'ieee', locale: 'en-US', items: nums, collapseRanges: true }).cite(cluster)[1]).toBe('[2]–[4]');
    expect(engine.createProcessor({ style: 'ieee', locale: 'en-US', items: nums, collapseRanges: false }).cite(cluster)[1]).toBe('[2], [3], [4]');
    expect(engine.createProcessor({ style: 'elsevier-vancouver', locale: 'en-US', items: nums, collapseRanges: false }).cite(cluster)[1]).toBe('[2,3,4]');
  });

  it('GB/T 7714 writes et al. for a Western work and 等 for a Chinese one', () => {
    const p = engine.createProcessor({ style: 'china-national-standard-gb-t-7714-2015-numeric', locale: 'zh-CN', items: [western, items[2]!] });
    p.cite([{ mode: 'parenthetical' as const, items: [{ id: 'rayner' }] }, { mode: 'parenthetical' as const, items: [{ id: 'zhang2018' }] }]);
    const [en, zh] = p.bibliography().entries.map((e) => e.html);
    expect(en).toContain('et al.');
    expect(en).not.toContain('等');
    expect(zh).toContain('等');
  });

  it('GB/T 7714 numeric sets the page after the raised number', () => {
    const p = engine.createProcessor({ style: 'china-national-standard-gb-t-7714-2015-numeric', locale: 'zh-CN', items: [western] });
    expect(p.cite([{ mode: 'parenthetical' as const, items: [{ id: 'rayner', locator: '45', label: 'page' }] }])[0]).toBe('<sup>[1]</sup><sup>45</sup>');
  });

  it('Vancouver keeps a locator inside its brackets', () => {
    const p = engine.createProcessor({ style: 'elsevier-vancouver', locale: 'en-US', items: nums });
    expect(p.cite([{ mode: 'parenthetical' as const, items: [{ id: 'a', locator: '33', label: 'page' }] }])[0]).toBe('[1, p. 33]');
  });

  it('notes without numbers write a repeated work out again', () => {
    const style = 'china-national-standard-gb-t-7714-2015-note';
    const clusters = [{ mode: 'parenthetical' as const, items: [{ id: 'zhang2018' }], noteIndex: 1 }, { mode: 'parenthetical' as const, items: [{ id: 'garcia2020' }], noteIndex: 2 }, { mode: 'parenthetical' as const, items: [{ id: 'zhang2018' }], noteIndex: 3 }];
    const numbered = engine.createProcessor({ style, locale: 'zh-CN', items }).cite(clusters);
    expect(numbered[2]).toContain('同1');
    const inline = engine.createProcessor({ style, locale: 'zh-CN', items, unnumberedNotes: true }).cite(clusters);
    expect(inline[2]).not.toContain('同');
    expect(inline[2]).toBe(inline[0]);
  });

  it('ISO 690 in Spanish labels each locator', () => {
    const p = engine.createProcessor({ style: 'iso690-author-date-es', locale: 'es-ES', items });
    const [page, chapter] = p.cite([{ mode: 'parenthetical' as const, items: [{ id: 'garcia2020', locator: '33', label: 'page' }] }, { mode: 'parenthetical' as const, items: [{ id: 'garcia2020', locator: '2', label: 'chapter' }] }]);
    expect(page).toMatch(/p\.\u00a033\)$/);
    expect(chapter).toMatch(/cap\.\u00a02\)$/);
  });
});

describe('affixes (#528)', () => {
  const brown: CslItem[] = [
    { id: 'brown2020', type: 'book', author: [{ family: 'Brown', given: 'Tom' }, { family: 'Mann', given: 'Ben' }, { family: 'Ryder', given: 'Nick' }], title: 'Language Models', issued: { 'date-parts': [[2020]] } },
  ];

  it('print a suffix with no locator after its comma, and read the emphasis the core hands over', () => {
    const apa = engine.createProcessor({ style: 'apa', locale: 'en-US', items: brown });
    const [plain, rich, amp] = apa.cite([
      { mode: 'parenthetical', items: [{ id: 'brown2020', suffix: ', inter alia' }] },
      { mode: 'parenthetical', items: [{ id: 'brown2020', prefix: '<i>e.g.</i>,', suffix: ', <i>inter alia</i>' }] },
      { mode: 'parenthetical', items: [{ id: 'brown2020', prefix: 'A & B:' }] },
    ]);
    expect(plain).toBe('(Brown et\u00a0al., 2020, inter alia)');
    expect(rich).toBe('(<i>e.g.</i>, Brown et\u00a0al., 2020, <i>inter alia</i>)');
    // Escaped once, by citeproc-js.
    expect(amp).toBe('(A &#38; B: Brown et\u00a0al., 2020)');
  });

  it('set a narrative citation\'s suffix once, inside its parentheses', () => {
    const apa = engine.createProcessor({ style: 'apa', locale: 'en-US', items: brown });
    expect(apa.cite([
      { mode: 'narrative', items: [{ id: 'brown2020', suffix: ', see also' }] },
      { mode: 'narrative', items: [{ id: 'brown2020', locator: '3', label: 'page', suffix: ', <i>passim</i>' }] },
    ])).toEqual(['Brown et\u00a0al. (2020, see also)', 'Brown et\u00a0al. (2020, p. 3, <i>passim</i>)']);
  });
});

describe('BibTeX `and others` and Nature (#533)', () => {
  const bib = parseBibtex([
    '@article{tan, author={Tan, Wei and others}, title={Two}, journal={Nature}, volume={5}, pages={1--2}, year=2020}',
    '@article{smith, author={Smith, John and Doe, Jane and others}, title={Folding}, journal={Nature}, year=2021}',
    '@article{online, author={Jumper, John}, title={Proteins}, journal={Nature}, year=2021, doi={10.1038/s41586-021-03819-2}}',
  ].join('\n'));

  it('reads `and others` as the names left out, which every style prints as et al.', () => {
    expect(bib[0]!.author).toEqual([{ family: 'Tan', given: 'Wei' }, { literal: 'others' }]);
    const nature = engine.createProcessor({ style: 'nature', locale: 'en-US', items: bib });
    nature.cite([{ mode: 'parenthetical', items: [{ id: 'tan' }, { id: 'smith' }] }]);
    const [tan, smith] = nature.bibliography().entries.map((e) => e.html);
    expect(tan).toBe('Tan, W. <i>et\u00a0al.</i> Two. <i>Nature</i> <b>5</b>, 1–2 (2020).');
    expect(smith).toContain('Smith, J., Doe, J., <i>et\u00a0al.</i> Folding.');
    for (const html of [tan, smith]) expect(html).not.toMatch(/others|POSTEXT/);
    const apa = engine.createProcessor({ style: 'apa', locale: 'en-US', items: bib });
    expect(apa.cite([
      { mode: 'parenthetical', items: [{ id: 'tan' }] },
      { mode: 'narrative', items: [{ id: 'tan' }] },
    ])).toEqual(['(Tan et\u00a0al., 2020)', 'Tan et\u00a0al. (2020)']);
    const ieee = engine.createProcessor({ style: 'ieee', locale: 'en-US', items: bib });
    expect(ieee.cite([{ mode: 'narrative', items: [{ id: 'tan' }] }])[0]).toBe('Tan et\u00a0al. [1]');
    expect(ieee.bibliography().entries[0]!.html).toMatch(/^W\. Tan <i>et\u00a0al\.<\/i>, “Two,”/);
  });

  it('keeps "et al." on one line with a no-break space', () => {
    const vancouver = engine.createProcessor({ style: 'elsevier-vancouver', locale: 'en-US', items: bib });
    vancouver.cite([{ mode: 'parenthetical', items: [{ id: 'smith' }] }]);
    const [entry] = vancouver.bibliography().entries.map((e) => e.html);
    expect(entry).toContain('et\u00a0al.');
    expect(entry).not.toMatch(/et al\./);
  });

  it('prints the DOI of an article with no volume once in Nature', () => {
    const nature = engine.createProcessor({ style: 'nature', locale: 'en-US', items: bib });
    nature.cite([{ mode: 'parenthetical', items: [{ id: 'online' }] }]);
    const html = nature.bibliography().entries[0]!.html;
    expect(html.match(/10\.1038\/s41586-021-03819-2/g)).toHaveLength(2); // the link's href and its text
    expect(html).not.toContain('doi:');
    expect(html).toContain('(2021).');
  });
});
