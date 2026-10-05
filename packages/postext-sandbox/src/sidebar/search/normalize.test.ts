import { describe, expect, it } from 'vitest';
import { compileMatcher, matchRanges, matchesTokens, normalizeText, tokenize } from './normalize';

describe('normalizeText', () => {
  it('strips accents and lowercases while keeping the length', () => {
    expect(normalizeText('Márgen Ñ')).toBe('margen n');
    expect(normalizeText('Tamaño de página')).toHaveLength('Tamaño de página'.length);
  });
  it('maps a combining mark to a space so indices stay aligned', () => {
    const s = 'é'; // decomposed é
    expect(normalizeText(s)).toHaveLength(2);
  });
});

describe('tokenize', () => {
  it('splits on non-word characters and drops empties', () => {
    expect(tokenize('  pag  num ')).toEqual(['pag', 'num']);
    expect(tokenize('')).toEqual([]);
    expect(tokenize('h3')).toEqual(['h3']);
  });
});

describe('matchesTokens', () => {
  const n = normalizeText;
  it('matches every token as a word prefix, accent-insensitively', () => {
    expect(matchesTokens(n('Top Margin'), tokenize('marg'))).toBe(true);
    expect(matchesTokens(n('Margen superior'), tokenize('márgen'))).toBe(true);
    expect(matchesTokens(n('Page numbering: number format'), tokenize('pag num'))).toBe(true);
  });
  it('does not match mid-word', () => {
    expect(matchesTokens(n('Page'), tokenize('age'))).toBe(false);
  });
  it('requires all tokens', () => {
    expect(matchesTokens(n('Top Margin'), tokenize('margin bottom'))).toBe(false);
  });
  it('is true for an empty query', () => {
    expect(matchesTokens(n('anything'), [])).toBe(true);
  });
  it('matches heading level codes like h3', () => {
    expect(matchesTokens(n('H3'), tokenize('h3'))).toBe(true);
    expect(matchesTokens(n('H31'), tokenize('h3'))).toBe(true);
    expect(matchesTokens(n('Headings'), tokenize('h3'))).toBe(false);
  });
});

describe('matchRanges', () => {
  it('returns ranges in original indices, merged and sorted', () => {
    expect(matchRanges('Márgen superior', tokenize('sup marg'))).toEqual([[0, 4], [7, 10]]);
  });
  it('merges overlapping hits', () => {
    expect(matchRanges('Margin', tokenize('mar marg'))).toEqual([[0, 4]]);
  });
  it('is empty without tokens', () => {
    expect(matchRanges('Margin', [])).toEqual([]);
  });
});

describe('compileMatcher', () => {
  it('bundles tokens with a test function over normalized text', () => {
    const m = compileMatcher('Encabez');
    expect(m.tokens).toEqual(['encabez']);
    expect(m.test(normalizeText('Encabezado y pie'))).toBe(true);
    expect(m.test(normalizeText('Cuerpo'))).toBe(false);
  });
});

describe('Chinese and Japanese labels', () => {
  const n = normalizeText;
  it('keeps the voicing marks of kana, at the same length', () => {
    expect(n('ガ')).toBe('ガ');
    expect(n('ぱ')).toBe('ぱ');
    expect(n('ルビの位置')).toHaveLength(5);
    expect(matchesTokens(n('ガイド'), tokenize('カイド'))).toBe(false);
    expect(matchesTokens(n('はっぱ'), tokenize('はっは'))).toBe(false);
    expect(matchesTokens(n('ガイド'), tokenize('ガイ'))).toBe(true);
  });
  it('finds a word inside a label written without spaces', () => {
    expect(matchesTokens(n('ルビの位置'), tokenize('位置'))).toBe(true);
    expect(matchesTokens(n('ルビの位置'), tokenize('ルビ 位置'))).toBe(true);
    expect(matchesTokens(n('行取り（3行）'), tokenize('取り'))).toBe(true);
    expect(matchRanges('ルビの位置', tokenize('位置'))).toEqual([[3, 5]]);
    expect(matchesTokens(n('标点宽度'), tokenize('宽度'))).toBe(true);
    // Latin words still match from their start only.
    expect(matchesTokens(n('Ruby position 位置'), tokenize('osition'))).toBe(false);
  });
});
