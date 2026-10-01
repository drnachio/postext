import type { Dispatch, MutableRefObject } from 'react';
import type { Resource, VDTDocument } from 'postext';
import type { SandboxAction } from '../../context/SandboxContext';
import type { PanelId } from '../../types';
import type { ComposedBook } from '../../book/types';
import { createPageCanvas, createOverlaySvg } from './dom';
import { attachSlotClickHandler, type PageNavigator } from './interaction';
import {
  PAGE_GAP,
  PAGE_PADDING,
  type ViewMode,
  groupPagesIntoRows,
} from './layoutUtils';

export interface BuildPagesDomResult {
  innerDiv: HTMLDivElement;
  allSlots: HTMLDivElement[];
}

export function buildPagesDom(
  doc: VDTDocument,
  viewMode: ViewMode,
  displayWidth: number,
  displayHeight: number,
  pageWidthPx: number,
  pageHeightPx: number,
  canvasMap: Map<number, HTMLCanvasElement>,
  overlayMap: Map<number, SVGSVGElement>,
  docRef: MutableRefObject<VDTDocument | null>,
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>,
  activePanelRef: MutableRefObject<PanelId | null>,
  sourceRef: MutableRefObject<ComposedBook | null>,
  navigateRef?: MutableRefObject<PageNavigator | null>,
  resourcesRef?: MutableRefObject<Resource[] | null>,
  pageSourceRef?: MutableRefObject<((pageIndex: number) => ComposedBook | null) | null>,
  /** Accessible name of a page's canvas (WCAG 1.1.1): a bitmap holds no
   *  text, so the name says which page it is and where its text is. */
  pageLabel?: (pageIndex: number, pageCount: number) => string,
): BuildPagesDomResult {
  const isSpread = viewMode === 'spread';
  const pagesPerRow = isSpread ? 2 : 1;
  const innerWidth =
    displayWidth * pagesPerRow + PAGE_GAP * (pagesPerRow - 1) + PAGE_PADDING * 2;
  const innerDiv = document.createElement('div');
  innerDiv.style.width = `${innerWidth}px`;
  innerDiv.style.margin = '0 auto';

  // Page 0 sits `pageIndexOffset` physical pages into the book: an even
  // offset makes it a recto (right-hand page).
  const pageIndexOffset = doc.pageIndexOffset ?? 0;
  const isRecto = (pageIndex: number) => (pageIndexOffset + pageIndex) % 2 === 0;
  const rows = groupPagesIntoRows(doc.pages.length, viewMode, isRecto(0));
  const allSlots: HTMLDivElement[] = [];

  const buildSlot = (pageIndex: number) => {
    const slot = document.createElement('div');
    slot.style.flexShrink = '0';
    slot.style.position = 'relative';
    slot.dataset.pageIndex = String(pageIndex);

    const canvas = createPageCanvas(displayWidth, displayHeight);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', pageLabel ? pageLabel(pageIndex, doc.pages.length) : `${pageIndex + 1} / ${doc.pages.length}`);
    slot.appendChild(canvas);
    canvasMap.set(pageIndex, canvas);
    const overlay = createOverlaySvg(displayWidth, displayHeight, pageWidthPx, pageHeightPx);
    overlay.setAttribute('aria-hidden', 'true');
    slot.appendChild(overlay);
    overlayMap.set(pageIndex, overlay);
    attachSlotClickHandler(slot, pageIndex, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef, sourceRef, navigateRef, resourcesRef, pageSourceRef);
    allSlots.push(slot);
    return slot;
  };

  const buildSpacer = () => {
    const spacer = document.createElement('div');
    spacer.style.width = `${displayWidth}px`;
    spacer.style.flexShrink = '0';
    spacer.dataset.spreadSpacer = '1';
    return spacer;
  };

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const rowDiv = document.createElement('div');
    rowDiv.style.display = 'flex';
    rowDiv.style.justifyContent = 'center';
    rowDiv.style.alignItems = 'flex-start';
    const paddingTop = rowIdx === 0 ? PAGE_PADDING : PAGE_GAP / 2;
    const paddingBottom = rowIdx === rows.length - 1 ? PAGE_PADDING : PAGE_GAP / 2;
    rowDiv.style.padding = `${paddingTop}px ${PAGE_PADDING}px ${paddingBottom}px`;
    rowDiv.style.gap = `${PAGE_GAP}px`;
    rowDiv.style.boxSizing = 'border-box';
    rowDiv.style.minHeight = `${displayHeight + paddingTop + paddingBottom}px`;
    rowDiv.dataset.pageRow = '1';
    // A right-bound book reads its spreads right to left: [3 | 2], the
    // first page alone on the left of the spine.
    if (isSpread && doc.binding === 'right') rowDiv.style.flexDirection = 'row-reverse';

    if (isSpread && row.length === 1) {
      // A lone page keeps its side of the spread: a recto on the right (on
      // the left in a right-bound book, the row being reversed).
      const pageIndex = row[0]!;
      const recto = isRecto(pageIndex);
      if (recto) rowDiv.appendChild(buildSpacer());
      rowDiv.appendChild(buildSlot(pageIndex));
      if (!recto) rowDiv.appendChild(buildSpacer());
    } else {
      for (const pageIndex of row) {
        rowDiv.appendChild(buildSlot(pageIndex));
      }
    }

    innerDiv.appendChild(rowDiv);
  }

  return { innerDiv, allSlots };
}
