'use client';

import { FileCode, Settings2, FolderOpen, AlertTriangle, Type } from 'lucide-react';
import { useMemo, useRef, useLayoutEffect, useEffect, useCallback, useState, type ReactNode } from 'react';
import { useSandboxDispatch, useSandboxDocRef, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import type { PanelId } from '../types';
import { Tooltip } from '../panels/Tooltip';
import { computeWarnings } from '../warnings/compute';

interface ActivityBarProps {
  themeToggle?: ReactNode;
  languageSwitcher?: ReactNode;
  homeUrl?: string;
  homeLink?: ReactNode;
}

const PANEL_ICONS: { id: PanelId; Icon: typeof FileCode; labelKey: 'markdownEditor' | 'configuration' | 'resources' | 'warnings' | 'fonts' }[] = [
  { id: 'markdown', Icon: FileCode, labelKey: 'markdownEditor' },
  { id: 'resources', Icon: FolderOpen, labelKey: 'resources' },
  { id: 'fonts', Icon: Type, labelKey: 'fonts' },
  { id: 'config', Icon: Settings2, labelKey: 'configuration' },
  { id: 'warnings', Icon: AlertTriangle, labelKey: 'warnings' },
];

function PanelNav() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const markdown = useSandboxSelector((s) => s.markdown);
  const config = useSandboxSelector((s) => s.config);
  const docVersion = useSandboxSelector((s) => s.docVersion);
  const docRef = useSandboxDocRef();
  const navRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<Map<PanelId, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const hasAnimated = useRef(false);

  // Recomputed whenever markdown, config, or the last-built VDT change.
  // Also exposed via the Warnings panel — parseMarkdown is memoized, so the
  // duplicate call is cheap.
  const warningCount = useMemo(
    () => computeWarnings({ markdown, config, doc: docRef.current }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markdown, config, docVersion],
  );

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

  return (
    <nav ref={navRef} className="relative flex flex-col items-center gap-2" aria-label="Panels">
      {indicator && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -9,
            top: indicator.top,
            height: indicator.height,
            width: 3,
            borderRadius: 0,
            backgroundColor: 'var(--gilt)',
            transition: hasAnimated.current ? 'top 200ms ease-in-out, height 200ms ease-in-out, opacity 150ms ease-in-out' : 'none',
          }}
        />
      )}
      {PANEL_ICONS.map(({ id, Icon, labelKey }) => {
        const isActive = activePanel === id;
        const label = labels[labelKey];
        const showBadge = id === 'warnings' && warningCount > 0;
        const badgeText = warningCount > 99 ? '99+' : String(warningCount);
        return (
          <Tooltip key={id} content={label} side="right">
            <button
              ref={(el) => { if (el) buttonRefs.current.set(id, el); }}
              type="button"
              onClick={() => dispatch({ type: 'TOGGLE_PANEL', payload: id })}
              aria-label={showBadge ? `${label} (${warningCount})` : label}
              aria-pressed={isActive}
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
              style={{
                color: isActive ? 'var(--gilt)' : 'var(--slate)',
                outlineColor: 'var(--gilt-hover)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--foreground)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--slate)';
              }}
            >
              <Icon size={22} aria-hidden="true" />
              {showBadge && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 8,
                    backgroundColor: 'var(--gilt)',
                    color: 'var(--background)',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '16px',
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }}
                >
                  {badgeText}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function ActivityBar({ themeToggle, languageSwitcher, homeUrl, homeLink }: ActivityBarProps) {
  return (
    <div
      className="flex h-full w-14 flex-col items-center border-r px-2 py-3"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      role="toolbar"
      aria-label="Activity bar"
      aria-orientation="vertical"
    >
      {/* Home logo */}
      {homeLink ? (
        <div className="mt-1 mb-2 flex h-10 w-10 items-center justify-center">
          {homeLink}
        </div>
      ) : homeUrl ? (
        <Tooltip content="Postext" side="right">
          <a
            href={homeUrl}
            className="mt-1 mb-2 flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
            style={{ color: 'var(--gilt)', outlineColor: 'var(--accent-blue)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span className="text-2xl font-black leading-none" style={{ fontFamily: 'var(--font-logo, var(--font-cormorant, "Cormorant Garamond", Georgia, serif))' }}>P</span>
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
          <div className="flex h-10 w-10 items-center justify-center">
            {themeToggle}
          </div>
        )}

        {/* Language switcher slot */}
        {languageSwitcher && (
          <div className="flex h-10 w-10 items-center justify-center">
            {languageSwitcher}
          </div>
        )}
      </div>
    </div>
  );
}
