import { describe, expect, it } from 'vitest';
import { addTitle, moveTitle, patchTitle, removeTitle, setVolume } from './collection.js';

// #1673: the collection's catalogue and this book's volume.

describe('the collection’s catalogue', () => {
  it('adds titles with free ids, moves and removes them', () => {
    let c = addTitle(undefined, { title: 'One' });
    c = addTitle(c, { title: 'Two', resource: 'pic-2' });
    c = addTitle(c, { id: 'vol-1', title: 'Three' });
    expect(c.catalogue!.map((e) => e.id)).toEqual(['vol-1', 'vol-2', 'vol-3']);
    expect(c.catalogue![1]).toEqual({ id: 'vol-2', title: 'Two', resource: 'pic-2' });
    c = moveTitle(c, 'vol-3', -1);
    expect(c.catalogue!.map((e) => e.title)).toEqual(['One', 'Three', 'Two']);
    expect(moveTitle(c, 'vol-1', -1).catalogue).toEqual(c.catalogue);
    c = removeTitle(c, 'vol-1');
    expect(c.catalogue!.map((e) => e.title)).toEqual(['Three', 'Two']);
  });

  it('keeps the volume on a title, carries it on a rename and drops it with the title', () => {
    let c = addTitle(addTitle({ name: 'Series' }, { title: 'A' }), { title: 'B' });
    expect(setVolume(c, 'nope').volume).toBeUndefined();
    c = setVolume(c, 'vol-2');
    expect(c.volume).toBe('vol-2');
    c = patchTitle(c, 'vol-2', { id: 'b-book' });
    expect(c.volume).toBe('b-book');
    // An invalid or taken id is not written.
    expect(patchTitle(c, 'b-book', { id: 'vol 1' }).catalogue![1]!.id).toBe('b-book');
    expect(patchTitle(c, 'b-book', { id: 'vol-1' }).catalogue![1]!.id).toBe('b-book');
    expect(patchTitle(c, 'b-book', { resource: '' }).catalogue![1]).toEqual({ id: 'b-book', title: 'B' });
    c = removeTitle(c, 'b-book');
    expect(c.volume).toBeUndefined();
    expect(c.name).toBe('Series');
  });
});
