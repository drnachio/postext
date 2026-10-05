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
    expect(cjkRegionOf('ja')).toBe('japan');
    expect(cjkRegionOf('ja-JP')).toBe('japan');
    expect(cjkRegionOf('ko')).toBeUndefined();
    expect(cjkRegionOf('es')).toBeUndefined();
    expect(cjkRegionOf('not a tag!')).toBeUndefined();
    expect(cjkRegionOf(undefined)).toBeUndefined();
  });

  it('resolves auto per region: gb on the mainland, basic in Taiwan and Hong Kong', () => {
    expect(resolveCjkConfig(undefined, 'zh-Hans')).toMatchObject({ region: 'mainland', lineBreak: 'gb' });
    expect(resolveCjkConfig(undefined, 'zh-TW')).toMatchObject({ region: 'taiwan', lineBreak: 'basic' });
    expect(resolveCjkConfig(undefined, 'zh-HK')).toMatchObject({ region: 'hongkong', lineBreak: 'basic' });
    expect(resolveCjkConfig(undefined, 'en')).toMatchObject({ region: 'mainland', lineBreak: 'gb' });
    expect(resolveCjkConfig({ region: 'taiwan' }, 'zh-CN')).toMatchObject({ region: 'taiwan', lineBreak: 'basic' });
    expect(resolveCjkConfig(undefined, 'ja')).toMatchObject({ region: 'japan', lineBreak: 'strict' });
    expect(resolveCjkConfig({ region: 'japan' }, 'zh-CN')).toMatchObject({ region: 'japan', lineBreak: 'strict' });
    expect(resolveCjkConfig({ lineBreak: 'strict' }, 'zh-TW')).toMatchObject({ region: 'taiwan', lineBreak: 'strict' });
    expect(resolveCjkConfig({ lineBreak: 'bogus' as never, region: 'mars' as never }, 'zh-HK')).toMatchObject({ region: 'hongkong', lineBreak: 'basic' });
  });

  it('strips auto and keeps the rest', () => {
    expect(stripCjkDefaults({ region: 'auto', lineBreak: 'auto' })).toBeUndefined();
    expect(stripCjkDefaults({ region: 'auto', lineBreak: 'none' })).toEqual({ lineBreak: 'none' });
    expect(stripConfigDefaults({ cjk: { region: 'auto' } }).cjk).toBeUndefined();
    expect(stripConfigDefaults({ cjk: { region: 'hongkong' } }).cjk).toEqual({ region: 'hongkong' });
    expect(stripCjkDefaults({
      punctuationWidth: 'auto', compressAdjacent: 'auto', trimLineStart: 'auto', hangingPunctuation: 'none',
      latinSpacing: { value: 0.25, unit: 'em' }, grid: { enabled: false, show: false },
    })).toBeUndefined();
    expect(stripCjkDefaults({ punctuationWidth: 'halfwidth', compressAdjacent: false, hangingPunctuation: 'allow', latinSpacing: { value: 0, unit: 'em' }, grid: { enabled: true, charsPerLine: 28 } }))
      .toEqual({ punctuationWidth: 'halfwidth', compressAdjacent: false, hangingPunctuation: 'allow', latinSpacing: { value: 0, unit: 'em' }, grid: { enabled: true, charsPerLine: 28 } });
  });

  it('resolves the punctuation settings per region', () => {
    expect(resolveCjkConfig(undefined, 'zh-CN')).toMatchObject({ punctuationWidth: 'kaiming', compressAdjacent: true, trimLineStart: true, hangingPunctuation: 'none' });
    expect(resolveCjkConfig(undefined, 'zh-Hant-TW')).toMatchObject({ punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false });
    expect(resolveCjkConfig(undefined, 'zh-HK')).toMatchObject({ punctuationWidth: 'fullwidth', compressAdjacent: true, trimLineStart: true });
    expect(resolveCjkConfig({ punctuationWidth: 'lineEndHalf', compressAdjacent: false, trimLineStart: 'auto' }, 'zh-HK'))
      .toMatchObject({ punctuationWidth: 'lineEndHalf', compressAdjacent: false, trimLineStart: true });
    expect(resolveCjkConfig({ punctuationWidth: 'odd' as never, hangingPunctuation: 'sometimes' as never }, 'zh')).toMatchObject({ punctuationWidth: 'kaiming', hangingPunctuation: 'none' });
    expect(resolveCjkConfig(undefined, 'zh').latinSpacing).toEqual({ value: 0.25, unit: 'em' });
    expect(resolveCjkConfig({ latinSpacing: { value: -1, unit: 'em' } }, 'zh').latinSpacing).toEqual({ value: 0.25, unit: 'em' });
    expect(resolveCjkConfig({ latinSpacing: { value: 2, unit: 'pt' } }, 'zh').latinSpacing).toEqual({ value: 2, unit: 'pt' });
  });

  it('resolves the grid only when it is on', () => {
    expect(resolveCjkConfig(undefined, 'zh').grid).toEqual({ enabled: false, charsPerLine: 0, linesPerPage: 0, show: false });
    expect(resolveCjkConfig({ grid: { charsPerLine: 28, show: true } }, 'zh').grid).toEqual({ enabled: false, charsPerLine: 0, linesPerPage: 0, show: false });
    expect(resolveCjkConfig({ grid: { enabled: true, charsPerLine: 28.7, linesPerPage: '27' as never, show: true } }, 'zh').grid)
      .toEqual({ enabled: true, charsPerLine: 28, linesPerPage: 27, show: true });
  });

  it('is resolved with the document language', () => {
    expect(resolveAllConfig({ locale: 'zh-Hant' }).cjk).toMatchObject({ region: 'taiwan', lineBreak: 'basic' });
    expect(resolveAllConfig(undefined).cjk).toMatchObject({ region: 'mainland', lineBreak: 'gb' });
  });
});
