import { describe, expect, it, vi } from 'vitest';
import { HashBundleError, isSameOriginUrl, openHashBundle, type OpenHashBundleDeps } from './hashBundle';

const ORIGIN = 'https://postext.dev';
const ref = { key: 'recipe', id: 'magazine-feature-opener', lang: 'es' };

function deps(over: Partial<OpenHashBundleDeps> = {}): OpenHashBundleDeps {
  return {
    resolve: (id, lang) => [`/cookbook/${id}/${lang}/${id}.postext`, `/cookbook/${id}/en/${id}.postext`],
    findProject: () => null,
    activate: vi.fn(async () => undefined),
    fetchBytes: vi.fn(async () => new ArrayBuffer(4)),
    importBytes: vi.fn(async () => 'project-new'),
    pageOrigin: ORIGIN,
    ...over,
  };
}

describe('isSameOriginUrl', () => {
  it('takes rooted paths and URLs on the page origin only', () => {
    expect(isSameOriginUrl('/cookbook/a/es/a.postext', ORIGIN)).toBe(true);
    expect(isSameOriginUrl(`${ORIGIN}/cookbook/a.postext`, ORIGIN)).toBe(true);
    expect(isSameOriginUrl('//evil.example/a.postext', ORIGIN)).toBe(false);
    expect(isSameOriginUrl('https://evil.example/a.postext', ORIGIN)).toBe(false);
    expect(isSameOriginUrl('javascript:alert(1)', ORIGIN)).toBe(false);
    expect(isSameOriginUrl('cookbook/a.postext', ORIGIN)).toBe(false);
    expect(isSameOriginUrl('/a\\b', ORIGIN)).toBe(false);
  });
});

describe('openHashBundle', () => {
  it('imports the bundle the first time, recording the link as its origin', async () => {
    const d = deps();
    const out = await openHashBundle(ref, d);
    expect(out).toEqual({ projectId: 'project-new', imported: true });
    expect(d.fetchBytes).toHaveBeenCalledWith('/cookbook/magazine-feature-opener/es/magazine-feature-opener.postext');
    expect(d.importBytes).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'magazine-feature-opener.postext', 'recipe:magazine-feature-opener:es');
  });

  it('opens the project imported before instead of importing again', async () => {
    const d = deps({ findProject: (origin) => (origin === 'recipe:magazine-feature-opener:es' ? 'project-old' : null) });
    const out = await openHashBundle(ref, d);
    expect(out).toEqual({ projectId: 'project-old', imported: false });
    expect(d.activate).toHaveBeenCalledWith('project-old');
    expect(d.fetchBytes).not.toHaveBeenCalled();
  });

  it('falls back to the next candidate when one is missing', async () => {
    const fetchBytes = vi.fn(async (url: string) => (url.includes('/es/') ? null : new ArrayBuffer(2)));
    const d = deps({ fetchBytes });
    await openHashBundle(ref, d);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    expect(d.importBytes).toHaveBeenCalledOnce();
  });

  it('refuses unknown ids and other origins, and reports a missing book', async () => {
    await expect(openHashBundle(ref, deps({ resolve: () => null }))).rejects.toMatchObject({ reason: 'unknown' });
    await expect(openHashBundle(ref, deps({ resolve: () => 'https://evil.example/x.postext' }))).rejects.toBeInstanceOf(HashBundleError);
    await expect(openHashBundle(ref, deps({ fetchBytes: async () => null }))).rejects.toMatchObject({ reason: 'not-found' });
  });

  it('an unreadable bundle is reported as invalid', async () => {
    const d = deps({ importBytes: async () => { throw new Error('preset.json missing'); } });
    await expect(openHashBundle(ref, d)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('concurrent opens of the same link share one import', async () => {
    const d = deps();
    const [a, b] = await Promise.all([openHashBundle(ref, d), openHashBundle(ref, d)]);
    expect(a).toBe(b);
    expect(d.importBytes).toHaveBeenCalledOnce();
  });
});
