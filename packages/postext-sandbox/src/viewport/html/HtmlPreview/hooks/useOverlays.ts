// The HTML preview's overlays (caret, selection and picked-element marks,
// the caret follow) and its imperative handle (#1276: split out of
// HtmlPreview/index.tsx).
import { useRef, useState, useEffect, useImperativeHandle } from 'react';
import { type CaretFollow, followsCaret, followEditorCaret, selectionOn, chapterOfPages } from '../../../../selection/viewerSelection.js';
import { onPageSelectionChange } from '../../../../selection/selectionStore.js';
import { onEditModeChange } from '../../../../editing/editMode.js';
import { syncComicEditors } from '../../../comics/comicEditing.js';
import { resolveDebugConfig, type VDTDocument } from 'postext';
import { toBookSelection } from '../../../../book/compose.js';
import type { EditorSelection } from '../../../../context/SandboxContext.js';
import { drawOverlay } from '../../../canvas/CanvasPreview/overlay.js';
import { drawPickedMark } from '../../../../selection/pickedOverlay.js';
import { syncLabelAnchorEditors } from '../../../composed/labelAnchorEditor.js';
import { htmlVideoPlayers, htmlVideoState, playHtmlVideo } from '../videos.js';
import { PADDING_PX, type ColumnMode } from '../constants.js';
import { pickVideo } from '../../../viewerVideos.js';
import { leadingPageEl, siblingPageEl } from '../pageEdges.js';
import type { HtmlPreviewHandle } from '../types.js';
import type { SandboxState, SandboxAction } from '../../../../context/SandboxContext/state.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { PanelId } from '../../../../types/props.js';

/** What useOverlays takes from the HTML preview. */
export interface UseOverlaysDeps {
  ref: React.ForwardedRef<HtmlPreviewHandle>;
  state: SandboxState;
  activeChapterId: string;
  builtSourceRef: React.RefObject<ComposedBook | null>;
  scrollHostRef: React.RefObject<HTMLDivElement | null>;
  columnGeomRef: React.RefObject<{ pageWidthPx: number; columnGapPx: number; }>;
  dispatchRef: React.RefObject<React.Dispatch<SandboxAction>>;
  activePanelRef: React.RefObject<PanelId | null>;
  docRef: React.RefObject<VDTDocument | null>;
  overlayMapRef: React.RefObject<Map<number, SVGSVGElement>>;
  docVersion: number;
  rtlRef: React.RefObject<boolean>;
  columnModeRef: React.RefObject<ColumnMode>;
  scheduleRelayout: (delay: number) => void;
}

export function useOverlays(deps: UseOverlaysDeps) {
  const {
    ref, state, activeChapterId, builtSourceRef, scrollHostRef, columnGeomRef, dispatchRef,
    activePanelRef, docRef, overlayMapRef, docVersion, rtlRef, columnModeRef, scheduleRelayout
  } = deps;
  // Draw cursor/selection overlays whenever selection, focus, or the document
  // itself changes. Mirrors the effect in CanvasPreview so behavior is shared:
  // the viewport follows the caret only when the selection itself moves.
  const lastFollowedRef = useRef<string | null>(null);
  const caretFollowRef = useRef<CaretFollow>({ key: null, doc: null });
  // The element picked on a page (#865) is marked here too.
  const [pickTick, setPickTick] = useState(0);
  useEffect(() => onPageSelectionChange(() => setPickTick((t) => t + 1)), []);
  // The marks of the figures' labels are Design mode's (#931).
  const [designTick, setDesignTick] = useState(0);
  useEffect(() => onEditModeChange(() => setDesignTick((t) => t + 1)), []);
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    // The comic splitter handles follow the new layout (#568).
    syncComicEditors();
    const debug = resolveDebugConfig(state.config.debug);
    const source = builtSourceRef.current;
    const mapped = source ? toBookSelection(source, activeChapterId, state.selection) : state.selection;
    const selection: EditorSelection = mapped ?? { from: -1, to: -1, head: -1 };
    const focused = state.editorFocused && mapped !== null;

    let caretBlockIdx = -1;
    const { head } = selection;
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i]!;
      if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      if (head >= b.sourceStart && head <= b.sourceEnd) { caretBlockIdx = i; break; }
    }
    if (caretBlockIdx === -1) {
      for (let i = 0; i < doc.blocks.length; i++) {
        const b = doc.blocks[i]!;
        if (b.sourceStart === undefined) continue;
        if (b.sourceStart >= head) { caretBlockIdx = i; break; }
      }
    }
    if (caretBlockIdx === -1 && doc.blocks.length > 0) {
      caretBlockIdx = doc.blocks.length - 1;
    }

    // The editor's caret, moved there by the reader, is followed on the
    // page (#865).
    const caretKey = focused ? `${activeChapterId}:${selection.from}:${selection.to}:${selection.head}` : null;
    if (focused && !state.selectionFromViewer && followsCaret(caretFollowRef.current, caretKey, doc)) {
      caretFollowRef.current = { key: caretKey, doc };
      followEditorCaret(doc, selection.head, {
        dispatch: () => dispatchRef.current,
        activePanel: () => activePanelRef.current,
        sourceOfPage: () => builtSourceRef.current,
      });
    }
    const picked = selectionOn(doc, chapterOfPages(() => builtSourceRef.current));

    let activeCursorRect: SVGRectElement | null = null;
    for (const [pageIndex, overlay] of overlayMapRef.current) {
      const page = doc.pages[pageIndex];
      if (!page) continue;
      const rect = drawOverlay(overlay, doc, pageIndex, selection, debug, focused, caretBlockIdx, state.resourceSelection);
      drawPickedMark(overlay, doc, pageIndex, picked);
      if (rect) activeCursorRect = rect;
    }
    // The marks of the figures' labels, moved here in Design mode (#956).
    syncLabelAnchorEditors();

    const scroll = scrollHostRef.current;
    const isCollapsed = selection.from === selection.to;
    const scrollEnabled = isCollapsed
      ? debug.cursorSync.enabled
      : debug.selectionSync.enabled;
    const followKey = focused ? `${activeChapterId}:${selection.from}:${selection.to}:${selection.head}` : null;
    const selectionMoved = followKey !== null && followKey !== lastFollowedRef.current;
    if (focused) lastFollowedRef.current = followKey;
    if (
      activeCursorRect &&
      scroll &&
      focused &&
      scrollEnabled &&
      selectionMoved &&
      !state.selectionFromViewer
    ) {
      const padding = 16;
      const cr = activeCursorRect.getBoundingClientRect();
      const cn = scroll.getBoundingClientRect();
      if (cr.top < cn.top + padding) {
        scroll.scrollTop += cr.top - cn.top - padding;
      } else if (cr.bottom > cn.bottom - padding) {
        scroll.scrollTop += cr.bottom - cn.bottom + padding;
      }
      if (cr.left < cn.left + padding) {
        scroll.scrollLeft += cr.left - cn.left - padding;
      } else if (cr.right > cn.right - padding) {
        scroll.scrollLeft += cr.right - cn.right + padding;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selection, state.selectionFromViewer, activeChapterId, state.config.debug, state.editorFocused, state.resourceSelection, docVersion, pickTick, designTick]);

  // Imperative API exposed to the viewport toolbar.
  // - regenerate: force a fresh relayout immediately.
  // - scrollColumn(delta): shift the scroll container by ±1 column step. In
  //   multi-column mode that's horizontal (column width + gap). In single
  //   mode we fall back to a viewport-height vertical scroll (one "screen").
  useImperativeHandle(ref, () => {
    const players = () => (scrollHostRef.current && docRef.current ? htmlVideoPlayers(scrollHostRef.current, docRef.current) : []);
    const jumpToPage = (pageIndex: number) => {
      const scroll = scrollHostRef.current;
      if (!scroll) return;
      const pageEl = scroll.querySelector<HTMLElement>(`.pt-page[data-page="${pageIndex}"]`);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      if (columnModeRef.current === 'multi') {
        if (rtlRef.current) scroll.scrollLeft += pageRect.right - scrollRect.right + PADDING_PX;
        else scroll.scrollLeft += pageRect.left - scrollRect.left - PADDING_PX;
      } else {
        scroll.scrollTop += pageRect.top - scrollRect.top - PADDING_PX;
      }
    };
    return {
      regenerate: () => scheduleRelayout(0),
      jumpToPage,
      videos: () => players().map((v) => ({ resource: v.resource, pageIndex: v.pageIndex, state: htmlVideoState(v.item) })),
      playVideo: async (pick) => {
        const picked = pickVideo(players(), pick);
        if (!picked) return { played: false, reason: 'none' };
        jumpToPage(picked.pageIndex);
        return { ...(await playHtmlVideo(picked.item)), resource: picked.resource, pageIndex: picked.pageIndex };
      },
      stopVideo: () => {
        for (const v of players()) if (htmlVideoState(v.item) === 'playing') v.item.pause();
      },
      scrollColumn: (delta: number) => {
        const scroll = scrollHostRef.current;
        if (!scroll) return;
        if (columnModeRef.current === 'multi') {
          const { pageWidthPx, columnGapPx } = columnGeomRef.current;
          if (pageWidthPx <= 0) return;
          // A composed page is wider than a text page (#1045): the step
          // from the page at the leading edge is that page's own width
          // (or the one before it, going back).
          const lead = leadingPageEl(scroll, rtlRef.current);
          const other = lead && (delta > 0 ? siblingPageEl(lead, 1) : siblingPageEl(lead, -1));
          const stepEl = delta > 0 ? lead : other;
          const step = (stepEl ? stepEl.getBoundingClientRect().width : pageWidthPx) + columnGapPx;
          // Right to left, the next page is to the left.
          scroll.scrollBy({ left: (rtlRef.current ? -delta : delta) * step, behavior: 'smooth' });
        } else {
          scroll.scrollBy({ top: delta * scroll.clientHeight, behavior: 'smooth' });
        }
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRelayout]);
  return {
  };
}
