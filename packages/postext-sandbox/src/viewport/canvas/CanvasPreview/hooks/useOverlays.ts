// The canvas preview's overlays: caret, selection, frame and fit marks, and
// the caret follow (#1276: split out of CanvasPreview/index.tsx).
import { useRef, useState, useEffect } from 'react';
import { type CaretFollow, followsCaret, followEditorCaret, selectionOn, chapterOfPages } from '../../../../selection/viewerSelection.js';
import { onEditModeChange, editModeNow, selectedFrameNow } from '../../../../editing/editMode.js';
import { onPageSelectionChange, carriedPosition } from '../../../../selection/selectionStore.js';
import { onFrameJumpChange } from '../../../../editions/frameJump.js';
import { onOverlapFocusChange } from '../../../../editions/overlapFocus.js';
import { onReflowViewChange, reflowShownNow, reflowFocusNow } from '../../../composed/reflowView.js';
import { onFitMarksChange, fitMarksViewOf } from '../../../composed/fitMarksView.js';
import { syncComicEditors } from '../../../comics/comicEditing.js';
import { syncFrameEditors } from '../../../composed/frameEditor.js';
import { syncLabelAnchorEditors } from '../../../composed/labelAnchorEditor.js';
import { resolveDebugConfig, type PostextConfig, type VDTDocument } from 'postext';
import { toBookSelection } from '../../../../book/compose.js';
import type { EditorSelection } from '../../../../context/SandboxContext.js';
import { NO_SELECTION } from './constants.js';
import { findCaretBlockIdx, findCarriedCaretBlockIdx } from '../caret.js';
import { findResourceLocation } from '../geometry.js';
import { drawReflowMarks, clearReflowMarks } from '../../../composed/reflowMarks.js';
import { clearOverlay, drawOverlay } from '../overlay.js';
import { clearFrameMarks, drawFrameMarks } from '../../../composed/frameOverlay.js';
import { drawPickedMark } from '../../../../selection/pickedOverlay.js';
import { drawPageFitMarks, clearFitMarks } from '../../../composed/fitMarks.js';
import { clearOverlapMarks } from '../../../composed/overlapMarks.js';
import type { ResourceSelection, SandboxAction } from '../../../../context/SandboxContext/state.js';
import type { PanelId } from '../../../../types/props.js';
import type { SandboxLabels } from '../../../../types/labels.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { StitchedBook } from '../../../../book/stitch.js';
import type { ChapterDocument } from '../../../../context/SandboxContext/hooks.js';

/** What useOverlays takes from the canvas preview. */
export interface UseOverlaysDeps {
  activeChapterId: string;
  config: PostextConfig;
  editorSelection: EditorSelection;
  editorFocused: boolean;
  selectionFromViewerRef: React.RefObject<boolean>;
  resourceSelection: ResourceSelection | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dispatchRef: React.RefObject<React.Dispatch<SandboxAction>>;
  activePanelRef: React.RefObject<PanelId | null>;
  labelsRef: React.RefObject<SandboxLabels>;
  uiLocaleRef: React.RefObject<string>;
  pageSourceRef: React.RefObject<((pageIndex: number) => ComposedBook | null) | null>;
  docRef: React.RefObject<VDTDocument | null>;
  stitchedRef: React.RefObject<StitchedBook | null>;
  drawnOverlaysRef: React.RefObject<Set<number>>;
  chapterDocsRef: React.MutableRefObject<Map<string, ChapterDocument>>;
  overlayMapRef: React.RefObject<Map<number, SVGSVGElement>>;
  builtSourceRef: React.RefObject<ComposedBook | null>;
  docVersion: number;
}

export function useOverlays(deps: UseOverlaysDeps) {
  const {
    activeChapterId, config, editorSelection, editorFocused, selectionFromViewerRef,
    resourceSelection, containerRef, dispatchRef, activePanelRef, labelsRef, uiLocaleRef,
    pageSourceRef, docRef, stitchedRef, drawnOverlaysRef, chapterDocsRef, overlayMapRef,
    builtSourceRef, docVersion
  } = deps;
  // Draw cursor/selection overlays whenever selection or debug config changes.
  // The viewport follows the caret only when the SELECTION moves (the reader
  // placed it in the editor); a relayout, a focus change or a redraw with the
  // same selection must not pull the page back to it, or the reader could
  // never scroll away from a selected block. A selection placed from the
  // preview itself is not followed either: the reader is looking at it, and
  // the editor's reports on the way there (a chapter switch remounts it)
  // would pull the page from under the pointer.
  const lastFollowedRef = useRef<string | null>(null);
  const caretFollowRef = useRef<CaretFollow>({ key: null, doc: null });
  // The frame marks follow the Content / Design mode and the frame picked.
  const [editModeTick, setEditModeTick] = useState(0);
  useEffect(() => onEditModeChange(() => setEditModeTick((t) => t + 1)), []);
  // The element picked on a page (#865) is marked and named in the path.
  const [pickTick, setPickTick] = useState(0);
  useEffect(() => onPageSelectionChange(() => setPickTick((t) => t + 1)), []);
  // …and the fit marks the frame a check just reached (#867).
  useEffect(() => onFrameJumpChange(() => setEditModeTick((t) => t + 1)), []);
  // The overlap check the reader selected is drawn on its page (#1066).
  useEffect(() => onOverlapFocusChange(() => setEditModeTick((t) => t + 1)), []);
  // …and the Reflow marks, with the frame the Reflow panel points at (#868).
  useEffect(() => onReflowViewChange(() => setEditModeTick((t) => t + 1)), []);
  // …and the fit marks the reader chose to see (#1160).
  useEffect(() => onFitMarksChange(() => setEditModeTick((t) => t + 1)), []);
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    // The comic splitter handles follow the new layout (#568).
    syncComicEditors();
    // So do the page-template marks of Design mode (#863) and the figure
    // labels' anchors (#866).
    syncFrameEditors();
    syncLabelAnchorEditors();
    const debug = resolveDebugConfig(config.debug);
    // The editor selection is chapter-local; the document is the composed
    // book — or, stitched from every chapter, a document whose offsets are
    // chapter offsets: the selection then maps through the chapter's own
    // book and shows on the chapter's pages alone.
    const stitched = stitchedRef.current;
    const chapterDoc = stitched ? chapterDocsRef.current.get(activeChapterId) : undefined;
    const source = stitched ? chapterDoc?.source ?? null : builtSourceRef.current;
    const mapped = source ? toBookSelection(source, activeChapterId, editorSelection) : stitched ? null : editorSelection;
    const selection: EditorSelection = mapped ?? NO_SELECTION;
    const focused = editorFocused && mapped !== null;
    let chapterPages: { from: number; to: number } | undefined;
    if (stitched) {
      let from = -1;
      let to = -1;
      stitched.pageChapterIds.forEach((id, i) => {
        if (id !== activeChapterId) return;
        if (from < 0) from = i;
        to = i + 1;
      });
      chapterPages = from >= 0 ? { from, to } : { from: 0, to: 0 };
    }
    const caretBlockIdx = findCaretBlockIdx(doc, selection.head, chapterPages);
    // A resource editor's selection paints on the page holding the resource.
    const resourcePage = stitched && resourceSelection ? findResourceLocation(doc, resourceSelection.resourceId)?.pageIndex ?? -1 : -1;

    // The editor's caret, moved there by the reader, is followed on the
    // page (#865): the path names where it is.
    const followKey = focused ? `${activeChapterId}:${selection.from}:${selection.to}:${selection.head}` : null;
    if (focused && !selectionFromViewerRef.current && followsCaret(caretFollowRef.current, followKey, doc)) {
      caretFollowRef.current = { key: followKey, doc };
      followEditorCaret(doc, selection.head, {
        dispatch: () => dispatchRef.current,
        activePanel: () => activePanelRef.current,
        sourceOfPage: (i) => (pageSourceRef.current ? pageSourceRef.current(i) : builtSourceRef.current),
      }, chapterPages, stitched ? carriedPosition(activeChapterId) : undefined);
    }
    const picked = selectionOn(doc, chapterOfPages((i) => (pageSourceRef.current ? pageSourceRef.current(i) : builtSourceRef.current)));

    let activeCursorRect: SVGRectElement | null = null;
    const drawn = drawnOverlaysRef.current;
    // What the layout moved on composed pages (#868): in the overlay only.
    const reflowShown = reflowShownNow();
    // Which fit marks: the reader's choice over the book's (#1160).
    const fitView = fitMarksViewOf(config.debug);
    const reflowFocus = reflowFocusNow();
    const drawReflow = (overlay: SVGSVGElement, pageIndex: number) => drawReflowMarks(overlay, doc, pageIndex, {
      shown: reflowShown,
      focusFrame: reflowFocus?.pageIndex === pageIndex ? reflowFocus.frame : null,
      locale: uiLocaleRef.current,
    });
    // The pages that hold words a story of the chapter being edited carried
    // from it (#988).
    const carriedChapter = stitched && editorFocused ? carriedPosition(activeChapterId) : undefined;
    const carriedPages = new Set<number>();
    if (carriedChapter !== undefined) for (const b of doc.blocks) if (b.sourceChapter === carriedChapter) carriedPages.add(b.pageIndex);
    for (const [pageIndex, overlay] of overlayMapRef.current) {
      const page = doc.pages[pageIndex];
      if (!page) continue;
      if (chapterPages && (pageIndex < chapterPages.from || pageIndex >= chapterPages.to) && pageIndex !== resourcePage) {
        if (drawn.delete(pageIndex)) clearOverlay(overlay);
        if (page.composed) clearFrameMarks(overlay);
        // The selection of the chapter being edited over the words one of
        // its stories carried here (#988): offsets in that chapter's file.
        if (carriedChapter !== undefined && carriedPages.has(pageIndex)) {
          drawOverlay(overlay, doc, pageIndex, editorSelection, debug, true, findCarriedCaretBlockIdx(doc, editorSelection.head, carriedChapter, pageIndex), null, { chapter: carriedChapter, only: true });
          drawn.add(pageIndex);
        }
        // The text a story carried here from the chapter being edited
        // (#943) is picked on this page.
        drawPickedMark(overlay, doc, pageIndex, picked && picked.pageIndex === pageIndex && picked.chain.some((e) => e.chapter !== undefined || (e.source.kind === 'markdown' && e.source.chapter !== undefined)) ? picked : null);
        // A frame that does not fit is marked on every page (#867).
        if (page.composed) {
          drawPageFitMarks(overlay, doc, pageIndex, labelsRef.current, uiLocaleRef.current, fitView);
          drawReflow(overlay, pageIndex);
        }
        continue;
      }
      const rect = drawOverlay(overlay, doc, pageIndex, selection, debug, focused, caretBlockIdx, resourceSelection);
      drawPickedMark(overlay, doc, pageIndex, picked);
      // A composed page's empty frames, the caret's frame, the frames in
      // Design mode (#864): in the overlay, never on the page itself.
      if (page.composed) {
        drawFrameMarks(overlay, doc, pageIndex, {
          mode: editModeNow(),
          markdown: source?.markdown ?? null,
          caret: focused ? selection.head : null,
          selectedFrameId: selectedFrameNow()?.pageIndex === pageIndex ? selectedFrameNow()!.frameId : null,
          writeHere: labelsRef.current.composedFrameWriteHere,
          continues: labelsRef.current.composedFrameContinues,
          // Design mode: auto sizes, minimums, maximums and pins (#868).
          badges: {
            auto: labelsRef.current.designBadgeAuto,
            min: labelsRef.current.designBadgeMin,
            max: labelsRef.current.designBadgeMax,
            pinned: labelsRef.current.designBadgePinned,
          },
          locale: uiLocaleRef.current,
        });
        // Overflow and scale (#867): in the overlay, never on the page.
        drawPageFitMarks(overlay, doc, pageIndex, labelsRef.current, uiLocaleRef.current, fitView);
        drawReflow(overlay, pageIndex);
      } else {
        clearFitMarks(overlay);
        clearOverlapMarks(overlay);
        clearReflowMarks(overlay);
      }
      drawn.add(pageIndex);
      if (rect) activeCursorRect = rect;
    }

    const container = containerRef.current;
    const isCollapsed = selection.from === selection.to;
    const scrollEnabled = isCollapsed
      ? debug.cursorSync.enabled
      : debug.selectionSync.enabled;
    const selectionMoved = followKey !== null && followKey !== lastFollowedRef.current;
    if (focused) lastFollowedRef.current = followKey;
    if (
      activeCursorRect &&
      container &&
      focused &&
      scrollEnabled &&
      selectionMoved &&
      !selectionFromViewerRef.current
    ) {
      const padding = 16;
      const cr = activeCursorRect.getBoundingClientRect();
      const cn = container.getBoundingClientRect();
      if (cr.top < cn.top + padding) {
        container.scrollTop += cr.top - cn.top - padding;
      } else if (cr.bottom > cn.bottom - padding) {
        container.scrollTop += cr.bottom - cn.bottom + padding;
      }
      if (cr.left < cn.left + padding) {
        container.scrollLeft += cr.left - cn.left - padding;
      } else if (cr.right > cn.right - padding) {
        container.scrollLeft += cr.right - cn.right + padding;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorSelection, activeChapterId, config.debug, editorFocused, resourceSelection, docVersion, chapterDocsRef, editModeTick, pickTick]);
  return {
  };
}
