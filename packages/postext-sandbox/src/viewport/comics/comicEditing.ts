/**
 * The comic page tools of the previews (#568): in the canvas, the HTML
 * pages and the Folio's select mode, a splitter (the gutter between two
 * panels) shows a resize cursor under the pointer and drags to a new
 * position, written into the page's `split` on release; a panel under the
 * pointer shows a small toolbar to split it in two or merge it with the
 * next one. Every splitter is also a focusable separator: arrow keys move
 * it, Enter writes it.
 *
 * Balloons (#571): a balloon under the pointer shows the move cursor and
 * drags (a ghost of its outline follows the pointer); on release its line
 * is pinned there (`at="x% y%"`, fractions of the panel's picture). Shift
 * keeps the drag to one axis, Escape cancels, a double click unpins, Alt
 * turns a sound effect (`rotate=`). A joined group moves whole: its first
 * line is pinned. Each group is also a focusable handle: arrow keys move
 * it, Enter pins it, Delete unpins it. While it moves, a ghost that would
 * cover a face or a zone the picture keeps clear, or run out of the panel,
 * turns orange and the tooltip says why (#580). A press on a balloon's
 * words is not a grab: it selects them in the Markdown editor, as on the
 * body text (#595; `balloonText.ts`); the balloon drags from its body
 * round them.
 *
 * A click on a panel's picture (or on the visible part of its pop-out
 * cut-out) opens that picture in the Resources panel (#594).
 *
 * Tails (#580): a balloon's tail tip shows the crosshair; dragging it
 * points the tail at the spot it is dropped on (`to="x% y%"`, fractions
 * of the picture), a double click on it points the tail back at its
 * speaker (`to` taken off). From a balloon's handle, `T` goes to its
 * tail's handle (arrow keys, Enter, Escape, Delete as for the balloon).
 *
 * Panels (#580): each panel that fills a cell is a focusable handle too:
 * `H` splits it with a horizontal line, `V` with a vertical one, `M`
 * merges it with the next; Enter opens its toolbar.
 *
 * Everything works on the strips a page holds (`:::strip`, in a column or
 * floated, #566) as on a comic page: `pageComics` puts them on the sheet,
 * and their edits go to their own fence.
 *
 * The controller is DOM-only and viewer-neutral: a `ComicSurface` says
 * where its floating parts go and paints its marks (an SVG layer over a
 * page slot, or the Folio's page decorations). The geometry is in
 * `comicDrag.ts`, the source edits in `comicSource.ts`.
 */

import type { SandboxLabels } from '../../types/labels.js';
import { splitterCursor, dragSplitter } from './comicDrag.js';
import { balloonTextNearest } from './balloonText.js';
import { boxCentre, balloonGroup, dragBalloon, turnAngle } from './balloonDrag.js';
import { tailTargetAt, isSoundEffect } from './comicEdits.js';
import { BALLOON_DRAG_THRESHOLD_PX } from './comicEditing/helpers.js';
import type { ComicEditOptions, ComicEditor } from './comicEditing/types.js';
import { createComicMarks } from './comicEditing/marks.js';
import { createComicToolbar } from './comicEditing/toolbar.js';
import { createComicEdits } from './comicEditing/edits.js';
import { createComicHandles } from './comicEditing/handles.js';
import { createTailPanelHandles } from './comicEditing/tailPanelHandles.js';
import { createHandleSync } from './comicEditing/handleSync.js';
import { createComicPointer } from './comicEditing/pointer.js';
import type { ComicEditorState, ComicEditorLate } from './comicEditing/state.js';

export type { ComicMark, ComicSurface, ComicEditOptions, BalloonTextPress, ComicPointer, ComicEditor } from './comicEditing/types.js';
export { drawMarksSvg, drawMarksCanvas, slotComicSurface } from './comicEditing/surfaces.js';

/** The tools of the page slots on show, brought up to date by
 *  `syncComicEditors` when the previews show a new layout. */
const liveEditors = new Set<{ host: HTMLElement; sync: () => void }>();
/** The tools wired on each host: a host wired again (the HTML preview
 *  rebuilds a page's inside in place) retires the earlier ones. */
const editorOfHost = new WeakMap<HTMLElement, { dispose: () => void }>();

/** Bring the splitter handles of every page on show up to date with the
 *  document their viewer shows now (after a relayout; a page slot whose
 *  layout keeps its shape is not rebuilt). */
export function syncComicEditors(): void {
  for (const e of [...liveEditors]) {
    if (!e.host.isConnected) liveEditors.delete(e);
    else e.sync();
  }
}

/**
 * Wire the comic tools on a viewer. The caller forwards the pointer events
 * it gets on the pages (`attachPageInteraction`).
 */
export function createComicEditor(opts: ComicEditOptions): ComicEditor {
  const state = {} as ComicEditorState;
  const late = {} as ComicEditorLate;
  const { surface, docRef, dispatchRef, labelsRef } = opts;
  const host = surface.host;
  editorOfHost.get(host)?.dispose();
  state.disposed = false;
  const enabled = () => !state.disposed && opts.enabled();
  const textEnabled = () => !state.disposed && (opts.textEnabled ?? opts.enabled)();
  const label = (key: keyof SandboxLabels) => labelsRef.current[key];

  state.hover = null;
  state.drag = null;
  state.key = null;
  state.focused = null;
  /** A tail tip held by the pointer. */
  state.tdrag = null;
  /** A tail moved with the arrow keys, not written yet. */
  state.tkey = null;
  /** The tail whose handle has the focus. */
  state.tfocused = null;
  /** The panel whose handle has the focus. */
  state.pfocused = null;
  /** A balloon group held by the pointer. */
  state.bdrag = null;
  /** A balloon group moved with the arrow keys, not written yet. */
  state.bkey = null;
  /** The balloon group whose handle has the focus. */
  state.bfocused = null;
  /** The last plain click on a balloon group (a second one soon after on
   *  the same group is a double click). */
  state.lastTap = null;
  /** Pages painted last, to clear when they have nothing to show. */
  const painted = new Set<number>();

  const {
    comicsOf, comicOf, minBand, tipRadius, current, dropIssues, repaint
  } = createComicMarks({
    opts, surface, docRef, painted, state
  });

  const {
    tip, showTip, hideTip, showBalloonTip, showTailTip, bar, splitRowsBtn, splitColumnsBtn, mergeBtn,
    hideBar, showBar
  } = createComicToolbar({
    opts, surface, host, label, dropIssues, state
  });

  const {
    commitLine, balloonMove, commitBalloon, tailHandlePoint, tailMove, commitTail, untail,
    unpinBalloon, panelEdit
  } = createComicEdits({
    opts, dispatchRef, comicOf, repaint, bar, splitRowsBtn, splitColumnsBtn, mergeBtn, hideBar,
    state, late
  });

  const {
    handles, hintId, hint, balloonHint, tailHintId, tailHint, panelHintId, panelHint, makeHandle,
    focusHandle, isKeyT, arrowOf, balloonHandleFor
  } = createComicHandles({
    surface, host, enabled, label, comicOf, repaint, hideTip, showBalloonTip, balloonMove,
    commitBalloon, unpinBalloon, state
  });
  Object.assign(late, { handles });

  const {
    tailHandleFor, panelHandleFor
  } = createTailPanelHandles({
    surface, enabled, label, comicOf, repaint, hideTip, showTailTip, bar, splitRowsBtn, hideBar,
    showBar, tailHandlePoint, tailMove, commitTail, untail, panelEdit, tailHintId, panelHintId,
    makeHandle, focusHandle, isKeyT, arrowOf, state
  });

  const {
    sync
  } = createHandleSync({
    opts, surface, docRef, enabled, label, comicsOf, comicOf, current, repaint, showTip, hideTip,
    commitLine, tailHandlePoint, handles, hintId, hint, balloonHint, tailHint, panelHint, makeHandle,
    balloonHandleFor, tailHandleFor, panelHandleFor, state
  });
  if (typeof queueMicrotask === 'function') queueMicrotask(sync);
  const entry = { host, sync };
  liveEditors.add(entry);
  editorOfHost.set(host, {
    dispose: () => {
      state.disposed = true;
      liveEditors.delete(entry);
      for (const el of [tip, bar, handles]) el.remove();
    },
  });
  host.addEventListener('pointerenter', sync);
  host.addEventListener('focusin', (ev) => {
    if (!handles.contains(ev.target as Node)) sync();
  });

  const {
    onKey, endDrag, endBalloonDrag, endTailDrag, hitAt, textOptions, onComicText, pressAt,
    clearHover
  } = createComicPointer({
    opts, surface, docRef, enabled, textEnabled, comicsOf, minBand, tipRadius, repaint, hideTip,
    hideBar, commitLine, commitBalloon, commitTail, untail, unpinBalloon, state
  });

  return {
    pointerDown(ev, at) {
      const hit = hitAt(at);
      if (!hit || !at) return false;
      const page = at.pageIndex;
      const grab = { x: at.x, y: at.y };
      if (hit.kind === 'tail') {
        const m = tailMove(page, hit.comic, hit.balloon);
        if (!m) return false;
        hideBar();
        sync();
        state.tdrag = { ...m, grab, pointerId: ev.pointerId, moved: false };
        window.addEventListener('keydown', onKey, true);
        repaint();
        return true;
      }
      // Balloons lie over the borders and gutters: they are grabbed before
      // the split lines.
      if (hit.kind === 'balloon') {
        // On its words, the press selects text (#595); round them, it
        // grabs the balloon.
        if (pressAt(at)?.kind === 'text') return false;
        const m = balloonMove(page, hit.comic, hit.balloon);
        if (!m) return false;
        hideBar();
        sync();
        state.bdrag = { ...m, grab, pointerId: ev.pointerId, moved: false, turning: false };
        window.addEventListener('keydown', onKey, true);
        repaint();
        return true;
      }
      if (hit.kind !== 'splitter') return false;
      const s = hit.splitter;
      hideBar();
      sync();
      state.drag = { page, comic: hit.comic, splitter: s, grab, pointerId: ev.pointerId, pos: { start: s.startPercent, end: s.endPercent }, moved: false };
      window.addEventListener('keydown', onKey, true);
      repaint();
      return true;
    },
    hover(ev, at) {
      if (!enabled() || !at) {
        clearHover();
        return null;
      }
      // Over the toolbar: keep it as it is.
      if (bar.contains(ev.target as Node)) return 'default';
      const hit = hitAt(at);
      const page = at.pageIndex;
      if (!hit) {
        clearHover();
        // A cut-out breaking a panel's border opens its picture.
        return pressAt(at)?.kind === 'art' ? 'pointer' : null;
      }
      if (hit.kind === 'tail') {
        const changed = state.hover?.page !== page || state.hover?.tail !== hit.balloon;
        state.hover = { page, tail: hit.balloon };
        hideBar();
        if (changed) repaint();
        return 'crosshair';
      }
      if (hit.kind === 'balloon') {
        const members = balloonGroup(hit.comic, hit.balloon);
        const changed = state.hover?.page !== page || state.hover?.balloons?.[0] !== members[0];
        state.hover = { page, balloons: members };
        hideBar();
        if (changed) repaint();
        // Its words select text; the rest of it drags.
        return pressAt(at)?.kind === 'text' ? 'text' : 'move';
      }
      const s = hit.kind === 'splitter' ? hit.splitter : null;
      const panel = hit.kind === 'panel' ? hit.panel : null;
      const changed = state.hover?.page !== page || state.hover?.balloons !== undefined || state.hover?.tail !== undefined || state.hover?.splitter !== (s ?? undefined) || state.hover?.panel !== (panel ?? undefined);
      state.hover = s ? { page, splitter: s } : panel ? { page, panel } : null;
      if (s) hideBar();
      else if (panel) showBar(page, hit.comic, panel);
      if (changed) repaint();
      // A panel's picture opens in the Resources panel on a click (#594).
      return s ? splitterCursor(s) : pressAt(at)?.kind === 'art' ? 'pointer' : null;
    },
    dragMove(ev, at) {
      const td = state.tdrag;
      if (td) {
        if (ev.pointerId !== td.pointerId || !at || at.pageIndex !== td.page) return;
        ev.preventDefault();
        const pointer = { x: at.x, y: at.y };
        if (!td.moved && Math.hypot(pointer.x - td.grab.x, pointer.y - td.grab.y) < BALLOON_DRAG_THRESHOLD_PX * surface.sheetPxPerCssPx(td.page)) return;
        td.moved = true;
        td.target = tailTargetAt(td.panel, pointer);
        repaint();
        showTailTip(td, pointer);
        return;
      }
      const bd = state.bdrag;
      if (bd) {
        if (ev.pointerId !== bd.pointerId || !at || at.pageIndex !== bd.page) return;
        ev.preventDefault();
        const pointer = { x: at.x, y: at.y };
        if (!bd.moved && Math.hypot(pointer.x - bd.grab.x, pointer.y - bd.grab.y) < BALLOON_DRAG_THRESHOLD_PX * surface.sheetPxPerCssPx(bd.page)) return;
        bd.moved = true;
        // Alt turns a sound effect about its centre instead of moving it.
        bd.turning = ev.altKey && bd.members.length === 1 && isSoundEffect(bd.members[0]!);
        if (bd.turning) {
          bd.delta = { x: 0, y: 0 };
          bd.rotate = turnAngle(boxCentre(bd.members[0]!.bbox), bd.grab, pointer, bd.rotate0, ev.shiftKey);
        } else {
          bd.rotate = bd.rotate0;
          bd.delta = dragBalloon(bd.centre, bd.grab, pointer, bd.panel.bbox, { axisLock: ev.shiftKey, box: bd.box });
        }
        repaint();
        showBalloonTip(bd, pointer);
        return;
      }
      const d = state.drag;
      if (!d || ev.pointerId !== d.pointerId || !at || at.pageIndex !== d.page) return;
      ev.preventDefault();
      const pos = dragSplitter(d.comic, d.splitter, d.grab, { x: at.x, y: at.y }, { snap: ev.shiftKey, oneEnd: ev.altKey });
      d.moved = d.moved || Math.abs(pos.start - d.splitter.startPercent) >= 0.05 || Math.abs(pos.end - d.splitter.endPercent) >= 0.05;
      d.pos = pos;
      repaint();
      if (d.moved) showTip(d.page, { x: at.x, y: at.y }, pos, d.splitter);
    },
    pointerUp(ev, cancel = false) {
      if (state.tdrag) {
        if (ev.pointerId !== state.tdrag.pointerId) return true;
        return endTailDrag(cancel);
      }
      if (state.bdrag) {
        if (ev.pointerId !== state.bdrag.pointerId) return true;
        return endBalloonDrag(cancel);
      }
      if (!state.drag || ev.pointerId !== state.drag.pointerId) return true;
      endDrag(cancel);
      return true;
    },
    balloonSourceAt(at) {
      const press = pressAt(at);
      if (press?.kind === 'text') return press.offset;
      return press?.kind === 'balloon' || press?.kind === 'tail' ? press.balloon.sourceStart : null;
    },
    balloonText(at) {
      const press = pressAt(at);
      if (!at || press?.kind !== 'text') return null;
      const { balloon } = press;
      const page = at.pageIndex;
      return {
        offset: press.offset,
        // The head stays in the words pressed: past them, their nearest
        // line and end.
        head: (p) => (p && p.pageIndex === page ? balloonTextNearest(balloon, p.x, p.y, textOptions(page)) : null),
      };
    },
    panelArtAt(at) {
      // A text panel's words (#885) are text: a click there places the caret.
      if (at && onComicText(at)) return null;
      const press = pressAt(at);
      return press?.kind === 'art' ? press.art.resourceId : null;
    },
    dragging: () => state.drag !== null || state.bdrag !== null || state.tdrag !== null,
    onSplitter(at) {
      return hitAt(at)?.kind === 'splitter';
    },
    leave() {
      if (state.drag || state.bdrag || state.tdrag) return;
      state.hover = null;
      // A panel whose handle has the focus keeps its toolbar.
      if (!state.pfocused) hideBar();
      if (!state.key && !state.bkey && !state.tkey) hideTip();
      repaint();
    },
    sync,
  };
}
