'use client';

import { useSandbox } from '../context/SandboxContext';
import type { ViewportTab } from '../types';

const TABS: ViewportTab[] = ['canvas', 'html', 'pdf'];

export function ViewportTabs() {
  const { state, dispatch } = useSandbox();

  return (
    <div
      className="flex items-center justify-end border-b"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
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
            className="relative px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
            style={{
              color: isActive ? 'var(--foreground)' : 'var(--slate)',
              backgroundColor: isActive ? 'var(--surface)' : 'transparent',
              borderLeft: '1px solid var(--rule)',
              borderTop: isActive ? '2px solid var(--gilt)' : '2px solid transparent',
              borderBottom: isActive ? '1px solid var(--surface)' : '1px solid var(--rule)',
              marginBottom: '-1px',
              outlineColor: 'var(--accent-blue)',
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
    </div>
  );
}
