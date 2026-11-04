import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { pinLegacyHtmlViewerBreaking as published } from '../../bundle/index.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults } from '../../defaults/output/htmlViewer.js';
import type { PostextConfig } from '../../types.js';

// #1400: the HTML viewer, the screen edition, breaks its lines with
// Knuth–Plass by default, as the canvas and the PDF do. Up to postext 1.67
// it set them line by line unless `htmlViewer.optimalLineBreaking` said
// otherwise; a configuration stored then (configVersion 21 or older) that
// does not name the setting keeps the old breaker.

const breaking = (config: Partial<PostextConfig>) => resolveHtmlViewerConfig(config.htmlViewer).optimalLineBreaking;

describe('htmlViewer.optimalLineBreaking default (#1400)', () => {
  it('is true, and an explicit false is kept when stripping', () => {
    expect(DEFAULT_HTML_VIEWER_CONFIG.optimalLineBreaking).toBe(true);
    expect(resolveHtmlViewerConfig(undefined).optimalLineBreaking).toBe(true);
    expect(resolveHtmlViewerConfig({}).optimalLineBreaking).toBe(true);
    expect(resolveHtmlViewerConfig({ optimalLineBreaking: false }).optimalLineBreaking).toBe(false);
    expect(stripHtmlViewerDefaults({ optimalLineBreaking: true })).toBeUndefined();
    expect(stripHtmlViewerDefaults({ optimalLineBreaking: false })).toEqual({ optimalLineBreaking: false });
    expect(stripConfigDefaults({ htmlViewer: { optimalLineBreaking: false } }).htmlViewer).toEqual({ optimalLineBreaking: false });
    expect(stripConfigDefaults({ htmlViewer: { optimalLineBreaking: true } }).htmlViewer).toBeUndefined();
  });
});

describe('pinLegacyHtmlViewerBreaking (#1400)', () => {
  it('is published from postext/bundle', () => {
    expect(published).toBe(pinLegacyHtmlViewerBreaking);
  });

  it('writes the old breaker on a viewer that names none, keeping its other settings', () => {
    expect(pinLegacyHtmlViewerBreaking<PostextConfig>({}).htmlViewer).toEqual({ optimalLineBreaking: false });
    const own: PostextConfig = { htmlViewer: { columnGap: 32, overrides: { bodyText: { textAlign: 'left' } } } };
    expect(pinLegacyHtmlViewerBreaking(own).htmlViewer).toEqual({ columnGap: 32, overrides: { bodyText: { textAlign: 'left' } }, optimalLineBreaking: false });
    // The stored configuration is not touched.
    expect(own.htmlViewer).toEqual({ columnGap: 32, overrides: { bodyText: { textAlign: 'left' } } });
  });

  it('leaves a viewer that names the setting as it is', () => {
    for (const value of [true, false]) {
      const config: PostextConfig = { htmlViewer: { optimalLineBreaking: value } };
      expect(pinLegacyHtmlViewerBreaking(config)).toBe(config);
    }
  });

  it('pins every version before 22, whatever the text holds, and none from 22', () => {
    expect(CONFIG_VERSION).toBe(22);
    for (const v of [undefined, 1, 8, 14, 17, 20, 21]) {
      expect(breaking(migrateConfig({}, v)), String(v)).toBe(false);
      expect(breaking(migrateConfig({}, v, { content: 'Words and nothing else.' })), String(v)).toBe(false);
      expect(breaking(migrateConfig({ htmlViewer: { optimalLineBreaking: true } }, v)), String(v)).toBe(true);
    }
    for (const v of [22, CONFIG_VERSION, 99]) {
      const config: PostextConfig = {};
      expect(migrateConfig(config, v), String(v)).toBe(config);
      expect(breaking(migrateConfig({}, v)), String(v)).toBe(true);
    }
  });

  it('pins the htmlViewer in force in a bundle', () => {
    const base: PostextConfig = {};
    const layers: PostextConfig[] = [{ htmlViewer: { columnGap: 40 } }, { locale: 'es' }];
    expect(migrateBundleConfig(base, layers, 21).htmlViewer).toEqual({ columnGap: 40, optimalLineBreaking: false });
    expect(migrateBundleConfig(base, layers, 22).htmlViewer).toEqual({ columnGap: 40 });
    // A locale layer that names the setting keeps it (rules 21 merge it
    // field by field over the shared viewer).
    const named: PostextConfig[] = [{ htmlViewer: { columnGap: 40 } }, { htmlViewer: { optimalLineBreaking: true } }];
    expect(migrateBundleConfig(base, named, 21).htmlViewer).toEqual({ columnGap: 40, optimalLineBreaking: true });
  });

  it('survives a save', () => {
    const migrated = migrateConfig<PostextConfig>({}, 21);
    const saved = stripConfigDefaults(migrated);
    expect(saved.htmlViewer).toEqual({ optimalLineBreaking: false });
    expect(breaking(migrateConfig(saved, CONFIG_VERSION))).toBe(false);
  });
});
