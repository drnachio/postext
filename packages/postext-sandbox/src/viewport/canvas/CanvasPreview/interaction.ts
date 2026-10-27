import type { ResourceFocusTarget } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import { toChapterFocus } from './chapterFocus.js';
import { type ResourceTextHit } from './resourceHit.js';
import { createComicEditor, type BalloonTextPress } from '../../comics/comicEditing.js';
import { createFrameTools } from '../../composed/frameTools.js';
import { createLabelEditor } from '../../composed/labelAnchorEditor.js';
import { editModeNow } from '../../../editing/editMode.js';
import { selectionChapters, clearPageSelection, setPageSelection } from '../../../selection/selectionStore.js';
import { createSelectionApply } from '../../../selection/applySelection.js';
import type { PageInteractionOptions, PageInteraction, PagePointer, PageCursor } from './interaction/types.js';
import { createInteractionTargets } from './interaction/targets.js';
import type { PageInteractionState } from './interaction/state.js';

export type { PageNavigator, PagePointer, PageInteractionOptions, PageCursor, PageInteraction } from './interaction/types.js';
export { attachSlotClickHandler } from './interaction/slotClick.js';

function sameTarget(a: ResourceFocusTarget, b: ResourceFocusTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cell' && b.kind === 'cell') return a.row === b.row && a.col === b.col;
  return true;
}

export { toChapterFocus };

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
  const state = {} as PageInteractionState;
  const { locate, docRef, dispatchRef, activePanelRef, sourceRef, navigateRef, resourcesRef, pageSourceRef } = opts;
  const pagesHost = target;
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
        // A balloon's words select wherever the page's text does (#797).
        textEnabled: on,
        onDragEnd: (pointerId) => {
          try { target.releasePointerCapture(pointerId); } catch { /* not captured */ }
        },
      })
    : null;
  // A press that went to the comic tools: its click and the mouse events
  // that follow it are not the text's.
  let comicPress = false;

  // The labels of figures in Design mode (#970): their point is dragged
  // where the comic tools and the text would take the press.
  const labels = opts.labelSurface
    ? createLabelEditor({
        surface: opts.labelSurface,
        docRef,
        dispatchRef,
        ...(opts.labelsRef ? { labelsRef: opts.labelsRef } : {}),
        sourceOfPage: (page) => sourceOfPage(page),
        enabled: () => (opts.labelsEnabled ?? on)(),
        onDragEnd: (pointerId) => {
          window.removeEventListener('keydown', onLabelEscape, true);
          try { target.releasePointerCapture(pointerId); } catch { /* not captured */ }
        },
      })
    : null;
  const onLabelEscape = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || !labels?.dragging()) return;
    ev.stopPropagation();
    ev.preventDefault();
    labels.cancel();
  };
  // A press that went to the label editor: its click is not the text's.
  let labelPress = false;

  // The frames of composed pages (#864).
  const frames = opts.frameTools === false ? null : createFrameTools({
    docRef,
    dispatchRef,
    activePanelRef,
    sourceOfPage: (page) => sourceOfPage(page),
  });
  /** A press on a frame in Design mode picks it: no text is selected. */
  const designFrameAt = (at: PagePointer): boolean => editModeNow() === 'design' && frames?.frameAt(at.pageIndex, at.x, at.y) != null;

  // The page selection (#865): what a click picks, at which level, carried
  // out on the editors (the Markdown, the Design panel, the Resources
  // panel, the template editor).
  const selectionApply = createSelectionApply({
    dispatch: () => dispatchRef.current,
    activePanel: () => activePanelRef.current,
    sourceOfPage: (page) => sourceOfPage(page),
    chapters: selectionChapters,
    openFrameSlot: (page, frame) => frames?.openSlot(page, frame) ?? false,
  });

  const {
    pick, selectionLeads, resolveOffset, resolveLink, isFollowable, followLink, resolvePageTarget,
    resolveDesignImage, resolveResourceHit, focusEditor, openResource, focusResource
  } = createInteractionTargets({
    opts, locate, docRef, dispatchRef, activePanelRef, navigateRef, resourcesRef, sourceOfPage,
    frames, selectionApply, state
  });

  const DRAG_THRESHOLD_PX = 3;
  let dragAnchorOffset: number | null = null;
  let dragChapter: number | undefined;
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
  // controls play, scrub and go full screen. So do the controls of an
  // exercise (#1230): its inputs, options, dots and bar.
  const onPlayer = (ev: Event): boolean => !!(ev.target as Element | null)?.closest?.('.pt-video, .pt-ex-ui');

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
    labelPress = false;
    if (labels?.pointerDown(ev, at)) {
      labelPress = true;
      ev.preventDefault();
      try { target.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      window.addEventListener('keydown', onLabelEscape, true);
      return;
    }
    if (designFrameAt(at)) return;
    // A balloon's words select text as the body text does (#595): the
    // comic tools left the press alone.
    const balloonText = comic?.balloonText(at) ?? null;
    const resourceHit = balloonText ? null : resolveResourceHit(ev);
    const offset = balloonText ? balloonText.offset : resourceHit ? resourceHit.offset : resolveOffset(ev);
    if (offset === null) return;
    dragBalloonText = balloonText;
    dragResource = resourceHit;
    dragAnchorOffset = offset;
    dragChapter = balloonText || resourceHit ? undefined : state.offsetChapter;
    dragAnchorClient = { x: ev.clientX, y: ev.clientY };
    dragPointerId = ev.pointerId;
    dragging = false;
    lastHead = null;
    try { target.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  });

  target.addEventListener('pointermove', (ev) => {
    if (labels?.dragging()) {
      ev.preventDefault();
      labels.dragMove(ev, locate(ev));
      return;
    }
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
      const over = locate(ev);
      if (labels && ev.pointerType !== 'touch' && labels.hover(over)) {
        opts.setCursor('grab');
        return;
      }
      if (over && designFrameAt(over)) {
        opts.setCursor('pointer');
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
      // A drag selects characters: no element is picked.
      clearPageSelection();
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
    // One editor shows one chapter: a drag stays in the text it began in.
    if (state.offsetChapter !== dragChapter) return;
    if (head === lastHead) return;
    lastHead = head;
    focusEditor(dragAnchorOffset, head, false, dragChapter);
  });

  const endDrag = (ev: PointerEvent): void => {
    if (labels?.dragging()) {
      labels.pointerUp(ev, ev.type === 'pointercancel');
      return;
    }
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
  if (comic) target.addEventListener('pointerleave', () => comic.leave());
  if (labels) target.addEventListener('pointerleave', () => labels.leave());
  if (comic || labels) {
    // Text selection starts on the mouse press a pointer press turns into.
    target.addEventListener('mousedown', (ev) => {
      if (comicPress || labelPress) ev.preventDefault();
    });
  }

  target.addEventListener('click', (ev) => {
    if (labelPress) {
      labelPress = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
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
    // A text selection the reader made on these pages (the HTML preview's
    // own text) keeps the click; one in the editor (a range a page pick
    // selected there, #865) does not.
    if (sel && !sel.isCollapsed && sel.toString().length > 0 && sel.anchorNode && pagesHost.contains(sel.anchorNode)) return;
    // The page selection (#865); the second click of a double click is the
    // double click's.
    const picked = ev.detail === 2 || touchTap ? null : pick(at, ev.detail);
    if (picked && selectionLeads(picked, at) && docRef.current) {
      ev.preventDefault();
      selectionApply(picked, docRef.current);
      return;
    }
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
      const doc = docRef.current;
      navigateRef!.current!(target, doc);
      // A contents entry: the heading it lists is selected in its chapter.
      const entry = picked?.chain.findIndex((e) => e.heading !== undefined) ?? -1;
      if (picked && entry >= 0) {
        const at = { ...picked, level: entry };
        setPageSelection(at, doc, selectionApply);
        selectionApply(at, doc);
      }
      return;
    }
    // A cover picture or logo drawn by a design slot: open its resource so
    // the image can be replaced.
    if (touchTap) return;
    // A frame of a composed page, off its words (#864): the caret goes to
    // its slot (Content), or the frame is picked (Design).
    if (frames?.click(at.pageIndex, at.x, at.y)) {
      ev.preventDefault();
      return;
    }
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
    focusEditor(offset, offset, false, state.offsetChapter);
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
    // A figure's label: its anchor opens in the anchor editor (#970).
    if (labels?.dblclick(at)) {
      ev.preventDefault();
      return;
    }
    // A frame in Design mode is picked, its words not selected.
    if (frames?.dblclick(at.pageIndex, at.x, at.y)) {
      ev.preventDefault();
      return;
    }
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
    focusEditor(offset, offset, true, state.offsetChapter);
  });

  return { comic, frames, labels };
}
