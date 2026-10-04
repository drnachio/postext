import { describe, expect, it } from 'vitest';
import { directionOf } from '../locale';
import { resolveAllConfig, resolvedDirection } from '../pipeline/config';
import { resolvePageBinding, resolvePageConfig } from '../defaults/page';
import { collectConfigWarnings } from '../configWarnings';
import { parseMarkdown } from '../parse';
import type { PostextConfig } from '../types';

describe('directionOf', () => {
  it('reads right-to-left scripts from the language', () => {
    for (const tag of ['ar', 'ar-EG', 'ar-MA', 'fa', 'ur', 'ps', 'ug', 'he', 'yi', 'dv', 'syr', 'nqo', 'ff-Adlm', 'az-Arab', 'pa-Arab', 'ckb']) {
      expect(directionOf(tag), tag).toBe('rtl');
    }
  });

  it('is ltr for everything else', () => {
    for (const tag of ['en', 'en-us', 'es', 'zh-Hant', 'ja', 'az', 'ff', 'pa', 'tr', 'ru', '', 'not a tag', undefined, 42]) {
      expect(directionOf(tag), String(tag)).toBe('ltr');
    }
  });
});

describe('PostextConfig.direction', () => {
  it('resolves auto from the document language', () => {
    expect(resolvedDirection(resolveAllConfig({ locale: 'ar' }))).toBe('rtl');
    expect(resolvedDirection(resolveAllConfig({ locale: 'en' }))).toBe('ltr');
    // The hyphenation locale stands in for an unset `locale`.
    expect(resolvedDirection(resolveAllConfig({ bodyText: { hyphenation: { locale: 'he' } } }))).toBe('rtl');
    expect(resolvedDirection(resolveAllConfig(undefined))).toBe('ltr');
  });

  it('takes an explicit direction over the language', () => {
    expect(resolvedDirection(resolveAllConfig({ locale: 'ar', direction: 'ltr' }))).toBe('ltr');
    expect(resolvedDirection(resolveAllConfig({ locale: 'en', direction: 'rtl' }))).toBe('rtl');
    expect(resolvedDirection(resolveAllConfig({ locale: 'ar', direction: 'auto' }))).toBe('rtl');
  });

  it('leaves a left-to-right resolved config as it was', () => {
    expect('direction' in resolveAllConfig({ locale: 'en' })).toBe(false);
    expect('direction' in resolveAllConfig({ locale: 'ar', direction: 'ltr' })).toBe(false);
    expect(resolveAllConfig({ locale: 'ar' }).direction).toBe('rtl');
  });

  it('binds a right-to-left book on the right', () => {
    expect(resolveAllConfig({ locale: 'ar' }).page.binding).toBe('right');
    expect(resolveAllConfig({ locale: 'ar', page: { sizePreset: '12x19' } }).page.binding).toBe('right');
    expect(resolveAllConfig({ locale: 'ar', page: { binding: 'left' } }).page.binding).toBe('left');
    expect(resolveAllConfig({ locale: 'en' }).page.binding).toBe('left');
    expect(resolvePageBinding('auto', 'horizontal-tb', 'rtl')).toBe('right');
    expect(resolvePageBinding(undefined, 'vertical-rl', 'ltr')).toBe('right');
    expect(resolvePageBinding('auto', undefined, 'ltr')).toBe('left');
    expect(resolvePageConfig(undefined, 'ar', undefined, 'rtl').binding).toBe('right');
  });

  it('reports a value it does not know and reads it as auto', () => {
    const config = { locale: 'ar', direction: 'right' } as unknown as PostextConfig;
    expect(collectConfigWarnings(config)).toContainEqual({ kind: 'unknownConfigValue', path: 'direction', value: 'right', used: 'rtl' });
    expect(resolvedDirection(resolveAllConfig(config))).toBe('rtl');
    expect(collectConfigWarnings({ direction: 'rtl' }).filter((w) => w.kind === 'unknownConfigValue')).toEqual([]);
    expect(collectConfigWarnings({ direction: 'auto' }).filter((w) => w.kind === 'unknownConfigValue')).toEqual([]);
  });
});

describe('block {dir=…}', () => {
  it('sets a heading direction', () => {
    const [h, p] = parseMarkdown('# Title {dir=rtl}\n\nText.');
    expect(h!.direction).toBe('rtl');
    expect(h!.text).toBe('Title');
    expect(p!.direction).toBeUndefined();
  });

  it('sets a container and the blocks inside it', () => {
    const blocks = parseMarkdown([
      ':::paragraphs{dir=rtl}',
      '# Inside {dir=ltr}',
      '',
      'نص.',
      '',
      ':::callout{dir=LTR}',
      'English.',
      ':::',
      '',
      'نص آخر.',
      ':::',
      '',
      'After.',
    ].join('\n'));
    const dirs = blocks.map((b) => [b.type, b.direction]);
    expect(dirs).toEqual([
      ['containerStart', 'rtl'],
      ['heading', 'ltr'],
      ['paragraph', 'rtl'],
      ['containerStart', 'ltr'],
      ['paragraph', 'ltr'],
      ['containerEnd', undefined],
      ['paragraph', 'rtl'],
      ['containerEnd', undefined],
      ['paragraph', undefined],
    ]);
  });

  it('ignores a value other than ltr or rtl', () => {
    const [start, p] = parseMarkdown(':::callout{dir=sideways}\nText.\n:::');
    expect(start!.direction).toBeUndefined();
    expect(p!.direction).toBeUndefined();
    expect(start!.containerAttrs?.dir).toBe('sideways');
  });

  it('keeps LTR documents free of the field', () => {
    for (const b of parseMarkdown('# A\n\nText *b* :smallcaps[c].\n\n- item\n\n> quote')) expect('direction' in b).toBe(false);
  });
});
