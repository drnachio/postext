'use client';

import { useCallback, useRef } from 'react';

interface UseResizableOptions {
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function useResizable({ minWidth, maxWidth, onResize, onDragStart, onDragEnd }: UseResizableOptions) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;

      const sidebar = target.previousElementSibling as HTMLElement | null;
      startWidthRef.current = sidebar?.offsetWidth ?? 320;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      onDragStart?.();

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
        onResize(newWidth);
      };

      const onPointerUp = () => {
        target.releasePointerCapture(e.pointerId);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onDragEnd?.();
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [minWidth, maxWidth, onResize, onDragStart, onDragEnd],
  );

  return { onPointerDown };
}
