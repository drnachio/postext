'use client';

// A warning's detail line in the Checks panel, by kind, with the design
// slot, face and resource it names and the page-template details
// (#1276: split out of WarningsPanel.tsx).
import { KNOWN_DIRECTIVES, KNOWN_CONTAINERS, HYPHENATION_LOCALES, type PageTemplateWarningKind } from 'postext';
import type { WarningPayload } from '../../warnings/types.js';
import type { SandboxLabels } from '../../types/index.js';
import { preflightDetail } from '../../print/preflightText.js';
import { contrastDetail } from '../../contrast/contrastText.js';
import { frameOverflowDetail } from '../../warnings/frameOverflowText.js';
import { frameCoveredDetail, frameOutsideDetail, repeatOverflowDetail } from '../../warnings/frameOverlapText.js';
import { localNumber } from '../../viewport/composed/reflowText.js';

/** Where a design warning points: the slot (`header`, `part`, `H2`); for
 *  a heading style its `{style="…"}` and, for the running heads of its
 *  section, the slot after it; for the part's verso and the contents' part
 *  rows, the configuration key. */
function slotWhere(payload: { slot: string; level?: number; styleId?: string; configPath?: string }): string {
  const { slot, level, styleId, configPath } = payload;
  if (configPath !== undefined) return configPath;
  // A box style's design (#1014): the fence that picks the style.
  if (slot === 'box') return styleId !== undefined ? `:::callout{type="${styleId}"} · calloutStyles[].design` : 'calloutStyles[].design';
  if (styleId !== undefined) return slot === 'heading' ? `{style="${styleId}"}` : `{style="${styleId}"} ${slot}`;
  return slot === 'heading' ? `H${level ?? ''}` : slot;
}

/** How many missing characters a warning lists before "…". */
const LISTED_GLYPHS = 12;

/** `"Noto Serif TC" 700 italic`: the face a PDF font warning is about. */
function faceLabel(payload: { family: string; weight: number; style: 'normal' | 'italic' }): string {
  return `"${payload.family}" ${payload.weight}${payload.style === 'italic' ? ' italic' : ''}`;
}

/** A PDF font warning's detail: the face, what happened, and a note when
 *  the book has changed since that PDF. */
function pdfFontDetail(payload: { family: string; weight: number; style: 'normal' | 'italic'; stale?: true }, labels: SandboxLabels, detail: string): string {
  const text = `${faceLabel(payload)} — ${detail}`;
  return payload.stale ? `${text} ${labels.warningsPdfFontStale}` : text;
}

/** `pagebreak`, `numbering`, `callout`, … — every fence name the parser
 *  accepts, for the unknown-directive detail string. */
const KNOWN_FENCE_NAMES = [...KNOWN_DIRECTIVES, ...KNOWN_CONTAINERS]
  .map((n) => `\`${n}\``)
  .join(', ');

/** `#id · ` prefix of a warning raised in a resource's caption, note or
 *  cells. */
function inResource(id: string | undefined): string {
  return id !== undefined ? `#${id} · ` : '';
}

function formatVariantList(
  variants: Array<{ weight: number; style: 'normal' | 'italic' }>,
): string {
  return variants.map((v) => `${v.weight}${v.style === 'italic' ? ' italic' : ''}`).join(', ');
}

/** What the panel says under a warning's title. */
export function detailFor(payload: WarningPayload, labels: SandboxLabels, locale?: string): string {
  switch (payload.kind) {
    case 'preflight':
      return preflightDetail(payload.check, labels);
    case 'contrast':
      return contrastDetail(payload.check, labels);
    case 'missingFont':
      return `"${payload.family}" — ${labels.warningsMissingFontDetail}`;
    case 'missingFontFamily':
      return `"${payload.family}" — ${labels.warningsMissingFontFamilyDetail}`;
    case 'missingFontVariant':
      return `"${payload.family}" [${formatVariantList(payload.variants)}] — ${labels.warningsMissingFontVariantDetail}`;
    case 'fontFallback':
      return (payload.reason === 'missing' ? labels.warningsFontFallbackMissingDetail : labels.warningsFontFallbackSynthesizedDetail)
        .replace('__face__', `"${payload.family}" ${formatVariantList([payload])}`);
    case 'glyphFallback': {
      // The characters listed, then how many more: `→ ← … +12`.
      const rest = payload.count - payload.characters.length;
      const chars = rest > 0 ? `${payload.characters.join(' ')} … +${rest}` : payload.characters.join(' ');
      return (payload.supplier ? labels.warningsGlyphFallbackDetail : labels.warningsGlyphFallbackSystemDetail)
        .replace('__face__', `"${payload.family}" ${formatVariantList([payload])}`)
        .replace('__chars__', chars)
        .replace('__supplier__', payload.supplier ?? '');
    }
    case 'duplicateFontVariant': {
      const slots = payload.variants
        .map((v) => `${v.weight}${v.style === 'italic' ? ' italic' : ''} ×${v.count}`)
        .join(', ');
      return `"${payload.family}" [${slots}] — ${labels.warningsDuplicateFontVariantDetail}`;
    }
    case 'looseLine':
      return `${payload.ratio.toFixed(2)}× · ${labels.warningsThresholdLabel} ${payload.threshold.toFixed(2)}×`;
    case 'cjkLooseLine':
      return labels.warningsCjkLooseLineDetail.replace('__text__', payload.text);
    case 'raggedLine':
      return labels.warningsRaggedLineDetail.replace('__text__', payload.text.trim()).replace('__ratio__', payload.ratio.toFixed(1));
    case 'unbreakableWordOverflow':
      return labels.warningsUnbreakableWordOverflowDetail.replace('__text__', payload.text);
    case 'wordDividedByCharacter':
      return labels.warningsWordDividedByCharacterDetail.replace('__text__', payload.text);
    case 'wordDividedBySyllable':
      return labels.warningsWordDividedBySyllableDetail.replace('__text__', payload.text);
    case 'joiningScriptLetterSpacing':
      return labels.warningsJoiningScriptLetterSpacingDetail.replace('__text__', payload.text);
    case 'cjkMarksExceedLeading':
      return labels.warningsCjkMarksLeadingDetail
        .replace('__text__', payload.text)
        .replace('__need__', String(payload.neededEm))
        .replace('__gap__', String(payload.gapEm));
    case 'rubyExceedsLeading':
      return labels.warningsRubyLeadingDetail
        .replace('__text__', payload.text)
        .replace('__need__', String(payload.neededEm))
        .replace('__gap__', String(payload.gapEm));
    case 'kuntenExceedsLeading':
      return labels.warningsKuntenLeadingDetail
        .replace('__text__', payload.text)
        .replace('__need__', String(payload.neededEm))
        .replace('__gap__', String(payload.gapEm));
    case 'arabicMarksExceedLeading':
      return labels.warningsArabicMarksLeadingDetail
        .replace('__text__', payload.text)
        .replace('__need__', String(payload.neededEm))
        .replace('__pitch__', String(payload.lineHeightEm));
    case 'headingHierarchy':
      return `H${payload.from} → H${payload.to} · ${labels.warningsHeadingHierarchyDetail}`;
    case 'consecutiveHeadings':
      return labels.warningsConsecutiveHeadingsDetail;
    case 'listAfterHeading':
      return labels.warningsListAfterHeadingDetail;
    case 'invalidMath':
      return `${payload.tex.slice(0, 60)} — ${payload.message}`;
    case 'unclosedMath':
      return `${payload.delimiter}${payload.tex.slice(0, 40)}…`;
    case 'headerFooterUnknownPlaceholder':
      return `${slotWhere(payload)} · {${payload.name}} — ${labels.warningsHeaderFooterUnknownPlaceholderDetail}`;
    case 'headerFooterMetadataMissing':
      return `${slotWhere(payload)} · {${payload.name}} — ${labels.warningsHeaderFooterMetadataMissingDetail}`;
    case 'invalidFrontmatter':
      return `--- — ${payload.message} — ${labels.warningsInvalidFrontmatterDetail}`;
    case 'unknownDirective':
      return `:::${payload.name} — ${labels.warningsUnknownDirectiveDetail.replace('__names__', KNOWN_FENCE_NAMES)}`;
    case 'unclosedContainer':
      // A composed page closes with a bare fence of as many colons (#854).
      if (payload.name === 'composedPage') return `::::page — ${labels.warningsUnclosedComposedPageDetail}`;
      return `:::${payload.name} — ${labels.warningsUnclosedContainerDetail}`;
    case 'unclosedCodeBlock':
      return `${payload.delimiter}${payload.lang ?? ''} — ${labels.warningsUnclosedCodeBlockDetail}`;
    case 'strayFence':
      return `:::${payload.directive} + ::: — ${labels.warningsStrayFenceDetail}`;
    case 'malformedEmbed':
      return `::${payload.name} — ${labels.warningsMalformedEmbedDetail}`;
    case 'fullwidthMarkup':
      return `${payload.typed} → ${payload.ascii} — ${labels.warningsFullwidthMarkupDetail}`;
    case 'attributeKeyInvalid':
      return `${payload.key}= — ${labels.warningsAttributeKeyInvalidDetail}`;
    case 'tabInVerticalText':
      return labels.warningsTabInVerticalTextDetail;
    case 'unknownParagraphStyle':
      return `:::paragraphs{style="${payload.style}"} — ${labels.warningsUnknownParagraphStyleDetail}`;
    case 'unknownCalloutType':
      return `:::callout{type="${payload.type}"} — ${labels.warningsUnknownCalloutTypeDetail}`;
    case 'exerciseUnknownType':
      return `:::exercise{type="${payload.type}"} — ${labels.warningsExerciseUnknownTypeDetail}`;
    case 'exerciseUnknownStyle':
      return `:::exercise{style="${payload.style}"} — ${labels.warningsExerciseUnknownStyleDetail}`;
    case 'exerciseNoAnswer':
      return `:::exercise{type="${payload.exerciseKind}"} — ${labels.warningsExerciseNoAnswerDetail}`;
    case 'exerciseUnreadItem':
      return `${clip(payload.text, 60)} — ${labels.warningsExerciseUnreadItemDetail}`;
    case 'exerciseNested':
      return labels.warningsExerciseNestedDetail;
    case 'exerciseWordUnplaced':
      return `${payload.word} — ${labels.warningsExerciseWordUnplacedDetail}`;
    case 'solutionOutside':
      return labels.warningsSolutionOutsideDetail;
    case 'columnsFlowUnknown':
      return `:::columns{flow="${payload.value}"} — ${labels.warningsColumnsFlowUnknownDetail}`;
    case 'templateUnknown':
      return `::::page{template="${payload.template}"} — ${labels.warningsTemplateUnknownDetail}`;
    case 'slotUnknown':
      return `slot="${payload.slot}" — ${labels.warningsSlotUnknownDetail.replace('__template__', payload.template)}`;
    case 'slotEmpty':
      return `${payload.frame} — ${labels.warningsSlotEmptyDetail.replace('__template__', payload.template)}`;
    case 'pageFenceLength':
      return `:::page{template=…} — ${labels.warningsPageFenceLengthDetail}`;
    case 'frameOverflow':
      // The steps the reflow ladder tried and what would make it fit (#858).
      return `${payload.frame}${payload.locale ? ` (${payload.locale})` : ''} — ${frameOverflowDetail(payload, labels, locale)}`;
    case 'frameCovered':
      // Ink under a frame painted over it, and the fixes (#1053).
      return `${payload.frame}${payload.locale ? ` (${payload.locale})` : ''} — ${frameCoveredDetail(payload, labels, locale)}`;
    case 'frameOutsideArea':
      return `${payload.frame}${payload.locale ? ` (${payload.locale})` : ''} — ${frameOutsideDetail(payload, labels, locale)}`;
    case 'folioMissing':
      // A folio or running head a page lost that its siblings draw (#1163).
      return `${payload.elementId} (${payload.slot}) — ${labels.warningsFolioMissingDetail
        .replace('__page__', String(payload.page))
        .replace('__template__', payload.template)
        .replace('__drawn__', String(payload.drawnOn))
        .replace('__siblings__', String(payload.siblings))}`;
    case 'repeatOverflow':
      return `${payload.frame}[${payload.item}] — ${repeatOverflowDetail(payload, labels)}`;
    case 'lookUnknown':
      // A named look (#1089) frameLooks lacks.
      return `look="${payload.look}" — ${labels.warningsLookUnknownDetail.replace('__frame__', payload.frame)}${payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : ''}`;
    case 'moduleUnknown':
      // A :::module block that is not laid (#1062, #1065).
      if (payload.reason === 'noGroup') return labels.warningsModuleNoGroupDetail.replace('__template__', payload.template).replace('__name__', payload.name);
      if (payload.reason === 'notModule') return labels.warningsModuleNotModuleDetail.replace('__module__', payload.module);
      return payload.module === '' ? labels.warningsModuleNoTemplateDetail : labels.warningsModuleUnknownDetail.replace('__module__', payload.module);
    case 'moduleAsPage':
      return labels.warningsModuleAsPageDetail.replace('__template__', payload.template);
    case 'moduleNested':
      return labels.warningsModuleNestedDetail.replace('__module__', payload.module);
    case 'moduleNameRejected':
      return (payload.reason === 'taken' ? labels.warningsModuleNameTakenDetail : labels.warningsModuleNameInvalidDetail).replace('__name__', payload.name).replace('__used__', payload.used);
    case 'continueTargetMissing':
      return `${payload.frame} — ${(payload.before ? labels.warningsContinueTargetBeforeDetail : labels.warningsContinueTargetMissingDetail)
        .replace('__page__', String(payload.page))
        .replace(/__target__/g, payload.target)
        .replace('__template__', payload.template)}`;
    case 'frameContinuationLimit':
      return `${payload.frame} — ${labels.warningsFrameContinuationLimitDetail
        .replace('__page__', String(payload.page))
        .replace('__pages__', String(payload.pages))
        .replace('__mm__', localNumber(payload.overflowMm, locale))
        .replace('__template__', payload.template)}`;
    case 'spreadMismatch':
      return `::::page{template="${payload.template}"${payload.fence ? ' spread' : ''}} — ${(payload.templateSpread ? labels.warningsSpreadMismatchSpreadDetail : labels.warningsSpreadMismatchSingleDetail).replace('__template__', payload.template)}`;
    case 'labelAnchorUnknown':
      return `at="${payload.anchor}"${payload.locale ? ` (${payload.locale})` : ''} — ${labels.warningsLabelAnchorUnknownDetail
        .replace('__resource__', payload.resourceId)
        .replace('__page__', String(payload.page))
        .replace('__known__', payload.known.length > 0 ? payload.known.slice(0, 8).join(', ') + (payload.known.length > 8 ? '…' : '') : '—')}`;
    case 'anchorUnlabelled':
      return `${payload.anchor}${payload.locale ? ` (${payload.locale})` : ''} — ${labels.warningsAnchorUnlabelledDetail
        .replace('__resource__', payload.resourceId)
        .replace('__page__', String(payload.page))
        .replace('__style__', payload.style)}`;
    case 'labelOverflow':
      return `${payload.anchor ?? `“${payload.text}”`}${payload.locale ? ` (${payload.locale})` : ''} — ${labels.warningsLabelOverflowDetail
        .replace('__text__', payload.text)
        .replace('__page__', String(payload.page))
        .replace('__scale__', String(Math.round(payload.scale * 100)))}`;
    case 'labelOverlap':
      if (payload.withSymbol !== undefined) {
        return `${payload.anchor ?? `“${payload.text}”`}${payload.locale ? ` (${payload.locale})` : ''} — ${(payload.count > 1 ? labels.warningsLabelOverlapSymbolDetailMany : labels.warningsLabelOverlapSymbolDetail)
          .replace('__text__', payload.text)
          .replace('__symbol__', String(payload.withSymbol))
          .replace('__more__', String(payload.count - 1))
          .replace('__page__', String(payload.page))}`;
      }
      return `${payload.anchor ?? `“${payload.text}”`}${payload.locale ? ` (${payload.locale})` : ''} — ${(payload.count > 1 ? labels.warningsLabelOverlapDetailMany : labels.warningsLabelOverlapDetail)
        .replace('__text__', payload.text)
        .replace('__with__', payload.with)
        .replace('__more__', String(payload.count - 1))
        .replace('__page__', String(payload.page))}`;
    case 'figureWordsShared':
      return `${payload.resourceId} — ${labels.warningsFigureWordsSharedDetail
        .replace('__resource__', payload.resourceId)
        .replace('__words__', payload.words.map((k) => (k === 'alt' ? labels.warningsFigureWordsSharedAlt : k === 'caption' ? labels.warningsFigureWordsSharedCaption : labels.warningsFigureWordsSharedNote)).join(', '))}`;
    case 'unknownChipStyle':
      return `${inResource(payload.inResource)}:chip[…]{style="${payload.style}"} — ${labels.warningsUnknownChipStyleDetail}`;
    case 'unknownMarkStyle':
      return `${inResource(payload.inResource)}:mark[…]{style="${payload.style}"} — ${labels.warningsUnknownMarkStyleDetail}`;
    case 'duplicateAnchor':
      return `{#${payload.anchorId}} — ${labels.warningsDuplicateAnchorDetail}`;
    case 'unknownCitationKey':
      return `@${payload.key} — ${labels.warningsUnknownCitationKeyDetail}`;
    case 'citationsUnavailable':
      return labels.warningsCitationsUnavailableDetail;
    case 'referencesUnreadable':
      return `:::references — ${payload.message} — ${labels.warningsReferencesUnreadableDetail}`;
    case 'undefinedFootnote':
      return `[^${payload.id}] — ${labels.warningsUndefinedFootnoteDetail}`;
    case 'unusedFootnote':
      return `[^${payload.id}]: — ${labels.warningsUnusedFootnoteDetail}`;
    case 'indexMarkInvalid':
      return `:index{…} — ${labels.warningsIndexMarkInvalidDetail}`;
    case 'indexSeeUnknown':
      return `${payload.index ? `:::index{index="${payload.index}"} · ` : ''}"${payload.target}" — ${labels.warningsIndexSeeUnknownDetail}`;
    case 'indexRangeUnclosed':
      return `:index{term="${payload.term}" range="${payload.missing}"} — ${labels.warningsIndexRangeUnclosedDetail}`;
    case 'indexReadingMissing':
      return `${payload.index ? `:::index{index="${payload.index}"} · ` : ''}"${payload.term}" — ${labels.warningsIndexReadingMissingDetail}`;
    case 'unknownHeadingStyle':
      return `H${payload.level} {style="${payload.style}"} — ${labels.warningsUnknownHeadingStyleDetail}`;
    case 'chipOverlap':
      return labels.warningsChipOverlapDetail
        .replace('__style__', payload.style)
        .replace('__pt__', payload.overlapPt.toFixed(1));
    case 'numberingInvalidFormat':
      return `format="${payload.value}" — ${labels.warningsNumberingInvalidFormatDetail}`;
    case 'numberingInvalidStartAt':
      return `startAt=${payload.value} — ${labels.warningsNumberingInvalidStartAtDetail}`;
    case 'pagebreakInvalidParity':
      return `parity="${payload.value}" — ${labels.warningsPagebreakInvalidParityDetail}`;
    case 'spaceInvalidLines':
      return `lines="${payload.value}" — ${labels.warningsSpaceInvalidLinesDetail}`;
    case 'paperAttributeInvalid':
      return `:::paper{${payload.key}="${payload.value}"} — ${labels.warningsPaperAttributeInvalidDetail}`;
    case 'headingBreakInvalidParity':
      return `H${payload.level} parity="${payload.value}" — ${labels.warningsPagebreakInvalidParityDetail}`;
    case 'parityCascade':
      return `${payload.runLength} — ${labels.warningsParityCascadeDetail}`;
    case 'alphaPdfOverflow':
      return labels.warningsAlphaPdfOverflowDetail;
    case 'calloutOverflow':
      return labels.warningsCalloutOverflowDetail
        .replace('__page__', String(payload.page))
        .replace('__mm__', payload.overflowMm.toFixed(1));
    case 'headingDesignCut':
      return `H${payload.level} — ${labels.warningsHeadingDesignCutDetail
        .replace('__page__', String(payload.page))
        .replace('__mm__', payload.overflowMm.toFixed(1))}`;
    case 'headingClaimsColumn':
      return `H${payload.level} — ${(payload.element !== undefined ? labels.warningsHeadingClaimsColumnElementDetail : labels.warningsHeadingClaimsColumnMinHeightDetail)
        .replace('__page__', String(payload.page))
        .replace('__element__', payload.element ?? '')}`;
    case 'sideColumnPercentClamped':
      return `${payload.path}: ${payload.value} — ${labels.warningsSideColumnPercentClampedDetail.replace('__used__', payload.used)}`;
    case 'columnCountClamped':
      return `${payload.path}: ${payload.value} — ${labels.warningsColumnCountClampedDetail.replace('__used__', payload.used)}`;
    case 'cjkGridClamped':
      return `${payload.path}: ${payload.value} — ${labels.warningsCjkGridClampedDetail.replace('__used__', payload.used)}`;
    case 'designCyclicAnchor': {
      const where = slotWhere(payload);
      return `${where} · #${payload.elementId} — ${labels.warningsDesignCyclicAnchorDetail}`;
    }
    case 'designDanglingAnchor': {
      const where = slotWhere(payload);
      return `${where} · #${payload.elementId} → #${payload.referencedId} — ${labels.warningsDesignDanglingAnchorDetail}`;
    }
    case 'designTextClipAlwaysTruncates': {
      const where = slotWhere(payload);
      return `${where} · #${payload.elementId} — ${labels.warningsDesignTextClipAlwaysTruncatesDetail}`;
    }
    case 'designTextTruncated': {
      const where = payload.slot === 'tocRow' ? 'toc.parts.design' : payload.slot === 'box' ? 'calloutStyles[].design' : payload.slot;
      const detail = payload.mode === 'clip' ? labels.warningsDesignTextTruncatedClipDetail : labels.warningsDesignTextTruncatedDetail;
      return `${where} · #${payload.elementId} — ${detail.replace('__text__', payload.text)}`;
    }
    case 'headingSpanWithoutBreak':
      return `H${payload.level} — ${labels.warningsHeadingSpanWithoutBreakDetail}`;
    case 'headingAdvancedWithoutTitleText':
      return `H${payload.level} — ${labels.warningsHeadingAdvancedWithoutTitleTextDetail}`;
    case 'unknownResourceId': {
      if (payload.usage === 'cellImage') {
        return `${inResource(payload.inResource)}image → #${payload.resourceId} — ${labels.warningsUnknownResourceIdDetail}`;
      }
      const where = payload.usage === 'embed' ? '::resource' : ':ref';
      return `${inResource(payload.inResource)}${where}{id=${payload.resourceId}} — ${labels.warningsUnknownResourceIdDetail}`;
    }
    case 'duplicateResourceId':
      return `#${payload.resourceId} ×${payload.count} — ${labels.warningsDuplicateResourceIdDetail}`;
    case 'danglingTypeRef':
      return `#${payload.resourceId} → ${payload.typeId} — ${labels.warningsDanglingTypeRefDetail}`;
    case 'bitmapTooSmall':
      return `#${payload.resourceId} · ${payload.renderedWidth}px / ${payload.bitmapWidth}px — ${labels.warningsBitmapTooSmallDetail}`;
    case 'floatShrunk':
      return `#${payload.resourceId} — ${(payload.overflowMm !== undefined ? labels.warningsFloatShrunkOverflowDetail : labels.warningsFloatShrunkDetail)
        .replace('__scale__', String(Math.round(payload.scale * 100)))
        .replace('__mm__', String(payload.overflowMm ?? 0))}`;
    case 'pictureBelowPrintSize':
      return `#${payload.resourceId} — ${labels.warningsPictureBelowPrintSizeDetail
        .replace('__scale__', String(Math.round(payload.scale * 100)))
        .replace('__print__', String(payload.printMm))
        .replace('__column__', String(payload.columnMm))
        .replace('__page__', String(payload.pageMm))}`;
    case 'emptyCaption':
      return `#${payload.resourceId} — ${labels.warningsEmptyCaptionDetail.replace('__label__', payload.label)}`;
    case 'resourceMoved':
      return `#${payload.resourceId} — ${labels.warningsResourceMovedDetail
        .replace('__page__', String(payload.page))
        .replace('__mm__', String(payload.emptyMm))}`;
    case 'unknownTableStyle':
      return `#${payload.resourceId} · styleId="${payload.styleId}" — ${labels.warningsUnknownTableStyleDetail}`;
    case 'raggedTableGrid': {
      const detail = payload.reason === 'spanOverlap'
        ? labels.warningsRaggedTableGridOverlapDetail
        : labels.warningsRaggedTableGridMissingDetail;
      return `#${payload.resourceId} · ${detail.replace('__row__', String(payload.row + 1)).replace('__col__', String(payload.col + 1))}${payload.count > 1 ? ` (×${payload.count})` : ''}`;
    }
    case 'videoWithoutPoster':
      return `#${payload.resourceId} — ${labels.warningsVideoWithoutPosterDetail}`;
    case 'videoWithoutUrl':
      return `#${payload.resourceId} — ${labels.warningsVideoWithoutUrlDetail}`;
    case 'videoUrlInvalid':
      return `#${payload.resourceId} · ${payload.url || '""'} — ${labels.warningsVideoUrlInvalidDetail}`;
    case 'missingImage':
      return `#${payload.resourceId} — ${labels.warningsMissingImageDetail}`;
    case 'svgFontUnavailable':
      return `#${payload.resourceId} — ${labels.warningsSvgFontUnavailableDetail.replace('__face__', `${payload.family} ${payload.weight}${payload.style === 'italic' ? ' italic' : ''}`)}`;
    case 'svgFontsTooLarge':
      return `#${payload.resourceId} — ${labels.warningsSvgFontsTooLargeDetail.replace('__size__', String(Math.round(payload.bytes / 1024)))}`;
    case 'storageUnavailable':
      return labels.warningsStorageUnavailableDetail;
    case 'chapterFrontmatterIgnored':
      return labels.warningsChapterFrontmatterIgnoredDetail.replace('__chapter__', payload.chapterTitle);
    case 'fontFamilyStack':
      return `${payload.path}: "${payload.value}" — ${labels.warningsFontFamilyStackDetail.replace('__used__', payload.used)}`;
    case 'unknownNumberFormat':
      return `${payload.path}: "${payload.value}" — ${labels.warningsUnknownNumberFormatDetail.replace('__used__', payload.used)}`;
    case 'unknownNumerals':
      return `${payload.path}: "${payload.value}" — ${labels.warningsUnknownNumeralsDetail.replace('__used__', payload.used)}`;
    case 'lineNumbersUnsupported':
      return `${payload.path} — ${labels.warningsLineNumbersUnsupportedDetail}`;
    case 'wrapUnsupported':
      return `${payload.path}: "${payload.value}" — ${labels.warningsWrapUnsupportedDetail}`;
    case 'textWrap': {
      const detail = payload.reason === 'tooNarrow' ? labels.warningsTextWrapTooNarrow
        : payload.reason === 'fewLines' ? labels.warningsTextWrapFewLines
          : payload.reason === 'moved' ? labels.warningsTextWrapMoved
            : payload.reason === 'noContour' ? labels.warningsTextWrapNoContour
              : labels.warningsTextWrapVertical;
      return `${payload.resourceId !== undefined ? `#${payload.resourceId}` : `:::callout${payload.box ? ` (${payload.box})` : ''}`} — ${detail}`;
    }
    case 'lineNumberOverlap':
      return labels.warningsLineNumberOverlapDetail.replace('__number__', payload.number);
    case 'columnsTooNarrow':
      return labels.warningsColumnsTooNarrowDetail.replace('__columns__', String(payload.columns));
    case 'afterText':
      return `${payload.resourceId !== undefined ? `#${payload.resourceId} — ` : ''}${labels.warningsAfterTextDetail.replace('__page__', String(payload.page))}`;
    case 'unplaced':
      return `${payload.resourceId !== undefined ? `#${payload.resourceId} — ` : ''}${labels.warningsUnplacedDetail}`;
    case 'shortListSplit':
      return labels.warningsShortListSplitDetail.replace('__page__', String(payload.page)).replace('__items__', String(payload.items));
    case 'openerFloat':
      return `${payload.resourceId !== undefined ? `#${payload.resourceId} — ` : ''}${labels.warningsOpenerFloatDetail.replace('__page__', String(payload.page))}`;
    case 'tocGroupSplit':
      return labels.warningsTocGroupSplitDetail
        .replace('__page__', String(payload.page))
        .replace('__title__', payload.title)
        .replace('__columns__', String(payload.columns));
    case 'codeOverflow': {
      const detail = payload.mode === 'wrap' ? labels.warningsCodeOverflowWrap
        : payload.mode === 'clip' ? labels.warningsCodeOverflowClip
          : labels.warningsCodeOverflowShrink;
      return detail.replace('__lines__', String(payload.lines)).replace('__scale__', String(Math.round((payload.scale ?? 1) * 100)));
    }
    case 'dropCap': {
      const detail = payload.reason === 'shortParagraph'
        ? payload.handling === 'shrink' ? labels.warningsDropCapShortShrink : payload.handling === 'skip' ? labels.warningsDropCapShortSkip : labels.warningsDropCapShortReserve
        : payload.reason === 'split' ? labels.warningsDropCapSplit
          : payload.reason === 'joiningScript' ? labels.warningsDropCapJoining
            : payload.reason === 'verticalText' ? labels.warningsDropCapVertical
              : payload.reason === 'inBox' ? labels.warningsDropCapInBox
                : labels.warningsDropCapNoLetter;
      return detail.replace('__text__', payload.text).replace('__lines__', String(payload.lines ?? ''));
    }
    case 'unknownConfigKey':
      return `${payload.path} — ${labels.warningsUnknownConfigKeyDetail}${payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : ''}`;
    case 'unknownConfigValue':
      return `${payload.path}: "${payload.value}" — ${labels.warningsUnknownConfigValueDetail.replace('__used__', payload.used)}${payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : ''}`;
    case 'calloutStyleExtendsUnknown':
    case 'calloutStyleExtendsCycle': {
      const detail = payload.kind === 'calloutStyleExtendsUnknown' ? labels.warningsCalloutStyleExtendsUnknownDetail : labels.warningsCalloutStyleExtendsCycleDetail;
      return `${payload.path}: "${payload.value}" — ${detail}${payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : ''}`;
    }
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
      return pageTemplateDetail(payload, labels);
    case 'contentInConfig': {
      const where = `${payload.elements.slice(0, 3).join(', ')}${payload.count > 3 ? ` … (${payload.count})` : ''}`;
      return `${payload.path}${payload.ownerId ? ` (${payload.ownerId})` : ''}: ${where} — ${labels.warningsContentInConfigDetail
        .replace('__count__', String(payload.count))
        .replace('__chars__', String(payload.chars))
        .replace('__sample__', payload.sample)}`;
    }
    case 'unsupportedHyphenationLocale':
      return labels.warningsUnsupportedHyphenationLocaleDetail
        .replace('__locale__', payload.locale)
        .replace('__locales__', HYPHENATION_LOCALES.join(', '));
    case 'missingGlyph': {
      // The first few, then how many more: `a b c … +38`.
      const shown = payload.characters.slice(0, LISTED_GLYPHS).join(' ');
      const rest = payload.characters.length - LISTED_GLYPHS;
      const chars = rest > 0 ? `${shown} … +${rest}` : shown;
      return pdfFontDetail(payload, labels, labels.warningsMissingGlyphDetail.replace('__chars__', chars));
    }
    case 'variableFontDefaultInstance':
      return pdfFontDetail(payload, labels, labels.warningsVariableFontDetail.replace('__default__', String(payload.defaultWeight)).replace('__weight__', String(payload.weight)));
    case 'cffEmbeddedWhole':
      return pdfFontDetail(payload, labels, labels.warningsCffEmbeddedWholeDetail.replace('__size__', (payload.bytes / (1024 * 1024)).toFixed(1)));
    case 'comicSplitSyntax':
      return `split · ${payload.message} — ${labels.warningsComicSplitSyntaxDetail}`;
    case 'comicSplitOverflow':
      return labels.warningsComicSplitOverflowDetail.replace('__total__', formatPercent(payload.total));
    case 'comicPanelCount': {
      const more = payload.panels > payload.cells;
      return (more ? labels.warningsComicPanelCountMoreDetail : labels.warningsComicPanelCountFewerDetail)
        .replace('__panels__', String(payload.panels))
        .replace('__cells__', String(payload.cells))
        .replace('__extra__', String(Math.abs(payload.panels - payload.cells)));
    }
    case 'comicStrayText':
      return `"${clip(payload.text, 60)}" — ${labels.warningsComicStrayTextDetail}`;
    case 'comicUnknownBalloonStyle':
      return `{${payload.style}} — ${labels.warningsComicUnknownBalloonStyleDetail}`;
    case 'comicUnknownArt':
      return `#${payload.resourceId} — ${labels.warningsComicUnknownArtDetail}`;
    case 'comicPanelLetterbox':
      return `#${payload.resourceId} · ${labels.warningsComicPanelLetterboxDetail.replace('__panel__', String(payload.panel + 1))}`;
    case 'comicAnchorOutsideSafeArea':
      return `#${payload.resourceId} · ${payload.anchorId} — ${labels.warningsComicAnchorOutsideSafeAreaDetail}`;
    case 'comicBalloonOverflow': {
      const panel = payload.panel ?? payload.panelIndex;
      return labels.warningsComicBalloonOverflowDetail.replace('__panel__', panel !== undefined ? String(panel + 1) : '?');
    }
    case 'comicUnknownSpeaker':
      return `${payload.speaker}: — ${labels.warningsComicUnknownSpeakerDetail}`;
    case 'comicPanelFrame': {
      const detail = payload.reason === 'unknownBox' ? labels.warningsComicPanelFrameUnknownBoxDetail
        : payload.reason === 'textOverflow' ? labels.warningsComicPanelFrameTextOverflowDetail
          : payload.reason === 'strip' ? labels.warningsComicPanelFrameStripDetail
            : payload.reason === 'spread' ? labels.warningsComicPanelFrameSpreadDetail
              : labels.warningsComicPanelFrameFlowDetail;
      return detail
        .replace('__panel__', String(payload.panel + 1))
        .replace('__style__', payload.style ?? '')
        .replace('__mm__', String(payload.overflowMm ?? 0));
    }
  }
}

/** A percentage with at most one decimal (`112.5`). */
function formatPercent(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** The start of a long text, with an ellipsis. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A page-template warning (#853): the JSON pointer, the value at fault,
 *  what the engine does, and the closest name that exists. */
function pageTemplateDetail(payload: Extract<WarningPayload, { kind: PageTemplateWarningKind }>, labels: SandboxLabels): string {
  const detail = PAGE_TEMPLATE_DETAIL[payload.kind](labels)
    .replace('__used__', payload.used)
    .replace('__resource__', payload.resourceId !== undefined ? `#${payload.resourceId}` : '');
  const suggestion = payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : '';
  return `${payload.path}: "${payload.value}" — ${detail}${suggestion}`;
}

const PAGE_TEMPLATE_DETAIL: Record<PageTemplateWarningKind, (labels: SandboxLabels) => string> = {
  templateDuplicate: (l) => l.warningsTemplateDuplicateDetail,
  templateExtendsCycle: (l) => l.warningsTemplateExtendsCycleDetail,
  templateExtendsUnknown: (l) => l.warningsTemplateExtendsUnknownDetail,
  frameDuplicate: (l) => l.warningsFrameDuplicateDetail,
  frameStyleUnknown: (l) => l.warningsFrameStyleUnknownDetail,
  frameAnchorUnknown: (l) => l.warningsFrameAnchorUnknownDetail,
  frameMinMax: (l) => l.warningsFrameMinMaxDetail,
  groupFrameUnknown: (l) => l.warningsGroupFrameUnknownDetail,
  groupFrameTwice: (l) => l.warningsGroupFrameTwiceDetail,
  frameChainLoop: (l) => l.warningsFrameChainLoopDetail,
  overflowTargetUnknown: (l) => l.warningsOverflowTargetUnknownDetail,
  labelStyleUnknown: (l) => l.warningsLabelStyleUnknownDetail,
};
