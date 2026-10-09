'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, CircleCheck, Printer, Type, FileWarning, Heading, List, FileText, Sigma, Image, Database, MessageCircle, LayoutGrid } from 'lucide-react';
import { HYPHENATION_LOCALES, KNOWN_CONTAINERS, KNOWN_DIRECTIVES } from 'postext';
import { useSandbox, useSandboxWarnings } from '../context/SandboxContext';
import { Collapsible, EmptyState, ListRow, PanelBody, PanelHeader, cn } from '../ui';
import { WARNING_CATEGORY_ORDER, warningCategory, type WarningCategory } from '../warnings/categories';
import type { Warning, WarningPayload } from '../warnings/types';
import type { SandboxLabels } from '../types';
import { preflightDetail, preflightTitle } from '../print/preflightText';
import { fill } from '../print/fillTokens';
import { readViewHash, viewHashFragment } from '../storage/viewHash';

/** Open a book page in the viewer: the fragment names it, and the viewer
 *  follows a fragment change (see `usePageHashSync`). */
function goToBookPage(page: number): void {
  if (typeof window === 'undefined') return;
  window.location.hash = viewHashFragment({ ...readViewHash(), page });
}

/** Where a design warning points: the slot (`header`, `part`, `H2`); for
 *  a heading style its `{style="…"}` and, for the running heads of its
 *  section, the slot after it; for the part's verso and the contents' part
 *  rows, the configuration key. */
function slotWhere(payload: { slot: string; level?: number; styleId?: string; configPath?: string }): string {
  const { slot, level, styleId, configPath } = payload;
  if (configPath !== undefined) return configPath;
  if (styleId !== undefined) return slot === 'heading' ? `{style="${styleId}"}` : `{style="${styleId}"} ${slot}`;
  return slot === 'heading' ? `H${level ?? ''}` : slot;
}

function iconFor(kind: WarningPayload['kind']) {
  switch (kind) {
    case 'preflight':
      return Printer;
    case 'missingFont':
    case 'missingFontFamily':
    case 'missingFontVariant':
    case 'duplicateFontVariant':
      return Type;
    case 'looseLine':
    case 'cjkLooseLine':
    case 'unbreakableWordOverflow':
    case 'joiningScriptLetterSpacing':
    case 'cjkMarksExceedLeading':
    case 'rubyExceedsLeading':
    case 'kuntenExceedsLeading':
    case 'arabicMarksExceedLeading':
    case 'lineNumberOverlap':
    case 'dropCap':
    case 'codeOverflow':
      return FileWarning;
    case 'headingHierarchy':
      return Heading;
    case 'consecutiveHeadings':
      return Heading;
    case 'listAfterHeading':
      return List;
    case 'invalidMath':
    case 'unclosedMath':
      return Sigma;
    case 'headerFooterUnknownPlaceholder':
    case 'headerFooterMetadataMissing':
      return FileText;
    case 'invalidFrontmatter':
    case 'unknownDirective':
    case 'malformedEmbed':
    case 'fullwidthMarkup':
    case 'attributeKeyInvalid':
    case 'tabInVerticalText':
    case 'unclosedContainer':
    case 'unclosedCodeBlock':
    case 'unknownParagraphStyle':
    case 'unknownCalloutType':
    case 'unknownChipStyle':
    case 'duplicateAnchor':
    case 'unknownCitationKey':
    case 'citationsUnavailable':
    case 'referencesUnreadable':
    case 'undefinedFootnote':
    case 'unusedFootnote':
    case 'indexMarkInvalid':
    case 'indexSeeUnknown':
    case 'indexRangeUnclosed':
    case 'indexReadingMissing':
    case 'chipOverlap':
    case 'numberingInvalidFormat':
    case 'numberingInvalidStartAt':
    case 'pagebreakInvalidParity':
    case 'spaceInvalidLines':
    case 'paperAttributeInvalid':
    case 'headingBreakInvalidParity':
    case 'parityCascade':
    case 'alphaPdfOverflow':
    case 'calloutOverflow':
    case 'sideColumnPercentClamped':
    case 'columnCountClamped':
    case 'cjkGridClamped':
      return FileWarning;
    case 'designCyclicAnchor':
    case 'designDanglingAnchor':
    case 'designTextClipAlwaysTruncates':
    case 'designTextTruncated':
      return FileWarning;
    case 'headingSpanWithoutBreak':
    case 'headingAdvancedWithoutTitleText':
    case 'unknownHeadingStyle':
    case 'headingDesignCut':
      return Heading;
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
    case 'svgFontUnavailable':
    case 'svgFontsTooLarge':
      return Image;
    case 'storageUnavailable':
      return Database;
    case 'chapterFrontmatterIgnored':
      return FileText;
    case 'fontFamilyStack':
      return Type;
    case 'unknownNumberFormat':
    case 'unknownNumerals':
    case 'lineNumbersUnsupported':
    case 'wrapUnsupported':
      return List;
    case 'unknownConfigKey':
    case 'unknownConfigValue':
      return FileWarning;
    case 'unsupportedHyphenationLocale':
    case 'missingGlyph':
    case 'variableFontDefaultInstance':
    case 'cffEmbeddedWhole':
      return Type;
    case 'comicSplitSyntax':
    case 'comicSplitOverflow':
    case 'comicPanelCount':
      return LayoutGrid;
    case 'comicUnknownArt':
    case 'comicPanelLetterbox':
    case 'comicAnchorOutsideSafeArea':
      return Image;
    case 'comicStrayText':
    case 'comicUnknownBalloonStyle':
    case 'comicBalloonOverflow':
    case 'comicUnknownSpeaker':
      return MessageCircle;
    default:
      return AlertTriangle;
  }
}

function titleFor(payload: WarningPayload, labels: SandboxLabels): string {
  switch (payload.kind) {
    case 'preflight':
      return preflightTitle(payload.check, labels);
    case 'missingFont':
      return labels.warningsMissingFontTitle;
    case 'missingFontFamily':
      return labels.warningsMissingFontFamilyTitle;
    case 'missingFontVariant':
      return labels.warningsMissingFontVariantTitle;
    case 'duplicateFontVariant':
      return labels.warningsDuplicateFontVariantTitle;
    case 'looseLine':
      return labels.warningsLooseLineTitle;
    case 'cjkLooseLine':
      return labels.warningsCjkLooseLineTitle;
    case 'unbreakableWordOverflow':
      return labels.warningsUnbreakableWordOverflowTitle;
    case 'joiningScriptLetterSpacing':
      return labels.warningsJoiningScriptLetterSpacingTitle;
    case 'cjkMarksExceedLeading':
      return labels.warningsCjkMarksLeadingTitle;
    case 'rubyExceedsLeading':
      return labels.warningsRubyLeadingTitle;
    case 'kuntenExceedsLeading':
      return labels.warningsKuntenLeadingTitle;
    case 'arabicMarksExceedLeading':
      return labels.warningsArabicMarksLeadingTitle;
    case 'headingHierarchy':
      return labels.warningsHeadingHierarchyTitle;
    case 'consecutiveHeadings':
      return labels.warningsConsecutiveHeadingsTitle;
    case 'listAfterHeading':
      return labels.warningsListAfterHeadingTitle;
    case 'invalidMath':
      return labels.warningsInvalidMathTitle;
    case 'unclosedMath':
      return labels.warningsUnclosedMathTitle;
    case 'headerFooterUnknownPlaceholder':
      return labels.warningsHeaderFooterUnknownPlaceholderTitle;
    case 'headerFooterMetadataMissing':
      return labels.warningsHeaderFooterMetadataMissingTitle;
    case 'invalidFrontmatter':
      return labels.warningsInvalidFrontmatterTitle;
    case 'unknownDirective':
      return labels.warningsUnknownDirectiveTitle;
    case 'malformedEmbed':
      return labels.warningsMalformedEmbedTitle;
    case 'fullwidthMarkup':
      return labels.warningsFullwidthMarkupTitle;
    case 'attributeKeyInvalid':
      return labels.warningsAttributeKeyInvalidTitle;
    case 'tabInVerticalText':
      return labels.warningsTabInVerticalTextTitle;
    case 'unclosedContainer':
      return labels.warningsUnclosedContainerTitle;
    case 'unclosedCodeBlock':
      return labels.warningsUnclosedCodeBlockTitle;
    case 'unknownParagraphStyle':
      return labels.warningsUnknownParagraphStyleTitle;
    case 'unknownCalloutType':
      return labels.warningsUnknownCalloutTypeTitle;
    case 'unknownChipStyle':
      return labels.warningsUnknownChipStyleTitle;
    case 'duplicateAnchor':
      return labels.warningsDuplicateAnchorTitle;
    case 'unknownCitationKey':
      return labels.warningsUnknownCitationKeyTitle;
    case 'citationsUnavailable':
      return labels.warningsCitationsUnavailableTitle;
    case 'referencesUnreadable':
      return labels.warningsReferencesUnreadableTitle;
    case 'undefinedFootnote':
      return labels.warningsUndefinedFootnoteTitle;
    case 'unusedFootnote':
      return labels.warningsUnusedFootnoteTitle;
    case 'indexMarkInvalid':
      return labels.warningsIndexMarkInvalidTitle;
    case 'indexSeeUnknown':
      return labels.warningsIndexSeeUnknownTitle;
    case 'indexRangeUnclosed':
      return labels.warningsIndexRangeUnclosedTitle;
    case 'indexReadingMissing':
      return labels.warningsIndexReadingMissingTitle;
    case 'unknownHeadingStyle':
      return labels.warningsUnknownHeadingStyleTitle;
    case 'chipOverlap':
      return labels.warningsChipOverlapTitle;
    case 'numberingInvalidFormat':
      return labels.warningsNumberingInvalidFormatTitle;
    case 'numberingInvalidStartAt':
      return labels.warningsNumberingInvalidStartAtTitle;
    case 'pagebreakInvalidParity':
    case 'headingBreakInvalidParity':
      return labels.warningsPagebreakInvalidParityTitle;
    case 'spaceInvalidLines':
      return labels.warningsSpaceInvalidLinesTitle;
    case 'paperAttributeInvalid':
      return labels.warningsPaperAttributeInvalidTitle;
    case 'parityCascade':
      return labels.warningsParityCascadeTitle;
    case 'alphaPdfOverflow':
      return labels.warningsAlphaPdfOverflowTitle;
    case 'calloutOverflow':
      return labels.warningsCalloutOverflowTitle;
    case 'headingDesignCut':
      return labels.warningsHeadingDesignCutTitle;
    case 'sideColumnPercentClamped':
      return labels.warningsSideColumnPercentClampedTitle;
    case 'columnCountClamped':
      return labels.warningsColumnCountClampedTitle;
    case 'cjkGridClamped':
      return labels.warningsCjkGridClampedTitle;
    case 'designCyclicAnchor':
      return labels.warningsDesignCyclicAnchorTitle;
    case 'designDanglingAnchor':
      return labels.warningsDesignDanglingAnchorTitle;
    case 'designTextClipAlwaysTruncates':
      return labels.warningsDesignTextClipAlwaysTruncatesTitle;
    case 'designTextTruncated':
      return labels.warningsDesignTextTruncatedTitle;
    case 'headingSpanWithoutBreak':
      return labels.warningsHeadingSpanWithoutBreakTitle;
    case 'headingAdvancedWithoutTitleText':
      return labels.warningsHeadingAdvancedWithoutTitleTextTitle;
    case 'unknownResourceId':
      return labels.warningsUnknownResourceIdTitle;
    case 'duplicateResourceId':
      return labels.warningsDuplicateResourceIdTitle;
    case 'danglingTypeRef':
      return labels.warningsDanglingTypeRefTitle;
    case 'bitmapTooSmall':
      return labels.warningsBitmapTooSmallTitle;
    case 'floatShrunk':
      return labels.warningsFloatShrunkTitle;
    case 'unknownTableStyle':
      return labels.warningsUnknownTableStyleTitle;
    case 'raggedTableGrid':
      return labels.warningsRaggedTableGridTitle;
    case 'videoWithoutPoster':
      return labels.warningsVideoWithoutPosterTitle;
    case 'videoWithoutUrl':
      return labels.warningsVideoWithoutUrlTitle;
    case 'videoUrlInvalid':
      return labels.warningsVideoUrlInvalidTitle;
    case 'missingImage':
      return labels.warningsMissingImageTitle;
    case 'svgFontUnavailable':
      return labels.warningsSvgFontUnavailableTitle;
    case 'svgFontsTooLarge':
      return labels.warningsSvgFontsTooLargeTitle;
    case 'storageUnavailable':
      return labels.warningsStorageUnavailableTitle;
    case 'chapterFrontmatterIgnored':
      return labels.warningsChapterFrontmatterIgnoredTitle;
    case 'fontFamilyStack':
      return labels.warningsFontFamilyStackTitle;
    case 'unknownNumberFormat':
      return labels.warningsUnknownNumberFormatTitle;
    case 'unknownNumerals':
      return labels.warningsUnknownNumeralsTitle;
    case 'lineNumbersUnsupported':
      return labels.warningsLineNumbersUnsupportedTitle;
    case 'wrapUnsupported':
      return labels.warningsWrapUnsupportedTitle;
    case 'textWrap':
      return labels.warningsTextWrapTitle;
    case 'lineNumberOverlap':
      return labels.warningsLineNumberOverlapTitle;
    case 'dropCap':
      return labels.warningsDropCapTitle;
    case 'codeOverflow':
      return labels.warningsCodeOverflowTitle;
    case 'unknownConfigKey':
      return labels.warningsUnknownConfigKeyTitle;
    case 'unknownConfigValue':
      return labels.warningsUnknownConfigValueTitle;
    case 'unsupportedHyphenationLocale':
      return labels.warningsUnsupportedHyphenationLocaleTitle;
    case 'missingGlyph':
      return labels.warningsMissingGlyphTitle;
    case 'variableFontDefaultInstance':
      return labels.warningsVariableFontTitle;
    case 'cffEmbeddedWhole':
      return labels.warningsCffEmbeddedWholeTitle;
    case 'comicSplitSyntax':
      return labels.warningsComicSplitSyntaxTitle;
    case 'comicSplitOverflow':
      return labels.warningsComicSplitOverflowTitle;
    case 'comicPanelCount':
      return labels.warningsComicPanelCountTitle;
    case 'comicStrayText':
      return labels.warningsComicStrayTextTitle;
    case 'comicUnknownBalloonStyle':
      return labels.warningsComicUnknownBalloonStyleTitle;
    case 'comicUnknownArt':
      return labels.warningsComicUnknownArtTitle;
    case 'comicPanelLetterbox':
      return labels.warningsComicPanelLetterboxTitle;
    case 'comicAnchorOutsideSafeArea':
      return labels.warningsComicAnchorOutsideSafeAreaTitle;
    case 'comicBalloonOverflow':
      return labels.warningsComicBalloonOverflowTitle;
    case 'comicUnknownSpeaker':
      return labels.warningsComicUnknownSpeakerTitle;
  }
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

function detailFor(payload: WarningPayload, labels: SandboxLabels): string {
  switch (payload.kind) {
    case 'preflight':
      return preflightDetail(payload.check, labels);
    case 'missingFont':
      return `"${payload.family}" — ${labels.warningsMissingFontDetail}`;
    case 'missingFontFamily':
      return `"${payload.family}" — ${labels.warningsMissingFontFamilyDetail}`;
    case 'missingFontVariant':
      return `"${payload.family}" [${formatVariantList(payload.variants)}] — ${labels.warningsMissingFontVariantDetail}`;
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
    case 'unbreakableWordOverflow':
      return labels.warningsUnbreakableWordOverflowDetail.replace('__text__', payload.text);
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
      return `:::${payload.name} — ${labels.warningsUnclosedContainerDetail}`;
    case 'unclosedCodeBlock':
      return `${payload.delimiter}${payload.lang ?? ''} — ${labels.warningsUnclosedCodeBlockDetail}`;
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
    case 'unknownChipStyle':
      return `${inResource(payload.inResource)}:chip[…]{style="${payload.style}"} — ${labels.warningsUnknownChipStyleDetail}`;
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
      const where = payload.slot === 'tocRow' ? 'toc.parts.design' : payload.slot;
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
            : labels.warningsTextWrapVertical;
      return `${payload.resourceId !== undefined ? `#${payload.resourceId}` : `:::callout${payload.box ? ` (${payload.box})` : ''}`} — ${detail}`;
    }
    case 'lineNumberOverlap':
      return labels.warningsLineNumberOverlapDetail.replace('__number__', payload.number);
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
              : labels.warningsDropCapNoLetter;
      return detail.replace('__text__', payload.text).replace('__lines__', String(payload.lines ?? ''));
    }
    case 'unknownConfigKey':
      return `${payload.path} — ${labels.warningsUnknownConfigKeyDetail}${payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : ''}`;
    case 'unknownConfigValue':
      return `${payload.path}: "${payload.value}" — ${labels.warningsUnknownConfigValueDetail.replace('__used__', payload.used)}${payload.suggestion ? ` ${labels.warningsUnknownConfigKeySuggestion.replace('__suggestion__', payload.suggestion)}` : ''}`;
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

function isFontWarning(kind: WarningPayload['kind']): boolean {
  return (
    kind === 'missingFont' ||
    kind === 'missingFontFamily' ||
    kind === 'missingFontVariant' ||
    kind === 'duplicateFontVariant' ||
    kind === 'missingGlyph' ||
    kind === 'variableFontDefaultInstance' ||
    kind === 'cffEmbeddedWhole'
  );
}

function WarningItem({
  warning,
  labels,
  multiChapter,
  onClick,
}: {
  warning: Warning;
  labels: SandboxLabels;
  multiChapter: boolean;
  onClick: (w: Warning) => void;
}) {
  const Icon = iconFor(warning.payload.kind);
  // A preflight finding, or a design text cut on a page (#628), names its
  // book page.
  const preflightPage = warning.payload.kind === 'preflight' || warning.payload.kind === 'designTextTruncated' ? warning.payload.page : undefined;
  const critical = warning.payload.kind === 'preflight' && warning.payload.check.severity === 'critical';
  const clickable = warning.sourceStart !== undefined || isFontWarning(warning.payload.kind) || preflightPage !== undefined;
  const title = titleFor(warning.payload, labels);
  const detail = detailFor(warning.payload, labels);
  const line = warning.chapterLine ?? warning.line;
  const chapterTag = multiChapter && warning.chapterIndex !== undefined
    ? labels.warningsChapterLabel.replace('__n__', String(warning.chapterIndex + 1))
    : null;
  const pageTag = preflightPage !== undefined ? fill(labels.preflightPage, { page: preflightPage }) : null;
  const lineTag = pageTag ?? (line !== undefined
    ? [chapterTag, `${labels.warningsLineLabel} ${line}`].filter(Boolean).join(' · ')
    : chapterTag);

  return (
    <ListRow
      onSelect={clickable ? () => onClick(warning) : undefined}
      ariaLabel={`${title}${lineTag ? ` (${lineTag})` : ''}`}
      alignTop
      leading={<Icon size={16} aria-hidden="true" style={{ color: critical ? 'var(--destructive)' : 'var(--brand)', marginTop: 1 }} />}
      title={critical ? `${title} · ${labels.preflightCritical}` : title}
      subtitle={detail}
      tags={lineTag ? (
        <span className="ms-auto shrink-0 text-[10px] font-medium" style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>
          {lineTag}
        </span>
      ) : undefined}
      className="mx-2 my-0.5"
    />
  );
}

export function WarningsPanel() {
  const { state, dispatch } = useSandbox();
  const { labels } = state;
  const warnings = useSandboxWarnings();
  const multiChapter = state.chapters.length > 1;

  const handleClick = (w: Warning) => {
    // A preflight finding opens its page in the viewer.
    if (w.payload.kind === 'preflight' && w.payload.page !== undefined) {
      goToBookPage(w.payload.page);
      return;
    }
    // A cut design text opens its page; one that prints a heading or a
    // frontmatter field also selects it in the editor.
    if (w.payload.kind === 'designTextTruncated') goToBookPage(w.payload.page);
    if (isFontWarning(w.payload.kind)) {
      // Surface the custom-font manager so the user can upload the missing
      // variant, re-add the family, or disambiguate duplicates.
      dispatch({ type: 'SET_PANEL', payload: 'fonts' });
      return;
    }
    if (w.sourceStart === undefined) return;
    const anchor = w.chapterStart ?? w.sourceStart;
    const head = w.chapterEnd ?? w.sourceEnd ?? anchor;
    dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    dispatch({
      type: 'SET_PENDING_EDITOR_FOCUS',
      payload: { chapterId: w.chapterId, anchor, head, selectWord: false },
    });
  };

  const groups = WARNING_CATEGORY_ORDER
    .map((category) => ({ category, items: warnings.filter((w) => warningCategory(w.payload.kind) === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={labels.navWarnings} count={warnings.length} />
      <PanelBody>
        {warnings.length === 0 ? (
          <EmptyState icon={<CircleCheck size={32} />} title={labels.warningsEmpty} description={labels.warningsEmptyDescription} />
        ) : (
          groups.map(({ category, items }) => (
            <WarningGroup key={category} title={categoryLabel(category, labels)} count={items.length}>
              {items.map((w) => (
                <li key={w.id}>
                  <WarningItem warning={w} labels={labels} multiChapter={multiChapter} onClick={handleClick} />
                </li>
              ))}
            </WarningGroup>
          ))
        )}
      </PanelBody>
    </div>
  );
}

function categoryLabel(category: WarningCategory, labels: SandboxLabels): string {
  switch (category) {
    case 'fonts': return labels.warningsGroupFonts;
    case 'figures': return labels.warningsGroupFigures;
    case 'markup': return labels.warningsGroupMarkup;
    case 'design': return labels.warningsGroupDesign;
    case 'typesetting': return labels.warningsGroupTypesetting;
    case 'preflight': return labels.warningsGroupPreflight;
    case 'system': return labels.warningsGroupSystem;
  }
}

/** One collapsible group of warnings, open by default. */
function WarningGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-b border-(--rule)">
      <Collapsible.Trigger
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-start text-xs font-semibold text-(--foreground) transition-colors',
          'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
        )}
      >
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
        <span className="min-w-0 flex-1">{title}</span>
        <span className="rounded-full bg-(--surface) px-1.5 text-[0.62rem] font-medium text-(--slate) tabular-nums">{count}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel data-postext-collapsible="">
        <ul className="m-0 list-none p-0 pb-1.5">{children}</ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
