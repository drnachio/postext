import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig } from '../../bundle/configVersion.js';
import { createBundle, openBundle } from '../../bundle/index.js';
import { resolveBodyTextConfig } from '../../defaults/text/bodyText/resolve.js';
import { stripBodyTextDefaults } from '../../defaults/text/bodyText/strip.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { renameLegacyLineBinding } from '../../defaults/text/bodyText/legacyBinding.js';
import type { BodyTextConfig, PostextConfig } from '../../types.js';

// #1532: postext 1.78 bound the space before a citation and around a lone
// operator with `bodyText.bindCitations` / `bindOperators: true`; 1.79
// prices those breaks (`citationBreaks` / `operatorBreaks`, #1519). 1.78
// stored its configurations under today's configVersion, so the rename
// runs whatever the version.

/** A body text as 1.78 wrote it: keys the configuration type no longer has. */
const old = (body: Record<string, unknown>): BodyTextConfig => body as BodyTextConfig;

describe('1.78 line binding keys (#1532)', () => {
  it('migrateConfig renames them under the current version', () => {
    const config: PostextConfig = { bodyText: old({ bindCitations: true, bindOperators: true, fontSize: { value: 10, unit: 'pt' } }) };
    const out = migrateConfig(config, CONFIG_VERSION);
    expect(out.bodyText).toEqual({ citationBreaks: 'avoid', operatorBreaks: 'avoid', fontSize: { value: 10, unit: 'pt' } });
    // The stored configuration is not touched.
    expect(config.bodyText).toHaveProperty('bindCitations', true);
    // Under an older number too, with the pins that number calls for.
    expect(migrateConfig({ bodyText: old({ bindOperators: true }) }, 21).bodyText).toMatchObject({ operatorBreaks: 'avoid' });
    expect(migrateConfig({ bodyText: old({ bindOperators: true }) }, 21).bodyText).not.toHaveProperty('bindOperators');
  });

  it('drops false, and an explicit new setting wins', () => {
    expect(migrateConfig({ bodyText: old({ bindCitations: false, bindOperators: false }) }, CONFIG_VERSION).bodyText).toEqual({});
    const out = migrateConfig({ bodyText: old({ bindCitations: true, citationBreaks: 'warn', bindOperators: true, operatorBreaks: 'allow' }) }, CONFIG_VERSION);
    expect(out.bodyText).toEqual({ citationBreaks: 'warn', operatorBreaks: 'allow' });
  });

  it('is idempotent, and returns a configuration without them as it is', () => {
    const plain: PostextConfig = { bodyText: { citationBreaks: 'avoid' } };
    expect(migrateConfig(plain, CONFIG_VERSION)).toBe(plain);
    expect(renameLegacyLineBinding(plain)).toBe(plain);
    const empty: PostextConfig = {};
    expect(migrateConfig(empty, CONFIG_VERSION)).toBe(empty);
    const once = migrateConfig({ bodyText: old({ bindCitations: true }) }, CONFIG_VERSION);
    expect(migrateConfig(once, CONFIG_VERSION)).toBe(once);
    expect(renameLegacyLineBinding(once)).toEqual(once);
  });

  it('renames them in the chapter styles', () => {
    const config: PostextConfig = {
      chapterStyles: [
        { id: 'plain', config: { bodyText: { textAlign: 'left' } } },
        { id: 'appendix', name: 'Appendix', config: { bodyText: old({ bindOperators: true }) } },
      ],
    };
    const out = migrateConfig(config, CONFIG_VERSION);
    expect(out.chapterStyles?.[0]).toBe(config.chapterStyles?.[0]);
    expect(out.chapterStyles?.[1]).toEqual({ id: 'appendix', name: 'Appendix', config: { bodyText: { operatorBreaks: 'avoid' } } });
  });

  it('renames the body text in force in a bundle', () => {
    expect(migrateBundleConfig({}, [{ bodyText: old({ bindCitations: true }) }, {}], CONFIG_VERSION).bodyText).toEqual({ citationBreaks: 'avoid' });
    // A locale layer (rules 21 on merge field by field) that sets the new
    // setting keeps it.
    expect(migrateBundleConfig({}, [{ bodyText: old({ bindCitations: true }) }, { bodyText: { citationBreaks: 'warn' } }], CONFIG_VERSION).bodyText)
      .toEqual({ citationBreaks: 'warn' });
  });

  it('reads a 1.78 bundle with the new setting', async () => {
    const made = await createBundle({ name: 'Old', markdown: '# A\n\nText [1].\n', config: { bodyText: old({ bindCitations: true }) } });
    const opened = await openBundle(made.bytes);
    expect(opened.config.bodyText?.citationBreaks).toBe('avoid');
    expect(opened.config.bodyText).not.toHaveProperty('bindCitations');
  });

  it('resolves them as an alias, for a configuration passed straight to the engine', () => {
    expect(resolveBodyTextConfig(old({ bindCitations: true })).citationBreaks).toBe('avoid');
    expect(resolveBodyTextConfig(old({ bindOperators: true })).operatorBreaks).toBe('avoid');
    expect(resolveBodyTextConfig(old({ bindCitations: false })).citationBreaks).toBe('allow');
    expect(resolveBodyTextConfig(old({ bindCitations: true, citationBreaks: 'warn' })).citationBreaks).toBe('warn');
    expect(resolveBodyTextConfig(old({ bindOperators: true, operatorBreaks: 'allow' })).operatorBreaks).toBe('allow');
  });

  it('keeps them as the new setting when the defaults are stripped', () => {
    expect(stripBodyTextDefaults(old({ bindCitations: true, bindOperators: false }))).toEqual({ citationBreaks: 'avoid' });
    expect(stripConfigDefaults({ bodyText: old({ bindOperators: true }) }).bodyText).toEqual({ operatorBreaks: 'avoid' });
  });
});
