import { describe, it, expect } from 'vitest';
import { resolveCjkConfig, stripCjkDefaults } from '../../defaults/cjk';
import { cjkRegionOf } from '../../locale';
import { stripConfigDefaults } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';

describe('cjk config', () => {
  it('reads the region from the locale', () => {
    expect(cjkRegionOf('zh')).toBe('mainland');
    expect(cjkRegionOf('zh-Hans')).toBe('mainland');
    expect(cjkRegionOf('zh-CN')).toBe('mainland');
    expect(cjkRegionOf('zh-SG')).toBe('mainland');
    expect(cjkRegionOf('zh-Hans-CN')).toBe('mainland');
    expect(cjkRegionOf('zh-Hant')).toBe('taiwan');
    expect(cjkRegionOf('zh-TW')).toBe('taiwan');
    expect(cjkRegionOf('zh-Hant-TW')).toBe('taiwan');
    expect(cjkRegionOf('zh-HK')).toBe('hongkong');
    expect(cjkRegionOf('zh-Hant-HK')).toBe('hongkong');
    expect(cjkRegionOf('zh-MO')).toBe('hongkong');
    expect(cjkRegionOf('zh-MY')).toBe('mainland');
    expect(cjkRegionOf('zh-Hant-MY')).toBe('mainland');
    expect(cjkRegionOf('zh_TW')).toBe('taiwan');
    expect(cjkRegionOf('ja')).toBeUndefined();
    expect(cjkRegionOf('es')).toBeUndefined();
    expect(cjkRegionOf('not a tag!')).toBeUndefined();
    expect(cjkRegionOf(undefined)).toBeUndefined();
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
