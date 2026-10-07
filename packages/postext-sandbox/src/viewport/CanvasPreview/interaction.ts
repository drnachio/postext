import type { Dispatch, MutableRefObject } from 'react';
import type { Resource, VDTDocument } from 'postext';
import { pageToFlow } from 'postext';
import type { PendingEditorFocus, ResourceFocusTarget, SandboxAction } from '../../context/SandboxContext';
import type { ComposedBook } from '../../book/types';
import { fromBookOffset, segmentForChapter } from '../../book/compose';
import type { PanelId } from '../../types';
import { getSvgTextIndex } from '../../controls/svgTextIndex';
import {
  designImageFileIdAtPixel,
  findLinkLocation,
  linkTargetAtPixel,
  pixelToSourceOffset,
  pageTargetAtPixel,
  type LinkTarget,
  type ResourceLocation,
} from './geometry';
import { resourceTextAtPixel, type ResourceTextHit } from './resourceHit';
import type { SandboxLabels } from '../../types/labels';
import { createComicEditor, slotComicSurface, type BalloonTextPress, type ComicEditor, type ComicSurface } from '../comics/comicEditing';

function sameTarget(a: ResourceFocusTarget, b: ResourceFocusTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cell' && b.kind === 'cell') return a.row === b.row && a.col === b.col;
  return true;
}

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

/** Map a document-offset selection to a chapter-local focus request. A
 *  drag whose head lands in another chapter is clamped to the anchor's
 *  chapter (one editor shows one chapter). */
export function toChapterFocus(
  source: ComposedBook | null,
  anchor: number,
  head: number,
  selectWord: boolean,
): PendingEditorFocus {
  if (!source || source.segments.length === 0) return { anchor, head, selectWord };
  const a = fromBookOffset(source, anchor);
  const h = fromBookOffset(source, head);
  let headLocal = h.offset;
  if (h.chapterId !== a.chapterId) {
    const seg = segmentForChapter(source, a.chapterId)!;
    headLocal = head > anchor ? seg.end - seg.start : 0;
  }
  return { chapterId: a.chapterId, anchor: a.offset, head: headLocal, selectWord };
}

/** Where a click on a row of the contents goes: the book page index the
 *  row lists, with the document it was clicked in (whose own pages need
 *  no book lookup). */
export type PageNavigator = (pageIndex: number, doc: VDTDocument) => void;

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

/** A point on a page of the document, in sheet pixels (the page's own
 *  coordinates, before any flow rotation). */
export interface PagePointer {
  pageIndex: number;
  x: number;
  y: number;
}

export interface PageInteractionOptions {
  /** The page and point under a pointer, or null off the pages. */
  locate: (ev: MouseEvent) => PagePointer | null;
  docRef: MutableRefObject<VDTDocument | null>;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  activePanelRef: MutableRefObject<PanelId | null>;
  sourceRef: MutableRefObject<ComposedBook | null>;
  navigateRef?: MutableRefObject<PageNavigator | null>;
  resourcesRef?: MutableRefObject<Resource[] | null>;
  pageSourceRef?: MutableRefObject<((pageIndex: number) => ComposedBook | null) | null>;
  /** Brings a resource or anchor of the document into view. */
  showLocation: (doc: VDTDocument, loc: ResourceLocation) => void;
  /** The cursor over the pages: `text`, `pointer` over a link, a resize
   *  cursor over a comic splitter, `move` over a comic balloon,
   *  `crosshair` over a balloon's tail tip. */
  setCursor: (cursor: PageCursor) => void;
  /** Whether the pointer is the reader's to select with now (the Folio's
   *  select mode); always, when left out. */
  enabled?: () => boolean;
  /** A finger drags a selection too (the Folio, where it never scrolls);
   *  otherwise a touch drag scrolls and a tap only follows links. */
  touchSelects?: boolean;
  /** Where the comic page tools draw (#568); with `labelsRef`, a comic
   *  page's splitters drag and its panels split and merge. */
  comicSurface?: ComicSurface;
  labelsRef?: MutableRefObject<SandboxLabels>;
  /** Whether the comic tools are on now; `enabled` when left out. */
  comicEnabled?: () => boolean;
}

/** The cursors the page interaction sets. */
export type PageCursor = 'text' | 'pointer' | 'default' | 'row-resize' | 'col-resize' | 'move' | 'crosshair';

/** What the page interaction hands back to its viewer. */
export interface PageInteraction {
  /** The comic tools, when the viewer has them. */
  comic: ComicEditor | null;
}

/**
 * The page interaction of the viewers that show the document's pages: a
 * click puts the caret in the source, a drag selects, a double click a
 * word, a click on a link follows it, on editable resource text opens its
 * resource. On a comic, the words of a balloon select as the body text
 * does (#595) while its body drags it, and a click on a panel's picture
 * opens that picture in the Resources panel (#594). `locate` says which page and point an event falls on, so a
 * single element can carry several pages (the Folio's spread).
 */
export function attachPageInteraction(target: HTMLElement, opts: PageInteractionOptions): PageInteraction {
  const { locate, docRef, dispatchRef, activePanelRef, sourceRef, navigateRef, resourcesRef, pageSourceRef } = opts;
  const on = () => opts.enabled?.() ?? true;
  // The page the drag (or the click) started on: its book maps the offsets.
  let pageIndex = -1;
  const sourceOfPage = (page = pageIndex): ComposedBook | null =>
    pageSourceRef?.current ? pageSourceRef.current(page) : sourceRef.current;

  // The comic page tools (#568, #571): a splitter or a balloon under the
  // pointer is dragged instead of the text, a panel shows its toolbar.
  const comic = opts.comicSurface && opts.labelsRef
    ? createComicEditor({
        surface: opts.comicSurface,
        docRef,
        sourceOfPage: (page) => sourceOfPage(page),
        dispatchRef,
        ...(resourcesRef ? { resourcesRef } : {}),
        labelsRef: opts.labelsRef,
        enabled: () => (opts.comicEnabled ?? on)(),
        onDragEnd: (pointerId) => {
          try { target.releasePointerCapture(pointerId); } catch { /* not captured */ }
        },
      })
    : null;
  // A press that went to the comic tools: its click and the mouse events
  // that follow it are not the text's.
  let comicPress = false;

  const resolveSheetPoint = (ev: MouseEvent): PagePointer | null => locate(ev);
  // The point in the page's flow frame, where the text, the floats and
  // the opener live: a vertical page's flow is the sheet turned a quarter
  // turn (`VDTPage.flow`), the identity elsewhere.
  const resolvePagePoint = (ev: MouseEvent): PagePointer | null => {
    const pt = resolveSheetPoint(ev);
    const page = pt ? docRef.current?.pages[pt.pageIndex] : undefined;
    return pt && page ? { pageIndex: pt.pageIndex, ...pageToFlow(page, pt.x, pt.y) } : pt;
  };

  const resolveOffset = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    return pixelToSourceOffset(doc, pt.pageIndex, pt.x, pt.y);
  };

  const resolveLink = (ev: MouseEvent): LinkTarget | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    return linkTargetAtPixel(doc, pt.pageIndex, pt.x, pt.y);
  };

  /** Whether a click here follows a link: an internal one always, a URL
   *  with Cmd/Ctrl held. */
  const isFollowable = (link: LinkTarget | null, ev: MouseEvent): boolean =>
    link !== null && (link.kind !== 'url' || ev.metaKey || ev.ctrlKey);

  /** Follow a link (#265): scroll to a target of this document, go to the
   *  chapter of an anchor or a page outside it, open a URL in a new tab.
   *  False when the link goes nowhere (a figure an earlier chapter set). */
  const followLink = (link: LinkTarget): boolean => {
    const doc = docRef.current;
    if (!doc) return false;
    if (link.kind === 'url') {
      if (!/^(?:https?|mailto|tel|ftp):/i.test(link.href)) return false;
      window.open(link.href, '_blank', 'noopener,noreferrer');
      return true;
    }
    if (link.kind === 'page') {
      if (!navigateRef?.current) return false;
      navigateRef.current(link.pageIndex, doc);
      return true;
    }
    const loc = findLinkLocation(doc, link);
    if (loc) {
      opts.showLocation(doc, loc);
      return true;
    }
    if (link.kind === 'anchor' && link.pageIndex !== undefined && navigateRef?.current) {
      navigateRef.current(link.pageIndex, doc);
      return true;
    }
    return false;
  };

  const resolvePageTarget = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    if (!doc || !navigateRef?.current) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    return pageTargetAtPixel(doc, pt.pageIndex, pt.x, pt.y);
  };

  // The resource behind an image drawn by a design slot under the pointer.
  const resolveDesignImage = (ev: MouseEvent): string | null => {
    const doc = docRef.current;
    const resources = resourcesRef?.current;
    if (!doc || !resources) return null;
    const pt = resolveSheetPoint(ev);
    if (!pt) return null;
    const fileId = designImageFileIdAtPixel(doc, pt.pageIndex, pt.x, pt.y);
    if (fileId === null) return null;
    return resources.find((r) => r.bitmap?.fileId === fileId || r.svg?.fileId === fileId || r.video?.poster?.fileId === fileId)?.id ?? null;
  };

  // Editable resource text (table cells, captions, notes, SVG text nodes) is
  // tried before the body-text mapping: an inline `::resource` block would
  // otherwise resolve to its directive line.
  const resolveResourceHit = (ev: MouseEvent): ResourceTextHit | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    return resourceTextAtPixel(doc, pt.pageIndex, pt.x, pt.y, getSvgTextIndex);
  };

  const focusEditor = (anchor: number, head: number, selectWord: boolean): void => {
    const dispatch = dispatchRef.current;
    if (activePanelRef.current !== 'markdown') {
      dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    }
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { ...toChapterFocus(sourceOfPage(), anchor, head, selectWord), fromViewer: true } });
  };

  // Open the Resources panel on a resource (no editor selection).
  const openResource = (resourceId: string): void => {
    const dispatch = dispatchRef.current;
    if (activePanelRef.current !== 'resources') {
      dispatch({ type: 'SET_PANEL', payload: 'resources' });
    }
    dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: resourceId });
  };

  // Open the Resources panel on the hit resource and hand its editor the
  // selection. The three dispatches land in one render, so `ResourceDetail`
  // mounts with the request already present.
  const focusResource = (hit: ResourceTextHit, anchor: number, head: number, selectWord: boolean): void => {
    const dispatch = dispatchRef.current;
    if (activePanelRef.current !== 'resources') {
      dispatch({ type: 'SET_PANEL', payload: 'resources' });
    }
    dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: hit.resourceId });
    dispatch({
      type: 'SET_PENDING_RESOURCE_FOCUS',
      payload: { resourceId: hit.resourceId, target: hit.target, anchor, head, selectWord },
    });
  };

  const DRAG_THRESHOLD_PX = 3;
  let dragAnchorOffset: number | null = null;
  // Set when the drag started on resource text: the head stays inside the
  // same resource run (a drag that leaves the cell keeps its last head).
  let dragResource: ResourceTextHit | null = null;
  // Set when the drag started on a comic balloon's words (#595): the head
  // stays in that balloon's words.
  let dragBalloonText: BalloonTextPress | null = null;
  // Where the last press went down: a click that ends a drag across a
  // panel's picture does not open it (#594).
  let pressClient: { x: number; y: number } | null = null;
  let dragAnchorClient: { x: number; y: number } | null = null;
  let dragPointerId: number | null = null;
  let dragging = false;
  let lastHead: number | null = null;
  let suppressNextClick = false;
  // On a touch screen a finger dragging over a page scrolls it, and a
  // single tap only follows links (refs, contents rows): opening the source
  // on every tap would cover the pages with the editor on a phone. A
  // double tap goes to the source.
  let touchTap = false;

  // A video player in the HTML preview (#454) keeps its own pointer: its
  // controls play, scrub and go full screen.
  const onPlayer = (ev: Event): boolean => !!(ev.target as Element | null)?.closest?.('.pt-video');

  target.addEventListener('pointerdown', (ev) => {
    if (!on() || onPlayer(ev)) return;
    touchTap = ev.pointerType === 'touch' && !opts.touchSelects;
    if (ev.button !== 0 || touchTap) return;
    const at = locate(ev);
    if (!at) return;
    pageIndex = at.pageIndex;
    pressClient = { x: ev.clientX, y: ev.clientY };
    if (comic?.pointerDown(ev, at)) {
      comicPress = true;
      ev.preventDefault();
      try { target.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      return;
    }
    comicPress = false;
    // A balloon's words select text as the body text does (#595): the
    // comic tools left the press alone.
    const balloonText = comic?.balloonText(at) ?? null;
    const resourceHit = balloonText ? null : resolveResourceHit(ev);
    const offset = balloonText ? balloonText.offset : resourceHit ? resourceHit.offset : resolveOffset(ev);
    if (offset === null) return;
    dragBalloonText = balloonText;
    dragResource = resourceHit;
    dragAnchorOffset = offset;
    dragAnchorClient = { x: ev.clientX, y: ev.clientY };
    dragPointerId = ev.pointerId;
    dragging = false;
    lastHead = null;
    try { target.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  });

  target.addEventListener('pointermove', (ev) => {
    if (comic?.dragging()) {
      comic.dragMove(ev, locate(ev));
      return;
    }
    if (dragPointerId === null) {
      const comicCursor = comic ? comic.hover(ev, ev.pointerType === 'touch' && !opts.touchSelects ? null : locate(ev)) : null;
      if (!on()) return;
      if (comicCursor) {
        opts.setCursor(comicCursor as PageCursor);
        return;
      }
      // Hover feedback: refs, contents rows and design images read as links.
      opts.setCursor(isFollowable(resolveLink(ev), ev) || resolvePageTarget(ev) !== null || resolveDesignImage(ev) !== null ? 'pointer' : 'text');
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
    if (dragBalloonText) {
      const head = dragBalloonText.head(locate(ev));
      if (head === null || head === lastHead) return;
      lastHead = head;
      focusEditor(dragAnchorOffset, head, false);
      return;
    }
    if (dragResource) {
      const hit = resolveResourceHit(ev);
      if (!hit || hit.resourceId !== dragResource.resourceId || !sameTarget(hit.target, dragResource.target)) return;
      if (hit.offset === lastHead) return;
      lastHead = hit.offset;
      focusResource(dragResource, dragAnchorOffset, hit.offset, false);
      return;
    }
    const head = resolveOffset(ev);
    if (head === null) return;
    if (head === lastHead) return;
    lastHead = head;
    focusEditor(dragAnchorOffset, head, false);
  });

  const endDrag = (ev: PointerEvent): void => {
    if (comic?.dragging()) {
      // A balloon pressed and let go where it was: the click is the
      // text's (the caret goes to its line).
      if (!comic.pointerUp(ev, ev.type === 'pointercancel')) comicPress = false;
      return;
    }
    if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
    const wasDragging = dragging;
    try { target.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    dragPointerId = null;
    dragAnchorOffset = null;
    dragAnchorClient = null;
    dragResource = null;
    dragBalloonText = null;
    dragging = false;
    lastHead = null;
    if (wasDragging) {
      suppressNextClick = true;
      ev.preventDefault();
    }
  };

  target.addEventListener('pointerup', endDrag);
  target.addEventListener('pointercancel', endDrag);
  if (comic) {
    target.addEventListener('pointerleave', () => comic.leave());
    // Text selection starts on the mouse press a pointer press turns into.
    target.addEventListener('mousedown', (ev) => {
      if (comicPress) ev.preventDefault();
    });
  }

  target.addEventListener('click', (ev) => {
    if (comicPress) {
      comicPress = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (suppressNextClick) {
      suppressNextClick = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.detail === 0 || !on() || onPlayer(ev)) return;
    const at = locate(ev);
    if (!at) return;
    pageIndex = at.pageIndex;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    // A click on a link — a `:ref` to a resource or an anchor, a footnote
    // marker, an index page number, a Markdown link — follows it (#265).
    // The preventDefault also stops the HTML preview's native <a href="#…">
    // from rewriting the app URL hash. A Markdown link is followed with a
    // modifier key only, so a plain click still places the caret in it.
    const link = resolveLink(ev);
    if (link !== null && isFollowable(link, ev)) {
      ev.preventDefault();
      followLink(link);
      return;
    }
    const target = resolvePageTarget(ev);
    if (target !== null && docRef.current) {
      ev.preventDefault();
      navigateRef!.current!(target, docRef.current);
      return;
    }
    // A cover picture or logo drawn by a design slot: open its resource so
    // the image can be replaced.
    if (touchTap) return;
    // A comic balloon (#571): the caret goes to the character clicked in
    // its words (#595), else to its script line.
    const balloonOffset = comic?.balloonSourceAt(at) ?? null;
    if (balloonOffset !== null) {
      ev.preventDefault();
      focusEditor(balloonOffset, balloonOffset, false);
      return;
    }
    // A comic panel's picture (#594): open it in the Resources panel, as
    // a click on a figure does; not at the end of a drag across it.
    const moved = pressClient !== null && Math.hypot(ev.clientX - pressClient.x, ev.clientY - pressClient.y) >= DRAG_THRESHOLD_PX;
    const panelArtId = moved ? null : comic?.panelArtAt(at) ?? null;
    if (panelArtId !== null) {
      ev.preventDefault();
      openResource(panelArtId);
      return;
    }
    const designImageId = resolveDesignImage(ev);
    if (designImageId !== null) {
      ev.preventDefault();
      openResource(designImageId);
      return;
    }
    const resourceHit = resolveResourceHit(ev);
    if (resourceHit) {
      ev.preventDefault();
      focusResource(resourceHit, resourceHit.offset, resourceHit.offset, false);
      return;
    }
    const offset = resolveOffset(ev);
    if (offset === null) return;
    focusEditor(offset, offset, false);
  });

  target.addEventListener('dblclick', (ev) => {
    if (onPlayer(ev)) return;
    if (!on()) return;
    const at = locate(ev);
    if (!at) return;
    if (comic?.onSplitter(at)) {
      ev.preventDefault();
      return;
    }
    pageIndex = at.pageIndex;
    // A balloon's words: the word double clicked (#595).
    const balloonText = comic?.balloonText(at) ?? null;
    if (balloonText) {
      ev.preventDefault();
      focusEditor(balloonText.offset, balloonText.offset, true);
      return;
    }
    // A panel's picture stays open in the Resources panel (#594).
    const panelArtId = comic?.panelArtAt(at) ?? null;
    if (panelArtId !== null) {
      ev.preventDefault();
      openResource(panelArtId);
      return;
    }
    const designImageId = touchTap ? resolveDesignImage(ev) : null;
    if (designImageId !== null) {
      ev.preventDefault();
      openResource(designImageId);
      return;
    }
    const resourceHit = resolveResourceHit(ev);
    if (resourceHit) {
      ev.preventDefault();
      focusResource(resourceHit, resourceHit.offset, resourceHit.offset, true);
      return;
    }
    const offset = resolveOffset(ev);
    if (offset === null) return;
    ev.preventDefault();
    focusEditor(offset, offset, true);
  });

  return { comic };
}
