import { describe, it, expect } from 'vitest';
import { parseMarkdownWithIssues } from '../../parse/index.js';

// #1125: one-line directives (`:::toc`, `:::index`, `:::pagebreak`,
// `:::space`…) take no closing fence. A bare `:::` after one, with no `:::`
// container open, is dropped and reported instead of printed.
describe('a stray fence after a one-line directive', () => {
  it('is dropped and reported at the top level', () => {
    const md = ['# Contents', '', ':::toc', ':::', '', 'Text.'].join('\n');
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(blocks.some((b) => b.text.includes(':::'))).toBe(false);
    expect(blocks.filter((b) => b.type === 'directive').map((b) => b.directiveName)).toEqual(['toc']);
    const stray = issues.filter((x) => x.kind === 'strayFence');
    expect(stray).toHaveLength(1);
    expect(stray[0]).toMatchObject({ directiveName: 'toc', sourceStart: md.indexOf(':::\n') });
  });

  it('is found across blank lines and inside a composed page', () => {
    const md = ['::::page{template="t"}', '# Index', '', ':::index', '', ':::', '::::'].join('\n');
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(issues.map((x) => x.kind)).toEqual(['strayFence']);
    expect(blocks.some((b) => b.type === 'paragraph' && b.text.includes(':::'))).toBe(false);
  });

  it('still closes an open container, with no report', () => {
    const md = [':::callout{type="note"}', 'A note.', '', ':::space{lines=1}', ':::', '', 'After.'].join('\n');
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(issues).toEqual([]);
    expect(blocks.filter((b) => b.type === 'containerEnd')).toHaveLength(1);
    expect(blocks.at(-1)?.text).toBe('After.');
  });

  it('leaves a bare fence after other text alone', () => {
    const { blocks, issues } = parseMarkdownWithIssues(['Text.', '', ':::'].join('\n'));
    expect(issues).toEqual([]);
    expect(blocks.some((b) => b.text.includes(':::'))).toBe(true);
  });
});

// #1166: the directive pattern runs in linear time on a fence line with a
// long run of spaces before another character (CodeQL js/polynomial-redos).
describe('the directive pattern', () => {
  it('reads a fence line of many tabs without slowing down', () => {
    const md = [':::a' + '\t'.repeat(50_000) + 'X', ':::', '', 'Text.'].join('\n');
    const t = performance.now();
    parseMarkdownWithIssues(md);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
