'use client';

import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { BookOpen, FileText } from 'lucide-react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import type { LayoutScope } from '../book/types';
import type { ViewportTab } from '../types';
import { SegmentedControl, cn } from '../ui';

const TABS: ViewportTab[] = ['canvas', 'html', 'pdf'];

/** The bar above the preview: the scope selector of the tab shown at the
 *  left (each tab lays out the active chapter or the whole book — the
 *  canvas and the HTML preview share one choice, kept with the book; the
 *  PDF has its own; only while the book has more than one chapter) and the
 *  Canvas / HTML / PDF tabs at the right. The phone layout has no activity
 *  bar at the side, so it passes the logo (`leading`) and the theme and
 *  language controls (`trailing`) to this bar, and the scope choice shows
 *  as icons. */
export function ViewportTabs({ compact = false, leading, trailing }: { compact?: boolean; leading?: ReactNode; trailing?: ReactNode } = {}) {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const activeViewport = useSandboxSelector((s) => s.activeViewport);
  const pdfScope = useSandboxSelector((s) => s.pdfScope);
  const canvasScope = useSandboxSelector((s) => s.canvasScope);
  const multiChapter = useSandboxSelector((s) => s.chapters.length > 1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, []);

  useEffect(() => {
    updateIndicator();
  }, [activeViewport, updateIndicator]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateIndicator]);

  return (
    <div
      className={cn('flex shrink-0 items-stretch justify-between', compact ? 'h-11' : 'h-9')}
      style={{ borderBottom: '1px solid var(--rule)', backgroundColor: 'var(--background)' }}
    >
      {leading && <div className="flex shrink-0 items-center border-r px-1" style={{ borderColor: 'var(--rule)' }}>{leading}</div>}
      <div className={cn('flex min-w-0 flex-1 items-center', compact ? 'px-1.5' : 'px-3')}>
        {multiChapter && (
          <SegmentedControl<LayoutScope>
            value={activeViewport === 'pdf' ? pdfScope : canvasScope}
            onValueChange={(next) => dispatch({ type: activeViewport === 'pdf' ? 'SET_PDF_SCOPE' : 'SET_CANVAS_SCOPE', payload: next })}
            ariaLabel={activeViewport === 'pdf' ? labels.pdfScope : labels.canvasScope}
            size="sm"
            className={compact ? 'h-7' : undefined}
            options={compact
              ? [
                  { value: 'chapter', label: <FileText size={13} aria-hidden="true" />, title: labels.pdfScopeChapter },
                  { value: 'book', label: <BookOpen size={13} aria-hidden="true" />, title: labels.pdfScopeBook },
                ]
              : [
                  { value: 'chapter', label: labels.pdfScopeChapter },
                  { value: 'book', label: labels.pdfScopeBook },
                ]}
          />
        )}
      </div>
      <div
        ref={containerRef}
        className="relative flex shrink-0 items-stretch"
        role="tablist"
        aria-label={labels.previewMode}
        onKeyDown={(e) => {
          const idx = TABS.indexOf(activeViewport);
          let next: number | null = null;
          if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
          else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = TABS.length - 1;
          if (next === null) return;
          e.preventDefault();
          dispatch({ type: 'SET_VIEWPORT', payload: TABS[next]! });
          containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeViewport === tab;
          const label = labels[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => dispatch({ type: 'SET_VIEWPORT', payload: tab })}
              className={cn(
                'flex cursor-pointer items-center text-[0.68rem]',
                compact ? 'px-2' : 'px-3',
                ' font-medium tracking-[0.01em] transition-colors focus-visible:outline-1 focus-visible:-outline-offset-1 outline-(--brand-hover)',
                isActive ? 'text-(--foreground)' : 'text-(--slate) hover:text-(--foreground)',
              )}
              style={{ borderLeft: '1px solid var(--rule)' }}
            >
              {label}
            </button>
          );
        })}
        {/* Animated bottom indicator */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -1,
            left: indicator.left,
            width: indicator.width,
            height: 2,
            backgroundColor: 'var(--brand)',
            transition: 'left 200ms ease, width 200ms ease',
          }}
        />
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-0.5 border-l px-0.5" style={{ borderColor: 'var(--rule)' }}>{trailing}</div>}
    </div>
  );
}
