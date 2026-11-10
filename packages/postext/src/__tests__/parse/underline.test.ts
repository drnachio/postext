import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting.js';
import { parseMarkdown, parseInlineSnippetSpans, underlineRanges } from '../../parse/index.js';
import type { InlineSpan } from '../../parse/index.js';

// Underlined text (#1465): `:underline[text]` always, and `++text++` when
// `bodyText.plusUnderline` is on. Read like `~~text~~`: the text stays
// ordinary text, its range riding on `InlineSpan.links` with `underline`.

function underlined(spans: readonly InlineSpan[]): string[] {
  const runs = new Map<number, string>();
  for (const span of spans) {
    for (const l of span.links ?? []) {
      if (!l.underline) continue;
      runs.set(l.underline.id, (runs.get(l.underline.id) ?? '') + span.text.slice(l.start, l.end));
    }
  }
  return [...runs.values()];
}

const text = (spans: readonly InlineSpan[]): string => spans.map((s) => s.text).join('');
const ON = { plusUnderline: true };

describe(':underline[text]', () => {
  it('underlines its text, the markup dropped', () => {
    const spans = parseInlineFormatting('Please :underline[sign here] and return.');
    expect(text(spans)).toBe('Please sign here and return.');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.links).toEqual([{ start: 7, end: 16, href: '', underline: { id: 0 } }]);
  });

  it('holds bold, links and a strikethrough, and keeps runs apart', () => {
    const spans = parseInlineFormatting(':underline[old **bold** [link](https://example.org)] and :underline[two] ~~:underline[both]~~');
    expect(text(spans)).toBe('old bold link and two both');
    expect(underlined(spans)).toEqual(['old bold link', 'two', 'both']);
    expect(spans.find((s) => s.text === 'bold')!.bold).toBe(true);
    const linked = spans.flatMap((s) => (s.links ?? []).filter((l) => !l.underline && !l.strike).map((l) => l.href));
    expect(linked).toEqual(['https://example.org']);
    expect(spans.some((s) => s.links?.some((l) => l.strike))).toBe(true);
  });

  it('goes inside emphasis and small caps', () => {
    const spans = parseInlineFormatting('**bold :underline[under]** and :smallcaps[:underline[Caps]]');
    expect(underlined(spans)).toEqual(['under', 'Caps']);
    expect(spans.find((s) => s.text === 'Caps')!.smallCaps).toBe(true);
  });

  it('takes \\] for a literal bracket, and leaves an empty or unclosed one as text', () => {
    expect(underlined(parseInlineFormatting(':underline[a \\] b]'))).toEqual(['a ] b']);
    for (const t of [':underline[] x', ':underline[open', 'a :underline[x\n\ny]']) {
      expect(underlined(parseInlineFormatting(t))).toEqual([]);
    }
  });

  it('is literal in inline code', () => {
    const [block] = parseMarkdown('`:underline[x]` and :underline[y]');
    expect(block!.text).toContain(':underline[x]');
    expect(underlined(block!.spans)).toEqual(['y']);
  });

  it('reads in captions, cells and headings too', () => {
    expect(underlined(parseInlineSnippetSpans('A :underline[cell]'))).toEqual(['cell']);
    const [h] = parseMarkdown('## A :underline[title]');
    expect(underlined(h!.spans)).toEqual(['title']);
  });

  it('maps every character of a block back to its source', () => {
    const md = 'Sign :underline[here **now**] and :underline[[unload](https://x.org)] there.';
    const [block] = parseMarkdown(md);
    expect(block!.text).toBe('Sign here now and unload there.');
    const { text: t, sourceMap } = block!;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === ' ') continue;
      expect(md[sourceMap[i]!]).toBe(t[i]);
    }
    // The letters of `underline` never stand for the text's own.
    expect(sourceMap[t.indexOf('unload')]).toBe(md.indexOf('[unload') + 1);
  });

  it('strips the markup for plain text', () => {
    expect(stripInlineFormatting('a :underline[bc **de**] f')).toBe('a bc de f');
  });
});

describe('++text++', () => {
  it('is text unless bodyText.plusUnderline is on', () => {
    for (const t of ['Please ++sign here++ and return.', 'use ++i rather than i++ here']) {
      const spans = parseInlineFormatting(t);
      expect(text(spans)).toBe(t);
      expect(underlined(spans)).toEqual([]);
    }
    expect(stripInlineFormatting('a ++bc++ d')).toBe('a ++bc++ d');
    const [block] = parseMarkdown('Sign ++here++.');
    expect(block!.text).toBe('Sign ++here++.');
  });

  it('underlines the text between two plus signs on each side when on', () => {
    const spans = parseInlineFormatting('Please ++sign here++ and return.', ON);
    expect(text(spans)).toBe('Please sign here and return.');
    expect(spans[0]!.links).toEqual([{ start: 7, end: 16, href: '', underline: { id: 0 } }]);
  });

  it('underlines every pair when on, the increment operator included', () => {
    expect(underlined(parseInlineFormatting('use ++i rather than i++ here', ON))).toEqual(['i rather than i']);
    expect(underlined(parseInlineFormatting('++x and y++', ON))).toEqual(['x and y']);
    expect(underlined(parseInlineFormatting('Mark ++x++ here.', ON))).toEqual(['x']);
  });

  it('leaves plus signs that make no pair as text', () => {
    for (const t of ['C++ and C++', '1 ++ 2 ++ 3', '++ a ++', 'a +++b+++ c', 'g++ -O2', 'Notepad++', '++i', 'i++', '用C++编程']) {
      const spans = parseInlineFormatting(t, ON);
      expect(text(spans)).toBe(t);
      expect(underlined(spans)).toEqual([]);
    }
  });

  it('makes no exception for a pair glued to a letter or digit (C++)', () => {
    expect(underlined(parseInlineFormatting('x++y++', ON))).toEqual(['y']);
    expect(underlined(parseInlineFormatting('C++-Kurs und C++-Buch', ON))).toEqual(['-Kurs und C']);
    expect(underlined(parseInlineFormatting('C\\+\\+-Kurs und C\\+\\+-Buch', ON))).toEqual([]);
  });

  it('takes \\+\\+ and \\++ as a literal pair', () => {
    for (const [t, out] of [['\\+\\+not\\+\\+', '++not++'], ['\\++not++', '++not++']] as const) {
      const spans = parseInlineFormatting(t, ON);
      expect(text(spans)).toBe(out);
      expect(underlined(spans)).toEqual([]);
    }
  });

  it('never underlines in inline code or a code block', () => {
    const [para, code] = parseMarkdown('`++x++` and [home](https://example.org/++a++) ++y++\n\n```\n++z++\n```', ON);
    expect(para!.text).toContain('++x++');
    expect(underlined(para!.spans)).toEqual(['y']);
    expect(code!.type).toBe('code');
    expect(code!.text).toBe('++z++');
  });

  it('opens and closes beside a Chinese or Japanese character', () => {
    expect(underlined(parseInlineFormatting('请++在每一页签名++，然后寄回。', ON))).toEqual(['在每一页签名']);
    expect(underlined(parseInlineFormatting('++すべてのページに署名++のうえ', ON))).toEqual(['すべてのページに署名']);
  });

  it('reaches headings, list items, cells and chips through the options', () => {
    const blocks = parseMarkdown('## A ++title++\n\n- an ++item++\n\nA :chip[++word++] here.', ON);
    expect(blocks.map((b) => underlined(b.spans.flatMap((s) => s.chip ? s.chip.spans : [s])))).toEqual([['title'], ['item'], ['word']]);
    expect(underlined(parseInlineSnippetSpans('A ++cell++', ON))).toEqual(['cell']);
    expect(underlined(parseInlineSnippetSpans('A ++cell++'))).toEqual([]);
  });

  it('scans long hostile rows in linear time', () => {
    const rows = ['++a '.repeat(50_000), '字++'.repeat(50_000), 'a++ '.repeat(50_000), '++i x i++ '.repeat(20_000), `++${'+a'.repeat(50_000)}`, `++a${' b'.repeat(100_000)}`, '+'.repeat(200_000)];
    const t0 = performance.now();
    for (const r of rows) parseInlineFormatting(r, ON);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('maps every character of a block back to its source', () => {
    const md = 'Sign ++here++ and ~~there~~ **now**.';
    const [block] = parseMarkdown(md, ON);
    expect(block!.text).toBe('Sign here and there now.');
    const { text: t, sourceMap } = block!;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === ' ') continue;
      expect(md[sourceMap[i]!]).toBe(t[i]);
    }
  });

  it('strips the markers for plain text when on', () => {
    expect(stripInlineFormatting('a ++bc de++ f', ON)).toBe('a bc de f');
  });
});

describe('underlineRanges (the Sandbox editor)', () => {
  it('finds the directive always and ++…++ only when on', () => {
    const line = 'a :underline[b] ++c++';
    expect(underlineRanges(line)).toEqual([{ from: 2, to: 15, open: 11, close: 1 }]);
    expect(underlineRanges(line, ON)).toEqual([{ from: 2, to: 15, open: 11, close: 1 }, { from: 16, to: 21, open: 2, close: 2 }]);
    expect(underlineRanges('\\++x++', ON)).toEqual([]);
  });
});
