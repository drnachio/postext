import type { Dispatch, MutableRefObject } from 'react';
import type { VDTDocument } from 'postext';
import type { SandboxAction } from '../../context/SandboxContext';
import type { PanelId } from '../../types';
import {
  findResourceLocation,
  pixelToSourceOffset,
  refResourceIdAtPixel,
  type ResourceLocation,
} from './geometry';

const REF_SCROLL_PADDING_PX = 24;

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Scroll the preview so the referenced resource lands near the viewport top.
 * Works for both previews: canvas slots carry `data-page-index`, HTML pages
 * carry `data-page`. Vertical scroll targets the resource's y inside the page;
 * horizontal scroll only kicks in when the page itself is fully off-screen
 * (HTML multi-column mode), so a zoomed canvas view never jumps sideways.
 */
function scrollToResourceLocation(
  slot: HTMLElement,
  doc: VDTDocument,
  loc: ResourceLocation,
): void {
  const container = findScrollContainer(slot);
  if (!container) return;
  const pageEl = container.querySelector<HTMLElement>(
    `[data-page-index="${loc.pageIndex}"], .pt-page[data-page="${loc.pageIndex}"]`,
  );
  const page = doc.pages[loc.pageIndex];
  if (!pageEl || !page) return;
  const rect = pageEl.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  if (rect.height === 0 || page.height === 0) return;
  // Scroll only along axes the container exposes to the user: `overflow:
  // hidden` still honours programmatic scrolls, so without this guard the
  // HTML multi-column viewer (overflow-y hidden) would creep vertically.
  const style = getComputedStyle(container);
  const canScrollY = /(auto|scroll)/.test(style.overflowY);
  const canScrollX = /(auto|scroll)/.test(style.overflowX);
  const scaleY = rect.height / page.height;
  const top = canScrollY
    ? rect.top + loc.y * scaleY - cRect.top - REF_SCROLL_PADDING_PX
    : 0;
  const offScreenX = rect.right < cRect.left || rect.left > cRect.right;
  const left = canScrollX && offScreenX
    ? rect.left - cRect.left - REF_SCROLL_PADDING_PX
    : 0;
  container.scrollBy({ top, left, behavior: 'smooth' });
}

/**
 * Wire a click listener on a page slot. Background clicks (outside any block)
 * and active text-selection drags are ignored. Clicks on `:ref` segments
 * navigate to the referenced resource instead of focusing the editor.
 */
export function attachSlotClickHandler(
  slot: HTMLDivElement,
  pageIndex: number,
  pageWidthPx: number,
  pageHeightPx: number,
  docRef: MutableRefObject<VDTDocument | null>,
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>,
  activePanelRef: MutableRefObject<PanelId | null>,
): void {
  slot.style.cursor = 'text';

  // Read the current slot size instead of the creation-time displayWidth/Height:
  // applyDisplaySize mutates the canvas/overlay CSS dims on resize, so a cached
  // scale factor goes stale and clicks land on the wrong offset.
  const resolvePagePoint = (ev: MouseEvent): { x: number; y: number } | null => {
    const rect = slot.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: (ev.clientX - rect.left) * (pageWidthPx / rect.width),
      y: (ev.clientY - rect.top) * (pageHeightPx / rect.height),
    };
  };

  const resolveOffset = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    return pixelToSourceOffset(doc, pageIndex, pt.x, pt.y);
  };

  const resolveRefId = (ev: MouseEvent): string | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    return refResourceIdAtPixel(doc, pageIndex, pt.x, pt.y);
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
    if (dragPointerId === null) {
      // Hover feedback: refs read as links.
      slot.style.cursor = resolveRefId(ev) !== null ? 'pointer' : 'text';
      return;
    }
    if (ev.pointerId !== dragPointerId) return;
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
    // A click on a `:ref` segment navigates to the referenced resource. The
    // preventDefault also stops the HTML preview's native <a href="#…"> from
    // rewriting the app URL hash.
    const refId = resolveRefId(ev);
    if (refId !== null) {
      ev.preventDefault();
      const doc = docRef.current;
      const loc = doc ? findResourceLocation(doc, refId) : null;
      if (doc && loc) scrollToResourceLocation(slot, doc, loc);
      return;
    }
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
