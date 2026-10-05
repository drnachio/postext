import { describe, expect, it } from 'vitest';
import { slugify, slugifyFilename, uniqueSlug } from './slugify';

describe('slugify', () => {
  it('strips accents and joins words with hyphens', () => {
    expect(slugify('Mapa de España, 1850')).toBe('mapa-de-espana-1850');
    expect(slugify('  ¡Hola!  ')).toBe('hola');
    expect(slugify('—')).toBe('');
  });

  it('keeps Chinese and Japanese letters, kana with their voicing marks', () => {
    expect(slugify('图1 长江流域')).toBe('图1-长江流域');
    expect(slugify('がっこうの地図')).toBe('がっこうの地図');
    expect(slugify('パンダ')).toBe('パンダ');
    // Half-width katakana come out full width, voiced.
    expect(slugify('ｶﾞｲﾄﾞ')).toBe('ガイド');
    expect(slugifyFilename('東京の地図.png')).toBe('東京の地図');
    expect(uniqueSlug(slugify('ガイド'), new Set(['ガイド']))).toBe('ガイド-2');
  });
});
