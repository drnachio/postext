/**
 * The labels of a figure on the canvas, in Design mode (#866). Every
 * label drawn on a page shows its box (`VDTFigureLabel.rect`, red when it
 * still overflows its width) and, for a label set at an anchor of its
 * picture, the anchor's point. Dragging the point (or the label) moves the
 * anchor: on release the point goes back through the picture's crop and
 * size to fractions of the whole picture and is written onto
 * `resource.anchors`, one step of the undo history. A click without a drag
 * opens the picture in the Resources panel; a double click opens its anchor
 * editor on that anchor.
 *
 * A label set away from its point (`ResourceAnchor.labelAt`, #1064) shows a
 * line to its point; dragging it moves where it stands (`labelAt`), not the
 * anchor. Alt held while dragging a label at its point sets it away the
 * same way.
 *
 * A label placed by percentages (`at="x% y%"`) moves the same way, and
 * its drop rewrites the `at` value in the Markdown of the edition on
 * screen (#931): the percentages are the edition's own words. Outside
 * Design mode nothing is drawn and the pointer is the text's (a click
 * selects the label's text, #865).
 *
 * The editor itself (`createLabelEditor`) knows nothing of the page it sits
 * on: a surface paints its marks and says how big a CSS pixel is there, and
 * the host feeds it the pointer. The Canvas and the HTML previews give each
 * page element one (`attachLabelAnchorEditor`: listeners in the capture
 * phase before the page-template editor's, which take only the presses that
 * land on a label); the Folio gives its pages one through
 * `attachPageInteraction` (#970), painting the marks into the page's
 * texture.
 */

import type { VDTDocument } from 'postext';
import { editModeNow, onEditModeChange } from '../../editing/editMode.js';
import { requestAnchorEditor } from '../../panels/resources/marks/anchorEditorRequest.js';
import { type PageLabel, labelsOnPage, labelAt } from './labelAnchorGeometry.js';
import { labelKey, labelMarkShapes, type MarkShape, paintShapesSvg } from './labelMarks.js';
import { dropLabel, openLabelPicture } from './labelAnchorEditor/edits.js';
import { pointGrabCssPx, dragStartCssPx, SVG_NS, touchPads } from './labelAnchorEditor/touch.js';
import type { LabelEditor, LabelEditorOptions, Drag, LabelAnchorEditorRefs, LabelPoint } from './labelAnchorEditor/types.js';

export { pointGrabCssPx, dragStartCssPx, touchPads } from './labelAnchorEditor/touch.js';
export type { TouchPad } from './labelAnchorEditor/touch.js';
export type { LabelAnchorEditorRefs, LabelPoint, LabelSurface, LabelEditorOptions, LabelPointer, LabelEditor } from './labelAnchorEditor/types.js';
export { withAnchorMoved, withLabelAtMoved, percentPlace, percentMoveEdit, dropLabel, openLabelPicture } from './labelAnchorEditor/edits.js';

const live = new Set<LabelEditor>();
let subscribed = false;
/** The label last pressed (its stable id, else block id + text start). */
let activeKey: string | null = null;

const keyOf = labelKey;

/** Bring every page's label marks up to date (a relayout, a mode switch). */
export function syncLabelAnchorEditors(): void {
  for (const e of [...live]) e.sync();
}

/** Paint again every page's marks, with the labels as they are. */
function repaintLabelEditors(): void {
  for (const e of [...live]) e.repaint();
}

/**
 * The label editor of a surface (#970): the hit test, the hover, the drag
 * with its ghost, the drop and the click, for any page the host feeds it.
 * Labels are those drawn on the page in Design mode; outside it, and while
 * `enabled` says no, nothing is drawn and no press is taken.
 */
export function createLabelEditor(opts: LabelEditorOptions): LabelEditor {
  const { surface, docRef } = opts;
  const rest = new Set(opts.restPages ?? []);
  let drag: Drag | null = null;
  let hover: string | null = null;
  const cache = new Map<number, { doc: VDTDocument; labels: PageLabel[] }>();
  /** The pages the editor last painted, to hand them back. */
  const painted = new Set<number>();

  const labelsOn = (pageIndex: number): PageLabel[] => {
    const doc = docRef.current;
    if (!doc) return [];
    const hit = cache.get(pageIndex);
    if (hit?.doc === doc) return hit.labels;
    const labels = labelsOnPage(doc, pageIndex);
    cache.set(pageIndex, { doc, labels });
    return labels;
  };
  const active = (pageIndex: number): boolean => editModeNow() === 'design' && (opts.enabled?.() ?? true) && labelsOn(pageIndex).length > 0;
  const tolerance = (pageIndex: number, pointerType?: string): number => pointGrabCssPx(pointerType) * surface.sheetPxPerCssPx(pageIndex);

  /** The pages with a label of the editor's in hand. */
  const engagedPages = (): Set<number> => {
    const pages = new Set<number>();
    if (drag) pages.add(drag.pageIndex);
    for (const [pageIndex, { labels }] of cache) {
      if (hover !== null && labels.some((l) => keyOf(l) === hover)) pages.add(pageIndex);
      if (opts.keepActive && activeKey !== null && labels.some((l) => keyOf(l) === activeKey)) pages.add(pageIndex);
    }
    return pages;
  };

  const paintPage = (pageIndex: number): void => {
    const doc = docRef.current;
    if (!doc || !active(pageIndex)) {
      if (painted.delete(pageIndex) || rest.has(pageIndex)) surface.paint(pageIndex, null);
      return;
    }
    const engaged = engagedPages().has(pageIndex);
    if (!rest.has(pageIndex) && !engaged) {
      if (painted.delete(pageIndex)) surface.paint(pageIndex, null);
      return;
    }
    const words = opts.labelsRef?.current;
    painted.add(pageIndex);
    surface.paint(pageIndex, labelMarkShapes(labelsOn(pageIndex), surface.markScale?.(pageIndex) ?? surface.sheetPxPerCssPx(pageIndex), {
      hover,
      active: opts.keepActive ? activeKey : null,
      drag: drag?.started && drag.pageIndex === pageIndex ? { key: keyOf(drag.label), dx: drag.dx, dy: drag.dy, away: drag.away } : null,
    }, words ? { placedByPercent: words.labelAnchorsPlacedByPercent, overflow: words.labelAnchorsOverflow } : undefined));
  };
  const paintAll = (): void => {
    const pages = new Set<number>([...painted, ...engagedPages()]);
    for (const page of rest) pages.add(page);
    for (const page of pages) paintPage(page);
  };

  const finish = (pointerId: number): void => {
    drag = null;
    opts.onDragEnd?.(pointerId);
  };

  const editor: LabelEditor = {
    pointerDown(ev, at) {
      if (!active(at.pageIndex)) return false;
      const hit = labelAt(labelsOn(at.pageIndex), at.x, at.y, tolerance(at.pageIndex, ev.pointerType));
      if (!hit) return false;
      activeKey = keyOf(hit);
      drag = { pointerId: ev.pointerId, pointerType: ev.pointerType, label: hit, pageIndex: at.pageIndex, startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, dx: 0, dy: 0, away: !!hit.anchorPoint || (!!ev.altKey && !!hit.anchorId) };
      repaintLabelEditors();
      return true;
    },
    hover(at) {
      if (drag) return true;
      const hit = at && active(at.pageIndex) ? labelAt(labelsOn(at.pageIndex), at.x, at.y, tolerance(at.pageIndex)) : null;
      const key = hit ? keyOf(hit) : null;
      if (key !== hover) {
        const before = hover;
        hover = key;
        // The page the hover left and the one it came to.
        for (const [pageIndex, { labels }] of cache) {
          if (labels.some((l) => keyOf(l) === before || keyOf(l) === key)) paintPage(pageIndex);
        }
        if (at) paintPage(at.pageIndex);
      }
      return hit !== null;
    },
    dragging() {
      return drag !== null;
    },
    dragMove(ev, at) {
      const d = drag;
      if (!d || ev.pointerId !== d.pointerId || !at || at.pageIndex !== d.pageIndex) return;
      if (!d.started) {
        const dx = ev.clientX - d.startClientX;
        const dy = ev.clientY - d.startClientY;
        const start = dragStartCssPx(d.pointerType);
        if (dx * dx + dy * dy < start * start) return;
        d.started = true;
      }
      d.dx = at.x - d.startX;
      d.dy = at.y - d.startY;
      d.away = !!d.label.anchorPoint || (!!ev.altKey && !!d.label.anchorId);
      paintPage(d.pageIndex);
    },
    pointerUp(ev, cancelled) {
      const d = drag;
      if (!d || ev.pointerId !== d.pointerId) return;
      finish(ev.pointerId);
      if (!cancelled) {
        if (d.started) dropLabel(d.label, d.dx, d.dy, opts, d.pageIndex, d.away);
        else openLabelPicture(d.label, opts.dispatchRef);
      }
      paintPage(d.pageIndex);
    },
    dblclick(at) {
      if (!active(at.pageIndex)) return false;
      const hit = labelAt(labelsOn(at.pageIndex), at.x, at.y, tolerance(at.pageIndex));
      if (!hit?.anchorId) return false;
      requestAnchorEditor(opts.dispatchRef.current, { resourceId: hit.resourceId, anchor: hit.anchorId });
      return true;
    },
    cancel() {
      const d = drag;
      if (!d) return;
      finish(d.pointerId);
      paintPage(d.pageIndex);
    },
    leave() {
      if (hover !== null && !drag) {
        hover = null;
        paintAll();
      }
    },
    sync() {
      cache.clear();
      // The pages the editor paints are repainted from the new document;
      // the others come back through the host's next pointer.
      const doc = docRef.current;
      if (doc) for (const page of new Set([...painted, ...rest])) cache.set(page, { doc, labels: labelsOnPage(doc, page) });
      paintAll();
    },
    repaint() {
      paintAll();
    },
    dispose() {
      live.delete(editor);
      drag = null;
      for (const page of [...painted]) surface.paint(page, null);
      painted.clear();
    },
  };
  live.add(editor);
  if (!subscribed) {
    subscribed = true;
    onEditModeChange(syncLabelAnchorEditors);
  }
  return editor;
}

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** The editor of one page element of the Canvas or the HTML preview: its
 *  marks are an SVG over the page, and its listeners take the presses that
 *  land on a label before the page-template editor's. */
export function attachLabelAnchorEditor(slot: HTMLElement, pageIndex: number, pageWidthPx: number, pageHeightPx: number, refs: LabelAnchorEditorRefs): void {
  const svg = svgEl('svg', { viewBox: `0 0 ${pageWidthPx} ${pageHeightPx}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  svg.dataset.role = 'labelAnchors';
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '7', overflow: 'visible' } satisfies Partial<CSSStyleDeclaration>);
  let handledPress = false;

  // The pads of a touch screen (#992): see `TouchPad`. A mouse needs none,
  // and on a screen that also has one they would only get in its way.
  const pads = document.createElement('div');
  pads.dataset.role = 'labelPads';
  pads.setAttribute('aria-hidden', 'true');
  Object.assign(pads.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '8' } satisfies Partial<CSSStyleDeclaration>);
  const touchOnly = (): boolean => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  const syncPads = (shapes: MarkShape[] | null): void => {
    const list = shapes && touchOnly() ? touchPads(shapes, pageWidthPx, pageHeightPx) : [];
    if (list.length === 0) {
      if (pads.parentNode) pads.remove();
      return;
    }
    if (pads.parentNode !== slot) slot.appendChild(pads);
    while (pads.children.length > list.length) pads.lastChild?.remove();
    list.forEach((pad, i) => {
      let el = pads.children[i] as HTMLElement | undefined;
      if (!el) {
        el = document.createElement('div');
        Object.assign(el.style, { position: 'absolute', transform: 'translate(-50%, -50%)', touchAction: 'none', pointerEvents: 'auto' } satisfies Partial<CSSStyleDeclaration>);
        pads.appendChild(el);
      }
      el.style.left = `${pad.centerX * 100}%`;
      el.style.top = `${pad.centerY * 100}%`;
      el.style.width = `max(${pad.width * 100}%, ${pad.minCssPx}px)`;
      el.style.height = `max(${pad.height * 100}%, ${pad.minCssPx}px)`;
    });
  };

  const sheetPerCss = (): number => {
    const w = slot.getBoundingClientRect().width;
    return w > 0 ? pageWidthPx / w : 1;
  };
  const locate = (ev: MouseEvent): LabelPoint | null => {
    const r = slot.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { pageIndex, x: (ev.clientX - r.left) * (pageWidthPx / r.width), y: (ev.clientY - r.top) * (pageHeightPx / r.height) };
  };

  const onEscape = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || !editor.dragging()) return;
    ev.stopPropagation();
    ev.preventDefault();
    editor.cancel();
  };
  const editor = createLabelEditor({
    surface: {
      paint: (_page, shapes) => {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        syncPads(shapes);
        if (!shapes) {
          if (svg.parentNode) svg.remove();
          return;
        }
        if (svg.parentNode !== slot) slot.appendChild(svg);
        // A page of a spread draws its own half of a label across the
        // spine; the facing page draws the other half from its copy (#1040).
        svg.style.overflow = refs.docRef.current?.pages[pageIndex]?.composed?.spread ? 'hidden' : 'visible';
        paintShapesSvg(svg, shapes);
      },
      sheetPxPerCssPx: sheetPerCss,
    },
    docRef: refs.docRef,
    dispatchRef: refs.dispatchRef,
    ...(refs.labelsRef ? { labelsRef: refs.labelsRef } : {}),
    ...(refs.sourceOfPage ? { sourceOfPage: refs.sourceOfPage } : {}),
    restPages: [pageIndex],
    keepActive: true,
    onDragEnd: (pointerId) => {
      window.removeEventListener('keydown', onEscape, true);
      try { slot.releasePointerCapture(pointerId); } catch { /* not captured */ }
    },
  });

  slot.addEventListener('pointerdown', (ev) => {
    handledPress = false;
    if (ev.button !== 0) return;
    if ((ev.target as Element | null)?.closest?.('[role="dialog"]')) return;
    const at = locate(ev);
    if (!at || !editor.pointerDown(ev, at)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    handledPress = true;
    try { slot.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    window.addEventListener('keydown', onEscape, true);
  }, true);

  slot.addEventListener('pointermove', (ev) => {
    if (editor.dragging()) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      editor.dragMove(ev, locate(ev));
      return;
    }
    const over = editor.hover(locate(ev));
    if (over) {
      // Over a label: the template editor leaves the cursor alone.
      ev.stopImmediatePropagation();
      slot.style.cursor = 'grab';
    } else if (slot.style.cursor === 'grab') {
      slot.style.cursor = '';
    }
  }, true);

  const end = (ev: PointerEvent): void => {
    if (!editor.dragging()) return;
    ev.stopImmediatePropagation();
    editor.pointerUp(ev, ev.type !== 'pointerup');
  };
  slot.addEventListener('pointerup', end, true);
  slot.addEventListener('pointercancel', end, true);
  slot.addEventListener('pointerleave', () => editor.leave());
  // A press the editor took is not a click on the page; a double click
  // opens the picture's anchor editor on the anchor.
  for (const type of ['click', 'mousedown', 'mouseup'] as const) {
    slot.addEventListener(type, (ev) => {
      if (!handledPress) return;
      if (type === 'click') handledPress = false;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }, true);
  }
  slot.addEventListener('dblclick', (ev) => {
    const at = locate(ev);
    if (!at || !editor.dblclick(at)) return;
    ev.stopImmediatePropagation();
    ev.preventDefault();
  }, true);

  editor.sync();
}
