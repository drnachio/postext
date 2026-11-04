import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyCircledNumbers, pinLegacyDesignText, pinLegacyLatinSpacingEdge, pinLegacyNoteBreaks, pinLegacyTitleBreaks, pinLegacyScriptContext, pinLegacyShapingLanguage, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import type { PostextConfig } from '../../types.js';

// #637: a configuration stored before book titles kept two characters on
// either side of a break, circled numbers were set as Chinese characters
// and CJK design text was composed (configVersion 10 or older, postext
// 1.24 or earlier) keeps the 1.24 lines, when its text could show the
// difference.

const zh = (extra: PostextConfig = {}): PostextConfig => ({ locale: 'zh-Hant', ...extra });

describe('pins of #637', () => {
  it('pin each rule on a configuration that does not set it', () => {
    const config = zh({ cjk: { lineBreak: 'gb' } });
    expect(pinLegacyTitleBreaks(config).cjk).toEqual({ lineBreak: 'gb', titleMinChars: 1 });
    expect(pinLegacyCircledNumbers(config).cjk).toEqual({ lineBreak: 'gb', circledNumbers: 'western' });
    expect(pinLegacyDesignText(config).cjk).toEqual({ lineBreak: 'gb', composeDesignText: false });
    expect(pinLegacyTitleBreaks(zh()).cjk).toEqual({ titleMinChars: 1 });
    // The stored configuration is not touched.
    expect(config.cjk).toEqual({ lineBreak: 'gb' });
    const resolved = resolveAllConfig(migrateConfig(config, 10)).cjk;
    expect(resolved.titleMinChars).toBe(1);
    expect(resolved.circledNumbers).toBe('western');
    expect(resolved.composeDesignText).toBe(false);
    const today = resolveAllConfig(config).cjk;
    expect(today.titleMinChars).toBe(2);
    expect(today.circledNumbers).toBeUndefined();
    expect(today.composeDesignText).toBeUndefined();
  });

  it('leave a configuration that sets the rule as it is', () => {
    for (const cjk of [{ titleMinChars: 3 }, { titleMinChars: 2 }]) {
      const config = zh({ cjk });
      expect(pinLegacyTitleBreaks(config)).toBe(config);
    }
    const circled = zh({ cjk: { circledNumbers: 'cjk' } });
    expect(pinLegacyCircledNumbers(circled)).toBe(circled);
    const design = zh({ cjk: { composeDesignText: true } });
    expect(pinLegacyDesignText(design)).toBe(design);
  });

  it('pin only when the text could show the difference', () => {
    const config = zh();
    const titles = migrateConfig(config, 10, { content: '撰此《石頭記》一書也。' }).cjk;
    expect(titles).toEqual({ titleMinChars: 1, composeDesignText: false });
    expect(migrateConfig(config, 10, { content: ':book[石頭記]' }).cjk?.titleMinChars).toBe(1);
    const circled = migrateConfig(config, 10, { content: ['義項', '①天也。'] }).cjk;
    expect(circled).toEqual({ circledNumbers: 'western', composeDesignText: false });
    // Latin text with no CJK, in a configuration with none: nothing.
    const latin: PostextConfig = { locale: 'en', headings: { fontFamily: 'Literata' } };
    expect(migrateConfig(latin, 10, { content: 'A plain chapter.' })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(pinLegacyShapingLanguage(pinLegacyScriptContext(latin)))));
    // CJK only in the configuration's own text (a running head written
    // out): the design text is pinned.
    const literal: PostextConfig = { locale: 'en', header: { elements: [{ kind: 'text', id: 'h', content: '紅樓夢' } as never] } };
    expect(migrateConfig(literal, 10, { content: 'A plain chapter.' }).cjk).toEqual({ composeDesignText: false });
    // Unknown content: every pin, the note rule of 12 (#720) among them.
    expect(migrateConfig(config, 10).cjk).toEqual({ titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } });
  });

  it('pin every version before 11, none from 11', () => {
    for (const v of [undefined, 1, 5, 8, 9, 10]) {
      const cjk = migrateConfig(zh(), v, { content: '《說文》①' }).cjk;
      expect(cjk?.titleMinChars, String(v)).toBe(1);
      expect(cjk?.circledNumbers, String(v)).toBe('western');
      expect(cjk?.composeDesignText, String(v)).toBe(false);
    }
    const current = zh();
    expect(migrateConfig(current, 11, { content: '《說文》①' })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(pinLegacyShapingLanguage(pinLegacyScriptContext(current)))));
  });

  it('pin a bundle on its merged cjk', () => {
    const base: PostextConfig = { cjk: { region: 'taiwan' } };
    const merged = migrateBundleConfig(base, [zh(), { cjk: { lineBreak: 'gb' } }], 10, { content: '《說文》' });
    expect(merged.cjk).toEqual({ lineBreak: 'gb', titleMinChars: 1, composeDesignText: false });
    expect(migrateBundleConfig(base, [zh()], 11, { content: '《說文》' }).cjk).toBe(base.cjk);
  });

  it('survive stripping the defaults', () => {
    const stripped = stripConfigDefaults(migrateConfig(zh(), 10));
    expect(stripped.cjk).toEqual({ titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } });
    expect(stripConfigDefaults(zh({ cjk: { titleMinChars: 2, circledNumbers: 'cjk', composeDesignText: true, warichu: { minChars: 2 } } })).cjk).toBeUndefined();
  });
});

// #720: a configuration stored before a two-row note kept two of its
// characters on either side of a line break (configVersion 11 or older,
// postext 1.27 or earlier) keeps the 1.27 breaks, when it could hold a
// note.
describe('pin of #720', () => {
  const NOTE = '寶玉:warichu[此是第一首標題詩。]道';

  it('pins the note rule on a configuration that does not set it', () => {
    const config = zh({ cjk: { warichu: { open: '〔', close: '〕' } } });
    expect(pinLegacyNoteBreaks(config).cjk).toEqual({ warichu: { open: '〔', close: '〕', minChars: 1 } });
    expect(pinLegacyNoteBreaks(zh()).cjk).toEqual({ warichu: { minChars: 1 } });
    // The stored configuration is not touched.
    expect(config.cjk).toEqual({ warichu: { open: '〔', close: '〕' } });
    expect(resolveAllConfig(migrateConfig(config, 11, { content: NOTE })).cjk.warichu.minChars).toBe(1);
    expect(resolveAllConfig(config).cjk.warichu.minChars).toBe(2);
  });

  it('leaves a configuration that sets the rule as it is', () => {
    for (const minChars of [1, 2, 3]) {
      const config = zh({ cjk: { warichu: { minChars } } });
      expect(pinLegacyNoteBreaks(config)).toBe(config);
    }
  });

  it('pins only when the document could hold a note', () => {
    const config = zh();
    expect(migrateConfig(config, 11, { content: NOTE }).cjk).toEqual({ warichu: { minChars: 1 } });
    expect(migrateConfig(config, 11, { content: ['一章。', NOTE] }).cjk).toEqual({ warichu: { minChars: 1 } });
    // No note in the text: nothing.
    expect(migrateConfig(config, 11, { content: '撰此《石頭記》一書也。' })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(pinLegacyShapingLanguage(pinLegacyScriptContext(config)))));
    // Citations set as notes: the configuration itself says so.
    const cited = zh({ citations: { notes: 'warichu' } });
    expect(migrateConfig(cited, 11, { content: '一章。' }).cjk).toEqual({ warichu: { minChars: 1 } });
    expect(migrateConfig(zh({ citations: { notes: 'footnote' } }), 11, { content: '一章。' }).cjk).toBeUndefined();
    // Unknown content may hold one.
    expect(migrateConfig(config, 11).cjk).toEqual({ warichu: { minChars: 1 } });
  });

  it('pins every version before 12, none from 12', () => {
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(migrateConfig(zh(), v, { content: NOTE }).cjk?.warichu, String(v)).toEqual({ minChars: 1 });
    }
    const current = zh();
    // One stamped 12 or 13 takes the pin of the language alone (#764, #770);
    // one stamped 14 is read as it is.
    expect(migrateConfig(current, 12, { content: NOTE })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 13, { content: NOTE })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 14, { content: NOTE })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(current)));
  });

  it('pins a bundle on its merged cjk and citations', () => {
    const base: PostextConfig = { cjk: { region: 'taiwan' } };
    const merged = migrateBundleConfig(base, [zh(), { cjk: { lineBreak: 'gb' } }], 11, { content: NOTE });
    expect(merged.cjk).toEqual({ lineBreak: 'gb', warichu: { minChars: 1 } });
    const cited = migrateBundleConfig(base, [zh(), { citations: { notes: 'warichu' } }], 11, { content: '一章。' });
    expect(cited.cjk).toEqual({ region: 'taiwan', warichu: { minChars: 1 } });
    expect(migrateBundleConfig(base, [zh()], 12, { content: NOTE }).cjk).toBe(base.cjk);
  });

  it('survives stripping the defaults', () => {
    const stripped = stripConfigDefaults(migrateConfig(zh(), 11, { content: NOTE }));
    expect(stripped.cjk).toEqual({ warichu: { minChars: 1 } });
    expect(resolveAllConfig(stripped).cjk.warichu.minChars).toBe(1);
  });
});

// #721: a Japanese configuration stored before a Western word took the
// Han–Latin space next to its brackets and signs (configVersion 11 or
// older, postext 1.27 or earlier) keeps the space next to letters and
// digits alone, when its text holds kana or kanji.
describe('pin of #721', () => {
  const ja = (extra: PostextConfig = {}): PostextConfig => ({ locale: 'ja', ...extra });
  const TEXT = 'このnormalize()関数です。';
  const edge = (config: PostextConfig) => resolveAllConfig(config).cjk.latinSpacingEdge;

  it('pins the 1.27 rule on a Japanese configuration that does not set the key', () => {
    const config = ja({ cjk: { lineBreak: 'ja-strict' } });
    expect(pinLegacyLatinSpacingEdge(config).cjk).toEqual({ lineBreak: 'ja-strict', latinSpacingEdge: 'letters' });
    expect(pinLegacyLatinSpacingEdge(ja()).cjk).toEqual({ latinSpacingEdge: 'letters' });
    expect(config.cjk).toEqual({ lineBreak: 'ja-strict' });
    expect(edge(migrateConfig(config, 11, { content: TEXT }))).toBe('letters');
    expect(edge(config)).toBe('western');
    // The region the configuration resolves to: named, or read from the
    // locale or the hyphenation locale.
    expect(pinLegacyLatinSpacingEdge<PostextConfig>({ cjk: { region: 'japan' } }).cjk).toEqual({ region: 'japan', latinSpacingEdge: 'letters' });
    expect(pinLegacyLatinSpacingEdge<PostextConfig>({ bodyText: { hyphenation: { locale: 'ja' } } }).cjk).toEqual({ latinSpacingEdge: 'letters' });
    expect(pinLegacyLatinSpacingEdge<PostextConfig>({ locale: 'zh-Hant', cjk: { region: 'japan' } }).cjk?.latinSpacingEdge).toBe('letters');
  });

  it('leaves every other configuration as it is', () => {
    for (const config of [
      ja({ cjk: { latinSpacingEdge: 'western' } }),
      ja({ cjk: { latinSpacingEdge: 'letters' } }),
      ja({ cjk: { latinSpacingEdge: 'auto' } }),
      ja({ cjk: { region: 'taiwan' } }),
      zh(),
      { locale: 'zh-Hans' } as PostextConfig,
      { locale: 'en' } as PostextConfig,
      {} as PostextConfig,
    ]) {
      expect(pinLegacyLatinSpacingEdge(config)).toBe(config);
    }
  });

  it('pins only when the text holds kana or kanji', () => {
    expect(migrateConfig(ja(), 11, { content: TEXT }).cjk).toEqual({ latinSpacingEdge: 'letters' });
    expect(migrateConfig(ja(), 11, { content: ['A Latin chapter.', TEXT] }).cjk).toEqual({ latinSpacingEdge: 'letters' });
    const latin = ja();
    expect(migrateConfig(latin, 11, { content: 'A chapter with no kana at all.' })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(pinLegacyShapingLanguage(pinLegacyScriptContext(latin)))));
    // Unknown content may hold some (and a note: the pin of #720 too).
    expect(migrateConfig(ja(), 11).cjk).toEqual({ warichu: { minChars: 1 }, latinSpacingEdge: 'letters' });
    // A Chinese document is never pinned.
    const chinese = zh();
    expect(migrateConfig(chinese, 11, { content: '撰此一書也。' })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(pinLegacyShapingLanguage(pinLegacyScriptContext(chinese)))));
  });

  it('pins every version before 12, none from 12', () => {
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(migrateConfig(ja(), v, { content: TEXT }).cjk?.latinSpacingEdge, String(v)).toBe('letters');
    }
    const current = ja();
    // One stamped 12 or 13 takes the pin of the language alone (#764, #770);
    // one stamped 14 is read as it is.
    expect(migrateConfig(current, 12, { content: TEXT })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 13, { content: TEXT })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 14, { content: TEXT })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(current)));
  });

  it('pins a bundle on the merged configuration of each locale', () => {
    // An English base with a Japanese edition: the edition is pinned, the
    // base edition is not.
    const base: PostextConfig = { cjk: { lineBreak: 'strict' } };
    const edition = migrateBundleConfig(base, [{ locale: 'en' }, { locale: 'ja' }], 11, { content: TEXT });
    expect(edition.cjk).toEqual({ lineBreak: 'strict', latinSpacingEdge: 'letters' });
    expect(migrateBundleConfig(base, [{ locale: 'en' }], 11, { content: TEXT }).cjk).toBe(base.cjk);
    expect(migrateBundleConfig(base, [{ locale: 'ja' }], 12, { content: TEXT }).cjk).toBe(base.cjk);
  });

  it('survives stripping the defaults', () => {
    const stripped = stripConfigDefaults(migrateConfig(ja(), 11, { content: TEXT }));
    expect(stripped.cjk).toEqual({ latinSpacingEdge: 'letters' });
    expect(edge(stripped)).toBe('letters');
    expect(migrateConfig(stripped, 12, { content: TEXT })).toBe(stripped);
  });
});
