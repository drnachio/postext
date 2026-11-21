'use client';

/**
 * The cover designer's sheet: the cover laid out as the PDF is, drawn as
 * large as the room allows, with its guides over it — the edge of the
 * bleed or turn-in, the folds, scores and joints, and each zone's safe
 * area. In edit mode the movable elements can be picked, dragged and
 * resized on it: nothing snaps unless Cmd (Ctrl) is held, Shift keeps an
 * element's proportions, and Alt drags a copy, leaving the element where
 * it was. The sheet is laid out again once a drag ends; while it goes on,
 * the element's box follows the pointer.
 *
 * A shape's points are edited on it too (`points`): its nodes are dragged,
 * a node's handles shape the curves on either side (Alt moves one handle
 * alone), a double click turns a corner into a curve and back, the + in
 * the middle of a side adds a node there, and Delete takes the picked
 * node out. The box is fitted to the path again after each change.
 */

import { useEffect, useRef, useState } from 'react';
import { pathData, renderPageToCanvas, type CoverPath, type CoverPoint, type ProductionSheet, type SheetRect, type VDTDocument } from 'postext';
import { ensureConfigFontsLoaded } from '../../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../../controls/media/resourceImages.js';
import { useLayoutWorker } from '../../worker/useLayoutWorker.js';
import { handleAt, handlePoint, RESIZE_HANDLES, type Handle } from '../../templates/frameGeometry.js';
import type { coverDocumentInput } from '../model/bookProduction.js';
import { elementAt, elementRect, elementUnder, type CoverElementSetting } from '../model/coverLayers.js';
import { coverSnapLines, dragCoverRect } from './coverDrag.js';
import { registerCoverImages } from '../library/coverImages.js';
import { deleteNode, insertNode, moveHandle, moveNode, refitPath, sideMiddles, toggleCurve, type NodeRef } from './pathEditing.js';

const MM_PER_IN = 25.4;
/** Handles and the room to grab them, CSS px. */
const HANDLE_PX = 8;
/** How near an edge lines up with Cmd (Ctrl) held, CSS px. */
const SNAP_PX = 6;

/** `copy`: the drag leaves the element and drops a copy (Alt held). */
type Drag = { id: string; handle: Handle; start: SheetRect; x0: number; y0: number; moved: boolean; copy: boolean };
/** Dragging a node or one of its handles: the path as it was, and where. */
type PointDrag = { at: NodeRef; which: 'node' | 'in' | 'out'; start: CoverPath; x0: number; y0: number; moved: boolean };

export function CoverCanvas({ sheet, input, mode, elements, clearance, selected, points = false, onSelect, onChange, onDuplicate, onDelete, onLaid, label, failedLabel }: {
  sheet: ProductionSheet;
  input: ReturnType<typeof coverDocumentInput>;
  mode: 'preview' | 'edit';
  elements: readonly CoverElementSetting[];
  /** The clear space round an item (a logo's), mm: drawn dashed round it. */
  clearance?: ((id: string) => number) | undefined;
  selected: string | null;
  /** Edit the selected shape's points instead of its box. */
  points?: boolean;
  onSelect: (id: string | null) => void;
  onChange: (el: CoverElementSetting) => void;
  /** A copy of `el` dropped on `rect` (dragged with Alt). */
  onDuplicate?: (el: CoverElementSetting, rect: SheetRect) => void;
  onDelete: (id: string) => void;
  /** The sheet as laid out, each time it is (its warnings: a text that
   *  does not fit). */
  onLaid?: (doc: VDTDocument) => void;
  label: string;
  failedLabel: string;
}) {
  const { build } = useLayoutWorker('preview');
  // The latest callback, without laying the sheet out again when it changes.
  const onLaidRef = useRef(onLaid);
  onLaidRef.current = onLaid;
  const [doc, setDoc] = useState<VDTDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<SheetRect | null>(null);
  const [pdrag, setPdrag] = useState<PointDrag | null>(null);
  const [draftPath, setDraftPath] = useState<CoverPath | null>(null);
  const [picked, setPicked] = useState<NodeRef | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          await ensureConfigFontsLoaded(input.config, input.markdown);
          await registerCoverImages(input.cover.files);
          await ensureResourceImages(input.resources.filter((r) => r.id !== 'isbn-barcode'));
          const laid = await build({ markdown: input.markdown, resources: input.resources }, input.config);
          if (alive) {
            setDoc(laid);
            onLaidRef.current?.(laid);
            setFailed(false);
          }
        } catch (err) {
          if (alive && !(err instanceof DOMException && err.name === 'AbortError')) setFailed(true);
        }
      })();
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [build, input]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setRoom({ width: wrap.clientWidth, height: wrap.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const page = doc?.pages[0];
  const dpi = doc?.config.page.dpi ?? 96;
  const pageMm = page ? { width: (page.width * MM_PER_IN) / dpi, height: (page.height * MM_PER_IN) / dpi } : null;
  // The sheet's corner (the bleed's) on the laid-out page, which has room
  // for the cut marks round it.
  const offset = doc ? (doc.trimOffset * MM_PER_IN) / dpi - sheet.trim.x : 0;
  const scale = pageMm && room.width > 0 ? Math.min(room.width / pageMm.width, room.height / pageMm.height) : 0;
  const css = pageMm ? { width: pageMm.width * scale, height: pageMm.height * scale } : { width: 0, height: 0 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc || !page || scale <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    renderPageToCanvas(page, doc, canvas, { scale: (css.width * dpr) / page.width });
    canvas.style.width = `${css.width}px`;
    canvas.style.height = `${css.height}px`;
  }, [doc, page, scale, css.width, css.height]);

  /** A pointer event's place on the sheet, mm. */
  const toSheet = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale - offset, y: (e.clientY - r.top) / scale - offset };
  };
  const selectedEl = elements.find((e) => e.id === selected);
  const selectedRect = selectedEl ? (drag?.id === selectedEl.id && draft ? draft : elementRect(sheet, selectedEl)) : undefined;
  // Where the copy dragged with Alt goes, while it goes.
  const copyRect = drag?.copy && drag.moved ? draft : null;

  // The shape whose points are edited, its box and its path.
  const pointEl = points && mode === 'edit' && selectedEl?.kind === 'shape' && selectedEl.path ? selectedEl : undefined;
  const pointRect = pointEl ? elementRect(sheet, pointEl) : undefined;
  const shownPath = pointEl ? draftPath ?? pointEl.path! : undefined;
  const toFrac = (p: CoverPoint, r: SheetRect): CoverPoint => ({ x: (p.x - r.x) / r.width, y: (p.y - r.y) / r.height });
  const toMm = (p: CoverPoint, r: SheetRect): CoverPoint => ({ x: r.x + p.x * r.width, y: r.y + p.y * r.height });
  const commitPath = (path: CoverPath) => {
    if (!pointEl || !pointRect) return;
    const fit = refitPath(pointRect, path);
    onChange({ ...elementAt(sheet, pointEl, fit.rect), path: fit.path });
  };
  /** The node, handle or side middle under a point on the sheet. */
  const pointUnder = (p: CoverPoint, tol: number): { at: NodeRef; which: 'node' | 'in' | 'out' | 'side' } | null => {
    if (!shownPath || !pointRect) return null;
    const near = (q: CoverPoint) => Math.hypot(q.x - p.x, q.y - p.y) <= tol;
    for (const [s, sub] of shownPath.entries()) {
      for (const [i, n] of sub.nodes.entries()) {
        if (n.in && near(toMm(n.in, pointRect))) return { at: { sub: s, i }, which: 'in' };
        if (n.out && near(toMm(n.out, pointRect))) return { at: { sub: s, i }, which: 'out' };
      }
    }
    for (const [s, sub] of shownPath.entries()) for (const [i, n] of sub.nodes.entries()) if (near(toMm(n, pointRect))) return { at: { sub: s, i }, which: 'node' };
    for (const m of sideMiddles(shownPath)) if (near(toMm(m, pointRect))) return { at: { sub: m.sub, i: m.i }, which: 'side' };
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== 'edit' || e.button !== 0 || scale <= 0) return;
    const p = toSheet(e);
    const tol = HANDLE_PX / scale;
    if (pointEl && pointRect) {
      const hit = pointUnder(p, tol);
      if (hit?.which === 'side') {
        const next = insertNode(pointEl.path!, hit.at);
        setPicked({ sub: hit.at.sub, i: hit.at.i + 1 });
        commitPath(next);
        return;
      }
      if (hit) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setPicked(hit.at);
        setPdrag({ at: hit.at, which: hit.which, start: pointEl.path!, x0: p.x, y0: p.y, moved: false });
        return;
      }
      setPicked(null);
    }
    let target: CoverElementSetting | undefined;
    let handle: Handle | null = null;
    if (selectedEl && selectedRect && !pointEl) {
      handle = handleAt(selectedRect, p.x, p.y, tol);
      if (handle) target = selectedEl;
    }
    if (!target) {
      target = elementUnder(sheet, elements, p.x, p.y);
      handle = target ? 'move' : null;
    }
    onSelect(target?.id ?? null);
    const start = target ? elementRect(sheet, target) : undefined;
    if (!target || !handle || !start) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: target.id, handle, start, x0: p.x, y0: p.y, moved: false, copy: handle === 'move' && e.altKey && !!onDuplicate });
    setDraft(start);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pdrag && pointRect) {
      const p = toSheet(e);
      setDraftPath(pdrag.which === 'node'
        ? moveNode(pdrag.start, pdrag.at, { x: (p.x - pdrag.x0) / pointRect.width, y: (p.y - pdrag.y0) / pointRect.height })
        : moveHandle(pdrag.start, pdrag.at, pdrag.which, toFrac(p, pointRect), !e.altKey));
      if (!pdrag.moved) setPdrag({ ...pdrag, moved: true });
      return;
    }
    if (!drag) return;
    const p = toSheet(e);
    const snap = e.metaKey || e.ctrlKey ? { ...coverSnapLines(sheet), tol: SNAP_PX / scale } : undefined;
    setDraft(dragCoverRect(drag.start, drag.handle, p.x - drag.x0, p.y - drag.y0, { ...(snap ? { snap } : {}), keepAspect: e.shiftKey }));
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };
  const onPointerUp = () => {
    if (pdrag) {
      if (pdrag.moved && draftPath) commitPath(draftPath);
      setPdrag(null);
      setDraftPath(null);
      return;
    }
    const el = drag && elements.find((x) => x.id === drag.id);
    if (drag?.moved && el && draft) {
      if (drag.copy) onDuplicate?.(el, draft);
      else onChange(elementAt(sheet, el, draft));
    }
    setDrag(null);
    setDraft(null);
  };
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pointEl || scale <= 0) return;
    const hit = pointUnder(toSheet(e), HANDLE_PX / scale);
    if (hit?.which === 'node') commitPath(toggleCurve(pointEl.path!, hit.at));
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (mode !== 'edit' || !selectedEl) return;
    if (pointEl && picked && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      commitPath(deleteNode(pointEl.path!, picked));
      setPicked(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(selectedEl.id);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    const r = elementRect(sheet, selectedEl);
    if (!d || !r) return;
    e.preventDefault();
    onChange(elementAt(sheet, selectedEl, { ...r, x: r.x + d[0]!, y: r.y + d[1]! }));
  };

  const px = scale > 0 ? 1 / scale : 0;
  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {failed && <p className="m-0 p-2 text-xs text-(--slate)">{failedLabel}</p>}
      {!failed && pageMm && (
        <div className="relative shadow-lg" style={{ width: css.width, height: css.height }}>
          <canvas ref={canvasRef} className="block" />
          <svg
            ref={svgRef}
            role="application"
            aria-label={label}
            tabIndex={0}
            className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-(--brand)"
            width={css.width}
            height={css.height}
            viewBox={`0 0 ${pageMm.width} ${pageMm.height}`}
            style={{ cursor: mode === 'edit' ? (drag ? (drag.copy ? 'copy' : 'grabbing') : 'default') : 'auto', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            onDoubleClick={onDoubleClick}
          >
            <g transform={`translate(${offset} ${offset})`} fill="none" strokeWidth={px}>
              <rect x={0} y={0} width={sheet.width} height={sheet.height} stroke="#e00000" strokeDasharray={`${4 * px} ${3 * px}`} />
              {input.cover.designed && (
                // How far the design goes; past it, the mirror bleed.
                <rect x={input.cover.designed.x} y={input.cover.designed.y} width={input.cover.designed.width} height={input.cover.designed.height} stroke="#f08c00" strokeDasharray={`${6 * px} ${3 * px}`} />
              )}
              {sheet.lines.map((l, i) => (
                <line key={`l${i}`} x1={l.x} x2={l.x} y1={0} y2={sheet.height} stroke="#e4007c" />
              ))}
              {sheet.zones.map((z) => (
                <rect key={z.name} x={z.safe.x} y={z.safe.y} width={z.safe.width} height={z.safe.height} stroke="#00a0e0" strokeDasharray={`${3 * px} ${3 * px}`} />
              ))}
              {mode === 'edit' && elements.map((el) => {
                const r = drag?.id === el.id && draft && !copyRect ? draft : elementRect(sheet, el);
                if (!r) return null;
                const on = el.id === selected;
                const c = clearance?.(el.id) ?? 0;
                return (
                  <g key={el.id}>
                    {c > 0 && <rect x={r.x - c} y={r.y - c} width={r.width + 2 * c} height={r.height + 2 * c} stroke="#16a34a" strokeDasharray={`${1.5 * px} ${2 * px}`} />}
                    <rect x={r.x} y={r.y} width={r.width} height={r.height} stroke={on ? '#2563eb' : '#64748b'} strokeWidth={on ? 2 * px : px} strokeDasharray={on ? undefined : `${2 * px} ${2 * px}`} />
                  </g>
                );
              })}
              {copyRect && <rect x={copyRect.x} y={copyRect.y} width={copyRect.width} height={copyRect.height} stroke="#2563eb" strokeWidth={2 * px} strokeDasharray={`${3 * px} ${2 * px}`} />}
              {pointEl && pointRect && shownPath && (
                <g>
                  <path d={pathData(shownPath, (q) => toMm(q, pointRect))} stroke="#2563eb" strokeWidth={1.5 * px} />
                  {shownPath.flatMap((sub, s) => sub.nodes.map((n, i) => {
                    const at = toMm(n, pointRect);
                    const on = picked?.sub === s && picked.i === i;
                    const k = HANDLE_PX * px;
                    return (
                      <g key={`${s}-${i}`}>
                        {([n.in, n.out] as const).map((hnd, j) => {
                          if (!hnd) return null;
                          const q = toMm(hnd, pointRect);
                          return (
                            <g key={j}>
                              <line x1={at.x} y1={at.y} x2={q.x} y2={q.y} stroke="#2563eb" />
                              <circle cx={q.x} cy={q.y} r={k / 2.5} fill="#ffffff" stroke="#2563eb" />
                            </g>
                          );
                        })}
                        <rect x={at.x - k / 2} y={at.y - k / 2} width={k} height={k} fill={on ? '#2563eb' : '#ffffff'} stroke="#2563eb" />
                      </g>
                    );
                  }))}
                  {sideMiddles(shownPath).map((m) => {
                    const q = toMm(m, pointRect);
                    const k = HANDLE_PX * px * 0.4;
                    return (
                      <g key={`m${m.sub}-${m.i}`} stroke="#2563eb" opacity={0.75}>
                        <line x1={q.x - k} y1={q.y} x2={q.x + k} y2={q.y} />
                        <line x1={q.x} y1={q.y - k} x2={q.x} y2={q.y + k} />
                      </g>
                    );
                  })}
                </g>
              )}
              {mode === 'edit' && selectedRect && !pointEl && RESIZE_HANDLES.map((h) => {
                const p = handlePoint(selectedRect, h);
                const s = HANDLE_PX * px;
                return <rect key={h} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} fill="#ffffff" stroke="#2563eb" />;
              })}
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
