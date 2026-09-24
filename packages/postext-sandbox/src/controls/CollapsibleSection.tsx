'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { saveSectionState, loadSectionState } from '../storage/persistence';
import { useSandboxLabels } from '../context/SandboxContext';
import { Collapsible, ConfirmPopover, HighlightedText, IconButton, cn } from '../ui';
import { useSettingsSearch } from '../sidebar/search/SearchContext';
import { MatchScopeProvider, useScopeCounts, useScopeVisible } from '../sidebar/search/MatchScope';
import { normalizeText } from '../sidebar/search/normalize';

interface CollapsibleSectionProps {
  title: string;
  sectionId?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  onReset?: () => void;
  hasOverrides?: boolean;
  resetLabel?: string;
  resetConfirmMessage?: string;
  /** Visual density of the header. `'section'` (default) is the uppercase
   *  primary-section style. `'subsection'` renders a smaller, non-uppercase
   *  header that nests inside another section. */
  variant?: 'section' | 'subsection';
}

/** How deep a section sits: 0 for the sections of a settings page, 1+ for
 *  the ones nested inside them. */
const SectionDepthContext = createContext(0);

/** Collapsible settings group. Open state is remembered per `sectionId`.
 *  While the settings search is active every section is forced open and
 *  hides itself when neither its title nor any field inside matches. */
export function CollapsibleSection({
  title,
  sectionId,
  defaultOpen = false,
  children,
  onReset,
  hasOverrides = false,
  resetLabel,
  resetConfirmMessage,
  variant = 'section',
}: CollapsibleSectionProps) {
  const search = useSettingsSearch();
  const normalizedTitle = useMemo(() => normalizeText(title), [title]);
  const titleMatch = search.matcher.tokens.length > 0 && search.matcher.test(normalizedTitle);
  return (
    <MatchScopeProvider id={sectionId} titleMatch={titleMatch} overridden={hasOverrides}>
      <SectionFrame
        title={title}
        sectionId={sectionId}
        defaultOpen={defaultOpen}
        onReset={onReset}
        hasOverrides={hasOverrides}
        resetLabel={resetLabel}
        resetConfirmMessage={resetConfirmMessage}
        variant={variant}
        titleMatch={titleMatch}
      >
        {children}
      </SectionFrame>
    </MatchScopeProvider>
  );
}

interface SectionFrameProps {
  title: string;
  sectionId?: string;
  defaultOpen: boolean;
  children: ReactNode;
  onReset?: () => void;
  hasOverrides: boolean;
  resetLabel?: string;
  resetConfirmMessage?: string;
  variant: 'section' | 'subsection';
  titleMatch: boolean;
}

function SectionFrame({
  title,
  sectionId,
  defaultOpen: defaultOpenProp,
  children,
  onReset,
  hasOverrides,
  resetLabel,
  resetConfirmMessage,
  variant,
  titleMatch,
}: SectionFrameProps) {
  const labels = useSandboxLabels();
  const search = useSettingsSearch();
  const { overrideCount } = useScopeCounts();
  const visible = useScopeVisible(titleMatch, hasOverrides);
  const depth = useContext(SectionDepthContext);
  // The sections of a settings page start open (the page already narrows
  // what is shown); their open state is remembered under its own key so the
  // old all-in-one list's collapsed state does not carry over.
  const topLevel = depth === 0 && variant === 'section';
  const storageKey = sectionId ? (topLevel ? `page:${sectionId}` : sectionId) : undefined;
  const defaultOpen = topLevel ? true : defaultOpenProp;
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      const saved = loadSectionState(storageKey);
      if (saved !== null) return saved;
    }
    return defaultOpen;
  });
  const effectiveOpen = search.active ? true : open;

  const toggle = () => {
    if (search.active) return;
    const next = !open;
    setOpen(next);
    if (storageKey) saveSectionState(storageKey, next);
  };

  const isSubsection = variant === 'subsection';
  const modified = hasOverrides || overrideCount > 0;

  return (
    <Collapsible.Root
      open={effectiveOpen}
      onOpenChange={toggle}
      style={visible ? undefined : { display: 'none' }}
      data-section-id={sectionId}
      className={cn(topLevel && 'border-t border-(--rule)', !topLevel && !isSubsection && 'my-1.5 rounded-md border border-(--rule)')}
    >
      <div className="flex w-full items-center">
        <Collapsible.Trigger
          className={cn(
            'flex flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent text-left transition-colors',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
            topLevel
              ? 'min-h-10 px-3 py-2 text-[0.8rem] font-semibold text-(--foreground) hover:bg-(--surface)'
              : isSubsection
                ? 'min-h-8 px-3 py-1.5 text-[0.72rem] font-medium text-(--slate) hover:text-(--foreground)'
                : 'min-h-8 rounded-md px-2.5 py-1.5 text-xs font-medium text-(--foreground) hover:bg-(--surface)',
          )}
        >
          <ChevronRight
            size={topLevel ? 14 : 12}
            aria-hidden="true"
            className="shrink-0 text-(--slate)"
            style={{ transform: effectiveOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}
          />
          <span className="min-w-0 flex-1 [text-wrap:pretty]">
            <HighlightedText text={title} tokens={search.matcher.tokens} />
          </span>
          {modified && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[0.62rem] font-medium text-(--brand) tabular-nums"
              title={labels.settingsModifiedCount.replace('__count__', String(overrideCount))}
            >
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-(--brand)" />
              {overrideCount > 0 && <span aria-hidden="true">{overrideCount}</span>}
              <span className="sr-only">{labels.settingsModifiedCount.replace('__count__', String(overrideCount))}</span>
            </span>
          )}
        </Collapsible.Trigger>
        {hasOverrides && onReset && (
          <ConfirmPopover message={resetConfirmMessage ?? labels.resetSectionConfirm} onConfirm={onReset}>
            {({ open: openConfirm }) => (
              <IconButton
                label={`${resetLabel ?? labels.resetSection}: ${title}`}
                icon={<RotateCcw size={12} />}
                onClick={(e) => {
                  e.stopPropagation();
                  openConfirm(e);
                }}
                className="mr-2"
              />
            )}
          </ConfirmPopover>
        )}
      </div>
      <Collapsible.Panel keepMounted data-postext-collapsible="" data-instant={search.active ? '' : undefined}>
        <SectionDepthContext value={depth + 1}>
          <div className={cn('@container', topLevel ? 'px-3 pt-1 pb-3' : isSubsection ? 'px-3 pb-2' : 'px-2.5 pb-2')}>{children}</div>
        </SectionDepthContext>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
