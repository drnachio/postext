// The character of a balloon under the pointer on a page in another
// language than the document (#770): the words are measured in the
// language the lettering was measured in and is painted in.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTComicBalloon, VDTDesignTextBlock, VDTDocument } from 'postext';
import { installLanguageCanvas, LanguageContext } from '../../controls/language/languageCanvasStub.js';
import { documentShapingLanguage } from '../../controls/language/measureLanguage.js';
import { balloonTextAt, balloonTextNearest } from './balloonText.js';

// The page that hosts the Sandbox is in English.
installLanguageCanvas();

const LINE = '2026\u5E74\u7684';

/** A balloon saying `2026年的` from x 105, in a face whose digits are
 *  4.71 px wide in Chinese and 5.5 px otherwise (10 px type): `width` is
 *  the line as the lettering measured it. The script line starts at
 *  source offset 10. */
function balloonOf(font: string, width: number): VDTComicBalloon {
  const text = {
    kind: 'text',
    bbox: { x: 100, y: 100, width: 60, height: 14 },
    fontString: font,
    color: '#000',
    clip: false,
    lines: [{ text: LINE, xOffset: 5, baselineY: 110, width }],
    sourceStart: 10,
    sourceEnd: 10 + LINE.length,
    sourceText: LINE,
    sourceMap: [...LINE].map((_, i) => 10 + i),
  } as unknown as VDTDesignTextBlock;
  return {
    id: '0:0',
    panelIndex: 0,
    order: 0,
    kind: 'balloon',
    style: 'speech',
    sourceStart: 5,
    sourceEnd: 10 + LINE.length,
    group: 0,
    text: [text],
    bbox: { x: 90, y: 90, width: 80, height: 34 },
  } as unknown as VDTComicBalloon;
}

const docOf = (config: PostextConfig): VDTDocument => ({ config }) as unknown as VDTDocument;

describe('balloon words on a page in another language (#770)', () => {
  it('finds the digit pressed where the page paints it', () => {
    const lang = documentShapingLanguage(docOf({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'document' } }));
    const b = balloonOf('10px Song', 4 * 4.71 + 20);
    LanguageContext.measuredIn.length = 0;
    // The fourth digit is painted from 14.13 to 18.84 px along the line: a
    // press at 17 is past its middle. Measured in English the digits take
    // 22 px of 42, the fourth one reached from 15.26 to 20.34, and the
    // same press fell before it.
    expect(balloonTextAt(b, 105 + 17, 108, { lang })).toBe(14);
    expect(balloonTextAt(b, 105 + 16, 108, { lang })).toBe(13);
    // The head of a selection dragged past the number's end.
    expect(balloonTextNearest(b, 105 + 18.84 + 4.5, 300, { lang })).toBe(14);
    expect(balloonTextNearest(b, 105 + 18.84 + 5.5, 300, { lang })).toBe(15);
    expect(new Set(LanguageContext.measuredIn)).toEqual(new Set(['zh-Hans']));
  });

  it('measures the words of a document shaped in the host\'s language in the host\'s, as before', () => {
    const lang = documentShapingLanguage(docOf({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'host' } }));
    expect(lang).toBeUndefined();
    // The same words lettered in the page's language: digits of 5.5 px.
    const b = balloonOf('10px Song Host', 4 * 5.5 + 20);
    LanguageContext.measuredIn.length = 0;
    // The fourth digit from 16.5 to 22 px.
    expect(balloonTextAt(b, 105 + 19.5, 108, { lang })).toBe(14);
    expect(balloonTextAt(b, 105 + 19, 108, { lang })).toBe(13);
    expect(new Set(LanguageContext.measuredIn)).toEqual(new Set(['host']));
  });

  it('keeps a measure handed in', () => {
    // Characters of one width: the six share the line evenly.
    const b = balloonOf('10px Song', 60);
    expect(balloonTextAt(b, 105 + 36, 108, { lang: 'zh-Hans', measure: (t) => t.length })).toBe(14);
    expect(balloonTextAt(b, 105 + 34, 108, { lang: 'zh-Hans', measure: (t) => t.length })).toBe(13);
  });
});
