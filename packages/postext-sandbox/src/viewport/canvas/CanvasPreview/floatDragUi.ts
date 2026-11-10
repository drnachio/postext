import type { Dispatch, MutableRefObject } from 'react';
import type { Resource, VDTDocument } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { SandboxLabels } from '../../../types/labels.js';
import { floatAt, pinFor, slotAt, type DropSlot } from './floatDrag.js';
import type { PagePointer } from './interaction.js';

// ---------------------------------------------------------------------------
// Dragging a float in the canvas (the DOM half of `floatDrag.ts`). A press
// on a float's body and a move past the threshold pick it up: a ghost of
// its size follows the pointer, across pages, and the slot under it lights
// up — in the brand colour where it may go, grey where it would come before
// its citation. Letting go on a valid slot stores the pin on the resource
// (the layout then sets it there); Escape, or letting go elsewhere, leaves
// it where it was. A press let go without moving opens the resource.
// ---------------------------------------------------------------------------

const THRESHOLD_PX = 5;

export interface FloatDragOptions {
  docRef: MutableRefObject<VDTDocument | null>;
  resourcesRef?: MutableRefObject<Resource[] | null>;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  labelsRef?: MutableRefObject<SandboxLabels>;
  /** A press let go where it started: open the float's resource. */
  onClick: (resourceId: string) => void;
}

export interface FloatDragger {
  /** Whether the press starts on a float (the dragger takes the gesture). */
  pointerDown: (ev: PointerEvent, at: PagePointer) => boolean;
  /** Whether a press of the dragger is in progress. */
  active: () => boolean;
  move: (ev: PointerEvent) => void;
  /** End the gesture; `true` when it moved (the click that follows is the
   *  dragger's). */
  up: (ev: PointerEvent, cancelled: boolean) => boolean;
  /** Whether a float's body is under the point (the `move` cursor). */
  over: (at: PagePointer | null) => boolean;
}

/** The page under a screen point, and the point in its sheet pixels. */
function pageUnder(doc: VDTDocument, clientX: number, clientY: number): { at: PagePointer; rect: DOMRect } | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const host = (el as HTMLElement).closest?.<HTMLElement>('[data-page-index]');
    if (!host) continue;
    const pageIndex = Number(host.dataset.pageIndex);
    const page = doc.pages[pageIndex];
    const rect = host.getBoundingClientRect();
    if (!page || rect.width === 0) return null;
    return {
      at: { pageIndex, x: (clientX - rect.left) * (page.width / rect.width), y: (clientY - rect.top) * (page.height / rect.height) },
      rect,
    };
  }
  return null;
}

export function createFloatDragger(opts: FloatDragOptions): FloatDragger {
  let press: { resourceId: string; client: { x: number; y: number }; size: { w: number; h: number }; pointerId: number } | null = null;
  let moved = false;
  let ghost: HTMLDivElement | null = null;
  let zone: HTMLDivElement | null = null;
  let target: { slot: DropSlot; ok: boolean } | null = null;

  const clear = () => {
    ghost?.remove();
    zone?.remove();
    ghost = null;
    zone = null;
    target = null;
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !press) return;
    e.preventDefault();
    e.stopPropagation();
    clear();
    press = null;
    moved = false;
  };

  const div = (style: Partial<CSSStyleDeclaration>): HTMLDivElement => {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483000', boxSizing: 'border-box' }, style);
    document.body.appendChild(el);
    return el;
  };

  return {
    pointerDown(ev, at) {
      const doc = opts.docRef.current;
      if (!doc) return false;
      const b = floatAt(doc, at.pageIndex, at.x, at.y);
      const id = b?.resourceBlock?.resource.id;
      if (!b || !id || !opts.resourcesRef?.current?.some((r) => r.id === id)) return false;
      press = { resourceId: id, client: { x: ev.clientX, y: ev.clientY }, size: { w: b.bbox.width, h: b.bbox.height }, pointerId: ev.pointerId };
      moved = false;
      return true;
    },
    active: () => press !== null,
    move(ev) {
      const doc = opts.docRef.current;
      if (!press || !doc || ev.pointerId !== press.pointerId) return;
      if (!moved) {
        const dx = ev.clientX - press.client.x;
        const dy = ev.clientY - press.client.y;
        if (dx * dx + dy * dy < THRESHOLD_PX * THRESHOLD_PX) return;
        moved = true;
        window.addEventListener('keydown', onKey, true);
      }
      ev.preventDefault();
      const under = pageUnder(doc, ev.clientX, ev.clientY);
      const scale = under ? under.rect.width / doc.pages[under.at.pageIndex]!.width : 1;
      const w = press.size.w * scale;
      const h = press.size.h * scale;
      ghost ??= div({ border: '2px dashed var(--brand, #c9a227)', background: 'rgba(201, 162, 39, 0.12)', borderRadius: '2px' });
      Object.assign(ghost.style, { width: `${w}px`, height: `${h}px`, left: `${ev.clientX - w / 2}px`, top: `${ev.clientY - h / 2}px` });
      const slot = under ? slotAt(doc, under.at.pageIndex, under.at.x, under.at.y, press.size.h) : null;
      if (!under || !slot) {
        zone?.remove();
        zone = null;
        target = null;
        return;
      }
      const ok = pinFor(doc, press.resourceId, slot) !== null;
      target = { slot, ok };
      zone ??= div({ borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 11px/1.2 system-ui, sans-serif', letterSpacing: '0.02em' });
      Object.assign(zone.style, {
        left: `${under.rect.left + slot.zone.x * scale}px`,
        top: `${under.rect.top + slot.zone.y * scale}px`,
        width: `${slot.zone.width * scale}px`,
        height: `${slot.zone.height * scale}px`,
        border: ok ? '2px solid var(--brand, #c9a227)' : '2px dashed rgba(120, 120, 120, 0.9)',
        background: ok ? 'rgba(201, 162, 39, 0.22)' : 'rgba(120, 120, 120, 0.18)',
        color: ok ? 'var(--brand, #8a6d10)' : 'rgb(90, 90, 90)',
      });
      const labels = opts.labelsRef?.current;
      zone.textContent = labels ? (ok ? labels.canvasFloatDropHere : labels.canvasFloatDropBeforeCitation) : '';
    },
    up(_ev, cancelled) {
      const p = press;
      const wasMoved = moved;
      const t = target;
      clear();
      press = null;
      moved = false;
      if (!p) return false;
      if (!wasMoved) {
        if (!cancelled) opts.onClick(p.resourceId);
        return false;
      }
      const doc = opts.docRef.current;
      const resource = opts.resourcesRef?.current?.find((r) => r.id === p.resourceId);
      const pin = !cancelled && t?.ok && doc ? pinFor(doc, p.resourceId, t.slot) : null;
      if (pin && resource) {
        // One drop, one step of the undo history (#899).
        opts.dispatchRef.current({
          type: 'UPSERT_RESOURCE',
          payload: { ...resource, placement: { ...resource.placement, pin }, updatedAt: Date.now() },
          history: { merge: false },
        });
      }
      return true;
    },
    over(at) {
      const doc = opts.docRef.current;
      return !!(at && doc && floatAt(doc, at.pageIndex, at.x, at.y));
    },
  };
}
