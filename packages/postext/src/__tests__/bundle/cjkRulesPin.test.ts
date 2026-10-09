import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyCircledNumbers, pinLegacyDesignText, pinLegacyTitleBreaks } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import { stripConfigDefaults } from '../../defaults';
import type { PostextConfig } from '../../types';

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
    expect(migrateConfig(latin, 10, { content: 'A plain chapter.' })).toBe(latin);
    // CJK only in the configuration's own text (a running head written
    // out): the design text is pinned.
    const literal: PostextConfig = { locale: 'en', header: { elements: [{ kind: 'text', id: 'h', content: '紅樓夢' } as never] } };
    expect(migrateConfig(literal, 10, { content: 'A plain chapter.' }).cjk).toEqual({ composeDesignText: false });
    // Unknown content: every pin.
    expect(migrateConfig(config, 10).cjk).toEqual({ titleMinChars: 1, circledNumbers: 'western', composeDesignText: false });
  });

  it('pin every version before 11, none from 11', () => {
    for (const v of [undefined, 1, 5, 8, 9, 10]) {
      const cjk = migrateConfig(zh(), v, { content: '《說文》①' }).cjk;
      expect(cjk?.titleMinChars, String(v)).toBe(1);
      expect(cjk?.circledNumbers, String(v)).toBe('western');
      expect(cjk?.composeDesignText, String(v)).toBe(false);
    }
    const current = zh();
    expect(migrateConfig(current, 11, { content: '《說文》①' })).toBe(current);
  });

  it('pin a bundle on its merged cjk', () => {
    const base: PostextConfig = { cjk: { region: 'taiwan' } };
    const merged = migrateBundleConfig(base, [zh(), { cjk: { lineBreak: 'gb' } }], 10, { content: '《說文》' });
    expect(merged.cjk).toEqual({ lineBreak: 'gb', titleMinChars: 1, composeDesignText: false });
    expect(migrateBundleConfig(base, [zh()], 11, { content: '《說文》' }).cjk).toBe(base.cjk);
  });

  it('survive stripping the defaults', () => {
    const stripped = stripConfigDefaults(migrateConfig(zh(), 10));
    expect(stripped.cjk).toEqual({ titleMinChars: 1, circledNumbers: 'western', composeDesignText: false });
    expect(stripConfigDefaults(zh({ cjk: { titleMinChars: 2, circledNumbers: 'cjk', composeDesignText: true } })).cjk).toBeUndefined();
  });
});
