'use client';

import { type ReactNode, useState } from 'react';
import { MapPin, CircleCheck, ChevronRight } from 'lucide-react';
import { useSandbox, useSandboxWarnings } from '../context/SandboxContext.js';
import { ListRow, IconButton, PanelHeader, PanelBody, EmptyState, Collapsible, cn } from '../ui/index.js';
import { warningAnchor } from '../warnings/anchorTarget.js';
import { requestAnchorEditor } from '../panels/resources/marks/anchorEditorRequest.js';
import { isAcceptedWarning, WARNING_CATEGORY_ORDER, warningCategory, type WarningCategory } from '../warnings/categories.js';
import type { WarningPayload, Warning } from '../warnings/types.js';
import type { SandboxLabels } from '../types/index.js';
import { fill } from '../print/fillTokens.js';
import { viewHashFragment, readViewHash } from '../storage/viewHash.js';
import { useComposedChecks, ComposedChecksSection } from './ComposedChecks.js';
import { isComposedCheckKind } from '../warnings/composedChecks.js';
import { TextMigrationOffer } from '../migrate/TextMigrationOffer.js';
import { detailFor } from './WarningsPanel/details.js';
import { iconFor } from './WarningsPanel/icons.js';
import { titleFor } from './WarningsPanel/titles.js';

export { titleFor } from './WarningsPanel/titles.js';
export { detailFor } from './WarningsPanel/details.js';

/** Open a book page in the viewer: the fragment names it, and the viewer
 *  follows a fragment change (see `usePageHashSync`). */
function goToBookPage(page: number): void {
  if (typeof window === 'undefined') return;
  window.location.hash = viewHashFragment({ ...readViewHash(), page });
}

function isFontWarning(kind: WarningPayload['kind']): boolean {
  return (
    kind === 'missingFont' ||
    kind === 'missingFontFamily' ||
    kind === 'missingFontVariant' ||
    kind === 'fontFallback' ||
    kind === 'glyphFallback' ||
    kind === 'duplicateFontVariant' ||
    kind === 'missingGlyph' ||
    kind === 'variableFontDefaultInstance' ||
    kind === 'cffEmbeddedWhole'
  );
}

function WarningItem({
  warning,
  labels,
  locale,
  multiChapter,
  onClick,
  onAnchor,
}: {
  warning: Warning;
  labels: SandboxLabels;
  /** The interface language, for numbers (#938). */
  locale?: string;
  multiChapter: boolean;
  onClick: (w: Warning) => void;
  /** A figure label's warning (#866): the anchor in the picture's anchor
   *  editor (the row itself leads to the text). */
  onAnchor?: (w: Warning) => void;
}) {
  const Icon = iconFor(warning.payload.kind);
  // A preflight or contrast finding, a design text cut on a page (#628)
  // or a contents block cut (#850) names its book page.
  const preflightPage = warning.payload.kind === 'preflight' || warning.payload.kind === 'contrast' || warning.payload.kind === 'designTextTruncated' || warning.payload.kind === 'tocGroupSplit' || warning.payload.kind === 'headingClaimsColumn' ? warning.payload.page : undefined;
  const critical = warning.payload.kind === 'preflight' && warning.payload.check.severity === 'critical';
  const clickable = warning.sourceStart !== undefined || isFontWarning(warning.payload.kind) || preflightPage !== undefined;
  const title = titleFor(warning.payload, labels);
  const detail = detailFor(warning.payload, labels, locale);
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
      actions={onAnchor && warningAnchor(warning.payload) ? (
        <IconButton
          label={(warningAnchor(warning.payload)!.place ? labels.warningsPlaceAnchor : labels.warningsShowAnchor).replace('__id__', warningAnchor(warning.payload)!.anchor)}
          icon={<MapPin size={14} aria-hidden="true" />}
          onClick={() => onAnchor(warning)}
        />
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
  // A book of composed pages (#867): their checks in every edition, by
  // page, frame and language, in a section of their own.
  const composedBook = (state.config.pageTemplates?.length ?? 0) > 0;
  const composed = useComposedChecks(warnings, composedBook);

  const handleClick = (w: Warning) => {
    // A preflight finding opens its page in the viewer.
    if (w.payload.kind === 'preflight' && w.payload.page !== undefined) {
      goToBookPage(w.payload.page);
      return;
    }
    // A cut design text opens its page; one that prints a heading or a
    // frontmatter field also selects it in the editor.
    if (w.payload.kind === 'designTextTruncated') goToBookPage(w.payload.page);
    // A contents block cut between columns (#850) opens the contents page
    // and selects the `:::toc` line.
    if (w.payload.kind === 'tocGroupSplit' || w.payload.kind === 'headingClaimsColumn') goToBookPage(w.payload.page);
    // A contrast finding opens the page of its first occurrence, and
    // selects its text when it has a place in the source.
    if (w.payload.kind === 'contrast' && w.payload.page !== undefined) goToBookPage(w.payload.page);
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

  // A figure label's warning (#866): a name to place on the picture, or
  // the anchor left without a label, in the picture's anchor editor.
  const handleAnchor = (w: Warning) => {
    const target = warningAnchor(w.payload);
    const resourceId = 'resourceId' in w.payload ? w.payload.resourceId : undefined;
    if (!target || !resourceId) return;
    requestAnchorEditor(dispatch, target.place ? { resourceId, place: target.anchor } : { resourceId, anchor: target.anchor });
  };

  // The contrast pairs `contrast.allow` accepts (#1124) are listed after
  // the rest, in a group of their own, and not counted.
  const accepted = warnings.filter(isAcceptedWarning);
  const open = accepted.length > 0 ? warnings.filter((w) => !isAcceptedWarning(w)) : warnings;
  const listed = composedBook ? open.filter((w) => !isComposedCheckKind(w.payload.kind)) : open;
  const groups = WARNING_CATEGORY_ORDER
    .map((category) => ({ category, items: listed.filter((w) => warningCategory(w.payload.kind) === category) }))
    .filter((g) => g.items.length > 0);
  const total = listed.length + (composedBook ? composed.checks.length : 0);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={labels.navWarnings} count={total} />
      <PanelBody>
        <TextMigrationOffer contentWarnings={warnings.filter((w) => w.payload.kind === 'contentInConfig').length} />
        {composedBook && (
          <ComposedChecksSection
            checks={composed.checks}
            editions={composed.editions}
            labels={labels}
            title={(w) => titleFor(w.payload, labels)}
            detail={(w) => detailFor(w.payload, labels, state.locale)}
            onAnchor={handleAnchor}
          />
        )}
        {total === 0 ? (
          <EmptyState icon={<CircleCheck size={32} />} title={labels.warningsEmpty} description={labels.warningsEmptyDescription} />
        ) : (
          groups.map(({ category, items }) => (
            <WarningGroup key={category} title={categoryLabel(category, labels)} count={items.length}>
              {items.map((w) => (
                <li key={w.id}>
                  <WarningItem warning={w} labels={labels} locale={state.locale} multiChapter={multiChapter} onClick={handleClick} onAnchor={handleAnchor} />
                </li>
              ))}
            </WarningGroup>
          ))
        )}
        {accepted.length > 0 && (
          <WarningGroup title={labels.contrastAcceptedSection} count={accepted.length}>
            {accepted.map((w) => (
              <li key={w.id}>
                <WarningItem warning={w} labels={labels} locale={state.locale} multiChapter={multiChapter} onClick={handleClick} onAnchor={handleAnchor} />
              </li>
            ))}
          </WarningGroup>
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
    case 'contrast': return labels.contrastSection;
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
