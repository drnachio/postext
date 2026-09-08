import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import type { ContentBlock } from '../../parse';

/** Every plain-text char must map back to the same char in the markdown. */
const expectSourceMapAligned = (markdown: string, block: ContentBlock): void => {
  expect(block.sourceMap).toHaveLength(block.text.length);
  for (let i = 0; i < block.text.length; i++) {
    expect(markdown[block.sourceMap[i]!]).toBe(block.text[i]);
  }
};

describe('heading attributes', () => {
  it('parses a trailing {key="value"} block into attrs and strips it from the text', () => {
    const md = '# Title {author="I. Zango Martín"}\n';
    const [h] = parseMarkdown(md);
    expect(h!.type).toBe('heading');
    expect(h!.text).toBe('Title');
    expect(h!.attrs).toEqual({ author: 'I. Zango Martín' });
    expectSourceMapAligned(md, h!);
    // The source range stops at the visible content.
    expect(md.slice(h!.sourceStart, h!.sourceEnd)).toBe('# Title');
  });

  it('supports several attributes, bare values and flags', () => {
    const md = "## Chapter {author='A. B.' year=2026 draft}";
    const [h] = parseMarkdown(md);
    expect(h!.level).toBe(2);
    expect(h!.text).toBe('Chapter');
    expect(h!.attrs).toEqual({ author: 'A. B.', year: '2026', draft: '' });
  });

  it('keeps inline math working alongside attrs (headings strip inline formatting)', () => {
    const md = '# Some **bold** and $x$ here {tag="t"}\n';
    const [h] = parseMarkdown(md);
    expect(h!.attrs).toEqual({ tag: 't' });
    expect(h!.text).toBe('Some bold and \uFFFC here');
    expect(h!.spans.some((s) => s.math?.tex === 'x')).toBe(true);
    expect(h!.sourceMap).toHaveLength(h!.text.length);
    // The math placeholder maps to its opening `$`; every other char maps to itself.
    for (let i = 0; i < h!.text.length; i++) {
      const src = md[h!.sourceMap[i]!];
      expect(src).toBe(h!.text[i] === '\uFFFC' ? '$' : h!.text[i]);
    }
  });

  it('leaves unbalanced or empty braces in the heading text', () => {
    for (const md of ['# Title {oops', '# Title oops}', '# Title {}', '# Title {a={b}}']) {
      const [h] = parseMarkdown(md);
      expect(h!.attrs).toBeUndefined();
      expect(h!.text).toBe(md.slice(2));
      expectSourceMapAligned(md, h!);
    }
  });

  it('only strips a block at the very end of the line', () => {
    const md = '# A {x="1"} tail';
    const [h] = parseMarkdown(md);
    expect(h!.attrs).toBeUndefined();
    expect(h!.text).toBe('A {x="1"} tail');
  });

  it('does not treat braces in paragraphs as attributes', () => {
    const [p] = parseMarkdown('Plain text {x="1"}');
    expect(p!.type).toBe('paragraph');
    expect(p!.attrs).toBeUndefined();
    expect(p!.text).toBe('Plain text {x="1"}');
  });
});
