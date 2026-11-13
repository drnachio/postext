import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { pageDisplayList } from 'postext';
import type { PostextConfig } from 'postext';
import { build, config, mm, LOREM } from '../testing/kit.test-helper.js';
import { children, descendants, isElement, parseXml, textOf, type XmlElement } from '../xml/read.js';
import { idmlDocument, type IdmlOptions } from './index.js';

const BREAK = '\u2028';

function write(md: string, cfg: PostextConfig, opts: Partial<IdmlOptions> = {}) {
  const doc = build(md, cfg);
  const result = idmlDocument({ docs: [doc], text: 'frames', ...opts });
  const files = unzipSync(result.bytes);
  const stories = Object.keys(files).filter((p) => p.startsWith('Stories/')).map((p) => parseXml(strFromU8(files[p]!)));
  return { doc, result, files, stories, styles: strFromU8(files['Resources/Styles.xml']!) };
}

const storyText = (s: XmlElement) => descendants(s, 'Content').map(textOf).join('');
const ranges = (p: XmlElement) => children(p, 'CharacterStyleRange');
const leadingOf = (r: XmlElement) => {
  const l = children(children(r, 'Properties')[0], 'Leading')[0];
  return l ? Number(textOf(l)) : undefined;
};

describe('lines kept as Postext broke them (the default)', () => {
  const cfg = config();
  const { doc, stories, styles } = write(`${LOREM}\n\n${LOREM}`, cfg);
  const items = pageDisplayList(doc, 0).items.filter((i) => i.kind === 'text' && i.role === 'body');
  const first = items[0]!;
  if (first.kind !== 'text') throw new Error('no body text');
  const story = stories.find((s) => storyText(s).startsWith('Typesetting'))!;
  const para = descendants(story, 'ParagraphStyleRange')[0]!;

  it('ends every line but the last in a forced line break, with the hyphen a break added', () => {
    const text = storyText(story);
    expect(text.split(BREAK)).toHaveLength(first.lines.length);
    expect(first.lines.length).toBeGreaterThan(3);
    const hyphenated = first.lines.findIndex((l) => l.addedHyphen);
    expect(hyphenated).toBeGreaterThanOrEqual(0);
    expect(text.split(BREAK)[hyphenated]).toMatch(/[-‐]$/);
    // No space is left at a line's end to take part in its justification.
    for (const line of text.split(BREAK)) expect(line).not.toMatch(/ $/);
  });

  it('lets no line break but at its forced break: the text ranges are no-break, the break is a range of its own', () => {
    for (const r of ranges(para)) {
      const t = descendants(r, 'Content').map(textOf).join('');
      if (t === BREAK) expect(r.attrs.NoBreak).toBeUndefined();
      else {
        expect(r.attrs.NoBreak).toBe('true');
        expect(t).not.toContain(BREAK);
      }
    }
  });

  it('aligns a paragraph as its lines were set and leaves nothing to the composer', () => {
    const body = /<ParagraphStyle Self="ParagraphStyle\/Body"[^>]*>/.exec(styles)![0];
    // As the lines were set: spread to the measure, or ragged.
    const set = first.lines.some((l) => l.align === 'justify') ? 'LeftJustified' : 'LeftAlign';
    expect(para.attrs.Justification ?? / Justification="([^"]+)"/.exec(body)?.[1]).toBe(set);
    expect(body).toContain('Hyphenation="false"');
    expect(body).toContain('Composer="$ID/HL Single"');
    expect(body).toContain('MinimumWordSpacing="0"');
    expect(body).toContain('MaximumLetterSpacing="0"');
    expect(para.attrs.Hyphenation).toBeUndefined();
  });

  it('writes a line’s leading as a property of its ranges, never as an attribute', () => {
    const all = stories.flatMap((s) => descendants(s, 'CharacterStyleRange'));
    for (const r of all) expect(r.attrs.Leading).toBeUndefined();
    for (const p of stories.flatMap((s) => descendants(s, 'ParagraphStyleRange'))) {
      expect(p.attrs.Leading).toBeUndefined();
      expect(children(children(p, 'Properties')[0], 'Leading')).toEqual([]);
    }
  });

  it('gives a line set off its style’s leading that distance from the line before', () => {
    // A heading and a paragraph in one frame: the paragraph's first line
    // stands a space under the heading, the rest a leading apart.
    const out = write(`# A title\n\n${LOREM}`, config());
    const body = out.stories.find((s) => storyText(s).startsWith('Typesetting'))!;
    const leads = new Set(ranges(descendants(body, 'ParagraphStyleRange')[0]!).map(leadingOf));
    // One leading for the whole paragraph (its style's, so none is written).
    expect(leads.size).toBe(1);
  });
});

describe('lines kept: frames chained by next', () => {
  it('ends the text of each frame of a chain in a frame break', () => {
    const top = (x: number, y: number) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) } });
    const cfg = config({
      calloutStyles: [{ id: 'text', border: { enabled: false }, backgroundEnabled: false, body: { fontSize: { value: 10, unit: 'pt' }, textAlign: 'justify' } }],
      pageTemplates: [{ id: 'sheet', area: 'trim', header: false, footer: false, frames: [
        { name: 'a', style: 'text', next: 'b', placement: top(10, 10), width: mm(55), height: mm(30) },
        { name: 'b', style: 'text', placement: top(75, 10), width: mm(55), height: mm(120) },
      ] }],
    } as unknown as Partial<PostextConfig>);
    const { stories, files } = write(`::::page{template="sheet"}\n:::frame{slot="a"}\n${LOREM}\n\n${LOREM}\n:::\n::::\n`, cfg);
    const spread = parseXml(strFromU8(files[Object.keys(files).find((p) => p.startsWith('Spreads/'))!]!));
    const frames = descendants(spread, 'TextFrame');
    expect(frames).toHaveLength(2);
    expect(frames[0]!.attrs.NextTextFrame).toBe(frames[1]!.attrs.Self);
    const story = stories.find((s) => storyText(s).startsWith('Typesetting'))!;
    const breaks = descendants(story, 'CharacterStyleRange').filter((r) => r.attrs.ParagraphBreakType === 'NextFrame');
    expect(breaks).toHaveLength(1);
    expect(breaks[0]!.children.filter(isElement).map((c) => c.name)).toEqual(['Br']);
    // The part left in the first frame goes on in the second: its last line is spread too.
    const paras = descendants(story, 'ParagraphStyleRange');
    const before = paras[paras.findIndex((p) => children(p, 'CharacterStyleRange').some((r) => r.attrs.ParagraphBreakType === 'NextFrame'))]!;
    expect(before.attrs.Justification).toBe('FullyJustified');
  });
});

describe('faces named from their font files', () => {
  /** A minimal font file whose name table says what `names` says. */
  function font(names: Record<number, string>): Uint8Array {
    const entries = Object.entries(names).map(([id, text]) => ({ id: Number(id), text }));
    const strings = entries.map((e) => Uint8Array.from([...e.text].flatMap((ch) => [ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 255])));
    const nameLen = 6 + entries.length * 12 + strings.reduce((n, s) => n + s.length, 0);
    const head = 12 + 2 * 16;
    const out = new Uint8Array(head + nameLen);
    const v = new DataView(out.buffer);
    v.setUint32(0, 0x00010000);
    v.setUint16(4, 2);
    ['name', 'GSUB'].forEach((tag, i) => [...tag].forEach((ch, k) => (out[12 + i * 16 + k] = ch.charCodeAt(0))));
    v.setUint32(12 + 8, head);
    v.setUint32(12 + 12, nameLen);
    v.setUint16(head + 2, entries.length);
    v.setUint16(head + 4, 6 + entries.length * 12);
    let at = 0;
    entries.forEach((e, i) => {
      const rec = head + 6 + i * 12;
      [3, 1, 0x409, e.id, strings[i]!.length, at].forEach((n, k) => v.setUint16(rec + k * 2, n));
      out.set(strings[i]!, head + 6 + entries.length * 12 + at);
      at += strings[i]!.length;
    });
    return out;
  }

  it('takes family and style from the file, lists the face as installed and hands the files back', () => {
    const regular = font({ 1: 'Lora', 2: 'Regular', 6: 'Lora-Regular', 4: 'Lora Regular' });
    const semi = font({ 1: 'Lora SemiBold', 2: 'Italic', 16: 'Lora', 17: 'SemiBold Italic', 6: 'Lora-SemiBoldItalic' });
    const cfg = config({ bodyText: { fontFamily: 'Lora', boldFontWeight: 600, textAlign: 'left' } } as unknown as Partial<PostextConfig>);
    const { result, files, stories } = write('Plain words and ***strong slanted*** ones.', cfg, { fontFile: (_f, weight, italic) => (weight >= 600 && italic ? semi : regular) });
    const fonts = strFromU8(files['Resources/Fonts.xml']!);
    expect(fonts).toContain('FontStyleName="SemiBold Italic"');
    expect(fonts).toContain('PostScriptName="Lora-SemiBoldItalic"');
    expect(fonts).toContain('Status="Installed"');
    expect(stories.flatMap((s) => descendants(s, 'CharacterStyleRange')).some((r) => r.attrs.FontStyle === 'SemiBold Italic')).toBe(true);
    expect(result.fonts.map((f) => f.path).sort()).toEqual(['Document fonts/Lora-Regular.ttf', 'Document fonts/Lora-SemiBoldItalic.ttf']);
  });

  it('warns once about a face with no file or a file it cannot read, and names it from weight and slant', () => {
    const warnings: string[] = [];
    write('Some *slanted* words.', config(), { fontFile: (_f, _w, italic) => (italic ? new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]) : undefined), onWarning: (w) => warnings.push(w.code) });
    expect(warnings).toContain('font.missing');
    expect(warnings).toContain('font.format');
  });
});
