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
