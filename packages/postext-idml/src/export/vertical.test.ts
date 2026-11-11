// Vertical text (`layout.writingMode: 'vertical-rl'`, a frame's own
// `writingMode`) as InDesign vertical stories: the story's orientation,
// a column of characters a line, the cells the Japanese composer cannot
// tell from the characters, and frames that put the first line where
// Postext set it.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { pageDisplayList } from 'postext';
import type { DisplayItem, PostextConfig, VDTDocument } from 'postext';
import { build, config, mm } from '../testing/kit.test-helper.js';
import { readIdml } from '../read/index.js';
import { children, descendants, parseXml, str as attr, type XmlElement } from '../xml/read.js';
import { idmlDocument, type IdmlOptions } from './index.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
type Files = Record<string, Uint8Array>;

const vertical = (over: Record<string, unknown> = {}): PostextConfig => ({ ...config(), locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' }, ...over }) as unknown as PostextConfig;
const top = (x: number, y: number) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) } });
const plain = (id: string, size: number) => ({ id, border: { enabled: false }, backgroundEnabled: false, body: { fontSize: { value: size, unit: 'pt' } } });
const sheet = (body: string) => `::::page{template="sheet"}\n${body}\n::::\n`;

const JA = '縦書きの物語です。朝、灯台守は海を見た。大切なことは光を守ることだ。';
const LONG = JA.repeat(6);
const BREAK = ' ';

function write(doc: VDTDocument, opts: Partial<IdmlOptions> = {}): { f: Files; bytes: Uint8Array; warnings: { code: string; message: string }[] } {
  const warnings: { code: string; message: string }[] = [];
  const { bytes } = idmlDocument({ docs: [doc], onWarning: (w) => warnings.push(w), ...opts });
  const f = unzipSync(bytes);
  for (const [path, data] of Object.entries(f)) if (path.endsWith('.xml')) expect(() => parseXml(strFromU8(data)), path).not.toThrow();
  return { f, bytes, warnings };
}

const text = (f: Files, path: string) => strFromU8(f[path]!);
const storyPaths = (f: Files) => Object.keys(f).filter((p) => p.startsWith('Stories/')).sort();
const frames = (f: Files) => Object.keys(f).filter((p) => p.startsWith('Spreads/')).sort().flatMap((p) => descendants(parseXml(text(f, p)), 'TextFrame'));
const storyOf = (f: Files, frame: XmlElement) => text(f, `Stories/Story_${attr(frame, 'ParentStory')}.xml`);
const contents = (story: string) => [...story.matchAll(/<Content>([^<]*)<\/Content>/g)].map((m) => m[1]).join('');
const ranges = (story: string) => descendants(parseXml(story), 'CharacterStyleRange');
const rangeText = (r: XmlElement) => children(r, 'Content').map((c) => c.children.filter((x) => typeof x === 'string').join('')).join('');
const rangeOf = (story: string, words: string) => ranges(story).find((r) => rangeText(r) === words);
const textItems = (doc: VDTDocument, page = 0) => pageDisplayList(doc, page).items.filter((i): i is TextItem => i.kind === 'text' && i.lines.length > 0);

/** A text frame's box on its spread (pt; dpi 72, so sheet px) and what
 *  its preference says. */
function box(frame: XmlElement): { left: number; right: number; top: number; bottom: number; insets: number[]; baseline: number } {
  const t = attr(frame, 'ItemTransform')!.split(' ').map(Number);
  const pts = descendants(frame, 'PathPointType').map((p) => attr(p, 'Anchor')!.split(' ').map(Number));
  const xs = pts.map((p) => t[0]! * p[0]! + t[2]! * p[1]! + t[4]!);
  const ys = pts.map((p) => t[1]! * p[0]! + t[3]! * p[1]! + t[5]!);
  const pref = children(frame, 'TextFramePreference')[0]!;
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), insets: attr(pref, 'InsetSpacing')!.split(' ').map(Number), baseline: Number(attr(pref, 'MinimumFirstBaselineOffset')) };
}

/** Where a vertical item's first line stands on the sheet: the x of its
 *  baseline and the y it starts at (the item is told unturned, a quarter
 *  turn clockwise about the centre of its box). */
function firstLine(item: TextItem): { baselineX: number; startY: number } {
  const cx = item.bbox.x + item.bbox.width / 2;
  const cy = item.bbox.y + item.bbox.height / 2;
  const line = item.lines[0]!;
  return { baselineX: cx - (line.baseline - cy), startY: cy + (line.x - cx) };
}

describe('idmlDocument: vertical text', () => {
  const md = `# 見出し\n\n${LONG}\n\n縦書きの{物語|ものがたり}です。12月の朝、:tcy[AB]灯台守は海を見た。Postext 2024年:upright[GDP]と:sideways[漢字]。\n\n二つ目の段落（括弧）「引用」。\n`;
  const doc = build(md, vertical({ cjk: { uprightDigits: 2 } }));
  const { f, bytes, warnings } = write(doc);
  const stories = storyPaths(f).map((p) => text(f, p));
  const items = textItems(doc);

  it('lays the test book out vertically, bound on the right', () => {
    expect(pageDisplayList(doc, 0).vertical).toBe(true);
    expect(doc.binding).toBe('right');
    expect(items.every((i) => i.rotate === 90 && i.lines.every((l) => l.vertical))).toBe(true);
    expect(items.some((i) => i.lines.length > 2)).toBe(true);
  });

  it('writes every vertical item as a vertical story, with no warning for it', () => {
    expect(stories).toHaveLength(items.length);
    for (const s of stories) {
      expect(s).toContain('StoryOrientation="Vertical"');
      expect(s).toContain('StoryDirection="LeftToRightDirection"');
    }
    expect(warnings.map((w) => w.code)).not.toContain('text.vertical');
    // What is written with a doubt says so, by a code of its own.
    expect(warnings.map((w) => w.code)).toEqual(['text.vertical.sideways']);
  });

  it('keeps each column of characters as one line: a forced break after it, no break inside', () => {
    for (const item of items) {
      const story = stories.find((s) => contents(s).replaceAll(BREAK, '') === item.lines.map((l) => l.text).join(''))!;
      expect(story, item.lines[0]!.text).toBeDefined();
      // A break after every line but the last of the item.
      expect(contents(story).split(BREAK)).toHaveLength(item.lines.length);
      expect(contents(story).split(BREAK)).toEqual(item.lines.map((l) => l.text));
      for (const r of ranges(story)) {
        const words = rangeText(r);
        if (words === BREAK) expect(attr(r, 'NoBreak')).toBeUndefined();
        else if (words) expect(attr(r, 'NoBreak')).toBe('true');
      }
      // The Japanese single-line composer, with nothing left to space or break.
      for (const p of descendants(parseXml(story), 'ParagraphStyleRange')) {
        expect(attr(p, 'Composer')).toBe('$ID/HL Single J');
        expect(attr(p, 'LeadingModel')).toBe('LeadingModelRoman');
        expect(attr(p, 'AutoTcy')).toBe('0');
      }
      expect(story).toContain('<KinsokuSet type="enumeration">Nothing</KinsokuSet>');
      expect(story).toContain('<Mojikumi type="enumeration">Nothing</Mojikumi>');
    }
  });

  it('tells each line\'s leading from the line before it, across the page', () => {
    const item = items.find((i) => i.lines.length > 2)!;
    const story = stories.find((s) => contents(s).startsWith(item.lines[0]!.text))!;
    const style = text(f, 'Resources/Styles.xml');
    const pitch = item.lines[1]!.baseline - item.lines[0]!.baseline;
    // The style's leading is the line pitch, and no line says another.
    expect(style).toContain(`<Leading type="unit">${pitch}</Leading>`);
    expect(story).not.toContain('<Leading');
  });

  it('flags tate-chu-yoko cells: the author\'s, short numbers, upright Latin letters', () => {
    const story = stories.find((s) => contents(s).includes('灯台守は海を見た。Postext'))!;
    expect(attr(rangeOf(story, 'AB')!, 'Tatechuyoko')).toBe('true');
    // `cjk.uprightDigits: 2`: 12 stands in one cell, 2024 runs sideways.
    expect(attr(rangeOf(story, '12')!, 'Tatechuyoko')).toBe('true');
    expect(ranges(story).filter((r) => rangeText(r).includes('2024')).every((r) => attr(r, 'Tatechuyoko') === undefined)).toBe(true);
    for (const letter of ['G', 'D', 'P']) expect(attr(rangeOf(story, letter)!, 'Tatechuyoko'), letter).toBe('true');
    // Sideways Latin is the composer's default: no flag.
    expect(ranges(story).filter((r) => rangeText(r).includes('Postext')).every((r) => attr(r, 'Tatechuyoko') === undefined && attr(r, 'CharacterRotation') === undefined)).toBe(true);
    expect(attr(rangeOf(story, '漢字')!, 'CharacterRotation')).toBe('-90');
  });

  it('writes a ruby reading on its base', () => {
    const story = stories.find((s) => contents(s).includes('物語です。12'))!;
    const base = rangeOf(story, '物語')!;
    expect(attr(base, 'RubyFlag')).toBe('true');
    expect(attr(base, 'RubyString')).toBe('ものがたり');
    expect(attr(base, 'RubyType')).toBe('GroupRuby');
    expect(attr(base, 'RubyPosition')).toBe('AboveRight');
    expect(Number(attr(base, 'RubyFontSize'))).toBeGreaterThan(0);
  });

  it('sets a bracket Postext set on half a cell with half an em less after it', () => {
    const item = items.find((i) => i.lines[0]!.text.startsWith('二つ目'))!;
    const half = item.lines[0]!.runs.find((r) => r.text === '）')!;
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(half.fontString)![1]);
    expect(half.width).toBeCloseTo(size / 2, 3);
    const story = stories.find((s) => contents(s).startsWith('二つ目'))!;
    expect(attr(rangeOf(story, '）')!, 'Tracking')).toBe('-500');
  });

  it('puts each frame where its first line stands: at the right, its baseline measured across', () => {
    const all = frames(f);
    expect(all).toHaveLength(items.length);
    const pageH = doc.pages[0]!.height;
    for (const item of items) {
      const frame = all.find((fr) => contents(storyOf(f, fr)).startsWith(item.lines[0]!.text))!;
      const b = box(frame);
      const at = firstLine(item);
      // Insets: top, left, bottom, right. The first baseline is the fixed
      // offset from the right inset; the lines start at the top inset.
      const [insetTop, insetLeft, , insetRight] = b.insets as [number, number, number, number];
      expect(attr(children(frame, 'TextFramePreference')[0]!, 'FirstBaselineOffset')).toBe('FixedHeight');
      expect(b.right - insetRight - b.baseline).toBeCloseTo(at.baselineX, 2);
      expect(b.top + pageH / 2 + insetTop).toBeCloseTo(at.startY, 2);
      expect(insetLeft).toBe(0);
      // The frame is upright (no turn) and holds every line: the last
      // baseline is inside it, and a line's length fits its height.
      expect(attr(frame, 'ItemTransform')!.split(' ').slice(0, 4)).toEqual(['1', '0', '0', '1']);
      const lastX = at.baselineX - (item.lines[item.lines.length - 1]!.baseline - item.lines[0]!.baseline);
      expect(b.left).toBeLessThan(lastX);
      expect(b.bottom + pageH / 2).toBeGreaterThanOrEqual(at.startY + item.lines[0]!.width - 0.01);
    }
  });

  it('binds the document on the right, with the page\'s margins as they stand on the sheet', () => {
    const prefs = text(f, 'Resources/Preferences.xml');
    expect(prefs).toContain('PageBinding="RightToLeft"');
    const page = descendants(parseXml(text(f, Object.keys(f).find((p) => p.startsWith('Spreads/'))!)), 'Page')[0]!;
    const m = children(page, 'MarginPreference')[0]!;
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) expect(Number(attr(m, side)), side).toBeCloseTo((10 * 72) / 25.4, 1);
  });

  it('is read back as vertical stories, without a warning', () => {
    const idml = readIdml(bytes);
    expect(idml.warnings).toEqual([]);
    expect(idml.preferences.rightToLeft).toBe(true);
    const read = [...idml.stories.values()];
    expect(read).toHaveLength(items.length);
    expect(read.every((s) => s.orientation === 'vertical')).toBe(true);
  });
});

describe('idmlDocument: a vertical book in spreads', () => {
  it('puts the first page left of the spine and the pages after it two to a spread', () => {
    const cfg = vertical({ page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(15), bottom: mm(20), left: mm(18), right: mm(12), mirror: true } } });
    const doc = build(Array(30).fill(LONG).join('\n\n'), cfg);
    expect(doc.pages.length).toBeGreaterThan(2);
    const { f, warnings } = write(doc);
    expect(warnings).toEqual([]);
    const spreads = Object.keys(f).filter((p) => p.startsWith('Spreads/')).map((p) => parseXml(text(f, p))).map((x) => descendants(x, 'Spread')[0]!);
    const width = (140 * 72) / 25.4;
    const xs = (s: XmlElement) => children(s, 'Page').map((p) => Number(attr(p, 'ItemTransform')!.split(' ')[4]));
    const first = spreads.find((s) => attr(children(s, 'Page')[0]!, 'Self') === 'pg0')!;
    // A right-bound book opens on a page left of the spine.
    expect(xs(first)).toHaveLength(1);
    expect(xs(first)[0]).toBeCloseTo(-width, 2);
    const second = spreads.find((s) => attr(children(s, 'Page')[0]!, 'Self') === 'pg1')!;
    // Page 2 right of the spine, page 3 left of it.
    expect(xs(second)[0]).toBeCloseTo(0, 2);
    expect(xs(second)[1]).toBeCloseTo(-width, 2);
    expect(attr(second, 'BindingLocation')).toBe('1');
  });
});

describe('idmlDocument: vertical text left to InDesign\'s composer', () => {
  const doc = build(`${LONG}\n\n12月の朝。\n`, vertical());
  const { f, warnings } = write(doc, { lineBreaks: 'reflow' });
  const stories = storyPaths(f).map((p) => text(f, p));

  it('writes vertical stories without forced breaks, for the Japanese paragraph composer', () => {
    expect(stories).toHaveLength(2);
    for (const s of stories) {
      expect(s).toContain('StoryOrientation="Vertical"');
      expect(s).not.toContain(BREAK);
      expect(s).not.toContain('NoBreak');
      expect(s).toContain('Composer="$ID/HL Composer J"');
      expect(s).not.toContain('KinsokuSet');
    }
    expect(contents(stories.find((s) => contents(s).startsWith('縦書き'))!)).toBe(LONG);
    expect(attr(rangeOf(stories.find((s) => contents(s).startsWith('12'))!, '12')!, 'Tatechuyoko')).toBe('true');
  });

  it('says that line breaking and spacing are InDesign\'s own', () => {
    expect(warnings.map((w) => w.code)).toEqual(['text.vertical.kinsoku']);
  });
});

describe('idmlDocument: pages of both orientations', () => {
  const template = (frameSets: Record<string, unknown>[], over: Record<string, unknown> = {}) =>
    config({ locale: 'ja', calloutStyles: [plain('text', 10)], pageTemplates: [{ id: 'sheet', area: 'trim', header: false, footer: false, frames: frameSets }], ...over } as unknown as Partial<PostextConfig>);
  const md = sheet(`:::frame{slot="side"}\n${JA}${JA}\n:::\n:::frame{slot="body"}\nHorizontal text here.\n:::`);
  const named = (f: Files, name: string) => frames(f).find((fr) => attr(fr, 'Name') === name)!;

  it('keeps a vertical frame vertical on a horizontal page', () => {
    const cfg = template([
      { name: 'side', style: 'text', placement: top(100, 20), width: mm(30), height: mm(120), writingMode: 'vertical-rl' },
      { name: 'body', style: 'text', placement: top(10, 20), width: mm(80), height: mm(100) },
    ]);
    const doc = build(md, cfg);
    const { f, warnings } = write(doc);
    expect(warnings).toEqual([]);
    expect(storyOf(f, named(f, 'body'))).toContain('StoryOrientation="Horizontal"');
    const side = named(f, 'side');
    expect(storyOf(f, side)).toContain('StoryOrientation="Vertical"');
    // The frame stands upright on the box the template gives it: 30 mm
    // wide from 100 mm, 120 mm tall from 20 mm (room after the lines' end aside).
    expect(attr(side, 'ItemTransform')!.split(' ').slice(0, 4)).toEqual(['1', '0', '0', '1']);
    const b = box(side);
    const pt = (v: number) => (v * 72) / 25.4;
    const pageH = doc.pages[0]!.height;
    expect(b.right).toBeCloseTo(pt(130), 1);
    expect(b.top + pageH / 2).toBeCloseTo(pt(20), 1);
    expect(b.left).toBeLessThanOrEqual(pt(100) + 0.01);
    expect(b.bottom + pageH / 2).toBeGreaterThanOrEqual(pt(140) - 0.01);
    // Its first line where Postext set it.
    const item = textItems(doc).find((i) => i.frame?.endsWith('side'))!;
    expect(item.rotate).toBe(90);
    const scale = doc.pages[0]!.composed!.frames.find((fr) => fr.name === 'side')!.scale;
    expect(scale).toBe(1);
    const at = firstLine(item);
    expect(b.right - b.insets[3]! - b.baseline).toBeCloseTo(at.baselineX, 2);
    expect(b.top + pageH / 2 + b.insets[0]!).toBeCloseTo(at.startY, 2);
  });

  it('keeps a horizontal frame horizontal on a vertical page, each frame where it stands on the sheet', () => {
    const cfg = template(
      [
        { name: 'side', style: 'text', placement: top(100, 20), width: mm(30), height: mm(60) },
        { name: 'body', style: 'text', placement: top(10, 20), width: mm(80), height: mm(100), writingMode: 'horizontal-tb' },
      ],
      { layout: { layoutType: 'single', writingMode: 'vertical-rl' } },
    );
    const doc = build(md, cfg);
    const { f, warnings } = write(doc);
    expect(warnings).toEqual([]);
    const pageH = doc.pages[0]!.height;
    const list = textItems(doc);
    // The horizontal frame: an upright frame, its line where the display list has it.
    const body = named(f, 'body');
    expect(storyOf(f, body)).toContain('StoryOrientation="Horizontal"');
    expect(attr(body, 'ItemTransform')!.split(' ').slice(0, 4)).toEqual(['1', '0', '0', '1']);
    const h = list.find((i) => i.frame?.endsWith('body'))!;
    expect(h.rotate).toBeUndefined();
    const hb = box(body);
    expect(hb.left + hb.insets[1]!).toBeCloseTo(h.lines[0]!.x, 2);
    expect(hb.top + pageH / 2 + hb.insets[0]! + hb.baseline).toBeCloseTo(h.lines[0]!.baseline, 2);
    // The vertical one (the page's own setting).
    const side = named(f, 'side');
    expect(storyOf(f, side)).toContain('StoryOrientation="Vertical"');
    const v = list.find((i) => i.frame?.endsWith('side'))!;
    const vb = box(side);
    const at = firstLine(v);
    expect(vb.right - vb.insets[3]! - vb.baseline).toBeCloseTo(at.baselineX, 2);
    expect(vb.top + pageH / 2 + vb.insets[0]!).toBeCloseTo(at.startY, 2);
  });
});

describe('idmlDocument: what vertical text does not carry', () => {
  it('writes a warichu note as one, and warns about emphasis dots', () => {
    const doc = build(':dots[大切]なことは光を守ることだ（注:warichu[割注の中身です]）。\n', vertical());
    const { f, warnings } = write(doc);
    const story = text(f, storyPaths(f)[0]!);
    expect(attr(rangeOf(story, '割注の中身です')!, 'Warichu')).toBe('true');
    expect(warnings.map((w) => w.code)).toEqual(['text.vertical.emphasisDots']);
    expect(story).not.toContain('Kenten');
  });

  it('does not warn about dots on a page without them', () => {
    const { warnings } = write(build(`${JA}\n`, vertical()));
    expect(warnings).toEqual([]);
  });
});
