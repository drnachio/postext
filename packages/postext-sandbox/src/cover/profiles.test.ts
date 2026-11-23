import { describe, expect, it } from 'vitest';
import { BUILT_IN_BINDING_PROFILES, DEFAULT_BINDING_MEASURES } from 'postext/production';
import { addBinding, addPaper, MEASURE_GROUPS, mergeProfiles, removeBinding, removePaper, setMeasure, updateBinding, updatePaper, versionsBoundWith } from './profiles.js';

describe('printer profiles', () => {
  it('lists every measure once', () => {
    const keys = MEASURE_GROUPS.flatMap((g) => g.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_BINDING_MEASURES.perfect).sort());
  });

  it('copies a profile under a free id, edits and removes it', () => {
    const perfect = BUILT_IN_BINDING_PROFILES[0]!;
    const a = addBinding(undefined, perfect, 'My printer');
    expect(a.id).toBe('perfect-own');
    const b = addBinding(a.production, perfect, 'Again');
    expect(b.id).toBe('perfect-own-2');
    let p = updateBinding(b.production, 'perfect-own', { printer: 'Gráficas', ...setMeasure(perfect, 'bleed', 5) });
    expect(p?.bindings?.[0]).toMatchObject({ name: 'My printer', printer: 'Gráficas', measures: { bleed: 5 }, style: 'perfect' });
    p = updateBinding(p, 'perfect-own', setMeasure({ ...perfect, measures: { bleed: 5 } }, 'bleed', undefined));
    expect(p?.bindings?.[0]?.measures).toBeUndefined();
    p = removeBinding(removeBinding(p, 'perfect-own'), 'perfect-own-2');
    expect(p).toBeUndefined();
  });

  it('names the versions bound with a profile', () => {
    expect(versionsBoundWith({ versions: [{ id: 'pb', name: 'Paperback', binding: 'mine' }, { id: 'hc', name: 'Hard', binding: 'case-flat' }] }, 'mine')).toEqual(['Paperback']);
  });

  it('adds, edits and removes papers, and merges a file\'s profiles over the book\'s', () => {
    const a = addPaper({ versions: [] }, 'Cream 80');
    let p = updatePaper(a.production, a.id, { grammage: 90, supplier: undefined, bulk: 1.3 });
    expect(p?.papers?.[0]).toMatchObject({ id: 'paper', name: 'Cream 80', grammage: 90, bulk: 1.3 });
    p = mergeProfiles(p, [{ id: 'paper', name: 'Theirs' }], []);
    expect(p?.papers).toEqual([{ id: 'paper', name: 'Theirs' }]);
    expect(removePaper(p, 'paper')).toEqual({ versions: [] });
  });
});
