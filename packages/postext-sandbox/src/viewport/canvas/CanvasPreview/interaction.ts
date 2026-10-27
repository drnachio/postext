import { pageToFlow, sourceAt } from 'postext';
import type { ResourceFocusTarget } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import { toChapterFocus } from './chapterFocus.js';
import { getSvgTextIndex } from '../../../controls/media/svgTextIndex.js';
import { pixelToSourceOffset, type LinkTarget, linkTargetAtPixel, findLinkLocation, pageTargetAtPixel, designImageFileIdAtPixel } from './geometry.js';
import { type ResourceTextHit, resourceTextAtPixel } from './resourceHit.js';
import { createComicEditor, type BalloonTextPress } from '../../comics/comicEditing.js';
import { createFrameTools } from '../../composed/frameTools.js';
import { createLabelEditor } from '../../composed/labelAnchorEditor.js';
import { editModeNow } from '../../../editing/editMode.js';
import { type PageSelection, pickAt } from '../../../selection/pageSelection.js';
import { selectionChapters, pageSelectionNow, clearPageSelection, setPageSelection } from '../../../selection/selectionStore.js';
import { createSelectionApply } from '../../../selection/applySelection.js';
import { chapterOfPages } from '../../../selection/viewerSelection.js';
import type { PageInteractionOptions, PageInteraction, PagePointer, PageCursor } from './interaction/types.js';

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
  /** Pick at a click: the innermost element, the next level up on a click
   *  again on the spot; the frame first in Design mode; the paragraph on
   *  a triple click. */
  const pick = (at: PagePointer, detail: number): PageSelection | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const now = pageSelectionNow();
    const prev = now && now.doc === doc && detail < 3 ? now.selection : null;
    let sel = pickAt(doc, at.pageIndex, at.x, at.y, prev);
    if (!sel) {
      clearPageSelection();
      return null;
    }
    if (sel.level === 0) {
      const frameAt = sel.chain.findIndex((e) => e.level === 'frame');
      const blockAt = sel.chain.findIndex((e) => e.level === 'block' || e.level === 'box');
      if (detail >= 3 && blockAt > 0) sel = { ...sel, level: blockAt };
      else if (editModeNow() === 'design' && frameAt > 0) sel = { ...sel, level: frameAt };
    }
    const chapter = chapterOfPages(sourceOfPage)(at.pageIndex);
    if (chapter !== undefined) sel = { ...sel, chapter };
    setPageSelection(sel, doc, selectionApply);
    return sel;
  };
  /** Whether a pick is carried out by the selection rather than by the
   *  viewer's own click: a level climbed to, Design mode, or what is not
   *  body text (a design element, an attribute, a figure label). */
  const selectionLeads = (sel: PageSelection, at: PagePointer): boolean => {
    if (editModeNow() === 'design') {
      // An empty frame's mark (its «Write here» box) is the frame's, though
      // the source map sees the page there.
      const frame = frames?.frameAt(at.pageIndex, at.x, at.y);
      return !frame || sel.chain.some((e) => e.id === frame.id);
    }
    if (sel.level > 0) return true;
    const el = sel.chain[0]!;
    return el.level === 'design' || el.level === 'slot' || el.level === 'attr' || el.level === 'label' || (el.level === 'text' && el.source.kind === 'attr');
  };

  const resolveSheetPoint = (ev: MouseEvent): PagePointer | null => locate(ev);
  // The point in the page's flow frame, where the text, the floats and
  // the opener live: a vertical page's flow is the sheet turned a quarter
  // turn (`VDTPage.flow`), the identity elsewhere.
  const resolvePagePoint = (ev: MouseEvent): PagePointer | null => {
    const pt = resolveSheetPoint(ev);
    const page = pt ? docRef.current?.pages[pt.pageIndex] : undefined;
    return pt && page ? { pageIndex: pt.pageIndex, ...pageToFlow(page, pt.x, pt.y) } : pt;
  };

  /** The chapter the text under the last point resolved belongs to when a
   *  story carried it in from another one (#943): its position in the
   *  book; undefined for the page's own text. */
  let offsetChapter: number | undefined;
  const resolveOffset = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    offsetChapter = undefined;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    const offset = pixelToSourceOffset(doc, pt.pageIndex, pt.x, pt.y);
    if (offset !== null && doc.pages[pt.pageIndex]?.composed) {
      const sheet = resolveSheetPoint(ev);
      const el = sheet ? sourceAt(doc, sheet.pageIndex, sheet.x, sheet.y).find((e) => e.source.kind === 'markdown') : undefined;
      if (el?.source.kind === 'markdown') offsetChapter = el.source.chapter;
    }
    return offset;
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
    return resourceTextAtPixel(doc, pt.pageIndex, pt.x, pt.y, getSvgTextIndex, sourceOfPage(pt.pageIndex)?.markdown);
  };

  const focusEditor = (anchor: number, head: number, selectWord: boolean, chapter?: number): void => {
    const dispatch = dispatchRef.current;
    if (activePanelRef.current !== 'markdown') {
      dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    }
    // Text carried in from another chapter: its offsets are that file's.
    const owner = chapter !== undefined ? selectionChapters()[chapter] : undefined;
    dispatch({
      type: 'SET_PENDING_EDITOR_FOCUS',
      payload: owner
        ? { chapterId: owner.id, anchor, head, selectWord, fromViewer: true }
        : { ...toChapterFocus(sourceOfPage(), anchor, head, selectWord), fromViewer: true },
    });
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
  // selection (words a figure gives in the Markdown go to the editor). The
  // three dispatches land in one render, so `ResourceDetail` mounts with the
  // request already present.
  const focusResource = (hit: ResourceTextHit, anchor: number, head: number, selectWord: boolean): void => {
    // Words a figure gives in the Markdown (#935) are selected there.
    if (hit.source !== undefined) {
      focusEditor(hit.source + anchor, hit.source + head, selectWord);
      return;
    }
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
    dragChapter = balloonText || resourceHit ? undefined : offsetChapter;
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
    if (offsetChapter !== dragChapter) return;
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
    focusEditor(offset, offset, false, offsetChapter);
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
    focusEditor(offset, offset, true, offsetChapter);
  });

  return { comic, frames, labels };
}
