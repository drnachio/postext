import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { build, config, mm, LOREM } from '../word/formatted/formatted.test-helper.js';
import { parseXml, descendants, attr, type XmlElement } from '../word/xml.js';
import { idmlDocument, parseCssFont, defaultFontStyleName, type IdmlOptions } from './index.js';
import type { PostextConfig } from '../index.js';

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
  const { bytes } = idmlDocument({ docs: [build(md, cfg)], ...opts });
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

  it('turns each composed frame into one text frame and one story, styled by its callout style', () => {
    const f = idml(MD, TITLE_BODY);
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
    for (const p of paras) {
      expect(Number(attr(p, 'LeftIndent'))).toBeGreaterThan(0);
      expect(Number(attr(p, 'FirstLineIndent'))).toBeLessThan(0);
    }
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
    const f = idml(md, cfg);
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
  });
});
