'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import type { ViewportTab } from '../types';
import { cn } from '../ui';

const TABS: ViewportTab[] = ['canvas', 'html', 'pdf'];

export function ViewportTabs() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const activeViewport = useSandboxSelector((s) => s.activeViewport);
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
      ref={containerRef}
      className="relative flex items-center justify-end"
      style={{ borderBottom: '1px solid var(--rule)', backgroundColor: 'var(--background)' }}
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
              'cursor-pointer px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-1 focus-visible:-outline-offset-1 outline-(--gilt-hover)',
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
          backgroundColor: 'var(--gilt)',
          transition: 'left 200ms ease, width 200ms ease',
        }}
      />
    </div>
  );
}
