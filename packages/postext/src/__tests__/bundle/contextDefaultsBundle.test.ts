import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { createBundle, openBundle } from '../../bundle';
import { CONFIG_VERSION, migrateConfig } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig } from '../../types';

// #651: a bundle stores its configuration stripped of defaults. The strip
// dropped `headings.balancing.enabled: true` as the default it is on a
// plain page, so a bundle written from a character grid (or from vertical
// text) with balancing on opened with balancing off.

const GRID = { enabled: true, charsPerLine: 28, linesPerPage: 22 };
const grid = (extra: PostextConfig = {}): PostextConfig => ({ locale: 'zh-Hans', cjk: { grid: GRID }, ...extra });
const manifestOf = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(unzipSync(bytes)['preset.json']));
const balancing = (config: PostextConfig) => resolveAllConfig(config).headings.balancing;

describe('a bundle keeps the balancing its configuration turns on (#651)', () => {
  it('on a character grid', async () => {
    const config = grid({ headings: { balancing: { enabled: true, gridLines: 'off' } } });
    const { bytes, manifest } = await createBundle({ name: 'Grid', locale: 'zh-Hans', markdown: '# 题\n\n正文。', config });
    expect(manifest.configVersion).toBe(CONFIG_VERSION);
    expect(manifest.config!.headings).toEqual({ balancing: { enabled: true, gridLines: 'off' } });
    const opened = await openBundle(bytes);
    expect(balancing(opened.config).enabled).toBe(true);
    expect(balancing(opened.config).gridLines).toBe('off');
    // Written again from what was read, it is the same bundle.
    const again = await createBundle({ name: 'Grid', locale: 'zh-Hans', markdown: '# 题\n\n正文。', config: opened.config });
    expect(again.manifest.config!.headings).toEqual(manifest.config!.headings);
  });

  it('in vertical text', async () => {
    const config: PostextConfig = { locale: 'ja', layout: { writingMode: 'vertical-rl' }, headings: { balancing: { enabled: true } } };
    const { bytes } = await createBundle({ name: 'Tate', locale: 'ja', markdown: '# 題\n\n本文。', config });
    expect(manifestOf(bytes).config.headings).toEqual({ balancing: { enabled: true } });
    expect(balancing((await openBundle(bytes)).config).enabled).toBe(true);
  });

  it('writes nothing where the configuration restates the default', async () => {
    const off = await createBundle({ name: 'Off', markdown: '# T', config: grid({ headings: { balancing: { enabled: false } } }) });
    expect(off.manifest.config!.headings).toBeUndefined();
    expect(balancing((await openBundle(off.bytes)).config).enabled).toBe(false);
    const on = await createBundle({ name: 'On', markdown: '# T', config: { headings: { balancing: { enabled: true } } } });
    expect(on.manifest.config!.headings).toBeUndefined();
    expect(balancing((await openBundle(on.bytes)).config).enabled).toBe(true);
    const plainOff = await createBundle({ name: 'Plain', markdown: '# T', config: { headings: { balancing: { enabled: false } } } });
    expect(balancing((await openBundle(plainOff.bytes)).config).enabled).toBe(false);
  });

  it('keeps the grid pin of a document stored by 1.24 through the bundle', async () => {
    const stored = grid({ headings: { fontFamily: 'Noto Serif SC' } });
    const migrated = migrateConfig(stored, 10);
    expect(balancing(migrated).enabled).toBe(true);
    const { bytes } = await createBundle({ name: 'Old', locale: 'zh-Hans', markdown: '# 题', config: migrated });
    expect(balancing((await openBundle(bytes)).config).enabled).toBe(true);
  });
});

// A locale's configuration is read as its keys over the shared ones, so
// its defaults are those of the two together.
describe('a locale of a bundle is stripped as the whole it is read as (#651)', () => {
  const read = async (bytes: Uint8Array, locale: string) => (await openBundle(bytes, { locale })).config;

  it('keeps balancing a locale turns on over a shared character grid', async () => {
    const { bytes, manifest } = await createBundle({
      name: 'Two', locale: 'zh-Hans', markdown: '# 题', config: grid(),
      localized: { 'zh-Hant': { config: { locale: 'zh-Hant', headings: { balancing: { enabled: true } } } } },
    });
    expect(manifest.localized!['zh-Hant']!.config!.headings).toEqual({ balancing: { enabled: true } });
    expect(balancing(await read(bytes, 'zh-Hant')).enabled).toBe(true);
    expect(balancing(await read(bytes, 'zh-Hans')).enabled).toBe(false);
  });

  it('writes a shared key for a locale whose own defaults keep what the shared ones drop', async () => {
    // Shared: a plain page, where `enabled: true` restates the default.
    // The Chinese edition sets a grid and nothing else: read over the
    // shared keys it is `{ grid, enabled: true }`.
    const shared: PostextConfig = { locale: 'en', headings: { fontFamily: 'EB Garamond', balancing: { enabled: true } } };
    const chinese: PostextConfig = { locale: 'zh-Hans', cjk: { grid: GRID } };
    const { bytes, manifest } = await createBundle({
      name: 'Two', locale: 'en', markdown: '# T', config: shared,
      localized: { 'zh-Hans': { config: chinese } },
    });
    expect(manifest.config!.headings).toEqual({ fontFamily: 'EB Garamond' });
    expect(manifest.localized!['zh-Hans']!.config!.headings).toEqual({ fontFamily: 'EB Garamond', balancing: { enabled: true } });
    const opened = resolveAllConfig(await read(bytes, 'zh-Hans')).headings;
    expect(opened.balancing).toEqual(resolveAllConfig({ ...shared, ...chinese }).headings.balancing);
    expect(opened.balancing.enabled).toBe(true);
    expect(opened.fontFamily).toBe('EB Garamond');
    expect(balancing(await read(bytes, 'en')).enabled).toBe(true);
  });

  it('writes no shared key a locale reads the same', async () => {
    const shared = grid({ headings: { fontFamily: 'Noto Serif SC', balancing: { enabled: true } }, index: { see: { italic: true } } });
    const { manifest } = await createBundle({
      name: 'Two', locale: 'zh-Hans', markdown: '# 题', config: shared,
      // Horizontal and off the grid: `enabled: true` is the default there,
      // and the shared `headings` still says so.
      localized: { en: { config: { locale: 'en', cjk: { grid: { enabled: false } } } } },
    });
    expect(Object.keys(manifest.localized!.en!.config!).sort()).toEqual(['cjk', 'locale']);
    // A full configuration for the locale: its `headings` no longer
    // restates the shared one, which keeps `enabled: true` for the grid.
    const english: PostextConfig = { ...shared, locale: 'en', cjk: { grid: { enabled: false } } };
    const full = await createBundle({
      name: 'Two', locale: 'zh-Hans', markdown: '# 题', config: shared,
      localized: { en: { config: english } },
    });
    expect(full.manifest.localized!.en!.config).toEqual({ locale: 'en', cjk: { grid: { enabled: false } }, headings: { fontFamily: 'Noto Serif SC' } });
    const opened = resolveAllConfig((await openBundle(full.bytes, { locale: 'en' })).config);
    expect(opened.headings.balancing).toEqual(resolveAllConfig(english).headings.balancing);
    expect(opened.index.see.italic).toBe(true);
  });
});
