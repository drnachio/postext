'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Crop, X } from 'lucide-react';
import type { Resource, ResourceSafeArea } from 'postext';
import { normalizeSafeArea, safeAreaHeightRange, safeAreaSource } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { NumberInput } from '../../controls';
import { FieldRow } from '../../controls/FieldRow';
import { Button, IconButton, usePortalContainer } from '../../ui';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../../ui/surface';
import { useBlobObjectUrl } from './ResourcePreview';

// ---------------------------------------------------------------------------
// Safe area of a picture (`Resource.safeArea`, #442): the rectangle that
// always shows. The field sums it up over a thumbnail; the dialog draws it
// over the picture (drag to draw, move or resize; arrows and Shift+arrows on
// the focused rectangle; numeric fields) and previews the tallest and the
// shortest crop the layout may use.
// ---------------------------------------------------------------------------

/** Smallest side of the rectangle while editing (a fraction of the picture). */
const MIN_SIDE = 0.05;
/** Keyboard step (a fraction of the picture). */
const STEP = 0.01;
/** A new safe area starts centred on 60 % of the picture. */
const INITIAL: ResourceSafeArea = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => Math.round(v * 1000) / 10;

/** The picture's intrinsic size, from the resource or, failing that, the
 *  loaded image. */
function intrinsicOf(resource: Resource): { width: number; height: number } | undefined {
  if (resource.kind === 'bitmap' && resource.bitmap && resource.bitmap.width > 0 && resource.bitmap.height > 0) {
    return { width: resource.bitmap.width, height: resource.bitmap.height };
  }
  if (resource.kind === 'svg' && resource.svg?.width && resource.svg.height) {
    return { width: resource.svg.width, height: resource.svg.height };
  }
  return undefined;
}

/** `object-fit` showing `source` of a picture in a box of the same ratio
 *  (as the HTML backend sets a cropped picture). */
function croppedStyle(source: ResourceSafeArea | undefined): CSSProperties {
  if (!source) return { objectFit: 'fill' };
  const x = source.width < 1 ? (source.x / (1 - source.width)) * 100 : 0;
  const y = source.height < 1 ? (source.y / (1 - source.height)) * 100 : 0;
  return { objectFit: 'cover', objectPosition: `${x}% ${y}%` };
}

/** The rectangle `r` stretched by `handle` to the point `p`, or moved by
 *  `delta` from `start` for `'move'`, kept inside the picture. */
function dragRect(handle: Handle, start: ResourceSafeArea, p: { x: number; y: number }, delta: { x: number; y: number }): ResourceSafeArea {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + delta.x, 0, 1 - start.width),
      y: clamp(start.y + delta.y, 0, 1 - start.height),
    };
  }
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.width;
  let y1 = start.y + start.height;
  const px = clamp(p.x, 0, 1);
  const py = clamp(p.y, 0, 1);
  if (handle.includes('w')) x0 = Math.min(px, x1 - MIN_SIDE);
  if (handle.includes('e')) x1 = Math.max(px, x0 + MIN_SIDE);
  if (handle.includes('n')) y0 = Math.min(py, y1 - MIN_SIDE);
  if (handle.includes('s')) y1 = Math.max(py, y0 + MIN_SIDE);
  x0 = clamp(x0, 0, 1 - MIN_SIDE);
  y0 = clamp(y0, 0, 1 - MIN_SIDE);
  x1 = clamp(x1, MIN_SIDE, 1);
  y1 = clamp(y1, MIN_SIDE, 1);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The rectangle the shown picture `r` outlines, in % of its box. */
function boxStyle(r: ResourceSafeArea): CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}

interface SafeAreaFieldProps {
  resource: Resource;
  onChange: (safeArea: ResourceSafeArea | undefined) => void;
}

/** The "Safe area" field of a bitmap or SVG resource. */
export function SafeAreaField({ resource, onChange }: SafeAreaFieldProps) {
  const labels = useSandboxLabels();
  const fileId = resource.kind === 'bitmap' ? resource.bitmap?.fileId : resource.svg?.fileId;
  const url = useBlobObjectUrl(fileId);
  const area = normalizeSafeArea(resource.safeArea);
  const [open, setOpen] = useState(false);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const share = (v: number) => new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 1 }).format(pct(v));

  return (
    <FieldRow stacked label={labels.resourceSafeAreaLabel} hint={labels.resourceSafeAreaHint} className="mb-0">
      <div className="flex w-full min-w-0 flex-col gap-2">
        {url && (
          <div className="relative inline-block self-start overflow-hidden rounded" style={{ maxWidth: '100%' }}>
            <img src={url} alt="" className="block" style={{ maxWidth: '100%', maxHeight: 140 }} />
            {area && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{ ...boxStyle(area), boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)', outline: '2px solid var(--brand)' }}
              />
            )}
          </div>
        )}
        <span className="text-xs text-(--slate)">
          {area
            ? labels.resourceSafeAreaSummary.replace('__w__', share(area.width)).replace('__h__', share(area.height))
            : labels.resourceSafeAreaNone}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Crop size={13} aria-hidden="true" />} disabled={!url} onClick={() => setOpen(true)}>
            {area ? labels.resourceSafeAreaEdit : labels.resourceSafeAreaMark}
          </Button>
          {area && (
            <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>
              {labels.resourceSafeAreaRemove}
            </Button>
          )}
        </div>
      </div>
      {url && (
        <SafeAreaDialog
          open={open}
          url={url}
          resource={resource}
          initial={area ?? INITIAL}
          onClose={() => setOpen(false)}
          onSave={(next) => {
            onChange(normalizeSafeArea(next));
            setOpen(false);
          }}
        />
      )}
    </FieldRow>
  );
}

interface SafeAreaDialogProps {
  open: boolean;
  url: string;
  resource: Resource;
  initial: ResourceSafeArea;
  onClose: () => void;
  onSave: (area: ResourceSafeArea) => void;
}

function SafeAreaDialog({ open, url, resource, initial, onClose, onSave }: SafeAreaDialogProps) {
  const labels = useSandboxLabels();
  const container = usePortalContainer();
  const [rect, setRect] = useState<ResourceSafeArea>(initial);
  const [loaded, setLoaded] = useState<{ width: number; height: number } | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; start: ResourceSafeArea; origin: { x: number; y: number } } | null>(null);

  // Each opening starts from the saved area.
  useEffect(() => {
    if (open) setRect(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const intrinsic = intrinsicOf(resource) ?? loaded;

  const pointAt = (e: PointerEvent): { x: number; y: number } => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = pointAt(e);
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined;
    // Outside the rectangle: draw a new one from here (its far corner
    // follows the pointer).
    const start = handle ? rect : { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), width: 0, height: 0 };
    drag.current = { handle: handle ?? 'se', start, origin: p };
    if (!handle) setRect(dragRect('se', start, { x: p.x + MIN_SIDE, y: p.y + MIN_SIDE }, { x: 0, y: 0 }));
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = pointAt(e);
    setRect(dragRect(d.handle, d.start, p, { x: p.x - d.origin.x, y: p.y - d.origin.y }));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const step = STEP;
    setRect((r) => {
      if (e.shiftKey) {
        // Shift: the right and bottom edges move (the rectangle resizes).
        const width = clamp(r.width + dx * step, MIN_SIDE, 1 - r.x);
        const height = clamp(r.height + dy * step, MIN_SIDE, 1 - r.y);
        return { ...r, width, height };
      }
      return { ...r, x: clamp(r.x + dx * step, 0, 1 - r.width), y: clamp(r.y + dy * step, 0, 1 - r.height) };
    });
  };

  /** Edit one side numerically (in %), kept inside the picture. */
  const setField = (key: keyof ResourceSafeArea, value: number) => {
    setRect((r) => {
      const v = clamp(value / 100, 0, 1);
      if (key === 'x') return { ...r, x: Math.min(v, 1 - r.width) };
      if (key === 'y') return { ...r, y: Math.min(v, 1 - r.height) };
      if (key === 'width') return { ...r, width: clamp(v, MIN_SIDE, 1 - r.x) };
      return { ...r, height: clamp(v, MIN_SIDE, 1 - r.y) };
    });
  };

  // The extreme crops, at a preview width: the tallest keeps the whole
  // height (sides cut to the safe area), the shortest the whole width.
  const PREVIEW_W = 96;
  const PREVIEW_MAX_H = 150;
  const previews = intrinsic
    ? (() => {
        const range = safeAreaHeightRange(intrinsic.width, intrinsic.height, rect, PREVIEW_W);
        return ([
          [labels.resourceSafeAreaTallest, range.max],
          [labels.resourceSafeAreaShortest, range.min],
        ] as const).map(([label, h]) => {
          const k = Math.min(1, PREVIEW_MAX_H / h);
          return {
            label,
            width: PREVIEW_W * k,
            height: h * k,
            style: croppedStyle(safeAreaSource(intrinsic.width, intrinsic.height, rect, PREVIEW_W, h)),
          };
        });
      })()
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
        <Dialog.Popup
          data-postext-popup=""
          className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
          style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(880px, calc(100vw - 32px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
        >
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: 0 }}>
              {labels.resourceSafeAreaLabel}
            </Dialog.Title>
            <IconButton label={labels.resourceSafeAreaCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
          </div>
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
            {labels.resourceSafeAreaDialogHelp}
          </Dialog.Description>

          <div className="flex flex-wrap items-start gap-4">
            {/* The picture with the rectangle over it. */}
            <div
              ref={stageRef}
              className="relative inline-block touch-none select-none overflow-hidden"
              style={{ cursor: 'crosshair', maxWidth: '100%' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                src={url}
                alt=""
                draggable={false}
                className="block"
                style={{ maxWidth: 'min(600px, 100%)', maxHeight: '55dvh' }}
                onLoad={(e) => setLoaded({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              />
              <div
                data-handle="move"
                role="group"
                tabIndex={0}
                aria-label={labels.resourceSafeAreaRectAria}
                onKeyDown={onKeyDown}
                className="absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foreground)"
                style={{ ...boxStyle(rect), cursor: 'move', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)', border: '2px solid var(--brand)' }}
              >
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    data-handle={h}
                    aria-hidden="true"
                    className="absolute h-3 w-3 rounded-sm border border-white bg-(--brand) after:absolute after:-inset-2 pt-large:after:-inset-4"
                    style={{
                      left: h.includes('w') ? -7 : h.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
                      top: h.includes('n') ? -7 : h.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
                      cursor: `${h === 'n' || h === 's' ? 'ns' : h === 'e' || h === 'w' ? 'ew' : h === 'ne' || h === 'sw' ? 'nesw' : 'nwse'}-resize`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* What the layout may do with it. */}
            {previews.length > 0 && (
              <div className="flex gap-3">
                {previews.map((p) => (
                  <figure key={p.label} className="m-0 flex flex-col items-center gap-1">
                    <img src={url} alt="" className="block rounded-sm" style={{ width: p.width, height: p.height, ...p.style }} />
                    <figcaption className="text-[11px] text-(--slate)">{p.label}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-1 min-[480px]:grid-cols-2">
            {([
              ['x', labels.resourceSafeAreaLeft, 0],
              ['y', labels.resourceSafeAreaTop, 0],
              ['width', labels.resourceSafeAreaWidth, MIN_SIDE * 100],
              ['height', labels.resourceSafeAreaHeight, MIN_SIDE * 100],
            ] as const).map(([key, label, min]) => (
              <div key={key} className="@container">
                <NumberInput label={label} value={pct(rect[key])} onChange={(v) => setField(key, v)} min={min} max={100} step={1} suffix="%" isDefault />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {labels.resourceSafeAreaCancel}
            </Button>
            <Button variant="primary" size="sm" onClick={() => onSave(rect)}>
              {labels.resourceSafeAreaSave}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
