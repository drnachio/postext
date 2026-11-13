import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { build, config, mm, LOREM } from '../testing/kit.test-helper.js';
import { parseXml, children, descendants, str as attr, type XmlElement } from '../xml/read.js';
import { parseFieldCalc } from 'postext/writer';
import { idmlDocument, type IdmlOptions } from './index.js';
import { parseCssFont, defaultFontStyleName } from './fonts.js';
import type { PostextConfig } from 'postext';
import { pageDisplayList } from 'postext';
import { initMathEngine } from 'postext';

const cmyk = (hex: string, [c, m, y, k]: number[]) => ({ hex, model: 'cmyk' as const, cmyk: { c: c!, m: m!, y: y!, k: k! } });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const top = (x: number, y: number) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) } });
const BLUE = cmyk('#1d4f91', [95, 65, 0, 5]);
const plain = (id: string, size: number, extra: Record<string, unknown> = {}) => ({ id, border: { enabled: false }, backgroundEnabled: false, body: { fontSize: { value: size, unit: 'pt' }, ...extra } });

/** A one-page template: frames by name, each styled by the callout style of its name. */
function composedConfig(frames: Record<string, unknown>[], styles: Record<string, unknown>[], over: Record<string, unknown> = {}, decoration?: Record<string, unknown>): PostextConfig {
  return config({
    colorPalette: [{ id: 'blue', name: 'House blue', value: BLUE }],
    calloutStyles: styles,
    pageTemplates: [{ id: 'sheet', area: 'trim', header: false, footer: false, ...(decoration ? { decoration } : {}), frames }],
    ...over,
  } as unknown as Partial<PostextConfig>);
}

const sheet = (body: string) => `::::page{template="sheet"}\n${body}\n::::\n`;

type Files = Record<string, Uint8Array>;
const text = (f: Files, path: string) => strFromU8(f[path]!);
const xml = (f: Files, path: string) => parseXml(text(f, path));
const spreads = (f: Files) => Object.keys(f).filter((p) => p.startsWith('Spreads/')).sort();
const storyOf = (f: Files, frame: XmlElement) => text(f, `Stories/Story_${attr(frame, 'ParentStory')}.xml`);
const contents = (story: string) => [...story.matchAll(/<Content>([^<]*)<\/Content>/g)].map((m) => m[1]).join('');

/** Write an IDML package and check what InDesign needs to open it: the
 *  mimetype first and stored, every part the document map names present
 *  and well-formed, ids unique, every frame's story, paragraph style,
 *  swatch and face defined. */
function idml(md: string, cfg: PostextConfig, opts: Partial<IdmlOptions> = {}): Files {
  const { bytes } = idmlDocument({ docs: [build(md, cfg)], text: 'frames', ...opts });
  expect(strFromU8(bytes.subarray(30, 38))).toBe('mimetype');
  expect(bytes[8]).toBe(0);
  const f = unzipSync(bytes);
  expect(text(f, 'mimetype')).toBe('application/vnd.adobe.indesign-idml-package');
  const map = xml(f, 'designmap.xml');
  for (const src of [...text(f, 'designmap.xml').matchAll(/src="([^"]+)"/g)].map((m) => m[1]!)) expect(f[src], src).toBeDefined();
  const raw = Object.entries(f).filter(([p]) => p.endsWith('.xml')).map(([p, d]) => [p, strFromU8(d)] as const);
  for (const [path, source] of raw) expect(() => parseXml(source), path).not.toThrow();
  // Self ids: swatches and styles are named by kind, everything else unique.
  const selfs = raw.flatMap(([, source]) => [...source.matchAll(/ Self="([^"]+)"/g)].map((m) => m[1]!));
  expect(selfs.filter((s, i) => selfs.indexOf(s) !== i)).toEqual([]);

  const storyList = (attr(map, 'StoryList') ?? '').split(' ').filter(Boolean);
  const stories = Object.keys(f).filter((p) => p.startsWith('Stories/')).map((p) => p.slice('Stories/Story_'.length, -4));
  expect(new Set(storyList)).toEqual(new Set(stories));
  const styles = text(f, 'Resources/Styles.xml');
  const graphic = text(f, 'Resources/Graphic.xml');
  const faces = new Set(descendants(xml(f, 'Resources/Fonts.xml'), 'Font').map((x) => `${attr(x, 'FontFamily')}|${attr(x, 'FontStyleName')}`));
  for (const [path, source] of raw) {
    if (!path.startsWith('Spreads/') && !path.startsWith('Stories/')) continue;
    for (const m of source.matchAll(/ ParentStory="([^"]+)"/g)) expect(stories).toContain(m[1]);
    for (const m of source.matchAll(/ (?:FillColor|StrokeColor)="([^"]+)"/g)) if (m[1] !== 'Swatch/None') expect(graphic, m[1]).toContain(`Self="${m[1]}"`);
    for (const m of source.matchAll(/ AppliedParagraphStyle="([^"]+)"/g)) expect(styles).toContain(`Self="${m[1]}"`);
  }
  // Every face a style or range sets is in the font list.
  for (const m of styles.matchAll(/FontStyle="([^"]+)"[^>]*>(?:(?!<\/ParagraphStyle>).)*?<AppliedFont type="string">([^<]+)</gs)) expect(faces).toContain(`${m[2]}|${m[1]}`);
  return f;
}

/** The paragraphs left to InDesign's composer (`lineBreaks: 'reflow'`). */
const reflow = (md: string, cfg: PostextConfig, opts: Partial<IdmlOptions> = {}): Files => idml(md, cfg, { lineBreaks: 'reflow', ...opts });

const TITLE_BODY = composedConfig(
  [
    { name: 'title', style: 'title', placement: top(10, 15), width: mm(120), height: mm(15) },
    { name: 'body', style: 'text', placement: top(10, 70), width: mm(120), height: mm(100) },
  ],
  [plain('title', 20, { color: BLUE }), plain('text', 10, { textAlign: 'justify' })],
  {},
  {
    elements: [
      { kind: 'box', id: 'band', style: { backgroundColor: BLUE }, placement: { ...top(0, 0), size: { width: mm(140), height: mm(40) } } },
      { kind: 'rule', id: 'line', direction: 'horizontal', color: BLUE, thickness: mm(0.5), placement: { ...top(10, 60), size: { width: mm(120) } } },
    ],
  },
);

const MD = sheet(`:::frame{slot="title"}
A title
:::

:::frame{slot="body"}
${LOREM}

A second paragraph with *italic* words.
:::`);

describe('idmlDocument', () => {
  it('writes a package InDesign can read: mimetype first and stored, every part referenced, ids unique', () => {
    const f = idml(MD, TITLE_BODY);
    expect(text(f, 'designmap.xml')).toContain('DOMVersion="8.0"');
    expect(text(f, 'MasterSpreads/MasterSpread_umaster.xml')).toContain('Name="A-Master"');
  });

  it('declares one page per document in the preferences, as InDesign does, however many spreads follow', () => {
    // With the page count there InDesign adds that many pages less one, empty, before the spreads.
    const f = idml(`${MD}\n# A flow page\n\nSome text.\n`, TITLE_BODY);
    expect(spreads(f).length).toBeGreaterThan(1);
    expect(text(f, 'Resources/Preferences.xml')).toContain('PagesPerDocument="1"');
  });

  it('hyphenates only the paragraphs the composer hyphenated', () => {
    const doc = build(MD, TITLE_BODY);
    const f = reflow(MD, TITLE_BODY);
    const styles = text(f, 'Resources/Styles.xml');
    for (const m of styles.matchAll(/<ParagraphStyle Self="ParagraphStyle\/(title|text)"[^>]*>/g)) expect(m[0]).toContain('Hyphenation="false"');
    const items = pageDisplayList(doc, 0).items.filter((i) => i.kind === 'text' && i.frame?.endsWith('body'));
    const hyphenated = items.some((i) => i.kind === 'text' && i.source?.blockKey === (items[0] as { source?: { blockKey: string } }).source?.blockKey && i.lines.some((l) => l.addedHyphen));
    expect(hyphenated).toBe(true);
    const frames = descendants(xml(f, spreads(f)[0]!), 'TextFrame');
    const body = descendants(parseXml(storyOf(f, frames[1]!)), 'ParagraphStyleRange');
    const title = descendants(parseXml(storyOf(f, frames[0]!)), 'ParagraphStyleRange');
    expect(attr(title[0]!, 'Hyphenation')).toBeUndefined();
    expect(attr(body[0]!, 'Hyphenation')).toBe('true');
    expect(attr(body[1]!, 'Hyphenation')).toBeUndefined();
  });

  it('leaves out characters that set nothing and show as a missing glyph (word joiner)', () => {
    const f = idml('Wordjoined\u2060text and a zero-width\uFEFF no-break space.', config());
    const story = Object.keys(f).filter((p) => p.startsWith('Stories/')).map((p) => text(f, p)).join('');
    expect(contents(story)).toContain('Wordjoinedtext');
    expect(contents(story)).not.toMatch(/[\u2060\uFEFF]/);
    expect(contents(story)).toContain('zero-width no-break');
  });

  it('turns each composed frame into one text frame and one story, styled by its callout style', () => {
    const f = reflow(MD, TITLE_BODY);
    const spread = xml(f, spreads(f)[0]!);
    const frames = descendants(spread, 'TextFrame');
    expect(frames.map((fr) => attr(fr, 'Name'))).toEqual(['title', 'body']);
    expect(descendants(spread, 'GraphicLine')).toHaveLength(1);
    expect(descendants(spread, 'Rectangle').some((r) => attr(r, 'FillColor') === 'Color/House blue')).toBe(true);

    const body = storyOf(f, frames[1]!);
    const paras = descendants(parseXml(body), 'ParagraphStyleRange');
    expect(paras.map((p) => attr(p, 'AppliedParagraphStyle'))).toEqual(['ParagraphStyle/text', 'ParagraphStyle/text']);
    // The lines join back into the paragraph: no added hyphens, no lost spaces.
    const words = contents(body);
    expect(words).toContain(LOREM.slice(0, 120));
    expect(words).toContain('internationalization and representativeness');
    expect(body).toMatch(/FontStyle="Italic"[^>]*><Content>italic<\/Content>/);
    expect(body).not.toContain('Justification=');

    const graphic = text(f, 'Resources/Graphic.xml');
    expect(graphic).toContain('Self="Color/House blue" Model="Process" Space="CMYK" ColorValue="95 65 0 5"');
    const styles = text(f, 'Resources/Styles.xml');
    expect(styles).toContain('Self="ParagraphStyle/title"');
    expect(styles).toMatch(/Self="ParagraphStyle\/text"[^>]*Justification="LeftJustified"/);
  });

  it('sets a chip’s words in the text and its box as a rectangle behind the frame; an empty chip is room in thin spaces', () => {
    const cfg = composedConfig([{ name: 'body', style: 'text', placement: top(10, 20), width: mm(120), height: mm(60) }], [plain('text', 10)], {
      chipStyles: [{ id: 'key', paddingX: { value: 2, unit: 'pt' }, background: hex('#eeeeee'), borderColor: hex('#333333'), borderWidth: { value: 1, unit: 'pt' } }],
    });
    const f = idml(sheet(':::frame{slot="body"}\nPress :chip[Enter]{style=key} to go on, or fill in :chip[ ]{style=key} here.\n:::'), cfg);
    const spread = text(f, spreads(f)[0]!);
    const story = storyOf(f, descendants(parseXml(spread), 'TextFrame')[0]!);
    const words = contents(story);
    expect(words).toMatch(/Press  +Enter + to go on/);
    expect(words).toMatch(/fill in  {3,} here/);
    expect(words).not.toContain('');
    // Two boxes, both painted before (under) the text frame.
    const boxes = [...spread.matchAll(/<Rectangle[^>]*FillColor="Color\/R=238 G=238 B=238"[^>]*StrokeColor="Color\/R=51 G=51 B=51"/g)];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.index! < spread.indexOf('<TextFrame'))).toBe(true);
  });

  it('sets the text of a frame its fit shrank at the shrunk size and leading', () => {
    const long = Array.from({ length: 4 }, () => LOREM).join('\n\n');
    const frames = (height: number) => [{ name: 'body', style: 'text', placement: top(10, 20), width: mm(120), height: mm(height), minHeight: mm(height), maxHeight: mm(height) }];
    const styles = [plain('text', 10, { lineHeight: { value: 14, unit: 'pt' } })];
    const md = sheet(`:::frame{slot="body"}\n${long}\n:::`);
    const doc = build(md, composedConfig(frames(40), styles));
    const scale = doc.pages.find((p) => p.composed)!.composed!.frames[0]!.scale;
    expect(scale).toBeLessThan(1);
    const f = idml(md, composedConfig(frames(40), styles));
    const style = /<ParagraphStyle Self="ParagraphStyle\/text"[^>]*PointSize="([\d.]+)"[^>]*>.*?<Leading type="unit">([\d.]+)</s.exec(text(f, 'Resources/Styles.xml'))!;
    expect(Number(style[1])).toBeCloseTo(10 * scale, 2);
    expect(Number(style[2])).toBeCloseTo(14 * scale, 2);
  });

  it('puts a list item’s marker in its paragraph: marker, tab, text, hanging indent', () => {
    const cfg = composedConfig([{ name: 'body', style: 'text', placement: top(10, 20), width: mm(120), height: mm(60) }], [plain('text', 10)]);
    const f = idml(sheet(':::frame{slot="body"}\n- First point\n- Second point\n:::'), cfg);
    const story = storyOf(f, descendants(xml(f, spreads(f)[0]!), 'TextFrame')[0]!);
    const paras = descendants(parseXml(story), 'ParagraphStyleRange');
    expect(paras).toHaveLength(2);
    expect(contents(story)).toMatch(/^\S+\tFirst point\S*\tSecond point$/);
    // Items alike share their style's format and set nothing of their own
    // (#1555): the hanging indent and the stop are the style's.
    const styles = descendants(xml(f, 'Resources/Styles.xml'), 'ParagraphStyle');
    for (const p of paras) {
      const style = styles.find((s) => attr(s, 'Self') === attr(p, 'AppliedParagraphStyle'))!;
      const own = (name: string) => attr(p, name) ?? attr(style, name);
      expect(attr(p, 'LeftIndent')).toBeUndefined();
      expect(Number(own('LeftIndent'))).toBeGreaterThan(0);
      expect(Number(own('FirstLineIndent'))).toBeLessThan(0);
      // An explicit tab stop at the text's indent, not InDesign's default stops.
      const stop = descendants(style, 'Position')[0]!;
      expect(Number(stop.children.join(''))).toBeCloseTo(Number(own('LeftIndent')), 3);
    }
  });

  it('keeps a list marker with its item outside composed frames: one text frame, marker and tab first', () => {
    const f = idml('Intro.\n\n- First point\n- Second point', config());
    const frames = descendants(xml(f, spreads(f)[0]!), 'TextFrame');
    expect(frames).toHaveLength(3);
    const items = frames.slice(1).map((fr) => contents(storyOf(f, fr)));
    expect(items).toEqual(['•\tFirst point', '•\tSecond point']);
  });

  it('writes frames chained by next as one story through linked text frames, a split paragraph whole', () => {
    const cfg = composedConfig(
      [
        { name: 'a', style: 'text', placement: top(10, 20), width: mm(55), height: mm(40), minHeight: mm(40), maxHeight: mm(40), next: 'b', fit: { shrinkText: false } },
        { name: 'b', style: 'text', placement: top(75, 20), width: mm(55), height: mm(120), fit: { shrinkText: false } },
      ],
      [plain('text', 10, { lineHeight: { value: 14, unit: 'pt' } })],
    );
    const md = sheet(`:::frame{slot="a"}\n${LOREM}\n\n${LOREM}\n:::`);
    const doc = build(md, cfg);
    const vframes = doc.pages.find((p) => p.composed)!.composed!.frames;
    expect(vframes.find((x) => x.name === 'a')!.continuesTo).toBeDefined();
    const f = reflow(md, cfg);
    const frames = descendants(xml(f, spreads(f)[0]!), 'TextFrame');
    expect(frames.map((x) => attr(x, 'Name'))).toEqual(['a', 'b']);
    const [a, b] = frames as [XmlElement, XmlElement];
    expect(attr(a, 'ParentStory')).toBe(attr(b, 'ParentStory'));
    expect(attr(a, 'NextTextFrame')).toBe(attr(b, 'Self'));
    expect(attr(b, 'PreviousTextFrame')).toBe(attr(a, 'Self'));
    expect(attr(a, 'PreviousTextFrame')).toBe('n');
    expect(attr(b, 'NextTextFrame')).toBe('n');
    expect(Object.keys(f).filter((p) => p.startsWith('Stories/'))).toHaveLength(1);
    const story = storyOf(f, a);
    // Two paragraphs, the first cut by the frame break: three ranges, one paragraph return.
    expect(descendants(parseXml(story), 'ParagraphStyleRange')).toHaveLength(3);
    expect(story.match(/<Br\/>/g)).toHaveLength(1);
    expect(contents(story)).toBe(`${LOREM}${LOREM}`);
  });

  // 4.5 mm and 1 mm in pt.
  const MM45 = (4.5 * 72) / 25.4;
  const MM1 = 72 / 25.4;
  const tabsOf = (el: XmlElement) =>
    descendants(el, 'ListItem').map((li) => ({
      align: descendants(li, 'Alignment')[0]!.children.join(''),
      leader: descendants(li, 'Leader')[0]!.children.join(''),
      at: Number(descendants(li, 'Position')[0]!.children.join('')),
    }));
  const storyNo = (path: string) => parseInt(/Story_u([0-9a-f]+)\.xml$/.exec(path)![1]!, 16);
  const paraStyle = (f: Files, name: string) => descendants(xml(f, 'Resources/Styles.xml'), 'ParagraphStyle').find((s) => attr(s, 'Name') === name)!;

  it('gives a frame style its tab stops and space after; its padding is the frame inset, not an indent', () => {
    const notes = { ...plain('notes', 8, { tabStops: [{ position: mm(4.5) }], paragraphSpacing: mm(1) }), padding: { top: mm(0), right: mm(0), bottom: mm(0), left: mm(4.5) } };
    const cfg = composedConfig([{ name: 'notes', style: 'notes', placement: top(10, 20), width: mm(120), height: mm(60) }], [notes]);
    const f = reflow(sheet(':::frame{slot="notes"}\n\\*\tNote\n\n\\*\\*\\*\\*\tNote\n:::'), cfg);
    const style = paraStyle(f, 'notes');
    expect(tabsOf(style)).toEqual([{ align: 'LeftAlign', leader: '', at: expect.closeTo(MM45, 3) }]);
    expect(Number(attr(style, 'SpaceAfter'))).toBeCloseTo(MM1, 3);
    // The engine sets the lines at the padding: that is the frame's inset.
    expect(attr(style, 'LeftIndent')).toBeUndefined();
    expect(attr(style, 'FirstLineIndent')).toBeUndefined();
    const frame = descendants(xml(f, spreads(f)[0]!), 'TextFrame')[0]!;
    expect(Number(attr(descendants(frame, 'TextFramePreference')[0]!, 'InsetSpacing')!.split(' ')[1])).toBeCloseTo(MM45, 3);
    // Both notes follow the style: no indents, stops or spacing of their own.
    const story = storyOf(f, frame);
    const paras = descendants(parseXml(story), 'ParagraphStyleRange');
    expect(paras).toHaveLength(2);
    for (const p of paras) for (const a of ['LeftIndent', 'FirstLineIndent', 'RightIndent', 'SpaceBefore', 'SpaceAfter']) expect(attr(p, a), a).toBeUndefined();
    expect(story).not.toContain('<TabList');
    expect(contents(story)).toBe('*\tNote****\tNote');
  });

  it('keeps a forced line break as InDesign’s (U+2028)', () => {
    const cfg = composedConfig([{ name: 'notes', style: 'notes', placement: top(10, 20), width: mm(120), height: mm(60) }], [plain('notes', 8, { tabStops: [{ position: mm(4.5) }] })]);
    const f = reflow(sheet(':::frame{slot="notes"}\n\\*\tNote\\\n\\*\\*\\*\\*\tNote\n:::'), cfg);
    const story = storyOf(f, descendants(xml(f, spreads(f)[0]!), 'TextFrame')[0]!);
    expect(descendants(parseXml(story), 'ParagraphStyleRange')).toHaveLength(1);
    expect(contents(story)).toBe('*\tNote\u2028****\tNote');
  });

  it('writes a paragraph style’s hanging indent, first-line indent and stops (a leader the stop’s, not text)', () => {
    const cfg = config({
      paragraphStyles: [
        { id: 'hang', name: 'Hang', hangingIndent: mm(4.5), tabStops: [{ position: mm(4.5) }, { position: 'end', align: 'end', leader: '.' }] },
        { id: 'indented', name: 'Indented', indent: mm(3), firstLineIndent: mm(5) },
      ],
    } as unknown as Partial<PostextConfig>);
    const md = `:::paragraphs{style="hang"}\n\\*\t${LOREM.slice(0, 160)}\tend\n\n\\*\\*\\*\\*\tShort.\n:::\n\n:::paragraphs{style="indented"}\n${LOREM}\n:::\n\nA plain paragraph.`;
    const f = reflow(md, cfg);
    // Paragraphs set in a paragraph style are written in one named after
    // it (its id, as a frame's style is), with the format most of them
    // share (#1555).
    const style = paraStyle(f, 'hang');
    expect(Number(attr(style, 'LeftIndent'))).toBeCloseTo(MM45, 3);
    expect(Number(attr(style, 'FirstLineIndent'))).toBeCloseTo(-MM45, 3);
    const measure = (120 * 72) / 25.4;
    expect(tabsOf(style)).toEqual([
      { align: 'LeftAlign', leader: '', at: expect.closeTo(MM45, 3) },
      { align: 'RightAlign', leader: '.', at: expect.closeTo(measure, 2) },
    ]);
    const stories = Object.keys(f).filter((p) => p.startsWith('Stories/')).sort((a, b) => storyNo(a) - storyNo(b)).map((p) => text(f, p));
    const [long, short, indented, plainText] = stories.map((s) => ({ story: s, para: descendants(parseXml(s), 'ParagraphStyleRange')[0]! }));
    // The leader's dots are the stop's: the text holds only the tab.
    expect(contents(long!.story)).toMatch(/^\*\tTypesetting .*\tend$/);
    // A note of one line hangs as its style says, with nothing of its own.
    expect(contents(short!.story)).toBe('****\tShort.');
    expect(attr(short!.para, 'LeftIndent')).toBeUndefined();
    expect(short!.story).not.toContain('<TabList');
    // An indented paragraph: its style holds the indent plus first-line
    // indent, and no stops; the paragraph sets nothing of its own.
    const ind = paraStyle(f, 'indented');
    expect(attr(indented!.para, 'AppliedParagraphStyle')).toBe(attr(ind, 'Self'));
    expect(Number(attr(ind, 'LeftIndent'))).toBeCloseTo((3 * 72) / 25.4, 3);
    expect(Number(attr(ind, 'FirstLineIndent'))).toBeCloseTo((5 * 72) / 25.4, 3);
    expect(attr(indented!.para, 'LeftIndent')).toBeUndefined();
    expect(tabsOf(ind)).toEqual([]);
    // A paragraph without indents, in the body's style, takes none.
    const body = paraStyle(f, 'Body');
    expect(attr(plainText!.para, 'AppliedParagraphStyle')).toBe(attr(body, 'Self'));
    expect(Number(attr(plainText!.para, 'LeftIndent') ?? attr(body, 'LeftIndent') ?? 0)).toBe(0);
    expect(Number(attr(plainText!.para, 'FirstLineIndent') ?? attr(body, 'FirstLineIndent') ?? 0)).toBe(0);
  });

  it('sets a frame its fit shrank as painted: indents, stops, spacing and first baseline at the scale, the padding as it stands', () => {
    const over = { paragraphStyles: [{ id: 'hang', name: 'Hang', hangingIndent: mm(4.5), tabStops: [{ position: mm(4.5) }] }] };
    const styles = [{ ...plain('text', 10, { lineHeight: { value: 14, unit: 'pt' }, paragraphSpacing: mm(2) }), padding: { top: mm(2), right: mm(2), bottom: mm(2), left: mm(3) } }];
    const md = sheet(`:::frame{slot="body"}\n:::paragraphs{style="hang"}\n\\*\t${LOREM}\n\n\\*\t${LOREM}\n:::\n\n${LOREM}\n:::`);
    const at = (height: number) => {
      const cfg = composedConfig([{ name: 'body', style: 'text', placement: top(10, 20), width: mm(120), height: mm(height), minHeight: mm(height), maxHeight: mm(height) }], styles, over);
      const scale = build(md, cfg).pages.find((p) => p.composed)!.composed!.frames[0]!.scale ?? 1;
      const f = idml(md, cfg);
      const style = paraStyle(f, 'text');
      const frame = descendants(xml(f, spreads(f)[0]!), 'TextFrame')[0]!;
      const pref = descendants(frame, 'TextFramePreference')[0]!;
      const paras = descendants(parseXml(storyOf(f, frame)), 'ParagraphStyleRange');
      const n = (el: XmlElement, a: string) => Number(attr(el, a) ?? 0);
      return {
        scale,
        left: n(style, 'LeftIndent'),
        first: n(style, 'FirstLineIndent'),
        tab: tabsOf(style)[0]!.at,
        leading: Number(descendants(style, 'Leading')[0]!.children.join('')),
        inset: attr(pref, 'InsetSpacing'),
        baseline: n(pref, 'MinimumFirstBaselineOffset'),
        space: paras.map((p) => [n(p, 'SpaceBefore'), n(p, 'SpaceAfter')]),
      };
    };
    const full = at(200);
    const shrunk = at(40);
    expect(full.scale).toBe(1);
    const s = shrunk.scale;
    expect(s).toBeLessThan(1);
    // At full size the note hangs 4.5 mm, its stop where the turnover lines start.
    expect(full.left).toBeCloseTo(MM45, 3);
    expect(full.first).toBeCloseTo(-MM45, 3);
    expect(full.tab).toBeCloseTo(MM45, 3);
    // Shrunk, all of it scales alike: the stop still where the turnover lines start.
    expect(shrunk.left).toBeCloseTo(MM45 * s, 3);
    expect(shrunk.first).toBeCloseTo(-MM45 * s, 3);
    expect(shrunk.tab).toBeCloseTo(shrunk.left, 3);
    expect(shrunk.leading).toBeCloseTo(14 * s, 3);
    expect(shrunk.baseline).toBeCloseTo(full.baseline * s, 2);
    expect(shrunk.space).toHaveLength(full.space.length);
    shrunk.space.forEach(([before, after], i) => {
      expect(before).toBeCloseTo(full.space[i]![0]! * s, 2);
      expect(after).toBeCloseTo(full.space[i]![1]! * s, 2);
    });
    // The frame's padding is its box's, not scaled: the same insets.
    expect(shrunk.inset).toBe(full.inset);
    expect(Number(full.inset!.split(' ')[1])).toBeCloseTo((3 * 72) / 25.4, 3);
  });

  it('sets no indents, stops or spacing for paragraphs without them', () => {
    const f = idml(MD, TITLE_BODY);
    const styles = text(f, 'Resources/Styles.xml');
    const own = [...styles.matchAll(/<ParagraphStyle Self="ParagraphStyle\/(?:title|text)"[^>]*>.*?<\/ParagraphStyle>/gs)].map((m) => m[0]);
    expect(own).toHaveLength(2);
    for (const s of own) expect(s).not.toMatch(/LeftIndent|FirstLineIndent|RightIndent|TabList/);
    for (const p of Object.keys(f).filter((k) => k.startsWith('Stories/'))) expect(text(f, p)).not.toMatch(/LeftIndent|FirstLineIndent|RightIndent|TabList/);
  });

  it('names text outside frames by role, with names the caller may set', () => {
    const cfg = config();
    const md = '# A heading\n\nSome body text.';
    expect(text(idml(md, cfg), 'Resources/Styles.xml')).toMatch(/Name="Heading 1".*Name="Body"/s);
    expect(text(idml(md, cfg, { styleNames: { heading: 'Titel', body: 'Grundtext' } }), 'Resources/Styles.xml')).toMatch(/Name="Titel 1".*Name="Grundtext"/s);
  });

  it('reads CSS font shorthands', () => {
    expect(parseCssFont('italic 700 16px "EB Garamond", serif')).toEqual({ family: 'EB Garamond', weight: 700, italic: true, sizePx: 16 });
    expect(defaultFontStyleName('X', 700, true)).toBe('Bold Italic');
    expect(defaultFontStyleName('X', 400, false)).toBe('Regular');
    expect(parseCssFont('16px Times')).toEqual({ family: 'Times', weight: 400, italic: false, sizePx: 16 });
    expect(parseCssFont('oblique bold 12.5px \'Source Serif 4\', serif')).toEqual({ family: 'Source Serif 4', weight: 700, italic: true, sizePx: 12.5 });
  });

  it('gives each swatch its own id and name, none taking one of InDesign’s own', () => {
    const red = cmyk('#c00000', [0, 100, 100, 0]);
    const green = hex('#00a000');
    const orange = hex('#ffaa00');
    const grey = hex('#123456');
    const colours = [BLUE, red, green, orange, grey];
    const cfg = composedConfig(
      [{ name: 'body', style: 'text', placement: top(10, 120), width: mm(120), height: mm(40) }],
      [plain('text', 10)],
      {
        colorPalette: [
          { id: 'a', name: 'House blue', value: BLUE },
          { id: 'b', name: 'Black', value: red },
          { id: 'c', name: 'Paper', value: green },
          { id: 'd', name: 'House blue', value: orange },
          { id: 'e', name: 'None', value: grey },
        ],
      },
      { elements: colours.map((c, i) => ({ kind: 'box', id: `b${i}`, style: { backgroundColor: c }, placement: { ...top(10, 10 + i * 20), size: { width: mm(20), height: mm(10) } } })) },
    );
    const graphic = xml(idml(sheet(':::frame{slot="body"}\nText.\n:::'), cfg), 'Resources/Graphic.xml');
    const swatches = descendants(graphic, 'Color').concat(descendants(graphic, 'Swatch'));
    const names = swatches.map((s) => attr(s, 'Name')!);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['Black', 'Paper', 'Registration', 'None', 'House blue', 'House blue 2', 'Black 2', 'Paper 2', 'None 2']));
    const byName = (n: string) => swatches.find((s) => attr(s, 'Name') === n)!;
    expect(attr(byName('Black 2'), 'ColorValue')).toBe('0 100 100 0');
    expect(attr(byName('Black 2'), 'Self')).toBe('Color/Black 2');
    expect(attr(byName('Paper 2'), 'ColorValue')).toBe('0 160 0');
  });

  it('ends a story with its last paragraph that holds text, with no empty paragraph after it', async () => {
    // The last paragraph is maths alone, which the package leaves out.
    await initMathEngine();
    const md = sheet(':::frame{slot="body"}\nFirst paragraph.\n\nSecond paragraph.\n\n$a^2 + b^2$\n:::');
    const warnings: string[] = [];
    const f = idml(md, TITLE_BODY, { inlineObjects: false, onWarning: (w) => warnings.push(w.code) });
    expect(warnings).toContain('text.inline');
    const body = storyOf(f, descendants(xml(f, spreads(f)[0]!), 'TextFrame').find((fr) => attr(fr, 'Name') === 'body')!);
    expect(descendants(parseXml(body), 'ParagraphStyleRange')).toHaveLength(2);
    expect(body.match(/<Br\/>/g)).toHaveLength(1);
    expect(body).not.toMatch(/<Br\/><\/CharacterStyleRange><\/ParagraphStyleRange><\/Story>/);
  });

  it('sets inline maths as an inline anchored object holding its picture, in the line', async () => {
    await initMathEngine();
    const md = sheet(':::frame{slot="body"}\nThe sum $a^2 + b^2$ of two squares.\n:::');
    const warnings: string[] = [];
    const f = idml(md, TITLE_BODY, { onWarning: (w) => warnings.push(w.code) });
    expect(warnings).not.toContain('text.inline');
    const body = parseXml(storyOf(f, descendants(xml(f, spreads(f)[0]!), 'TextFrame').find((fr) => attr(fr, 'Name') === 'body')!));
    const boxes = descendants(body, 'Rectangle');
    expect(boxes).toHaveLength(1);
    expect(attr(children(boxes[0]!, 'AnchoredObjectSetting')[0]!, 'AnchoredPosition')).toBe('InlinePosition');
    const picture = children(boxes[0]!, 'Image')[0]!;
    const svg = atob(descendants(picture, 'Contents')[0]!.children.filter((c) => typeof c === 'string').join(''));
    expect(svg).toContain('<svg');
    // The words on either side are still text, in order about the object.
    expect(contents(storyOf(f, descendants(xml(f, spreads(f)[0]!), 'TextFrame').find((fr) => attr(fr, 'Name') === 'body')!))).toMatch(/The sum.*of two squares\./s);
  });

  it('writes right-to-left text as right-to-left stories; left to the composer it warns', () => {
    const ar = 'قال إن كلمة يهتم مسعد كتاب جميلة وكانت المدينة عامرة بالناس والكتب والعلماء.';
    const warnings: { code: string; message: string }[] = [];
    const rtl = config({ locale: 'ar', direction: 'rtl' } as Partial<PostextConfig>);
    reflow(`${ar}\n\n${ar}`, rtl, { onWarning: (w) => warnings.push(w) });
    expect(warnings.filter((w) => w.code === 'text.rtl')).toHaveLength(1);
    // With lines kept the stories are right-to-left ones: nothing to warn about.
    const kept: string[] = [];
    const f = idml(`${ar}\n\n${ar}`, rtl, { onWarning: (w) => kept.push(w.code) });
    expect(kept).not.toContain('text.rtl');
    const story = Object.keys(f).filter((p) => p.startsWith('Stories/')).map((p) => text(f, p)).find((x) => x.includes('RightToLeftDirection'))!;
    expect(story).toContain('StoryDirection="RightToLeftDirection"');
    expect(story).toContain('ParagraphDirection="RightToLeftDirection"');
    expect(story).toMatch(/Justification="Right(Align|Justified)"|Justification="FullyJustified"/);
    expect(warnings.find((w) => w.code === 'text.rtl')!.message).toMatch(/left to right/);
    const latin: string[] = [];
    idml('Some text.', config(), { onWarning: (w) => latin.push(w.code) });
    expect(latin).not.toContain('text.rtl');
    expect(latin).not.toContain('text.vertical');
  });
  // Vertical text: `vertical.test.ts`.
});

describe('idmlDocument: form fields (#1445)', () => {
  const cfg = composedConfig([{ name: 'body', style: 'text', placement: top(10, 20), width: mm(120), height: mm(120) }], [plain('text', 10)], {
    chipStyles: [
      { id: 'field', minWidth: { value: 40, unit: 'pt' }, paddingX: { value: 2, unit: 'pt' }, background: hex('#f4f4f4'), borderColor: hex('#333333'), borderWidth: { value: 0.5, unit: 'pt' } },
      { id: 'box', minWidth: { value: 10, unit: 'pt' }, borderColor: hex('#333333'), borderWidth: { value: 0.5, unit: 'pt' } },
    ],
  });
  const ORDER = sheet(`:::frame{slot="body"}
Quantity :chip[ ]{style=field field="order.qty" kind="number"} at :chip[120]{style=field field="order.price" format="currency"} makes :chip[ ]{style=field field="order.total" format="currency" calc="product(order.qty, order.price)"}.

Gift wrap :chip[x]{style=box field="order.gift" kind="checkbox"} in :chip[Blue]{style=field field="order.colour" kind="choice" options="Red|Blue|Light green"}, size :chip[M]{style=field field="order.size" kind="choice" options="S|M|L"}.

Notes :chip[ ]{style=field field="order.notes" multiline tooltip="Anything else"}
:::`);

  it('writes a text, number, choice and check box field on each field chip’s box, over the text', () => {
    const warnings: string[] = [];
    const f = idml(ORDER, cfg, { onWarning: (w) => warnings.push(w.code) });
    const source = text(f, spreads(f)[0]!);
    const spread = parseXml(source);
    const boxes = descendants(spread, 'TextBox');
    expect(boxes.map((b) => attr(b, 'Name'))).toEqual(['order.qty', 'order.price', 'order.total', 'order.notes']);
    expect(source.indexOf('<TextBox')).toBeGreaterThan(source.indexOf('<TextFrame'));
    for (const b of boxes) {
      expect(Number(attr(b, 'FontSize'))).toBeCloseTo(10, 1);
      // Bounds about the field's own origin, its box a rectangle inside it.
      const bounds = descendants(b, 'PathBoundingBox')[0]!;
      expect(Number(attr(bounds, 'Left'))).toBeCloseTo(-Number(attr(bounds, 'Right')), 3);
      const look = descendants(b, 'Rectangle');
      expect(look).toHaveLength(1);
      expect(attr(look[0]!, 'FillColor')).toBe('Color/R=244 G=244 B=244');
      expect(attr(look[0]!, 'StrokeColor')).toBe('Color/R=51 G=51 B=51');
    }
    const byName = (n: string) => boxes.find((b) => attr(b, 'Name') === n)!;
    expect(attr(byName('order.notes'), 'Multiline')).toBe('true');
    expect(attr(byName('order.notes'), 'Description')).toBe('Anything else');
    expect(attr(byName('order.total'), 'ReadOnly')).toBe('true');
    const label = (b: XmlElement) => Object.fromEntries(descendants(b, 'KeyValuePair').map((p) => [attr(p, 'Key'), attr(p, 'Value')]));
    expect(label(byName('order.price'))).toEqual({ 'postext:value': '120', 'postext:format': 'currency' });
    expect(label(byName('order.total'))).toEqual({ 'postext:format': 'currency', 'postext:calc': 'product(order.qty, order.price)' });

    const [gift] = descendants(spread, 'CheckBox');
    expect(attr(gift!, 'Name')).toBe('order.gift');
    expect(attr(gift!, 'CheckedByDefault')).toBe('true');
    const states = descendants(gift!, 'State');
    expect(states.map((st) => descendants(st, 'Statetype')[0]!.children.join(''))).toEqual(['UpOff', 'UpOn']);
    expect(descendants(states[1]!, 'Polygon')).toHaveLength(1);

    const combos = descendants(spread, 'ComboBox');
    expect(combos.map((c) => attr(c, 'Name'))).toEqual(['order.colour', 'order.size']);
    expect(descendants(combos[0]!, 'ListItem').map((li) => li.children.join(''))).toEqual(['Red', 'Blue', 'Light green']);
    expect(attr(combos[1]!, 'ChoiceList')).toBe('S M L');

    // The field chips' words are not in the text, their boxes no loose rectangles.
    const words = contents(storyOf(f, descendants(spread, 'TextFrame')[0]!));
    expect(words).toMatch(/^Quantity  + at  + makes  +\.Gift wrap  + in  +, size  +\.Notes  +$/);
    expect(children(descendants(spread, 'Spread')[0], 'Rectangle')).toHaveLength(0);
    expect(warnings).toEqual(expect.arrayContaining(['field.value', 'field.script']));
  });

  it('labels a calculation in full, numbers and nested calculations, as the calc attribute reads it', () => {
    const calc = 'sum(order.total, product(order.gift, 4.5), max(order.fee, 2))';
    const f = idml(sheet(`:::frame{slot="body"}\nTotal :chip[ ]{style=field field="order.sum" format="currency" calc="${calc}"}\n:::`), cfg);
    const box = descendants(xml(f, spreads(f)[0]!), 'TextBox')[0]!;
    const label = descendants(box, 'KeyValuePair').find((p) => attr(p, 'Key') === 'postext:calc')!;
    expect(attr(label, 'Value')).toBe(calc);
    expect(parseFieldCalc(attr(label, 'Value')!)).toEqual(parseFieldCalc(calc));
  });

  it('writes field chips as chips with forms: false', () => {
    const f = idml(ORDER, cfg, { forms: false });
    const source = text(f, spreads(f)[0]!);
    expect(source).not.toMatch(/<(TextBox|CheckBox|ComboBox)/);
    const words = contents(storyOf(f, descendants(parseXml(source), 'TextFrame')[0]!));
    expect(words).toContain('120');
    expect(words).toContain('Blue');
  });
});
