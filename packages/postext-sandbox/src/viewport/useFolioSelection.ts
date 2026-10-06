'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { resolveDebugConfig, type VDTDocument } from 'postext';
import type { FolioDocumentViewer, FolioInteraction } from 'postext-folio';
import { useSandboxDispatch, useSandboxSelector, useLayoutSource, type EditorSelection } from '../context/SandboxContext';
import { toBookSelection } from '../book/compose';
import type { StitchedBook } from '../book/stitch';
import type { ComposedBook } from '../book/types';
import { findCaretBlockIdx } from './CanvasPreview/caret';
import { createOverlaySvg } from './CanvasPreview/dom';
import { findResourceLocation } from './CanvasPreview/geometry';
import { attachPageInteraction } from './CanvasPreview/interaction';
import { drawOverlay } from './CanvasPreview/overlay';
import { usePageNavigator } from './usePageNavigator';

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

/** The rects an overlay SVG holds, as `drawOverlay` left them. */
function rectsOf(svg: SVGSVGElement): OverlayRect[] {
  const out: OverlayRect[] = [];
  for (const role of ['looseLines', 'selection', 'cursor']) {
    const g = svg.querySelector<SVGGElement>(`g[data-role="${role}"]`);
    if (!g) continue;
    const m = /matrix\(([^)]+)\)/.exec(g.getAttribute('transform') ?? '');
    const matrix = m ? (m[1]!.trim().split(/[\s,]+/).map(Number) as OverlayRect['matrix']) : null;
    for (const r of g.querySelectorAll<SVGRectElement>('rect')) {
      if (r.style.display === 'none' || r.style.visibility === 'hidden') continue;
      const w = Number(r.getAttribute('width'));
      const h = Number(r.getAttribute('height'));
      if (!(w > 0) || !(h > 0)) continue;
      out.push({ x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')), w, h, fill: r.getAttribute('fill') ?? '#000', matrix });
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
  const { chapterId: activeChapterId } = useLayoutSource();
  const editorSelection = useSandboxSelector((s) => s.selection);
  const editorFocused = useSandboxSelector((s) => s.editorFocused);
  const selectionFromViewer = useSandboxSelector((s) => s.selectionFromViewer);
  const resourceSelection = useSandboxSelector((s) => s.resourceSelection);
  const debugConfig = useSandboxSelector((s) => s.config.debug);
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const resources = useSandboxSelector((s) => s.resources);

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
  const svgRef = useRef<SVGSVGElement | null>(null);

  const decorate = useCallback((index: number, ctx: CanvasRenderingContext2D): boolean => {
    const rects = marksRef.current.get(index);
    if (!rects?.length) return false;
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
    for (const i of pages) {
      if (!doc.pages[i]) continue;
      const outside = chapterPages && (i < chapterPages.from || i >= chapterPages.to) && i !== resourcePage;
      let rects: OverlayRect[] = [];
      if (!outside) {
        drawOverlay(svg, doc, i, selection, debug, focused, caretBlockIdx, resourceSelection);
        rects = rectsOf(svg);
      }
      const key = rects.length ? JSON.stringify(rects) : '';
      if (rects.length) {
        next.set(i, rects);
        keys.set(i, key);
      }
      if ((keysRef.current.get(i) ?? '') !== key) changed.push(i);
    }
    marksRef.current = next;
    keysRef.current = keys;
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
  useEffect(() => {
    refresh();
  }, [refresh, docKey]);
  useEffect(() => () => window.clearTimeout(followTimerRef.current), []);

  /** A new viewer: its pointer selects on the pages in select and magnify
   *  modes, and
   *  the marks follow the spreads it opens. */
  const attach = useCallback((viewer: FolioDocumentViewer) => {
    const el = viewer.element;
    attachPageInteraction(el, {
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
        el.style.cursor = cursor === 'pointer' ? 'pointer' : '';
      },
      // Under the magnifying glass too: what lies at its centre (#543).
      enabled: () => interactionRef.current === 'select' || interactionRef.current === 'magnify',
      touchSelects: true,
    });
  }, [docRef, sourceRef, interactionRef, navigateRef]);

  /** The book came to rest on (or was sent to) another spread: mark the
   *  pages round it. */
  const onSpread = useCallback(() => refreshRef.current(), []);

  return { decorate, attach, onSpread };
}
