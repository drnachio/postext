import { describe, expect, it } from 'vitest';
import { WARNING_CATEGORY_ORDER, warningCategory } from './categories';

describe('warningCategory', () => {
  it('sorts warnings into the panel groups', () => {
    expect(warningCategory('missingFontVariant')).toBe('fonts');
    expect(warningCategory('unknownResourceId')).toBe('figures');
    expect(warningCategory('looseLine')).toBe('typesetting');
    expect(warningCategory('headingHierarchy')).toBe('markup');
    expect(warningCategory('designDanglingAnchor')).toBe('design');
    expect(warningCategory('sideColumnPercentClamped')).toBe('design');
    expect(warningCategory('storageUnavailable')).toBe('system');
  });
  it('files the configuration-value warnings with the settings they point at', () => {
    // They carry a setting's path, not a place in the text: never among
    // the markup rows, which jump to the editor.
    expect(warningCategory('fontFamilyStack')).toBe('fonts');
    expect(warningCategory('sideColumnPercentClamped')).toBe('design');
    expect(warningCategory('columnCountClamped')).toBe('design');
    expect(warningCategory('unknownNumberFormat')).toBe('design');
  });
  it('files the PDF font warnings with the fonts', () => {
    expect(warningCategory('missingGlyph')).toBe('fonts');
    expect(warningCategory('variableFontDefaultInstance')).toBe('fonts');
    expect(warningCategory('cffEmbeddedWhole')).toBe('fonts');
  });
  it('files the comic warnings by what they point at', () => {
    expect(warningCategory('comicSplitSyntax')).toBe('markup');
    expect(warningCategory('comicUnknownBalloonStyle')).toBe('markup');
    expect(warningCategory('comicUnknownArt')).toBe('figures');
    expect(warningCategory('comicPanelLetterbox')).toBe('figures');
    expect(warningCategory('comicBalloonOverflow')).toBe('typesetting');
  });
  it('files a tab in vertical text with the markup, where the row jumps to the :tab (#622)', () => {
    expect(warningCategory('tabInVerticalText')).toBe('markup');
  });
  it('lists every category once', () => {
    expect(new Set(WARNING_CATEGORY_ORDER).size).toBe(WARNING_CATEGORY_ORDER.length);
  });
});
