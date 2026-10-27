// What a press on a page reaches: the selection pick, sheet and page points,
// offsets, links, design images and resources, and the editor focus they
// lead to (#1276: split out of interaction.ts).
import type { PagePointer, PageInteractionOptions, PageNavigator } from './types.js';
import { type PageSelection, pickAt } from '../../../../selection/pageSelection.js';
import { pageSelectionNow, clearPageSelection, setPageSelection, selectionChapters, type SelectionApply } from '../../../../selection/selectionStore.js';
import { editModeNow } from '../../../../editing/editMode.js';
import { chapterOfPages } from '../../../../selection/viewerSelection.js';
import { type VDTDocument, type Resource, pageToFlow, sourceAt } from 'postext';
import { pixelToSourceOffset, type LinkTarget, linkTargetAtPixel, findLinkLocation, pageTargetAtPixel, designImageFileIdAtPixel } from '../geometry.js';
import { type ResourceTextHit, resourceTextAtPixel } from '../resourceHit.js';
import { getSvgTextIndex } from '../../../../controls/media/svgTextIndex.js';
import { toChapterFocus } from '../chapterFocus.js';
import type { SandboxAction } from '../../../../context/SandboxContext/state.js';
import type { PanelId } from '../../../../types/props.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { FrameTools } from '../../../composed/frameTools.js';
import type { PageInteractionState } from './state.js';

/** What createInteractionTargets takes from the page interaction. */
export interface InteractionTargetsDeps {
  opts: PageInteractionOptions;
  locate: (ev: MouseEvent) => PagePointer | null;
  docRef: React.MutableRefObject<VDTDocument | null>;
  dispatchRef: React.MutableRefObject<React.Dispatch<SandboxAction>>;
  activePanelRef: React.MutableRefObject<PanelId | null>;
  navigateRef: React.MutableRefObject<PageNavigator | null> | undefined;
  resourcesRef: React.MutableRefObject<Resource[] | null> | undefined;
  sourceOfPage: (page?: number) => ComposedBook | null;
  frames: FrameTools | null;
  selectionApply: SelectionApply;
  state: PageInteractionState;
}

export function createInteractionTargets(deps: InteractionTargetsDeps) {
  const {
    opts, locate, docRef, dispatchRef, activePanelRef, navigateRef, resourcesRef, sourceOfPage,
    frames, selectionApply, state
  } = deps;
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
  state.offsetChapter = undefined;
  const resolveOffset = (ev: MouseEvent): number | null => {
    const doc = docRef.current;
    state.offsetChapter = undefined;
    if (!doc) return null;
    const pt = resolvePagePoint(ev);
    if (!pt) return null;
    const offset = pixelToSourceOffset(doc, pt.pageIndex, pt.x, pt.y);
    if (offset !== null && doc.pages[pt.pageIndex]?.composed) {
      const sheet = resolveSheetPoint(ev);
      const el = sheet ? sourceAt(doc, sheet.pageIndex, sheet.x, sheet.y).find((e) => e.source.kind === 'markdown') : undefined;
      if (el?.source.kind === 'markdown') state.offsetChapter = el.source.chapter;
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
  return {
    pick, selectionLeads, resolveOffset, resolveLink, isFollowable, followLink, resolvePageTarget,
    resolveDesignImage, resolveResourceHit, focusEditor, openResource, focusResource
  };
}
