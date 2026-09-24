'use client';

import { useState } from 'react';
import { useSandboxLabels } from '../context/SandboxContext';

interface ResizableHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function ResizableHandle({ onPointerDown }: ResizableHandleProps) {
  const [active, setActive] = useState(false);
  const labels = useSandboxLabels();

  return (
    <div
      onPointerDown={(e) => {
        setActive(true);
        const onUp = () => {
          setActive(false);
          document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointerup', onUp);
        onPointerDown(e);
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      role="separator"
      aria-orientation="vertical"
      aria-label={labels.sidebarResize}
      tabIndex={0}
      style={{
        position: 'relative',
        width: '1px',
        flexShrink: 0,
        cursor: 'col-resize',
        height: '100%',
        backgroundColor: active ? 'var(--brand)' : 'var(--rule)',
        transition: 'background-color 150ms',
      }}
    >
      {/* Invisible wider hit area */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '-4px',
          right: '-4px',
          cursor: 'col-resize',
        }}
      />
    </div>
  );
}
