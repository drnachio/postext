// Master items per master, anchored objects, cross-references and
// bookmarks.

import { describe, expect, it } from 'vitest';
import { frameXml, mini, storyXml } from '../../read/fixture.test-helper.js';
import { idmlToPostext } from '../index.js';
import type { IdmlImportResult } from '../types.js';
import { finding, markdownOf, parse, plain, run, para, xml } from './kit.test-helper.js';

const NS = 'xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"';
const TEXT = 'Running text that ends in a full stop, long enough to be the body of the document. ';
const rect = (self: string, box: [number, number, number, number], attrs: string): string => frameXml(self, '', box, attrs).replace(/TextFrame/g, 'Rectangle').replace(' ParentStory=""', '');
const pageXml = (self: string, name: string, x: number, master: string): string =>
  `<Page Self="${self}" Name="${name}" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 ${x} 0" AppliedMaster="${master}" MasterPageTransform="1 0 0 1 0 0" OverrideList=""><MarginPreference Top="36" Bottom="36" Left="36" Right="36" ColumnCount="1" ColumnGutter="12"/></Page>`;
const masterXml = (self: string, name: string, based: string, items: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<idPkg:MasterSpread ${NS} DOMVersion="21.5"><MasterSpread Self="${self}" Name="${name}" ItemTransform="1 0 0 1 0 0" ShowMasterItems="true" PageCount="1">${pageXml(`${self}p`, name.slice(0, 1), 0, based)}${items}</MasterSpread></idPkg:MasterSpread>`;
const spread = (self: string, pages: string, items: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<idPkg:Spread ${NS} DOMVersion="21.5"><Spread Self="${self}" PageCount="1" BindingLocation="0" ItemTransform="1 0 0 1 0 0">${pages}${items}</Spread></idPkg:Spread>`;
const folio = '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content><?ACE 18?></Content></CharacterStyleRange></ParagraphStyleRange>';

/** Master A (a folio and a running head), master B based on A (a band,
 *  and a box on a hidden layer), and pages that apply them. */
function withMasters(pages: { master: string; items: string }[], stories: Record<string, string>): Uint8Array {
  const files: Record<string, string> = {
    'MasterSpreads/MasterSpread_ma.xml': masterXml('ma', 'A-Main', 'n', frameXml('mf', 'mfolio', [36, 760, 576, 780]) + frameXml('mh', 'mhead', [36, 10, 576, 30])),
    'MasterSpreads/MasterSpread_mb.xml': masterXml('mb', 'B-Opener', 'ma', rect('band', [0, 0, 612, 60], 'FillColor="Color/Black"') + rect('ghost', [0, 700, 612, 720], 'FillColor="Color/Black" ItemLayer="hid"')),
  };
  let spreads = '';
  pages.forEach((p, n) => {
    files[`Spreads/Spread_u${n}.xml`] = spread(`u${n}`, pageXml(`u${n}p`, String(n + 1), 0, p.master), p.items);
    spreads += `<idPkg:Spread src="Spreads/Spread_u${n}.xml"/>`;
  });
  return mini({
    stories: { mfolio: storyXml('mfolio', folio), mhead: storyXml('mhead', plain('The Book')), ...stories },
    designmap: `<Layer Self="hid" Name="Hidden" Visible="false"/><idPkg:MasterSpread src="MasterSpreads/MasterSpread_ma.xml"/><idPkg:MasterSpread src="MasterSpreads/MasterSpread_mb.xml"/>${spreads}`,
    files: { ...files, 'Spreads/Spread_us.xml': spread('us', '', '') },
  });
}

describe('master items', () => {
  it('gives each composed page the items of its own masters, the based-on ones under them', () => {
    const r = idmlToPostext(withMasters([{ master: 'mb', items: frameXml('f1', 's1', [36, 100, 576, 700]) }, { master: 'ma', items: frameXml('f2', 's2', [36, 100, 576, 700]) }], { s1: storyXml('s1', plain(TEXT)), s2: storyXml('s2', plain(TEXT)) }), { layout: 'pages' });
    const [opener, body] = r.config.pageTemplates!;
    const kinds = (t: typeof opener): string[] => (t!.decoration?.elements ?? []).map((e) => ('kind' in e ? `${e.kind}${'content' in e ? `:${e.content}` : ''}` : ''));
    // The opener: A's folio and running head under B's band; the box on the hidden layer is left out.
    expect(kinds(opener)).toEqual(['text:{pageNumber}', 'text:{attr.m2}', 'box']);
    expect(kinds(body)).toEqual(['text:{pageNumber}', 'text:{attr.m2}']);
    expect(markdownOf(r)).toMatch(/::::page\{template="page-1" id="p1" m2="The Book"\}/);
    expect(finding(r, 'hiddenLayers')).toBeDefined();
    expect(JSON.stringify(r.config)).not.toContain('The Book');
  });

  it('sets an opener master on the chapter openers of a flowing book, the main master on its body pages', () => {
    const long = plain(TEXT.repeat(12));
    const thread = (n: number, prev: string | undefined, next: string | undefined): string => frameXml(`f${n}`, 's1', [36, 100, 576, 700], `${prev ? `PreviousTextFrame="${prev}"` : ''} ${next ? `NextTextFrame="${next}"` : ''}`);
    const r = idmlToPostext(
      withMasters([{ master: 'mb', items: thread(1, undefined, 'f2') }, { master: 'ma', items: thread(2, 'f1', 'f3') }, { master: 'ma', items: thread(3, 'f2', undefined) }], { s1: storyXml('s1', para(run('The Title', 'PointSize="24" FontStyle="Bold"')) + long + long + long) }),
      { layout: 'flow' },
    );
    const all = [...r.config.header!.elements, ...r.config.footer!.elements] as { id: string; kind: string; pages?: string; content?: string }[];
    expect(all.filter((e) => e.pages === 'body').map((e) => e.content)).toEqual(['{attr.m2}', '{pageNumber}']);
    // The opener pages: B's band, and A's items B is based on.
    expect(all.filter((e) => e.pages === 'opener').map((e) => e.kind).sort()).toEqual(['box', 'text', 'text']);
    expect(all.every((e) => e.pages === 'body' || e.pages === 'opener')).toBe(true);
    expect(finding(r, 'openerMaster')).toMatchObject({ severity: 'info', examples: ['B-Opener: 1'] });
    expect(finding(r, 'otherMasters')).toBeUndefined();
    expect(markdownOf(r)).toMatch(/^# The Title \{.*m2="The Book".*\}$/m);
  });

  it('names the pages of a master a flowing book cannot tell apart', () => {
    const r = idmlToPostext(
      withMasters([{ master: 'ma', items: frameXml('f1', 's1', [36, 100, 576, 700], 'NextTextFrame="f2"') }, { master: 'mb', items: frameXml('f2', 's1', [36, 100, 576, 700], 'PreviousTextFrame="f1"') }], { s1: storyXml('s1', plain(TEXT.repeat(20)) + plain(TEXT.repeat(20))) }),
      { layout: 'flow' },
    );
    expect(finding(r, 'otherMasters')).toMatchObject({ severity: 'warning', count: 1, examples: ['B-Opener: page 2'] });
    expect([...r.config.header!.elements, ...r.config.footer!.elements].every((e) => !('pages' in e))).toBe(true);
  });
});

// An object anchored in the text of story s1.
const anchored = (inner: string, setting: string): string => `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">${inner.replace(/<\/(TextFrame|Rectangle)>$/, `<AnchoredObjectSetting ${setting}/></$1>`)}</CharacterStyleRange>`;
const hosted = (object: string): string => plain(TEXT.repeat(4)) + `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">${object}${run(TEXT.repeat(4))}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>` + plain(TEXT.repeat(4));
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8DAAMQMDAAS/AL+dP1nMQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const picture = (self: string, box: [number, number, number, number]): string =>
  rect(self, box, '').replace('</Rectangle>', `<Image Self="${self}i" ItemTransform="1 0 0 1 ${box[0]} ${box[1]}"><Properties><GraphicBounds Left="0" Top="0" Right="${box[2] - box[0]}" Bottom="${box[3] - box[1]}"/></Properties><Link Self="${self}l" LinkResourceURI="file:/pictures/icon.png"/></Image></Rectangle>`);

describe('anchored objects', () => {
  // The host frame: 200 pt in from the left, so there is a margin to hang in.
  const host = frameXml('f1', 's1', [200, 100, 560, 700]);
  const side = (setting: string, layout: 'pages' | 'flow'): IdmlImportResult =>
    idmlToPostext(mini({ stories: { s1: storyXml('s1', hosted(anchored(frameXml('a1', 's2', [0, 0, 90, 60]), setting))), s2: storyXml('s2', plain('A note in the margin.')) }, items: host }), { layout });

  it('gives a custom-anchored frame a frame of its own where its rule puts it', () => {
    // Its right edge 12 pt left of the text frame, its top on the frame's top.
    const r = side('AnchoredPosition="Anchored" AnchorPoint="TopRightAnchor" HorizontalReferencePoint="TextFrame" HorizontalAlignment="LeftAlign" AnchorXoffset="12" VerticalReferencePoint="TextFrame" VerticalAlignment="TopAlign" AnchorYoffset="20"', 'pages');
    const frames = r.config.pageTemplates![0]!.frames!;
    expect(frames).toHaveLength(2);
    const note = frames.find((f) => f.placement!.offset!.x!.value < 200)!;
    expect(note.placement).toMatchObject({ offset: { x: { value: 98 }, y: { value: 117.1 } }, size: { width: { value: 90 } } });
    const md = markdownOf(r);
    expect(md).toMatch(new RegExp(`:::frame\\{slot="${note.name}"\\}\\nA note in the margin\\.`));
    expect(md).not.toContain(':::callout');
    expect(finding(r, 'anchoredObjectFrame')).toMatchObject({ severity: 'info', count: 1 });
    expect(r.report.findings.some((f) => f.id === 'anchoredObjectPosition' || f.severity === 'loss')).toBe(false);
  });

  it('estimates the line of an object hung level with its anchor, and says so', () => {
    const r = side('AnchoredPosition="Anchored" AnchorPoint="TopLeftAnchor" HorizontalReferencePoint="PageMargins" HorizontalAlignment="LeftAlign" AnchorXoffset="0" VerticalReferencePoint="LineBaseline" AnchorYoffset="0"', 'pages');
    const note = r.config.pageTemplates![0]!.frames!.find((f) => f.placement!.offset!.x!.value < 200)!;
    // On the left margin of the page; about a third of the way down the frame, where a third of the text is.
    expect(note.placement!.offset!.x).toMatchObject({ value: 36 });
    expect(note.placement!.offset!.y!.value).toBeGreaterThan(250);
    expect(note.placement!.offset!.y!.value).toBeLessThan(350);
    expect(finding(r, 'anchoredObjectFrameEstimated')).toMatchObject({ severity: 'warning', count: 1 });
  });

  it('mirrors a rule relative to the spine on a left-hand page', () => {
    const setting = 'AnchoredPosition="Anchored" SpineRelative="true" AnchorPoint="TopLeftAnchor" HorizontalReferencePoint="PageEdge" HorizontalAlignment="LeftAlign" AnchorXoffset="-10" VerticalReferencePoint="PageEdge" VerticalAlignment="TopAlign" AnchorYoffset="50"';
    const stories = { s1: storyXml('s1', hosted(anchored(frameXml('a1', 's2', [0, 0, 90, 60]), setting))), s2: storyXml('s2', plain('A note.')) };
    const right = idmlToPostext(mini({ stories, items: host }), { layout: 'pages' });
    const x = (r: IdmlImportResult): number => Math.min(...r.config.pageTemplates![0]!.frames!.map((f) => f.placement!.offset!.x!.value));
    expect(x(right)).toBe(10);
    // The same page at the left of the spine: the object hangs 10 pt in from the other edge.
    const verso = spread('us', pageXml('usp0', '2', -612, 'n'), frameXml('f1', 's1', [200 - 612, 100, 560 - 612, 700]));
    const left = idmlToPostext(mini({ stories, designmap: '<idPkg:Preferences src="Resources/Preferences.xml"/>', files: { 'Spreads/Spread_us.xml': verso, 'Resources/Preferences.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<idPkg:Preferences ${NS} DOMVersion="21.5"><DocumentPreference FacingPages="true" PageWidth="612" PageHeight="792"/></idPkg:Preferences>` } }), { layout: 'pages' });
    expect(Math.max(...left.config.pageTemplates![0]!.frames!.map((f) => f.placement!.offset!.x!.value))).toBe(612 - 10 - 90);
  });

  it('hangs it at its side of the column in a flowing book, before the paragraph of its anchor', () => {
    const r = side('AnchoredPosition="Anchored" AnchorPoint="TopRightAnchor" HorizontalReferencePoint="TextFrame" HorizontalAlignment="RightAlign" VerticalReferencePoint="LineBaseline"', 'flow');
    const md = markdownOf(r);
    // 90 pt of a 540 pt column.
    expect(md).toMatch(/:::callout\{type="[^"]+" wrap="right" width=0\.17\}\nA note in the margin\.\n:::\n\nRunning text/);
    expect(md.indexOf(':::callout')).toBeGreaterThan(md.indexOf('Running text'));
    expect(finding(r, 'anchoredObjectBeside')).toMatchObject({ severity: 'warning', count: 1 });
    expect(parse(md).length).toBeGreaterThan(3);
  });

  it('sets a picture typed in a line of a table cell as an inline symbol, and says what it does in running text', () => {
    const icon = anchored(picture('pic', [0, 0, 9, 9]), 'AnchoredPosition="InlinePosition"');
    const table = `<Table Self="t" HeaderRowCount="0" BodyRowCount="1" ColumnCount="1"><Row Self="tr" Name="0"/><Column Self="tc" Name="0" SingleColumnWidth="100"/><Cell Self="tc0" Name="0:0"><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">${run('See ')}${icon}${run(' here')}</ParagraphStyleRange></Cell></Table>`;
    const body = plain(TEXT.repeat(3)) + `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">${run('Press ')}${icon.replace(/pic/g, 'pid')}${run(' to go on. ')}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">${table}<Br/></CharacterStyleRange></ParagraphStyleRange>`;
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', body) }, items: frameXml('f1', 's1', [36, 36, 576, 756]) }), { layout: 'flow', linkBytes: () => PNG });
    const cell = r.resources.find((x) => x.kind === 'table')!.table!.model.rows[0]![0]!;
    // 9 pt high in 12 pt text.
    expect(cell.content).toMatch(/^See :icon\[\]\{resource="icon(-2)?" size=0\.75\} here$/);
    expect(finding(r, 'inlinePictureIcon')).toMatchObject({ severity: 'info', count: 1 });
    expect(finding(r, 'inlinePicture')).toMatchObject({ severity: 'warning', count: 1 });
    expect(finding(r, 'inlinePicture')!.message).toMatch(/line of its own right after its paragraph/);
    expect(markdownOf(r)).toMatch(/Press {2}to go on\.\n\n::resource\{id="icon(-2)?"\}/);
  });
});

describe('cross-references', () => {
  const formats = (blocks: string): string => `<CrossReferenceFormat Self="fmt" Name="Custom">${blocks}</CrossReferenceFormat>`;
  const block = (type: string, text = ''): string => `<BuildingBlock BlockType="${type}" CustomText="${xml(text)}"/>`;
  const pageNumber = '<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><TextVariableInstance Self="tv" Name="TV XRefPageNumber" ResultText="7" AssociatedTextVariable="v"/></CharacterStyleRange>';
  const source = (inner: string): string => `<CrossReferenceSource Self="src" AppliedFormat="fmt" Name="x">${inner}</CrossReferenceSource>`;
  const destination = '<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><ParagraphDestination Self="ParagraphDestination/there" Name="there"/></CharacterStyleRange>';
  const link = '<Hyperlink Self="h" Name="x" Source="src"><Properties><Destination type="object">ParagraphDestination/there</Destination></Properties></Hyperlink>';
  const body = (n = 3): string => Array.from({ length: n }, () => plain(TEXT.repeat(3))).join('');
  const book = (target: string, reference: string, blocks: string): IdmlImportResult =>
    idmlToPostext(mini({ stories: { s1: storyXml('s1', target + body() + para(run('See ') + source(reference) + run(' for more.'))) }, items: frameXml('f1', 's1', [36, 36, 576, 756]), designmap: formats(blocks) + link }), { layout: 'flow' });
  const heading = `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">${destination}${run('The Method', 'PointSize="24" FontStyle="Bold"')}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>`;

  it('writes a reference to a heading as its title and its page, with the words of the format', () => {
    const r = book(heading, run('“The Method” on page ') + pageNumber, block('CustomStringBuildingBlock', '"') + block('FullParagraphBuildingBlock') + block('CustomStringBuildingBlock', '" on page ') + block('PageNumberBuildingBlock'));
    const md = markdownOf(r);
    expect(md).toMatch(/^# The Method \{id="there"\}$/m);
    expect(md).toContain('See “:ref{id="there" style=title}” on page :ref{id="there" style=pageNumber} for more.');
    expect(finding(r, 'crossReferenceLive')).toMatchObject({ severity: 'info', count: 1 });
    expect(finding(r, 'crossReferenceStatic')).toBeUndefined();
    expect(finding(r, 'textVariables')).toBeUndefined();
    // The parser reads both as references to the anchor.
    const refs = parse(md).flatMap((b) => b.spans).filter((s) => JSON.stringify(s).includes('"there"'));
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the text of a paragraph that is no heading, linked, and its page as a reference', () => {
    const target = `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">${destination}${run(TEXT.repeat(3))}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>`;
    const r = book(target, run('Running text, p. ') + pageNumber, block('ParagraphTextBuildingBlock') + block('CustomStringBuildingBlock', ', p. ') + block('PageNumberBuildingBlock'));
    const md = markdownOf(r);
    expect(md).toContain(':anchor{#there}Running text');
    expect(md).toContain('See [Running text](#there), p. :ref{id="there" style=pageNumber} for more.');
    expect(finding(r, 'crossReferenceLive')?.count).toBe(1);
  });

  it('keeps generated text for a format the book has no reference for, once per reference', () => {
    const r = book(heading, run('1.2 on page ') + pageNumber, block('ParagraphNumberBuildingBlock') + block('CustomStringBuildingBlock', ' on page ') + block('PageNumberBuildingBlock'));
    expect(markdownOf(r)).toContain('See [1.2 on page 7](#there) for more.');
    expect(finding(r, 'crossReferenceStatic')).toMatchObject({ severity: 'warning', count: 1 });
    expect(finding(r, 'crossReferenceStatic')!.message).toMatch(/keeps the text InDesign generated, linked/);
    expect(finding(r, 'crossReferenceLive')).toBeUndefined();
  });
});

describe('bookmarks', () => {
  const anchor = (name: string): string => `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><HyperlinkTextDestination Self="HyperlinkTextDestination/${name}" Name="${name}"/></CharacterStyleRange>`;
  const marked = (name: string, text: string): string => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">${anchor(name)}${run(text)}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>`;
  const bookmarks = '<Bookmark Self="b1" Name="Part one" Destination="HyperlinkTextDestination/one"/><Bookmark Self="b2" Name="Part two" Destination="HyperlinkTextDestination/two"><Bookmark Self="b3" Name="Inner" Destination="HyperlinkTextDestination/two"/></Bookmark>';
  const story = (head: string): string => head + marked('one', `First. ${TEXT.repeat(3)}`) + plain(TEXT.repeat(3)) + marked('two', `Second. ${TEXT.repeat(3)}`) + plain(TEXT.repeat(3));
  const frames = frameXml('f1', 's1', [36, 36, 576, 756]);

  it('cut a flowing book with no headings into chapters named after them', () => {
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', story('')) }, items: frames, designmap: bookmarks }), { layout: 'flow' });
    expect(r.chapters.map((c) => c.title)).toEqual(['Part one', 'Part two']);
    expect(r.chapters[0]!.markdown).toMatch(/^First\./);
    expect(r.chapters[1]!.markdown).toMatch(/^Second\./);
    // Nothing is typed into the text.
    expect(markdownOf(r)).not.toMatch(/Part (one|two)/);
    expect(finding(r, 'bookmarkChapters')).toMatchObject({ severity: 'info', count: 2, examples: ['Part one', 'Part two'] });
    expect(finding(r, 'bookmarks')).toBeUndefined();
  });

  it('leave a book with headings to its headings', () => {
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', story(para(run('The Title', 'PointSize="24" FontStyle="Bold"')))) }, items: frames, designmap: bookmarks }), { layout: 'flow' });
    expect(r.chapters.map((c) => c.title)).toEqual(['The Title']);
    expect(finding(r, 'bookmarkChapters')).toBeUndefined();
    expect(finding(r, 'bookmarks')).toMatchObject({ severity: 'info', count: 2 });
  });
});
