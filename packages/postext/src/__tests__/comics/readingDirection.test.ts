import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveAllConfig } from '../../pipeline/config';
import { comicReadingDirection, resolvedComics } from '../../defaults/comics';
import { comicPageDirection } from '../../comics/layoutPage';
import { comicsLocaleDirection } from '../../locale';
import type { ComicsConfig, PostextConfig } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** The comic reading direction and the binding of a document (#593). */
function edition(config: PostextConfig): { direction: 'ltr' | 'rtl'; binding: 'left' | 'right' } {
  const resolved = resolveAllConfig(config);
  return {
    direction: comicPageDirection({ attrs: {} }, resolvedComics(resolved), resolved),
    binding: resolved.page.binding,
  };
}

const western: ComicsConfig = {};
const manga: ComicsConfig = { artDirection: 'rtl' };

describe('comics reading direction and binding by language (#593)', () => {
  it('reads comics right to left in Japanese and Traditional Chinese only', () => {
    for (const tag of ['ja', 'ja-JP', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-HK']) expect(comicsLocaleDirection(tag)).toBe('rtl');
    for (const tag of ['zh', 'zh-Hans', 'zh-CN', 'zh-SG', 'ko', 'ko-KR', 'en', 'es', 'ar', undefined, '']) expect(comicsLocaleDirection(tag)).toBeUndefined();
  });

  it('turns a Japanese edition of a Western comic right to left, bound on the right', () => {
    expect(edition({ locale: 'ja', comics: western })).toEqual({ direction: 'rtl', binding: 'right' });
  });

  it('keeps an explicit left-to-right reading direction, and the left binding with it', () => {
    expect(edition({ locale: 'ja', comics: { readingDirection: 'ltr' } })).toEqual({ direction: 'ltr', binding: 'left' });
  });

  it('keeps a Western comic left to right in Simplified Chinese and Korean', () => {
    expect(edition({ locale: 'zh-Hans', comics: western })).toEqual({ direction: 'ltr', binding: 'left' });
    expect(edition({ locale: 'zh-CN', comics: western })).toEqual({ direction: 'ltr', binding: 'left' });
    expect(edition({ locale: 'ko', comics: western })).toEqual({ direction: 'ltr', binding: 'left' });
  });

  it('turns a Traditional Chinese edition right to left', () => {
    expect(edition({ locale: 'zh-Hant', comics: western })).toEqual({ direction: 'rtl', binding: 'right' });
    expect(edition({ locale: 'zh-TW', comics: western })).toEqual({ direction: 'rtl', binding: 'right' });
  });

  it('turns an Arabic edition right to left', () => {
    expect(edition({ locale: 'ar', comics: western })).toEqual({ direction: 'rtl', binding: 'right' });
  });

  it('reads a manga right to left in English, bound on the right', () => {
    expect(edition({ locale: 'en', comics: manga })).toEqual({ direction: 'rtl', binding: 'right' });
  });

  it('keeps a Western comic in English left to right and left-bound', () => {
    expect(edition({ locale: 'en', comics: western })).toEqual({ direction: 'ltr', binding: 'left' });
  });

  it('reads right to left in a vertical document', () => {
    expect(edition({ locale: 'zh-Hans', layout: { writingMode: 'vertical-rl' }, comics: western })).toEqual({ direction: 'rtl', binding: 'right' });
  });

  it('lets an explicit binding win', () => {
    expect(edition({ locale: 'ja', page: { binding: 'left' }, comics: western })).toEqual({ direction: 'rtl', binding: 'left' });
    expect(edition({ locale: 'en', page: { binding: 'right' }, comics: western })).toEqual({ direction: 'ltr', binding: 'right' });
  });

  it('lets a page’s own direction win over the document’s', () => {
    const resolved = resolveAllConfig({ locale: 'ja', comics: western });
    expect(comicPageDirection({ attrs: { direction: 'ltr' } }, resolvedComics(resolved), resolved)).toBe('ltr');
  });

  it('leaves the binding of a document without a comics section alone', () => {
    expect(resolveAllConfig({ locale: 'ja' }).page.binding).toBe('left');
    expect(resolveAllConfig({ locale: 'zh-Hant' }).page.binding).toBe('left');
    expect(resolveAllConfig({ locale: 'ja', layout: { writingMode: 'vertical-rl' } }).page.binding).toBe('right');
  });

  it('resolves the same direction from a raw or a resolved comics section', () => {
    const doc = { locale: 'ja', direction: 'ltr' as const, writingMode: 'horizontal-tb' as const };
    expect(comicReadingDirection(undefined, doc)).toBe('rtl');
    expect(comicReadingDirection({ readingDirection: 'auto' }, { ...doc, locale: 'en' })).toBe('ltr');
    expect(comicReadingDirection({ readingDirection: 'auto', artDirection: 'rtl' }, { ...doc, locale: 'en' })).toBe('rtl');
    expect(comicReadingDirection({ readingDirection: 'ltr', artDirection: 'rtl' }, { ...doc, direction: 'rtl' })).toBe('ltr');
  });

  it('lays a Japanese edition out right to left and marks the book right-bound', () => {
    const md = 'Text.\n\n:::page{split="[* | *]"}\n::panel\n::panel\n:::';
    const doc = buildDocument({ markdown: md }, { page: { sizePreset: '17x24' }, locale: 'ja', comics: western });
    const comic = doc.pages.find((p) => p.comic)!.comic!;
    expect(comic.direction).toBe('rtl');
    expect(comic.panels[0]!.bbox.x).toBeGreaterThan(comic.panels[1]!.bbox.x);
    expect(doc.binding).toBe('right');
    const en = buildDocument({ markdown: md }, { page: { sizePreset: '17x24' }, locale: 'en', comics: western });
    expect(en.pages.find((p) => p.comic)!.comic!.direction).toBe('ltr');
    expect(en.binding).toBeUndefined();
  });
});
