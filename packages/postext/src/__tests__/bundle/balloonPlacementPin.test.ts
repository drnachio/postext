import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyBalloonPlacement, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #728: a configuration stored before a reshaped comic balloon paid for the
// Chinese words it parts (configVersion 11 or older, postext 1.27 or
// earlier) keeps the placement it had.

const kept = (config: PostextConfig): boolean | undefined => config.comics?.lettering?.strictPlacement;

describe('pinLegacyBalloonPlacement (#728)', () => {
  it('writes strictPlacement: false beside what the configuration sets', () => {
    expect(pinLegacyBalloonPlacement<PostextConfig>({}).comics).toEqual({ lettering: { strictPlacement: false } });
    const own: PostextConfig = { comics: { mirrorArt: true, lettering: { joinSameSpeaker: 'connector' } } };
    expect(pinLegacyBalloonPlacement(own).comics).toEqual({ mirrorArt: true, lettering: { joinSameSpeaker: 'connector', strictPlacement: false } });
    // The stored configuration is not touched.
    expect(kept(own)).toBeUndefined();
  });

  it('leaves a configuration that names the setting as it is', () => {
    for (const config of [{ comics: { lettering: { strictPlacement: true } } }, { comics: { lettering: { strictPlacement: false } } }] as PostextConfig[]) {
      expect(pinLegacyBalloonPlacement(config)).toBe(config);
    }
  });

  it('pins every version before 12 whose content may hold a comic, none from 12', () => {
    const comics = [
      ':::page{split="* / *"}\n::panel{art=a}\nana: 你好\n:::',
      'Text.\n\n  :::strip\n::panel\n:::',
      ':::page\n::panel\n:::',
    ];
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      // Unknown content counts as holding one.
      expect(kept(migrateConfig({}, v)), String(v)).toBe(false);
      for (const content of comics) expect(kept(migrateConfig({}, v, { content })), `${v} ${content}`).toBe(false);
      expect(kept(migrateConfig({}, v, { content: ['A chapter of prose.', comics[0]!] })), String(v)).toBe(false);
      // No comic: a fence of another kind, or the word in the running text.
      expect(kept(migrateConfig({}, v, { content: ':::pagebreak\n:::\n\nA :::page fence is written at the start of a line.\n\n:::paragraphs\nText\n:::' })), String(v)).toBeUndefined();
    }
    const current: PostextConfig = {};
    // One stamped 12 takes the pins of rules 13, 14, 18 and 19 alone: the
    // language (#764, #770) and, its text not being known, the task box
    // (#765) and the rounded mark ends (#1149), and the breaks at a slash
    // (#1164). One stamped 13 takes the language, the mark ends and the
    // slash breaks; one stamped 14 the mark ends and the slash breaks; one
    // stamped 18 the slash breaks alone. Every one before 22 also takes the
    // line breaker of the HTML viewer (#1400); one stamped 22 is read as it is.
    expect(migrateConfig(current, 12)).toEqual(pinLegacyHtmlViewerBreaking({ bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 13)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 14)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 18)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 19)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 20)).toEqual(pinLegacyHtmlViewerBreaking(current));
    expect(migrateConfig(current, CONFIG_VERSION)).toBe(current);
    expect(resolveAllConfig(current).comics?.lettering.strictPlacement ?? true).toBe(true);
    expect(resolveAllConfig({ comics: {} }).comics!.lettering.strictPlacement).toBe(true);
    expect(resolveAllConfig(migrateConfig({}, 11)).comics!.lettering.strictPlacement).toBe(false);
  });

  it('survives a save', () => {
    for (const config of [{}, { comics: { lettering: { joinSameSpeaker: 'none' } } }] as PostextConfig[]) {
      const migrated = migrateConfig(config, 11);
      const saved = stripConfigDefaults(migrated);
      expect(kept(saved)).toBe(false);
      const reloaded = migrateConfig(saved, 12);
      expect(reloaded).toBe(saved);
      expect(resolveAllConfig(reloaded).comics!.lettering).toEqual(resolveAllConfig(migrated).comics!.lettering);
      expect(kept(stripConfigDefaults(saved))).toBe(false);
    }
    // The default is not stored.
    expect(stripConfigDefaults({ comics: { lettering: { strictPlacement: true } } }).comics).toBeUndefined();
    expect(stripConfigDefaults({ comics: { lettering: { strictPlacement: false } } }).comics).toEqual({ lettering: { strictPlacement: false } });
  });

  it('pins a bundle on the comics settings in force', () => {
    const content = ':::page\n::panel\nana: 其实，我有点害怕\n:::';
    // The locale's layer replaces the manifest's `comics` wholesale: the pin
    // goes on what is left in force.
    const merged = migrateBundleConfig({}, [{ comics: { mirrorArt: true } }, { comics: { lettering: { doubleDash: true } } }], 11, { content });
    expect(merged.comics).toEqual({ lettering: { doubleDash: true, strictPlacement: false } });
    // A layer that names the setting keeps its word.
    expect(kept(migrateBundleConfig({}, [{ comics: { lettering: { strictPlacement: true } } }], 11, { content }))).toBe(true);
    // A current bundle is read as written.
    expect(kept(migrateBundleConfig({}, [{}], 12, { content }))).toBeUndefined();
    // No comic in the book: nothing to pin.
    expect(kept(migrateBundleConfig({}, [{}], 11, { content: 'Plain text.' }))).toBeUndefined();
  });
});
