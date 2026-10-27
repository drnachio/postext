import { describe, it, expect } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createBundle, openBundle, pinLegacySlashBreaks } from '../../bundle/index.js';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyShapingLanguage } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { shapingLanguageOf } from '../../hyphenation/locale.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #764, #770: a configuration stored before the text was measured,
// painted and embedded in the document's own language by default
// (configVersion 13 or older, postext 1.29 or earlier) keeps the language
// of the page that hosts the layout, unless it names the setting. Every
// such configuration: which faces answer with other glyphs under a
// language is not known when a configuration is read.
//
// The stamps: up to 12 (postext 1.28 or earlier) there was no setting and
// the host's language was the only way. 13 is postext 1.29: 1.29.1 and
// 1.29.2 laid a configuration that names no value out in the host's
// language, and 1.29.0 in the document's with a canvas and a PDF that did
// not follow the measure. 14 is postext 1.30, whose default is the
// document's.

const kept = (config: PostextConfig): 'document' | 'host' | undefined => config.bodyText?.shapingLanguage;

describe('pinLegacyShapingLanguage (#764, #770)', () => {
  it('writes shapingLanguage: host beside what the configuration sets', () => {
    expect(pinLegacyShapingLanguage<PostextConfig>({}).bodyText).toEqual({ shapingLanguage: 'host' });
    const own: PostextConfig = { locale: 'ca', bodyText: { fontFamily: 'Literata', textAlign: 'left' } };
    expect(pinLegacyShapingLanguage(own)).toEqual({
      locale: 'ca',
      bodyText: { fontFamily: 'Literata', textAlign: 'left', shapingLanguage: 'host' },
    });
    // The stored configuration is not touched.
    expect(kept(own)).toBeUndefined();
  });

  it('leaves a configuration that names the setting as it is', () => {
    for (const config of [{ bodyText: { shapingLanguage: 'document' } }, { bodyText: { shapingLanguage: 'host' } }] as PostextConfig[]) {
      expect(pinLegacyShapingLanguage(config)).toBe(config);
    }
  });

  it('pins every version before 14, whatever its content, and none from 14', () => {
    expect(CONFIG_VERSION).toBe(21);
    for (const v of [undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(kept(migrateConfig({}, v)), String(v)).toBe('host');
      // A face may answer with other glyphs to any text: the content alone
      // cannot rule the pin out.
      expect(kept(migrateConfig({}, v, { content: 'Words and nothing else.' })), String(v)).toBe('host');
      expect(kept(migrateConfig({ bodyText: { shapingLanguage: 'document' } }, v)), String(v)).toBe('document');
      expect(kept(migrateConfig({ bodyText: { shapingLanguage: 'host' } }, v)), String(v)).toBe('host');
      // What else the body text sets stays beside it.
      expect(migrateConfig({ bodyText: { fontFamily: 'Literata' } } as PostextConfig, v, { content: 'Words.' }).bodyText, String(v)).toMatchObject({ fontFamily: 'Literata', shapingLanguage: 'host' });
    }
    // A stamp that is no number counts as none.
    expect(kept(migrateConfig({}, '13'))).toBe('host');
    expect(kept(migrateConfig({}, null))).toBe('host');
    // A configuration stored under 12 whose text holds no task item (#765),
    // and one stored under 13 whatever its text holds, get this pin and no
    // other (their text known to set no mark, #1149).
    const stored: PostextConfig = { locale: 'tr', bodyText: { fontFamily: 'Literata' } };
    expect(migrateConfig(stored, 12, { content: 'Words.' })).toEqual({ locale: 'tr', bodyText: { fontFamily: 'Literata', shapingLanguage: 'host', breakAfterSlashes: false } });
    expect(migrateConfig(stored, 13, { content: 'Words.' })).toEqual({ locale: 'tr', bodyText: { fontFamily: 'Literata', shapingLanguage: 'host', breakAfterSlashes: false } });
    expect(migrateConfig(stored, 13, { content: '- [ ] a task\n\n:::page\n:::' })).toEqual({ locale: 'tr', bodyText: { fontFamily: 'Literata', shapingLanguage: 'host', breakAfterSlashes: false } });
    expect(migrateConfig({} as PostextConfig, 13, { content: 'Words.' })).toEqual({ bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } });
    expect(stored.bodyText).toEqual({ fontFamily: 'Literata' });
    // One that names the setting has nothing of it left to pin (the breaks
    // at a slash of 1.51 aside, #1164).
    for (const value of ['document', 'host'] as const) {
      const named: PostextConfig = { bodyText: { shapingLanguage: value } };
      for (const v of [12, 13, 14]) expect(migrateConfig(named, v, { content: 'Words.' })).toEqual(pinLegacySlashBreaks(named));
      expect(migrateConfig(named, 19, { content: 'Words.' })).toBe(named);
    }
    // One stored under today's rules is read as it is.
    for (const v of [19, CONFIG_VERSION, 99]) {
      const current: PostextConfig = {};
      expect(migrateConfig(current, v, { content: 'Words.' }), String(v)).toBe(current);
      const own: PostextConfig = { locale: 'ca', bodyText: { fontFamily: 'Literata' } };
      expect(migrateConfig(own, v, { content: 'Words.' }), String(v)).toBe(own);
    }
  });

  it('is pinned once: a migrated configuration read again is the same object', () => {
    for (const v of [undefined, 4, 8, 11, 12, 13]) {
      const once = migrateConfig({ bodyText: { fontFamily: 'Literata' } } as PostextConfig, v, { content: 'Words.' });
      expect(kept(once), String(v)).toBe('host');
      // Stored again under today's number, as every writer does.
      expect(migrateConfig(once, CONFIG_VERSION, { content: 'Words.' }), String(v)).toBe(once);
      // Read again under the number it had, the language is not pinned twice.
      expect(pinLegacyShapingLanguage(once), String(v)).toBe(once);
    }
    // Under 13 the language is the only pin: a second read under 13 changes
    // nothing either.
    const thirteen = migrateConfig({ locale: 'ca' } as PostextConfig, 13);
    expect(migrateConfig(thirteen, 13)).toBe(thirteen);
  });

  it('resolves to the setting only when the text is shaped in the host\'s language', () => {
    expect('shapingLanguage' in resolveAllConfig({}).bodyText).toBe(false);
    expect('shapingLanguage' in resolveAllConfig({ bodyText: { shapingLanguage: 'document' } }).bodyText).toBe(false);
    expect(resolveAllConfig({ bodyText: { shapingLanguage: 'host' } }).bodyText.shapingLanguage).toBe('host');
    // A new document, and one stored under 14, is shaped in its own
    // language: the default from postext 1.30, as in 1.29.0 alone before.
    expect(shapingLanguageOf(resolveAllConfig(migrateConfig({ locale: 'ca' }, 14)))).toBe('ca');
    expect(shapingLanguageOf(resolveAllConfig(migrateConfig({}, 14)))).toBe('en-US');
    // (its breaks at a slash pinned to 1.51's, #1164)
    expect(resolveAllConfig(migrateConfig({}, 14)).bodyText).toEqual(resolveAllConfig({ bodyText: { breakAfterSlashes: false } }).bodyText);
    // One read from before keeps the host's, written out: stamped 12 or
    // older, and stamped 13 with no value.
    for (const v of [undefined, 8, 12, 13]) {
      const read = resolveAllConfig(migrateConfig({ locale: 'ca' }, v));
      expect(read.bodyText.shapingLanguage, String(v)).toBe('host');
      expect(shapingLanguageOf(read), String(v)).toBeUndefined();
    }
    // One stamped 13 that asked for its own language keeps it.
    const asked = resolveAllConfig(migrateConfig({ locale: 'ca', bodyText: { shapingLanguage: 'document' } }, 13));
    expect('shapingLanguage' in asked.bodyText).toBe(false);
    expect(shapingLanguageOf(asked)).toBe('ca');
  });

  it('survives a save', () => {
    for (const v of [12, 13]) {
      for (const config of [{}, { bodyText: { fontFamily: 'Literata' } }] as PostextConfig[]) {
        const migrated = migrateConfig(config, v);
        const saved = stripConfigDefaults(migrated);
        expect(kept(saved)).toBe('host');
        const reloaded = migrateConfig(saved, CONFIG_VERSION);
        expect(reloaded).toBe(saved);
        expect(resolveAllConfig(reloaded).bodyText).toEqual(resolveAllConfig(migrated).bodyText);
        expect(kept(stripConfigDefaults(saved))).toBe('host');
      }
    }
    // A value is stored as written, the default too: the default changed
    // from one release to the next three times (1.29.0, 1.29.1, 1.30.0),
    // so the stored value says which was meant.
    expect(stripConfigDefaults({ bodyText: { shapingLanguage: 'document' } }).bodyText).toEqual({ shapingLanguage: 'document' });
    expect(stripConfigDefaults({ bodyText: { shapingLanguage: 'host' } }).bodyText).toEqual({ shapingLanguage: 'host' });
    // And a resolved configuration strips to what it was shaped in.
    expect(stripConfigDefaults(resolveAllConfig({ bodyText: { shapingLanguage: 'host' } })).bodyText).toEqual({ shapingLanguage: 'host' });
    expect(stripConfigDefaults(resolveAllConfig({})).bodyText).toBeUndefined();
  });

  it('pins a bundle on the bodyText in force', () => {
    // The locale's layer replaces the manifest's `bodyText` wholesale: the
    // pin goes on what is left in force.
    for (const v of [12, 13]) {
      const merged = migrateBundleConfig({}, [{ bodyText: { fontFamily: 'Amiri' } }, { bodyText: { fontFamily: 'Lora' } }], v);
      expect(merged.bodyText, String(v)).toEqual({ fontFamily: 'Lora', shapingLanguage: 'host', breakAfterSlashes: false });
      // A layer that names the setting keeps its word.
      expect(kept(migrateBundleConfig({}, [{ bodyText: { shapingLanguage: 'document' } }], v)), String(v)).toBe('document');
      expect(kept(migrateBundleConfig({}, [{ bodyText: { shapingLanguage: 'host' } }], v)), String(v)).toBe('host');
      // So does the reader's own base, when no layer replaces its body text.
      expect(kept(migrateBundleConfig({ bodyText: { shapingLanguage: 'document' } }, [{}], v)), String(v)).toBe('document');
      // The reader's own base is pinned with the rest when nothing names it.
      expect(kept(migrateBundleConfig({ bodyText: { fontFamily: 'Amiri' } }, [{}], v)), String(v)).toBe('host');
      expect(kept(migrateBundleConfig({}, [{}], v)), String(v)).toBe('host');
    }
    // A bundle from before 12 takes the pin of #725 with it.
    const older = migrateBundleConfig({}, [{ bodyText: { fontFamily: 'Amiri' } }, { bodyText: { fontFamily: 'Lora' } }], 11);
    expect(older.bodyText).toEqual({ fontFamily: 'Lora', scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    // A current bundle is read as written.
    expect(kept(migrateBundleConfig({}, [{}], 14))).toBeUndefined();
    expect(migrateBundleConfig({ bodyText: { fontFamily: 'Amiri' } }, [{}], 14).bodyText).toEqual({ fontFamily: 'Amiri', breakAfterSlashes: false });
  });

  it('a bundle written by postext 1.29 keeps its lines, and one written today is shaped in its language', async () => {
    const written = await createBundle({ name: 'Llibre', locale: 'ca', markdown: 'El col\u00B7legi.', config: { locale: 'ca', bodyText: { fontFamily: 'Literata' } } });
    expect(written.manifest.configVersion).toBe(21);
    expect(written.manifest.config?.bodyText).toEqual({ fontFamily: 'Literata' });
    /** The language the chapters of an opened bundle are laid out in. */
    const laidOutIn = (bundle: Awaited<ReturnType<typeof openBundle>>): string | undefined => shapingLanguageOf(resolveAllConfig(bundle.config));
    const today = await openBundle(written.bytes);
    expect(kept(today.config)).toBeUndefined();
    expect(laidOutIn(today)).toBe('ca');
    // The same archive under the stamp of postext 1.29, and under none.
    const files = unzipSync(written.bytes);
    const restamped = (configVersion: number | undefined, bodyText: PostextConfig['bodyText']): Uint8Array => {
      const manifest = JSON.parse(strFromU8(files['preset.json']!)) as Record<string, unknown>;
      if (configVersion === undefined) delete manifest.configVersion;
      else manifest.configVersion = configVersion;
      manifest.config = { ...(manifest.config as PostextConfig), bodyText };
      return zipSync({ ...files, 'preset.json': strToU8(JSON.stringify(manifest)) });
    };
    for (const v of [undefined, 12, 13]) {
      const old = await openBundle(restamped(v, { fontFamily: 'Literata' }));
      expect(kept(old.config), String(v)).toBe('host');
      expect(laidOutIn(old), String(v)).toBeUndefined();
    }
    const asked = await openBundle(restamped(13, { fontFamily: 'Literata', shapingLanguage: 'document' }));
    expect(kept(asked.config)).toBe('document');
    expect(laidOutIn(asked)).toBe('ca');
    // Written again from what was read, the language it was laid out in
    // goes with it under today's number.
    const old = await openBundle(restamped(13, { fontFamily: 'Literata' }));
    const again = await createBundle({ name: 'Llibre', locale: 'ca', markdown: 'El col\u00B7legi.', config: stripConfigDefaults(old.config) });
    expect(again.manifest.configVersion).toBe(21);
    expect(again.manifest.config?.bodyText).toEqual({ fontFamily: 'Literata', shapingLanguage: 'host', breakAfterSlashes: false });
    expect(kept((await openBundle(again.bytes)).config)).toBe('host');
  });
});
