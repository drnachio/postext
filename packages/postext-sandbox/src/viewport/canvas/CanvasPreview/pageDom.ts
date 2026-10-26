import type { Dispatch, MutableRefObject } from 'react';
import type { Resource, VDTDocument } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { PanelId } from '../../../types/index.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { ComposedBook } from '../../../book/types.js';
import { createPageCanvas, createOverlaySvg, setPairSide } from './dom.js';
import { attachSlotClickHandler, type PageNavigator } from './interaction.js';
import { attachFrameEditor } from '../../composed/frameEditor.js';
import { attachLabelAnchorEditor } from '../../composed/labelAnchorEditor.js';
import {
  DEFAULT_PAGE_GAPS,
  PAGE_PADDING,
  type PageGaps,
  type ViewMode,
  groupPagesIntoRows,
  innerRowWidth,
  rowPadding,
} from './layoutUtils.js';

export interface BuildPagesDomResult {
  innerDiv: HTMLDivElement;
  allSlots: HTMLDivElement[];
}

/** Lay out the two pages of a row as a pair that touches (gap 0), or give
 *  each its own edges back. A right-bound book reads its spreads right to
 *  left, so the first page of a row is on the right of the joint. Rows with
 *  one page (a lone recto or verso beside its spacer) are left alone. */
export function joinPagesOfRow(rowDiv: HTMLElement, pageGap: number): void {
  const slots = Array.from(rowDiv.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.pageIndex !== undefined,
  );
  const canvases = slots.map((slot) => slot.querySelector('canvas')).filter((c): c is HTMLCanvasElement => c !== null);
  if (canvases.length !== 2) {
    for (const canvas of canvases) setPairSide(canvas, 'alone');
    return;
  }
  const reversed = rowDiv.style.flexDirection === 'row-reverse';
  const [first, second] = canvases as [HTMLCanvasElement, HTMLCanvasElement];
  if (pageGap > 0) {
    setPairSide(first, 'alone');
    setPairSide(second, 'alone');
  } else {
    setPairSide(first, reversed ? 'right' : 'left');
    setPairSide(second, reversed ? 'left' : 'right');
  }
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
  /** The interface strings (the comic page tools, #568). */
  labelsRef?: MutableRefObject<SandboxLabels>,
  /** The space between the pages of a row and between rows (#1002). */
  gaps: PageGaps = DEFAULT_PAGE_GAPS,
): BuildPagesDomResult {
  const isSpread = viewMode === 'spread';
  const pagesPerRow = isSpread ? 2 : 1;
  const innerWidth = innerRowWidth(displayWidth, pagesPerRow, gaps.pageGap);
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
    attachSlotClickHandler(slot, pageIndex, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef, sourceRef, navigateRef, resourcesRef, pageSourceRef, labelsRef);
    // The labels of figures in Design mode (#866): a press on one is theirs,
    // before the page-template editor's.
    attachLabelAnchorEditor(slot, pageIndex, pageWidthPx, pageHeightPx, {
      docRef,
      dispatchRef,
      ...(labelsRef ? { labelsRef } : {}),
      sourceOfPage: (i) => (pageSourceRef?.current ? pageSourceRef.current(i) : sourceRef.current),
    });
    // The page-template editor of Design mode (#863): first on the page's pointer.
    attachFrameEditor(slot, pageIndex, pageWidthPx, pageHeightPx, { docRef, dispatchRef, sourceRef, pageSourceRef, ...(labelsRef ? { labelsRef } : {}) });
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
    const { top: paddingTop, bottom: paddingBottom } = rowPadding(rowIdx, rows.length, gaps.rowGap);
    rowDiv.style.padding = `${paddingTop}px ${PAGE_PADDING}px ${paddingBottom}px`;
    rowDiv.style.gap = `${gaps.pageGap}px`;
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

    if (isSpread && gaps.pageGap === 0) joinPagesOfRow(rowDiv, gaps.pageGap);
    innerDiv.appendChild(rowDiv);
  }

  return { innerDiv, allSlots };
}
