import type { WarningPayload } from './types';

/** How the Checks panel groups warnings, in triage order: what breaks the
 *  output first (missing fonts, figures), then the markup, then the fine
 *  typesetting that is usually many small items. */
export type WarningCategory = 'fonts' | 'figures' | 'markup' | 'design' | 'typesetting' | 'system';

export const WARNING_CATEGORY_ORDER: readonly WarningCategory[] = ['fonts', 'figures', 'markup', 'design', 'typesetting', 'system'];

export function warningCategory(kind: WarningPayload['kind']): WarningCategory {
  switch (kind) {
    case 'missingFont':
    case 'missingFontFamily':
    case 'missingFontVariant':
    case 'duplicateFontVariant':
    case 'fontFamilyStack':
    case 'missingGlyph':
    case 'variableFontDefaultInstance':
    case 'cffEmbeddedWhole':
      return 'fonts';
    case 'unknownResourceId':
    case 'duplicateResourceId':
    case 'danglingTypeRef':
    case 'bitmapTooSmall':
    case 'unknownTableStyle':
    case 'raggedTableGrid':
    case 'missingImage':
      return 'figures';
    case 'headerFooterUnknownPlaceholder':
    case 'headerFooterMetadataMissing':
    case 'designCyclicAnchor':
    case 'designDanglingAnchor':
    case 'designTextClipAlwaysTruncates':
    case 'headingSpanWithoutBreak':
    case 'headingAdvancedWithoutTitleText':
    case 'sideColumnPercentClamped':
    case 'cjkGridClamped':
    case 'unknownNumberFormat':
    case 'unknownNumerals':
    case 'unknownConfigKey':
    case 'unknownConfigValue':
    case 'headingDesignCut':
      return 'design';
    case 'looseLine':
    case 'cjkLooseLine':
    case 'unbreakableWordOverflow':
    case 'joiningScriptLetterSpacing':
    case 'cjkMarksExceedLeading':
    case 'rubyExceedsLeading':
    case 'arabicMarksExceedLeading':
    case 'calloutOverflow':
    case 'alphaPdfOverflow':
    case 'chipOverlap':
    case 'parityCascade':
    case 'unsupportedHyphenationLocale':
      return 'typesetting';
    case 'storageUnavailable':
      return 'system';
    default:
      return 'markup';
  }
}
