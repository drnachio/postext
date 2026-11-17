// #1617: the background paginator pauses for the reader, not between its
// own chapters.

import { describe, expect, it } from 'vitest';
import { followsLanding } from './paginatorPace.js';

const a = { key: 'a|c1|o1', markdown: 'A' };
const b = { key: 'b|c1|o1', markdown: 'B' };

describe('followsLanding', () => {
  it('holds when the chapter that landed gives way to the next one', () => {
    expect(followsLanding(a.key, a, b)).toBe(true);
  });

  it('holds when the last chapter landed and nothing is pending', () => {
    expect(followsLanding(a.key, a, null)).toBe(true);
  });

  it('holds when the same chapter is pending again with what it inherits changed', () => {
    expect(followsLanding(a.key, a, { key: 'a|c2|o1', markdown: 'A' })).toBe(true);
  });

  it('does not hold without a landing', () => {
    expect(followsLanding(null, a, b)).toBe(false);
    expect(followsLanding(null, null, a)).toBe(false);
  });

  it('does not hold for the text of the pending chapter changing', () => {
    expect(followsLanding(a.key, a, { key: a.key, markdown: 'A, edited' })).toBe(false);
  });

  it('does not hold for a change that started from another chapter', () => {
    expect(followsLanding(a.key, b, a)).toBe(false);
    expect(followsLanding(a.key, null, b)).toBe(false);
  });
});
