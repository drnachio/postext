// What the HTML viewer measures before its layout (the width of its
// column, the lines a part title wraps to) on a page in another language
// than the document (#770): measured in the language the layout sets the
// text in, so neither depends on the page that hosts the Sandbox.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, PlacedDesignElement } from 'postext';
import { installLanguageCanvas, LanguageContext } from '../../../controls/language/languageCanvasStub.js';
import { configShapingLanguage } from '../../../controls/language/measureLanguage.js';
import { buildHtmlConfigOverride, measureColumnWidthPx } from './configOverride.js';

// The page that hosts the Sandbox is in English.
installLanguageCanvas();

const opts = {
  fontScale: 1,
  columnMode: 'multi' as const,
  // Four numbers of a part title set at 40 px with 10 px spaces take
  // 331.44 px in Chinese (digits of 18.84 px) and 382 px in English (22 px).
  pageWidthPx: 350,
  layoutType: 'single' as const,
  viewportHeightPx: 900,
  locale: 'en',
  optimalLineBreaking: false,
};

const book = (shapingLanguage: 'document' | 'host'): PostextConfig => ({
  locale: 'zh-Hans',
  bodyText: { shapingLanguage },
  // 20 pt type on 30 pt lines: 40 px on 60 px at the viewer's 144 dpi.
  headings: { levels: [{ level: 1, fontSize: { value: 20, unit: 'pt' }, lineHeight: { value: 30, unit: 'pt' } }] },
});

const bandHeight = (config: PostextConfig): unknown =>
  (buildHtmlConfigOverride(config, { ...opts, partTitles: ['2026 2027 2028 2029'] }).parts!.design!.elements[0] as PlacedDesignElement).placement.size;

describe('the HTML viewer on a page in another language (#770)', () => {
  it('counts the lines of a part title as the layout sets it', () => {
    // One line in Chinese: the band is one line tall. Measured in the
    // page's English the title wrapped, and the band kept a second line.
    expect(bandHeight(book('document'))).toEqual({ width: 'fill', height: { value: 60, unit: 'px' } });
  });

  it('counts them in the host\'s language for a document shaped in it, as before', () => {
    expect(bandHeight(book('host'))).toEqual({ width: 'fill', height: { value: 120, unit: 'px' } });
    LanguageContext.host = 'zh';
    try {
      // Other type sizes than above: nothing measured before answers.
      const larger = { ...book('host'), headings: { levels: [{ level: 1 as const, fontSize: { value: 20.5, unit: 'pt' as const }, lineHeight: { value: 30, unit: 'pt' as const } }] } };
      expect((buildHtmlConfigOverride(larger, { ...opts, pageWidthPx: 360, partTitles: ['2026 2027 2028 2029'] }).parts!.design!.elements[0] as PlacedDesignElement).placement.size)
        .toEqual({ width: 'fill', height: { value: 60, unit: 'px' } });
    } finally {
      LanguageContext.host = 'en';
    }
  });

  it('measures the column in the language the layout measures in', () => {
    const sample = '0123456789';
    const own = configShapingLanguage(book('document'), 'en');
    expect(own).toBe('zh-Hans');
    expect(measureColumnWidthPx(sample, 'Song', 16, 400, own)).toBeCloseTo(10 * 0.471 * 16, 6);
    const host = configShapingLanguage(book('host'), 'en');
    expect(host).toBeUndefined();
    expect(measureColumnWidthPx(sample, 'Song', 16, 400, host)).toBeCloseTo(10 * 0.55 * 16, 6);
    expect(measureColumnWidthPx(sample, 'Song', 16, 400)).toBeCloseTo(10 * 0.55 * 16, 6);
  });
});
