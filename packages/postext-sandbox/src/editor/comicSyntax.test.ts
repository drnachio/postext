import { describe, expect, it } from 'vitest';
import { comicLineKinds, comicLineRanges, type ComicLineKind } from './comicSyntax';

/** The ranges of a line as `[kind, text]` pairs. */
function marks(text: string, kind: ComicLineKind) {
  return comicLineRanges(text, kind).map((r) => [r.kind, text.slice(r.from, r.to)]);
}

describe('comic page highlighting', () => {
  it('tells fences, panels and script lines apart, nothing outside a page', () => {
    const lines = [
      'ana: not a comic',
      ':::page{split="30 [30 | 20 | *] / *" gutter=4mm}',
      '::panel{art=p1-wide}',
      'caption: Lyon, 1943.',
      '  continued',
      ':::',
      'ben: after',
      ':::strip',
      '::panel',
      ':::',
    ];
    expect(comicLineKinds(lines)).toEqual([null, 'fence', 'panel', 'script', 'script', 'close', null, 'fence', 'panel', 'close']);
    // A viewport that starts inside a page.
    expect(comicLineKinds(['ana: hi', ':::'], true)).toEqual(['script', 'close']);
    // Other fences do not open a comic page.
    expect(comicLineKinds([':::callout{type="note"}', 'ana: hi', ':::'])).toEqual([null, null, null]);
  });

  it('marks the fence name and its attributes', () => {
    expect(marks(':::page{split="30 / *" style=clean bleed}', 'fence')).toEqual([
      ['fence', ':::page'],
      ['brace', '{'],
      ['attrKey', 'split'],
      ['attrValue', '"30 / *"'],
      ['attrKey', 'style'],
      ['attrValue', 'clean'],
      ['attrKey', 'bleed'],
      ['brace', '}'],
    ]);
    expect(marks(':::', 'close')).toEqual([['fence', ':::']]);
    expect(marks('::panel{art=p1 #door focus="70% 40%"}', 'panel')).toEqual([
      ['panel', '::panel'],
      ['brace', '{'],
      ['attrKey', 'art'],
      ['attrValue', 'p1'],
      ['attrValue', '#door'],
      ['attrKey', 'focus'],
      ['attrValue', '"70% 40%"'],
      ['brace', '}'],
    ]);
  });

  it('marks the speaker, the style flags, the attributes and the colon of a script line', () => {
    expect(marks('ben{whisper at="62% 40%"}: It is nothing.', 'script')).toEqual([
      ['speaker', 'ben'],
      ['brace', '{'],
      ['flag', 'whisper'],
      ['attrKey', 'at'],
      ['attrValue', '"62% 40%"'],
      ['brace', '}'],
      ['colon', ':'],
    ]);
    expect(marks('ana: Did you hear that?', 'script')).toEqual([['speaker', 'ana'], ['colon', ':']]);
    expect(marks('sfx{rotate=-8}: KRAK', 'script')).toEqual([
      ['role', 'sfx'], ['brace', '{'], ['attrKey', 'rotate'], ['attrValue', '-8'], ['brace', '}'], ['colon', ':'],
    ]);
  });

  it('reads the fullwidth colon and speaker ids in any script', () => {
    expect(marks('ナミ：なに？', 'script')).toEqual([['speaker', 'ナミ'], ['colon', '：']]);
    expect(marks('caption{at=bottom-end} ： 三条街外。', 'script')).toEqual([
      ['role', 'caption'], ['brace', '{'], ['attrKey', 'at'], ['attrValue', 'bottom-end'], ['brace', '}'], ['colon', '：'],
    ]);
  });

  it('leaves continuation lines, comments and plain text alone', () => {
    expect(marks('  and then some', 'script')).toEqual([]);
    expect(marks('<!-- ana: draft -->', 'script')).toEqual([]);
    expect(marks('No colon here', 'script')).toEqual([]);
    expect(marks('ana: text', null)).toEqual([]);
  });
});
