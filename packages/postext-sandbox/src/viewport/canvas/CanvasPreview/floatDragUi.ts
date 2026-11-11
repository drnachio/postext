import type { Dispatch, MutableRefObject } from 'react';
import type { Resource, VDTDocument } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { SandboxLabels } from '../../../types/labels.js';
import { armedFloat, armFloatMove } from '../../../editing/floatMove.js';
import { resourceWithPin } from '../../../panels/resources/pinEdits.js';
import { citationOf, dropVerdict, floatAt, slotAt, type Citation, type DropSlot, type DropVerdict } from './floatDrag.js';
import type { PagePointer } from './interaction.js';

// ---------------------------------------------------------------------------
// Dragging a float in the canvas (the DOM half of `floatDrag.ts`). A press
// on a float's body with Alt (Option) held, or on the float «Move in the
// canvas» armed (`editing/floatMove.ts`, the way a finger does it), and a
// move past the threshold pick it up; any other press is left to the page
// (figure labels, the page selection, a table's text, links). A ghost of
// its size follows the pointer across pages and the slot under it lights
// up: in the brand colour where it may go, grey where it would come before
// its citation or further than the engine waits. Letting go on a valid
// slot stores the pin on the resource; Escape, or letting go elsewhere,
// leaves it where it was. A press let go without moving opens the resource.
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
  /** Whether the press starts on a float the dragger may take (Alt held,
   *  or the armed float): the dragger takes the gesture. */
  pointerDown: (ev: PointerEvent, at: PagePointer) => boolean;
  /** Whether a press of the dragger is in progress. */
  active: () => boolean;
  move: (ev: PointerEvent) => void;
  /** End the gesture; `true` when it moved (the click that follows is the
   *  dragger's). */
  up: (ev: PointerEvent, cancelled: boolean) => boolean;
  /** Whether a float the dragger would take is under the point (the
   *  `move` cursor): Alt held, or the armed float. */
  over: (at: PagePointer | null, altKey: boolean) => boolean;
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

/** The drop zone's look: theme colours, a label at the Sandbox's text
 *  size. */
export function zoneStyle(verdict: DropVerdict): Partial<CSSStyleDeclaration> {
  const ok = 'pin' in verdict;
  return {
    border: ok ? '2px solid var(--brand)' : '2px dashed var(--slate)',
    background: ok ? 'var(--brand-soft)' : 'var(--muted)',
    color: ok ? 'var(--foreground)' : 'var(--slate)',
    opacity: ok ? '1' : '0.9',
  };
}

/** The drop zone's words for a verdict. */
export function zoneText(verdict: DropVerdict, labels: SandboxLabels | undefined): string {
  if (!labels) return '';
  if ('pin' in verdict) return labels.canvasFloatDropHere;
  return verdict.refused === 'tooFar' ? labels.canvasFloatDropTooFar : labels.canvasFloatDropBeforeCitation;
}

export function createFloatDragger(opts: FloatDragOptions): FloatDragger {
  let press: {
    resourceId: string;
    client: { x: number; y: number };
    size: { w: number; h: number };
    pointerId: number;
    /** Where the float is cited, read once when the press starts. */
    cite: Citation | null;
  } | null = null;
  let moved = false;
  let ghost: HTMLDivElement | null = null;
  let zone: HTMLDivElement | null = null;
  let target: { slot: DropSlot; verdict: DropVerdict } | null = null;
  /** Escape is listened for while a float is carried. */
  let listening = false;

  const clear = () => {
    ghost?.remove();
    zone?.remove();
    ghost = null;
    zone = null;
    target = null;
    if (listening) window.removeEventListener('keydown', onKey, true);
    listening = false;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !press) return;
    e.preventDefault();
    e.stopPropagation();
    clear();
    press = null;
    moved = false;
    armFloatMove(null);
  };

  const div = (style: Partial<CSSStyleDeclaration>): HTMLDivElement => {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483000', boxSizing: 'border-box' }, style);
    document.body.appendChild(el);
    return el;
  };

  /** The float under `at` the dragger may take, with Alt held or not. */
  const takeable = (at: PagePointer | null, altKey: boolean) => {
    const doc = opts.docRef.current;
    if (!doc || !at) return null;
    const b = floatAt(doc, at.pageIndex, at.x, at.y);
    const id = b?.resourceBlock?.resource.id;
    if (!b || !id || !opts.resourcesRef?.current?.some((r) => r.id === id)) return null;
    if (!altKey && armedFloat() !== id) return null;
    return { b, id, doc };
  };

  return {
    pointerDown(ev, at) {
      const hit = takeable(at, ev.altKey);
      if (!hit) return false;
      press = {
        resourceId: hit.id,
        client: { x: ev.clientX, y: ev.clientY },
        size: { w: hit.b.bbox.width, h: hit.b.bbox.height },
        pointerId: ev.pointerId,
        cite: citationOf(hit.doc, hit.id),
      };
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
        listening = true;
      }
      ev.preventDefault();
      const under = pageUnder(doc, ev.clientX, ev.clientY);
      const scale = under ? under.rect.width / doc.pages[under.at.pageIndex]!.width : 1;
      const w = press.size.w * scale;
      const h = press.size.h * scale;
      ghost ??= div({ border: '2px dashed var(--brand)', background: 'var(--brand-soft)', borderRadius: '2px' });
      Object.assign(ghost.style, { width: `${w}px`, height: `${h}px`, left: `${ev.clientX - w / 2}px`, top: `${ev.clientY - h / 2}px` });
      const slot = under ? slotAt(doc, under.at.pageIndex, under.at.x, under.at.y, press.size.h) : null;
      if (!under || !slot) {
        zone?.remove();
        zone = null;
        target = null;
        return;
      }
      const verdict = dropVerdict(doc, press.cite, slot);
      target = { slot, verdict };
      zone ??= div({ borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2px 4px', font: '600 13px/1.3 system-ui, sans-serif' });
      Object.assign(zone.style, {
        left: `${under.rect.left + slot.zone.x * scale}px`,
        top: `${under.rect.top + slot.zone.y * scale}px`,
        width: `${slot.zone.width * scale}px`,
        height: `${slot.zone.height * scale}px`,
        ...zoneStyle(verdict),
      });
      zone.textContent = zoneText(verdict, opts.labelsRef?.current);
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
      const resource = opts.resourcesRef?.current?.find((r) => r.id === p.resourceId);
      if (!cancelled && t && 'pin' in t.verdict && resource) {
        // One drop, one step of the undo history (#899).
        opts.dispatchRef.current({
          type: 'UPSERT_RESOURCE',
          payload: resourceWithPin(resource, t.verdict.pin),
          history: { merge: false },
        });
        armFloatMove(null);
      }
      return true;
    },
    over(at, altKey) {
      return takeable(at, altKey) !== null;
    },
  };
}
