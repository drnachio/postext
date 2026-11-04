import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyRefLabelBreaks, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #702: a configuration stored before a reference's label of words broke
// at its spaces (configVersion 11 or older, postext 1.27 or earlier) keeps
// every label whole.

const kept = (config: PostextConfig): boolean | undefined => config.crossRefs?.breakLabels;

describe('pinLegacyRefLabelBreaks (#702)', () => {
  it('writes breakLabels: false beside what the configuration sets', () => {
    expect(pinLegacyRefLabelBreaks<PostextConfig>({}).crossRefs).toEqual({ breakLabels: false });
    const own: PostextConfig = { crossRefs: { page: 'page {n}', defaultStyle: 'title' } };
    expect(pinLegacyRefLabelBreaks(own).crossRefs).toEqual({ page: 'page {n}', defaultStyle: 'title', breakLabels: false });
    // The stored configuration is not touched.
    expect(kept(own)).toBeUndefined();
  });

  it('leaves a configuration that names the setting as it is', () => {
    for (const config of [{ crossRefs: { breakLabels: true } }, { crossRefs: { breakLabels: false } }] as PostextConfig[]) {
      expect(pinLegacyRefLabelBreaks(config)).toBe(config);
    }
  });

  it('pins every version before 12 whose content may hold a reference, none from 12', () => {
    const withRef = [
      'See :ref{id="fig-1"} for the map.',
      'By \\ref{thm:main} and \\eqref{eq:energy}.',
      'As @fig:map shows, and [@sec:intro].',
    ];
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      // Unknown content counts as holding one.
      expect(kept(migrateConfig({}, v)), String(v)).toBe(false);
      for (const content of withRef) expect(kept(migrateConfig({}, v, { content })), `${v} ${content}`).toBe(false);
      expect(kept(migrateConfig({}, v, { content: ['No reference here.', withRef[0]!] })), String(v)).toBe(false);
      // No reference: an e-mail address is no pandoc-crossref.
      expect(kept(migrateConfig({}, v, { content: 'Write to ana@example.org. A [phrase]{#anchor} and a heading {#sec}.' })), String(v)).toBeUndefined();
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
    expect(resolveAllConfig(current).crossRefs.breakLabels).toBe(true);
    expect(resolveAllConfig(migrateConfig({}, 11)).crossRefs.breakLabels).toBe(false);
  });

  it('survives a save', () => {
    for (const config of [{}, { crossRefs: { page: 'page {n}' } }] as PostextConfig[]) {
      const migrated = migrateConfig(config, 11);
      const saved = stripConfigDefaults(migrated);
      expect(kept(saved)).toBe(false);
      const reloaded = migrateConfig(saved, 12);
      expect(reloaded).toBe(saved);
      expect(resolveAllConfig(reloaded).crossRefs).toEqual(resolveAllConfig(migrated).crossRefs);
      expect(kept(stripConfigDefaults(saved))).toBe(false);
    }
    // The default is not stored.
    expect(stripConfigDefaults({ crossRefs: { breakLabels: true } }).crossRefs).toBeUndefined();
    expect(stripConfigDefaults({ crossRefs: { breakLabels: false } }).crossRefs).toEqual({ breakLabels: false });
  });

  it('pins a bundle on the crossRefs in force', () => {
    const content = 'See :ref{id="fig-1"}.';
    // The locale's layer replaces the manifest's `crossRefs` wholesale: the
    // pin goes on what is left in force.
    const merged = migrateBundleConfig({}, [{ crossRefs: { page: 'page {n}' } }, { crossRefs: { page: 'página {n}' } }], 11, { content });
    expect(merged.crossRefs).toEqual({ page: 'página {n}', breakLabels: false });
    // A layer that names the setting keeps its word.
    expect(kept(migrateBundleConfig({}, [{ crossRefs: { breakLabels: true } }], 11, { content }))).toBe(true);
    // The reader's own base is pinned with the rest when nothing names it.
    expect(kept(migrateBundleConfig({ crossRefs: { defaultStyle: 'title' } }, [{}], 11, { content }))).toBe(false);
    // A current bundle is read as written.
    expect(kept(migrateBundleConfig({}, [{}], 12, { content }))).toBeUndefined();
    // No reference in the book: nothing to pin.
    expect(kept(migrateBundleConfig({}, [{}], 11, { content: 'Plain text.' }))).toBeUndefined();
  });
});
