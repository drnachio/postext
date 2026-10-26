// The click handler of a page slot and the scroll that brings a referenced
// resource into view (#1276: split out of interaction.ts).
import type { MutableRefObject, Dispatch } from 'react';
import type { VDTDocument, Resource } from 'postext';
import type { SandboxAction } from '../../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { PanelId } from '../../../../types/index.js';
import type { ResourceLocation } from '../geometry.js';
import type { SandboxLabels } from '../../../../types/labels.js';
import { slotComicSurface } from '../../../comics/comicEditing.js';
import { attachPageInteraction } from '../interaction.js';
import type { PageNavigator } from './types.js';

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
 * navigate to the referenced resource, clicks on a row of the contents to
 * the page it lists, instead of focusing the editor.
 */
export function attachSlotClickHandler(
  slot: HTMLDivElement,
  pageIndex: number,
  pageWidthPx: number,
  pageHeightPx: number,
  docRef: MutableRefObject<VDTDocument | null>,
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>,
  activePanelRef: MutableRefObject<PanelId | null>,
  /** The composed book `docRef` was built from: document offsets map back
   *  to (chapter, offset) through it. */
  sourceRef: MutableRefObject<ComposedBook | null>,
  navigateRef?: MutableRefObject<PageNavigator | null>,
  /** The resource set the document was built from: a click on an image a
   *  design slot draws (a cover picture, a logo) opens that resource in the
   *  Resources panel, where its file can be replaced. */
  resourcesRef?: MutableRefObject<Resource[] | null>,
  /** The book a given page's offsets belong to, when the document is the
   *  whole book stitched from per-chapter layouts (each page's offsets are
   *  its chapter's). Null: every page maps through `sourceRef`. */
  pageSourceRef?: MutableRefObject<((pageIndex: number) => ComposedBook | null) | null>,
  /** The interface strings: with them, a comic page's splitters and panels
   *  can be edited on the page (#568). */
  labelsRef?: MutableRefObject<SandboxLabels>,
): void {
  slot.style.cursor = 'text';
  attachPageInteraction(slot, {
    // Read the current slot size instead of the creation-time displayWidth/Height:
    // applyDisplaySize mutates the canvas/overlay CSS dims on resize, so a cached
    // scale factor goes stale and clicks land on the wrong offset.
    locate: (ev) => {
      const rect = slot.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        pageIndex,
        x: (ev.clientX - rect.left) * (pageWidthPx / rect.width),
        y: (ev.clientY - rect.top) * (pageHeightPx / rect.height),
      };
    },
    docRef,
    dispatchRef,
    activePanelRef,
    sourceRef,
    navigateRef,
    resourcesRef,
    pageSourceRef,
    showLocation: (doc, loc) => scrollToResourceLocation(slot, doc, loc),
    setCursor: (cursor) => {
      slot.style.cursor = cursor;
    },
    ...(labelsRef ? { labelsRef, comicSurface: slotComicSurface(slot, pageIndex, pageWidthPx, pageHeightPx) } : {}),
  });
}
