import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';

// #403: every word of a line is its own absolutely positioned box, so the
// HTML carries the word spaces (and what separates one line from the next)
// as boxes of their own that paint nothing. A selection then copies the
// text as written; the words stay where the layout put them.

// 7 px a character, whatever the font.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}, textAlign: 'left' | 'justify' = 'left'): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign, fontFamily: 'Test', boldFontWeight: 700, hyphenation: { enabled: false } },
  ...extra,
});

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** The text of a block's markup in document order, as a selection over it
 *  copies (every box is absolutely positioned: the browser adds nothing
 *  between them). */
function copied(html: string, block: VDTBlock): string {
  const start = html.indexOf(`<div class="pt-block" data-block-id="${block.id}"`);
  const rest = html.slice(start);
  const end = rest.indexOf('<div class="pt-block"', 1);
  const markup = end < 0 ? rest : rest.slice(0, end);
  return unescape(markup.replace(/<[^>]+>/g, ''));
}

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');

/** The copy-only boxes of a line's markup: left, word-spacing and text. */
const SPACE_RE = /<span style="position:absolute;left:([\d.-]+)px;top:0;(opacity:0;)?white-space:pre;(?:word-spacing:([\d.-]+)px;)?">(\s*)<\/span>/g;

const TEXT = 'The quick brown fox jumps over the lazy dog and keeps running across the wide green field until night falls.';

describe('word spaces in the HTML (#403)', () => {
  it('a ragged paragraph copies as written, one space between lines and a newline at its end', () => {
    const doc = buildDocument({ markdown: TEXT }, config());
    const [block] = paragraphs(doc);
    expect(block!.lines.length).toBeGreaterThan(2);
    expect(copied(renderToHtml(doc), block!)).toBe(`${TEXT}\n`);
  });

  it('a space box sits where its space falls and paints nothing over a word', () => {
    const doc = buildDocument({ markdown: TEXT }, config());
    const [block] = paragraphs(doc);
    const line = block!.lines[0]!;
    const html = renderToHtml(doc);
    const lineHtml = html.split('<div class="pt-line"').find((l) => l.includes(`>${line.segments![0]!.text}<`))!;
    const spaces = [...lineHtml.matchAll(SPACE_RE)];
    const words = line.segments!.filter((s) => s.kind === 'text');
    // Every word space, then the space the break consumed.
    expect(spaces.map((m) => m[4])).toEqual([...Array(words.length - 1).fill(' '), ' ']);
    // The line-end one is transparent: its highlight never shows past the line.
    expect(spaces.map((m) => m[2] !== undefined)).toEqual([...Array(words.length - 1).fill(false), true]);
    let x = 0;
    const lefts: number[] = [];
    for (const seg of line.segments!) {
      if (seg.kind === 'space') lefts.push(x);
      x += seg.width;
    }
    lefts.push(x);
    expect(spaces.map((m) => Number(m[1]))).toEqual(lefts.map((l) => Number(l.toFixed(3))));
    expect(spaces.every((m) => m[3] === undefined)).toBe(true);
  });

  it('a justified line stretches its spaces with word-spacing, the layout unchanged', () => {
    const doc = buildDocument({ markdown: TEXT }, config({}, 'justify'));
    const [block] = paragraphs(doc);
    const line = block!.lines[0]!;
    expect(line.isLastLine).toBe(false);
    const html = renderToHtml(doc);
    const lineHtml = html.split('<div class="pt-line"').find((l) => l.includes(`>${line.segments![0]!.text}<`))!;
    const spaces = [...lineHtml.matchAll(SPACE_RE)];
    const segs = line.segments!;
    const wordWidth = segs.filter((s) => s.kind !== 'space').reduce((s, seg) => s + seg.width, 0);
    const spaceSegs = segs.filter((s) => s.kind === 'space');
    const measure = block!.bbox.width - (line.bbox.x - block!.bbox.x);
    const gap = (measure - wordWidth) / spaceSegs.length;
    expect(gap).toBeGreaterThan(spaceSegs[0]!.width);
    // Word spaces carry the stretch; the line-end space does not.
    expect(spaces.slice(0, -1).map((m) => Number(m[3]))).toEqual(spaceSegs.map((s) => Number((gap - s.width).toFixed(3))));
    expect(spaces[spaces.length - 1]![3]).toBeUndefined();
    expect(copied(html, block!)).toBe(`${TEXT}\n`);
  });

  it('a line broken inside a word adds nothing between its pieces', () => {
    const hyphenated = (markdown: string) => {
      const base = config({ locale: 'en' }, 'justify');
      const doc = buildDocument({ markdown }, { ...base, bodyText: { ...base.bodyText, hyphenation: { enabled: true } } });
      const [block] = paragraphs(doc);
      expect(block!.lines.some((l) => l.hyphenated)).toBe(true);
      return copied(renderToHtml(doc), block!);
    };
    // A dictionary break: its hyphen is on the line (and copies), no space.
    const TEXT = 'The quick brown fox jumps over the extraordinarily well-established international organizations of the unbelievably characteristic';
    const syllables = hyphenated(TEXT);
    expect(syllables).toContain(' in-ternational ');
    expect(syllables.replace(' in-ternational ', ' international ').replace(' un-believably ', ' unbelievably ')).toBe(`${TEXT}\n`);
    // A break after the hyphen of a compound: the text exactly.
    const COMPOUND = 'aaaa bbbbbbbbbbbbbbbbbbbbbbbbbbb well-established-and-very-well-known-compound-word ok';
    expect(hyphenated(COMPOUND)).toBe(`${COMPOUND}\n`);
  });

  it('a right-to-left paragraph copies in logical order', () => {
    const AR = 'قال AAA إن 2024 و١٤٤٥ (BBB) جميلة جدا في كل مكان من هذه الأرض الواسعة';
    const doc = buildDocument({ markdown: AR }, config({ direction: 'rtl', locale: 'ar' }));
    const [block] = paragraphs(doc);
    expect(block!.lines.length).toBeGreaterThan(1);
    expect(copied(renderToHtml(doc), block!)).toBe(`${AR}\n`);
  });

  it('a Chinese paragraph gets no space between its characters or its lines', () => {
    const ZH = '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光果珍李柰菜重芥姜';
    const doc = buildDocument({ markdown: ZH }, config({ locale: 'zh' }));
    const [block] = paragraphs(doc);
    expect(block!.lines.length).toBeGreaterThan(1);
    expect(copied(renderToHtml(doc), block!)).toBe(`${ZH}\n`);
  });

  it('a Latin word in Chinese text keeps the spaces the author typed, at a break too', () => {
    const ZH = '天地玄黄，宇宙洪荒。我们使用 Postext 排版书籍，它支持 Chinese and English 混排。云腾致雨，露结为霜。金生丽水，玉出昆冈。我们使用 Postext 排版书籍，它支持 Chinese and English 混排。';
    let spaceBreaks = 0;
    for (let width = 160; width <= 300; width += 7) {
      const base = config({ locale: 'zh' }, 'justify');
      const doc = buildDocument({ markdown: ZH }, { ...base, page: { ...base.page, width: pt(width) } });
      const [block] = paragraphs(doc);
      // Breaks where the author's space was (the plain text skips it).
      spaceBreaks += block!.lines.filter((l, i) => {
        const next = block!.lines[i + 1];
        return next && next.plainStart! > l.plainEnd!;
      }).length;
      expect(copied(renderToHtml(doc), block!)).toBe(`${ZH}\n`);
    }
    expect(spaceBreaks).toBeGreaterThan(0);
  });

  it('a vertical Chinese paragraph copies as written', () => {
    const ZH = '天地玄黄，宇宙洪荒。我们使用 Postext 排版书籍，它支持 Chinese and English 混排。云腾致雨，露结为霜。金生丽水，玉出昆冈。';
    const doc = buildDocument({ markdown: ZH }, config({ locale: 'zh', layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const [block] = paragraphs(doc);
    expect(block!.lines.length).toBeGreaterThan(1);
    expect(copied(renderToHtml(doc), block!)).toBe(`${ZH}\n`);
  });

  it('two paragraphs copy on two lines', () => {
    const doc = buildDocument({ markdown: 'First paragraph here.\n\nSecond one.' }, config());
    const html = renderToHtml(doc);
    expect(paragraphs(doc).map((b) => copied(html, b)).join('')).toBe('First paragraph here.\nSecond one.\n');
  });
});
