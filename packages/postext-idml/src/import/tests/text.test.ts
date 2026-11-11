// What the text of a story becomes: headings, lists, marks, breaks,
// notes, links, index marks, conditions, tracked changes, tables.

import { describe, expect, it } from 'vitest';
import { bodyOf, finding, importOne, parse, para, plain, run, xml } from './kit.test-helper.js';

const BODY = 'Running text that ends in a full stop, long enough to be the body of the document. ';
const body = (n = 3): string => Array.from({ length: n }, () => plain(BODY.repeat(3))).join('');

describe('headings', () => {
  it('reads larger and heavier short paragraphs as heading levels, by size', () => {
    const r = importOne(para(run('The Title', 'PointSize="24" FontStyle="Bold"')) + body() + para(run('A section', 'PointSize="16" FontStyle="Bold"')) + body(1));
    const md = bodyOf(r);
    expect(md).toMatch(/^# The Title$/m);
    expect(md).toMatch(/^## A section$/m);
    const levels = r.config.headings?.levels ?? [];
    expect(levels.map((l) => [l.level, l.fontSize?.value, l.fontWeight])).toEqual([[1, 24, 700], [2, 16, 700]]);
    expect(r.config.bodyText?.fontSize).toEqual({ value: 12, unit: 'pt' });
    expect(r.report.styles.map((s) => s.target)).toEqual(expect.arrayContaining(['body text', 'heading 1', 'heading 2']));
    // A chapter starts at the level-1 heading and takes its title.
    expect(r.chapters.map((c) => c.title)).toEqual(['The Title']);
  });

  it('does not take a letter set alone, or a short sentence, for a heading', () => {
    const r = importOne(para(run('D', 'PointSize="40"')) + body() + para(run('A short note.', 'PointSize="15"')));
    expect(bodyOf(r)).not.toMatch(/^#/m);
  });
});

describe('lists', () => {
  const item = (text: string, attrs: string): string => para(run(text), attrs);
  it('numbers InDesign lists, nests them by level and restarts where asked', () => {
    const n = 'BulletsAndNumberingListType="NumberedList"';
    const r = importOne(body() + item('one', n) + item('two', n) + item('inner', `${n} NumberingLevel="2"`) + item('three', n) + plain(BODY) + item('again', `${n} NumberingContinue="false"`) + item('next', n));
    const items = parse(bodyOf(r)).filter((b) => b.type === 'listItem');
    expect(items.map((b) => [b.text, b.depth, b.startNumber])).toEqual([['one', 1, 1], ['two', 1, 2], ['inner', 2, 1], ['three', 1, 3], ['again', 1, 1], ['next', 1, 2]]);
  });
  it('writes bullet lists and keeps their bullet in the configuration', () => {
    const b = 'BulletsAndNumberingListType="BulletList"';
    const r = importOne(body() + item('- not nested', b) + item('second', b));
    const items = parse(bodyOf(r)).filter((x) => x.type === 'listItem');
    expect(items.map((x) => [x.text.replace(/\u2060/g, ''), x.listKind])).toEqual([['- not nested', 'unordered'], ['second', 'unordered']]);
    expect(r.config.unorderedLists).toBeDefined();
  });
});

describe('character formats', () => {
  it('writes marks for what differs from the paragraph', () => {
    const r = importOne(para(run(BODY) + run('bold', 'FontStyle="Bold"') + run(' ') + run('italic', 'FontStyle="Italic"') + run(' ') + run('both', 'FontStyle="Bold Italic"') + run(' ') + run('under', 'Underline="true"') + run(' ') + run('gone', 'StrikeThru="true"') + run(' x') + run('2', 'Position="Superscript"') + run(' H') + run('2', 'Position="Subscript"') + run('O ') + run('caps', 'Capitalization="SmallCaps"') + run(' ') + run('shout', 'Capitalization="AllCaps"') + run('.')));
    const md = bodyOf(r);
    expect(md).toContain('**bold** *italic* ***both*** :underline[under] ~~gone~~ x^2^ H~2~O :smallcaps[caps] SHOUT.');
    expect(finding(r, 'allCapsRun')?.count).toBe(1);
  });
  it('reports what has no inline mark, by kind', () => {
    const r = importOne(para(run(BODY) + run('big', 'PointSize="20"') + run(' ') + run('wide', 'Tracking="200"') + run(' ') + run('up', 'BaselineShift="3"')));
    expect(finding(r, 'inlineFontSize')).toMatchObject({ severity: 'loss', count: 1 });
    expect(finding(r, 'inlineTracking')?.count).toBe(1);
    expect(finding(r, 'baselineShift')?.count).toBe(1);
    expect(bodyOf(r)).toContain('big wide up');
  });
  it('keeps forced breaks, tabs and the special characters', () => {
    const r = importOne(para(`<CharacterStyleRange><Content>one\u2028two\tthree soft\u00adhy non‑break em\u2003sp nb\u00a0sp</Content></CharacterStyleRange>`) + plain(BODY));
    const md = bodyOf(r);
    expect(md).toContain('one\\\ntwo :tab three soft\u00adhy non‑break em\u2003sp nb\u00a0sp');
  });
  it('moves the spaces of a marked stretch outside its markers', () => {
    const r = importOne(para(run(BODY) + run(' bold ', 'FontStyle="Bold"') + run('next')));
    expect(bodyOf(r)).toContain(' **bold** next');
  });
});

describe('notes, links and index marks', () => {
  const note = (text: string): string => `<Footnote>${plain(text)}</Footnote>`;
  it('writes a footnote as a marker and its definition', () => {
    const r = importOne(para(`<CharacterStyleRange><Content>${BODY}cited</Content>${note('The *note*.')}<Content> after.</Content></CharacterStyleRange>`));
    const md = bodyOf(r);
    expect(md).toMatch(/cited\[\^n1\] after\./);
    expect(md).toMatch(/^\[\^n1\]: The \\\*note\\\*\.$/m);
    expect(r.report.counts.footnotes).toBe(1);
    expect(r.config.footnotes).toBeDefined();
  });
  it('writes a URL link, keeps brackets of the story out of its label, and reports other schemes', () => {
    const designmap = '<HyperlinkURLDestination Self="d1" Name="a" DestinationURL="https://example.org/a_(b)?x=1"/><HyperlinkURLDestination Self="d2" Name="b" DestinationURL="file:///secret"/><Hyperlink Self="h1" Name="one" Source="src1"><Properties><Destination type="object">d1</Destination></Properties></Hyperlink><Hyperlink Self="h2" Name="two" Source="src2"><Properties><Destination type="object">d2</Destination></Properties></Hyperlink>';
    const r = importOne(para(`<CharacterStyleRange><Content>${BODY}</Content><HyperlinkTextSource Self="src1"><Content>see [this] page</Content></HyperlinkTextSource><Content> and </Content><HyperlinkTextSource Self="src2"><Content>a file</Content></HyperlinkTextSource></CharacterStyleRange>`), {}, { designmap });
    const blocks = parse(bodyOf(r));
    const links = blocks[0]!.spans.flatMap((s) => (s.links as { href: string; start: number; end: number }[] | undefined) ?? []);
    expect(new Set(links.map((l) => l.href))).toEqual(new Set(['https://example.org/a_(b)?x=1']));
    expect(blocks[0]!.text.replace(/\u2060/g, '')).toContain('see [this] page and a file');
    expect(finding(r, 'linkScheme')?.count).toBe(1);
    expect(r.report.counts.hyperlinks).toBe(2);
  });
  it('writes index marks with their topic levels and a "see also"', () => {
    const designmap = '<Index Self="ix"><Topic Self="t1" Name="Lamp" SortOrder=""><Topic Self="t2" Name="wick!" SortOrder=""/><CrossReference Self="x1" CrossReferenceType="SeeAlso" ReferencedTopic="t3"/></Topic><Topic Self="t3" Name="Light" SortOrder=""/></Index>';
    const r = importOne(para(`<CharacterStyleRange><Content>${BODY}the lamp</Content><PageReference Self="p1" ReferencedTopic="t1" PageReferenceType="CurrentPage"/><Content> and its wick</Content><PageReference Self="p2" ReferencedTopic="t2" PageReferenceType="ToEndOfStory"/><Content>.</Content></CharacterStyleRange>`), {}, { designmap });
    const md = bodyOf(r);
    expect(md).toContain('the lamp:index{term="Lamp" seealso="Light"} and its wick:index{term="Lamp!wick！"}.');
    expect(r.report.counts.indexMarks).toBe(2);
    expect(finding(r, 'indexRange')?.count).toBe(1);
    expect(finding(r, 'indexTermRewritten')).toBeDefined();
    expect(finding(r, 'indexNotPrinted')).toBeDefined();
  });
});

describe('conditions, tracked changes and editorial notes', () => {
  const story = `<ParagraphStyleRange><CharacterStyleRange><Content>${BODY}shown </Content></CharacterStyleRange><HiddenText><CharacterStyleRange AppliedConditions="Condition/Off"><Content>secret </Content></CharacterStyleRange></HiddenText><Change ChangeType="InsertedText"><CharacterStyleRange><Content>added </Content></CharacterStyleRange></Change><Change ChangeType="DeletedText"><CharacterStyleRange><Content>removed </Content></CharacterStyleRange></Change><CharacterStyleRange><Note>${plain('for the editor')}</Note><Content>end.</Content><Br/></CharacterStyleRange></ParagraphStyleRange>`;
  const designmap = '<Condition Self="Condition/Off" Name="Off" Visible="false"/>';
  it('leaves hidden conditional text and deleted text out, and counts them', () => {
    const r = importOne(story, {}, { designmap });
    expect(bodyOf(r)).toContain('shown added end.');
    expect(finding(r, 'hiddenConditionalText')?.count).toBe(1);
    expect(finding(r, 'trackedChanges')?.count).toBe(2);
    expect(finding(r, 'editorialNotes')?.count).toBe(1);
  });
  it('follows the options', () => {
    const r = importOne(story, { conditions: 'all', trackedChanges: 'reject' }, { designmap });
    expect(bodyOf(r)).toContain('shown secret removed end.');
  });
});

describe('tables', () => {
  const cell = (name: string, text: string, attrs = ''): string => `<Cell Self="c${name.replace(':', '_')}" Name="${name}" RowSpan="1" ColumnSpan="1" ${attrs}>${plain(text)}</Cell>`;
  const table = (cells: string, rows = 3, cols = 2, attrs = 'HeaderRowCount="1"'): string => para(`<CharacterStyleRange><Table Self="t" ${attrs} BodyRowCount="${rows - 1}">${'<Row Self="r" SingleRowHeight="20"/>'.repeat(rows)}<Column Self="k" SingleColumnWidth="100"/>${'<Column Self="k2" SingleColumnWidth="50"/>'.repeat(cols - 1)}${cells}</Table></CharacterStyleRange>`);
  it('writes a table resource with header rows, merges, widths and fills', () => {
    const r = importOne(body() + table(cell('0:0', 'Head *A*') + cell('1:0', 'Head B') + cell('0:1', 'wide', 'ColumnSpan="2"') + cell('0:2', 'x', 'FillColor="Color/Missing" VerticalJustification="CenterAlign"') + cell('1:2', '[^1] | y')));
    const t = r.resources.find((x) => x.kind === 'table')!;
    const m = t.table!.model;
    expect(m.headerRowCount).toBe(1);
    expect(m.columnWidths).toEqual([2, 1]);
    expect(m.rows[0]!.map((c) => [c.content, c.isHeader])).toEqual([['Head \\*A\\*', true], ['Head B', true]]);
    expect(m.rows[1]).toEqual([{ content: 'wide', colSpan: 2 }, { content: '', hiddenBy: { row: 1, col: 0 } }]);
    expect(m.rows[2]![0]).toMatchObject({ content: 'x', verticalAlign: 'middle', background: { hex: '#000000' } });
    expect(m.rows[2]![1]!.content.replace(/\u2060/g, '')).toBe('[\\^1] | y');
    expect(bodyOf(r)).toContain(`::resource{id="${t.id}"}`);
    expect(finding(r, 'missingSwatch')?.count).toBe(1);
    expect(r.config.tableStyles?.[0]?.id).toBe(t.table!.styleId);
  });
  it('cuts merges that overlap or run off the grid, and says so', () => {
    const r = importOne(body() + table(cell('0:0', 'a', 'ColumnSpan="9" RowSpan="2"') + cell('1:1', 'clash') + cell('5:5', 'lost') + cell('0:2', 'b', 'RowSpan="7"'), 3, 2));
    const m = r.resources.find((x) => x.kind === 'table')!.table!.model;
    expect(m.rows).toHaveLength(3);
    for (const row of m.rows) expect(row).toHaveLength(2);
    expect(m.rows[0]![0]).toMatchObject({ content: 'a', colSpan: 2, rowSpan: 2 });
    expect(finding(r, 'tableSpanOffGrid')).toBeDefined();
    expect(finding(r, 'tableSpanConflict')).toBeDefined();
    expect(finding(r, 'tableCellOffGrid')?.count).toBe(1);
  });
});

void xml;

describe('captions in the text', () => {
  const picture = `<Rectangle Self="r1" ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/><PathPointType Anchor="0 100" LeftDirection="0 100" RightDirection="0 100"/><PathPointType Anchor="200 100" LeftDirection="200 100" RightDirection="200 100"/><PathPointType Anchor="200 0" LeftDirection="200 0" RightDirection="200 0"/></PathPointArray></GeometryPathType></PathGeometry></Properties><AnchoredObjectSetting AnchoredPosition="AboveLine"/><Image Self="i1" ItemTransform="1 0 0 1 0 0"><Properties><GraphicBounds Left="0" Top="0" Right="200" Bottom="100"/></Properties><Link Self="l1" LinkResourceURI="file:/Volumes/Work/sea.png"/></Image></Rectangle>`;
  const styles = `<?xml version="1.0"?><idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5"><RootParagraphStyleGroup Self="rp"><ParagraphStyle Self="ParagraphStyle/Caption" Name="Caption" PointSize="9"/></RootParagraphStyleGroup></idPkg:Styles>`;
  const caption = (text: string): string => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Caption"><CharacterStyleRange><Content>${text}</Content><Br/></CharacterStyleRange></ParagraphStyleRange>`;
  const doc = (text: string) => importOne(body() + para(`<CharacterStyleRange>${picture}</CharacterStyleRange>`) + caption(text) + body(1), {}, { designmap: '<idPkg:Styles src="Resources/Styles.xml"/>', files: { 'Resources/Styles.xml': styles } });
  it('gives a caption paragraph under a picture to the picture, without its whole label', () => {
    const r = doc('Figure 1. The sea at dusk.');
    const pic = r.resources[0]!;
    expect(pic).toMatchObject({ typeId: 'figure', caption: 'The sea at dusk.' });
    expect(bodyOf(r)).not.toContain('The sea at dusk');
    expect(r.config.resourceTypes?.find((t) => t.id === 'figure')).toMatchObject({ captionPrefix: 'Figure', numberingTemplate: '{n}' });
    // The picture stands before the paragraph it is anchored above.
    expect(bodyOf(r)).toMatch(/::resource\{id="sea"\}/);
  });
  it('keeps a caption that only starts like a label whole', () => {
    const r = doc('Figures of speech are no label.');
    expect(r.resources[0]).toMatchObject({ typeId: 'picture', caption: 'Figures of speech are no label.' });
  });
});
