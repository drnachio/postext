import { describe, expect, it } from 'vitest';
import { blankFrontmatter, frontmatterRange } from './frontmatter';

describe('frontmatterRange', () => {
  it('finds a leading block and its end (newline included)', () => {
    const md = '---\ntitle: X\n---\n# H\n';
    expect(frontmatterRange(md)).toEqual({ end: 17 });
  });
  it('returns null when the document does not start with ---', () => {
    expect(frontmatterRange('# H\n---\n')).toBeNull();
    expect(frontmatterRange('')).toBeNull();
    expect(frontmatterRange('----\nx\n---\n')).toBeNull();
  });
  it('returns null for an unclosed block', () => {
    expect(frontmatterRange('---\ntitle: X\n')).toBeNull();
  });
  it('handles a block that ends at EOF without newline', () => {
    expect(frontmatterRange('---\na: 1\n---')).toEqual({ end: 12 });
  });
});

describe('blankFrontmatter', () => {
  it('keeps length and newlines, blanks everything else in the block', () => {
    const md = '---\ntitle: X\n---\n# H\n';
    const out = blankFrontmatter(md);
    expect(out).toHaveLength(md.length);
    expect(out).toBe('   \n        \n   \n# H\n');
  });
  it('leaves text without front matter untouched', () => {
    expect(blankFrontmatter('# H')).toBe('# H');
  });
});
