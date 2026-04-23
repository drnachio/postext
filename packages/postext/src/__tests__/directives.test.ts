import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseDirectiveAttrs } from '../parse/blockParser';

describe('parseDirectiveAttrs', () => {
  it('parses double-quoted values', () => {
    expect(parseDirectiveAttrs('format="decimal"')).toEqual({ format: 'decimal' });
  });
  it('parses single-quoted values', () => {
    expect(parseDirectiveAttrs("format='lower-roman'")).toEqual({ format: 'lower-roman' });
  });
  it('parses bare values', () => {
    expect(parseDirectiveAttrs('startAt=1')).toEqual({ startAt: '1' });
  });
  it('parses multiple attributes', () => {
    expect(parseDirectiveAttrs('format="decimal" startAt=17')).toEqual({
      format: 'decimal',
      startAt: '17',
    });
  });
  it('parses bare flag as empty string', () => {
    const out = parseDirectiveAttrs('flag');
    expect(out.flag).toBe('');
  });
});

describe('parseMarkdown directives', () => {
  it('recognizes :::pagebreak', () => {
    const blocks = parseMarkdown(':::pagebreak\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('directive');
    expect(blocks[0]!.directiveName).toBe('pagebreak');
    expect(blocks[0]!.directiveAttrs).toEqual({});
  });

  it('recognizes :::pagebreak{parity="odd"}', () => {
    const blocks = parseMarkdown(':::pagebreak{parity="odd"}\n');
    expect(blocks[0]!.directiveName).toBe('pagebreak');
    expect(blocks[0]!.directiveAttrs).toEqual({ parity: 'odd' });
  });

  it('recognizes :::numbering{format="decimal" startAt=1}', () => {
    const blocks = parseMarkdown(':::numbering{format="decimal" startAt=1}\n');
    expect(blocks[0]!.directiveName).toBe('numbering');
    expect(blocks[0]!.directiveAttrs).toEqual({ format: 'decimal', startAt: '1' });
  });

  it('unknown directive name falls through to paragraph', () => {
    const blocks = parseMarkdown(':::nosuch\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('paragraph');
  });

  it('directive surrounded by content', () => {
    const md = 'Before\n\n:::pagebreak\n\nAfter\n';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'directive', 'paragraph']);
  });
});
