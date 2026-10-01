'use client';

import { useState } from 'react';
import { useSandboxLabels } from '../context/SandboxContext';
import { cn } from '../ui/cn';

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

/** The splitter between the sidebar and the viewport, drawn over the
 *  sidebar's right edge: a thin line that can be dragged anywhere along
 *  its height, and a 44×44 grip at mid-height (WCAG 2.5.5) that also takes
 *  the keyboard — a focusable `separator` with a value, as the WAI-ARIA
 *  window splitter pattern describes. The grip reaches into the preview
 *  rather than the panel, whose rows keep their buttons at the right. */
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
      className="group absolute top-0 bottom-0 z-20"
      style={{ right: -4, width: 8, cursor: 'col-resize', touchAction: 'none' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 bottom-0"
        style={{
          left: 3,
          width: 1,
          backgroundColor: active ? 'var(--brand)' : 'var(--rule)',
          transition: 'background-color 150ms',
        }}
      />
      <div
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
        className="peer absolute flex h-11 w-11 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)"
        style={{ top: 'calc(50% - 22px)', left: 0, cursor: 'col-resize' }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'ml-px block h-8 w-[7px] rounded-full border transition-colors',
            active ? 'border-(--brand) bg-(--brand)' : 'border-(--slate) bg-(--surface)',
          )}
        />
      </div>
    </div>
  );
}
