'use client';

import type { ReactNode } from 'react';
import { useSandbox } from '../context/SandboxContext';

interface SidebarPanelProps {
  children: ReactNode;
}

export function SidebarPanel({ children }: SidebarPanelProps) {
  const { state } = useSandbox();
  const isOpen = state.activePanel !== null;
  const widthValue = isOpen ? `${state.sidebarPercent}%` : '0%';

  return (
    <div
      className="h-full shrink-0 overflow-hidden"
      style={{
        width: widthValue,
        backgroundColor: 'var(--background)',
        transition: state.sidebarDragging ? 'none' : 'width 200ms ease-in-out',
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
