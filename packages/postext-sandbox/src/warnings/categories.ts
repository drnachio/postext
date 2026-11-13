import type { WarningPayload } from './types.js';

/** How the Checks panel groups warnings, in triage order: what breaks the
 *  output first (missing fonts, figures), then the markup, then the fine
 *  typesetting that is usually many small items. */
export type WarningCategory = 'fonts' | 'figures' | 'markup' | 'design' | 'contrast' | 'typesetting' | 'preflight' | 'system';

export const WARNING_CATEGORY_ORDER: readonly WarningCategory[] = ['fonts', 'figures', 'markup', 'design', 'contrast', 'typesetting', 'preflight', 'system'];

/** A contrast finding `contrast.allow` accepts (#1124): the Checks panel
 *  lists it apart and does not count it. */
export function isAcceptedWarning(w: { payload: WarningPayload }): boolean {
  return w.payload.kind === 'contrast' && w.payload.check.accepted !== undefined;
}

export function warningCategory(kind: WarningPayload['kind']): WarningCategory {
  switch (kind) {
    case 'preflight':
      return 'preflight';
    case 'contrast':
      return 'contrast';
    case 'missingFont':
    case 'missingFontFamily':
    case 'missingFontVariant':
    case 'fontFallback':
    case 'glyphFallback':
    case 'glyphFallbackAt':
    case 'duplicateFontVariant':
    case 'fontFamilyStack':
    case 'missingGlyph':
    case 'variableFontDefaultInstance':
    case 'cffEmbeddedWhole':
      return 'fonts';
    case 'unknownResourceId':
    case 'figureWordsShared':
    case 'duplicateResourceId':
    case 'danglingTypeRef':
    case 'bitmapTooSmall':
    case 'floatShrunk':
    case 'floatCropped':
    case 'floatPinMissed':
    case 'pictureBelowPrintSize':
    case 'emptyCaption':
    case 'resourceMoved':
    case 'hereNotEmbedded':
    case 'paragraphCitedInNote':
    case 'textWrap':
    case 'unknownTableStyle':
    case 'raggedTableGrid':
    case 'videoWithoutPoster':
    case 'videoWithoutUrl':
    case 'videoUrlInvalid':
    case 'missingImage':
    case 'svgFontUnavailable':
    case 'svgFontsTooLarge':
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
    case 'calloutStyleExtendsUnknown':
    case 'calloutStyleExtendsCycle':
    case 'chapterStyleBookSetting':
    case 'templateDuplicate':
    case 'templateExtendsCycle':
    case 'templateExtendsUnknown':
    case 'frameDuplicate':
    case 'frameStyleUnknown':
    case 'frameAnchorUnknown':
    case 'frameMinMax':
    case 'groupFrameUnknown':
    case 'groupFrameTwice':
    case 'frameChainLoop':
    case 'overflowTargetUnknown':
    case 'labelStyleUnknown':
    case 'contentInConfig':
    case 'headingDesignCut':
    case 'headingClaimsColumn':
      return 'design';
    case 'looseLine':
    case 'cjkLooseLine':
    case 'raggedLine':
    case 'unbreakableWordOverflow':
    case 'numberOverflow':
    case 'wordDividedByCharacter':
    case 'wordDividedBySyllable':
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
    case 'columnsTooNarrow':
    case 'afterText':
    case 'unplaced':
    case 'shortListSplit':
    case 'stack':
    case 'citationBreak':
    case 'operatorBreak':
    case 'hyphenLadder':
    case 'lastWordDivided':
    case 'openerFloat':
    case 'tocGroupSplit':
    case 'parityCascade':
    case 'unsupportedHyphenationLocale':
    case 'comicBalloonOverflow':
    case 'frameOverflow':
    case 'frameContinuationLimit':
    case 'continueTargetMissing':
    case 'frameCovered':
    case 'frameOutsideArea':
    case 'folioMissing':
      return 'typesetting';
    case 'storageUnavailable':
      return 'system';
    default:
      return 'markup';
  }
}
