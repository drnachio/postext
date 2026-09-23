import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_VIEW_HASH, parseViewHash, pdfPageFragment, readViewHash, sameBook, viewHashFragment, writeViewHash } from './viewHash';

// Minimal window stand-in: the helpers only touch `location` and
// `history.replaceState`.
function installWindow(hash: string) {
  const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
    const w = (globalThis as { window: { location: object } }).window;
    (globalThis as { window?: unknown }).window = { ...w, location: { ...w.location, hash: url.startsWith('#') ? url : '' } };
  });
  (globalThis as { window?: unknown }).window = {
    location: { hash, pathname: '/sandbox', search: '' },
    history: { state: null, replaceState },
  };
  return replaceState;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('view hash', () => {
  it('reads the 1-based chapter as a 0-based index, the page as its number, and rejects junk', () => {
    installWindow('#chapter=2&page=3');
    expect(readViewHash()).toEqual({ ...EMPTY_VIEW_HASH, chapter: 1, page: 3 });
    installWindow('#page=27');
    expect(readViewHash()).toEqual({ ...EMPTY_VIEW_HASH, page: 27 });
    installWindow('#chapter=0&page=0');
    expect(readViewHash()).toEqual(EMPTY_VIEW_HASH);
    installWindow('#chapter=1.5&page=x');
    expect(readViewHash()).toEqual(EMPTY_VIEW_HASH);
    installWindow('#other=1');
    expect(readViewHash()).toEqual(EMPTY_VIEW_HASH);
    installWindow('');
    expect(readViewHash()).toEqual(EMPTY_VIEW_HASH);
  });

  it('reads the book (a preset in a locale, or a project) and the viewer tab', () => {
    expect(parseViewHash('#preset=bioquimica-feduchi&lang=es&view=canvas&chapter=1&page=7')).toEqual({
      preset: 'bioquimica-feduchi', project: null, lang: 'es', view: 'canvas', chapter: 0, page: 7,
    });
    expect(parseViewHash('#project=3f2a1c4e-9b7d-4a10-8c2e-5d6f7a8b9c0d&view=pdf&chapter=3')).toEqual({
      ...EMPTY_VIEW_HASH, project: '3f2a1c4e-9b7d-4a10-8c2e-5d6f7a8b9c0d', view: 'pdf', chapter: 2,
    });
    // A locale belongs to a preset; a project carries its own.
    expect(parseViewHash('#project=p1&lang=es')).toEqual({ ...EMPTY_VIEW_HASH, project: 'p1' });
    // Both named: the project wins.
    expect(parseViewHash('#preset=x&project=p1')).toEqual({ ...EMPTY_VIEW_HASH, project: 'p1' });
    // Locale tags are normalised; junk is dropped.
    expect(parseViewHash('#preset=x&lang=PT-br')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'x', lang: 'pt-br' });
    expect(parseViewHash('#preset=x&lang=e s&view=print')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'x' });
    expect(parseViewHash('#preset=&view=html')).toEqual({ ...EMPTY_VIEW_HASH, view: 'html' });
    // Encoded ids come back decoded.
    expect(parseViewHash('#preset=libro%2Funo')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'libro/uno' });
  });

  it('builds the fragment, leaving unknown parts out, the book first', () => {
    expect(viewHashFragment({ chapter: 1, page: 27 })).toBe('#chapter=2&page=27');
    expect(viewHashFragment({ chapter: null, page: 3 })).toBe('#page=3');
    expect(viewHashFragment({ chapter: 1, page: null })).toBe('#chapter=2');
    expect(viewHashFragment({ chapter: null, page: null })).toBe('');
    expect(viewHashFragment({ preset: 'bioquimica-feduchi', lang: 'es', view: 'canvas', chapter: 0, page: 7 }))
      .toBe('#preset=bioquimica-feduchi&lang=es&view=canvas&chapter=1&page=7');
    // A project's fragment carries no locale; a preset is not named beside it.
    expect(viewHashFragment({ project: 'p1', preset: 'x', lang: 'es', view: 'html' })).toBe('#project=p1&view=html');
    expect(viewHashFragment({ preset: 'libro/uno' })).toBe('#preset=libro%2Funo');
  });

  it('writes the fragment without a history entry and skips no-op writes', () => {
    const replaceState = installWindow('#chapter=1&page=3');
    writeViewHash({ chapter: 0, page: 3 });
    expect(replaceState).not.toHaveBeenCalled();
    writeViewHash({ chapter: 2, page: 6 });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#chapter=3&page=6');
    expect(readViewHash()).toEqual({ ...EMPTY_VIEW_HASH, chapter: 2, page: 6 });
  });

  it('changes only the parts given: the page keeps the book, the book keeps the page', () => {
    installWindow('#preset=don-quijote&lang=es&view=canvas&chapter=2&page=15');
    writeViewHash({ chapter: 2, page: 16 });
    expect((globalThis as { window: { location: { hash: string } } }).window.location.hash)
      .toBe('#preset=don-quijote&lang=es&view=canvas&chapter=3&page=16');
    writeViewHash({ preset: null, project: 'p1', lang: null });
    expect((globalThis as { window: { location: { hash: string } } }).window.location.hash)
      .toBe('#project=p1&view=canvas&chapter=3&page=16');
    writeViewHash({ view: 'pdf' });
    expect(readViewHash()).toEqual({ preset: null, project: 'p1', lang: null, view: 'pdf', chapter: 2, page: 16 });
  });

  it('clears the fragment through the page URL, not an empty string', () => {
    const replaceState = installWindow('#chapter=1&page=3');
    writeViewHash({ chapter: null, page: null });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/sandbox');
  });

  it('tells whether a fragment names the book on screen', () => {
    const onPreset = { preset: 'don-quijote', project: null, lang: 'es' };
    const onProject = { preset: null, project: 'p1', lang: null };
    // No book named: whatever is open.
    expect(sameBook({ preset: null, project: null, lang: null }, onPreset)).toBe(true);
    expect(sameBook({ preset: null, project: null, lang: null }, onProject)).toBe(true);
    // A preset, in any locale or a given one.
    expect(sameBook({ preset: 'don-quijote', project: null, lang: null }, onPreset)).toBe(true);
    expect(sameBook({ preset: 'don-quijote', project: null, lang: 'es' }, onPreset)).toBe(true);
    expect(sameBook({ preset: 'don-quijote', project: null, lang: 'en' }, onPreset)).toBe(false);
    expect(sameBook({ preset: 'deep-sky', project: null, lang: null }, onPreset)).toBe(false);
    expect(sameBook({ preset: 'don-quijote', project: null, lang: null }, onProject)).toBe(false);
    // A project.
    expect(sameBook({ preset: null, project: 'p1', lang: null }, onProject)).toBe(true);
    expect(sameBook({ preset: null, project: 'p2', lang: null }, onProject)).toBe(false);
    expect(sameBook({ preset: null, project: 'p1', lang: null }, onPreset)).toBe(false);
  });

  it('builds the PDF viewer fragment', () => {
    expect(pdfPageFragment(null)).toBe('');
    expect(pdfPageFragment(2)).toBe('#page=3');
  });
});
