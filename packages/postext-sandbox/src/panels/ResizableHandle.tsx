'use client';

import { useState } from 'react';
import { useSandboxLabels } from '../context/SandboxContext';

interface ResizableHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Sidebar width as a percentage of the window, for assistive tech and
   *  keyboard resizing. */
  value: number;
  min?: number;
  max?: number;
  /** Keyboard resize: ←/→ by 2 %, Shift by 10 %, Home/End to the limits. */
  onValueChange: (value: number) => void;
}

/** The splitter between the sidebar and the viewport: drag it, or focus it
 *  and use the arrow keys (a focusable `separator` with a value, as the
 *  WAI-ARIA window splitter pattern describes). */
export function ResizableHandle({ onPointerDown, value, min = 15, max = 60, onValueChange }: ResizableHandleProps) {
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
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2;
        let next: number | null = null;
        if (e.key === 'ArrowLeft') next = value - step;
        else if (e.key === 'ArrowRight') next = value + step;
        else if (e.key === 'Home') next = min;
        else if (e.key === 'End') next = max;
        if (next === null) return;
        e.preventDefault();
        onValueChange(Math.min(max, Math.max(min, next)));
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label={labels.sidebarResize}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className="focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)"
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
