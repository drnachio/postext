/* Opening a preset after a book that bundled fonts: a family the last book
   declared and the new one asks of Google Fonts is not a custom family the
   author deleted (#197, #207). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomFontFamily, PostextConfig } from 'postext';

vi.mock('../storage/blobStore', async (importOriginal) => ({ ...(await importOriginal<object>()), putBlobsAt: async () => {} }));
vi.mock('../storage/fontStorage', async (importOriginal) => ({ ...(await importOriginal<object>()), putFontFiles: async () => {} }));
vi.mock('../storage/persistence', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveBook: () => {},
  saveConfig: () => {},
  savePresetApplied: () => {},
  savePresetId: () => {},
}));

const { applyPreset } = await import('./apply');
const { isRemovedCustomFontFamily, setCustomFonts } = await import('../controls/fontLoader');
const { computeWarnings } = await import('../warnings/compute');

const bundled = (name: string): CustomFontFamily => ({ name, variants: [{ weight: 400, style: 'normal', fileId: `${name}-400`, format: 'ttf' }] });
// 紅樓夢's bundled faces.
const HONGLOUMENG = ['Noto Serif SC', 'Noto Sans SC', 'EB Garamond'].map(bundled);

function loaded(config: PostextConfig) {
  return {
    summary: { id: 'guide', name: 'Guide', description: '', source: 'builtin', available: true },
    locale: 'zh-Hans',
    chapters: [{ id: 'c1', title: '一', markdown: '# 一\n\n此开卷第一回也。' }],
    config,
    resources: [],
    blobs: [],
    fonts: [],
  } as unknown as Parameters<typeof applyPreset>[0];
}

afterEach(() => setCustomFonts(undefined, { newBook: true }));

describe('applyPreset', () => {
  it('forgets the fonts the last book bundled when the next one names them', async () => {
    setCustomFonts(HONGLOUMENG, { newBook: true });
    const config: PostextConfig = { locale: 'zh-Hans', bodyText: { fontFamily: 'Noto Serif SC' }, headings: { fontFamily: 'Noto Sans SC' } };
    await applyPreset(loaded(config), () => {}, { parts: 'all', current: { chapters: [], config: {}, resources: [] } });
    expect(isRemovedCustomFontFamily('Noto Serif SC')).toBe(false);
    const fontWarnings = computeWarnings({ markdown: '# 一\n\n此开卷第一回也。', config, doc: null })
      .filter((w) => w.payload.kind === 'missingFontFamily');
    expect(fontWarnings).toEqual([]);
  });
});
