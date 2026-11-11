// The story walk on what the reference package does not hold: tracked
// changes, XML tags, endnotes, breaks, every special character.

import { describe, expect, it } from 'vitest';
import type { IdmlWarning } from '../model/document.js';
import { parseXml } from '../xml/read.js';
import { inlineText, mini, paragraph, storyXml } from './fixture.test-helper.js';
import { readIdml } from './index.js';
import { paragraphsOf, plainText, storyOf } from './story.js';

const CSR = 'CharacterStyleRange';
const PSR = 'ParagraphStyleRange';

function read(body: string): { paragraphs: ReturnType<typeof paragraphsOf>; warnings: IdmlWarning[] } {
  const warnings: IdmlWarning[] = [];
  const paragraphs = paragraphsOf(parseXml(`<Story Self="s">${body}</Story>`), { warnings, part: 'Stories/Story_s.xml' });
  return { paragraphs, warnings };
}

describe('story walk', () => {
  it('cuts paragraphs at Br, across character ranges, the last one without a Br', () => {
    const { paragraphs } = read(`<${PSR} AppliedParagraphStyle="ParagraphStyle/A"><${CSR}><Content>one</Content><Br/><Content>two </Content></${CSR}><${CSR} FontStyle="Bold"><Content>bold</Content><Br/><Br/></${CSR}></${PSR}><${PSR} AppliedParagraphStyle="ParagraphStyle/B"><${CSR}><Content>last</Content></${CSR}></${PSR}>`);
    expect(paragraphs.map((p) => [p.paragraphStyle, plainText([p])])).toEqual([
      ['ParagraphStyle/A', 'one'],
      ['ParagraphStyle/A', 'two bold'],
      ['ParagraphStyle/A', ''],
      ['ParagraphStyle/B', 'last'],
    ]);
    expect(paragraphs[1]!.runs.map((r) => r.attrs.FontStyle)).toEqual([undefined, 'Bold']);
  });

  it('reads the special characters written as instructions and as code points', () => {
    const { paragraphs, warnings } = read(`<${PSR}><${CSR}><Content>a<?ACE 3?>b<?ACE 4?>c<?ACE 7?>d<?ACE 8?>e<?ACE 18?>f<?ACE 19?>g\u2028h\u00adi\u2011j\u200bk</Content></${CSR}></${PSR}>`);
    expect(inlineText(paragraphs[0]!.runs[0]!.content)).toBe('a{endNestedStyle}b{footnoteNumber}c{indentHere}d{rightIndentTab}e{pageNumber}f{sectionMarker}g{forcedLineBreak}h{discretionaryHyphen}i{nonbreakingHyphen}j{discretionaryLineBreak}k');
    expect(warnings).toEqual([]);
  });

  it('keeps an instruction it does not know, and says so once per code', () => {
    const { paragraphs, warnings } = read(`<${PSR}><${CSR}><Content>a<?ACE 99?>b<?ACE 99?>c<?ACE 42?></Content></${CSR}></${PSR}>`);
    const content = paragraphs[0]!.runs[0]!.content;
    expect(content.filter((i) => i.kind === 'special')).toEqual([
      { kind: 'special', char: 'unknown', code: '99' },
      { kind: 'special', char: 'unknown', code: '99' },
      { kind: 'special', char: 'unknown', code: '42' },
    ]);
    expect(warnings.map((w) => w.code)).toEqual(['unknownSpecialCharacter', 'unknownSpecialCharacter']);
    expect(warnings[0]!.part).toBe('Stories/Story_s.xml');
  });

  it('carries tracked changes, XML tags and conditions as context at any level', () => {
    const { paragraphs } = read(
      `<XMLElement Self="x1" MarkupTag="XMLTag/chapter"><${PSR}>` +
        `<Change ChangeType="InsertedText"><${CSR}><Content>new </Content></${CSR}></Change>` +
        `<${CSR}><Content>kept </Content><Change ChangeType="DeletedText"><Content>gone </Content></Change>` +
        `<XMLElement Self="x2" MarkupTag="XMLTag/term"><Content>term</Content></XMLElement></${CSR}>` +
        `<Change ChangeType="MovedText"><${CSR} AppliedConditions="Condition/A Condition/B%20C"><Content> moved</Content></${CSR}></Change>` +
        `<${CSR}><Properties><AppliedConditions type="list"><ListItem type="object">Condition/D E</ListItem></AppliedConditions></Properties><Content>!</Content></${CSR}>` +
        `</${PSR}></XMLElement>`,
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.runs.map((r) => [inlineText(r.content), r.change, r.tags.join('/'), r.conditions.join('|')])).toEqual([
      ['new ', 'inserted', 'chapter', ''],
      ['kept ', undefined, 'chapter', ''],
      ['gone ', 'deleted', 'chapter', ''],
      ['term', undefined, 'chapter/term', ''],
      [' moved', 'moved', 'chapter', 'Condition/A|Condition/B C'],
      ['!', undefined, 'chapter', 'Condition/D E'],
    ]);
  });

  it('puts the break a range asks for on the paragraph it ends', () => {
    const { paragraphs } = read(`<${PSR}><${CSR} ParagraphBreakType="NextPage"><Content>a</Content><Br/></${CSR}><${CSR}><Content>b</Content><Br/></${CSR}><${CSR} ParagraphBreakType="NextColumn"><Br/></${CSR}></${PSR}>`);
    expect(paragraphs.map((p) => p.breakAfter)).toEqual(['NextPage', undefined, 'NextColumn']);
  });

  it('reads a text destination and a variable where they stand', () => {
    const { paragraphs } = read(`<${PSR}><${CSR}><Content>See </Content><TextVariableInstance Self="v" AssociatedTextVariable="dTextVariablenX" ResultText="12 May"/><HyperlinkTextDestination Self="HyperlinkTextDestination/a" Name="a"/></${CSR}></${PSR}>`);
    expect(paragraphs[0]!.runs[0]!.content).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'variable', variable: 'dTextVariablenX', result: '12 May' },
      { kind: 'destination', self: 'HyperlinkTextDestination/a', name: 'a', destinationType: 'text' },
    ]);
  });

  it('reads a table in a cell of a table with the same walk', () => {
    const cell = (name: string, inner: string) => `<Cell Self="c${name}" Name="${name}" RowSpan="1" ColumnSpan="1" CellType="TextTypeCell">${inner}</Cell>`;
    const inner = `<Table Self="t2" HeaderRowCount="0" FooterRowCount="0"><Row Self="r" SingleRowHeight="10"/><Column Self="c" SingleColumnWidth="20"/>${cell('0:0', `<${PSR}><${CSR}><Content>deep</Content></${CSR}></${PSR}>`)}</Table>`;
    const { paragraphs } = read(`<${PSR}><${CSR}><Table Self="t1" HeaderRowCount="0" FooterRowCount="0"><Row Self="r" SingleRowHeight="10"/><Column Self="c" SingleColumnWidth="20"/>${cell('0:0', `<${PSR}><${CSR}><Content>x</Content>${inner}</${CSR}></${PSR}>`)}</Table></${CSR}></${PSR}>`);
    const outer = paragraphs[0]!.runs[0]!.content[0]!;
    expect(outer.kind).toBe('table');
    if (outer.kind !== 'table') return;
    expect(outer.table).toMatchObject({ bodyRows: 1, headerRows: 0 });
    const nested = outer.table.cells[0]!.paragraphs[0]!.runs[0]!.content[1]!;
    expect(nested.kind === 'table' && plainText(nested.table.cells[0]!.paragraphs)).toBe('deep');
  });

  it('reads story settings: title, direction, orientation, endnote story', () => {
    const story = storyOf(parseXml(`<idPkg:Story><Story Self="u9" StoryTitle="$ID/Notes" IsEndnoteStory="true" TrackChanges="true"><StoryPreference StoryDirection="RightToLeftDirection" StoryOrientation="Vertical" OpticalMarginAlignment="true"/></Story></idPkg:Story>`), { warnings: [] });
    expect(story).toMatchObject({ self: 'u9', title: 'Notes', direction: 'rtl', orientation: 'vertical', endnotes: true, trackChanges: true, opticalMargin: true, paragraphs: [] });
    expect(storyOf(parseXml('<idPkg:Story><Nothing/></idPkg:Story>'), { warnings: [] })).toBeUndefined();
  });

  it('gives an endnote of the body the text its range holds in the endnote story', () => {
    const body = storyXml('ub', `<${PSR}><${CSR}><Content>Text</Content><Endnote Self="en1"/><Content> goes on.</Content></${CSR}></${PSR}>`);
    const notes = storyXml('un', `<EndnoteRange Self="er1" SourceEndnote="en1">${paragraph('The note.')}</EndnoteRange>`).replace('<Story Self="un"', '<Story Self="un" IsEndnoteStory="true"');
    const doc = readIdml(mini({ stories: { ub: body, un: notes } }));
    const mark = doc.stories.get('ub')!.paragraphs[0]!.runs[0]!.content[1]!;
    expect(mark.kind).toBe('endnote');
    expect(mark.kind === 'endnote' && plainText(mark.paragraphs)).toBe('The note.');
    expect(doc.stories.get('un')!.paragraphs[0]!.endnoteRange).toBe('en1');
  });
});
