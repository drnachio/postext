import { describe, it, expect } from 'vitest';
import { resolveCjkConfig, stripCjkDefaults, cjkRegionOfLocale } from '../../defaults/cjk';
import { stripConfigDefaults } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';

describe('cjk config', () => {
  it('reads the region from the locale', () => {
    expect(cjkRegionOfLocale('zh')).toBe('mainland');
    expect(cjkRegionOfLocale('zh-Hans')).toBe('mainland');
    expect(cjkRegionOfLocale('zh-CN')).toBe('mainland');
    expect(cjkRegionOfLocale('zh-SG')).toBe('mainland');
    expect(cjkRegionOfLocale('zh-Hans-CN')).toBe('mainland');
    expect(cjkRegionOfLocale('zh-Hant')).toBe('taiwan');
    expect(cjkRegionOfLocale('zh-TW')).toBe('taiwan');
    expect(cjkRegionOfLocale('zh-Hant-TW')).toBe('taiwan');
    expect(cjkRegionOfLocale('zh-HK')).toBe('hongkong');
    expect(cjkRegionOfLocale('zh-Hant-HK')).toBe('hongkong');
    expect(cjkRegionOfLocale('zh-MO')).toBe('hongkong');
    expect(cjkRegionOfLocale('zh_TW')).toBe('taiwan');
    expect(cjkRegionOfLocale('ja')).toBeUndefined();
    expect(cjkRegionOfLocale('es')).toBeUndefined();
    expect(cjkRegionOfLocale('not a tag!')).toBeUndefined();
    expect(cjkRegionOfLocale(undefined)).toBeUndefined();
  });

  it('resolves auto per region: gb on the mainland, basic in Taiwan and Hong Kong', () => {
    expect(resolveCjkConfig(undefined, 'zh-Hans')).toEqual({ region: 'mainland', lineBreak: 'gb' });
    expect(resolveCjkConfig(undefined, 'zh-TW')).toEqual({ region: 'taiwan', lineBreak: 'basic' });
    expect(resolveCjkConfig(undefined, 'zh-HK')).toEqual({ region: 'hongkong', lineBreak: 'basic' });
    expect(resolveCjkConfig(undefined, 'en')).toEqual({ region: 'mainland', lineBreak: 'gb' });
    expect(resolveCjkConfig({ region: 'taiwan' }, 'zh-CN')).toEqual({ region: 'taiwan', lineBreak: 'basic' });
    expect(resolveCjkConfig({ lineBreak: 'strict' }, 'zh-TW')).toEqual({ region: 'taiwan', lineBreak: 'strict' });
    expect(resolveCjkConfig({ lineBreak: 'bogus' as never, region: 'mars' as never }, 'zh-HK')).toEqual({ region: 'hongkong', lineBreak: 'basic' });
  });

  it('strips auto and keeps the rest', () => {
    expect(stripCjkDefaults({ region: 'auto', lineBreak: 'auto' })).toBeUndefined();
    expect(stripCjkDefaults({ region: 'auto', lineBreak: 'none' })).toEqual({ lineBreak: 'none' });
    expect(stripConfigDefaults({ cjk: { region: 'auto' } }).cjk).toBeUndefined();
    expect(stripConfigDefaults({ cjk: { region: 'hongkong' } }).cjk).toEqual({ region: 'hongkong' });
  });

  it('is resolved with the document language', () => {
    expect(resolveAllConfig({ locale: 'zh-Hant' }).cjk).toEqual({ region: 'taiwan', lineBreak: 'basic' });
    expect(resolveAllConfig(undefined).cjk).toEqual({ region: 'mainland', lineBreak: 'gb' });
  });
});
