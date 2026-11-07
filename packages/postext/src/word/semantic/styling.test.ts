// Styling of the semantic writer after the LibreOffice and Google Docs
// review (#1444): verse set flush with its indents, bayts on a tab pair,
// chips and marks shaded by their own styles, code kept left to right in
// right-to-left text, lists with the engine's markers and indents, boxes
// and tables as wide as their column, keeps, and section break types. Every
// export must read back unchanged.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../types.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { exportDocx, exportProblems, type Exported } from './fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;

/** Re-import an unedited export: no edits, the same Markdown. */
function unchanged(e: Exported, md: string[]): void {
  const chapters = md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown }));
  const r = applyDocxEdits(e.bytes, { chapters });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

/** The `w:p` that holds `text`. */
const paraOf = (xml: string, text: string): string => {
  const at = xml.indexOf(text);
  const start = xml.lastIndexOf('<w:p>', at);
  return xml.slice(start, xml.indexOf('</w:p>', at) + 6);
};

/** The `w:style` element of a style id. */
const styleOf = (e: Exported, id: string): string => {
  const xml = e.part('word/styles.xml');
  const at = xml.indexOf(`w:styleId="${id}"`);
  return at < 0 ? '' : xml.slice(at, xml.indexOf('</w:style>', at));
};

describe('semantic docx: styling (#1444)', () => {
  it('sets verse flush, with its indents as en spaces and space between stanzas', async () => {
    const md = 'Before.\n\n:::verse{style="verse" align=start}\nThe world is charged\n    It will flame out\nCrushed.\n\nAnd for all this\n  There lives\n:::\n';
    const config = cfg({ paragraphStyles: [{ id: 'verse', textAlign: 'justify', hangingIndent: { value: 2, unit: 'em' } }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const first = paraOf(e.doc, 'The world is charged');
    expect(first).toContain('<w:ind w:firstLine="0"/><w:jc w:val="left"/>');
    expect(first).toContain('<w:suppressAutoHyphens/>');
    // Four leading spaces at the default step (half an em each) are four en
    // spaces, held with the line break by one atom over the source.
    const stanza = e.frag('The world is charged\n    It will flame out\nCrushed.');
    const atom = stanza.atoms!.find((a) => a.kind === 'line')!;
    expect(md.slice(atom.start, atom.end)).toBe('\n    ');
    // The second stanza opens a line below the first.
    expect(paraOf(e.doc, 'And for all this')).toMatch(/<w:spacing w:before="\d+"\/>/);
    unchanged(e, [md]);
    // A word edited on an indented line keeps the indent in the source.
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('flame out', 'flame up')), { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('flame out', 'flame up'));
  });

  it('sets a bayt poem as the engine\'s block: centred, two hemistichs and the gap wide', async () => {
    const md = ':::verse\nأشرقت || واستنارت\nمن سناها || تتبدى\n:::\n';
    const e = await exportDocx(md, { config: cfg({ direction: 'rtl' }) });
    expect(exportProblems(e, [md])).toEqual([]);
    const p = paraOf(e.doc, 'أشرقت');
    expect(p).toContain('<w:jc w:val="left"/>');
    expect(p).not.toContain('w:val="both"');
    // Equal indents frame the block in the middle of the measure, and the
    // end tab closes it: the halves sit a gap apart, not at the column's
    // two edges.
    const ind = /<w:ind w:left="(\d+)" w:right="(\d+)" w:firstLine="0"\/>/.exec(p)!;
    const tab = Number(/<w:tab w:val="right" w:pos="(\d+)"\/>/.exec(p)![1]);
    const left = Number(ind[1]);
    expect(Number(ind[2])).toBe(left);
    expect(left).toBeGreaterThan(1000);
    const blockWidth = tab - left;
    // About twice the wider hemistich (7 letters) plus a 2 em gap.
    expect(blockWidth).toBeGreaterThan(1200);
    expect(blockWidth).toBeLessThan(3000);
    unchanged(e, [md]);
  });

  it('sets a bayt poem flush with the start under align=start', async () => {
    const md = ':::verse{align=start}\nأشرقت || واستنارت\n:::\n';
    const e = await exportDocx(md, { config: cfg({ direction: 'rtl' }) });
    const p = paraOf(e.doc, 'أشرقت');
    expect(p).toContain('<w:ind w:left="0" w:right="0" w:firstLine="0"/>');
    expect(Number(/<w:tab w:val="right" w:pos="(\d+)"\/>/.exec(p)![1])).toBeLessThan(3000);
    unchanged(e, [md]);
  });

  it('keeps a long hemistich poem to the measure', async () => {
    const long = 'كلمة '.repeat(30).trim();
    const md = `:::verse\n${long} || ${long}\n:::\n`;
    const e = await exportDocx(md, { config: cfg({ direction: 'rtl' }) });
    const p = paraOf(e.doc, 'كلمة');
    expect(p).toContain('<w:ind w:left="0" w:right="0" w:firstLine="0"/>');
    unchanged(e, [md]);
  });

  it('shades chips by their own style, padded, and an empty chip as a filled box', async () => {
    const md = 'Tags :chip[Vegetarian]{style="tag"} :chip[Gluten free]{style="tag"} and :chip[x]{style="code"} end :chip[ ]{style="end"}\n';
    const config = cfg({
      chipStyles: [
        { id: 'tag', background: { hex: '#f6e3c0', model: 'hex' }, bold: true },
        { id: 'code', background: { hex: '#eeeeee', model: 'hex' } },
        { id: 'end', background: { hex: '#1d5470', model: 'hex' } },
      ],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag(`Tags  Vegetarian   Gluten free  and  x  end    `)).toBeDefined();
    expect(styleOf(e, 'PostextChiptag')).toContain('<w:b/>');
    expect(styleOf(e, 'PostextChiptag')).toContain('w:fill="F6E3C0"');
    expect(styleOf(e, 'PostextChipend')).toContain('w:fill="1D5470"');
    // A style id the importer would read as code is not used.
    expect(e.part('word/styles.xml')).not.toContain('PostextChipcode');
    unchanged(e, [md]);
  });

  it('shades marks with their style colour, which LibreOffice keeps', async () => {
    const md = 'A :mark[first phrase] and :mark[second]{style="blue"} here.\n';
    const config = cfg({ markStyles: [{ id: 'mark', background: { hex: '#fff0a0', model: 'hex' } }, { id: 'blue', background: { hex: '#cce0ff', model: 'hex' } }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(styleOf(e, 'PostextMark')).toContain('w:fill="FFF0A0"');
    expect(styleOf(e, 'PostextMark')).not.toContain('w:highlight');
    expect(e.doc).toContain('<w:rStyle w:val="PostextMark"/><w:shd w:val="clear" w:color="auto" w:fill="CCE0FF"/>');
    unchanged(e, [md]);
  });

  it('gives a second mark style its own ink, or none when the first has one', async () => {
    const md = 'A :mark[first]{style="red"} and :mark[blue]{style="blue"} and :mark[plain]{style="plain"} here.\n';
    const config = cfg({ markStyles: [
      { id: 'red', background: { hex: '#fff0a0', model: 'hex' }, color: { hex: '#aa0000', model: 'hex' } },
      { id: 'blue', background: { hex: '#cce0ff', model: 'hex' }, color: { hex: '#003399', model: 'hex' } },
      { id: 'plain', background: { hex: '#eeeeee', model: 'hex' } },
    ] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(styleOf(e, 'PostextMark')).toContain('<w:color w:val="AA0000"/>');
    expect(paraOf(e.doc, '>blue<')).toMatch(/<w:color w:val="003399"\/><w:shd w:val="clear" w:color="auto" w:fill="CCE0FF"\/>|<w:shd w:val="clear" w:color="auto" w:fill="CCE0FF"\/>.*<w:color w:val="003399"\/>/);
    const runOf = (word: string): string => { const x = e.doc; const at = x.indexOf(`>${word}<`); return x.slice(x.lastIndexOf('<w:r>', at), at); };
    expect(runOf('blue')).toContain('<w:color w:val="003399"/>');
    expect(runOf('plain')).toContain('<w:color w:val="auto"/>');
    expect(runOf('first')).not.toContain('<w:color');
    unchanged(e, [md]);
  });

  it('keeps code left to right in right-to-left text', async () => {
    const md = 'نص `foo(bar);` نص\n\n```\nlet x = 1;\n```\n';
    const e = await exportDocx(md, { config: cfg({ direction: 'rtl' }) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag('نص ‎foo(bar);‎ نص')).toBeDefined();
    expect(styleOf(e, 'PostextCode')).toContain('<w:bidi w:val="0"/>');
    expect(styleOf(e, 'PostextSource')).toContain('<w:bidi w:val="0"/>');
    expect(styleOf(e, 'PostextSource')).toContain('w:ascii="Courier New"');
    unchanged(e, [md]);
  });

  it('gives lists the engine\'s markers: none for an empty bullet, numbers set against the text', async () => {
    const md = '1. Question one\n- A option\n2. Question two\n\n- [ ] task\n';
    const config = cfg({
      unorderedLists: { indent: { value: 23, unit: 'pt' }, gap: { value: 0, unit: 'pt' }, levels: [{ level: 1, bulletChar: '' }] },
      orderedLists: { fontWeight: 700, levels: [{ level: 1, fontSize: { value: 12.5, unit: 'pt' } }] },
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const numbering = e.part('word/numbering.xml');
    expect(numbering).toContain('<w:numFmt w:val="none"/><w:suff w:val="nothing"/><w:lvlText w:val=""/>');
    expect(numbering).toMatch(/<w:numFmt w:val="decimal"\/><w:lvlText w:val="%1\."\/><w:lvlJc w:val="right"\/>/);
    expect(numbering).toContain('<w:b/><w:bCs/><w:i w:val="0"/><w:iCs w:val="0"/>');
    expect(numbering).toContain('<w:sz w:val="25"/>');
    expect(numbering).toContain('w:ascii="MS Gothic"');
    unchanged(e, [md]);
  });

  it('gives a list in a box the box style\'s bullet and the box\'s alignment', async () => {
    const md = ':::callout{type="info"}\n- one\n- two\n:::\n';
    const config = cfg({
      bodyText: { textAlign: 'justify' },
      calloutStyles: [{ id: 'info', lists: { bulletChar: '–' }, body: { textAlign: 'left' } }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.part('word/numbering.xml')).toContain('<w:lvlText w:val="–"/>');
    expect(paraOf(e.doc, '>one<')).toContain('<w:jc w:val="left"/>');
    unchanged(e, [md]);
  });

  it('fits a box to its column, keeps a short one whole, draws a marker rule and keeps its margins', async () => {
    const md = 'Before.\n\n:::callout{type="aside" title="Where it lands"}\nShort text.\n:::\n\nAfter.\n';
    const config = cfg({
      calloutStyles: [{
        id: 'aside',
        backgroundEnabled: false,
        marginTop: { value: 6, unit: 'pt' },
        marginBottom: { value: 6, unit: 'pt' },
        marker: { kind: 'shape', shape: 'dot', color: { hex: '#d8a21a', model: 'hex' }, gap: { value: 3, unit: 'mm' }, rule: { enabled: true, color: { hex: '#d8a21a', model: 'hex' }, width: { value: 0.75, unit: 'pt' } } },
      }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(e.doc).toContain('<w:tblLayout w:type="autofit"/>');
    expect(e.doc).toContain('<w:tr><w:trPr><w:cantSplit/></w:trPr>');
    expect(e.doc).toContain('<w:left w:val="single" w:sz="6" w:space="0" w:color="D8A21A"/>');
    // Spacer paragraphs as tall as the margins (6 pt = 120 twips).
    expect(e.doc.match(/<w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"\/>/g)).toHaveLength(2);
    unchanged(e, [md]);
  });

  it('lets a keep-together box split when a tall picture would outgrow the page', async () => {
    const md = ':::callout{type="info"}\nA line.\n\n::resource{id="p1"}\n:::\n';
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const pic = (height: number) => [{ id: 'p1', typeId: 'figure', kind: 'bitmap' as const, createdAt: 0, updatedAt: 0, bitmap: { fileId: 'p', format: 'png' as const, width: 1000, height } }];
    // The box's own row (its grid is one column as wide as the measure).
    const boxRow = /<w:tblGrid><w:gridCol w:w="\d+"\/><\/w:tblGrid><w:tr>(<w:trPr><w:cantSplit\/><\/w:trPr>)?/;
    const config = cfg({ calloutStyles: [{ id: 'info', keepTogether: true }] });
    const small = await exportDocx(md, { config, resources: pic(300), resourceBytes: () => png });
    expect(small.doc).toContain('<w:drawing>');
    expect(boxRow.exec(small.doc)![1]).toBeDefined();
    const tall = await exportDocx(md, { config, resources: pic(3000), resourceBytes: () => png });
    expect(boxRow.exec(tall.doc)![1]).toBeUndefined();
    // A long box whose style lets it split is not held either.
    const long = await exportDocx(`:::callout{type="info"}\n${'Words in a long box. '.repeat(80)}\n:::\n`, { config: cfg({ calloutStyles: [{ id: 'info', keepTogether: false }] }) });
    expect(boxRow.exec(long.doc)![1]).toBeUndefined();
  });

  it('keeps a table with the caption below it and sizes it in percentages', async () => {
    const md = '::resource{id="t1"}\n\nAfter.\n';
    const resources = [{ id: 't1', typeId: 'table', kind: 'table' as const, caption: 'Cap', createdAt: 0, updatedAt: 0, table: { model: { rows: [[{ content: 'a' }, { content: 'b' }], [{ content: 'c' }, { content: 'd' }]], columnWidths: [1, 3] } } }];
    const e = await exportDocx(md, { resources });
    expect(e.doc).toContain('<w:tcW w:w="1250" w:type="pct"/>');
    expect(e.doc).toContain('<w:tcW w:w="3750" w:type="pct"/>');
    expect(paraOf(e.doc, '>d<')).toContain('<w:keepNext/>');
    expect(paraOf(e.doc, '>a<')).not.toContain('<w:keepNext/>');
    expect(styleOf(e, 'Caption')).toContain('<w:keepLines/>');
  });

  it('stops headings hyphenating and starts chapters on a recto only when asked', async () => {
    const md = ['# One\n\nText.\n', '# Two\n\nText.\n'];
    const odd = await exportDocx(md, { config: cfg({ headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] } }) });
    expect(styleOf(odd, 'Heading1')).toContain('<w:suppressAutoHyphens/>');
    expect(odd.doc).toContain('<w:type w:val="oddPage"/>');
    const even = await exportDocx(md, { config: cfg({ headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'even' } }] } }) });
    expect(even.doc).toContain('<w:type w:val="nextPage"/>');
    expect(even.doc).not.toContain('evenPage');
  });
});
