import { describe, expect, it } from 'vitest';
import {
  bookHasCover,
  coverTargetKey,
  coverTargetOf,
  coverToCapture,
  presetCoverFor,
  presetCoverKey,
  thumbnailIfMissing,
  type CoverStateSlice,
} from './autoCover';

function state(over: Partial<CoverStateSlice> = {}): CoverStateSlice {
  return {
    storeReady: true,
    booting: false,
    bookLoading: false,
    activeProjectId: null,
    activePresetId: 'deep-sky',
    presetApplied: { presetId: 'deep-sky', locale: 'en' },
    projects: [{ id: 'p1' }, { id: 'p2', thumbnail: { fileId: 'f', mime: 'image/jpeg' } }],
    presetSummaries: [{ id: 'deep-sky' }, { id: 'guide', thumbnailUrl: 'data:image/svg+xml,…' }],
    presetCovers: {},
    ...over,
  };
}

describe('coverTargetOf', () => {
  it('names the project or the preset in its locale on screen', () => {
    expect(coverTargetOf(state({ activeProjectId: 'p1' }))).toEqual({ kind: 'project', id: 'p1' });
    expect(coverTargetOf(state())).toEqual({ kind: 'preset', id: 'deep-sky', locale: 'en' });
  });

  it('waits while no book is settled', () => {
    expect(coverTargetOf(state({ storeReady: false }))).toBeNull();
    expect(coverTargetOf(state({ booting: true }))).toBeNull();
    expect(coverTargetOf(state({ bookLoading: true }))).toBeNull();
    expect(coverTargetOf(state({ presetApplied: { presetId: 'other', locale: 'en' } }))).toBeNull();
  });
});

describe('coverToCapture', () => {
  it('captures a book without a cover once per session', () => {
    const attempted = new Set<string>();
    const s = state({ activeProjectId: 'p1' });
    const target = coverToCapture(s, attempted);
    expect(target).toEqual({ kind: 'project', id: 'p1' });
    attempted.add(coverTargetKey(target!));
    expect(coverToCapture(s, attempted)).toBeNull();
  });

  it('never replaces an existing cover', () => {
    const none = new Set<string>();
    // A project with a cover (picked, from a bundle or captured earlier).
    expect(coverToCapture(state({ activeProjectId: 'p2' }), none)).toBeNull();
    // A preset that ships a thumbnail.
    expect(coverToCapture(state({ activePresetId: 'guide', presetApplied: { presetId: 'guide', locale: 'en' } }), none)).toBeNull();
    // A preset whose cover was generated in this locale.
    expect(coverToCapture(state({ presetCovers: { [presetCoverKey('deep-sky', 'en')]: 'data:x' } }), none)).toBeNull();
  });

  it('keeps a cover per book: other locales and other books still get theirs', () => {
    const none = new Set<string>();
    const covers = { [presetCoverKey('deep-sky', 'en')]: 'data:en' };
    expect(coverToCapture(state({ presetCovers: covers, presetApplied: { presetId: 'deep-sky', locale: 'es' } }), none))
      .toEqual({ kind: 'preset', id: 'deep-sky', locale: 'es' });
    const attempted = new Set([coverTargetKey({ kind: 'project', id: 'p1' })]);
    expect(coverToCapture(state(), attempted)).toEqual({ kind: 'preset', id: 'deep-sky', locale: 'en' });
  });

  it('treats an unknown book as covered', () => {
    expect(bookHasCover(state(), { kind: 'project', id: 'gone' })).toBe(true);
    expect(bookHasCover(state(), { kind: 'preset', id: 'gone', locale: 'en' })).toBe(true);
  });
});

describe('thumbnailIfMissing', () => {
  it('sets the cover only on a record without one', () => {
    const cover = { fileId: 'auto', mime: 'image/jpeg' };
    expect(thumbnailIfMissing({}, cover)).toEqual({ thumbnail: cover });
    expect(thumbnailIfMissing({ thumbnail: { fileId: 'mine', mime: 'image/png' } }, cover)).toBeNull();
  });
});

describe('presetCoverFor', () => {
  const covers = {
    [presetCoverKey('don-quijote', 'es')]: 'data:es',
    [presetCoverKey('don-quijote', 'en')]: 'data:en',
    [presetCoverKey('senales', 'es')]: 'data:senales',
  };

  it('prefers the locale the row opens in', () => {
    expect(presetCoverFor(covers, 'don-quijote', 'en')).toBe('data:en');
    expect(presetCoverFor(covers, 'don-quijote', 'es')).toBe('data:es');
  });

  it('falls back to the same language, then to any locale of the preset', () => {
    expect(presetCoverFor(covers, 'don-quijote', 'en-GB')).toBe('data:en');
    expect(presetCoverFor(covers, 'senales', 'en')).toBe('data:senales');
    expect(presetCoverFor(covers, 'deep-sky', 'en')).toBeUndefined();
  });
});
