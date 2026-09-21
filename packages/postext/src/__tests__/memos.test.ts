import { describe, it, expect } from 'vitest';
import { parseMarkdownMemo, parseMarkdownWithIssuesMemo, PARSE_MEMO_CAPACITY } from '../parse/blockParser';
import { resolveAllConfig } from '../pipeline/config';
import type { PostextConfig } from '../types';

describe('parseMarkdownMemo', () => {
  it('returns the same blocks for the same input', () => {
    const md = '# Title\n\nA paragraph.\n';
    expect(parseMarkdownMemo(md)).toBe(parseMarkdownMemo(md));
    expect(parseMarkdownWithIssuesMemo(md).blocks).toBe(parseMarkdownMemo(md));
  });

  it('keeps the last few inputs, so interleaved chapters do not re-parse', () => {
    const a = parseMarkdownMemo('# A\n\nalpha\n');
    const b = parseMarkdownMemo('# B\n\nbeta\n');
    expect(parseMarkdownMemo('# A\n\nalpha\n')).toBe(a);
    expect(parseMarkdownMemo('# B\n\nbeta\n')).toBe(b);
  });

  it('evicts the least recently used input past its capacity', () => {
    const first = parseMarkdownMemo('# first\n');
    for (let i = 0; i < PARSE_MEMO_CAPACITY; i++) parseMarkdownMemo(`# filler ${i}\n`);
    expect(parseMarkdownMemo('# first\n')).not.toBe(first);
  });
});

describe('resolveAllConfig', () => {
  it('resolves a config object once', () => {
    const config: PostextConfig = { bodyText: { textAlign: 'left' } };
    expect(resolveAllConfig(config)).toBe(resolveAllConfig(config));
    expect(resolveAllConfig(undefined)).toBe(resolveAllConfig(undefined));
  });

  it('resolves distinct objects separately', () => {
    const a = resolveAllConfig({ bodyText: { textAlign: 'left' } });
    const b = resolveAllConfig({ bodyText: { textAlign: 'justify' } });
    expect(a).not.toBe(b);
    expect(a.bodyText.textAlign).toBe('left');
    expect(b.bodyText.textAlign).toBe('justify');
  });
});
