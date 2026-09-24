'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, CircleCheck, Type, FileWarning, Heading, List, FileText, Sigma, Image, Database } from 'lucide-react';
import { KNOWN_CONTAINERS, KNOWN_DIRECTIVES } from 'postext';
import { useSandbox, useSandboxWarnings } from '../context/SandboxContext';
import { Collapsible, EmptyState, ListRow, PanelBody, PanelHeader, cn } from '../ui';
import { WARNING_CATEGORY_ORDER, warningCategory, type WarningCategory } from '../warnings/categories';
import type { Warning, WarningPayload } from '../warnings/types';
import type { SandboxLabels } from '../types';

/** Human tag for the design slot a warning points at. */
function slotWhere(slot: string, level?: number): string {
  return slot === 'heading' ? `H${level ?? ''}` : slot;
}

function iconFor(kind: WarningPayload['kind']) {
  switch (kind) {
    case 'missingFont':
    case 'missingFontFamily':
    case 'missingFontVariant':
    case 'duplicateFontVariant':
      return Type;
    case 'looseLine':
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
    case 'unknownDirective':
    case 'unclosedContainer':
    case 'unknownParagraphStyle':
    case 'unknownCalloutType':
    case 'unknownChipStyle':
    case 'chipOverlap':
    case 'numberingInvalidFormat':
    case 'numberingInvalidStartAt':
    case 'pagebreakInvalidParity':
    case 'spaceInvalidLines':
    case 'headingBreakInvalidParity':
    case 'parityCascade':
    case 'alphaPdfOverflow':
    case 'calloutOverflow':
      return FileWarning;
    case 'designCyclicAnchor':
    case 'designDanglingAnchor':
    case 'designTextClipAlwaysTruncates':
      return FileWarning;
    case 'headingSpanWithoutBreak':
    case 'headingAdvancedWithoutTitleText':
      return Heading;
    case 'unknownResourceId':
    case 'duplicateResourceId':
    case 'danglingTypeRef':
    case 'bitmapTooSmall':
      return Image;
    case 'storageUnavailable':
      return Database;
    case 'chapterFrontmatterIgnored':
      return FileText;
    default:
      return AlertTriangle;
  }
}

function titleFor(payload: WarningPayload, labels: SandboxLabels): string {
  switch (payload.kind) {
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
    case 'unknownDirective':
      return labels.warningsUnknownDirectiveTitle;
    case 'unclosedContainer':
      return labels.warningsUnclosedContainerTitle;
    case 'unknownParagraphStyle':
      return labels.warningsUnknownParagraphStyleTitle;
    case 'unknownCalloutType':
      return labels.warningsUnknownCalloutTypeTitle;
    case 'unknownChipStyle':
      return labels.warningsUnknownChipStyleTitle;
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
    case 'parityCascade':
      return labels.warningsParityCascadeTitle;
    case 'alphaPdfOverflow':
      return labels.warningsAlphaPdfOverflowTitle;
    case 'calloutOverflow':
      return labels.warningsCalloutOverflowTitle;
    case 'designCyclicAnchor':
      return labels.warningsDesignCyclicAnchorTitle;
    case 'designDanglingAnchor':
      return labels.warningsDesignDanglingAnchorTitle;
    case 'designTextClipAlwaysTruncates':
      return labels.warningsDesignTextClipAlwaysTruncatesTitle;
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
    case 'storageUnavailable':
      return labels.warningsStorageUnavailableTitle;
    case 'chapterFrontmatterIgnored':
      return labels.warningsChapterFrontmatterIgnoredTitle;
  }
}

/** `pagebreak`, `numbering`, `callout`, … — every fence name the parser
 *  accepts, for the unknown-directive detail string. */
const KNOWN_FENCE_NAMES = [...KNOWN_DIRECTIVES, ...KNOWN_CONTAINERS]
  .map((n) => `\`${n}\``)
  .join(', ');

function formatVariantList(
  variants: Array<{ weight: number; style: 'normal' | 'italic' }>,
): string {
  return variants.map((v) => `${v.weight}${v.style === 'italic' ? ' italic' : ''}`).join(', ');
}

function detailFor(payload: WarningPayload, labels: SandboxLabels): string {
  switch (payload.kind) {
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
      return `${slotWhere(payload.slot, payload.level)} · {${payload.name}} — ${labels.warningsHeaderFooterUnknownPlaceholderDetail}`;
    case 'headerFooterMetadataMissing':
      return `${slotWhere(payload.slot, payload.level)} · {${payload.name}} — ${labels.warningsHeaderFooterMetadataMissingDetail}`;
    case 'unknownDirective':
      return `:::${payload.name} — ${labels.warningsUnknownDirectiveDetail.replace('__names__', KNOWN_FENCE_NAMES)}`;
    case 'unclosedContainer':
      return `:::${payload.name} — ${labels.warningsUnclosedContainerDetail}`;
    case 'unknownParagraphStyle':
      return `:::paragraphs{style="${payload.style}"} — ${labels.warningsUnknownParagraphStyleDetail}`;
    case 'unknownCalloutType':
      return `:::callout{type="${payload.type}"} — ${labels.warningsUnknownCalloutTypeDetail}`;
    case 'unknownChipStyle':
      return `:chip[…]{style="${payload.style}"} — ${labels.warningsUnknownChipStyleDetail}`;
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
    case 'designCyclicAnchor': {
      const where = slotWhere(payload.slot, payload.level);
      return `${where} · #${payload.elementId} — ${labels.warningsDesignCyclicAnchorDetail}`;
    }
    case 'designDanglingAnchor': {
      const where = slotWhere(payload.slot, payload.level);
      return `${where} · #${payload.elementId} → #${payload.referencedId} — ${labels.warningsDesignDanglingAnchorDetail}`;
    }
    case 'designTextClipAlwaysTruncates': {
      const where = slotWhere(payload.slot, payload.level);
      return `${where} · #${payload.elementId} — ${labels.warningsDesignTextClipAlwaysTruncatesDetail}`;
    }
    case 'headingSpanWithoutBreak':
      return `H${payload.level} — ${labels.warningsHeadingSpanWithoutBreakDetail}`;
    case 'headingAdvancedWithoutTitleText':
      return `H${payload.level} — ${labels.warningsHeadingAdvancedWithoutTitleTextDetail}`;
    case 'unknownResourceId': {
      const where = payload.usage === 'embed' ? '::resource' : ':ref';
      return `${where}{id=${payload.resourceId}} — ${labels.warningsUnknownResourceIdDetail}`;
    }
    case 'duplicateResourceId':
      return `#${payload.resourceId} ×${payload.count} — ${labels.warningsDuplicateResourceIdDetail}`;
    case 'danglingTypeRef':
      return `#${payload.resourceId} → ${payload.typeId} — ${labels.warningsDanglingTypeRefDetail}`;
    case 'bitmapTooSmall':
      return `#${payload.resourceId} · ${payload.renderedWidth}px / ${payload.bitmapWidth}px — ${labels.warningsBitmapTooSmallDetail}`;
    case 'storageUnavailable':
      return labels.warningsStorageUnavailableDetail;
    case 'chapterFrontmatterIgnored':
      return labels.warningsChapterFrontmatterIgnoredDetail.replace('__chapter__', payload.chapterTitle);
  }
}

function isFontWarning(kind: WarningPayload['kind']): boolean {
  return (
    kind === 'missingFont' ||
    kind === 'missingFontFamily' ||
    kind === 'missingFontVariant' ||
    kind === 'duplicateFontVariant'
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
  const clickable = warning.sourceStart !== undefined || isFontWarning(warning.payload.kind);
  const title = titleFor(warning.payload, labels);
  const detail = detailFor(warning.payload, labels);
  const line = warning.chapterLine ?? warning.line;
  const chapterTag = multiChapter && warning.chapterIndex !== undefined
    ? labels.warningsChapterLabel.replace('__n__', String(warning.chapterIndex + 1))
    : null;
  const lineTag = line !== undefined
    ? [chapterTag, `${labels.warningsLineLabel} ${line}`].filter(Boolean).join(' · ')
    : chapterTag;

  return (
    <ListRow
      onSelect={clickable ? () => onClick(warning) : undefined}
      ariaLabel={`${title}${lineTag ? ` (${lineTag})` : ''}`}
      alignTop
      leading={<Icon size={16} aria-hidden="true" style={{ color: 'var(--brand)', marginTop: 1 }} />}
      title={title}
      subtitle={detail}
      tags={lineTag ? (
        <span className="ml-auto shrink-0 text-[10px] font-medium" style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>
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
          'flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-xs font-semibold text-(--foreground) transition-colors',
          'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
        )}
      >
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate)" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
        <span className="min-w-0 flex-1">{title}</span>
        <span className="rounded-full bg-(--surface) px-1.5 text-[0.62rem] font-medium text-(--slate) tabular-nums">{count}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel data-postext-collapsible="">
        <ul className="m-0 list-none p-0 pb-1.5">{children}</ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
