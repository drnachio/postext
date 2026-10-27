import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { comicReadingDirection, resolvedComics } from '../../defaults/comics.js';
import { comicPageDirection } from '../../comics/layoutPage.js';
import { comicsLocaleDirection } from '../../hyphenation/locale.js';
import type { ComicsConfig, PostextConfig, Resource } from '../../types.js';

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

// #727: `tail=left` and `tail=right` name a side of the panel's picture
// as stored, so one script line is right in every edition of a comic;
// `start` and `end` follow the reading direction of the page.
describe('the side an off-panel tail runs to (#727)', () => {
  // The keeper speaks from off the panel; his light is on the right of
  // the picture.
  const sea: Resource = {
    id: 'sea', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'sea', format: 'png', width: 1200, height: 800 },
    anchors: [{ id: 'skipper', x: 0.28, y: 0.63 }],
  };
  /** The border the tail ends on, and whether the picture is mirrored. */
  function tailOf(tail: string, direction: 'ltr' | 'rtl', o: { comics?: ComicsConfig; panel?: string } = {}) {
    const markdown = `:::page{direction=${direction}}\n::panel${o.panel ?? '{art=sea}'}\ntomas{tail=${tail}}: Easy now. Bring her round slow.\n:::\n`;
    const doc = buildDocument({ markdown, resources: [sea] }, { page: { sizePreset: '17x24' }, comics: o.comics ?? {} });
    const comic = doc.pages.find((p) => p.comic)!.comic!;
    const panel = comic.panels[0]!;
    const tip = comic.balloons[0]!.tailTip!;
    const side = Math.abs(tip.x - panel.bbox.x) < 1 ? 'left' : Math.abs(tip.x - panel.bbox.x - panel.bbox.width) < 1 ? 'right' : 'neither';
    return { side, mirrored: panel.art?.mirrored === true, tip };
  }
  const mirroring: ComicsConfig = { artDirection: 'ltr', mirrorArt: true };

  it('right is the right border on a left-to-right and on a right-to-left page, the picture as drawn', () => {
    expect(tailOf('right', 'ltr')).toMatchObject({ side: 'right', mirrored: false });
    expect(tailOf('right', 'rtl')).toMatchObject({ side: 'right', mirrored: false });
    expect(tailOf('left', 'ltr').side).toBe('left');
    expect(tailOf('left', 'rtl').side).toBe('left');
  });

  it('turns over with a mirrored picture', () => {
    expect(tailOf('right', 'rtl', { comics: mirroring })).toMatchObject({ side: 'left', mirrored: true });
    expect(tailOf('left', 'rtl', { comics: mirroring })).toMatchObject({ side: 'right', mirrored: true });
    // One panel of a mirrored book kept as drawn.
    expect(tailOf('right', 'rtl', { comics: mirroring, panel: '{art=sea mirror=false}' })).toMatchObject({ side: 'right', mirrored: false });
    // And one panel mirrored by hand.
    expect(tailOf('right', 'ltr', { panel: '{art=sea mirror}' })).toMatchObject({ side: 'left', mirrored: true });
  });

  it('is the page\'s right in a panel with no picture', () => {
    expect(tailOf('right', 'rtl', { panel: '' }).side).toBe('right');
    expect(tailOf('right', 'rtl', { comics: mirroring, panel: '' }).side).toBe('right');
    expect(tailOf('left', 'ltr', { panel: '' }).side).toBe('left');
  });

  it('start and end keep following the page', () => {
    expect(tailOf('end', 'ltr').side).toBe('right');
    expect(tailOf('end', 'rtl').side).toBe('left');
    expect(tailOf('start', 'rtl').side).toBe('right');
    expect(tailOf('end', 'rtl', { comics: mirroring })).toMatchObject({ side: 'left', mirrored: true });
  });

  it('gives the tail start or end gave where the two name the same border', () => {
    expect(tailOf('right', 'ltr').tip).toEqual(tailOf('end', 'ltr').tip);
    expect(tailOf('right', 'rtl').tip).toEqual(tailOf('start', 'rtl').tip);
  });
});
