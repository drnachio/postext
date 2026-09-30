import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { CustomFontFamily, PostextConfig } from 'postext';

// The twin loader of postext is a browser affair: stand it in with spies,
// and the font storage (IndexedDB) with nothing.
const loadVerticalAlternates = vi.fn(async () => true);
const unregisterVerticalAlternates = vi.fn();
vi.mock('postext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('postext')>()),
  loadVerticalAlternates,
  unregisterVerticalAlternates,
}));
vi.mock('../storage/fontStorage', () => ({ getFontFile: async () => null }));

const { loadVerticalTwins, verticalTwinsSettled, setCustomFonts } = await import('./fontLoader');

const family = (fileId: string): CustomFontFamily => ({
  name: 'Book Serif TC',
  variants: [{ weight: 400, style: 'normal', fileId, format: 'otf' }],
});
const config: PostextConfig = {
  layout: { writingMode: 'vertical-rl' },
  bodyText: { fontFamily: 'Book Serif TC' },
};

describe('vertical twins in the Sandbox (#188 review)', () => {
  beforeAll(() => {
    (globalThis as { document?: unknown }).document = {};
  });
  afterAll(() => {
    setCustomFonts(undefined);
    delete (globalThis as { document?: unknown }).document;
  });

  it('loads a family’s twin once, and again from the new file when the font is uploaded again under the same name', async () => {
    setCustomFonts([family('file-1')]);
    expect(verticalTwinsSettled(config)).toBe(false);
    await loadVerticalTwins(config);
    expect(verticalTwinsSettled(config)).toBe(true);
    const calls = () => loadVerticalAlternates.mock.calls.filter((c) => (c as unknown[])[0] === 'Book Serif TC').length;
    expect(calls()).toBe(1);

    // Same file: nothing to do.
    await loadVerticalTwins(config);
    expect(calls()).toBe(1);

    // Another file under the same name: the old twin is dropped, the new
    // one loaded.
    setCustomFonts([family('file-2')]);
    expect(verticalTwinsSettled(config)).toBe(false);
    await loadVerticalTwins(config);
    expect(unregisterVerticalAlternates).toHaveBeenCalledWith('Book Serif TC');
    expect(calls()).toBe(2);
    expect(verticalTwinsSettled(config)).toBe(true);
  });
});
