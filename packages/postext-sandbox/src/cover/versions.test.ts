import { describe, expect, it } from 'vitest';
import { addVersion, bindingProfiles, freeVersionId, newVersion, removeVersion, setCollection, updateVersion, versionProfile } from './versions.js';

describe('production versions', () => {
  it('adds a paperback and a hardcover with free ids', () => {
    const pb = newVersion([], 'paperback', 'Paperback');
    let prod = addVersion(undefined, pb);
    const pb2 = newVersion(prod.versions!, 'paperback', 'Pocket');
    expect(pb2.id).toBe('pb-2');
    prod = addVersion(prod, newVersion(prod.versions!, 'hardcover', 'Hardcover'));
    expect(prod.versions!.map((v) => [v.id, v.binding])).toEqual([['pb', 'perfect'], ['hc', 'case-flat']]);
    expect(freeVersionId(prod.versions!, 'hc')).toBe('hc-2');
  });

  it('changes and removes fields, and drops an empty production', () => {
    const prod = addVersion(undefined, { id: 'pb', name: 'P', binding: 'perfect', isbn: '978' });
    const next = updateVersion(prod, 'pb', { isbn: undefined, flaps: true });
    expect(next!.versions![0]).toEqual({ id: 'pb', name: 'P', binding: 'perfect', flaps: true });
    expect(removeVersion(next, 'pb')).toBeUndefined();
  });

  it('keeps the collection apart from the versions', () => {
    const prod = setCollection(undefined, { name: 'Series' });
    expect(prod).toEqual({ collection: { name: 'Series' } });
    expect(setCollection(prod, { name: '' })).toBeUndefined();
  });

  it('finds a version\'s profile among the built-in and the book\'s own', () => {
    const own = { id: 'mine', name: 'Mine', style: 'perfect' as const };
    const prod = { bindings: [own], versions: [{ id: 'a', name: 'A', binding: 'mine' }, { id: 'b', name: 'B', binding: 'case-round' }] };
    expect(bindingProfiles(prod).map((b) => b.id)).toContain('mine');
    expect(versionProfile(prod, prod.versions[0]!)).toBe(own);
    expect(versionProfile(prod, prod.versions[1]!)?.style).toBe('caseRound');
  });
});
