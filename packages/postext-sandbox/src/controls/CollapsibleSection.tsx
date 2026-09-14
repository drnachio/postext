'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
  defaultOpen,
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
  const [open, setOpen] = useState(() => {
    if (sectionId) {
      const saved = loadSectionState(sectionId);
      if (saved !== null) return saved;
    }
    return defaultOpen;
  });
  const effectiveOpen = search.active ? true : open;

  const toggle = () => {
    if (search.active) return;
    const next = !open;
    setOpen(next);
    if (sectionId) saveSectionState(sectionId, next);
  };

  const isSubsection = variant === 'subsection';
  const modified = hasOverrides || overrideCount > 0;

  return (
    <Collapsible.Root
      open={effectiveOpen}
      onOpenChange={toggle}
      style={visible ? undefined : { display: 'none' }}
      data-section-id={sectionId}
    >
      <div
        className={cn('flex w-full items-center', !isSubsection && 'border-b')}
        style={{ borderColor: 'var(--rule)' }}
      >
        <Collapsible.Trigger
          className={cn(
            'flex flex-1 cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-3 py-2 text-left text-xs transition-colors',
            'focus-visible:outline-1 focus-visible:-outline-offset-1 outline-(--gilt-hover)',
            isSubsection
              ? 'text-(--slate) hover:text-(--foreground)'
              : 'font-semibold uppercase tracking-wider text-(--gilt) hover:text-(--foreground)',
          )}
        >
          <span className="min-w-0 truncate">
            <HighlightedText text={title} tokens={search.matcher.tokens} />
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {modified && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal"
                style={{ color: 'var(--gilt)', fontVariantNumeric: 'tabular-nums' }}
                title={labels.settingsModifiedCount.replace('__count__', String(overrideCount))}
              >
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--gilt)' }} />
                {overrideCount > 0 && overrideCount}
              </span>
            )}
            <ChevronRight
              size={14}
              aria-hidden="true"
              style={{ transform: effectiveOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}
            />
          </span>
        </Collapsible.Trigger>
        {hasOverrides && onReset && (
          <ConfirmPopover message={resetConfirmMessage ?? labels.resetSectionConfirm} onConfirm={onReset}>
            {({ open: openConfirm }) => (
              <IconButton
                label={resetLabel ?? labels.resetSection}
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
        <div className="px-3 py-2">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
