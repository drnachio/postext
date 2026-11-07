import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types.js';
import { exportDocx, exportProblems, looseMarkup } from './fixtures/harness.js';
import { orderProblems } from './inspect.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>');

const figure: Resource = { id: 'fig1', typeId: 'figure', kind: 'bitmap', caption: 'A *red* dot', note: 'Source: me', altText: 'Dot', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1', format: 'png', width: 100, height: 50 } };
const vector: Resource = { id: 'vec', typeId: 'figure', kind: 'svg', caption: 'Lines', createdAt: 0, updatedAt: 0, svg: { fileId: 'v1', width: 40, height: 20 } };
const table: Resource = {
  id: 't1',
  typeId: 'table',
  kind: 'table',
  caption: 'Data',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      columnWidths: [2, 1],
      rows: [
        [{ content: 'Head', colSpan: 2 }, { content: '', hiddenBy: { row: 0, col: 0 } }],
        [{ content: '**a**', rowSpan: 2, align: 'center' }, { content: 'b', background: { hex: '#ffeeaa', model: 'hex' } }],
        [{ content: '', hiddenBy: { row: 1, col: 0 } }, { content: 'c $y^2$' }],
      ],
    },
  },
};
const resources = [figure, vector, table];
const bytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : id === 'v1' ? SVG : undefined);
const fields = (f: { target: { kind: string } & Record<string, unknown> }): string | undefined => {
  const t = f.target as { kind: string; resourceId?: string; field?: string; row?: number; col?: number };
  const r = resources.find((x) => x.id === t.resourceId);
  if (!r) return undefined;
  return t.field === 'cell' ? r.table!.model.rows[t.row!]![t.col!]!.content : (r as unknown as Record<string, string>)[t.field!];
};

describe('semantic docx: text', () => {
  it('maps inline formatting, links and code character by character', async () => {
    const md = 'Some **bold**, *it*, :smallcaps[Sc] ^sup^ ~sub~, [link](https://postext.dev) and `code`.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const f = e.frag('Some bold, it, Sc sup sub, link and code.');
    expect(f.formats).toEqual([
      { start: 5, end: 9, flags: 'b' },
      { start: 11, end: 13, flags: 'i' },
      { start: 15, end: 17, flags: 'c' },
      { start: 18, end: 21, flags: 'p' },
      { start: 22, end: 25, flags: 's' },
      { start: 27, end: 31, flags: '', href: 'https://postext.dev' },
      { start: 36, end: 40, flags: 'k' },
    ]);
    expect(e.doc).toContain('<w:b/><w:bCs/>');
    expect(e.doc).toContain('<w:vertAlign w:val="superscript"/>');
    expect(e.doc).toMatch(/<w:hyperlink r:id="rIdLink1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/>/);
    expect(e.doc).toContain('<w:rStyle w:val="PostextCodeChar"/>');
    expect(e.part('word/_rels/document.xml.rels')).toContain('Target="https://postext.dev" TargetMode="External"');
  });

  it('writes headings with outline levels and named heading styles', async () => {
    const md = '# One {#start}\n\n## Two\n\n### Three {style="kicker"}\n';
    const e = await exportDocx(md, { config: { headingStyles: [{ id: 'kicker', name: 'Kicker' }] } as never });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('<w:pStyle w:val="Heading1"/><w:outlineLvl w:val="0"/>');
    expect(e.doc).toContain('<w:pStyle w:val="Heading2"/><w:outlineLvl w:val="1"/>');
    expect(e.doc).toContain('<w:bookmarkStart w:id="2" w:name="start"/>');
    expect(e.doc).toContain('<w:pStyle w:val="PostextHeadingkicker3"/>');
    expect(e.part('word/styles.xml')).toContain('<w:name w:val="Heading 3: Kicker"/><w:basedOn w:val="Heading3"/>');
    expect(e.frag('Three').role).toBe('heading:3:kicker');
  });

  it('turns atoms into rendered text that stands for the whole markup', async () => {
    const md = 'See :ref{id="fig1"}, @smith, [@smith, p. 3], :chip[Hi]{style="k"}, :swatch{color="#f00"} and :tab{at="4cm"}x.\n\n::resource{id="fig1"}\n';
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    expect(exportProblems(e, [md], fields)).toEqual([]);
    const f = e.map.fragments.find((x) => x.role === 'body')!;
    const kinds = (f.atoms ?? []).map((a) => [a.kind, md.slice(a.start, a.end)]);
    expect(kinds).toEqual([
      ['ref', ':ref{id="fig1"}'],
      ['citation', '@smith'],
      ['citation', '[@smith, p. 3]'],
      ['chip', ':chip[Hi]{style="k"}'],
      ['swatch', ':swatch{color="#f00"}'],
      ['tab', ':tab{at="4cm"}'],
    ]);
    expect(f.text).toBe('See Fig.\u00a01, @smith, [@smith, p. 3], Hi, \u25A0 and\tx.');
    expect(e.doc).toContain('<w:rStyle w:val="PostextReference"/>');
    expect(e.doc).toContain('<w:color w:val="FF0000"/>');
  });

  it('keeps forced breaks as w:br atoms and verse as lines', async () => {
    const md = 'First line\\\nsecond line.\n\n:::verse\nOne line\nanother line\n:::\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const f = e.frag('First line\nsecond line.');
    expect(f.atoms).toEqual([{ at: 10, start: 10, end: 12, kind: 'break' }]);
    const verse = e.frag('One line\nanother line');
    expect(verse.map[8]).toBe(md.indexOf('\nanother'));
    expect(e.doc).toContain('<w:pStyle w:val="PostextVerse"/>');
    expect(looseMarkup(e.doc)).toEqual([]);
  });

  it('sets index marks as XE fields and anchors as bookmarks', async () => {
    const md = 'The heart:index{term="Heart!valves" main} beats [here]{#beat} again.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('<w:instrText xml:space="preserve"> XE "Heart:valves" \\b </w:instrText>');
    expect(e.doc).toMatch(/<w:bookmarkStart w:id="\d+" w:name="beat"\/><w:bookmarkEnd w:id="\d+"\/><w:r><w:t xml:space="preserve">here/);
    expect(e.frag('The heart beats here again.').map[8]).toBe(md.indexOf(':index') - 1);
  });

  it('writes maths as OMML atoms, and unconvertible maths as source', async () => {
    const md = 'Inline $x^2$ here.\n\n$$\n\\frac{a}{b}\n$$\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const inline = e.frag('Inline \uFFFC here.');
    expect(inline.atoms).toEqual([{ at: 7, start: 7, end: 12, hash: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'math' }]);
    expect(e.doc).toContain('<m:oMath><m:sSup>');
    expect(e.doc).toContain('<m:oMathPara><m:oMath><m:f>');
    const display = e.map.fragments.find((f) => f.role === 'math')!;
    expect(md.slice(display.atoms![0]!.start, display.atoms![0]!.end)).toBe('$$\n\\frac{a}{b}\n$$');
  });

  it('writes code listings in the code style, one fragment each', async () => {
    const md = '```js\nlet a = 1;\n\tb();\n```\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag('let a = 1;\n\tb();').role).toBe('code:js');
    expect(e.doc).toMatch(/<w:pStyle w:val="PostextCode"\/>.*<w:br\/>.*<w:tab\/>/);
  });
});

describe('semantic docx: structures', () => {
  it('writes Word lists with their own numbering', async () => {
    const md = '- a\n  - b\n\n3. three\n4. four\n\n- [ ] todo\n- [x] done\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const numbering = e.part('word/numbering.xml');
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(numbering).toContain('<w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>');
    expect(numbering).toContain('<w:startOverride w:val="3"/>');
    expect(numbering).toContain('w:val="\u2611"');
    expect(e.doc).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>');
    expect(orderProblems(numbering)).toEqual([]);
    expect(e.frag('b').role).toBe('list:unordered:2');
  });

  it('sets cited notes as Word footnotes and keeps orphans as source', async () => {
    const md = 'Text[^a] and more.\n\n[^a]: The *note*.\n\n[^b]: Orphan.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const notes = e.part('word/footnotes.xml');
    expect(notes).toContain('<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/>');
    expect(e.doc).toContain('<w:footnoteReference w:id="1"/>');
    expect(e.doc).not.toContain('The ');
    const fragments = e.map.fragments;
    expect(fragments[fragments.length - 1]!.role).toBe('footnote');
    expect(e.frag('Text\uFFFC and more.').atoms).toEqual([{ at: 4, start: 4, end: 8, kind: 'footnote' }]);
    expect(e.frag('[^b]: Orphan.').role).toBe('raw:footnote');
  });

  it('marks a content control that opens on a noted paragraph as a document part (#1444)', async () => {
    // LibreOffice refuses the whole file when a plain block control's
    // first paragraph holds a footnote reference; the second one loads.
    const md = ':::paragraphs{style="verse"}\nFirst line[^a]\n\nSecond line[^b]\n:::\n\n:::paragraphs{style="verse"}\nPlain line\n\nNoted line[^b]\n:::\n\n[^a]: One.\n\n[^b]: Two.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const sdts = e.doc.match(/<w:sdt><w:sdtPr>(?:(?!<\/w:sdtPr>).)*<\/w:sdtPr>/g) ?? [];
    const verse = sdts.filter((s) => s.includes('ptx:paragraphs:verse'));
    expect(verse).toHaveLength(2);
    expect(verse[0]).toContain('<w:docPartObj><w:docPartGallery w:val="Postext"/></w:docPartObj></w:sdtPr>');
    expect(verse[1]).not.toContain('docPartObj');
  });

  it('sets a box as a content control around a shaded one-cell table', async () => {
    const md = ':::callout{type="note" title="My **title**"}\nInside the box.\n\n- item\n:::\n';
    const e = await exportDocx(md, {
      config: { calloutStyles: [{ id: 'note', name: 'Note', background: { hex: '#eef4ff', model: 'hex' }, border: { enabled: true, color: { hex: '#2244aa', model: 'hex' }, width: { value: 1, unit: 'pt' } } }] } as never,
    });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/<w:sdt><w:sdtPr><w:alias w:val="\{&quot;type&quot;:&quot;note&quot;,&quot;title&quot;:&quot;My \*\*title\*\*&quot;\}"\/><w:tag w:val="ptx:box:note"\/>/);
    expect(e.doc).toContain('<w:shd w:val="clear" w:color="auto" w:fill="EEF4FF"/>');
    expect(e.doc).toContain('w:color="2244AA"');
    const title = e.frag('My **title**');
    expect(md.slice(title.range[0], title.range[1])).toBe('My **title**');
    expect(e.frag('Inside the box.').role).toBe('para:PostextBoxnote');
    expect(looseMarkup(e.doc)).toEqual([]);
  });

  it('gives paragraph groups their Word style and keeps parts as content controls', async () => {
    const md = ':::paragraphs{style="epigraph"}\nA quiet line.\n:::\n\n:::part{number="I" title="Foundations"}\n1. Why\n:::\n';
    const e = await exportDocx(md, { config: { paragraphStyles: [{ id: 'epigraph', name: 'Epigraph', italic: true }] } as never });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('<w:tag w:val="ptx:paragraphs:epigraph"/>');
    expect(e.doc).toContain('<w:pStyle w:val="PostextParaepigraph"/>');
    expect(e.part('word/styles.xml')).toMatch(/<w:name w:val="Epigraph"\/>.*?<w:i\/>/);
    expect(e.frag('Foundations').role).toBe('attr:part:title');
    expect(e.frag('I').role).toBe('attr:part:number');
    expect(looseMarkup(e.doc)).toEqual([]);
  });

  it('keeps what Word cannot express as exact source in raw content controls', async () => {
    const md = '---\ntitle: "T"\n---\n\n:::toc\n\n:::exercise{type="choice"}\nPick one.\n:::\n\n:::pagebreak\n\nAfter.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag('---\ntitle: "T"\n---').role).toBe('raw:frontmatter');
    expect(e.frag(':::toc').role).toBe('raw:toc');
    expect(e.frag(':::exercise{type="choice"}\nPick one.\n:::').role).toBe('raw:exercise');
    expect(e.doc).toContain('<w:tag w:val="ptx:raw:exercise"/>');
    expect(e.doc).toContain('<w:pStyle w:val="PostextSource"/>');
    expect(e.doc).toContain('<w:tag w:val="ptx:pagebreak"/>');
    expect(e.doc).toContain('<w:br w:type="page"/>');
    expect(looseMarkup(e.doc)).toEqual([]);
  });

  it('writes pictures with captions mapped to the resource or to the figure', async () => {
    const md = '::resource{id="fig1"}\n\n:::figure{resource="vec" caption="Own *words*"}\n:::\n';
    const rasterizeSvg = async (): Promise<Uint8Array> => PNG.slice();
    const e = await exportDocx(md, { resources, resourceBytes: bytes, rasterizeSvg });
    expect(exportProblems(e, [md], fields)).toEqual([]);
    expect(e.doc).toContain('<wp:docPr id="1" name="fig1" descr="Dot"/>');
    expect(e.doc).toContain('<asvg:svgBlip r:embed="rIdImg2"/>');
    expect(e.doc).toContain('<w:instrText xml:space="preserve"> SEQ figure \\* ARABIC </w:instrText>');
    expect(e.frag('A red dot').target).toEqual({ kind: 'resource', resourceId: 'fig1', field: 'caption' });
    expect(e.frag('Source: me').target).toEqual({ kind: 'resource', resourceId: 'fig1', field: 'note' });
    const own = e.frag('Own words');
    expect(own.target).toEqual({ kind: 'markdown', chapter: 0 });
    expect(md.slice(own.range[0], own.range[1])).toBe('Own *words*');
    expect(Object.keys(e.files).filter((p) => p.startsWith('word/media/'))).toEqual(['word/media/image1.png', 'word/media/image2.svg']);
    expect(e.map.snapshot?.resources && Object.keys(e.map.snapshot.resources).sort()).toEqual(['fig1', 'vec']);
  });

  it('warns about an SVG it cannot give a bitmap fallback', async () => {
    const e = await exportDocx('::resource{id="vec"}\n', { resources, resourceBytes: bytes });
    expect(e.warnings.map((w) => w.code)).toEqual(['svgWithoutFallback']);
    expect(e.doc).not.toContain('<w:drawing>');
  });

  it('writes table resources as Word tables with spans, fills and cell targets', async () => {
    const md = '::resource{id="t1"}\n';
    const e = await exportDocx(md, { resources });
    expect(exportProblems(e, [md], fields)).toEqual([]);
    expect(e.doc).toContain('<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>');
    expect(e.doc).toContain('<w:gridSpan w:val="2"/>');
    expect(e.doc).toContain('<w:vMerge w:val="restart"/>');
    expect(e.doc).toContain('<w:vMerge/>');
    expect(e.doc).toContain('w:fill="FFEEAA"');
    expect(e.doc).toMatch(/<w:tblGrid><w:gridCol w:w="(\d+)"\/><w:gridCol w:w="(\d+)"\/><\/w:tblGrid>/);
    expect(e.frag('b').target).toEqual({ kind: 'resource', resourceId: 't1', field: 'cell', row: 1, col: 1 });
    expect(e.frag('c \uFFFC').atoms).toEqual([{ at: 2, start: 2, end: 7, hash: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'math' }]);
  });
});

describe('semantic docx: book', () => {
  it('sets page size, margins and columns from the config, a section per chapter', async () => {
    const config = {
      page: { sizePreset: '21x28', width: { value: 21, unit: 'cm' }, height: { value: 28, unit: 'cm' }, margins: { top: { value: 2, unit: 'cm' }, bottom: { value: 2, unit: 'cm' }, left: { value: 2.5, unit: 'cm' }, right: { value: 1.5, unit: 'cm' }, mirror: true } },
      layout: { layoutType: 'oneAndHalf', gutterWidth: { value: 0.5, unit: 'cm' }, sideColumnPercent: 30 },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
    } as never;
    const e = await exportDocx(['# One\n\nText.\n', '# Two\n\nMore.\n'], { config });
    expect(exportProblems(e, ['# One\n\nText.\n', '# Two\n\nMore.\n'])).toEqual([]);
    const sects = e.doc.match(/<w:sectPr>.*?<\/w:sectPr>/g)!;
    expect(sects).toHaveLength(2);
    expect(sects[0]).toContain('<w:pgSz w:w="11906" w:h="15874"/>');
    expect(sects[0]).toContain('w:top="1134" w:right="850" w:bottom="1134" w:left="1417"');
    expect(sects[0]).toMatch(/<w:cols w:num="2" w:equalWidth="0" w:space="283"><w:col w:w="\d+" w:space="283"\/><w:col w:w="\d+"\/><\/w:cols>/);
    expect(sects[0]).toContain('<w:titlePg/>');
    expect(sects[1]).toContain('<w:type w:val="oddPage"/>');
    expect(e.part('word/settings.xml')).toContain('<w:mirrorMargins/>');
    expect(e.part('word/header1.xml')).toContain('Chapter 1');
    expect(e.doc).toContain('w:name="chapter_ch2"');
    expect(e.map.chapters.map((c) => c.id)).toEqual(['ch1', 'ch2']);
    expect(e.frag('More.').target).toEqual({ kind: 'markdown', chapter: 1 });
  });

  it('styles mirror the book and use the font plan families', async () => {
    const plan = { faces: [], warnings: [], altNames: new Map(), map: new Map([['Lora|400|normal', { family: 'Lora PTX', bold: false, italic: false }]]) };
    const e = await exportDocx('Text.\n', { config: { bodyText: { fontFamily: 'Lora, serif', fontSize: { value: 11, unit: 'pt' }, color: { hex: '#222222', model: 'hex' } } } as never, fonts: plan });
    const styles = e.part('word/styles.xml');
    expect(styles).toMatch(/<w:style w:type="paragraph" w:default="1" w:styleId="Normal">.*?<w:rFonts w:ascii="Lora PTX"[^>]*\/>.*?<w:color w:val="222222"\/>.*?<w:sz w:val="22"\/>/);
    expect(orderProblems(styles)).toEqual([]);
  });

  it('records the export id, variant and snapshot, byte-identical for a fixed date', async () => {
    const md = '# Title\n\nBody.\n';
    const a = await exportDocx(md);
    const b = await exportDocx(md);
    expect(a.bytes.length).toBe(b.bytes.length);
    expect(a.bytes.every((x, i) => x === b.bytes[i])).toBe(true);
    const custom = a.part('docProps/custom.xml');
    expect(custom).toContain(`<vt:lpwstr>${a.map.exportId}</vt:lpwstr>`);
    expect(custom).toContain('<vt:lpwstr>semantic</vt:lpwstr>');
    expect(a.map.variant).toBe('semantic');
    expect(a.map.snapshot?.chapters).toEqual([{ id: 'ch1', markdown: md }]);
    expect(a.map.createdAt).toBe('2026-11-04T00:00:00Z');
  });
});
