// The caret, the selection and the hit test of a band title (the title a
// chapter opener prints through its design) on a page in another language
// than the document (#770). The Sandbox measures the title's characters
// itself: in the language the layout measured them in, or the caret after
// `2026` stands off the number.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDesignTextBlock, VDTDocument } from 'postext';
import { installLanguageCanvas, LanguageContext } from '../../../controls/language/languageCanvasStub.js';
import { documentShapingLanguage } from '../../../controls/language/measureLanguage.js';
import { bandLineBoxes, bandPrefixX, bandSourceToPlain, bandTitleBlocks } from './bandTitle.js';
import { pixelToSourceOffset } from './geometry.js';

// The page that hosts the Sandbox is in English.
installLanguageCanvas();

const TITLE = '2026\u5E74\u7684\u6545\u4E8B';

/** `# 2026年的故事` printed by an opener band at x 100, in a face whose
 *  digits are 4.71 px wide in Chinese and 5.5 px otherwise (10 px type, a
 *  Han character 10 px): `width` is the line as the layout measured it. */
function docOf(config: PostextConfig, font: string, width: number): VDTDocument {
  const title = {
    kind: 'text',
    bbox: { x: 100, y: 40, width: 200, height: 12 },
    fontString: font,
    color: '#000',
    clip: false,
    lines: [{ text: TITLE, xOffset: 0, baselineY: 50, width }],
    sourceStart: 2,
    sourceEnd: 2 + TITLE.length,
    sourceText: TITLE,
    sourceMap: [...TITLE].map((_, i) => 2 + i),
  } as unknown as VDTDesignTextBlock;
  return {
    config,
    pages: [{ index: 0, openerBand: { bbox: { x: 0, y: 0, width: 400, height: 100 }, blocks: [title] } }],
    blocks: [],
  } as unknown as VDTDocument;
}

/** The x of the caret at a source offset of the title, as `drawOverlay`
 *  works it out. */
function caretX(doc: VDTDocument, offset: number): number {
  const block = bandTitleBlocks(doc, 0)[0]!;
  const plain = bandSourceToPlain(block, offset);
  const box = bandLineBoxes(block, documentShapingLanguage(doc))[0]!;
  return bandPrefixX(box, plain - box.plainStart);
}

describe('a band title on a page in another language (#770)', () => {
  // Laid out in Chinese: 4 digits of 4.71 px and 4 characters of 10 px.
  const own = docOf({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'document' } }, '10px Song', 4 * 4.71 + 40);

  it('puts the caret after a number where the page paints its end', () => {
    LanguageContext.measuredIn.length = 0;
    // After `2026`: the title's x plus the number as Chinese sets it.
    // Measured in English the number is 22 px of 62, and the caret stood
    // at 100 + 22 / 62 * 58.84 = 120.88, two pixels into the next character.
    expect(caretX(own, 6)).toBeCloseTo(100 + 4 * 4.71, 6);
    expect(caretX(own, 3)).toBeCloseTo(100 + 4.71, 6);
    expect(caretX(own, 2 + TITLE.length)).toBeCloseTo(100 + 58.84, 6);
    expect(new Set(LanguageContext.measuredIn)).toEqual(new Set(['zh-Hans']));
  });

  it('ends a selection of the number at the number\'s end', () => {
    const box = bandLineBoxes(bandTitleBlocks(own, 0)[0]!, documentShapingLanguage(own))[0]!;
    const x1 = bandPrefixX(box, 0);
    const x2 = bandPrefixX(box, 4);
    expect(x2 - x1).toBeCloseTo(18.84, 6);
  });

  it('takes a press on the right half of a digit as after that digit', () => {
    // The fourth digit is painted from 14.13 to 18.84 px: a press at 16.9
    // is past its middle. Measured in English it reached from 15.66 to
    // 20.88, and the same press fell before it.
    expect(pixelToSourceOffset(own, 0, 100 + 16.9, 46)).toBe(6);
    expect(pixelToSourceOffset(own, 0, 100 + 16.0, 46)).toBe(5);
    // The first character after the number starts where the number ends.
    expect(pixelToSourceOffset(own, 0, 100 + 18.84 + 5.5, 46)).toBe(7);
    expect(pixelToSourceOffset(own, 0, 100 + 18.84 + 4.5, 46)).toBe(6);
  });

  it('measures a document shaped in the host\'s language in the host\'s, as before', () => {
    // The same title laid out in the page's language: digits of 5.5 px.
    const host = docOf({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'host' } }, '10px Song Host', 4 * 5.5 + 40);
    LanguageContext.measuredIn.length = 0;
    expect(bandLineBoxes(bandTitleBlocks(host, 0)[0]!, documentShapingLanguage(host))[0]).not.toHaveProperty('lang');
    expect(caretX(host, 6)).toBeCloseTo(100 + 22, 6);
    expect(pixelToSourceOffset(host, 0, 100 + 19.5, 46)).toBe(6);
    expect(pixelToSourceOffset(host, 0, 100 + 19.0, 46)).toBe(5);
    expect(new Set(LanguageContext.measuredIn)).toEqual(new Set(['host']));
  });
});
