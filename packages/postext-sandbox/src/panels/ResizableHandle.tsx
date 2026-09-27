'use client';

import { useState } from 'react';
import { useSandboxLabels } from '../context/SandboxContext';

interface ResizableHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** The size of the pane before the handle, as a percentage (the sidebar's
   *  width of the window; the library's height of the Books panel), for
   *  assistive tech and keyboard resizing. */
  value: number;
  min?: number;
  max?: number;
  /** Keyboard resize: the arrow keys along the split by 2 %, Shift by 10 %,
   *  Home/End to the limits. */
  onValueChange: (value: number) => void;
  /** `vertical` (default): a column splitter between side-by-side panes,
   *  dragged left and right. `horizontal`: a row splitter between stacked
   *  panes, dragged up and down. */
  orientation?: 'vertical' | 'horizontal';
  /** Accessible name; the sidebar's by default. */
  label?: string;
}

/** A splitter between two panes: drag it, or focus it and use the arrow
 *  keys (a focusable `separator` with a value, as the WAI-ARIA window
 *  splitter pattern describes). */
export function ResizableHandle({ onPointerDown, value, min = 15, max = 60, onValueChange, orientation = 'vertical', label }: ResizableHandleProps) {
  const [active, setActive] = useState(false);
  const labels = useSandboxLabels();
  const vertical = orientation === 'vertical';
  const cursor = vertical ? 'col-resize' : 'row-resize';

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
        const back = vertical ? 'ArrowLeft' : 'ArrowUp';
        const forward = vertical ? 'ArrowRight' : 'ArrowDown';
        let next: number | null = null;
        if (e.key === back) next = value - step;
        else if (e.key === forward) next = value + step;
        else if (e.key === 'Home') next = min;
        else if (e.key === 'End') next = max;
        if (next === null) return;
        e.preventDefault();
        onValueChange(Math.min(max, Math.max(min, next)));
      }}
      role="separator"
      aria-orientation={orientation}
      aria-label={label ?? labels.sidebarResize}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className="focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)"
      style={{
        position: 'relative',
        ...(vertical ? { width: '1px', height: '100%' } : { height: '1px', width: '100%' }),
        flexShrink: 0,
        cursor,
        backgroundColor: active ? 'var(--brand)' : 'var(--rule)',
        transition: 'background-color 150ms',
        touchAction: 'none',
      }}
    >
      {/* Invisible wider hit area */}
      <div
        style={{
          position: 'absolute',
          ...(vertical
            ? { top: 0, bottom: 0, left: '-4px', right: '-4px' }
            : { left: 0, right: 0, top: '-4px', bottom: '-4px' }),
          cursor,
          zIndex: 1,
        }}
      />
    </div>
  );
}
