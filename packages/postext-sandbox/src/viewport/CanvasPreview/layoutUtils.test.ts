import { describe, expect, it } from 'vitest';
import { groupPagesIntoRows } from './layoutUtils';

describe('groupPagesIntoRows', () => {
  it('lists every page on its own row in single mode', () => {
    expect(groupPagesIntoRows(3, 'single')).toEqual([[0], [1], [2]]);
  });

  it('starts a recto-opening document with its first page alone', () => {
    expect(groupPagesIntoRows(5, 'spread')).toEqual([[0], [1, 2], [3, 4]]);
    expect(groupPagesIntoRows(4, 'spread', true)).toEqual([[0], [1, 2], [3]]);
  });

  it('fills both slots of the first spread for a verso-opening document', () => {
    expect(groupPagesIntoRows(5, 'spread', false)).toEqual([[0, 1], [2, 3], [4]]);
    expect(groupPagesIntoRows(4, 'spread', false)).toEqual([[0, 1], [2, 3]]);
  });

  it('handles an empty document', () => {
    expect(groupPagesIntoRows(0, 'spread')).toEqual([]);
    expect(groupPagesIntoRows(0, 'spread', false)).toEqual([]);
  });
});
