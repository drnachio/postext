import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting.js';
import { parseMarkdown } from '../../parse/index.js';
import type { InlineSpan } from '../../parse/index.js';

// `~~text~~`: struck-through text (GitHub Flavored Markdown). The text
// stays ordinary text, its range riding on `InlineSpan.links` with
// `strike`, as a highlight mark's does; a single `~` pair stays a
// subscript.

/** The struck text of `spans`, run by run. */
function struck(spans: readonly InlineSpan[]): string[] {
  const runs = new Map<number, string>();
  for (const span of spans) {
    for (const l of span.links ?? []) {
      if (!l.strike) continue;
      runs.set(l.strike.id, (runs.get(l.strike.id) ?? '') + span.text.slice(l.start, l.end));
    }
  }
  return [...runs.values()];
}

const text = (spans: readonly InlineSpan[]): string => spans.map((s) => s.text).join('');

describe('~~strikethrough~~', () => {
  it('strikes the text between two tildes on each side, the markers dropped', () => {
    const spans = parseInlineFormatting('Widget A: ~~€ 165,–~~ now € 129,–');
    expect(text(spans)).toBe('Widget A: € 165,– now € 129,–');
    expect(struck(spans)).toEqual(['€ 165,–']);
    // Paint only: the spans are those of the text without the marks.
    expect(spans).toHaveLength(1);
    expect(spans[0]!.links).toEqual([{ start: 10, end: 17, href: '', strike: { id: 0 } }]);
  });

  it('keeps a single tilde pair a subscript, inside a struck run too', () => {
    const sub = parseInlineFormatting('H~2~O');
    expect(sub.map((s) => s.script)).toEqual([undefined, 'sub', undefined]);
    expect(struck(sub)).toEqual([]);
    const both = parseInlineFormatting('~~H~2~O~~ water');
    expect(text(both)).toBe('H2O water');
    expect(both.map((s) => s.script)).toEqual([undefined, 'sub', undefined]);
    expect(struck(both)).toEqual(['H2O']);
  });

  it('spreads over emphasis, links and soft line breaks, and tells runs apart', () => {
    const spans = parseInlineFormatting('~~old **bold** [link](https://example.org) price~~ and ~~two~~');
    expect(text(spans)).toBe('old bold link price and two');
    expect(struck(spans)).toEqual(['old bold link price', 'two']);
    // The link is still a link, and the strike no link.
    const linked = spans.flatMap((s) => (s.links ?? []).filter((l) => !l.strike).map((l) => [s.text.slice(l.start, l.end), l.href]));
    expect(linked).toEqual([['link', 'https://example.org']]);
    expect(struck(parseInlineFormatting('~~over a\nsoft break~~'))).toEqual(['over a\nsoft break']);
  });

  it('nests in emphasis and holds emphasis', () => {
    const spans = parseInlineFormatting('**~~bold struck~~** and ~~*italic*~~');
    expect(spans.filter((s) => s.bold).map((s) => s.text)).toEqual(['bold struck']);
    expect(struck(spans)).toEqual(['bold struck', 'italic']);
  });

  it('strikes nothing between tildes around spaces, rows of three and lone pairs', () => {
    for (const src of ['~~ not struck ~~', '~~~not struck~~~', 'a ~~ b', '~~~~', 'range 3~~5']) {
      expect(struck(parseInlineFormatting(src))).toEqual([]);
    }
    expect(text(parseInlineFormatting('a ~~ b'))).toBe('a ~~ b');
  });

  it('does not run over a blank line', () => {
    expect(struck(parseInlineFormatting('~~one\n\ntwo~~'))).toEqual([]);
  });

  it('sets escaped tildes literally', () => {
    const spans = parseInlineFormatting('\\~\\~not struck\\~\\~');
    expect(text(spans)).toBe('~~not struck~~');
    expect(struck(spans)).toEqual([]);
  });

  it('leaves tildes in inline code and in a link destination alone', () => {
    const [block] = parseMarkdown('`~~code~~` and [home](https://example.org/~~a~~)');
    expect(struck(block!.spans)).toEqual([]);
    expect(block!.text).toContain('~~code~~');
  });

  it('stripInlineFormatting drops the markers before the subscripts', () => {
    expect(stripInlineFormatting('~~H~2~O~~ and ~~€ 165,–~~')).toBe('H2O and € 165,–');
  });

  it('maps every character of a block back to its source', () => {
    const md = 'Price ~~€ 165,–~~ now **€ 129,–**.';
    const [block] = parseMarkdown(md);
    expect(block!.text).toBe('Price € 165,– now € 129,–.');
    const { text: t, sourceMap } = block!;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === ' ') continue;
      expect(md[sourceMap[i]!]).toBe(t[i]);
    }
  });

  it('strikes the text of a heading and of a table cell', () => {
    const blocks = parseMarkdown('# A ~~struck~~ heading\n\n| Item | Price |\n| --- | --- |\n| Widget A | ~~€ 165~~ € 129 |\n');
    expect(struck(blocks[0]!.spans)).toEqual(['struck']);
  });
});
