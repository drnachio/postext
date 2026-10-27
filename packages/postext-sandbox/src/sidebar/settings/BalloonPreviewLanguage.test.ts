// The balloon drawn on a balloon style's card (#770): its sample is
// measured and drawn in the language the page paints the lettering in when
// the document is shaped in its own, so the outline fits the words as
// drawn; in the host's otherwise, as before.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveComicsConfig } from 'postext';
import { installLanguageCanvas, LanguageContext } from '../../controls/language/languageCanvasStub.js';
import { BalloonPreview, measureLines } from './BalloonPreview.js';

// The page that hosts the Sandbox is in English.
installLanguageCanvas();

describe('the sample of a balloon style (#770)', () => {
  it('is measured in the language it is drawn in', () => {
    LanguageContext.measuredIn.length = 0;
    // Digits of 4.71 px in Chinese and 5.5 px in the page's English.
    expect(measureLines(['2026', '12'], '10px Song', 0, 'zh-Hans')).toBeCloseTo(18.84, 6);
    expect(new Set(LanguageContext.measuredIn)).toEqual(new Set(['zh-Hans']));
    // Tracking after every character but the last.
    expect(measureLines(['2026'], '10px Song', 1, 'zh-Hans')).toBeCloseTo(21.84, 6);
  });

  it('is measured in the host\'s language for a document shaped in it, as before', () => {
    LanguageContext.measuredIn.length = 0;
    expect(measureLines(['2026', '12'], '10px Song', 0)).toBeCloseTo(22, 6);
    expect(new Set(LanguageContext.measuredIn)).toEqual(new Set(['host']));
  });

  it('is drawn in that language, and in the page\'s when the document is shaped in the host\'s', () => {
    const comics = resolveComicsConfig(undefined, 'zh-Hans');
    const style = comics.balloonStyles.find((s) => s.id === 'speech')!;
    const draw = (lang?: string): string =>
      renderToString(h(BalloonPreview, { style, lettering: comics.lettering, text: '2026', label: 'Speech', ...(lang !== undefined ? { lang } : {}) }));
    expect(draw('zh-Hans')).toMatch(/<text[^>]* lang="zh-Hans"/);
    expect(draw()).not.toMatch(/<text[^>]* lang=/);
  });
});
