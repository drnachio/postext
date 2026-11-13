// The Canvas's special-ink and die-line view (#1570): remembered per
// browser, the finishes cycling flat → sheen → map.

import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../../types/defaultLabels.js';
import { dieLinesOn, finishesView, nextFinishesView, resetSpecialInksViewForTests, setDieLines, setFinishesView } from './specialInksView.js';
import { finishesViewLabel } from './SpecialInksButtons.js';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

afterEach(() => {
  store.clear();
  resetSpecialInksViewForTests();
});

describe('the special inks view', () => {
  it('starts with no die lines and flat inks', () => {
    expect(dieLinesOn()).toBe(false);
    expect(finishesView()).toBe('flat');
  });

  it('remembers both in the browser', () => {
    setDieLines(true);
    setFinishesView('map');
    resetSpecialInksViewForTests();
    expect(dieLinesOn()).toBe(true);
    expect(finishesView()).toBe('map');
    setFinishesView('flat');
    setDieLines(false);
    expect(store.size).toBe(0);
  });

  it('ignores a stored view it does not know', () => {
    store.set('postext-sandbox:finishes', 'glitter');
    expect(finishesView()).toBe('flat');
  });

  it('cycles the finishes and names the one on', () => {
    expect(nextFinishesView('flat')).toBe('sheen');
    expect(nextFinishesView('sheen')).toBe('map');
    expect(nextFinishesView('map')).toBe('flat');
    expect(finishesViewLabel('sheen', DEFAULT_LABELS)).toBe('Special inks: with sheen');
  });
});
