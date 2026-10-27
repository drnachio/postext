/**
 * The page-template editor on the canvas (#863). In Design mode a
 * composed page shows its template: the margins, the template's area and
 * grid, the gutter of a spread, every frame's outline with its name, and
 * an arrow for each chain (`next`). On such a page the pointer is the
 * editor's:
 *
 * - a press on a frame selects it (the Design panel opens it); dragging
 *   moves it, dragging one of the selected frame's eight handles resizes
 *   it;
 * - a drag on the page off every frame draws a new frame;
 * - the box snaps to the margins, the template grid and the other frames
 *   (Alt held: no snapping); Escape cancels;
 * - the round grip beside the selected frame's side draws a pointer
 *   (#1064): dragged onto an anchor of the picture another frame holds, it
 *   writes a connector from the frame to that anchor into the template's
 *   decoration (`setPointer`), or keeps the one already there. The frame's
 *   properties list the pointers for the keyboard.
 *
 * On release the box is written back into the template in millimetres
 * (`frameBoxPatch`). When other pages use the template too, a question on
 * the page asks whether to change the template (every page) or to make a
 * variant for this page alone (a template that extends it, which the
 * page's fence then names). A rotated frame moves but does not resize on
 * the page; the properties panel sizes it.
 *
 * Every other page, and every page outside Design mode, keeps the text
 * interaction: the listeners run in the capture phase and only take the
 * events they handle.
 */

import { type Handle, handleAt, rectBetween, dragRect, snapLines, snapRect } from '../../templates/frameGeometry.js';
import { templateEditor } from '../../templates/editorStore.js';
import { emitFrameEditorEvent } from '../../templates/frameEvents.js';
import { pickConnectorFrame, updateDecorationElement } from '../../templates/connectorEdits.js';
import { frameHitAt } from './frameHit.js';
import { frameAnchorAt } from './labelAnchorGeometry.js';
import { type Instance, type FrameEditorRefs, svgEl, pointerGripOf, GRIP_GAP_CSS_PX, GRIP_CSS_PX, dragKind, HANDLE_CSS_PX, DRAG_START_CSS_PX, ANCHOR_DROP_CSS_PX, SNAP_CSS_PX } from './frameEditor/shared.js';
import { createFrameLocate } from './frameEditor/locate.js';
import { createFramePaint } from './frameEditor/paint.js';
import { createFrameQuestion } from './frameEditor/question.js';
import { createFrameCommit } from './frameEditor/commit.js';
import type { FrameEditorState, FrameEditorLate } from './frameEditor/state.js';

export { pointerGripOf } from './frameEditor/shared.js';
export type { FrameEditorRefs } from './frameEditor/shared.js';

const live = new Set<Instance>();
let subscribed = false;

/** Bring every page's template marks up to date (after a relayout, or a
 *  change of the editor's state). */
export function syncFrameEditors(): void {
  for (const e of [...live]) {
    if (!e.slot.isConnected) live.delete(e);
    else e.paint();
  }
}

export function attachFrameEditor(slot: HTMLElement, pageIndex: number, pageWidthPx: number, pageHeightPx: number, refs: FrameEditorRefs): void {
  const frameState = {} as FrameEditorState;
  const frameLate = {} as FrameEditorLate;
  const svg = svgEl('svg', { viewBox: `0 0 ${pageWidthPx} ${pageHeightPx}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  svg.dataset.role = 'templateMarks';
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '6', overflow: 'visible' } satisfies Partial<CSSStyleDeclaration>);
  frameState.question = null;
  frameState.drag = null;
  /** The drop waiting for the template-or-variant answer. */
  frameState.pending = null;
  let handledPress = false;

  const {
    page, composed, active, sheetPerCss, locate, flowSize, flowMatrix, spreadAxis, side, dpi,
    selectedHere, geometry, focusedConnector, paintConnector, anchorsHere, gripOnSheet, sheetAt
  } = createFrameLocate({
    slot, pageIndex, pageWidthPx, pageHeightPx, refs
  });

  const {
    paint, selectFrame, fenceOfPage, writeTemplates
  } = createFramePaint({
    slot, pageIndex, refs, svg, composed, active, sheetPerCss, flowSize, flowMatrix, spreadAxis,
    side, dpi, selectedHere, geometry, paintConnector, anchorsHere, gripOnSheet, frameState,
    frameLate
  });

  const {
    closeQuestion, ask
  } = createFrameQuestion({
    slot, pageWidthPx, pageHeightPx, refs, page, paint, frameState
  });
  Object.assign(frameLate, { closeQuestion });

  const {
    commit, cursorFor
  } = createFrameCommit({
    pageIndex, refs, page, sheetPerCss, dpi, geometry, fenceOfPage, writeTemplates, ask
  });

  slot.addEventListener('pointerdown', (ev) => {
    handledPress = false;
    if (!active() || ev.button !== 0 || ev.pointerType === 'touch') return;
    if ((ev.target as Element | null)?.closest?.('[role="dialog"]')) return;
    const at = locate(ev);
    if (!at) return;
    closeQuestion();
    const picking = focusedConnector();
    if (picking?.focus.phase) {
      // Picking a connector's ends (#1063): a frame is an end, not a drag.
      ev.preventDefault();
      ev.stopImmediatePropagation();
      handledPress = true;
      const hit = frameHitAt(page(), at.x, at.y);
      if (hit) {
        const out = pickConnectorFrame(picking.el, picking.focus.phase, hit.name, ev.shiftKey);
        if (out.element !== picking.el) writeTemplates(updateDecorationElement(picking.templates, picking.focus.templateId, picking.focus.scope, picking.focus.elementId, () => out.element));
        templateEditor.focusConnector({ ...picking.focus, phase: out.phase });
        emitFrameEditorEvent({ type: 'select', pageIndex, templateId: picking.focus.templateId, frame: hit.name, frameId: hit.id });
      }
      paint();
      return;
    }
    const tol = HANDLE_CSS_PX * sheetPerCss();
    const selected = selectedHere();
    if (selected && !selected.rotate) {
      const grip = pointerGripOf(selected.rect, GRIP_GAP_CSS_PX * sheetPerCss());
      if (Math.hypot(at.x - grip.x, at.y - grip.y) <= Math.max(tol, GRIP_CSS_PX * sheetPerCss() * 1.5)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        handledPress = true;
        try { slot.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
        window.addEventListener('keydown', onEscape, true);
        frameState.drag = { pointerId: ev.pointerId, kind: 'pointer', handle: 'move', frame: selected, startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, rect: { ...selected.rect }, sheet: sheetAt(ev) ?? undefined, target: null };
        paint();
        return;
      }
    }
    const onSelected = selected && !selected.rotate ? handleAt(selected.rect, at.x, at.y, tol) : null;
    const hit = onSelected ? selected! : frameHitAt(page(), at.x, at.y);
    ev.preventDefault();
    ev.stopImmediatePropagation();
    handledPress = true;
    try { slot.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    window.addEventListener('keydown', onEscape, true);
    if (hit) {
      selectFrame(hit);
      frameState.drag = { pointerId: ev.pointerId, kind: 'frame', handle: onSelected ?? 'move', frame: hit, startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, rect: { ...hit.rect } };
    } else {
      frameState.drag = { pointerId: ev.pointerId, kind: 'draw', handle: 'se', startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, rect: { x: at.x, y: at.y, width: 0, height: 0 } };
    }
    paint();
  }, true);

  slot.addEventListener('pointermove', (ev) => {
    if (frameState.drag && ev.pointerId === frameState.drag.pointerId) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      const at = locate(ev);
      if (!at) return;
      if (!frameState.drag.started) {
        const dx = ev.clientX - frameState.drag.startClientX;
        const dy = ev.clientY - frameState.drag.startClientY;
        if (dx * dx + dy * dy < DRAG_START_CSS_PX * DRAG_START_CSS_PX) return;
        frameState.drag.started = true;
        if (frameState.drag.kind !== 'pointer') emitFrameEditorEvent({ type: 'dragStart', pageIndex, kind: dragKind(frameState.drag), handle: frameState.drag.handle, ...(frameState.drag.frame ? { frame: frameState.drag.frame.name } : {}), rect: { ...frameState.drag.rect } });
      }
      if (frameState.drag.kind === 'pointer') {
        const sheet = sheetAt(ev);
        if (!sheet) return;
        frameState.drag.sheet = sheet;
        frameState.drag.target = frameAnchorAt(anchorsHere(), sheet.x, sheet.y, ANCHOR_DROP_CSS_PX * sheetPerCss(), frameState.drag.frame?.name);
        paint();
        return;
      }
      const g = geometry();
      const raw = frameState.drag.kind === 'draw'
        ? rectBetween({ x: frameState.drag.startX, y: frameState.drag.startY }, at)
        : dragRect(frameState.drag.frame!.rect, frameState.drag.handle, at.x - frameState.drag.startX, at.y - frameState.drag.startY, 4 * sheetPerCss());
      if (g && !ev.altKey) {
        const others = g.c.frames.filter((f) => f.name !== frameState.drag!.frame?.name).map((f) => f.rect);
        const lines = snapLines(g.areas, g.area, g.grid, others);
        const handle: Handle = frameState.drag.kind === 'draw' ? (at.x >= frameState.drag.startX ? (at.y >= frameState.drag.startY ? 'se' : 'ne') : (at.y >= frameState.drag.startY ? 'sw' : 'nw')) : frameState.drag.handle;
        const snapped = snapRect(raw, handle, lines, SNAP_CSS_PX * sheetPerCss());
        frameState.drag.rect = snapped.rect;
        frameState.drag.guideX = snapped.guideX;
        frameState.drag.guideY = snapped.guideY;
      } else {
        frameState.drag.rect = raw;
        frameState.drag.guideX = undefined;
        frameState.drag.guideY = undefined;
      }
      emitFrameEditorEvent({ type: 'drag', pageIndex, kind: dragKind(frameState.drag), handle: frameState.drag.handle, ...(frameState.drag.frame ? { frame: frameState.drag.frame.name } : {}), rect: { ...frameState.drag.rect } });
      paint();
      return;
    }
    if (!active()) return;
    const at = locate(ev);
    if (!at) return;
    ev.stopImmediatePropagation();
    if (focusedConnector()?.focus.phase) {
      slot.style.cursor = frameHitAt(page(), at.x, at.y) ? 'pointer' : 'default';
      return;
    }
    const selected = selectedHere();
    const handle = selected && !selected.rotate ? handleAt(selected.rect, at.x, at.y, HANDLE_CSS_PX * sheetPerCss()) : null;
    const grip = selected && !selected.rotate ? pointerGripOf(selected.rect, GRIP_GAP_CSS_PX * sheetPerCss()) : null;
    if (grip && Math.hypot(at.x - grip.x, at.y - grip.y) <= GRIP_CSS_PX * sheetPerCss() * 1.5) {
      slot.style.cursor = 'crosshair';
      return;
    }
    slot.style.cursor = cursorFor(handle, !!frameHitAt(page(), at.x, at.y));
  }, true);

  /** Escape while dragging: the drag is dropped, nothing is written. */
  const onEscape = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || !frameState.drag) return;
    ev.stopPropagation();
    ev.preventDefault();
    const pointerId = frameState.drag.pointerId;
    if (frameState.drag.kind !== 'pointer') emitFrameEditorEvent({ type: 'cancel', pageIndex, ...(frameState.drag.frame ? { frame: frameState.drag.frame.name } : {}) });
    frameState.drag = null;
    window.removeEventListener('keydown', onEscape, true);
    try { slot.releasePointerCapture(pointerId); } catch { /* not captured */ }
    paint();
  };

  const end = (ev: PointerEvent): void => {
    if (!frameState.drag || ev.pointerId !== frameState.drag.pointerId) return;
    ev.stopImmediatePropagation();
    const d = frameState.drag;
    frameState.drag = null;
    window.removeEventListener('keydown', onEscape, true);
    try { slot.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
    if (ev.type === 'pointerup' && d.started) commit(d);
    else if (d.started && d.kind !== 'pointer') emitFrameEditorEvent({ type: 'cancel', pageIndex, ...(d.frame ? { frame: d.frame.name } : {}) });
    paint();
  };
  slot.addEventListener('pointerup', end, true);
  slot.addEventListener('pointercancel', end, true);
  // A press the editor took is not a click on the text.
  for (const type of ['click', 'mousedown', 'mouseup'] as const) {
    slot.addEventListener(type, (ev) => {
      if (!handledPress && !(frameState.drag && type === 'mousedown')) return;
      if (type === 'click') handledPress = false;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }, true);
  }

  const instance: Instance = { slot, paint };
  live.add(instance);
  if (!subscribed) {
    subscribed = true;
    templateEditor.subscribe(syncFrameEditors);
    // Escape ends the picking of a connector's ends (#1063).
    window.addEventListener('keydown', (ev) => {
      const focus = templateEditor.getSnapshot().connector;
      if (ev.key !== 'Escape' || !focus?.phase) return;
      templateEditor.focusConnector({ ...focus, phase: null });
    }, true);
  }
  paint();
}
