'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSandbox } from '../context/SandboxContext';
import type { ViewportTab } from '../types';

const TABS: ViewportTab[] = ['canvas', 'html', 'pdf'];

export function ViewportTabs() {
  const { state, dispatch } = useSandbox();
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
  }, [state.activeViewport, updateIndicator]);

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
      aria-label="Preview mode"
    >
      {TABS.map((tab) => {
        const isActive = state.activeViewport === tab;
        const label = state.labels[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => dispatch({ type: 'SET_VIEWPORT', payload: tab })}
            className="cursor-pointer px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-1 focus-visible:outline-offset-[-1px]"
            style={{
              color: isActive ? 'var(--foreground)' : 'var(--slate)',
              borderLeft: '1px solid var(--rule)',
              outlineColor: 'var(--gilt-hover)',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--foreground)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--slate)';
            }}
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
