import { describe, expect, it } from 'vitest';
import { buildBundle, buildDocument, renderToHtml, type PostextConfig, type VDTDocument } from 'postext';
import '../register';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
};

const FRONT = `---
references:
  - id: garcia2020
    type: book
    author: [{family: García, given: Ana}]
    title: Tipografía y lectura
    issued: 2020
    publisher: Trea
    language: es
  - id: lopez2019
    type: article-journal
    author: ["López, Luis", "Ruiz, Eva"]
    title: Leer en pantalla
    container-title: Revista de Letras
    volume: 12
    issue: 3
    page: 45-67
    issued: 2019-05-03
    DOI: 10.1000/xyz
    language: es
---
`;

/** The text of the document's lines, block by block (bibliography blocks
 *  flagged), with links. */
function lines(doc: VDTDocument): string[] {
  return doc.blocks.map((b) => b.lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join(' '));
}
function hrefs(doc: VDTDocument): string[] {
  return [...new Set(doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).map((s) => s.href).filter((h): h is string => !!h))))];
}
const entries = (doc: VDTDocument): string[] => doc.blocks.filter((b) => b.bibEntry).map((b) => b.bibEntry!);

describe('author-date (APA)', () => {
  const doc = buildDocument({ markdown: `${FRONT}# Uno\n\nAs [see @garcia2020, p. 33; @lopez2019] show, @garcia2020 [p. 4] says it.\n` }, config);

  it('formats parenthetical and narrative citations', () => {
    const text = lines(doc).join('\n');
    expect(text).toContain('(see García, 2020, p.\u00a033; López & Ruiz, 2019)');
    expect(text).toContain('García (2020, p.\u00a04) says it.');
  });

  it('appends the bibliography with its title, entries as anchors', () => {
    expect(entries(doc)).toEqual(['garcia2020', 'lopez2019']);
    expect(lines(doc).some((l) => l === 'References')).toBe(true);
    expect(doc.anchors!.map((a) => a.id)).toEqual(expect.arrayContaining(['ref-garcia2020', 'ref-lopez2019']));
  });

  it('links each citation to its entry, and the DOI to its URL', () => {
    expect(hrefs(doc)).toEqual(expect.arrayContaining(['#ref-garcia2020', 'https://doi.org/10.1000/xyz']));
    const html = renderToHtml(doc);
    expect(html).toContain('href="#pt-a-ref-garcia2020"');
    expect(html).toContain('id="pt-a-ref-garcia2020"');
  });
});

describe('numbered styles', () => {
  const md = `${FRONT}# One\n\nFirst [@lopez2019], then [@garcia2020; @lopez2019, p. 50].\n\n# Works cited\n\n:::bibliography{title=""}\n`;

  it('IEEE as the style writes it, with a label column', () => {
    const doc = buildDocument({ markdown: md }, { ...config, citations: { style: 'ieee' } });
    const text = lines(doc).join('\n');
    expect(text).toContain('First [1], then [1, p.\u00a050], [2].');
    expect(lines(doc).filter((_, i) => doc.blocks[i]!.bibEntry)[0]).toMatch(/^\[1\] L\. López and E\. Ruiz/);
    expect(lines(doc)).not.toContain('References');
  });

  it('a marker of the configuration’s own: superscript ranges', () => {
    const doc = buildDocument({ markdown: md }, { ...config, citations: { style: 'ieee', marker: 'superscript' } });
    const sups = doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.script === 'sup').map((s) => s.text)));
    expect(sups.join('')).toBe('11,2');
  });

  it('GB/T 7714 in Chinese: superscript bracket, 等 and type codes', () => {
    const zh = `---\nreferences:\n  - {id: zhang, type: book, language: zh-CN, author: [张三, 李四, 王五, 赵六], title: 排版学, issued: 2018, publisher: 商务印书馆, publisher-place: 北京}\n---\n# 一\n\n见[@zhang]。\n`;
    const doc = buildDocument({ markdown: zh }, { ...config, locale: 'zh-Hans', citations: { style: 'china-national-standard-gb-t-7714-2015-numeric' } });
    const sups = doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.script === 'sup').map((s) => s.text)));
    expect(sups.join('')).toContain('[1]');
    expect(lines(doc).join('\n')).toContain('张三, 李四, 王五, 等. 排版学[M]');
    expect(lines(doc)).toContain('参考文献');
  });
});

describe('note styles', () => {
  it('Chicago notes: each citation becomes a footnote', () => {
    const doc = buildDocument({ markdown: `${FRONT}# One\n\nA claim [@garcia2020, p. 33]. Another [@garcia2020, p. 34].\n` }, { ...config, citations: { style: 'chicago-notes-bibliography' } });
    const markers = doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.footnoteId !== undefined).map((s) => s.text)));
    expect(markers).toEqual(['1', '2']);
    const notes = doc.blocks.filter((b) => b.footnoteNote !== undefined).map((b) => b.lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join(' '));
    expect(notes[0]).toContain('García, Tipografía y lectura');
    expect(notes[1]).toContain('34');
  });
});

describe('references written in the text', () => {
  it('reads BibTeX from a :::references block, and nocite', () => {
    const md = `---\nnocite: "@knuth81"\n---\n# One\n\nSee [@lamport94].\n\n:::references{format=bibtex}\n@book{lamport94, author={Leslie Lamport}, title={LaTeX: A Document Preparation System}, publisher={Addison-Wesley}, year=1994}\n@article{knuth81, author={Knuth, Donald E. and Plass, Michael F.}, title={Breaking paragraphs into lines}, journal={Software: Practice and Experience}, year=1981, volume=11, pages={1119--1184}}\n:::\n`;
    const doc = buildDocument({ markdown: md }, config);
    expect(lines(doc).join('\n')).toContain('See (Lamport, 1994).');
    expect(entries(doc)).toEqual(['knuth81', 'lamport94']);
  });

  it('prints a citation as written when the book has no reference for it', () => {
    const doc = buildDocument({ markdown: '# One\n\nWrite to @maria or see [@x].\n' }, config);
    expect(lines(doc).join('\n')).toContain('Write to @maria or see [@x].');
    expect(entries(doc)).toEqual([]);
  });
});

describe('MLA narrative citations in the paragraph (#640)', () => {
  // The citeproc unit test covers the composite citation alone; this checks its join with
  // the words around it, on a justified line where a second space would stretch.
  const bib = `:::references{format=bibtex}
@book{stillinger1974, author={Stillinger, Jack}, title={The Texts of Keats's Poems}, publisher={Harvard UP}, year=1974}
@book{keatsletters, author={Keats, John}, title={Letters of John Keats to His Family and Friends}, shorttitle={Letters}, publisher={Macmillan}, year=1925}
@incollection{keatsode, author={Keats, John}, title={Ode on a Grecian Urn}, shorttitle={Ode}, booktitle={Lamia, Isabella, The Eve of St. Agnes, and Other Poems}, publisher={Taylor and Hessey}, year=1820, pages={113--116}}
:::
`;
  const md = `# One\n\nThe Annals text has no inverted commas, as @stillinger1974 records in his survey of the transcripts, and @stillinger1974 [212] gives the variants. Keats wrote of it [@keatsletters, 41; @keatsode, lines 1–3].\n\n${bib}`;
  const doc = buildDocument({ markdown: md }, { ...config, locale: 'en-US', bodyText: { textAlign: 'justify' }, citations: { style: 'modern-language-association' } });
  const para = doc.blocks.find((b) => b.lines.some((l) => (l.segments ?? []).some((s) => s.href === '#ref-stillinger1974')))!;
  const segments = para.lines.flatMap((l) => l.segments ?? []);

  it('a narrative citation with no locator is followed by one space', () => {
    const text = para.lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join(' ');
    expect(text).toContain('as Stillinger records in');
    expect(text).not.toMatch(/Stillinger\s{2}/);
    expect(text).toContain('Stillinger (212) gives');
  });

  it('no citation segment ends in a space before the following word', () => {
    const cited = segments.filter((s) => s.href === '#ref-stillinger1974');
    expect(cited.length).toBeGreaterThan(0);
    for (const s of cited) expect(s.text).not.toMatch(/\s$/);
    for (let i = 0; i + 1 < segments.length; i++) {
      if (/\s$/.test(segments[i]!.text)) expect(segments[i + 1]!.text).not.toMatch(/^\s/);
    }
  });

  it('BibTeX shorttitle tells two works by one author apart', () => {
    const text = lines(doc).join('\n');
    expect(text).toContain('(Keats, Letters 41; Keats, “Ode” 1–3)');
  });
});

describe('books', () => {
  it('numbers through the book and lists every work after the last chapter', () => {
    const docs = buildBundle({
      chapters: [
        { markdown: `${FRONT}# One\n\nFirst [@lopez2019].\n` },
        { markdown: `# Two\n\nThen [@garcia2020] and [@lopez2019].\n` },
      ],
      config: { ...config, citations: { style: 'ieee' } },
      resources: [],
    });
    expect(lines(docs[1]!).join('\n')).toContain('Then [2] and [1].');
    expect(entries(docs[0]!)).toEqual([]);
    expect(entries(docs[1]!)).toEqual(['lopez2019', 'garcia2020']);
  });

  it('per-chapter bibliographies list each chapter’s works', () => {
    const docs = buildBundle({
      chapters: [
        { markdown: `${FRONT}# One\n\nFirst [@lopez2019].\n` },
        { markdown: `# Two\n\nThen [@garcia2020].\n` },
      ],
      config: { ...config, citations: { bibliography: { scope: 'chapter' } } },
      resources: [],
    });
    expect(entries(docs[0]!)).toEqual(['lopez2019']);
    expect(entries(docs[1]!)).toEqual(['garcia2020']);
  });
});

describe('Chinese in vertical text (#277)', () => {
  const zh = `---\nreferences:\n  - {id: zhang, type: book, language: zh-CN, author: [张三, 李四, 王五, 赵六], title: 排版学, issued: 2018, publisher: 商务印书馆, publisher-place: 北京}\n  - {id: knuth, type: book, language: en, author: ["Knuth, Donald E."], title: The TeXbook, issued: 1984, publisher: Addison-Wesley}\n---\n# 第一章\n\n竖排的书也引用文献[@zhang, 页 12]，西文文献亦然[@knuth]。\n`;
  const vertical: PostextConfig = { ...config, locale: 'zh-Hans', layout: { layoutType: 'single', writingMode: 'vertical-rl' } };

  it('a numbered style in corner brackets, upright in the column', () => {
    const doc = buildDocument({ markdown: zh }, { ...vertical, citations: { style: 'china-national-standard-gb-t-7714-2015-numeric', marker: 'corner', bibliography: { groupByLanguage: true } } });
    const text = lines(doc).join('\n');
    expect(text).toContain('〔1〕12');
    expect(text).toContain('〔2〕');
    expect(entries(doc)).toEqual(['zhang', 'knuth']);
    expect(doc.pages[0]!.flow).toBeDefined();
  });

  it('a note style set as 夹注 inside the line', () => {
    const doc = buildDocument({ markdown: zh }, { ...vertical, citations: { style: 'china-national-standard-gb-t-7714-2015-note', notes: 'warichu' } });
    const warichu = doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.warichu)));
    expect(warichu.length).toBeGreaterThan(0);
    expect(doc.blocks.some((b) => b.footnoteNote !== undefined)).toBe(false);
  });
});

describe('the label column of a numbered list (#290)', () => {
  // Ten works, so labels [1]…[9] and [10] differ in width.
  const refs = Array.from({ length: 10 }, (_, i) => `  - {id: w${i + 1}, type: book, author: ["Author${i + 1}, Ann"], title: A rather long title that turns over onto a second line of the entry number ${i + 1}, issued: 2001, publisher: Press}`).join('\n');
  const cites = Array.from({ length: 10 }, (_, i) => `[@w${i + 1}]`).join(' ');
  const md = `---\nreferences:\n${refs}\n---\n# One\n\nText ${cites}.\n`;
  const bib = (doc: VDTDocument) => doc.blocks.filter((b) => b.bibEntry);
  const narrow: PostextConfig = { ...config, page: { ...config.page!, width: pt(140) } };
  /** Where the entry's text starts on its first line, after the label. */
  const textStart = (b: VDTDocument['blocks'][number]): number => {
    const line = b.lines[0]!;
    const segs = line.segments ?? [];
    let gap = -1;
    segs.forEach((s, i) => { if (s.labelTab) gap = i; });
    return line.bbox.x - b.bbox.x + segs.slice(0, gap + 1).reduce((w, s) => w + s.width, 0);
  };

  it('starts every entry’s text, [9] as [10], where its turnover lines start', () => {
    const doc = buildDocument({ markdown: md }, { ...narrow, citations: { style: 'ieee', bibliography: { labelWidth: { value: 3, unit: 'em' } } } });
    const entries = bib(doc);
    expect(entries).toHaveLength(10);
    const turnover = entries[0]!.lines[1]!.bbox.x - entries[0]!.bbox.x;
    for (const b of entries) {
      expect(b.lines.length).toBeGreaterThan(1);
      expect(textStart(b)).toBeCloseTo(turnover, 3);
    }
    // The label stays in the text.
    expect(entries[9]!.lines[0]!.text.startsWith('[10]')).toBe(true);
  });

  it('right-aligns the labels against the text', () => {
    const doc = buildDocument({ markdown: md }, { ...narrow, citations: { style: 'ieee', bibliography: { labelWidth: { value: 3, unit: 'em' }, labelAlign: 'right' } } });
    const entries = bib(doc);
    const end = (b: VDTDocument['blocks'][number]): number => {
      const segs = b.lines[0]!.segments ?? [];
      let gap = -1;
      segs.forEach((s, i) => { if (s.labelTab) gap = i; });
      return segs.slice(0, gap).reduce((w, s) => w + s.width, 0);
    };
    const turnover = entries[0]!.lines[1]!.bbox.x - entries[0]!.bbox.x;
    expect(end(entries[8]!)).toBeCloseTo(end(entries[9]!), 3);
    for (const b of entries) expect(textStart(b)).toBeCloseTo(turnover, 3);
  });

  it('holds in a Chinese list set by the CJK composer', () => {
    const zhRefs = Array.from({ length: 10 }, (_, i) => `  - {id: z${i + 1}, type: book, language: zh-CN, author: [作者${i + 1}], title: 一部书名相当长足以转到第二行的中文著作第${i + 1}种以及更多的文字, issued: 2001, publisher: 出版社, publisher-place: 北京}`).join('\n');
    const zhCites = Array.from({ length: 10 }, (_, i) => `[@z${i + 1}]`).join('');
    const doc = buildDocument({ markdown: `---\nreferences:\n${zhRefs}\n---\n# 一\n\n正文${zhCites}。\n` }, { ...narrow, locale: 'zh-Hans', citations: { style: 'china-national-standard-gb-t-7714-2015-numeric', bibliography: { labelWidth: { value: 3, unit: 'em' } } } });
    const entries = bib(doc);
    expect(entries).toHaveLength(10);
    const turnover = entries[0]!.lines[1]!.bbox.x - entries[0]!.bbox.x;
    for (const b of entries) expect(textStart(b)).toBeCloseTo(turnover, 3);
  });
});

describe('citations in prose and in Chinese (#309)', () => {
  it('reads a bracketed citation followed by a colon', () => {
    const doc = buildDocument({ markdown: `${FRONT}# One\n\nThe belt geographers call periglacial [@garcia2020]: the land around the ice.\n` }, config);
    expect(lines(doc).join('\n')).toContain('periglacial (García, 2020): the land');
  });

  it('keeps a numbered list in the order of its numbers with groupByLanguage', () => {
    const md = `---\nreferences:\n  - {id: en1, type: book, language: en, author: ["Glen, John"], title: Ice, issued: 1955, publisher: RS}\n  - {id: zh1, type: book, language: zh-CN, author: [施雅风], title: 冰川, issued: 1988, publisher: 科学出版社}\n---\n# 一\n\n见[@en1]与[@zh1]。\n`;
    const numeric = buildDocument({ markdown: md }, { ...config, locale: 'zh-Hans', citations: { style: 'china-national-standard-gb-t-7714-2015-numeric', bibliography: { groupByLanguage: true } } });
    expect(entries(numeric)).toEqual(['en1', 'zh1']);
    const authorDate = buildDocument({ markdown: md }, { ...config, locale: 'zh-Hans', citations: { style: 'china-national-standard-gb-t-7714-2015-author-date', bibliography: { groupByLanguage: true } } });
    expect(entries(authorDate)).toEqual(['zh1', 'en1']);
  });

  it('shows a missing key of a citation of several works on the page', () => {
    const doc = buildDocument({ markdown: `${FRONT}# One\n\nAs [@nye1953; @garcia2020, p. 519] showed.\n` }, config);
    const text = lines(doc).join('\n');
    expect(text).toContain('(García, 2020, p. 519) @nye1953 showed.');
    const bold = doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.bold).map((s) => s.text))).join('');
    expect(bold).toContain('@nye1953');
  });

  it('sets an author-date citation in Chinese text with full-width marks', () => {
    const md = `---\nreferences:\n  - {id: shi, type: book, language: zh-CN, author: [施雅风, 黄茂桓], title: 中国冰川概论, issued: 1988, publisher: 科学出版社, publisher-place: 北京}\n  - {id: liu, type: book, language: zh-CN, author: [刘时银], title: 冰川编目, issued: 2015, publisher: 科学出版社, publisher-place: 北京}\n---\n# 一\n\n冰川最多的国家[@shi; @liu]，正如@liu所说。\n`;
    const doc = buildDocument({ markdown: md }, { ...config, locale: 'zh-Hans', citations: { style: 'china-national-standard-gb-t-7714-2015-author-date' } });
    const text = lines(doc).join('');
    expect(text).toMatch(/国家（施雅风[^）]*，1988；刘时银，2015）/);
    expect(text).toContain('刘时银（2015）');
  });

  it('drops a 夹注 note’s full stop before a Chinese mark', () => {
    const md = `---\nreferences:\n  - {id: liu, type: article-journal, language: zh-CN, author: [刘时银], title: 冰川编目, container-title: 地理学报, volume: 70, page: 3-16, issued: 2015, DOI: 10.11821/dlxb201501001}\n---\n# 一\n\n冰川[@liu]，其余。\n`;
    const doc = buildDocument({ markdown: md }, { ...config, locale: 'zh-Hans', citations: { style: 'china-national-standard-gb-t-7714-2015-note', notes: 'warichu' } });
    const note = doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.warichu))).map((s) => s.text).join('');
    expect(note).toContain('dlxb201501001');
    expect(note.endsWith('.')).toBe(false);
  });

  it('bundles GB/T 7714—2025', () => {
    const md = `---\nreferences:\n  - {id: shi, type: book, language: zh-CN, author: [施雅风, 黄茂桓], title: 中国冰川概论, issued: 1988, publisher: 科学出版社, publisher-place: 北京}\n---\n# 一\n\n冰川[@shi]。\n`;
    for (const style of ['numeric', 'author-date', 'note']) {
      const doc = buildDocument({ markdown: md }, { ...config, locale: 'zh-Hans', citations: { style: `china-national-standard-gb-t-7714-2025-${style}` } });
      expect(lines(doc).join('\n')).toContain('施雅风，黄茂桓');
    }
  });
});

describe('numbering and lists with citeproc-js (#537, #534)', () => {
  const refs = `---
references:
  - {id: a, type: book, author: [{family: Alpha, given: A}], title: Uno, issued: 2001, publisher: P}
  - {id: b, type: book, author: [{family: Beta, given: B}], title: Dos, issued: 2002, publisher: P}
  - {id: c, type: book, author: [{family: Gamma, given: C}], title: Tres, issued: 2003, publisher: P}
  - {id: d, type: book, author: [{family: Delta, given: D}], title: Cuatro, issued: 2004, publisher: P}
---
`;
  const text = (doc: VDTDocument) => lines(doc).map((t) => t.replace(/ /g, ' '));

  it("restarts IEEE numbers in each chapter with numbering: 'chapter'", () => {
    const md = `${refs}# One\n\nSee [@a], [@b] and [@c].\n\n# Two\n\nAgain [@c], then [@d].\n`;
    const doc = buildDocument({ markdown: md }, { ...config, citations: { style: 'ieee', numbering: 'chapter', bibliography: { scope: 'chapter' } } });
    expect(text(doc).find((t) => t.startsWith('Again'))).toBe('Again [1], then [2].');
    const labels = doc.blocks.filter((b) => b.bibEntry).map((b) => `${b.bibEntry}:${text({ ...doc, blocks: [b] })[0]!.slice(0, 3)}`);
    expect(labels).toEqual(['a:[1]', 'b:[2]', 'c:[3]', 'c:[1]', 'd:[2]']);
  });

  it('splits a Nature list after the Methods with scope=new, numbered on', () => {
    const md = `${refs}Main [@a] and [@b].\n\n:::bibliography{scope=new}\n\n## Methods\n\nWe used [@b] and [@c].\n\n:::bibliography{scope=new title=""}\n`;
    const doc = buildDocument({ markdown: md }, { ...config, citations: { style: 'nature', marker: 'brackets' } });
    expect(entries(doc)).toEqual(['a', 'b', 'c']);
    expect(text(doc).find((t) => t.startsWith('We used'))).toBe('We used [2] and [3].');
  });
});
