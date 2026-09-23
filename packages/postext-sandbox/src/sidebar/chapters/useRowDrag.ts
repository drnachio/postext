'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** A row being dragged: which one, where it came from and the insertion
 *  slot (0…count) under the pointer. */
export interface RowDrag {
  id: string;
  from: number;
  slot: number;
}

/** Distance from the scroll container's edge (px) within which dragging
 *  scrolls it, and the fastest scroll step per frame (at the very edge). */
const SCROLL_EDGE = 28;
const SCROLL_MAX_STEP = 14;

/** The nearest ancestor that can actually scroll — a capped list that is
 *  not full yet is skipped, so the drag still scrolls the panel around it. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

export interface RowDragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
}

/**
 * Reordering the rows of a list by dragging a handle. The list element
 * (`listRef`, positioned) holds one child per row; a drag starts on a
 * handle's pointer-down (the handle captures the pointer, so the drag
 * survives leaving it), the slot follows the pointer over the rows' middles,
 * the list's scroll container scrolls while the pointer sits near its
 * edge, and pointer-up calls `onMove(id, index)` when the row lands
 * elsewhere. Escape cancels. The handle also takes arrow keys (one row up
 * or down), so the order is reachable without a pointer.
 */
export function useRowDrag(count: number, onMove: (id: string, to: number) => void) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const dragRef = useRef<RowDrag | null>(null);
  const pointerYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const rows = (): HTMLElement[] => Array.from(listRef.current?.children ?? []) as HTMLElement[];

  const slotAt = (y: number): number => {
    const items = rows();
    for (let i = 0; i < items.length; i++) {
      const r = items[i]!.getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return items.length;
  };

  const setSlot = (slot: number) => {
    const d = dragRef.current;
    if (!d || d.slot === slot) return;
    dragRef.current = { ...d, slot };
    setDrag(dragRef.current);
  };

  const stopAutoScroll = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const autoScroll = () => {
    rafRef.current = null;
    const scroller = scrollParentOf(listRef.current);
    if (!scroller || !dragRef.current) return;
    const rect = scroller.getBoundingClientRect();
    const y = pointerYRef.current;
    let step = 0;
    if (y < rect.top + SCROLL_EDGE) step = -Math.ceil(((rect.top + SCROLL_EDGE - y) / SCROLL_EDGE) * SCROLL_MAX_STEP);
    else if (y > rect.bottom - SCROLL_EDGE) step = Math.ceil(((y - (rect.bottom - SCROLL_EDGE)) / SCROLL_EDGE) * SCROLL_MAX_STEP);
    if (step === 0) return;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    if (scroller.scrollTop === before) return; // at the end
    setSlot(slotAt(y));
    rafRef.current = requestAnimationFrame(autoScroll);
  };

  const finish = (commit: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    stopAutoScroll();
    dragRef.current = null;
    setDrag(null);
    if (!commit) return;
    const to = d.slot > d.from ? d.slot - 1 : d.slot;
    if (to !== d.from) onMoveRef.current(d.id, to);
  };

  // Escape drops the row back where it was.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);
  useEffect(() => stopAutoScroll, []);

  const handleProps = (id: string, index: number): RowDragHandleProps => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerYRef.current = e.clientY;
      dragRef.current = { id, from: index, slot: index };
      setDrag(dragRef.current);
    },
    onPointerMove: (e) => {
      if (!dragRef.current) return;
      pointerYRef.current = e.clientY;
      setSlot(slotAt(e.clientY));
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(autoScroll);
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        onMoveRef.current(id, index - 1);
      } else if (e.key === 'ArrowDown' && index < count - 1) {
        e.preventDefault();
        onMoveRef.current(id, index + 1);
      }
    },
  });

  // Where the drop line goes, in the list's own coordinates; null while
  // nothing is dragged or the slot would leave the row where it is.
  let indicatorTop: number | null = null;
  if (drag && drag.slot !== drag.from && drag.slot !== drag.from + 1) {
    const items = rows();
    const at = items[drag.slot];
    const last = items[items.length - 1];
    indicatorTop = at ? at.offsetTop : last ? last.offsetTop + last.offsetHeight : 0;
  }

  return { listRef, drag, indicatorTop, handleProps };
}
