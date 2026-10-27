// The marks dialog's pointer and keyboard on the stage: picking, dragging
// and nudging marks, panning, and two-finger pinch (#970).
import { intrinsicOf, targetKey } from '../markStyles.js';
import { type Point, type MarkTarget, type Handle, withPoint, clamp, applyDrag, MIN_SIDE, addAnchor, labelFieldsOf, zoneAround, sameMarks, removeMark, nudge, type PictureMarks, type ZoneTarget, type MarkDrag } from '../../pictureMarks.js';
import type { PointerEvent, KeyboardEvent } from 'react';
import { touchPair, pinchZoom, scrollForFocus } from '../../stageZoom.js';
import { anchorLabelState, type MarkdownLabel, type AnchorLabelState } from '../../figureLabels.js';
import type { Resource } from 'postext';
import type { Mode } from '../../SafeAreaEditor.js';

/** What createStagePointer takes from PictureMarksDialog. */
export interface StagePointerDeps {
  resource: Resource;
  figureLabels: readonly MarkdownLabel[];
  mode: Mode;
  marks: PictureMarks;
  setMarksState: React.Dispatch<React.SetStateAction<PictureMarks>>;
  marksRef: React.RefObject<PictureMarks>;
  selAnchor: number | null;
  setSelAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  setSelZone: React.Dispatch<React.SetStateAction<ZoneTarget | null>>;
  setPlacing: React.Dispatch<React.SetStateAction<string | null>>;
  ticked: ReadonlySet<number>;
  placingRef: React.RefObject<string | null>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  zoomFocus: React.RefObject<{ fx: number; fy: number; ox: number; oy: number; } | null>;
  pan: React.RefObject<{ x: number; y: number; left: number; top: number; } | null>;
  touches: React.RefObject<Map<number, { x: number; y: number; }>>;
  pinch: React.RefObject<{ zoom: number; distance: number; fx: number; fy: number; last: number; ox: number; oy: number; } | null>;
  pinchFrame: React.RefObject<number>;
  placingAtDown: React.RefObject<string | null>;
  labelState: AnchorLabelState;
  loaded: { width: number; height: number; } | undefined;
  stageRef: React.RefObject<HTMLDivElement | null>;
  drag: React.RefObject<(MarkDrag & { before: PictureMarks; client: Point; moved: boolean; created?: "anchor" | "placed" | "avoid" | "label"; }) | null>;
  lastNudge: React.RefObject<{ key: string; at: number; } | null>;
  markEls: React.RefObject<Map<string, HTMLElement>>;
  idInputs: React.RefObject<Map<number, HTMLInputElement>>;
  addButton: React.RefObject<HTMLButtonElement | null>;
  focusNext: React.RefObject<(() => void) | null>;
  setMarks: (next: PictureMarks) => void;
  record: (before: PictureMarks) => void;
  commit: (next: PictureMarks) => void;
  tick: (indices: readonly number[], on: boolean) => void;
  zoomValue: React.RefObject<number>;
  panning: boolean;
}

export function createStagePointer(deps: StagePointerDeps) {
  const {
    resource, figureLabels, mode, marks, setMarksState, marksRef, selAnchor, setSelAnchor,
    setSelZone, setPlacing, ticked, placingRef, setZoom, viewportRef, zoomFocus, pan, touches, pinch,
    pinchFrame, placingAtDown, labelState, loaded, stageRef, drag, lastNudge, markEls, idInputs,
    addButton, focusNext, setMarks, record, commit, tick, zoomValue, panning
  } = deps;
  const intrinsic = intrinsicOf(resource) ?? loaded;
  const area = marks.safeArea;

  const pointAt = (e: { clientX: number; clientY: number }): Point => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  /** The mark under the pointer that the current mode edits. */
  const markAt = (el: HTMLElement): { target: MarkTarget; handle: Handle } | null => {
    const host = el.closest<HTMLElement>('[data-mark]');
    if (!host) return null;
    const kind = host.dataset.mark as MarkTarget['kind'];
    const editable = mode === 'safe' ? kind === 'safe'
      : mode === 'labels' ? kind === 'mouth' || kind === 'label'
        : mode === 'speakers' ? kind === 'mouth' || kind === 'head' || kind === 'face'
          : kind === 'avoid' || kind === 'bystander';
    if (!editable) return null;
    const handle = (el.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined) ?? 'move';
    const target = kind === 'safe' ? { kind } : { kind, index: Number(host.dataset.index) };
    return { target: target as MarkTarget, handle };
  };

  const select = (t: MarkTarget) => {
    if (t.kind === 'mouth' || t.kind === 'head' || t.kind === 'face' || t.kind === 'label') setSelAnchor(t.index);
    if (t.kind === 'avoid' || t.kind === 'bystander') setSelZone(t);
  };

  /** Two fingers went down (#970): they move and zoom the picture, and
   *  the press the first one made on the marks is taken back. */
  const startPinch = (e: PointerEvent<HTMLDivElement>) => {
    const v = viewportRef.current;
    const [a, b] = [...touches.current.values()];
    if (!v || !a || !b) return;
    const d = drag.current;
    drag.current = null;
    pan.current = null;
    if (d) {
      setMarks(d.before);
      setPlacing(placingAtDown.current);
    }
    const pair = touchPair(a, b);
    const box = v.getBoundingClientRect();
    pinch.current = {
      zoom: zoomValue.current,
      distance: pair.distance,
      fx: (v.scrollLeft + pair.cx - box.left) / Math.max(1, v.scrollWidth),
      fy: (v.scrollTop + pair.cy - box.top) / Math.max(1, v.scrollHeight),
      last: zoomValue.current,
      ox: pair.cx - box.left,
      oy: pair.cy - box.top,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  };
  /** The fingers moved: zoom as far apart as they are, and keep the point
   *  between them under them. The work is done once a frame, from where the
   *  fingers are then: moves come faster than renders. */
  const movePinch = () => {
    const g = pinch.current;
    const v = viewportRef.current;
    const [a, b] = [...touches.current.values()];
    if (!g || !v || !a || !b) return;
    const pair = touchPair(a, b);
    const box = v.getBoundingClientRect();
    g.last = pinchZoom(g.zoom, g.distance, pair.distance);
    g.ox = pair.cx - box.left;
    g.oy = pair.cy - box.top;
    if (pinchFrame.current) return;
    pinchFrame.current = requestAnimationFrame(() => {
      pinchFrame.current = 0;
      const now = pinch.current;
      const el = viewportRef.current;
      if (!now || !el) return;
      if (now.last !== zoomValue.current) {
        // The scroll that keeps the point under the fingers follows the
        // new size (`zoomFocus`).
        zoomFocus.current = { fx: now.fx, fy: now.fy, ox: now.ox, oy: now.oy };
        setZoom(now.last);
        return;
      }
      const at = scrollForFocus(now.fx, now.fy, now.ox, now.oy, { width: el.scrollWidth, height: el.scrollHeight });
      el.scrollLeft = at.left;
      el.scrollTop = at.top;
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        startPinch(e);
        return;
      }
      // A third finger is nobody's.
      if (touches.current.size > 2) {
        e.preventDefault();
        return;
      }
    }
    placingAtDown.current = placingRef.current;
    // The hand tool, Space held down or the middle button move the zoomed
    // picture instead of the marks (#956).
    const v = viewportRef.current;
    if (v && (e.button === 1 || (e.button === 0 && panning))) {
      pan.current = { x: e.clientX, y: e.clientY, left: v.scrollLeft, top: v.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const p = pointAt(e);
    const before = marksRef.current;
    // While a name is being placed, a click places it even on a point (the
    // names of a dense map stand close together); with none, a point under
    // the pointer is grabbed.
    const hit = mode === 'labels' && placingRef.current ? null : markAt(e.target as HTMLElement);
    const base = { before, client: { x: e.clientX, y: e.clientY }, moved: false, origin: p };
    // Shift- or Ctrl-click on a point ticks it for a change of several at
    // once (#931) and does not move it.
    if (mode === 'labels' && hit && hit.target.kind === 'mouth' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      const index = hit.target.index;
      tick([index], !ticked.has(index));
      setSelAnchor(index);
      e.preventDefault();
      return;
    }
    if (hit && hit.target.kind === 'label' && !before.anchors[hit.target.index]?.labelAt) {
      // The grip of a label still at its point (#1064): the label follows
      // the pointer from here, away from its point.
      select(hit.target);
      const start = withPoint(before, hit.target, p);
      drag.current = { ...base, ...hit, start, created: 'label' };
    } else if (hit) {
      select(hit.target);
      drag.current = { ...base, ...hit, start: before };
    } else if (mode === 'safe') {
      // Outside the rectangle: draw a new one from here (its far corner
      // follows the pointer).
      const from = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), width: 0, height: 0 };
      drag.current = { ...base, target: { kind: 'safe' }, handle: 'se', start: before, from };
      setMarks(applyDrag(drag.current, { x: p.x + MIN_SIDE, y: p.y + MIN_SIDE }));
    } else if (mode === 'speakers') {
      // On the picture: a new speaker, its mouth here (dragging moves it).
      const start = addAnchor(before, p);
      const index = start.anchors.length - 1;
      setSelAnchor(index);
      setMarks(start);
      drag.current = { ...base, target: { kind: 'mouth', index }, handle: 'move', start, created: 'anchor' };
    } else if (mode === 'labels') {
      // On the picture: a new anchor here, named by the name being placed
      // (else `anchorN`, to type), with the label fields of the anchor
      // picked before it, so a row of towns takes one style.
      const name = placingRef.current;
      const fields = labelFieldsOf(selAnchor !== null ? before.anchors[selAnchor] : undefined);
      const start = addAnchor(before, p, { ...(name && !before.anchors.some((a) => a.id === name) ? { id: name } : { prefix: 'anchor' }), fields });
      const index = start.anchors.length - 1;
      setSelAnchor(index);
      setMarks(start);
      drag.current = { ...base, target: { kind: 'mouth', index }, handle: 'move', start, created: name ? 'placed' : 'anchor' };
      if (name) {
        // On to the next name the text uses that the picture lacks.
        const waiting = anchorLabelState(start.anchors, figureLabels).waiting;
        const after = labelState.waiting.indexOf(name);
        const next = labelState.waiting.slice(after + 1).find((n) => waiting.includes(n)) ?? waiting[0] ?? null;
        setPlacing(next);
      }
    } else {
      // A new avoid zone, drawn from here.
      const index = before.avoid.length;
      const from = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), width: 0, height: 0 };
      const start = { ...before, avoid: [...before.avoid, from] };
      setSelZone({ kind: 'avoid', index });
      drag.current = { ...base, target: { kind: 'avoid', index }, handle: 'se', start, from, created: 'avoid' };
      setMarks(applyDrag(drag.current, { x: p.x + MIN_SIDE, y: p.y + MIN_SIDE }));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current) {
        movePinch();
        return;
      }
    }
    const g = pan.current;
    const v = viewportRef.current;
    if (g && v) {
      v.scrollLeft = g.left - (e.clientX - g.x);
      v.scrollTop = g.top - (e.clientY - g.y);
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < 3) return;
    d.moved = true;
    setMarks(applyDrag(d, pointAt(e)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (touches.current.delete(e.pointerId) && touches.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    pan.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.created === 'avoid' && !d.moved && d.target.kind === 'avoid') {
      // A plain click: a zone of a usable size around the point.
      const index = d.target.index;
      const zone = zoneAround(d.origin);
      setMarks({ ...marksRef.current, avoid: marksRef.current.avoid.map((r, i) => (i === index ? zone : r)) });
    }
    if (d.created === 'label' && !d.moved) {
      // A press on a label's grip without a drag leaves it at its point and
      // gives it the keyboard (the arrows set it away).
      setMarks(d.before);
      markEls.current.get(targetKey(d.target))?.focus({ preventScroll: true });
      return;
    }
    if (!sameMarks(d.before, marksRef.current)) record(d.before);
    if (d.created === 'anchor' && d.target.kind === 'mouth') {
      // Type the speaker id right away.
      const index = d.target.index;
      focusNext.current = () => {
        const input = idInputs.current.get(index);
        input?.focus();
        input?.select();
      };
      setMarksState({ ...marksRef.current });
    } else if (!d.created && e.pointerType !== 'mouse') {
      // Keep the keyboard where the finger left it.
      markEls.current.get(targetKey(d.target))?.focus({ preventScroll: true });
    }
  };

  /** Arrows nudge the focused mark (Shift: resize a rectangle, or a larger
   *  step for a point); Delete or Backspace removes it. */
  const onMarkKeyDown = (target: MarkTarget) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (target.kind === 'safe') return;
      e.preventDefault();
      commit(removeMark(marksRef.current, target));
      if (target.kind === 'mouth') setSelAnchor(null);
      if (target.kind === 'label') setSelAnchor(target.index);
      if (target.kind === 'avoid' || target.kind === 'bystander') setSelZone(null);
      focusNext.current = () =>
        target.kind === 'head' || target.kind === 'face' || target.kind === 'label'
          ? markEls.current.get(targetKey({ kind: 'mouth', index: target.index }))?.focus()
          : addButton.current?.focus();
      setMarksState({ ...marksRef.current });
      return;
    }
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    // A run of nudges on one mark is one step of Undo.
    const key = targetKey(target);
    const now = Date.now();
    if (!lastNudge.current || lastNudge.current.key !== key || now - lastNudge.current.at > 1000) record(marksRef.current);
    lastNudge.current = { key, at: now };
    setMarks(nudge(marksRef.current, target, dx, dy, e.shiftKey));
  };
  return {
    intrinsic, area, onPointerDown, onPointerMove, onPointerUp, onMarkKeyDown
  };
}
