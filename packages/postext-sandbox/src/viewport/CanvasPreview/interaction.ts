import type { Dispatch, MutableRefObject } from 'react';
import type { VDTDocument } from 'postext';
import type { SandboxAction } from '../../context/SandboxContext';
import type { PanelId } from '../../types';
import { pixelToSourceOffset } from './geometry';

/**
 * Wire a click listener on a page slot. Background clicks (outside any block)
 * and active text-selection drags are ignored.
 */
export function attachSlotClickHandler(
  slot: HTMLDivElement,
  pageIndex: number,
  displayWidth: number,
  displayHeight: number,
  pageWidthPx: number,
  pageHeightPx: number,
  docRef: MutableRefObject<VDTDocument | null>,
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>,
  activePanelRef: MutableRefObject<PanelId | null>,
): void {
  slot.style.cursor = 'text';

  const resolveOffset = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const rect = slot.getBoundingClientRect();
    const scaleX = pageWidthPx / displayWidth;
    const scaleY = pageHeightPx / displayHeight;
    const xPage = (ev.clientX - rect.left) * scaleX;
    const yPage = (ev.clientY - rect.top) * scaleY;
    return pixelToSourceOffset(doc, pageIndex, xPage, yPage);
  };

  const focusEditor = (anchor: number, head: number, selectWord: boolean): void => {
    const dispatch = dispatchRef.current;
    if (activePanelRef.current !== 'markdown') {
      dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    }
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { anchor, head, selectWord } });
  };

  const DRAG_THRESHOLD_PX = 3;
  let dragAnchorOffset: number | null = null;
  let dragAnchorClient: { x: number; y: number } | null = null;
  let dragPointerId: number | null = null;
  let dragging = false;
  let lastHead: number | null = null;
  let suppressNextClick = false;

  slot.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const offset = resolveOffset(ev);
    if (offset === null) return;
    dragAnchorOffset = offset;
    dragAnchorClient = { x: ev.clientX, y: ev.clientY };
    dragPointerId = ev.pointerId;
    dragging = false;
    lastHead = null;
    try { slot.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  });

  slot.addEventListener('pointermove', (ev) => {
    if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
    if (dragAnchorOffset === null || !dragAnchorClient) return;
    if (!dragging) {
      const dx = ev.clientX - dragAnchorClient.x;
      const dy = ev.clientY - dragAnchorClient.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      dragging = true;
    }
    ev.preventDefault();
    const head = resolveOffset(ev);
    if (head === null) return;
    if (head === lastHead) return;
    lastHead = head;
    focusEditor(dragAnchorOffset, head, false);
  });

  const endDrag = (ev: PointerEvent): void => {
    if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
    const wasDragging = dragging;
    try { slot.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    dragPointerId = null;
    dragAnchorOffset = null;
    dragAnchorClient = null;
    dragging = false;
    lastHead = null;
    if (wasDragging) {
      suppressNextClick = true;
      ev.preventDefault();
    }
  };

  slot.addEventListener('pointerup', endDrag);
  slot.addEventListener('pointercancel', endDrag);

  slot.addEventListener('click', (ev) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.detail === 0) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    const offset = resolveOffset(ev);
    if (offset === null) return;
    focusEditor(offset, offset, false);
  });

  slot.addEventListener('dblclick', (ev) => {
    const offset = resolveOffset(ev);
    if (offset === null) return;
    ev.preventDefault();
    focusEditor(offset, offset, true);
  });
}
