// What an importer asks of the reference document: computed styles,
// colours, places on the page, master items, reading order, the summary.

import { describe, expect, it } from 'vitest';
import { IDENTITY } from '../model/geometry.js';
import { inlineItems, inlineText, reference } from '../read/fixture.test-helper.js';
import { cmykToRgb, isNoColour, labToRgb, resolveColour } from './colour.js';
import { characterFormat, paragraphFormat } from './format.js';
import { graphicCrop, itemGeometry, itemIndex, pageSize, textColumns, textContentBox } from './geometry.js';
import { inspectIdml } from './inspect.js';
import { masterItems, masterPageFor } from './masters.js';
import { findOrdered, readingOrder } from './order.js';
import { computeStyle, paragraphProps, runProps, styleByPath, styleChain, stylePath } from './styles.js';

const doc = reference();
const pages = doc.spreads.flatMap((s) => s.pages);

describe('computed styles', () => {
  it('finds Heads/H1 by its path and walks its chain from the root', () => {
    const h1 = styleByPath(doc, 'paragraph', ['Heads', 'H1'])!;
    expect(h1.self).toBe('ParagraphStyle/Heads%3aH1');
    expect(stylePath(h1)).toBe('Heads/H1');
    expect(styleChain(doc, 'paragraph', h1.self).map((s) => s.name)).toEqual(['[No paragraph style]', 'Body', 'H1']);
  });

  it('merges the chain: H1 takes its font from Body and its size from itself', () => {
    const p = computeStyle(doc, 'paragraph', 'ParagraphStyle/Heads%3aH1');
    const c = characterFormat(p);
    expect(c).toMatchObject({ fontFamily: 'Georgia', fontStyle: 'Bold', pointSize: 22, leading: 26, autoLeading: false, fillColor: 'Color/Brand Cyan', tracking: 0, language: 'Spanish: Castilian', languageTag: 'es-ES' });
    expect(paragraphFormat(p)).toMatchObject({ justification: 'LeftAlign', align: 'left', firstLineIndent: 0, spaceBefore: 12, spaceAfter: 8, direction: 'ltr', hyphenation: true });
    expect(paragraphFormat(p).keep.withNext).toBe(2);
    // The style's own name is not a property of the text.
    expect(p.attrs.Name).toBeUndefined();
    expect(p.attrs.Self).toBeUndefined();
  });

  it('reads Body: justified, 10.5 on 14, 12 pt first line indent', () => {
    const p = computeStyle(doc, 'paragraph', 'ParagraphStyle/Body');
    expect(characterFormat(p)).toMatchObject({ fontFamily: 'Georgia', fontStyle: 'Regular', pointSize: 10.5, leading: 14 });
    expect(paragraphFormat(p)).toMatchObject({ justification: 'LeftJustified', align: 'justify', firstLineIndent: 12 });
  });

  it('works out an automatic leading from the size', () => {
    const p = computeStyle(doc, 'paragraph', 'ParagraphStyle/$ID/NormalParagraphStyle');
    expect(characterFormat(p)).toMatchObject({ fontFamily: 'Minion Pro', pointSize: 12, leading: 14.4, autoLeading: true });
  });

  it('lays character style and local overrides over the paragraph', () => {
    const lead = doc.stories.get('u17e')!.paragraphs[1]!;
    const format = (word: string) => characterFormat(runProps(doc, lead, lead.runs.find((r) => inlineText(r.content) === word)!));
    expect(format('with')).toMatchObject({ fontStyle: 'Italic', fontFamily: 'Georgia', pointSize: 10.5 });
    expect(format('numbers').fontStyle).toBe('Bold');
    expect(format('and').underline).toBe(true);
    expect(format('some').strikeThru).toBe(true);
    expect(format('emphasised').position).toBe('Superscript');
    expect(format('words').capitalization).toBe('SmallCaps');
    expect(format('to').tracking).toBe(50);
    expect(format('to')).toMatchObject({ underline: false, strikeThru: false, position: 'Normal', capitalization: 'Normal', horizontalScale: 100, verticalScale: 100, baselineShift: 0 });
  });

  it('reads the lists from their styles', () => {
    const list = doc.stories.get('u305')!;
    const bullet = paragraphFormat(paragraphProps(doc, list.paragraphs[0]!));
    expect(bullet).toMatchObject({ leftIndent: 14, firstLineIndent: -14 });
    expect(bullet.list).toMatchObject({ type: 'bullet', level: 1, bullet: '•', textAfter: '^t' });
    const numbered = paragraphFormat(paragraphProps(doc, list.paragraphs[2]!));
    expect(numbered.list).toMatchObject({ type: 'numbered', level: 1, expression: '^#.^t', numberFormat: '1, 2, 3, 4...', startAt: 1, continues: true, numberingList: 'NumberingList/$ID/[Default]' });
    expect(paragraphFormat(computeStyle(doc, 'paragraph', 'ParagraphStyle/Body')).list).toBeUndefined();
  });

  it('reads tab stops with a leader, the rule below and the drop cap', () => {
    const f = paragraphFormat(paragraphProps(doc, doc.stories.get('u34d')!.paragraphs[0]!));
    expect(f.tabs).toEqual([
      { position: 120, alignment: 'RightAlign', alignmentCharacter: '.', leader: '.' },
      { position: 200, alignment: 'CharacterAlign', alignmentCharacter: '.', leader: '' },
    ]);
    expect(f.ruleBelow).toMatchObject({ weight: 0.5, width: 'ColumnWidth', offset: 0 });
    expect(f.ruleBelow!.color).toBeUndefined();
    expect(f.ruleAbove).toBeUndefined();
    expect(f.dropCap).toEqual({ characters: 1, lines: 2 });
  });

  it('reads direction, ruby, emphasis marks and tate-chu-yoko', () => {
    const rtl = doc.stories.get('u277')!.paragraphs[0]!;
    expect(paragraphFormat(paragraphProps(doc, rtl))).toMatchObject({ direction: 'rtl', align: 'right' });
    const jp = doc.stories.get('u25e')!.paragraphs[0]!;
    const formats = jp.runs.map((r) => characterFormat(runProps(doc, jp, r)));
    expect(formats.find((f) => f.ruby)?.ruby).toMatchObject({ type: 'PerCharacterRuby', position: 'AboveRight' });
    expect(formats.find((f) => f.kenten)?.kenten).toMatchObject({ kind: 'KentenSesameDot' });
    expect(formats.filter((f) => f.tatechuyoko)).toHaveLength(1);
  });

  it('centres the folio of the master by a local override', () => {
    const folio = doc.stories.get('u116')!.paragraphs[0]!;
    expect(paragraphFormat(paragraphProps(doc, folio)).align).toBe('center');
  });
});

describe('colours', () => {
  it('resolves each kind of swatch', () => {
    expect(resolveColour(doc, 'Color/Brand Cyan')).toEqual({ hex: '#30daf2', cmyk: [80, 10, 0, 5], tint: 1, kind: 'process' });
    expect(resolveColour(doc, 'Color/Screen Red')).toEqual({ hex: '#dc1e28', tint: 1, kind: 'process' });
    expect(resolveColour(doc, 'Color/PANTONE 185 C')).toMatchObject({ kind: 'spot', spot: 'PANTONE 185 C', cmyk: [0, 93, 79, 0], tint: 1 });
    expect(resolveColour(doc, 'Color/Paper')).toMatchObject({ hex: '#ffffff', kind: 'paper' });
    expect(resolveColour(doc, 'Color/Black')).toMatchObject({ hex: '#000000', kind: 'black' });
    expect(resolveColour(doc, 'Color/Registration')).toMatchObject({ hex: '#000000', kind: 'registration' });
  });

  it('converts Lab through D50 to sRGB', () => {
    // L 60 a -50 b 40: a mid green. Checked against the CIE formulas.
    const lab = resolveColour(doc, 'Color/Lab Green')!;
    expect(lab.hex).toBe('#2ba643');
    expect(labToRgb(100, 0, 0).map(Math.round)).toEqual([255, 255, 255]);
    expect(labToRgb(0, 0, 0).map(Math.round)).toEqual([0, 0, 0]);
    const grey = labToRgb(50, 0, 0).map(Math.round);
    expect(grey[0]).toBe(119);
    expect(Math.abs(grey[0]! - grey[1]!) <= 1 && Math.abs(grey[1]! - grey[2]!) <= 1).toBe(true);
    expect(cmykToRgb(0, 100, 100, 0)).toEqual([255, 0, 0]);
  });

  it('applies a tint towards white, of a tint swatch and of the text', () => {
    const tint = resolveColour(doc, 'Tint/PANTONE 185 C 40%25')!;
    expect(tint).toMatchObject({ kind: 'spot', spot: 'PANTONE 185 C', tint: 0.4, hex: '#ffa0ae' });
    expect(resolveColour(doc, 'Color/Black', 50)).toMatchObject({ hex: '#808080', tint: 0.5 });
    expect(resolveColour(doc, 'Color/Black', -1)).toMatchObject({ hex: '#000000', tint: 1 });
    expect(resolveColour(doc, 'Tint/PANTONE 185 C 40%25', 50)!.tint).toBeCloseTo(0.2, 9);
  });

  it('resolves a gradient to its stops and a first colour', () => {
    const sky = resolveColour(doc, 'Gradient/Sky')!;
    expect(sky).toMatchObject({ kind: 'gradient', gradientType: 'Linear', hex: '#30daf2' });
    expect(sky.stops!.map((s) => [s.location, s.colour?.hex])).toEqual([[0, '#30daf2'], [100, '#ffffff']]);
  });

  it('gives nothing for None and for a swatch that is not there', () => {
    expect(resolveColour(doc, 'Swatch/None')).toBeUndefined();
    expect(isNoColour(doc, 'Swatch/None')).toBe(true);
    expect(resolveColour(doc, 'Color/Nowhere')).toBeUndefined();
    expect(isNoColour(doc, 'Color/Nowhere')).toBe(false);
    expect(resolveColour(doc, undefined)).toBeUndefined();
  });
});

describe('geometry', () => {
  const box = (self: string) => {
    const g = itemGeometry(doc, self)!;
    return { page: g.pageIndex, left: Math.round(g.box.left * 100) / 100, top: Math.round(g.box.top * 100) / 100, right: Math.round(g.box.right * 100) / 100, bottom: Math.round(g.box.bottom * 100) / 100 };
  };
  const { width: W, height: H } = pageSize(pages[0]!);

  it('places the frames of the main story inside the margins of their pages', () => {
    // Page i is a right page: 48 inside, 42 outside, 54 above, 60 below.
    expect(box('u190')).toEqual({ page: 0, left: 48, top: 54, right: Math.round((W - 42) * 100) / 100, bottom: Math.round((H - 60) * 100) / 100 });
    // Page ii is a left page: the margins mirror. The third frame of
    // the thread stands on it too, over the second one's upper part.
    expect(box('u1a8')).toEqual({ page: 1, left: 42, top: 54, right: Math.round((W - 48) * 100) / 100, bottom: Math.round((H - 60) * 100) / 100 });
    expect(box('u1bf')).toMatchObject({ page: 1, left: 48, top: 54, bottom: 300 });
  });

  it('gives a frame its content box and its columns', () => {
    const frame = itemIndex(doc).get('u190')!.item;
    const content = textContentBox(frame, itemGeometry(doc, frame))!;
    expect(content.box.left).toBeCloseTo(48, 6);
    expect(content.box.top).toBeCloseTo(54, 6);
    const columns = textColumns(frame);
    expect(columns).toHaveLength(2);
    expect(columns[0]!.width).toBeCloseTo(188.9448818897638, 6);
    expect(columns[1]!.left).toBeCloseTo(202.9448818897638, 6);
  });

  it('reads the rotation of the turned picture and leaves the others square', () => {
    // The script turned it 12° counter-clockwise.
    expect(itemGeometry(doc, 'u234')!.rotation).toBeCloseTo(-12, 6);
    expect(itemGeometry(doc, 'u22f')!.rotation).toBe(0);
    expect(itemGeometry(doc, 'u234')!).toMatchObject({ scaleX: expect.closeTo(1, 9), scaleY: expect.closeTo(1, 9), flipped: false });
  });

  it('places grouped items through their group', () => {
    expect(box('u23a')).toEqual({ page: 1, left: 48, top: 480, right: 148, bottom: 560 });
    expect(box('u23b')).toEqual({ page: 1, left: 170, top: 480, right: 250, bottom: 560 });
    // The group has no path of its own: its box is what it holds.
    expect(box('u23d')).toEqual({ page: 1, left: 48, top: 480, right: 250, bottom: 560 });
    expect(box('u23c')).toEqual({ page: 1, left: 48, top: 570, right: 400, bottom: 570 });
    expect(itemIndex(doc).get('u23a')!.parents.map((p) => p.self)).toEqual(['u23d']);
  });

  it('tells the item on the pasteboard', () => {
    const g = itemGeometry(doc, 'u2a0')!;
    expect(g.pasteboard).toBe(true);
    expect(g.pageIndex).toBe(-1);
    expect(g.page).toBeUndefined();
    // Still told relative to the spread's page: 60 pt right of its edge.
    expect(g.box.left).toBeCloseTo(W + 60, 6);
    expect(itemGeometry(doc, 'u289')!.pasteboard).toBe(false);
  });

  it('gives no place to an item anchored in text', () => {
    const [inline] = inlineItems(doc, 'u17e');
    expect(itemGeometry(doc, inline!)).toBeUndefined();
    expect(itemGeometry(doc, 'nowhere')).toBeUndefined();
  });

  it('says what a frame shows of its picture', () => {
    // 144 × 96 pt picture scaled 1.5625 to 225 × 150 in a 200 × 150
    // frame, centred: the frame shows the middle 200/225 of its width.
    const crop = graphicCrop(itemIndex(doc).get('u22f')!.item)!;
    expect(crop.scaleX).toBeCloseTo(1.5625, 4);
    expect(crop.scaleY).toBeCloseTo(1.5625, 4);
    expect(crop.width).toBeCloseTo(200 / 225, 4);
    expect(crop.x).toBeCloseTo(12.5 / 225, 4);
    expect(crop.y).toBeCloseTo(0, 6);
    expect(crop.height).toBeCloseTo(1, 4);
    // The turned picture stands whole inside its frame, at its own size.
    const whole = graphicCrop(itemIndex(doc).get('u234')!.item)!;
    expect(whole).toMatchObject({ x: 0, y: 0, width: 1, height: 1, rotation: 0 });
    expect(whole.scaleX).toBeCloseTo(1, 9);
    expect(graphicCrop(itemIndex(doc).get('u190')!.item)).toBeUndefined();
  });
});

describe('master items', () => {
  const shown = (i: number) => masterItems(doc, pages[i]!).map((m) => m.item.self);

  it('shows on page ii the left master page, less the item overridden there', () => {
    // The script drew all four frames of master A on its left page; the
    // running head u16d was overridden on page ii.
    expect(shown(1)).toEqual(['u128', 'u13f', 'u156']);
    const items = masterItems(doc, pages[1]!);
    expect(items.every((m) => m.master.self === 'ud6' && m.masterPage.side === 'left' && m.depth === 0)).toBe(true);
    // Mapped on the page: the folio 30 pt from the foot, 40 pt in.
    const folio = items.find((m) => m.item.self === 'u128')!.box!;
    const { width, height } = pageSize(pages[1]!);
    expect(folio.left).toBeCloseTo(40, 6);
    expect(folio.right).toBeCloseTo(width - 40, 6);
    expect(folio.top).toBeCloseTo(height - 30, 6);
    expect(folio.bottom).toBeCloseTo(height - 15, 6);
  });

  it('shows nothing where the master page of that side is empty, or no master is applied', () => {
    expect(shown(0)).toEqual([]);
    expect(shown(3)).toEqual([]);
    expect(pages[3]!.appliedMaster).toBeUndefined();
  });

  it('matches master pages to the side of the page, through the based-on master', () => {
    const a = doc.masterSpreads[0]!;
    const b = doc.masterSpreads[1]!;
    expect(masterPageFor(a, pages[0]!)!.side).toBe('right');
    expect(masterPageFor(a, pages[1]!)!.side).toBe('left');
    expect(masterPageFor(b, pages[2]!)!.self).toBe('u17b');
    // Page 1 is a right page under master B, itself based on A: both
    // right master pages are empty in this document.
    expect(shown(2)).toEqual([]);
  });

  it('lays the masters of a chain one over the other, the deepest at the back', () => {
    // Page ii as it would be under master B: B's left page is based on
    // A's, so A's four frames come first and B's own band over them.
    const spread = doc.spreads[1]!;
    // B's pages have the frame of the document's, so the page would
    // apply it without a shift; B's own pages apply A with one.
    const page = { ...spread.pages[0]!, appliedMaster: 'u171', overrideList: [], masterPageTransform: IDENTITY };
    const under = { ...doc, spreads: [{ ...spread, pages: [page], items: [] }] };
    const items = masterItems(under, page);
    expect(items.map((m) => [m.item.self, m.master.self, m.depth])).toEqual([
      ['u128', 'ud6', 1], ['u13f', 'ud6', 1], ['u156', 'ud6', 1], ['u16d', 'ud6', 1], ['u17c', 'u171', 0],
    ]);
    const { width, height } = pageSize(page);
    const band = items[4]!.box!;
    expect([band.left, band.top, band.bottom].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0, 0, 60]);
    expect(band.right).toBeCloseTo(width, 6);
    // A's folio keeps its place through both master page transforms.
    expect(items[0]!.box!.top).toBeCloseTo(height - 30, 6);
    expect(items[0]!.box!.left).toBeCloseTo(40, 6);
    // A spread that hides master items shows none.
    const hiding = { ...doc, spreads: [{ ...spread, pages: [page], items: [], showMasterItems: false }] };
    expect(masterItems(hiding, page)).toEqual([]);
  });
});

describe('reading order', () => {
  const order = readingOrder(doc);
  const ids = order.map((e) => e.story.self);

  it('lists every story once, the anchored one under its host', () => {
    const all = new Set<string>();
    const visit = (list: typeof order): void => {
      for (const e of list) {
        expect(all.has(e.story.self)).toBe(false);
        all.add(e.story.self);
        visit(e.anchored.map((a) => a.entry));
      }
    };
    visit(order);
    expect(all.size).toBe(doc.stories.size);
    expect(ids).not.toContain('u241');
    const host = order.find((e) => e.story.self === 'u17e')!;
    expect(host.anchored.map((a) => [a.entry.story.self, a.item.self, a.paragraph, a.within])).toEqual([['u241', 'u253', 4, 'text']]);
    expect(host.anchored[0]!.entry.flags).toMatchObject({ anchored: true, unplaced: false });
    expect(findOrdered(order, 'u241')?.story.self).toBe('u241');
  });

  it('starts with the main story and follows its thread over three frames', () => {
    expect(ids[0]).toBe('u17e');
    expect(order[0]!.frames.map((f) => [f.item.self, f.pageIndex])).toEqual([['u190', 0], ['u1a8', 1], ['u1bf', 1]]);
    expect(order[0]!.frames[0]!.box!.left).toBeCloseTo(48, 6);
    expect(Object.values(order[0]!.flags).some(Boolean)).toBe(false);
  });

  it('reads a page top to bottom and side by side frames from the start side', () => {
    // Page ii: only the overriding running head starts there. Page 2:
    // two frames side by side at the top; then three frames one under
    // another at the left with the oval beside them, read as a column
    // before the oval; then down the page; the pasteboard last.
    expect(ids.slice(0, 13)).toEqual(['u17e', 'u36a', 'u25e', 'u277', 'u2a5', 'u2bd', 'u2d4', 'u335', 'u2eb', 'u305', 'u31c', 'u34d', 'u28e']);
  });

  it('flags what a reader of the pages does not see, and drops nothing', () => {
    const flags = (self: string) => Object.entries(order.find((e) => e.story.self === self)!.flags).filter(([, v]) => v).map(([k]) => k);
    expect(flags('u2a5')).toEqual(['hiddenLayer']);
    expect(flags('u2bd')).toEqual(['hidden']);
    expect(flags('u2d4')).toEqual(['nonprinting']);
    expect(flags('u28e')).toEqual(['pasteboard']);
    expect(flags('u335')).toEqual(['textPath']);
    for (const master of ['u116', 'u12d', 'u144', 'u15b']) expect(flags(master)).toEqual(['master']);
    // The pasteboard story follows the stories of its spread's page;
    // the masters' stories come last.
    expect(ids.indexOf('u28e')).toBeGreaterThan(ids.indexOf('u34d'));
    expect(ids.slice(-4).sort()).toEqual(['u116', 'u12d', 'u144', 'u15b']);
  });
});

describe('inspection', () => {
  const s = inspectIdml(doc);

  it('summarises the document', () => {
    expect(s).toMatchObject({ title: 'Reference', author: 'Postext', product: '21.6', pages: 4, spreads: 3, facingPages: true, binding: 'left', pageNames: ['i', 'ii', '1', '2'], stories: 18, warnings: 0 });
    expect(s.pageSizes).toEqual([{ width: 481.89, height: 680.315, pages: 4 }]);
    expect(s.masters).toEqual([
      { name: 'A-Página principal', pages: 2, items: 4, appliedTo: 2 },
      { name: 'B-Opener', basedOn: 'A-Página principal', pages: 2, items: 1, appliedTo: 1 },
    ]);
    expect(s.layers.map((l) => [l.name, l.visible])).toEqual([['Capa 1', true], ['Hidden notes', false], ['Art', true]]);
    expect(s.layers[1]!.items).toBe(1);
  });

  it('finds the main story and where it runs', () => {
    expect(s.mainStory).toMatchObject({ self: 'u17e', paragraphs: 9, frames: 3, pages: [0, 1] });
    expect(s.mainStory!.characters).toBeGreaterThan(2000);
    expect(s.characters).toBeGreaterThan(s.mainStory!.characters);
  });

  it('counts fonts by the characters set in them', () => {
    expect(s.fonts.slice(0, 2).map((f) => [f.family, f.style])).toEqual([['Georgia', 'Regular'], ['Minion Pro', 'Regular']]);
    // "Chapter One" in the bold of H1 and the word made bold by hand.
    expect(s.fonts.find((f) => f.family === 'Georgia' && f.style === 'Bold')!.characters).toBe('Chapter One'.length + 'numbers'.length);
    expect(s.fonts.find((f) => f.family === 'Georgia' && f.style === 'Italic')!.characters).toBe('with'.length);
    expect(s.languages).toEqual(['Spanish: Castilian']);
  });

  it('counts styles in use, swatches, pictures and marks', () => {
    const paragraphs = Object.fromEntries(s.paragraphStyles.map((p) => [p.path, p.paragraphs]));
    expect(paragraphs).toMatchObject({ 'Heads/H1': 1, Body: 8, Bullets: 2, Numbers: 3 });
    expect(s.characterStyles.find((c) => c.path === 'Emphasis')!.runs).toBe(1);
    expect(s.objectStyles.find((o) => o.path === 'Tinted box')!.items).toBe(1);
    expect(s.swatches).toEqual({ process: 9, spot: 1, tint: 1, gradient: 1, mixedInk: 0 });
    // Two on the page, one above a line, one in a table cell; all linked
    // and none carried in the package.
    expect(s.pictures).toEqual({ total: 4, linked: 4, embedded: 0, missing: 4, formats: { 'Portable Network Graphics (PNG)': 4 } });
    expect(s).toMatchObject({ tables: 1, footnotes: 1, endnotes: 0, hyperlinks: 4, crossReferences: 1, bookmarks: 1, indexMarks: 2, indexTopics: 2, anchoredObjects: 3 });
  });

  it('names what needs a second look', () => {
    const attention = Object.fromEntries(s.attention.map((a) => [a.code, a.count]));
    expect(attention).toEqual({
      nestedStyles: 1, grepStyles: 1, textOnPath: 1, effects: 1, conditions: 2, textVariables: 1, crossReferences: 1, rightToLeft: 1,
      missingLinks: 4, hiddenContent: 3, pasteboardContent: 1, gradients: 1, spotColours: 1,
    });
  });
});
