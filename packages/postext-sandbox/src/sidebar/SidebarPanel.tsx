'use client';

import type { ReactNode } from 'react';
import { useSandboxSelector } from '../context/SandboxContext';

interface SidebarPanelProps {
  /** Name of the open panel: the region is a landmark only while open. */
  label?: string;
  /** The splitter, drawn over the panel's right edge. */
  handle?: ReactNode;
  children: ReactNode;
}

export function SidebarPanel({ label, handle, children }: SidebarPanelProps) {
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const sidebarPercent = useSandboxSelector((s) => s.sidebarPercent);
  const sidebarDragging = useSandboxSelector((s) => s.sidebarDragging);
  const isOpen = activePanel !== null;
  const widthValue = isOpen ? `${sidebarPercent}%` : '0%';

  return (
    <section
      data-postext-sidebar=""
      aria-label={isOpen ? label : undefined}
      className="relative z-10 h-full shrink-0"
      style={{
        width: widthValue,
        // Settings rows need room for a label beside its control.
        minWidth: isOpen ? 'min(320px, 45vw)' : 0,
        backgroundColor: 'var(--background)',
        transition: sidebarDragging ? 'none' : 'width 200ms ease-in-out',
      }}
    >
      <div style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
      {handle}
    </section>
  );
}
