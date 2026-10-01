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
    expect(text).toContain('(see García, 2020, p. 33; López & Ruiz, 2019)');
    expect(text).toContain('García (2020, p. 4) says it.');
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
    expect(text).toContain('First [1], then [1, p. 50], [2].');
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
