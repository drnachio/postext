import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseDirectiveAttrs } from '../parse/blockParser';
import { buildDocument } from '../pipeline';
import { collectColumnGaps } from '../pipeline/columnBalancing';
import type { PostextConfig } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
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

  it('recognizes :::columnbreak', () => {
    const blocks = parseMarkdown(':::columnbreak\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('directive');
    expect(blocks[0]!.directiveName).toBe('columnbreak');
    expect(blocks[0]!.directiveAttrs).toEqual({});
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

describe(':::columnbreak placement', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const doubleCol: PostextConfig = {
    page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
    layout: { layoutType: 'double' },
  };
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      `Paragraph ${i} with enough words to consume vertical space and force the column to overflow.`,
    ).join('\n\n');

  it('advances to the next column', () => {
    const doc = buildDocument({ markdown: 'First.\n\n:::columnbreak\n\nSecond.' }, doubleCol);
    const page = doc.pages[0]!;
    expect(page.columns[0]!.blocks.map((b) => b.lines[0]!.text)).toEqual(['First.']);
    expect(page.columns[1]!.blocks.map((b) => b.lines[0]!.text)).toEqual(['Second.']);
    expect(page.columns[0]!.forcedBreak).toBe(true);
    expect(page.columns[1]!.forcedBreak).toBeUndefined();
  });

  it('is a no-op in an empty column', () => {
    const doc = buildDocument({ markdown: ':::columnbreak\n\nOnly.' }, doubleCol);
    expect(doc.pages).toHaveLength(1);
    const page = doc.pages[0]!;
    expect(page.columns[0]!.blocks).toHaveLength(1);
    expect(page.columns[1]!.blocks).toHaveLength(0);
    expect(page.columns[0]!.forcedBreak).toBeUndefined();
  });

  it('rolls onto a new page from the last column', () => {
    const doc = buildDocument({ markdown: 'A.\n\n:::columnbreak\n\nB.\n\n:::columnbreak\n\nC.' }, doubleCol);
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[1]!.columns[0]!.blocks[0]!.lines[0]!.text).toBe('C.');
  });

  it('a column ended by the directive is not balanced', () => {
    const doc = buildDocument({ markdown: `Short.\n\n:::columnbreak\n\n${filler(20)}` }, doubleCol);
    const page = doc.pages[0]!;
    expect(page.columns[0]!.forcedBreak).toBe(true);
    // The short column keeps its gap and is never proposed for stretching.
    const gaps = collectColumnGaps(doc, new Set());
    expect(gaps.some((g) => g.pageIndex === 0 && g.columnIndex === 0)).toBe(false);
  });
});
