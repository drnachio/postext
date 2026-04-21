'use client';

import type { ReactNode } from 'react';
import { useSandboxSelector } from '../context/SandboxContext';

interface SidebarPanelProps {
  children: ReactNode;
}

export function SidebarPanel({ children }: SidebarPanelProps) {
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const sidebarPercent = useSandboxSelector((s) => s.sidebarPercent);
  const sidebarDragging = useSandboxSelector((s) => s.sidebarDragging);
  const isOpen = activePanel !== null;
  const widthValue = isOpen ? `${sidebarPercent}%` : '0%';

  return (
    <div
      className="h-full shrink-0 overflow-hidden"
      style={{
        width: widthValue,
        backgroundColor: 'var(--background)',
        transition: sidebarDragging ? 'none' : 'width 200ms ease-in-out',
      }}
    >
      <div style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
