import { describe, it, expect } from 'vitest';
import { parseMarkdownWithIssues, MATH_PLACEHOLDER } from '../parse';

describe('math parsing', () => {
  it('extracts inline math', () => {
    const { blocks, issues } = parseMarkdownWithIssues('Euler identity: $e^{i\\pi}+1=0$ is lovely.');
    expect(issues).toHaveLength(0);
    expect(blocks).toHaveLength(1);
    const p = blocks[0]!;
    expect(p.type).toBe('paragraph');
    const mathSpans = p.spans.filter((s) => s.math);
    expect(mathSpans).toHaveLength(1);
    expect(mathSpans[0]!.text).toBe(MATH_PLACEHOLDER);
    expect(mathSpans[0]!.math!.tex).toBe('e^{i\\pi}+1=0');
  });

  it('treats $$…$$ on its own line as a display block', () => {
    const { blocks } = parseMarkdownWithIssues('Intro.\n\n$$\\int_0^1 x^2 dx$$\n\nOutro.');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'mathDisplay', 'paragraph']);
    expect(blocks[1]!.tex).toBe('\\int_0^1 x^2 dx');
  });

  it('honours \\$ as literal dollar sign', () => {
    const { blocks, issues } = parseMarkdownWithIssues('Costs \\$5 for $x$ items.');
    expect(issues).toHaveLength(0);
    const p = blocks[0]!;
    const mathSpans = p.spans.filter((s) => s.math);
    expect(mathSpans).toHaveLength(1);
    expect(mathSpans[0]!.math!.tex).toBe('x');
    expect(p.text).toContain('$5'); // literal dollar preserved
  });

  it('reports unclosed inline math', () => {
    const { blocks, issues } = parseMarkdownWithIssues('See $x + y for the result.');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe('unclosedMath');
    expect(issues[0]!.delimiter).toBe('$');
    expect(blocks).toHaveLength(1);
  });

  it('handles adjacent inline math', () => {
    const { blocks, issues } = parseMarkdownWithIssues('$a$ and $b$ together');
    expect(issues).toHaveLength(0);
    const mathSpans = blocks[0]!.spans.filter((s) => s.math);
    expect(mathSpans.map((s) => s.math!.tex)).toEqual(['a', 'b']);
  });

  it('multi-line display math with fenced $$ on their own lines', () => {
    const { blocks, issues } = parseMarkdownWithIssues('$$\n\\sum_{i=0}^{n} i\n$$');
    expect(issues).toHaveLength(0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('mathDisplay');
    expect(blocks[0]!.tex).toBe('\\sum_{i=0}^{n} i');
  });

  it('preserves per-char source mapping for inline math', () => {
    const md = 'ab $x$ cd';
    const { blocks } = parseMarkdownWithIssues(md);
    const p = blocks[0]!;
    const placeholderIdx = p.text.indexOf(MATH_PLACEHOLDER);
    expect(placeholderIdx).toBeGreaterThanOrEqual(0);
    // The source map entry at the placeholder should point at the opening `$`.
    expect(p.sourceMap[placeholderIdx]).toBe(md.indexOf('$'));
  });

  it('keeps source mapping aligned for plain chars after inline math', () => {
    const md = 'ab $x$ cd';
    const { blocks } = parseMarkdownWithIssues(md);
    const p = blocks[0]!;
    // Plain text is `ab \uFFFC cd`. Each char after the placeholder must point
    // at its real source offset, not collapse to blockSrcEnd — otherwise any
    // selection that touches post-math source offsets snaps to the end of the
    // block and engulfs the whole tail.
    const spaceAfterMath = p.text.indexOf(MATH_PLACEHOLDER) + 1;
    expect(p.sourceMap[spaceAfterMath]).toBe(md.indexOf(' cd'));
    expect(p.sourceMap[spaceAfterMath + 1]).toBe(md.indexOf('cd'));
    expect(p.sourceMap[spaceAfterMath + 2]).toBe(md.indexOf('cd') + 1);
  });
});
