import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseMarkdown } from '../parse';
import type { PostextConfig } from '../types';
import { analyzeDocx } from './analyze';
import { readDocx } from './docxRead';
import { parseInline, renderInline } from './inline';
import { displayStyleName, emptyTemplate, guessCharacterTarget, guessParagraphTarget, parseTemplate, type WordTemplate } from './template';
import { postextToDocx } from './toDocx';
import { wordToPostext } from './toMarkdown';

const config = {
  paragraphStyles: [{ id: 'verso', name: 'Verso', italic: true }, { id: 'firma', name: 'Firma' }],
  calloutStyles: [{ id: 'note', name: 'Nota' }, { id: 'keypoints', name: 'Ideas clave' }],
  chipStyles: [{ id: 'key', name: 'Tecla' }],
  headingStyles: [{ id: 'portada', name: 'Portada' }],
} as unknown as PostextConfig;

function roundTrip(markdown: string, template: WordTemplate = emptyTemplate()) {
  const bytes = postextToDocx([{ title: 'One', markdown }], { template, config, book: false });
  const doc = readDocx(bytes);
  const embedded = parseTemplate(doc.embeddedTemplate);
  expect(embedded).toBeDefined();
  const result = wordToPostext(doc, { template: embedded!, config, chapters: 'single', existingIds: new Set(), untitledChapter: 'Untitled' });
  return result.chapters[0]!.markdown;
}

const OFFSET_KEYS = new Set(['sourceStart', 'sourceEnd', 'sourceMap', 'lineStart', 'attrSources']);

/** The blocks as the engine reads them, without source offsets, footnote
 *  ids numbered in order (Word numbers its notes). */
function blocksOf(markdown: string) {
  const ids = new Map<string, string>();
  const id = (v: string): string => {
    if (!ids.has(v)) ids.set(v, String(ids.size + 1));
    return ids.get(v)!;
  };
  return JSON.parse(JSON.stringify(parseMarkdown(markdown), (k, v) => {
    if (OFFSET_KEYS.has(k) || /[a-z](Start|End)$/.test(k)) return undefined;
    if (k === 'footnoteDef' && typeof v === 'string') return id(v);
    if (k === 'footnote' && v && typeof v.id === 'string') return { ...v, id: id(v.id) };
    return v;
  }));
}

describe('inline marks', () => {
  const cases = [
    'Plain text with nothing.',
    'Some **bold**, some *italic* and ***both***.',
    'Bold with **an *italic* inside** it.',
    'H~2~O and E = mc^2^ and x^n^.',
    'A link to [the site](https://postext.dev/docs) here.',
    'Press :chip[Ctrl]{style="key"} + :chip[C]{style="key"}.',
    'Enter :smallcaps[Hamlet] and :smallcaps[Horatio].',
    'See :ref{id="fig-1"} and $x^2 + y$ for that.',
    'A note.[^1] Another.[^two]',
    'Escaped \\* star, \\_ under, \\$5 and `code *x*`.',
    'snake_case stays and a lone * star.',
    'Index mark:index{term="Heart!valves"} here.',
    'A forced\\\nline break and **one\\\ninside** bold.',
  ];
  for (const md of cases) {
    it(`round-trips: ${md}`, () => {
      const runs = parseInline(md, { notes: new Set(['1', 'two']) });
      expect(renderInline(runs)).toBe(md);
    });
  }
});

describe('Markdown → Word → Markdown', () => {
  it('keeps headings, paragraph styles, quotes, lists and notes', () => {
    const md = [
      '# The lantern {style="portada"}',
      '',
      'The keeper climbed the tower every evening.[^steps] The wind put out his **candle**.',
      '',
      '## Parts {toc="false"}',
      '',
      '> A quote, with *italics*.',
      '',
      '- First item',
      '- Second item',
      '  - Nested item',
      '- Third item',
      '',
      '1. One',
      '2. Two',
      '   1. Two point one',
      '3. Three',
      '',
      ':::paragraphs{style="verso"}',
      'Nunca fuera caballero',
      '',
      'de damas tan bien servido',
      ':::',
      '',
      ':::callout{type="note" title="Remember"}',
      'Inside the box, with :chip[Esc]{style="key"}.',
      '',
      '- a list in a box',
      ':::',
      '',
      '::resource{id="fig-lamp"}',
      '',
      '$$E = mc^2$$',
      '',
      ':::pagebreak',
      '',
      'Last paragraph.',
      '',
      '[^steps]: The staircase has 112 steps.',
    ].join('\n');
    const back = roundTrip(md);
    expect(blocksOf(back)).toEqual(blocksOf(md));
  });

  it('keeps front matter and raw blocks verbatim', () => {
    const md = [
      '---',
      'title: "Pintura"',
      'author: "Anon"',
      '---',
      '',
      '# Uno',
      '',
      ':::verse{gap=2em}',
      'first || second',
      '',
      'third || fourth',
      ':::',
      '',
      'Text after.',
    ].join('\n');
    const back = roundTrip(md);
    expect(back).toContain('---\ntitle: "Pintura"\nauthor: "Anon"\n---');
    expect(back).toContain(':::verse{gap=2em}\nfirst || second\n\nthird || fourth\n:::');
    expect(blocksOf(back)).toEqual(blocksOf(md));
  });

  it('keeps a poem set line by line: its indents and stanza breaks (#620)', () => {
    const md = [
      'Before.',
      '',
      ':::verse{style="verso"}',
      'Whose woods these are I think I know.',
      '  His house is in the village though;',
      '',
      '',
      'He will not see me stopping here',
      '\tTo watch his woods fill up with snow.',
      ':::',
      '',
      'After.',
    ].join('\n');
    const back = roundTrip(md);
    expect(back).toContain(':::verse{style="verso"}\nWhose woods these are I think I know.\n  His house is in the village though;\n\n\nHe will not see me stopping here\n\tTo watch his woods fill up with snow.\n:::');
    expect(blocksOf(back)).toEqual(blocksOf(md));
  });

  it('keeps two adjacent paragraph groups of one style apart', () => {
    const md = ':::paragraphs{style="firma"}\nA\n:::\n\n:::paragraphs{style="firma"}\nB\n:::\n';
    expect(blocksOf(roundTrip(md))).toEqual(blocksOf(md));
  });

  it('rebuilds a book from chapter markers', () => {
    const bytes = postextToDocx(
      [{ title: 'Uno', markdown: '# Uno\n\nTexto uno.' }, { title: 'Dos', markdown: '# Dos\n\nTexto dos.' }],
      { template: emptyTemplate(), config, book: true },
    );
    const doc = readDocx(bytes);
    const result = wordToPostext(doc, { template: parseTemplate(doc.embeddedTemplate)!, config, chapters: 'split', existingIds: new Set(), untitledChapter: 'Untitled' });
    expect(result.chapters.map((c) => c.title)).toEqual(['Uno', 'Dos']);
    expect(result.chapters[1]!.markdown).toBe('# Dos\n\nTexto dos.\n');
  });
});

// ---------------------------------------------------------------------------
// A hand-made Word document (as an author would send it)
// ---------------------------------------------------------------------------

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function docx(body: string, extra: { styles?: string; numbering?: string; footnotes?: string } = {}): Uint8Array {
  const style = (type: string, id: string, name: string, more = ''): string => `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${more}</w:style>`;
  const styles = `<w:styles ${W}>${style('paragraph', 'Normal', 'Normal').replace('<w:style ', '<w:style w:default="1" ')}${style('paragraph', 'Ttulo1', 'heading 1')}${style('paragraph', 'Ttulo2', 'heading 2')}${style('paragraph', 'Cita', 'Quote')}${style('paragraph', 'BoxTitle', 'Box Title')}${style('paragraph', 'BoxText', 'Box Text')}${style('paragraph', 'Verso', 'Verso')}${style('paragraph', 'Caption', 'caption')}${style('character', 'Strong', 'Strong', '<w:rPr><w:b/></w:rPr>')}${style('character', 'Tecla', 'Tecla')}${extra.styles ?? ''}</w:styles>`;
  const numbering = extra.numbering ?? `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const footnotes = extra.footnotes ?? `<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> A </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>note</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p></w:footnote></w:footnotes>`;
  const rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="r3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="r4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/a_b" TargetMode="External"/></Relationships>';
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<w:document ${W}><w:body>${body}</w:body></w:document>`),
    'word/styles.xml': strToU8(styles),
    'word/numbering.xml': strToU8(numbering),
    'word/footnotes.xml': strToU8(footnotes),
    'word/_rels/document.xml.rels': strToU8(rels),
  });
}

const p = (style: string, runs: string, pPr = ''): string => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${pPr}</w:pPr>${runs}</w:p>`;
const r = (text: string, rPr = ''): string => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const list = (numId: number, ilvl = 0): string => `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`;

describe('Word → Postext', () => {
  const body = [
    p('Ttulo1', r('Capítulo uno')),
    p('', r('Texto con ') + r('negrita', '<w:b/>') + r(' y ') + r('cursiva', '<w:i/>') + r(' y una nota.') + '<w:r><w:footnoteReference w:id="1"/></w:r>'),
    p('', r('Pulsa ') + r('Esc', '<w:rStyle w:val="Tecla"/>') + r(' y ') + r('fuerte', '<w:rStyle w:val="Strong"/>') + r('. Precio: 5 * 3 $.')),
    p('', '<w:hyperlink r:id="r4">' + r('enlace') + '</w:hyperlink>' + r(' y ') + '<w:ins><w:r><w:t>añadido</w:t></w:r></w:ins><w:del><w:r><w:delText>borrado</w:delText></w:r></w:del>'),
    p('', r('uno'), list(1)),
    p('', r('dos'), list(1, 1)),
    p('', r('tres'), list(2)),
    p('', r('cuatro'), list(2)),
    p('Cita', r('Una cita.')),
    p('BoxTitle', r('Recuerda')),
    p('BoxText', r('Dentro de la caja.')),
    p('BoxText', r('Segundo párrafo.')),
    p('Verso', r('Nunca fuera caballero') + '<w:r><w:br/></w:r>' + r('de damas tan bien servido')),
    p('', r('')),
    p('', r('Encabezado a mano', '<w:b/>')),
    `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${p('', r('A'))}</w:tc><w:tc>${p('', r('B'))}</w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p('', r('wide'))}</w:tc></w:tr></w:tbl>`,
    p('Caption', r('Tabla 1. Datos del faro')),
    p('Ttulo2', r('Sección')),
    p('', r('1. Numeración tecleada')),
  ].join('');

  const template: WordTemplate = {
    ...emptyTemplate('Editorial'),
    paragraphs: {
      'Box Title': { kind: 'calloutTitle', type: 'note' },
      'Box Text': { kind: 'callout', type: 'note' },
    },
    options: { ...emptyTemplate().options, lineBreaks: 'paragraph' },
  };

  it('maps styles, marks, lists, notes, callouts and tables', () => {
    const doc = readDocx(docx(body));
    const result = wordToPostext(doc, { template, config, chapters: 'single', existingIds: new Set(), untitledChapter: 'Sin título' });
    const md = result.chapters[0]!.markdown;
    expect(md).toBe([
      '# Capítulo uno',
      '',
      'Texto con **negrita** y *cursiva* y una nota.[^1]',
      '',
      'Pulsa :chip[Esc]{style="key"} y **fuerte**. Precio: 5 \\* 3 \\$.',
      '',
      '[enlace](https://example.org/a_b) y añadido',
      '',
      '- uno',
      '  - dos',
      '1. tres',
      '2. cuatro',
      '',
      '> Una cita.',
      '',
      ':::callout{type="note" title="Recuerda"}',
      'Dentro de la caja.',
      '',
      'Segundo párrafo.',
      ':::',
      '',
      ':::verse{style="verso"}',
      'Nunca fuera caballero',
      'de damas tan bien servido',
      ':::',
      '',
      '**Encabezado a mano**',
      '',
      '::resource{id="table-1"}',
      '',
      '## Sección',
      '',
      '⁠1. Numeración tecleada',
      '',
      '[^1]: A *note*.',
      '',
    ].join('\n'));
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.caption).toBe('Datos del faro');
    expect(result.tables[0]!.model).toEqual({
      rows: [
        [{ content: 'A', isHeader: true }, { content: 'B', isHeader: true }],
        [{ content: 'wide', colSpan: 2 }, { content: '', hiddenBy: { row: 1, col: 0 } }],
      ],
      headerRowCount: 1,
      columnWidths: [1, 2],
    });
  });

  it('reads a poem from a verse style: lines, indents, stanzas (#620)', () => {
    const poem = [
      p('Poem', r('Whose woods these are') + '<w:r><w:br/></w:r><w:r><w:tab/></w:r>' + r('His house is in the village')),
      p('Poem', r('')),
      p('Poem', r('He will not see me')),
      p('Poem', r('+ stopping here || at all')),
      p('', r('After.')),
    ].join('');
    const doc = readDocx(docx(poem));
    expect(guessParagraphTarget('Poem', config)).toEqual({ kind: 'verse' });
    expect(guessParagraphTarget('Verso', config)).toEqual({ kind: 'verse', style: 'verso' });
    const md = wordToPostext(doc, { template: emptyTemplate(), config, chapters: 'single', existingIds: new Set(), untitledChapter: 'x' }).chapters[0]!.markdown;
    expect(md).toBe([
      ':::verse{layout=lines}',
      'Whose woods these are',
      '\tHis house is in the village',
      '',
      'He will not see me',
      '\\+ stopping here || at all',
      ':::',
      '',
      'After.',
      '',
    ].join('\n'));
    const stanzas = parseMarkdown(md).filter((b) => b.verse);
    expect(stanzas.map((b) => b.verse!.stanza!.lines.map((l) => l.indent))).toEqual([[0, 4], [0, 0]]);
    expect(stanzas[1]!.text).toBe('He will not see me\n+ stopping here || at all');
  });

  it('turns hand-made headings into headings when asked', () => {
    const doc = readDocx(docx(body));
    const t = { ...template, options: { ...template.options, manualHeadings: 3 } };
    const md = wordToPostext(doc, { template: t, config, chapters: 'single', existingIds: new Set(), untitledChapter: '' }).chapters[0]!.markdown;
    expect(md).toContain('\n### Encabezado a mano\n');
  });

  it('splits chapters at level-1 headings', () => {
    const doc = readDocx(docx(p('', r('Prólogo.')) + p('Ttulo1', r('Uno')) + p('', r('a')) + p('Ttulo1', r('Dos')) + p('', r('b'))));
    const result = wordToPostext(doc, { template: emptyTemplate(), config, chapters: 'split', existingIds: new Set(), untitledChapter: 'Inicio' });
    expect(result.chapters.map((c) => c.title)).toEqual(['Inicio', 'Uno', 'Dos']);
  });

  it('reports the quality of the original', () => {
    const doc = readDocx(docx(body));
    const report = analyzeDocx(doc, template, config);
    expect(report.verdict).toBe('mixed');
    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['manualHeadings', 'typedNumbering', 'trackedChanges', 'emptyParagraphs', 'lineBreaks']));
    expect(report.paragraphStyles.find((s) => s.name === 'Box Text')?.count).toBe(2);
    expect(report.characterStyles.map((s) => s.name)).toEqual(expect.arrayContaining(['Tecla', 'Strong']));
    expect(report.tables).toBe(1);
    expect(report.footnotes).toBe(1);
  });

  it('calls a document set in Normal plain', () => {
    const doc = readDocx(docx([p('', r('Uno', '<w:b/>')), p('', r('Texto.')), p('', r('Más texto.'))].join('')));
    expect(analyzeDocx(doc, emptyTemplate(), config).verdict).toBe('plain');
  });

  it('rejects a file that is not a Word document', () => {
    expect(() => readDocx(strToU8('not a zip'))).toThrow();
  });
});

describe('forced line breaks (#620)', () => {
  it('write a soft return in Word and come back as a backslash ending the line', () => {
    const md = [
      'First line\\',
      'second line, and `C:\\\\x` stays.',
      '',
      '> Quoted\\',
      '> and broken.',
      '',
      '- An item \\\\ broken',
      '',
      'Ends with a backslash\\',
    ].join('\n');
    const bytes = postextToDocx([{ title: 'One', markdown: md }], { template: emptyTemplate(), config, book: false });
    const doc = readDocx(bytes);
    const paragraphs = doc.blocks.filter((b) => b.type === 'paragraph');
    const breaks = paragraphs.map((b) => b.type === 'paragraph' ? b.runs.filter((r) => r.type === 'break' && r.kind === 'line').length : 0);
    expect(breaks).toEqual([1, 1, 1, 0]);
    const back = roundTrip(md);
    expect(blocksOf(back)).toEqual(blocksOf(md));
    expect(back).toContain('First line\\\nsecond line');
  });

  it('read a soft return in body text as a forced break, or a space when asked', () => {
    const body = p('', r('One') + '<w:r><w:br/></w:r>' + r('- two')) + p('Cita', r('Q1') + '<w:r><w:br/></w:r>' + r('Q2')) + p('', r('i1') + '<w:r><w:br/></w:r>' + r('i2'), list(1));
    const doc = readDocx(docx(body));
    const read = (lineBreaks: 'break' | 'space') => wordToPostext(doc, { template: { ...emptyTemplate(), options: { ...emptyTemplate().options, lineBreaks } }, config, chapters: 'single', existingIds: new Set(), untitledChapter: 'x' }).chapters[0]!.markdown;
    const md = read('break');
    expect(emptyTemplate().options.lineBreaks).toBe('break');
    // The line after the break opens with a word joiner, so `- two` stays text.
    expect(md).toContain(`One\\\n${'\u2060'}- two`);
    expect(md).toContain('> Q1\\\n> Q2');
    expect(md).toContain('- i1 \\\\ i2');
    const blocks = parseMarkdown(md);
    expect(blocks[0]!.text).toBe(`One\u2028\u2060- two`);
    expect(blocks.find((b) => b.type === 'blockquote')!.text).toBe('Q1\u2028Q2');
    expect(blocks.find((b) => b.type === 'listItem')!.text).toBe('i1\u2028i2');
    expect(read('space')).toContain('One - two');
  });
});

describe('tabs (#622)', () => {
  const tab = '<w:r><w:tab/></w:r>';
  const read = (body: string, styles = '') => wordToPostext(readDocx(docx(body, { styles })), { template: emptyTemplate(), config, chapters: 'single', existingIds: new Set(), untitledChapter: 'x' }).chapters[0]!.markdown.trim();

  it('read a tab as `:tab`, to the stop Word set for it, a style\'s stops under the paragraph\'s', () => {
    expect(read(p('', r('Name') + tab + r('Value')))).toBe('Name :tab Value');
    const menu = '<w:style w:type="paragraph" w:styleId="Menu"><w:name w:val="Menu"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="8640"/></w:tabs></w:pPr></w:style>';
    expect(read(p('Menu', r('Soup') + tab + r('8.50')), menu)).toBe('Soup :tab{at=432pt align=end leader="."} 8.50');
    // The paragraph clears the style's stop and sets its own.
    const own = '<w:tabs><w:tab w:val="clear" w:pos="8640"/><w:tab w:val="left" w:pos="1440"/></w:tabs>';
    expect(read(p('Menu', r('Q1') + tab + r('Question'), own), menu)).toBe('Q1 :tab{at=72pt} Question');
    // A heading or a table cell reads it as a space.
    expect(read(p('Ttulo1', r('One') + tab + r('Two')))).toBe('# One Two');
    // The parser reads it back as a tab.
    expect(parseMarkdown('Soup :tab{at=432pt align=end leader="."} 8.50')[0]!.spans.find((x) => x.tab)!.tab!.stop).toEqual({ position: { value: 432, unit: 'pt' }, align: 'end', leader: '.' });
  });

  it('write `:tab` as Word\'s tab and a paragraph style\'s stops as `w:tabs`, and come back', () => {
    const cfg = { ...config, paragraphStyles: [...(config.paragraphStyles ?? []), { id: 'menu', name: 'Menu', tabStops: [{ position: { value: 120, unit: 'mm' }, align: 'end', leader: '.' }] }] } as PostextConfig;
    const md = ['Name :tab Value', '', ':::paragraphs{style="menu"}', 'Soup :tab 8.50', ':::', '', 'Signed :tab{at=end leader=rule}'].join('\n');
    const bytes = postextToDocx([{ title: 'One', markdown: md }], { template: emptyTemplate(), config: cfg, book: false });
    const doc = readDocx(bytes);
    const first = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(first.type === 'paragraph' && first.runs.map((x) => x.type)).toEqual(['text', 'tab', 'text']);
    const style = [...doc.styles.values()].find((st) => st.name === 'Menu');
    expect(style?.tabs).toEqual([{ val: 'right', pos: 6803, leader: 'dot' }]);
    const back = wordToPostext(doc, { template: parseTemplate(doc.embeddedTemplate)!, config: cfg, chapters: 'single', existingIds: new Set(), untitledChapter: 'x' }).chapters[0]!.markdown;
    expect(back).toContain('Name :tab Value');
    expect(back).toContain('Soup :tab 8.50');
    expect(back).toContain('Signed :tab{at=end leader=rule}');
  });
});

describe('details found in the browser', () => {
  it('falls back to the engine\'s callout and chip styles when the book lists none', () => {
    const bare = {} as PostextConfig;
    expect(guessParagraphTarget('Note', bare)).toEqual({ kind: 'callout', type: 'note' });
    expect(guessParagraphTarget('Callout: Note', bare)).toEqual({ kind: 'callout', type: 'note' });
    expect(guessParagraphTarget('Boxe: Note: título', bare)).toEqual({ kind: 'calloutTitle', type: 'note' });
    expect(guessCharacterTarget('Chip: Chip', bare)).toEqual({ kind: 'chip', style: 'chip' });
  });

  it('numbers a new table after the ones the book has', () => {
    const table = `<w:tbl><w:tr><w:tc>${p('', r('A'))}</w:tc></w:tr></w:tbl>`;
    const doc = readDocx(docx(table + table));
    const result = wordToPostext(doc, { template: emptyTemplate(), config, chapters: 'single', existingIds: new Set(['table-1']), untitledChapter: '' });
    expect(result.tables.map((t) => t.id)).toEqual(['table-2', 'table-3']);
  });

  it('shows Word\'s built-in style names capitalised', () => {
    expect(displayStyleName('heading 1')).toBe('Heading 1');
    expect(displayStyleName('Box Text')).toBe('Box Text');
  });
});
