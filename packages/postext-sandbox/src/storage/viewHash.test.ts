import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_VIEW_HASH, isViewportTab, parseViewHash, pdfPageFragment, readViewHash, sameBook, viewHashFragment, writeViewHash } from './viewHash';

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
    expect(parseViewHash('#preset=x&lang=PT-br')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'x', lang: 'pt-BR' });
    expect(parseViewHash('#preset=x&lang=e s&view=print')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'x' });
    expect(parseViewHash('#preset=&view=html')).toEqual({ ...EMPTY_VIEW_HASH, view: 'html' });
    expect(parseViewHash('#preset=don-quijote&view=folio')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'don-quijote', view: 'folio' });
    expect(parseViewHash('#preset=don-quijote&view=epub')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'don-quijote', view: 'epub' });
    // Encoded ids come back decoded.
    expect(parseViewHash('#preset=libro%2Funo')).toEqual({ ...EMPTY_VIEW_HASH, preset: 'libro/uno' });
  });

  it('knows the five viewer tabs and nothing else', () => {
    for (const view of ['canvas', 'pdf', 'folio', 'html', 'epub']) expect(isViewportTab(view)).toBe(true);
    for (const view of ['print', 'EPUB', 'epub3', '', null, undefined]) expect(isViewportTab(view)).toBe(false);
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
    expect(viewHashFragment({ project: 'p1', view: 'epub', chapter: 0 })).toBe('#project=p1&view=epub&chapter=1');
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

  // #198: a Chinese edition named by a mixed-case tag.
  it('keeps the canonical case of a locale tag and compares tags case aside', () => {
    expect(parseViewHash('#preset=hongloumeng&lang=zh-Hant').lang).toBe('zh-Hant');
    expect(parseViewHash('#preset=hongloumeng&lang=zh-hant').lang).toBe('zh-Hant');
    expect(parseViewHash('#preset=hongloumeng&lang=ZH-tw').lang).toBe('zh-TW');
    expect(parseViewHash('#preset=hongloumeng&lang=zh-hans-cn').lang).toBe('zh-Hans-CN');
    expect(parseViewHash('#preset=x&lang=zh-').lang).toBeNull();
    const wanted = parseViewHash('#preset=hongloumeng&lang=zh-Hant');
    expect(sameBook(wanted, { preset: 'hongloumeng', project: null, lang: 'zh-Hant' })).toBe(true);
    expect(sameBook({ ...wanted, lang: 'zh-hant' }, { preset: 'hongloumeng', project: null, lang: 'zh-Hant' })).toBe(true);
    expect(sameBook(wanted, { preset: 'hongloumeng', project: null, lang: 'zh-Hans' })).toBe(false);
    expect(viewHashFragment(wanted)).toBe('#preset=hongloumeng&lang=zh-Hant');
  });

  it('reads a Japanese edition named in any case', () => {
    expect(parseViewHash('#preset=kokoro&lang=ja').lang).toBe('ja');
    expect(parseViewHash('#preset=kokoro&lang=JA-jp&view=pdf').lang).toBe('ja-JP');
    const wanted = parseViewHash('#preset=kokoro&lang=ja');
    expect(sameBook(wanted, { preset: 'kokoro', project: null, lang: 'JA' })).toBe(true);
    expect(sameBook(wanted, { preset: 'kokoro', project: null, lang: 'zh-Hant' })).toBe(false);
    expect(viewHashFragment(wanted)).toBe('#preset=kokoro&lang=ja');
  });

  it('builds the PDF viewer fragment', () => {
    expect(pdfPageFragment(null)).toBe('');
    expect(pdfPageFragment(2)).toBe('#page=3');
  });
});

describe('parseHashBundle / hashNamesOtherBook', () => {
  it('reads a host key with its id and lang', async () => {
    const { parseHashBundle, hashBundleOrigin } = await import('./viewHash');
    const ref = parseHashBundle('#recipe=magazine-feature-opener&lang=ES&view=pdf', ['recipe']);
    expect(ref).toEqual({ key: 'recipe', id: 'magazine-feature-opener', lang: 'es' });
    expect(hashBundleOrigin(ref!)).toBe('recipe:magazine-feature-opener:es');
    // A regional tag keeps its canonical case; the origin stays lower-case.
    const us = parseHashBundle('#recipe=x&lang=en-us', ['recipe']);
    expect(us?.lang).toBe('en-US');
    expect(hashBundleOrigin(us!)).toBe('recipe:x:en-us');
    expect(parseHashBundle('#recipe=x', ['recipe'])).toEqual({ key: 'recipe', id: 'x', lang: null });
    expect(parseHashBundle('#preset=x', ['recipe'])).toBeNull();
    // Reserved and malformed keys are never host keys.
    expect(parseHashBundle('#preset=x', ['preset'])).toBeNull();
    expect(parseHashBundle('#Recipe=x', ['Recipe'])).toBeNull();
    expect(parseHashBundle('#recipe=a b', ['recipe'])).toBeNull();
  });

  it('boots straight into a linked book that is not the stored one', async () => {
    const { hashNamesOtherBook } = await import('./viewHash');
    const stored = { projectId: null, presetId: 'guide', presetLocale: 'es' };
    expect(hashNamesOtherBook({ preset: null, project: null, lang: null }, stored, null)).toBe(false);
    expect(hashNamesOtherBook({ preset: 'guide', project: null, lang: 'es' }, stored, null)).toBe(false);
    expect(hashNamesOtherBook({ preset: 'guide', project: null, lang: null }, stored, null)).toBe(false);
    expect(hashNamesOtherBook({ preset: 'guide', project: null, lang: 'en' }, stored, null)).toBe(true);
    expect(hashNamesOtherBook({ preset: 'emp', project: null, lang: null }, stored, null)).toBe(true);
    expect(hashNamesOtherBook({ preset: null, project: 'p1', lang: null }, stored, null)).toBe(true);
    expect(hashNamesOtherBook({ preset: null, project: 'p1', lang: null }, { ...stored, projectId: 'p1' }, null)).toBe(false);
    expect(hashNamesOtherBook({ preset: 'guide', project: null, lang: null }, { ...stored, projectId: 'p1' }, null)).toBe(true);
    expect(hashNamesOtherBook({ preset: null, project: null, lang: null }, stored, { key: 'recipe', id: 'x', lang: null })).toBe(true);
    // Tags compare case aside; another script is another book.
    const chinese = { projectId: null, presetId: 'hlm', presetLocale: 'zh-Hant' };
    expect(hashNamesOtherBook({ preset: 'hlm', project: null, lang: 'zh-hant' }, chinese, null)).toBe(false);
    expect(hashNamesOtherBook({ preset: 'hlm', project: null, lang: 'zh-Hans' }, chinese, null)).toBe(true);
  });
});
