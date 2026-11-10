import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting.js';
import { parseMarkdown } from '../../parse/index.js';
import type { InlineSpan } from '../../parse/index.js';

// `++text++`: underlined text. Read like `~~text~~`: the text stays
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

describe('++underline++', () => {
  it('underlines the text between two plus signs on each side, the markers dropped', () => {
    const spans = parseInlineFormatting('Please ++sign here++ and return.');
    expect(text(spans)).toBe('Please sign here and return.');
    expect(underlined(spans)).toEqual(['sign here']);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.links).toEqual([{ start: 7, end: 16, href: '', underline: { id: 0 } }]);
  });

  it('leaves plus signs that make no underline as text', () => {
    for (const t of ['C++ and C++', 'C++-Kurs und C++-Buch', '1 ++ 2 ++ 3', '++ a ++', 'a +++b+++ c', 'x++y++']) {
      const spans = parseInlineFormatting(t);
      expect(text(spans)).toBe(t);
      expect(underlined(spans)).toEqual([]);
    }
  });

  it('spreads over emphasis and links, keeps runs apart and goes with a strikethrough', () => {
    const spans = parseInlineFormatting('++old **bold** [link](https://example.org)++ and ++two++ ~~++both++~~');
    expect(text(spans)).toBe('old bold link and two both');
    expect(underlined(spans)).toEqual(['old bold link', 'two', 'both']);
    const linked = spans.flatMap((s) => (s.links ?? []).filter((l) => !l.underline && !l.strike).map((l) => l.href));
    expect(linked).toEqual(['https://example.org']);
    expect(spans.some((s) => s.links?.some((l) => l.strike))).toBe(true);
  });

  it('leaves the increment operator of a one-letter variable as text', () => {
    for (const t of ['use ++i rather than i++ here', '++i', 'i++', 'for (n = 0; n < 9; ++n) x[n++] = 0;', 'C++', 'g++ -O2', 'Notepad++', 'a ++ b', '++i; j++', '++x and y++']) {
      const spans = parseInlineFormatting(t);
      expect(text(spans)).toBe(t);
      expect(underlined(spans)).toEqual([]);
    }
  });

  it('still underlines a single letter, a phrase of longer words, and after an operator', () => {
    expect(underlined(parseInlineFormatting('Mark ++x++ here.'))).toEqual(['x']);
    expect(underlined(parseInlineFormatting('Please ++sign all pages++.'))).toEqual(['sign all pages']);
    expect(underlined(parseInlineFormatting('++a few words++'))).toEqual(['a few words']);
    expect(underlined(parseInlineFormatting('use ++i rather than i++ and ++sign here++'))).toEqual(['sign here']);
    expect(underlined(parseInlineFormatting('i++ and ++j then ++sign here++'))).toEqual(['sign here']);
  });

  it('opens and closes beside a Chinese or Japanese character', () => {
    expect(underlined(parseInlineFormatting('请++在每一页签名++，然后寄回。'))).toEqual(['在每一页签名']);
    expect(underlined(parseInlineFormatting('++すべてのページに署名++のうえ'))).toEqual(['すべてのページに署名']);
    expect(underlined(parseInlineFormatting('用C++编程'))).toEqual([]);
  });

  it('scans long hostile rows in linear time', () => {
    const rows = ['++a '.repeat(50_000), '字++'.repeat(50_000), 'a++ '.repeat(50_000), '++i x i++ '.repeat(20_000), `++${'+a'.repeat(50_000)}`, `++a${' b'.repeat(100_000)}`, '+'.repeat(200_000)];
    const t0 = performance.now();
    for (const r of rows) parseInlineFormatting(r);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('takes \\+ as a literal plus sign and leaves inline code alone', () => {
    expect(underlined(parseInlineFormatting('\\++not++'))).toEqual([]);
    const [block] = parseMarkdown('`++x++` and [home](https://example.org/++a++) ++y++');
    expect(block!.text).toContain('++x++');
    expect(underlined(block!.spans)).toEqual(['y']);
  });

  it('maps every character of a block back to its source', () => {
    const md = 'Sign ++here++ and ~~there~~ **now**.';
    const [block] = parseMarkdown(md);
    expect(block!.text).toBe('Sign here and there now.');
    const { text: t, sourceMap } = block!;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === ' ') continue;
      expect(md[sourceMap[i]!]).toBe(t[i]);
    }
  });

  it('strips the markers for plain text', () => {
    expect(stripInlineFormatting('a ++bc de++ f')).toBe('a bc de f');
  });
});
