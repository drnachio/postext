import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { createBundle, openBundle, pinLegacySlashBreaks } from '../../bundle/index.js';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyGridBreakRules, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #717: a configuration stored before the widow and orphan rules were
// turned off by default on a character grid (configVersion 11 or older,
// postext 1.27 or earlier) keeps both on, unless it set them itself. The
// pin writes a rule only where today's default turns it off.

const GRID = { enabled: true, charsPerLine: 38, linesPerPage: 15 };
const grid = (locale: string, extra: PostextConfig = {}): PostextConfig => ({ locale, cjk: { grid: GRID }, ...extra });
const rules = (config: PostextConfig) => {
  const { avoidWidows, avoidOrphans } = resolveAllConfig(config).bodyText;
  return { avoidWidows, avoidOrphans };
};
const ON = { avoidWidows: true, avoidOrphans: true };

describe('pinLegacyGridBreakRules (#717)', () => {
  it('writes the rules a grid that sets neither lost: the foot rule, and in Japan the head rule', () => {
    const pinned: Record<string, object> = { ja: ON, 'zh-Hans': { avoidWidows: true }, 'zh-Hant': { avoidWidows: true } };
    for (const [locale, written] of Object.entries(pinned)) {
      const config = grid(locale, { bodyText: { fontFamily: 'Noto Serif JP' } });
      const out = migrateConfig(config, 11);
      expect(out.bodyText, locale).toEqual({ fontFamily: 'Noto Serif JP', ...written, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
      expect(rules(out), locale).toEqual(ON);
      // No body text section at all.
      expect(migrateConfig(grid(locale), 11).bodyText, locale).toEqual({ ...written, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
      expect(migrateConfig(grid(locale), 8).bodyText, locale).toMatchObject(written);
      // The stored configuration is not touched.
      expect(config.bodyText).toEqual({ fontFamily: 'Noto Serif JP' });
    }
    // The region the configuration names decides, as it does the default.
    expect(migrateConfig<PostextConfig>({ cjk: { region: 'japan', grid: GRID } }, 11).bodyText).toEqual({ ...ON, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(migrateConfig(grid('ja', { cjk: { region: 'mainland', grid: GRID } }), 11).bodyText).toEqual({ avoidWidows: true, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    // Under today's rules the same configuration lays out with them off.
    expect(rules(grid('ja'))).toEqual({ avoidWidows: false, avoidOrphans: false });
    expect(rules(grid('zh-Hans'))).toEqual({ avoidWidows: false, avoidOrphans: true });
  });

  it('writes only the rule a configuration leaves unset', () => {
    expect(pinLegacyGridBreakRules(grid('ja', { bodyText: { avoidWidows: false } })).bodyText).toEqual({ avoidWidows: false, avoidOrphans: true });
    expect(pinLegacyGridBreakRules(grid('ja', { bodyText: { avoidOrphans: false } })).bodyText).toEqual({ avoidOrphans: false, avoidWidows: true });
    const chinese = grid('zh-Hans', { bodyText: { avoidWidows: false } });
    expect(pinLegacyGridBreakRules(chinese)).toBe(chinese);
  });

  it('leaves every other configuration as it is', () => {
    for (const config of [
      grid('ja', { bodyText: { avoidWidows: false, avoidOrphans: false } }),
      grid('zh-Hant', { bodyText: { avoidWidows: true, avoidOrphans: true } }),
      { locale: 'ja', cjk: { grid: { ...GRID, enabled: false } } } as PostextConfig,
      { locale: 'ja', layout: { writingMode: 'vertical-rl' } } as PostextConfig,
      { locale: 'zh-Hans' } as PostextConfig,
      {} as PostextConfig,
    ]) {
      expect(pinLegacyGridBreakRules(config)).toBe(config);
    }
  });

  it('pins every version before 12, none from 12', () => {
    expect(CONFIG_VERSION).toBe(22);
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(rules(migrateConfig(grid('ja'), v)), String(v)).toEqual(ON);
    }
    const current = grid('ja');
    // One stamped 12 takes the pins of rules 13, 14, 18 and 19 alone: the
    // language (#764, #770) and, its text not being known, the task box
    // (#765) and the rounded mark ends (#1149), and the breaks at a slash
    // (#1164). One stamped 13 takes the language, the mark ends and the
    // slash breaks; one stamped 14 the mark ends and the slash breaks; one
    // stamped 18 the slash breaks alone. Every one before 22 also takes the
    // line breaker of the HTML viewer (#1400); one stamped 22 is read as it is.
    expect(migrateConfig(current, 12)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 13)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 14)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 18)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 19)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 20)).toEqual(pinLegacyHtmlViewerBreaking(current));
    expect(migrateConfig(current, CONFIG_VERSION)).toBe(current);
  });

  it('survives a save: the stripped configuration keeps the rules it was pinned to', () => {
    // Japan: both are no default on the grid, so both stay written.
    const ja = stripConfigDefaults(migrateConfig(grid('ja'), 11));
    // With the pins every configuration before 12 takes (#725, #764).
    expect(ja.bodyText).toEqual({ ...ON, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(migrateConfig(ja, 12)).toBe(ja);
    expect(rules(ja)).toEqual(ON);
    // China: the head rule is the default there, so only the foot rule
    // was written, and it stays.
    const pinned = migrateConfig(grid('zh-Hans'), 11);
    const zh = stripConfigDefaults(pinned);
    expect(zh).toEqual(pinned);
    expect(zh.bodyText).toEqual({ avoidWidows: true, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(rules(zh)).toEqual(ON);
    // Saved again and again, they stay.
    expect(stripConfigDefaults(stripConfigDefaults(ja)).bodyText).toEqual({ ...ON, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { bodyText: { fontFamily: 'Noto Serif SC' } };
    const merged = migrateBundleConfig(base, [grid('zh-Hans'), { layout: { layoutType: 'double' } }], 11);
    expect(merged.bodyText).toEqual({ fontFamily: 'Noto Serif SC', avoidWidows: true, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(migrateBundleConfig(base, [grid('zh-Hans'), { locale: 'ja' }], 11).bodyText).toEqual({ fontFamily: 'Noto Serif SC', ...ON, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    // A layer that takes the grid away leaves nothing to pin.
    const plain = migrateBundleConfig(base, [grid('zh-Hans'), { cjk: { grid: { enabled: false } } }], 11);
    expect(plain.bodyText).toEqual({ ...base.bodyText, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    // One stored under 12 or 13 takes the pin of the language alone (#764,
    // #770); one stored under 14 is read as written.
    for (const v of [12, 13]) {
      expect(migrateBundleConfig(base, [grid('zh-Hans')], v).bodyText, String(v)).toEqual({ fontFamily: 'Noto Serif SC', shapingLanguage: 'host', breakAfterSlashes: false });
    }
    expect(migrateBundleConfig(base, [grid('zh-Hans')], 14).bodyText).toEqual({ ...base.bodyText, breakAfterSlashes: false });
  });
});

describe('a bundle keeps the break rules of its grid (#717)', () => {
  const manifestOf = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(unzipSync(bytes)['preset.json']));
  const MD = '# 題\n\n本文。';

  it('reads a bundle stored under 11 with both rules on, and writes them back', async () => {
    const { bytes } = await createBundle({ name: 'Old', locale: 'ja', markdown: MD, config: grid('ja') });
    // The same bundle as postext 1.27 wrote it.
    const files = unzipSync(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files['preset.json']));
    expect(manifest.config.bodyText).toBeUndefined();
    manifest.configVersion = 11;
    const { zipSync } = await import('fflate');
    const old = zipSync({ ...files, 'preset.json': new TextEncoder().encode(JSON.stringify(manifest)) });
    const opened = await openBundle(old);
    expect(rules(opened.config)).toEqual(ON);
    // Written again from what was read: stamped 14, the rules spelled out.
    const again = await createBundle({ name: 'Old', locale: 'ja', markdown: MD, config: opened.config });
    expect(again.manifest.configVersion).toBe(22);
    expect(again.manifest.config!.bodyText).toEqual({ ...ON, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(rules((await openBundle(again.bytes)).config)).toEqual(ON);
  });

  it('reads a bundle written today with the defaults of its grid', async () => {
    const ja = await createBundle({ name: 'New', locale: 'ja', markdown: MD, config: grid('ja') });
    expect(rules((await openBundle(ja.bytes)).config)).toEqual({ avoidWidows: false, avoidOrphans: false });
    const on = await createBundle({ name: 'On', locale: 'ja', markdown: MD, config: grid('ja', { bodyText: ON }) });
    expect(manifestOf(on.bytes).config.bodyText).toEqual(ON);
    expect(rules((await openBundle(on.bytes)).config)).toEqual(ON);
    const off = await createBundle({ name: 'Off', locale: 'ja', markdown: MD, config: grid('ja', { bodyText: { avoidWidows: false, avoidOrphans: false } }) });
    expect(manifestOf(off.bytes).config.bodyText).toBeUndefined();
  });

  it('keeps a rule for a locale that adds or removes the grid over the shared configuration', async () => {
    // Shared: a plain page whose `true` restates the default. The Japanese
    // edition adds a grid and nothing else: read over the shared keys it
    // still says `true`, which is no default on its grid.
    const shared: PostextConfig = { locale: 'en', bodyText: { fontFamily: 'Georgia', ...ON } };
    const japanese: PostextConfig = { locale: 'ja', cjk: { grid: GRID } };
    const added = await createBundle({ name: 'Two', locale: 'en', markdown: '# T', config: shared, localized: { ja: { config: japanese } } });
    expect(added.manifest.config!.bodyText).toEqual({ fontFamily: 'Georgia' });
    expect(added.manifest.localized!.ja!.config!.bodyText).toEqual(ON);
    expect(rules((await openBundle(added.bytes, { locale: 'ja' })).config)).toEqual(rules({ ...shared, ...japanese }));
    expect(rules((await openBundle(added.bytes, { locale: 'ja' })).config)).toEqual(ON);
    // Shared: a grid whose `false` restates the default. The English
    // edition takes the grid away: its `false` is no default off the grid.
    const gridded = grid('ja', { bodyText: { avoidWidows: false, avoidOrphans: false } });
    const english: PostextConfig = { locale: 'en', cjk: { grid: { enabled: false } } };
    const removed = await createBundle({ name: 'Two', locale: 'ja', markdown: MD, config: gridded, localized: { en: { config: english } } });
    expect(removed.manifest.config!.bodyText).toBeUndefined();
    expect(removed.manifest.localized!.en!.config!.bodyText).toEqual({ avoidWidows: false, avoidOrphans: false });
    expect(rules((await openBundle(removed.bytes, { locale: 'en' })).config)).toEqual({ avoidWidows: false, avoidOrphans: false });
    expect(rules((await openBundle(removed.bytes, { locale: 'ja' })).config)).toEqual({ avoidWidows: false, avoidOrphans: false });
  });
});
