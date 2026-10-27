'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { resolveDebugConfig, type VDTDocument } from 'postext';
import type { FolioDocumentViewer, FolioInteraction } from 'postext-folio';
import { useSandboxDispatch, useSandboxSelector, useLayoutSource, type EditorSelection } from '../../context/SandboxContext.js';
import { toBookSelection } from '../../book/compose.js';
import type { StitchedBook } from '../../book/stitch.js';
import type { ComposedBook } from '../../book/types.js';
import { findCaretBlockIdx } from '../canvas/CanvasPreview/caret.js';
import { createOverlaySvg } from '../canvas/CanvasPreview/dom.js';
import { findResourceLocation } from '../canvas/CanvasPreview/geometry.js';
import { attachPageInteraction, type PageInteraction } from '../canvas/CanvasPreview/interaction.js';
import { drawMarksCanvas, type ComicMark, type ComicSurface } from '../comics/comicEditing.js';
import { drawOverlay, multiplyAffine, type Affine } from '../canvas/CanvasPreview/overlay.js';
import { usePageNavigator } from '../usePageNavigator.js';
import { drawPickedMark } from '../../selection/pickedOverlay.js';
import { editModeNow, onEditModeChange } from '../../editing/editMode.js';
import { labelsOnPage } from '../composed/labelAnchorGeometry.js';
import { labelMarkShapes, paintShapesCanvas, type MarkShape } from '../composed/labelMarks.js';
import type { LabelSurface } from '../composed/labelAnchorEditor.js';
import { useTemplateEditorHost } from '../../templates/useTemplateEditorHost.js';
import { carriedPosition, onPageSelectionChange } from '../../selection/selectionStore.js';
import { chapterOfPages, followEditorCaret, followsCaret, selectionOn, type CaretFollow } from '../../selection/viewerSelection.js';

/** A filled rectangle of a page's overlay, in the page's own pixels, with
 *  the transform of its group (a vertical page's flow frame). */
interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  matrix: [number, number, number, number, number, number] | null;
}

/** Pages either side of the open spread whose marks are kept up to date
 *  (the viewer paints a few spreads round it). */
const AROUND = 8;
/** How long the caret rests before the book turns to its page: typing
 *  moves it on every key, and a layout may not have caught up yet. */
const FOLLOW_DELAY_MS = 220;

const NO_SELECTION: EditorSelection = { from: -1, to: -1, head: -1 };

/** The `matrix()` transform an overlay element carries, if any. */
function matrixOf(el: Element): Affine | null {
  const m = /matrix\(([^)]+)\)/.exec(el.getAttribute('transform') ?? '');
  return m ? (m[1]!.trim().split(/[\s,]+/).map(Number) as Affine) : null;
}

/** The rects an overlay SVG holds, as `drawOverlay` left them. */
function rectsOf(svg: SVGSVGElement): OverlayRect[] {
  const out: OverlayRect[] = [];
  for (const role of ['looseLines', 'selection', 'cursor', 'picked']) {
    const g = svg.querySelector<SVGGElement>(`g[data-role="${role}"]`);
    if (!g) continue;
    const matrix = matrixOf(g);
    for (const r of g.querySelectorAll<SVGRectElement>('rect')) {
      if (r.style.display === 'none' || r.style.visibility === 'hidden') continue;
      const w = Number(r.getAttribute('width'));
      const h = Number(r.getAttribute('height'));
      if (!(w > 0) || !(h > 0)) continue;
      // A rect of a balloon's words carries its turn and lean (#796).
      const own = matrixOf(r);
      out.push({ x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')), w, h, fill: r.getAttribute('fill') ?? '#000', matrix: matrix && own ? multiplyAffine(matrix, own) : matrix ?? own });
    }
  }
  return out;
}

interface Options {
  viewerRef: MutableRefObject<FolioDocumentViewer | null>;
  /** The document the viewer shows. */
  docRef: MutableRefObject<VDTDocument | null>;
  /** The whole book stitched from its chapters (null: one chapter). */
  stitchedRef: MutableRefObject<StitchedBook | null>;
  chapterDocsRef: MutableRefObject<Map<string, { source: ComposedBook | null }>>;
  /** The composed book a chapter's document was laid out from. */
  sourceRef: MutableRefObject<ComposedBook | null>;
  interactionRef: MutableRefObject<FolioInteraction>;
  /** Bumped whenever the viewer shows another document. */
  docKey: unknown;
}

/**
 * The Markdown editor and the Folio book kept in step, as on the canvas:
 * the editor's caret and selection are painted on the pages they fall on
 * (into the pages' textures, so they lie on the 3D book, tilted, curving
 * into the gutter, on a turning leaf), the book turns to the caret's page
 * when the caret moves there in the editor, and in select mode (and under
 * the magnifying glass, at its centre) a click or a drag on the projected
 * pages places the caret or selects in the editor. Returns the viewer's `decorate` and the hook to wire a new
 * viewer's pointer.
 */
export function useFolioSelection({ viewerRef, docRef, stitchedRef, chapterDocsRef, sourceRef, interactionRef, docKey }: Options) {
  const dispatch = useSandboxDispatch();
  // The label editor writes the anchor it drops on the resource through the
  // book's state, which the canvas lends it while it is mounted (#970).
  useTemplateEditorHost();
  const { chapterId: activeChapterId } = useLayoutSource();
  const editorSelection = useSandboxSelector((s) => s.selection);
  const editorFocused = useSandboxSelector((s) => s.editorFocused);
  const selectionFromViewer = useSandboxSelector((s) => s.selectionFromViewer);
  const resourceSelection = useSandboxSelector((s) => s.resourceSelection);
  const debugConfig = useSandboxSelector((s) => s.config.debug);
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const resources = useSandboxSelector((s) => s.resources);
  const labels = useSandboxSelector((s) => s.labels);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  /** The comic page tools' marks of each page (#568), drawn over the
   *  selection's. */
  const comicMarksRef = useRef<Map<number, { marks: ComicMark[]; cssToSheet: number }>>(new Map());
  const interactionHandleRef = useRef<PageInteraction | null>(null);

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  const chapterOfPageRef = useRef<((pageIndex: number) => number) | null>(null);
  const pageSourceRef = useRef<((pageIndex: number) => ComposedBook | null) | null>(null);
  const navigateRef = usePageNavigator(chapterOfPageRef);
  // A whole book's pages map through their own chapters' books.
  chapterOfPageRef.current = stitchedRef.current ? (i) => stitchedRef.current?.pageChapters[i] ?? -1 : null;
  pageSourceRef.current = stitchedRef.current
    ? (i) => {
        const id = stitchedRef.current?.pageChapterIds[i];
        return id ? chapterDocsRef.current.get(id)?.source ?? null : null;
      }
    : null;

  /** The marks of every page that has some, and their text (to tell which
   *  pages changed). */
  const marksRef = useRef<Map<number, OverlayRect[]>>(new Map());
  const keysRef = useRef<Map<number, string>>(new Map());
  /** The marks of the figures' labels (Design mode, #931), by page, and
   *  their text. */
  const labelMarksRef = useRef<Map<number, MarkShape[]>>(new Map());
  const labelKeysRef = useRef<Map<number, string>>(new Map());
  /** The marks of the page a label is being dragged on or hovered over
   *  (#970), which the label editor paints in place of the page's own. */
  const labelEditRef = useRef<Map<number, MarkShape[]>>(new Map());
  const svgRef = useRef<SVGSVGElement | null>(null);

  const decorate = useCallback((index: number, ctx: CanvasRenderingContext2D): boolean => {
    const rects = marksRef.current.get(index);
    const comic = comicMarksRef.current.get(index);
    const labelMarks = labelEditRef.current.get(index) ?? labelMarksRef.current.get(index);
    if (comic) {
      ctx.save();
      drawMarksCanvas(ctx, comic.marks, comic.cssToSheet);
      ctx.restore();
    }
    if (labelMarks?.length) {
      ctx.save();
      paintShapesCanvas(ctx, labelMarks);
      ctx.restore();
    }
    if (!rects?.length) return comic !== undefined || !!labelMarks?.length;
    // Over the print, as the canvas's overlay lies over its page.
    ctx.globalCompositeOperation = 'multiply';
    for (const r of rects) {
      ctx.save();
      if (r.matrix) ctx.transform(...r.matrix);
      ctx.fillStyle = r.fill;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    return true;
  }, []);

  // The marks, drawn again whenever the selection, the document or the
  // spread on show changes; only the pages whose marks changed are
  // repainted (each is a texture upload).
  const lastFollowedRef = useRef<string | null>(null);
  const followTimerRef = useRef(0);
  const caretFollowRef = useRef<CaretFollow>({ key: null, doc: null });
  const selectionFromViewerRef = useRef(selectionFromViewer);
  selectionFromViewerRef.current = selectionFromViewer;
  const refresh = useCallback(() => {
    const viewer = viewerRef.current;
    const doc = docRef.current;
    if (!viewer || !doc) return;
    const debug = resolveDebugConfig(debugConfig);
    const stitched = stitchedRef.current;
    const source = stitched ? chapterDocsRef.current.get(activeChapterId)?.source ?? null : sourceRef.current;
    const mapped = source ? toBookSelection(source, activeChapterId, editorSelection) : stitched ? null : editorSelection;
    const selection = mapped ?? NO_SELECTION;
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
    const resourcePage = resourceSelection ? findResourceLocation(doc, resourceSelection.resourceId)?.pageIndex ?? -1 : -1;
    // The editor's caret, moved there by the reader, is followed on the
    // page (#865); the element picked is marked.
    const caretKey = focused ? `${activeChapterId}:${selection.from}:${selection.to}:${selection.head}` : null;
    if (focused && !selectionFromViewerRef.current && followsCaret(caretFollowRef.current, caretKey, doc)) {
      caretFollowRef.current = { key: caretKey, doc };
      followEditorCaret(doc, selection.head, {
        dispatch: () => dispatchRef.current,
        activePanel: () => activePanelRef.current,
        sourceOfPage: (i) => (pageSourceRef.current ? pageSourceRef.current(i) : sourceRef.current),
      }, chapterPages, stitched ? carriedPosition(activeChapterId) : undefined);
    }
    const picked = selectionOn(doc, chapterOfPages((i) => (pageSourceRef.current ? pageSourceRef.current(i) : sourceRef.current)));

    // The pages round the spread on show, and those marked last time.
    const open = viewer.state.pages;
    const lo = Math.max(0, (open[0] ?? 0) - AROUND);
    const hi = Math.min(doc.pages.length - 1, (open[open.length - 1] ?? 0) + AROUND);
    const pages = new Set<number>(marksRef.current.keys());
    for (let i = lo; i <= hi; i++) pages.add(i);
    const page0 = doc.pages[0];
    svgRef.current ??= createOverlaySvg(1, 1, page0?.width ?? 1, page0?.height ?? 1);
    const svg = svgRef.current;
    const changed: number[] = [];
    const next = new Map<number, OverlayRect[]>();
    const keys = new Map<number, string>();
    const design = editModeNow() === 'design';
    const labelWords = { placedByPercent: labelsRef.current.labelAnchorsPlacedByPercent, overflow: labelsRef.current.labelAnchorsOverflow };
    const nextLabelMarks = new Map<number, MarkShape[]>();
    const nextLabelKeys = new Map<number, string>();
    for (const i of new Set([...pages, ...labelMarksRef.current.keys()])) {
      const page = doc.pages[i];
      if (!page) continue;
      // The labels' marks (Design mode, read only), as if the page showed
      // 600 CSS px wide: a page of the book has no fixed zoom.
      const shapes = design && i >= lo && i <= hi ? labelMarkShapes(labelsOnPage(doc, i), page.width / 600, {}, labelWords) : [];
      const shapeKey = shapes.length ? JSON.stringify(shapes) : '';
      if (shapes.length) {
        nextLabelMarks.set(i, shapes);
        nextLabelKeys.set(i, shapeKey);
      }
      if ((labelKeysRef.current.get(i) ?? '') !== shapeKey) changed.push(i);
    }
    for (const i of pages) {
      if (!doc.pages[i]) continue;
      const outside = chapterPages && (i < chapterPages.from || i >= chapterPages.to) && i !== resourcePage;
      let rects: OverlayRect[] = [];
      if (!outside) {
        drawOverlay(svg, doc, i, selection, debug, focused, caretBlockIdx, resourceSelection);
        drawPickedMark(svg, doc, i, picked);
        rects = rectsOf(svg);
      }
      const key = rects.length ? JSON.stringify(rects) : '';
      if (rects.length) {
        next.set(i, rects);
        keys.set(i, key);
      }
      if ((keysRef.current.get(i) ?? '') !== key && !changed.includes(i)) changed.push(i);
    }
    marksRef.current = next;
    keysRef.current = keys;
    labelMarksRef.current = nextLabelMarks;
    labelKeysRef.current = nextLabelKeys;
    if (changed.length) viewer.redecorate(changed);

    // Follow the caret to its page when the reader moved it in the editor
    // (not a relayout or a redraw, not a selection made on the book).
    const isCollapsed = selection.from === selection.to;
    const followOn = isCollapsed ? debug.cursorSync.enabled : debug.selectionSync.enabled;
    const followKey = focused ? `${activeChapterId}:${selection.from}:${selection.to}:${selection.head}` : null;
    const moved = followKey !== null && followKey !== lastFollowedRef.current;
    if (focused) lastFollowedRef.current = followKey;
    if (!moved || !followOn || selectionFromViewerRef.current) return;
    window.clearTimeout(followTimerRef.current);
    followTimerRef.current = window.setTimeout(() => {
      const v = viewerRef.current;
      const d = docRef.current;
      if (!v || !d) return;
      const caret = d.blocks[findCaretBlockIdx(d, selection.head, chapterPages)];
      const page = caret?.pageIndex;
      if (page === undefined || page < 0 || v.state.pages.includes(page)) return;
      v.goToPage(page);
    }, FOLLOW_DELAY_MS);
  }, [viewerRef, docRef, stitchedRef, chapterDocsRef, sourceRef, debugConfig, activeChapterId, editorSelection, editorFocused, resourceSelection]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => onPageSelectionChange(() => refreshRef.current()), []);
  // The marks of the labels belong to Design mode.
  useEffect(() => onEditModeChange(() => {
    refreshRef.current();
    interactionHandleRef.current?.labels?.sync();
  }), []);
  useEffect(() => {
    refresh();
  }, [refresh, docKey]);
  useEffect(() => {
    interactionHandleRef.current?.comic?.sync();
    // The label editor reads the labels of the new document again.
    interactionHandleRef.current?.labels?.sync();
  }, [docKey]);
  useEffect(() => () => window.clearTimeout(followTimerRef.current), []);

  /** A new viewer: its pointer selects on the pages in select and magnify
   *  modes, and
   *  the marks follow the spreads it opens. */
  const attach = useCallback((viewer: FolioDocumentViewer) => {
    const el = viewer.element;
    comicMarksRef.current = new Map();
    // The book shows the trimmed page; the document's coordinates are the
    // sheet's.
    const toFolio = (pageIndex: number, x: number, y: number) => {
      const doc = docRef.current;
      const page = doc?.pages[pageIndex];
      if (!doc || !page) return null;
      const inset = Math.max(0, doc.trimOffset);
      return { page: pageIndex, x: (x - inset) / Math.max(1, page.width - 2 * inset), y: (y - inset) / Math.max(1, page.height - 2 * inset) };
    };
    const cssToSheet = (pageIndex: number): number => {
      const page = docRef.current?.pages[pageIndex];
      const a = page ? toFolio(pageIndex, 0, page.height / 2) : null;
      const b = page ? toFolio(pageIndex, page.width, page.height / 2) : null;
      const pa = a ? viewer.pointOnScreen(a) : null;
      const pb = b ? viewer.pointOnScreen(b) : null;
      const d = pa && pb ? Math.hypot(pb.x - pa.x, pb.y - pa.y) : 0;
      return page && d > 0 ? page.width / d : 1;
    };
    const comicSurface: ComicSurface = {
      host: el,
      pages: () => [...viewer.state.pages],
      paint: (pageIndex, marks) => {
        const had = comicMarksRef.current.has(pageIndex);
        if (!marks || marks.length === 0) {
          comicMarksRef.current.delete(pageIndex);
          if (had) viewer.redecorate([pageIndex]);
          return;
        }
        comicMarksRef.current.set(pageIndex, { marks, cssToSheet: cssToSheet(pageIndex) });
        viewer.redecorate([pageIndex]);
      },
      place: (node, pageIndex, x, y) => {
        const pt = toFolio(pageIndex, x, y);
        const at = pt ? viewer.pointOnScreen(pt) : null;
        if (!at) return false;
        const rect = el.getBoundingClientRect();
        node.style.left = `${at.x - rect.left}px`;
        node.style.top = `${at.y - rect.top}px`;
        node.style.transform = '';
        return true;
      },
      sheetPxPerCssPx: cssToSheet,
    };
    // The label editor of Design mode (#970): its marks (hover, the label
    // in hand with its ghost) are painted into the page's texture, in place
    // of the page's own while the pointer is on a label.
    interactionHandleRef.current?.labels?.dispose();
    labelEditRef.current = new Map();
    const labelSurface: LabelSurface = {
      paint: (pageIndex, shapes) => {
        const had = labelEditRef.current.has(pageIndex);
        if (shapes) labelEditRef.current.set(pageIndex, shapes);
        else labelEditRef.current.delete(pageIndex);
        if (shapes || had) viewer.redecorate([pageIndex]);
      },
      sheetPxPerCssPx: cssToSheet,
      // As the page's own marks are drawn: a book page has no fixed zoom.
      markScale: (pageIndex) => (docRef.current?.pages[pageIndex]?.width ?? 600) / 600,
    };
    interactionHandleRef.current = attachPageInteraction(el, {
      locate: (ev) => {
        const doc = docRef.current;
        const hit = viewer.pageAt(ev);
        const page = hit ? doc?.pages[hit.page] : undefined;
        if (!hit || !doc || !page) return null;
        // The book shows the trimmed page; the document's coordinates are
        // the sheet's.
        const inset = Math.max(0, doc.trimOffset);
        return { pageIndex: hit.page, x: inset + hit.x * (page.width - 2 * inset), y: inset + hit.y * (page.height - 2 * inset) };
      },
      docRef,
      dispatchRef,
      activePanelRef,
      sourceRef,
      navigateRef,
      resourcesRef,
      pageSourceRef,
      showLocation: (_doc, loc) => viewer.goToPage(loc.pageIndex),
      setCursor: (cursor) => {
        el.style.cursor = cursor === 'text' ? '' : cursor;
      },
      // Under the magnifying glass too: what lies at its centre (#543).
      enabled: () => interactionRef.current === 'select' || interactionRef.current === 'magnify',
      touchSelects: true,
      // Comic splitters and panels are edited in select mode only (#568).
      comicSurface,
      labelsRef,
      comicEnabled: () => interactionRef.current === 'select',
      // The labels' points are dragged in select mode only, as the comic
      // tools are: a press on one is not a page flip (#970).
      labelSurface,
      labelsEnabled: () => interactionRef.current === 'select',
    });
    // The marks of the pages the viewer opens on: nothing else asks for
    // them until the book turns (the first refresh found no viewer).
    queueMicrotask(() => refreshRef.current());
  }, [docRef, sourceRef, interactionRef, navigateRef]);

  /** The book came to rest on (or was sent to) another spread: mark the
   *  pages round it. */
  const onSpread = useCallback(() => {
    refreshRef.current();
    interactionHandleRef.current?.comic?.sync();
    interactionHandleRef.current?.labels?.sync();
  }, []);

  return { decorate, attach, onSpread };
}
