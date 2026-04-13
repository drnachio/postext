'use client';

import { useState } from 'react';

interface ResizableHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function ResizableHandle({ onPointerDown }: ResizableHandleProps) {
  const [active, setActive] = useState(false);

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
      aria-label="Resize sidebar"
      tabIndex={0}
      style={{
        position: 'relative',
        width: '1px',
        flexShrink: 0,
        cursor: 'col-resize',
        height: '100%',
        backgroundColor: active
          ? 'var(--gilt, #E0A816)'
          : 'var(--rule, #27272A)',
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
