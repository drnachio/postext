import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfPageFragment, readViewHash, viewHashFragment, writeViewHash } from './viewHash';

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
  it('reads 1-based chapter and page as 0-based indices and rejects junk', () => {
    installWindow('#chapter=2&page=3');
    expect(readViewHash()).toEqual({ chapter: 1, page: 2 });
    installWindow('#page=3');
    expect(readViewHash()).toEqual({ chapter: null, page: 2 });
    installWindow('#chapter=0&page=0');
    expect(readViewHash()).toEqual({ chapter: null, page: null });
    installWindow('#other=1');
    expect(readViewHash()).toEqual({ chapter: null, page: null });
    installWindow('');
    expect(readViewHash()).toEqual({ chapter: null, page: null });
  });

  it('builds the fragment, leaving unknown parts out', () => {
    expect(viewHashFragment({ chapter: 1, page: 2 })).toBe('#chapter=2&page=3');
    expect(viewHashFragment({ chapter: null, page: 2 })).toBe('#page=3');
    expect(viewHashFragment({ chapter: 1, page: null })).toBe('#chapter=2');
    expect(viewHashFragment({ chapter: null, page: null })).toBe('');
  });

  it('writes the fragment without a history entry and skips no-op writes', () => {
    const replaceState = installWindow('#chapter=1&page=3');
    writeViewHash({ chapter: 0, page: 2 });
    expect(replaceState).not.toHaveBeenCalled();
    writeViewHash({ chapter: 2, page: 5 });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#chapter=3&page=6');
    expect(readViewHash()).toEqual({ chapter: 2, page: 5 });
  });

  it('clears the fragment through the page URL, not an empty string', () => {
    const replaceState = installWindow('#chapter=1&page=3');
    writeViewHash({ chapter: null, page: null });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/sandbox');
  });

  it('builds the PDF viewer fragment', () => {
    expect(pdfPageFragment(null)).toBe('');
    expect(pdfPageFragment(2)).toBe('#page=3');
  });
});
