'use client';

import { BookOpen, FileCode, Settings2, FolderOpen, AlertTriangle, Type, Files, Eye } from 'lucide-react';
import { useRef, useLayoutEffect, useEffect, useCallback, useState, type ReactNode } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxPresetStale, useSandboxSelector, useSandboxWarnings } from '../context/SandboxContext';
import type { PanelId } from '../types';
import { Tooltip, cn } from '../ui';

interface ActivityBarProps {
  themeToggle?: ReactNode;
  languageSwitcher?: ReactNode;
  homeUrl?: string;
  homeLink?: ReactNode;
}

type NavLabelKey = 'navBooks' | 'navChapters' | 'navManuscript' | 'navResources' | 'navFonts' | 'navDesign' | 'navWarnings';
type NavHintKey = 'navBooksHint' | 'navChaptersHint' | 'navManuscriptHint' | 'navResourcesHint' | 'navFontsHint' | 'navDesignHint' | 'navWarningsHint';

/** Workflow order: pick a book, arrange its chapters, write, add figures and fonts, design,
 *  then check. Each entry has a one-word label (shown under the icon) and a
 *  longer hint (tooltip + accessible description). */
const PANEL_ICONS: { id: PanelId; Icon: typeof FileCode; labelKey: NavLabelKey; hintKey: NavHintKey }[] = [
  { id: 'projects', Icon: Files, labelKey: 'navBooks', hintKey: 'navBooksHint' },
  { id: 'chapters', Icon: BookOpen, labelKey: 'navChapters', hintKey: 'navChaptersHint' },
  { id: 'markdown', Icon: FileCode, labelKey: 'navManuscript', hintKey: 'navManuscriptHint' },
  { id: 'resources', Icon: FolderOpen, labelKey: 'navResources', hintKey: 'navResourcesHint' },
  { id: 'fonts', Icon: Type, labelKey: 'navFonts', hintKey: 'navFontsHint' },
  { id: 'config', Icon: Settings2, labelKey: 'navDesign', hintKey: 'navDesignHint' },
  { id: 'warnings', Icon: AlertTriangle, labelKey: 'navWarnings', hintKey: 'navWarningsHint' },
];

function PanelNav() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const presetStale = useSandboxPresetStale();
  const navRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<Map<PanelId, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const hasAnimated = useRef(false);

  const warningCount = useSandboxWarnings().length;

  const updateIndicator = useCallback(() => {
    if (activePanel === null) {
      setIndicator(null);
      hasAnimated.current = false;
      return;
    }
    const btn = buttonRefs.current.get(activePanel);
    const nav = navRef.current;
    if (!btn || !nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({ top: btnRect.top - navRect.top, height: btnRect.height });
    hasAnimated.current = true;
  }, [activePanel]);

  useLayoutEffect(updateIndicator, [updateIndicator]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [updateIndicator]);

  // Roving focus: one tab stop for the whole bar, arrow keys move within.
  const focusable = activePanel ?? PANEL_ICONS[0]!.id;
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const ids = PANEL_ICONS.map((p) => p.id);
    const current = ids.findIndex((id) => buttonRefs.current.get(id) === document.activeElement);
    if (current === -1) return;
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (current + 1) % ids.length;
    else if (e.key === 'ArrowUp') next = (current - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next === null) return;
    e.preventDefault();
    buttonRefs.current.get(ids[next]!)?.focus();
  };

  return (
    <nav ref={navRef} className="relative flex w-full flex-col items-stretch gap-0.5" aria-label={labels.panelsNav} onKeyDown={onKeyDown}>
      {indicator && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            // Flush with the bar's right edge: the bar's horizontal padding.
            right: '-0.25rem',
            top: indicator.top,
            height: indicator.height,
            width: 3,
            borderRadius: 0,
            backgroundColor: 'var(--brand)',
            transition: hasAnimated.current ? 'top 200ms ease-in-out, height 200ms ease-in-out, opacity 150ms ease-in-out' : 'none',
          }}
        />
      )}
      {PANEL_ICONS.map(({ id, Icon, labelKey, hintKey }) => {
        const isActive = activePanel === id;
        const label = labels[labelKey];
        const hint = labels[hintKey];
        const showBadge = id === 'warnings' && warningCount > 0;
        const badgeText = warningCount > 99 ? '99+' : String(warningCount);
        // A dot (no count) when the active preset changed on disk and local
        // edits keep it from being re-applied automatically.
        const showDot = id === 'projects' && presetStale;
        const ariaLabel = showBadge
          ? `${label} (${warningCount})`
          : showDot
            ? `${label} (${labels.presetStaleBanner})`
            : label;
        return (
          <Tooltip key={id} content={hint} side="right">
            <button
              ref={(el) => { if (el) buttonRefs.current.set(id, el); }}
              type="button"
              onClick={() => dispatch({ type: 'TOGGLE_PANEL', payload: id })}
              aria-label={ariaLabel}
              aria-description={hint}
              aria-pressed={isActive}
              tabIndex={id === focusable ? 0 : -1}
              className={cn(
                'relative flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md py-1.5 transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                isActive ? 'bg-(--surface) text-(--brand)' : 'text-(--slate) hover:bg-(--surface) hover:text-(--foreground)',
              )}
            >
              <Icon size={18} aria-hidden="true" />
              <span aria-hidden="true" className={cn('max-w-full truncate px-0.5 text-[0.55rem] leading-[1.2]', isActive && 'font-semibold text-(--foreground)')}>
                {label}
              </span>
              {showBadge && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0.5 right-1.5 box-border h-4 min-w-4 rounded-full bg-(--brand) px-1 text-center text-[10px] leading-4 font-bold text-(--brand-contrast,var(--background)) tabular-nums"
                >
                  {badgeText}
                </span>
              )}
              {showDot && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1.5 right-3 h-2 w-2 rounded-full bg-(--brand)"
                  style={{ boxShadow: '0 0 0 2px var(--background)' }}
                />
              )}
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function ActivityBar({ themeToggle, languageSwitcher, homeUrl, homeLink }: ActivityBarProps) {
  const labels = useSandboxLabels();
  return (
    <div
      className="flex h-full w-[3.7rem] flex-col items-center border-r px-1 pb-2"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      role="toolbar"
      aria-label={labels.activityBar}
      aria-orientation="vertical"
    >
      {/* Home logo */}
      {homeLink ? (
        // The logo sits in the top band, level with the panel's title.
        <div className="-mx-1 mb-2 flex h-9 w-[calc(100%+0.5rem)] shrink-0 items-center justify-center border-b" style={{ borderColor: 'var(--rule)' }}>
          {homeLink}
        </div>
      ) : homeUrl ? (
        <Tooltip content="Postext" side="right">
          <a
            href={homeUrl}
            className="-mx-1 mb-2 flex h-9 w-[calc(100%+0.5rem)] shrink-0 items-center justify-center border-b transition-colors focus-visible:outline-1 focus-visible:-outline-offset-1"
            style={{ outlineColor: 'var(--brand)', borderColor: 'var(--rule)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span
              className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-[22%] text-base font-extrabold leading-none text-white"
              style={{ backgroundColor: 'var(--brand-blue, #2b4acb)', fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              P
              <span className="absolute inset-x-0 bottom-0 h-[13%]" style={{ backgroundColor: 'var(--brand-gilt, #d8a21a)' }} />
            </span>
          </a>
        </Tooltip>
      ) : null}

      {/* Panel toggle icons */}
      <PanelNav />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col items-center gap-2">
        {/* Theme toggle slot */}
        {themeToggle && (
          <div className="flex h-8 w-8 items-center justify-center">
            {themeToggle}
          </div>
        )}

        {/* Language switcher slot */}
        {languageSwitcher && (
          <div className="flex h-8 w-8 items-center justify-center">
            {languageSwitcher}
          </div>
        )}
      </div>
    </div>
  );
}

/** The phone layout's panel bar, along the bottom of the window: the
 *  preview first (an open panel covers it there), then the panels in the
 *  same order as the side bar. One tap opens a panel, and Preview (or the
 *  open panel's own entry) goes back to the pages. */
export function MobileNavBar() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const presetStale = useSandboxPresetStale();
  const warningCount = useSandboxWarnings().length;
  const items: { id: PanelId | null; Icon: typeof FileCode; label: string; hint: string }[] = [
    { id: null, Icon: Eye, label: labels.navPreview, hint: labels.navPreviewHint },
    ...PANEL_ICONS.map(({ id, Icon, labelKey, hintKey }) => ({ id, Icon, label: labels[labelKey], hint: labels[hintKey] })),
  ];

  return (
    <nav
      className="flex shrink-0 items-stretch overflow-x-auto border-t"
      style={{
        borderColor: 'var(--rule)',
        backgroundColor: 'var(--background)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        scrollbarWidth: 'none',
      }}
      aria-label={labels.panelsNav}
    >
      {items.map(({ id, Icon, label, hint }) => {
        const isActive = activePanel === id;
        const showBadge = id === 'warnings' && warningCount > 0;
        const showDot = id === 'projects' && presetStale;
        const ariaLabel = showBadge
          ? `${label} (${warningCount})`
          : showDot
            ? `${label} (${labels.presetStaleBanner})`
            : label;
        return (
          <button
            key={id ?? 'preview'}
            type="button"
            onClick={() => dispatch({ type: 'SET_PANEL', payload: id === null || isActive ? null : id })}
            aria-label={ariaLabel}
            aria-description={hint}
            aria-pressed={isActive}
            className={cn(
              'relative flex min-w-[40px] flex-1 basis-0 cursor-pointer flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
              isActive ? 'text-(--brand)' : 'text-(--slate)',
            )}
          >
            {isActive && (
              <span aria-hidden="true" className="absolute inset-x-2 top-0 h-[3px] bg-(--brand)" />
            )}
            <Icon size={20} aria-hidden="true" />
            <span aria-hidden="true" className={cn('max-w-full truncate px-0.5 text-[0.6rem] leading-[1.2]', isActive && 'font-semibold text-(--foreground)')}>
              {label}
            </span>
            {showBadge && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0.5 left-1/2 ml-1 box-border h-4 min-w-4 rounded-full bg-(--brand) px-1 text-center text-[10px] leading-4 font-bold text-(--brand-contrast,var(--background)) tabular-nums"
              >
                {warningCount > 99 ? '99+' : String(warningCount)}
              </span>
            )}
            {showDot && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1.5 left-1/2 ml-2 h-2 w-2 rounded-full bg-(--brand)"
                style={{ boxShadow: '0 0 0 2px var(--background)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
