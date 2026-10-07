import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse/blockParser';
import { parseComicPoint } from '../../comics/script';
import { BREAK_PLACEHOLDER } from '../../parse/inlineFormatting';
import type { ComicPageSource } from '../../comics/types';

function comicOf(md: string): ComicPageSource {
  const block = parseMarkdown(md).find((b) => b.comic);
  if (!block?.comic) throw new Error('no comic block');
  return block.comic;
}

const SPEC_PAGE = `:::page{split="30 [30 | 20 | *] / *" gutter=4mm style=clean}
::panel{art=p1-wide}
caption: Lyon, 1943.
ana: Did you hear that?
ben{whisper}: It's nothing. Go back to sleep.
ben: Really.
::panel{art=p1-door focus="70% 40%"}
sfx{at="62% 40%" rotate=-8}: KRAK
::panel{art=p1-ana}
ana{thought}: Nothing, he says…
::panel{art=p1-street bleed}
caption{at=bottom-end}: Three streets away.
:::`;

describe(':::page block', () => {
  it('reads the SPEC example into one directive block with four panels', () => {
    const md = `Before.\n\n${SPEC_PAGE}\n\nAfter.`;
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'directive', 'paragraph']);
    const page = blocks[1]!;
    expect(page.directiveName).toBe('page');
    const c = page.comic!;
    expect(md.slice(c.sourceStart, c.sourceEnd)).toBe(SPEC_PAGE);
    expect(c.closed).toBe(true);
    expect(c.attrs).toMatchObject({ gutter: '4mm', style: 'clean' });
    expect(md.slice(c.attrSources.split!.start, c.attrSources.split!.end)).toBe('30 [30 | 20 | *] / *');
    expect(c.panels.map((p) => p.attrs.art)).toEqual(['p1-wide', 'p1-door', 'p1-ana', 'p1-street']);
    expect(c.panels[3]!.attrs.bleed).toBe('');
    expect(md.slice(c.panels[1]!.lineStart, c.panels[1]!.lineEnd)).toBe('::panel{art=p1-door focus="70% 40%"}');
    expect(md.slice(c.panels[0]!.sourceStart, c.panels[0]!.sourceEnd)).toBe(SPEC_PAGE.split('\n').slice(1, 6).join('\n'));
    const items = c.panels[0]!.items;
    expect(items.map((i) => [i.key, i.role, i.style, i.text])).toEqual([
      ['caption', 'caption', undefined, 'Lyon, 1943.'],
      ['ana', 'speech', undefined, 'Did you hear that?'],
      ['ben', 'speech', 'whisper', "It's nothing. Go back to sleep."],
      ['ben', 'speech', undefined, 'Really.'],
    ]);
    expect(items[2]!.speaker).toBe('ben');
    expect(md.slice(items[2]!.sourceStart, items[2]!.sourceEnd)).toBe("ben{whisper}: It's nothing. Go back to sleep.");
    const sfx = c.panels[1]!.items[0]!;
    expect(sfx).toMatchObject({ role: 'sfx', at: { x: 0.62, y: 0.4 }, rotate: -8, text: 'KRAK' });
    expect(md.slice(sfx.attrSources.at!.start, sfx.attrSources.at!.end)).toBe('62% 40%');
    expect(c.panels[2]!.items[0]).toMatchObject({ style: 'thought', text: 'Nothing, he says…' });
    expect(c.panels[3]!.items[0]).toMatchObject({ role: 'caption', atKeyword: 'bottom-end' });
  });

  it('maps every balloon character back to its source', () => {
    const md = `:::page\n::panel\nana: Hello *there*.\n:::`;
    const item = comicOf(md).panels[0]!.items[0]!;
    expect(item.text).toBe('Hello there.');
    expect(item.sourceMap.map((o) => md[o]).join('')).toBe('Hello there.');
    expect(item.spans.find((s) => s.italic)?.text).toBe('there');
  });

  it('joins continuation lines and keeps forced breaks', () => {
    const md = [
      ':::page',
      '::panel',
      'ben: It is nothing.',
      '  Go back to sleep.\\',
      '\tReally.',
      'ana: Fine.',
      ':::',
    ].join('\n');
    const items = comicOf(md).panels[0]!.items;
    expect(items).toHaveLength(2);
    expect(items[0]!.text).toBe(`It is nothing. Go back to sleep.${BREAK_PLACEHOLDER}Really.`);
    expect(md.slice(items[0]!.textStart, items[0]!.textEnd)).toBe('It is nothing.\n  Go back to sleep.\\\n\tReally.');
  });

  it('reads Japanese lines: the fullwidth colon, no space between CJK lines, ruby and tcy', () => {
    const md = [
      ':::page',
      '::panel',
      'アナ{thought}：何でもない',
      '  と彼は言う。',
      'ben：:ruby[漢字]{rt="かんじ"}を:tcy[12]回',
      ':::',
    ].join('\n');
    const items = comicOf(md).panels[0]!.items;
    expect(items[0]).toMatchObject({ key: 'アナ', speaker: 'アナ', style: 'thought', text: '何でもないと彼は言う。' });
    expect(items[1]!.text).toBe('漢字を12回');
    expect(items[1]!.spans.some((s) => s.ruby)).toBe(true);
    expect(items[1]!.spans.some((s) => s.combineUpright)).toBe(true);
  });

  it('reads Arabic lines and direction marks', () => {
    const md = ':::page{direction=rtl}\n::panel\nليلى: مرحبا :ltr[OK] يا صديقي\n:::';
    const c = comicOf(md);
    expect(c.attrs.direction).toBe('rtl');
    const item = c.panels[0]!.items[0]!;
    expect(item).toMatchObject({ key: 'ليلى', role: 'speech' });
    expect(item.text).toBe('مرحبا OK يا صديقي');
    expect(item.spans.some((s) => s.direction?.dir === 'ltr')).toBe(true);
  });

  it('skips comments and blank lines; flags stray text and keeps unknown flags', () => {
    const md = [
      ':::page{split="*"}',
      'Text before any panel.',
      '::panel{#first}',
      '<!-- a note',
      'over two lines -->',
      '',
      'ana{wisper join=false break}: Hi',
      'Just text.',
      ':::',
    ].join('\n');
    const c = comicOf(md);
    expect(c.stray).toHaveLength(1);
    const items = c.panels[0]!.items;
    expect(c.panels[0]!.attrs.id).toBe('first');
    expect(items.map((i) => [i.key, i.text, i.stray ?? false])).toEqual([
      ['caption', 'Text before any panel.', true],
      ['ana', 'Hi', false],
      ['caption', 'Just text.', true],
    ]);
    expect(items[1]).toMatchObject({ style: 'wisper', styleFlags: ['wisper'], join: false, break: true });
  });

  it('runs an unclosed page to the end of the text', () => {
    const md = ':::page\n::panel\nana: Hi';
    const c = comicOf(md);
    expect(c.closed).toBe(false);
    expect(c.sourceEnd).toBe(md.length);
  });

  it('maps offsets back when the text holds index marks', () => {
    const md = 'A :index[term] word.\n\n:::page{split="50 / *"}\n::panel\nana: Hi\n:::';
    const c = comicOf(md);
    expect(md.slice(c.attrSources.split!.start, c.attrSources.split!.end)).toBe('50 / *');
    const item = c.panels[0]!.items[0]!;
    expect(md.slice(item.sourceStart, item.sourceEnd)).toBe('ana: Hi');
    expect(c.splitParse.tokens.map((t) => md.slice(t.size.sourceStart, t.size.sourceEnd))).toEqual(['50', '*']);
  });
});

describe('parseComicPoint', () => {
  it('reads percentages and fractions', () => {
    expect(parseComicPoint('62% 40%')).toEqual({ x: 0.62, y: 0.4 });
    expect(parseComicPoint('50 25')).toEqual({ x: 0.5, y: 0.25 });
    expect(parseComicPoint('0.5 0.25')).toEqual({ x: 0.5, y: 0.25 });
    expect(parseComicPoint('top')).toBeUndefined();
  });
});
