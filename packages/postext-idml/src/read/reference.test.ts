// The reader against the package InDesign itself wrote: every fact here
// is one the script that made the document put there.

import { describe, expect, it } from 'vitest';
import type { IdmlColor, IdmlGradient, IdmlTint } from '../model/document.js';
import { inlineItems, inlineText, reference, tablesOf } from './fixture.test-helper.js';
import { languageTag } from './languages.js';
import { plainText } from './story.js';
import { cellAt, rowBand } from './tables.js';

describe('reference package: the document', () => {
  const doc = reference();

  it('reads without a warning and says who wrote it', () => {
    expect(doc.warnings).toEqual([]);
    expect(doc.product).toBe('21.6(57)');
    expect(doc.domVersion).toBe('21.5');
    expect(doc.title).toBe('Reference');
    expect(doc.author).toBe('Postext');
    expect(doc.cmykProfile).toBe('Coated FOGRA39 (ISO 12647-2:2004)');
    expect(doc.rgbProfile).toBe('sRGB IEC61966-2.1');
  });

  it('names the parts and reads every one', () => {
    expect(doc.parts.graphic).toBe('Resources/Graphic.xml');
    expect(doc.parts.spreads).toHaveLength(3);
    expect(doc.parts.masterSpreads).toHaveLength(2);
    expect(doc.parts.stories).toHaveLength(18);
    expect(doc.stories.size).toBe(18);
    // The story list also counts the XML backing story, which is a part
    // of its own.
    expect(doc.storyList).toHaveLength(19);
    expect(doc.parts.backingStory).toBe('XML/BackingStory.xml');
    // Linked pictures are not in the package: it carries no other file.
    expect(doc.files.size).toBe(0);
  });

  it('has facing pages of 170 × 240 mm with a 3 mm bleed and a 14 pt baseline grid', () => {
    const p = doc.preferences;
    expect(p.facingPages).toBe(true);
    expect(p.rightToLeft).toBe(false);
    expect(p.pageWidth).toBeCloseTo((170 * 72) / 25.4, 6);
    expect(p.pageHeight).toBeCloseTo((240 * 72) / 25.4, 6);
    expect(p.bleed.top).toBeCloseTo((3 * 72) / 25.4, 6);
    expect(p.bleed.outside).toBeCloseTo((3 * 72) / 25.4, 6);
    expect(p.intent).toBe('PrintIntent');
    expect(p.baselineGrid).toMatchObject({ start: 54, division: 14, shown: false });
    expect(p.all?.FootnoteOption?.attrs.RuleOn).toBe('true');
    expect(p.all?.TextPreference?.attrs.SmallCap).toBe('70');
  });

  it('has four pages named i, ii, 1, 2 on three spreads', () => {
    const pages = doc.spreads.flatMap((s) => s.pages);
    expect(doc.spreads.map((s) => s.pages.length)).toEqual([1, 2, 1]);
    expect(pages.map((p) => p.name)).toEqual(['i', 'ii', '1', '2']);
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(pages.map((p) => p.side)).toEqual(['right', 'left', 'right', 'left']);
    expect(pages.map((p) => p.appliedMaster)).toEqual(['ud6', 'ud6', 'u171', undefined]);
    for (const p of pages) {
      expect(p.bounds.right - p.bounds.left).toBeCloseTo(481.8897637795276, 6);
      expect(p.bounds.bottom - p.bounds.top).toBeCloseTo(680.3149606299213, 6);
    }
  });

  it('reads the margins: 54/60/48/42 in two columns with a 14 pt gutter', () => {
    const first = doc.spreads[0]!.pages[0]!;
    expect(first.margins).toMatchObject({ top: 54, bottom: 60, left: 48, right: 42, columnCount: 2, columnGutter: 14, columnDirection: 'Horizontal' });
    expect(first.margins.columnsPositions).toHaveLength(4);
    expect(first.margins.columnsPositions[1]).toBeCloseTo(188.9448818897638, 6);
    // The opener page takes its master's margins.
    expect(doc.spreads[1]!.pages[1]!.margins).toMatchObject({ top: 36, bottom: 36, left: 36, right: 36, columnCount: 1 });
  });

  it('reads two masters, the second based on the first', () => {
    const [a, b] = doc.masterSpreads;
    expect(a).toMatchObject({ self: 'ud6', master: true, namePrefix: 'A', showMasterItems: true });
    expect(a!.basedOn).toBeUndefined();
    expect(b).toMatchObject({ self: 'u171', name: 'B-Opener', namePrefix: 'B', baseName: 'Opener', basedOn: 'ud6' });
    expect(a!.pages.map((p) => p.side)).toEqual(['left', 'right']);
    expect(a!.pages.map((p) => p.index)).toEqual([-1, -1]);
    expect(a!.items.map((i) => i.kind)).toEqual(['TextFrame', 'TextFrame', 'TextFrame', 'TextFrame']);
    expect(b!.items.map((i) => i.kind)).toEqual(['Rectangle']);
  });

  it('records the master item overridden on page ii', () => {
    const ii = doc.spreads[1]!.pages[0]!;
    expect(ii.overrideList).toContain('u16d');
    expect(doc.masterSpreads[0]!.items.some((i) => i.self === 'u16d')).toBe(true);
    expect(plainText(doc.stories.get('u36a')!.paragraphs)).toBe('Overridden head');
  });

  it('reads the sections: lower roman, then arabic restarting at 1', () => {
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]).toMatchObject({ pageStart: 'ud4', length: 2, pageNumberStyle: 'LowerRoman', continueNumbering: true });
    expect(doc.sections[1]).toMatchObject({ pageStart: 'ue4', length: 2, pageNumberStyle: 'Arabic', continueNumbering: false, pageNumberStart: 1 });
  });

  it('reads three layers, one of them hidden', () => {
    expect(doc.layers.map((l) => [l.name, l.visible])).toEqual([['Capa 1', true], ['Hidden notes', false], ['Art', true]]);
    expect(doc.layers.every((l) => l.printable && !l.locked)).toBe(true);
  });

  it('maps the languages InDesign lists to IETF tags', () => {
    expect(doc.languages.get('Language/$ID/Spanish%3a Castilian')).toEqual({ name: 'Spanish: Castilian', tag: 'es-ES' });
    expect(doc.languages.get('Language/$ID/English%3a USA')?.tag).toBe('en-US');
    expect(doc.languages.get('Language/$ID/de_DE_2006')?.tag).toBe('de-DE');
    expect(doc.languages.get('Language/$ID/[No Language]')?.tag).toBeUndefined();
    const tags: Record<string, string> = {
      'English: UK': 'en-GB', 'French': 'fr-FR', 'French: Canadian': 'fr-CA', 'German: Reformed': 'de-DE-1996', 'German: Swiss': 'de-CH', 'German: Austrian': 'de-AT', 'German: Traditional': 'de-DE-1901',
      'Italian': 'it-IT', 'Portuguese': 'pt-PT', 'Portuguese: Brazilian': 'pt-BR', 'Catalan': 'ca', 'Dutch': 'nl-NL', 'Japanese': 'ja', 'Chinese: Simplified': 'zh-Hans', 'Chinese: Traditional': 'zh-Hant',
      'Arabic': 'ar', 'Hebrew': 'he', 'Russian': 'ru', 'Greek': 'el', 'Polish': 'pl', 'Swedish': 'sv', 'Danish': 'da', 'Norwegian: Bokmal': 'nb', 'Norwegian: Nynorsk': 'nn', 'Finnish': 'fi', 'Czech': 'cs', 'Hungarian': 'hu',
      'Turkish': 'tr', 'Romanian': 'ro', 'Ukrainian': 'uk', 'nl_NL_2005': 'nl-NL', 'hi_IN': 'hi-IN',
    };
    for (const [name, tag] of Object.entries(tags)) expect([name, languageTag(`$ID/${name}`)]).toEqual([name, tag]);
    // Every language of the package but the placeholder has a tag.
    const untagged = [...doc.languages.values()].filter((l) => !l.tag).map((l) => l.name);
    expect(untagged).toEqual(['[No Language]']);
  });

  it('reads conditions, text variables, cross-reference formats and numbering lists', () => {
    expect(doc.conditions.get('Condition/Print only')).toEqual({ self: 'Condition/Print only', name: 'Print only', visible: false });
    expect(doc.conditions.get('Condition/Teacher')?.visible).toBe(true);
    expect([...doc.textVariables.values()].map((v) => v.type)).toContain('ModificationDateType');
    expect(doc.textVariables.size).toBe(10);
    expect(doc.crossReferenceFormats.size).toBe(9);
    expect(doc.crossReferenceFormats.get('u9f')?.blocks.map((b) => b.type)).toEqual(['CustomStringBuildingBlock', 'FullParagraphBuildingBlock', 'CustomStringBuildingBlock', 'PageNumberBuildingBlock']);
    expect(doc.crossReferenceFormats.get('ua7')?.blocks[0]?.text).toBe('página ');
    expect(doc.numberingLists.get('NumberingList/$ID/[Default]')).toMatchObject({ name: '[Default]', continueAcrossStories: false });
  });

  it('reads the three hyperlinks, the cross-reference and their destinations', () => {
    const byName = new Map(doc.hyperlinks.map((h) => [h.name, h]));
    expect(doc.hyperlinks).toHaveLength(4);
    expect(byName.get('postext')).toMatchObject({ source: 'u1dd', destination: 'HyperlinkURLDestination/URL 1' });
    expect(doc.destinations.get('HyperlinkURLDestination/URL 1')).toMatchObject({ kind: 'url', url: 'https://postext.dev/' });
    expect(byName.get('to chapter')).toMatchObject({ source: 'u1e4', destination: 'HyperlinkTextDestination/chapter-one' });
    expect(doc.destinations.get('HyperlinkTextDestination/chapter-one')).toMatchObject({ kind: 'text', name: 'chapter-one', story: 'u17e' });
    expect(byName.get('to page 3')).toMatchObject({ source: 'u1e6', destination: 'HyperlinkPageDestination/Página 3' });
    // The page destination names page "1", the third of the document.
    expect(doc.destinations.get('HyperlinkPageDestination/Página 3')).toMatchObject({ kind: 'page', page: 'ue4' });
    expect(doc.spreads[1]!.pages[1]!.self).toBe('ue4');
    expect(byName.get('Referencia cruzada')).toMatchObject({ source: 'u1eb', destination: 'ParagraphDestination/Anclaje 1' });
    expect(doc.destinations.get('ParagraphDestination/Anclaje 1')).toMatchObject({ kind: 'paragraph', story: 'u17e' });
  });

  it('reads the bookmark and the index topics', () => {
    expect(doc.bookmarks).toEqual([{ name: 'Chapter Two', destination: 'HyperlinkPageDestination/Página 1', children: [] }]);
    expect([...doc.topics.values()].map((t) => [...t.path, t.name].join(' > '))).toEqual(['Typography', 'Typography > Leading']);
  });
});

describe('reference package: resources', () => {
  const doc = reference();
  const colour = (self: string): IdmlColor => doc.swatches.get(self) as IdmlColor;

  it('reads the swatches with their values', () => {
    expect(colour('Color/Brand Cyan')).toMatchObject({ kind: 'color', name: 'Brand Cyan', model: 'Process', space: 'CMYK', value: [80, 10, 0, 5], visible: true });
    expect(colour('Color/Screen Red')).toMatchObject({ space: 'RGB', value: [220, 30, 40] });
    expect(colour('Color/Lab Green')).toMatchObject({ space: 'LAB', value: [60, -50, 40] });
    expect(colour('Color/PANTONE 185 C')).toMatchObject({ model: 'Spot', space: 'CMYK', value: [0, 93, 79, 0] });
    expect(doc.swatches.get('Tint/PANTONE 185 C 40%25') as IdmlTint).toMatchObject({ kind: 'tint', name: 'PANTONE 185 C 40%', base: 'Color/PANTONE 185 C', tint: 40 });
    expect(doc.swatches.get('Gradient/Sky') as IdmlGradient).toMatchObject({
      kind: 'gradient',
      type: 'Linear',
      stops: [{ color: 'Color/Brand Cyan', location: 0, midpoint: 50 }, { color: 'Color/Paper', location: 100, midpoint: 50 }],
    });
    expect(doc.swatches.get('Swatch/None')).toMatchObject({ kind: 'none', name: 'None' });
  });

  it("tells InDesign's own colours apart", () => {
    expect(colour('Color/Black').special).toBe('black');
    expect(colour('Color/Paper').special).toBe('paper');
    expect(colour('Color/Registration')).toMatchObject({ special: 'registration', model: 'Registration' });
    expect(colour('Color/Cyan')).toMatchObject({ special: 'reserved', visible: false });
    expect(colour('Color/Brand Cyan').special).toBeUndefined();
  });

  it('reads the stroke styles and the fonts', () => {
    expect(doc.strokeStyles.get('StrokeStyle/$ID/Solid')).toMatchObject({ name: 'Solid', kind: 'solid' });
    expect(doc.strokeStyles.get('StrokeStyle/$ID/Canned Dashed 3x2')?.kind).toBe('dashed');
    expect(doc.strokeStyles.get('StrokeStyle/$ID/Japanese Dots')?.kind).toBe('dotted');
    expect(doc.strokeStyles.get('StrokeStyle/$ID/ThickThin')?.kind).toBe('striped');
    expect(doc.fonts.find((f) => f.postScriptName === 'MinionPro-Regular')).toMatchObject({ family: 'Minion Pro', style: 'Regular', type: 'OpenTypeCFF', status: 'Installed' });
    expect(doc.fonts.some((f) => f.family === 'Georgia' && f.style === 'Bold')).toBe(true);
  });

  it('reads the paragraph styles: a group, based-on by reference and by name', () => {
    const h1 = doc.styles.paragraph.get('ParagraphStyle/Heads%3aH1')!;
    expect(h1).toMatchObject({ kind: 'paragraph', name: 'H1', groups: ['Heads'], basedOn: 'ParagraphStyle/Body', root: false });
    expect(h1.attrs.PointSize).toBe('22');
    const body = doc.styles.paragraph.get('ParagraphStyle/Body')!;
    // Written `type="string"` as `$ID/[No paragraph style]`.
    expect(body.basedOn).toBe('ParagraphStyle/$ID/[No paragraph style]');
    expect(doc.styles.paragraph.get('ParagraphStyle/$ID/[No paragraph style]')).toMatchObject({ root: true, name: '[No paragraph style]' });
    expect(doc.styles.paragraph.get('ParagraphStyle/$ID/[No paragraph style]')!.basedOn).toBeUndefined();
    expect(doc.styles.paragraph.get('ParagraphStyle/Bullets')!.attrs.BulletsAndNumberingListType).toBe('BulletList');
    expect(doc.styles.paragraph.get('ParagraphStyle/Numbers')!.attrs.BulletsAndNumberingListType).toBe('NumberedList');
  });

  it('reads the nested style and the GREP style of Body', () => {
    expect(doc.styles.paragraph.get('ParagraphStyle/Body')!.nested).toEqual([
      { kind: 'nested', characterStyle: 'CharacterStyle/Emphasis', delimiter: ':', repetition: 1, inclusive: true },
      { kind: 'grep', characterStyle: 'CharacterStyle/Strong red', expression: '\\d+' },
    ]);
  });

  it('reads character, object, table and cell styles', () => {
    expect(doc.styles.character.get('CharacterStyle/Emphasis')).toMatchObject({ name: 'Emphasis', basedOn: 'CharacterStyle/$ID/[No character style]' });
    expect(doc.styles.character.get('CharacterStyle/Strong red')!.attrs).toMatchObject({ FillColor: 'Color/Screen Red', FontStyle: 'Bold' });
    expect(doc.styles.character.get('CharacterStyle/$ID/[No character style]')!.root).toBe(true);
    expect(doc.styles.object.get('ObjectStyle/Tinted box')).toMatchObject({ name: 'Tinted box', basedOn: 'ObjectStyle/$ID/[None]' });
    expect(doc.styles.table.get('TableStyle/Ledger')).toMatchObject({ name: 'Ledger', basedOn: 'TableStyle/$ID/[No table style]' });
    expect(doc.styles.cell.get('CellStyle/Money')).toMatchObject({ name: 'Money', basedOn: 'CellStyle/$ID/[None]' });
    expect(doc.styles.cell.get('CellStyle/Money')!.attrs.FillColor).toBe('Tint/PANTONE 185 C 40%25');
  });
});

describe('reference package: stories', () => {
  const doc = reference();
  const main = doc.stories.get('u17e')!;

  it('cuts the main story into its nine paragraphs', () => {
    expect(main.paragraphs).toHaveLength(9);
    expect(main.paragraphs.map((p) => p.paragraphStyle)).toEqual(['ParagraphStyle/Heads%3aH1', ...Array<string>(8).fill('ParagraphStyle/Body')]);
    const text = plainText(main.paragraphs).split('\n');
    expect(text[0]).toBe('Chapter One');
    expect(text[1]).toMatch(/^Lead: this is the first paragraph with 123 numbers and some emphasised words to style\. /);
    // One paragraph range holds the lead and the paragraphs after it:
    // they are cut at the `Br`s, not at the range.
    for (const i of [2, 3, 4, 5, 6, 7]) expect(text[i]).toMatch(/^Lorem ipsu/);
    expect(main).toMatchObject({ direction: 'ltr', orientation: 'horizontal', endnotes: false, trackChanges: false });
  });

  it('keeps the local overrides of the lead paragraph on their runs', () => {
    const lead = main.paragraphs[1]!;
    const run = (word: string) => lead.runs.find((r) => inlineText(r.content) === word)!;
    expect(run('with').characterStyle).toBe('CharacterStyle/Emphasis');
    expect(run('numbers').attrs.FontStyle).toBe('Bold');
    expect(run('and').attrs.Underline).toBe('true');
    expect(run('some').attrs.StrikeThru).toBe('true');
    expect(run('emphasised').attrs.Position).toBe('Superscript');
    expect(run('words').attrs.Capitalization).toBe('SmallCaps');
    expect(run('to').attrs.Tracking).toBe('50');
  });

  it('reads the two destinations at the head of the chapter', () => {
    const marks = main.paragraphs[0]!.runs[0]!.content.filter((i) => i.kind === 'destination');
    expect(marks).toEqual([
      { kind: 'destination', self: 'ParagraphDestination/Anclaje 1', name: 'Anclaje 1', destinationType: 'paragraph' },
      { kind: 'destination', self: 'HyperlinkTextDestination/chapter-one', name: 'chapter-one', destinationType: 'text' },
    ]);
  });

  it('reads the footnote with its text, inside the first hyperlink', () => {
    const para = main.paragraphs[2]!;
    const linked = para.runs.filter((r) => r.linkSource === 'u1dd');
    // The source wraps three character ranges: "si", the footnote, "t".
    expect(linked.map((r) => inlineText(r.content))).toEqual(['si', '<footnote>', 't']);
    const note = linked[1]!.content[0]!;
    expect(note.kind).toBe('footnote');
    if (note.kind !== 'footnote') return;
    expect(note.paragraphs).toHaveLength(1);
    expect(inlineText(note.paragraphs[0]!.runs[0]!.content)).toBe('{footnoteNumber}\tA footnote with its own text.');
    expect(linked[1]!.attrs.Position).toBe('Superscript');
  });

  it('reads hyperlink sources written inside a character range', () => {
    const para = main.paragraphs[3]!;
    expect(para.runs.filter((r) => r.linkSource === 'u1e4').map((r) => inlineText(r.content))).toEqual(['dolor']);
    // The third link holds an inline rectangle between its letters.
    expect(para.runs.filter((r) => r.linkSource === 'u1e6').map((r) => inlineText(r.content))).toEqual(['c<item>onsectetur']);
    expect(para.runs.filter((r) => !r.linkSource).every((r) => r.crossReference === undefined)).toBe(true);
  });

  it('reads the cross-reference with its format and its page number variable', () => {
    const runs = main.paragraphs[4]!.runs.filter((r) => r.linkSource === 'u1eb');
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.crossReference?.format === 'u9f')).toBe(true);
    expect(inlineText(runs[0]!.content)).toBe('”Chapter One” en la página ');
    expect(runs[1]!.content).toEqual([{ kind: 'variable', variable: 'dTextVariablen<?AID 001b?>TV XRefPageNumber', result: 'i' }]);
    expect(doc.textVariables.get('dTextVariablen<?AID 001b?>TV XRefPageNumber')?.type).toBe('XrefPageNumberType');
  });

  it('reads the two index marks with their topics', () => {
    const marks = main.paragraphs.flatMap((p) => p.runs.flatMap((r) => r.content)).filter((i) => i.kind === 'indexMark');
    expect(marks).toEqual([
      { kind: 'indexMark', topic: 'u1eeTopicnTypography', type: 'CurrentPage' },
      { kind: 'indexMark', topic: 'u1eeTopicnTypographyTopicnLeading', type: 'CurrentPage' },
    ]);
    for (const m of marks) expect(doc.topics.has((m as { topic: string }).topic)).toBe(true);
  });

  it('reads the anchored objects: inline, anchored frame, above line', () => {
    const items = inlineItems(doc, 'u17e');
    expect(items.map((i) => [i.self, i.kind, i.anchored?.position])).toEqual([
      ['u23e', 'Rectangle', 'InlinePosition'],
      ['u253', 'TextFrame', 'Anchored'],
      ['u258', 'Rectangle', 'AboveLine'],
    ]);
    expect(items[0]!.attrs.FillColor).toBe('Color/Screen Red');
    expect(items[1]!.textFrame?.story).toBe('u241');
    expect(items[1]!.anchored?.props.AnchorPoint).toBe('TopLeftAnchor');
    expect(plainText(doc.stories.get('u241')!.paragraphs)).toBe('Anchored sidebar');
    // The picture is linked; its link was made neutral in the fixture.
    expect(items[2]!.graphic).toMatchObject({ type: 'Image', space: 'Links_RGB', actualPpi: [300, 300] });
    expect(items[2]!.graphic!.link).toMatchObject({ uri: 'file:/Volumes/Work/reference/pic.png', name: 'pic.png', stored: 'Normal', format: 'Portable Network Graphics (PNG)' });
    expect(items[2]!.graphic!.data).toBeUndefined();
  });

  it('reads the table: header and footer rows, spans, cell kinds and styles', () => {
    const [table] = tablesOf(doc, 'u17e');
    expect(table).toBeDefined();
    const t = table!;
    expect(t).toMatchObject({ headerRows: 1, footerRows: 1, bodyRows: 3, tableStyle: 'TableStyle/Ledger' });
    expect(t.columns.map((c) => Math.round(c.width))).toEqual([120, 63, 63]);
    expect(t.rows).toHaveLength(5);
    expect(t.rows[2]).toMatchObject({ height: 30, minHeight: 30, autoGrow: false });
    expect(t.rows[0]!.autoGrow).toBe(true);
    expect(t.cells).toHaveLength(13);
    // Merged across two columns, and down two rows.
    expect(cellAt(t, 0, 1)).toMatchObject({ col: 0, row: 1, colSpan: 2, rowSpan: 1 });
    expect(cellAt(t, 1, 1)).toBe(cellAt(t, 0, 1));
    expect(cellAt(t, 0, 2)).toMatchObject({ col: 0, row: 2, colSpan: 1, rowSpan: 2 });
    expect(cellAt(t, 0, 3)).toBe(cellAt(t, 0, 2));
    expect(plainText(cellAt(t, 0, 1)!.paragraphs)).toBe('span two');
    expect(plainText(cellAt(t, 0, 2)!.paragraphs)).toBe('tall');
    expect([0, 1, 2].map((c) => plainText(cellAt(t, c, 0)!.paragraphs))).toEqual(['Head A', 'Head A', 'Head A']);
    expect([0, 1, 2].map((c) => plainText(cellAt(t, c, 4)!.paragraphs))).toEqual(['F1', 'F1', 'F1']);
    expect([0, 1, 2, 3, 4].map((r) => rowBand(t, r))).toEqual(['header', 'body', 'body', 'body', 'footer']);
    // The cell with a cell style and a diagonal line, the rotated one,
    // the one that holds a picture.
    expect(cellAt(t, 2, 1)).toMatchObject({ cellStyle: 'CellStyle/Money', type: 'text' });
    expect(cellAt(t, 2, 1)!.attrs.TopLeftDiagonalLine).toBe('true');
    expect(cellAt(t, 2, 3)!.attrs.RotationAngle).toBe('90');
    expect(plainText(cellAt(t, 2, 3)!.paragraphs)).toBe('rot');
    const picture = cellAt(t, 2, 2)!;
    expect(picture).toMatchObject({ type: 'graphic', paragraphs: [] });
    expect(picture.items).toHaveLength(1);
    expect(picture.items[0]!.graphic?.link?.name).toBe('pic.png');
  });

  it('reads the right-to-left story', () => {
    const rtl = doc.stories.get('u277')!;
    expect(rtl.direction).toBe('rtl');
    expect(rtl.paragraphs[0]!.attrs).toMatchObject({ ParagraphDirection: 'RightToLeftDirection', Justification: 'RightAlign' });
    // The script that made the document was read by InDesign in another
    // encoding, so the Arabic it typed is not Arabic: the package holds
    // what InDesign held. The digits between the words are as typed.
    expect(plainText(rtl.paragraphs)).toMatch(/^\S+ \S+ 123 \S+ \S+$/);
  });

  it('reads ruby, emphasis marks and tate-chu-yoko on the Japanese text', () => {
    const jp = doc.stories.get('u25e')!;
    // The same of the Japanese: the characters are not the ones meant,
    // the attributes on them are.
    expect(plainText(jp.paragraphs)).toMatch(/12/);
    expect(jp.orientation).toBe('horizontal');
    const runs = jp.paragraphs[0]!.runs;
    expect(runs.find((r) => r.attrs.RubyString)?.attrs).toMatchObject({ RubyFlag: '1' });
    expect(runs.some((r) => r.attrs.KentenKind === 'KentenSesameDot')).toBe(true);
    expect(runs.some((r) => r.attrs.Tatechuyoko === 'true')).toBe(true);
  });

  it('reads conditional text, hidden text and the note', () => {
    const story = doc.stories.get('u2eb')!;
    const [para] = story.paragraphs;
    expect(story.paragraphs).toHaveLength(1);
    const runs = para!.runs;
    expect(runs.map((r) => inlineText(r.content))).toEqual(['Sho<note>wn', ' text and conditional ', 'hidden text and', ' more.']);
    expect(runs[0]!.conditions).toEqual(['Condition/Teacher']);
    // The reference escapes the space of the name; the condition's own
    // identifier does not.
    expect(runs[2]!.conditions).toEqual(['Condition/Print only']);
    expect(runs[2]!.hidden).toBe(true);
    expect(runs[3]!.hidden).toBeUndefined();
    for (const r of runs) for (const c of r.conditions) expect(doc.conditions.has(c)).toBe(true);
    const note = runs[0]!.content[1]!;
    expect(note.kind === 'note' && plainText(note.paragraphs)).toBe('An editorial note');
  });

  it('reads the lists: two bullet paragraphs, three numbered ones', () => {
    const list = doc.stories.get('u305')!;
    expect(list.paragraphs.map((p) => [p.paragraphStyle, plainText([p])])).toEqual([
      ['ParagraphStyle/Bullets', 'First bullet'],
      ['ParagraphStyle/Bullets', 'Second bullet'],
      ['ParagraphStyle/Numbers', 'Step one'],
      ['ParagraphStyle/Numbers', 'Step two'],
      ['ParagraphStyle/Numbers', 'Step three'],
    ]);
  });

  it('reads the automatic page number of the master as a special character', () => {
    const folio = doc.stories.get('u116')!;
    expect(folio.paragraphs[0]!.runs[0]!.content).toEqual([{ kind: 'special', char: 'pageNumber' }]);
    expect(folio.paragraphs[0]!.attrs.Justification).toBe('CenterAlign');
  });

  it('keeps the tab list, the rule and the drop cap on the paragraph', () => {
    const para = doc.stories.get('u34d')!.paragraphs[0]!;
    expect(plainText([para])).toBe('Name\tPrice\t12.50');
    expect(para.attrs).toMatchObject({ DropCapCharacters: '1', DropCapLines: '2', RuleBelow: 'true', RuleBelowLineWeight: '0.5' });
    expect(para.properties.TabList).toBeDefined();
  });
});

describe('reference package: page items', () => {
  const doc = reference();
  const item = (self: string) => [...doc.spreads, ...doc.masterSpreads].flatMap((s) => s.items).flatMap((i) => [i, ...i.children]).find((i) => i.self === self)!;

  it('threads the main story over three frames, the first in two columns', () => {
    expect(item('u190').textFrame).toMatchObject({ story: 'u17e', next: 'u1a8', columns: 2, gutter: 14 });
    expect(item('u190').textFrame!.previous).toBeUndefined();
    expect(item('u1a8').textFrame).toMatchObject({ story: 'u17e', previous: 'u190', next: 'u1bf', columns: 1 });
    expect(item('u1bf').textFrame).toMatchObject({ story: 'u17e', previous: 'u1a8' });
    expect(item('u1bf').textFrame!.next).toBeUndefined();
  });

  it('reads the placed picture: rounded corner, text wrap, object style', () => {
    const frame = item('u22f');
    expect(frame).toMatchObject({ kind: 'Rectangle', objectStyle: 'ObjectStyle/Tinted box', contentType: 'GraphicType', layer: 'ufb' });
    expect(frame.attrs.TopLeftCornerOption).toBe('RoundedCorner');
    expect(frame.wrap).toMatchObject({ mode: 'BoundingBoxTextWrap', offset: [6, 6, 6, 6], side: 'BothSides', inverse: false });
    expect(frame.graphic).toMatchObject({ type: 'Image', effectivePpi: [192, 192] });
    expect(frame.graphic!.bounds.right).toBeCloseTo(144.0003, 3);
    expect(frame.graphic!.transform[0]).toBeCloseTo(1.5625, 4);
  });

  it('reads opacity and the drop shadow of the rotated picture', () => {
    const frame = item('u234');
    expect(frame.opacity).toBe(70);
    expect(frame.effects).toEqual(['DropShadow']);
    expect(item('u22f').opacity).toBe(100);
    expect(item('u22f').effects).toEqual([]);
  });

  it('reads the group with its oval and polygon, and the line', () => {
    const group = item('u23d');
    expect(group).toMatchObject({ kind: 'Group', name: 'shapes' });
    expect(group.children.map((c) => c.kind)).toEqual(['Oval', 'Polygon']);
    expect(group.children[0]!.attrs).toMatchObject({ FillColor: 'Gradient/Sky', StrokeColor: 'Color/PANTONE 185 C', StrokeWeight: '2' });
    expect(group.children[1]!.attrs.FillColor).toBe('Color/Lab Green');
    expect(group.children[0]!.paths[0]!.points).toHaveLength(4);
    // An oval's points have handles; a polygon's are corners.
    const oval = group.children[0]!.paths[0]!.points[0]!;
    expect(oval.left.x !== oval.anchor.x || oval.left.y !== oval.anchor.y).toBe(true);
    const line = item('u23c');
    expect(line.kind).toBe('GraphicLine');
    expect(line.paths[0]).toMatchObject({ open: true });
    expect(line.paths[0]!.points).toHaveLength(2);
  });

  it('reads hidden, non-printing and hidden-layer items, and text on a path', () => {
    expect(item('u2cf')).toMatchObject({ visible: false, nonprinting: false });
    expect(item('u2e6')).toMatchObject({ visible: true, nonprinting: true });
    expect(item('u2b7').layer).toBe('uf2');
    expect(doc.layers.find((l) => l.self === 'uf2')!.visible).toBe(false);
    const oval = item('u333');
    expect(oval.textPaths).toHaveLength(1);
    expect(oval.textPaths[0]).toMatchObject({ story: 'u335' });
    expect(oval.textPaths[0]!.props.PathEffect).toBe('RainbowPathEffect');
    expect(plainText(doc.stories.get('u335')!.paragraphs)).toBe('Text on a path');
  });

  it('keeps the items of a spread back to front', () => {
    expect(doc.spreads[1]!.items.map((i) => i.self)).toEqual(['u367', 'u1a8', 'u1bf', 'u22f', 'u234', 'u23d', 'u23c']);
  });
});
