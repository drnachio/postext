import { describe, it, expect } from 'vitest';
import { holdParseMemo, parseMarkdownMemo, parseMarkdownWithIssuesMemo, PARSE_MEMO_CAPACITY } from '../../parse/blockParser.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

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

  it('keeps every input while a build holds it, and its few slots after (#1604)', () => {
    const release = holdParseMemo();
    const nested = holdParseMemo();
    const held = parseMarkdownMemo('# held\n');
    for (let i = 0; i < PARSE_MEMO_CAPACITY * 3; i++) parseMarkdownMemo(`# held filler ${i}\n`);
    expect(parseMarkdownMemo('# held\n')).toBe(held);
    // A build inside another: the outer one still holds.
    nested();
    nested();
    for (let i = 0; i < PARSE_MEMO_CAPACITY * 3; i++) parseMarkdownMemo(`# held filler ${i}\n`);
    expect(parseMarkdownMemo('# held\n')).toBe(held);
    release();
    // Released: the most recent inputs stay, the rest are parsed afresh.
    const recent = parseMarkdownMemo('# held\n');
    expect(recent).toBe(held);
    for (let i = 0; i < PARSE_MEMO_CAPACITY; i++) parseMarkdownMemo(`# after ${i}\n`);
    expect(parseMarkdownMemo('# held\n')).not.toBe(held);
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
