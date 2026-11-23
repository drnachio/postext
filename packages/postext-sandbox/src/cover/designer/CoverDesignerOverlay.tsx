'use client';

/**
 * The cover designer on the sheet (#1669), the composed-page frame
 * editor's way (#863, #1495): the sheet's folds, zones and safe areas as
 * guides, every item of the design outlined; a press selects an item,
 * dragging moves it and the selected one's eight handles resize it,
 * snapping to the zones, the guides and the other items (Alt held: no
 * snapping); Escape cancels a drag. With the sheet focused the arrow keys
 * move the selected item a millimetre (ten with Shift) and Delete removes
 * it. Each drop is one step of the Sandbox's undo history.
 */

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { VDTDocument } from 'postext';
import { sheetGuides, type BuiltCover, type SheetRect } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { useEditedDesign } from '../useEditedDesign.js';
import { dragRect, handleAt, handlePoint, RESIZE_HANDLES, snapRect, type Handle, type SnapLines } from '../../templates/frameGeometry.js';
import { setCoverDesigner, useCoverDesigner } from '../coverStore.js';
import { designerItems, nudge, placeItem, removeItem, sameRef, type DesignerItem, type ItemRef } from './designerModel.js';
import { pointerMm, sheetSpace } from './sheetSpace.js';

/** Handles and snapping, in css px. */
const HANDLE_PX = 8;
const SNAP_PX = 6;
const DRAG_START_PX = 3;

interface Drag {
  ref: ItemRef;
  handle: Handle;
  start: SheetRect;
  from: { x: number; y: number };
  rect: SheetRect;
  moved: boolean;
  guideX?: number;
  guideY?: number;
}

function snapLinesOf(built: BuiltCover, items: readonly DesignerItem[], except: ItemRef): SnapLines {
  const xs: number[] = [];
  const ys: number[] = [];
  const box = (r: SheetRect) => {
    xs.push(r.x, r.x + r.width / 2, r.x + r.width);
    ys.push(r.y, r.y + r.height / 2, r.y + r.height);
  };
  for (const z of built.sheet.zones) {
    box(z.rect);
    box(z.safe);
  }
  for (const g of sheetGuides(built.sheet)) (g.orientation === 'vertical' ? xs.push(built.sheet.trim.x + g.at) : ys.push(built.sheet.trim.y + g.at));
  for (const i of items) if (i.rect && !sameRef(i, except)) box(i.rect);
  return { xs, ys };
}

export function CoverDesignerOverlay({ built, doc, cssWidth }: { built: BuiltCover; doc: VDTDocument; cssWidth: number }) {
  const labels = useSandboxLabels();
  const { design: cover, write: writeDesign } = useEditedDesign();
  const { selected } = useCoverDesigner();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const space = useMemo(() => sheetSpace(built.sheet, doc), [built.sheet, doc]);
  const items = useMemo(() => designerItems(cover, built.sheet), [cover, built.sheet]);
  const guides = useMemo(() => sheetGuides(built.sheet), [built.sheet]);
  const t = built.sheet.trim;

  const cssPerMm = cssWidth > 0 ? cssWidth / space.viewBox.width : 1;
  const mmPerPx = () => 1 / cssPerMm;
  const write = (next: typeof cover) => writeDesign(next, { merge: false });

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !svgRef.current) return;
    const p = pointerMm(space, svgRef.current.getBoundingClientRect(), e.clientX, e.clientY);
    const tol = HANDLE_PX * mmPerPx();
    const current = items.find((i) => sameRef(i, selected));
    let handle: Handle | null = current?.rect ? handleAt(current.rect, p.x, p.y, tol) : null;
    let target: DesignerItem | undefined = handle ? current : undefined;
    if (!target) {
      // The topmost item under the pointer: the last drawn.
      target = [...items].reverse().find((i) => i.rect && handleAt(i.rect, p.x, p.y, 0) === 'move');
      handle = target ? 'move' : null;
    }
    setCoverDesigner({ selected: target ? { layer: target.layer, id: target.id } : null });
    if (!target?.rect || !handle) return;
    svgRef.current.setPointerCapture(e.pointerId);
    svgRef.current.focus();
    setDrag({ ref: { layer: target.layer, id: target.id }, handle, start: target.rect, from: p, rect: target.rect, moved: false });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || !svgRef.current) return;
    const p = pointerMm(space, svgRef.current.getBoundingClientRect(), e.clientX, e.clientY);
    const per = mmPerPx();
    const dx = p.x - drag.from.x;
    const dy = p.y - drag.from.y;
    const moved = drag.moved || Math.hypot(dx, dy) > DRAG_START_PX * per;
    if (!moved) return;
    const raw = dragRect(drag.start, drag.handle, dx, dy, 1);
    const snapped = e.altKey ? { rect: raw } : snapRect(raw, drag.handle, snapLinesOf(built, items, drag.ref), SNAP_PX * per);
    setDrag({ ...drag, moved, rect: snapped.rect, ...('guideX' in snapped ? { guideX: snapped.guideX } : { guideX: undefined }), ...('guideY' in snapped ? { guideY: snapped.guideY } : { guideY: undefined }) });
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved) write(placeItem(cover, built.sheet, drag.ref, drag.rect));
    setDrag(null);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Escape') {
      if (drag) setDrag(null);
      else setCoverDesigner({ selected: null });
      e.preventDefault();
      return;
    }
    const current = items.find((i) => sameRef(i, selected));
    if (!current) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      write(removeItem(cover, current));
      setCoverDesigner({ selected: null });
      e.preventDefault();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d && current.rect) {
      writeDesign(placeItem(cover, built.sheet, current, nudge(current.rect, d[0]!, d[1]!)));
      e.preventDefault();
    }
  };

  const v = space.viewBox;
  const shown = (i: DesignerItem): SheetRect | undefined => (drag && sameRef(drag.ref, i) ? drag.rect : i.rect);
  const sel = items.find((i) => sameRef(i, selected));
  const selRect = sel ? shown(sel) : undefined;
  const handleSize = HANDLE_PX / cssPerMm;

  return (
    <svg
      ref={svgRef}
      viewBox={`${v.x} ${v.y} ${v.width} ${v.height}`}
      className="absolute inset-0 h-full w-full touch-none outline-(--brand) focus-visible:outline-2"
      tabIndex={0}
      role="application"
      aria-label={labels.coverDesignerSheet}
      aria-description={labels.coverDesignerKeys}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
      style={{ cursor: drag ? 'grabbing' : 'default' }}
    >
      <g aria-hidden="true" fill="none" vectorEffect="non-scaling-stroke">
        {guides.map((g, i) => (g.orientation === 'vertical'
          ? <line key={i} x1={t.x + g.at} x2={t.x + g.at} y1={t.y} y2={t.y + t.height} stroke={g.kind === 'safe' ? '#2b9fd6' : '#d63a8a'} strokeWidth={1} strokeDasharray={g.kind === 'safe' ? '2 2' : undefined} vectorEffect="non-scaling-stroke" opacity={0.7} />
          : <line key={i} y1={t.y + g.at} y2={t.y + g.at} x1={t.x} x2={t.x + t.width} stroke="#2b9fd6" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity={0.7} />))}
        {items.map((i) => {
          const r = shown(i);
          if (!r) return null;
          return <rect key={`${i.layer}:${i.id}`} x={r.x} y={r.y} width={r.width} height={r.height} stroke={sameRef(i, selected) ? 'var(--brand)' : '#888'} strokeWidth={sameRef(i, selected) ? 2 : 1} strokeDasharray={i.layer === 'textBoxes' ? '4 3' : i.layer === 'finishes' ? '1 2' : undefined} vectorEffect="non-scaling-stroke" />;
        })}
        {selRect && RESIZE_HANDLES.map((h) => {
          const p = handlePoint(selRect, h);
          return <rect key={h} x={p.x - handleSize / 2} y={p.y - handleSize / 2} width={handleSize} height={handleSize} fill="var(--background)" stroke="var(--brand)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
        })}
        {drag?.guideX !== undefined && <line x1={drag.guideX} x2={drag.guideX} y1={v.y} y2={v.y + v.height} stroke="var(--brand)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {drag?.guideY !== undefined && <line y1={drag.guideY} y2={drag.guideY} x1={v.x} x2={v.x + v.width} stroke="var(--brand)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </g>
    </svg>
  );
}
