import type { WarningPayload } from './types';

/** How the Checks panel groups warnings, in triage order: what breaks the
 *  output first (missing fonts, figures), then the markup, then the fine
 *  typesetting that is usually many small items. */
export type WarningCategory = 'fonts' | 'figures' | 'markup' | 'design' | 'typesetting' | 'preflight' | 'system';

export const WARNING_CATEGORY_ORDER: readonly WarningCategory[] = ['fonts', 'figures', 'markup', 'design', 'typesetting', 'preflight', 'system'];

export function warningCategory(kind: WarningPayload['kind']): WarningCategory {
  switch (kind) {
    case 'preflight':
      return 'preflight';
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
    case 'floatShrunk':
    case 'textWrap':
    case 'unknownTableStyle':
    case 'raggedTableGrid':
    case 'videoWithoutPoster':
    case 'videoWithoutUrl':
    case 'videoUrlInvalid':
    case 'missingImage':
    case 'comicUnknownArt':
    case 'comicPanelLetterbox':
    case 'comicAnchorOutsideSafeArea':
      return 'figures';
    case 'headerFooterUnknownPlaceholder':
    case 'headerFooterMetadataMissing':
    case 'designCyclicAnchor':
    case 'designDanglingAnchor':
    case 'designTextClipAlwaysTruncates':
    case 'designTextTruncated':
    case 'headingSpanWithoutBreak':
    case 'headingAdvancedWithoutTitleText':
    case 'sideColumnPercentClamped':
    case 'columnCountClamped':
    case 'cjkGridClamped':
    case 'unknownNumberFormat':
    case 'unknownNumerals':
    case 'lineNumbersUnsupported':
    case 'wrapUnsupported':
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
    case 'kuntenExceedsLeading':
    case 'arabicMarksExceedLeading':
    case 'calloutOverflow':
    case 'alphaPdfOverflow':
    case 'chipOverlap':
    case 'lineNumberOverlap':
    case 'dropCap':
    case 'codeOverflow':
    case 'parityCascade':
    case 'unsupportedHyphenationLocale':
    case 'comicBalloonOverflow':
      return 'typesetting';
    case 'storageUnavailable':
      return 'system';
    default:
      return 'markup';
  }
}
