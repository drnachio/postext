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
    expect(warningCategory('unknownNumberFormat')).toBe('design');
  });
  it('lists every category once', () => {
    expect(new Set(WARNING_CATEGORY_ORDER).size).toBe(WARNING_CATEGORY_ORDER.length);
  });
});
