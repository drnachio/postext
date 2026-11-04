import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyTaskBox } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #765: a configuration stored before the engine drew the box of a task
// item (configVersion 12 or older, postext 1.28 or earlier) keeps the
// character it set as text. The item's text started after the width of
// that character in a font of the system, which is not known when a
// configuration is read, so every such configuration with a task item gets
// the pin.

const kept = (config: PostextConfig): 'drawn' | 'character' | undefined => config.unorderedLists?.taskBox;

const TASKS = ['A list:', '', '- [ ] open', '- [x] done'].join('\n');

describe('pinLegacyTaskBox (#765)', () => {
  it('writes taskBox: character beside what the configuration sets', () => {
    expect(pinLegacyTaskBox<PostextConfig>({}).unorderedLists).toEqual({ taskBox: 'character' });
    const own: PostextConfig = { locale: 'ca', unorderedLists: { bulletChar: '\u2013', taskCompletedStrikethrough: false } };
    expect(pinLegacyTaskBox(own)).toEqual({
      locale: 'ca',
      unorderedLists: { bulletChar: '\u2013', taskCompletedStrikethrough: false, taskBox: 'character' },
    });
    // The stored configuration is not touched.
    expect(kept(own)).toBeUndefined();
  });

  it('leaves a configuration that names the setting as it is', () => {
    for (const config of [{ unorderedLists: { taskBox: 'drawn' } }, { unorderedLists: { taskBox: 'character' } }] as PostextConfig[]) {
      expect(pinLegacyTaskBox(config)).toBe(config);
    }
  });

  it('pins every version before 13 whose text may hold a task item, and none from 13', () => {
    expect(CONFIG_VERSION).toBe(22);
    for (const v of [undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      // Unknown content may hold one.
      expect(kept(migrateConfig({}, v)), String(v)).toBe('character');
      expect(kept(migrateConfig({}, v, { content: TASKS })), String(v)).toBe('character');
      expect(kept(migrateConfig({}, v, { content: ['Words.', TASKS] })), String(v)).toBe('character');
      expect(kept(migrateConfig({}, v, { content: 'Words and nothing else.' })), String(v)).toBeUndefined();
      expect(kept(migrateConfig({ unorderedLists: { taskBox: 'drawn' } }, v, { content: TASKS })), String(v)).toBe('drawn');
    }
    for (const v of [13, CONFIG_VERSION, 99]) {
      expect(kept(migrateConfig({}, v)), String(v)).toBeUndefined();
      expect(kept(migrateConfig({}, v, { content: TASKS })), String(v)).toBeUndefined();
    }
  });

  it('reads a task item as the block parser does', () => {
    const pinned = (content: string): boolean => kept(migrateConfig({}, 12, { content })) === 'character';
    for (const line of ['- [ ] a', '- [x] a', '- [X] a', '* [ ] a', '+ [x] a', '  - [ ] nested', '\t- [x] tabbed', '-   [ ] wide', '> - [ ] quoted', 'Text\n\n- [ ] after a paragraph']) {
      expect(pinned(line), JSON.stringify(line)).toBe(true);
    }
    // A plain bullet, a numbered item (never a task), brackets with
    // something else in them, a box with no space after it, and one in
    // running text are not task items.
    for (const line of ['- a bullet', '1. [ ] numbered', '1) [x] numbered', '- [y] other', '- [  ] two spaces', '- [x]no space', 'Write - [ ] in the text', '-[ ] no space']) {
      expect(pinned(line), JSON.stringify(line)).toBe(false);
    }
  });

  it('resolves to the setting only when the box is kept as a character', () => {
    expect('taskBox' in resolveAllConfig({}).unorderedLists).toBe(false);
    expect('taskBox' in resolveAllConfig({ unorderedLists: { taskBox: 'drawn' } }).unorderedLists).toBe(false);
    expect(resolveAllConfig({ unorderedLists: { taskBox: 'character' } }).unorderedLists.taskBox).toBe('character');
    // A new document has its boxes drawn; one read from before keeps the
    // character.
    expect(resolveAllConfig(migrateConfig({}, 13, { content: TASKS })).unorderedLists.taskBox).toBeUndefined();
    expect(resolveAllConfig(migrateConfig({}, 12, { content: TASKS })).unorderedLists.taskBox).toBe('character');
  });

  it('survives a save', () => {
    for (const config of [{}, { unorderedLists: { bulletChar: '\u2013' } }] as PostextConfig[]) {
      const migrated = migrateConfig(config, 12, { content: TASKS });
      const saved = stripConfigDefaults(migrated);
      expect(kept(saved)).toBe('character');
      const reloaded = migrateConfig(saved, 13, { content: TASKS });
      expect(reloaded).toBe(saved);
      expect(resolveAllConfig(reloaded).unorderedLists).toEqual(resolveAllConfig(migrated).unorderedLists);
      expect(kept(stripConfigDefaults(saved))).toBe('character');
    }
    // The default is not stored.
    expect(stripConfigDefaults({ unorderedLists: { taskBox: 'drawn' } }).unorderedLists).toBeUndefined();
    expect(stripConfigDefaults({ unorderedLists: { taskBox: 'character' } }).unorderedLists).toEqual({ taskBox: 'character' });
  });

  it('pins a bundle on the unorderedLists in force', () => {
    // The locale's layer replaces the manifest's `unorderedLists` wholesale:
    // the pin goes on what is left in force.
    const merged = migrateBundleConfig({}, [{ unorderedLists: { bulletChar: '\u2013' } }, { unorderedLists: { bulletChar: '\u2014' } }], 12, { content: TASKS });
    expect(merged.unorderedLists).toEqual({ bulletChar: '\u2014', taskBox: 'character' });
    // A layer that names the setting keeps its word.
    expect(kept(migrateBundleConfig({}, [{ unorderedLists: { taskBox: 'drawn' } }], 12, { content: TASKS }))).toBe('drawn');
    // The reader's own base is pinned with the rest when nothing names it.
    expect(kept(migrateBundleConfig({ unorderedLists: { bulletChar: '\u2013' } }, [{}], 12, { content: TASKS }))).toBe('character');
    expect(kept(migrateBundleConfig({}, [{}], 12))).toBe('character');
    // A bundle with no task item, and a current one, are read as written.
    expect(kept(migrateBundleConfig({}, [{}], 12, { content: 'Words.' }))).toBeUndefined();
    expect(kept(migrateBundleConfig({}, [{}], 13, { content: TASKS }))).toBeUndefined();
  });
});
