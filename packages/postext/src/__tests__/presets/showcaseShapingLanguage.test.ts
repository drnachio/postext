/* eslint-disable @typescript-eslint/ban-ts-comment -- node built-ins in a test */
// @ts-nocheck
/* #770: the showcase bundles (apps/web/public/presets) keep their lines
   now that a document is shaped in its own language by default. Each was
   laid out in the language of the page that hosted it and is stamped
   below `configVersion` 14 (8, or nothing at all), so the engine's own
   migration writes `bodyText.shapingLanguage: 'host'` on the body text
   every one of its editions is laid out with. None is to be stamped again
   without being laid out again: the stamp is what keeps it, or, in a bundle
   stamped today (#1209), the value written out in its configuration. */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_VERSION, migrateBundleConfig } from '../../bundle/configVersion.js';
import { pickLocaleOverrides } from '../../bundle/manifest.js';
import { shapingLanguageOf } from '../../hyphenation/locale.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { BundleManifest } from '../../bundle/types.js';

const PRESETS = join(__dirname, '../../../../../apps/web/public/presets');

/** The editions a bundle serves: its own language, the ones it lists and
 *  the ones it rewords. */
function editionsOf(manifest: BundleManifest): string[] {
  const listed = (manifest as { locales?: string[] }).locales ?? [];
  return [...new Set([...(manifest.locale ? [manifest.locale] : []), ...listed, ...Object.keys(manifest.localized ?? {})])];
}

describe('#770: the showcase bundles are shaped in the language of the host, as they were laid out', () => {
  const ids = existsSync(PRESETS) ? readdirSync(PRESETS).filter((d) => existsSync(join(PRESETS, d, 'preset.json'))) : [];
  const manifestOf = (id: string): BundleManifest => JSON.parse(readFileSync(join(PRESETS, id, 'preset.json'), 'utf8')) as BundleManifest;

  it('finds the showcase bundles and their editions', () => {
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.flatMap((id) => editionsOf(manifestOf(id))).length).toBeGreaterThanOrEqual(ids.length);
  });

  it.each(ids)('%s: stamped before 14 or written out, and every edition reads with the host\'s language', (id) => {
    const manifest = manifestOf(id);
    const stamp = manifest.configVersion;
    const pinned = stamp === undefined || (typeof stamp === 'number' && stamp < 14);
    expect(pinned || stamp === CONFIG_VERSION, `${id} is stamped ${String(stamp)}`).toBe(true);
    expect(CONFIG_VERSION).toBeGreaterThanOrEqual(14);
    const editions = editionsOf(manifest);
    expect(editions.length).toBeGreaterThan(0);
    for (const locale of editions) {
      const overrides = pickLocaleOverrides(manifest, locale);
      const config = migrateBundleConfig({}, [manifest.config ?? {}, overrides?.config ?? {}], stamp);
      expect(config.bodyText?.shapingLanguage, `${id} ${locale}`).toBe('host');
      const resolved = resolveAllConfig({ ...config, locale: config.locale ?? locale });
      expect(resolved.bodyText.shapingLanguage, `${id} ${locale}`).toBe('host');
      expect(shapingLanguageOf(resolved), `${id} ${locale}`).toBeUndefined();
      // The same manifest under today's stamp would be shaped in its own
      // language: the stamp is what keeps it (a bundle stamped today writes
      // the value out, checked above).
      if (!pinned) continue;
      const restamped = migrateBundleConfig({}, [manifest.config ?? {}, overrides?.config ?? {}], CONFIG_VERSION);
      expect(shapingLanguageOf(resolveAllConfig({ ...restamped, locale: restamped.locale ?? locale })), `${id} ${locale}`).not.toBeUndefined();
    }
  });
});
