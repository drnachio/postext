'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Scissors, Undo2, X } from 'lucide-react';
import type { Resource, ResourceSafeArea } from 'postext';
import { normalizeSafeArea } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { Button, IconButton, usePortalContainer } from '../../../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../../../ui/layout/surface.js';
import { useBlobObjectUrl } from '../ResourcePreview.js';
import { RectHandles } from './SafeAreaEditor/markHandles.js';
import { dragRect, nudgeRect, type Handle, type Point } from './pictureMarks.js';

// ---------------------------------------------------------------------------
// Manual crop of a picture (`Resource.crop`): the part of it the figure
// always shows, at that part's ratio. The field shows the picture with the
// crop over it; the dialog draws a frame to drag (move it from inside,
// resize it from its handles, draw a new one from outside it), nudge with
// the arrows (Shift resizes), undo with Cmd/Ctrl+Z, and previews the
// cropped figure. The safe area, if any, is read inside the crop.
// ---------------------------------------------------------------------------

/** Where a new crop starts: the picture less a tenth on every side. */
const INITIAL_CROP: ResourceSafeArea = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const PREVIEW_W = 220;
const pct = (v: number) => Math.round(v * 1000) / 10;

/** `rect` of the shown picture, in % of its box. */
function boxStyle(r: ResourceSafeArea) {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}

/** The picture's own size, from the resource. */
function sizeOf(resource: Resource): { width: number; height: number } | undefined {
  const s = resource.kind === 'bitmap' ? resource.bitmap : resource.kind === 'svg' ? resource.svg : resource.video?.poster;
  return s?.width && s.height ? { width: s.width, height: s.height } : undefined;
}

/** The file the picture is drawn from (a video's poster). */
function fileIdOf(resource: Resource): string | undefined {
  return resource.kind === 'bitmap' ? resource.bitmap?.fileId : resource.kind === 'video' ? resource.video?.poster?.fileId : resource.svg?.fileId;
}

interface CropFieldProps {
  resource: Resource;
  /** The new crop; `undefined` shows the whole picture again. */
  onChange: (crop: ResourceSafeArea | undefined) => void;
}

/** The "Crop" field of a bitmap, SVG or video poster. */
export function CropField({ resource, onChange }: CropFieldProps) {
  const labels = useSandboxLabels();
  const url = useBlobObjectUrl(fileIdOf(resource));
  const crop = normalizeSafeArea(resource.crop);
  const [open, setOpen] = useState(false);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const share = (v: number) => new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 1 }).format(pct(v));
  return (
    <FieldRow stacked label={labels.resourceCropLabel} hint={labels.resourceCropHint} className="mb-0">
      <div className="flex w-full min-w-0 flex-col gap-2">
        {url && crop && (
          <div className="relative inline-block self-start overflow-hidden rounded" style={{ maxWidth: '100%' }}>
            <img src={url} alt="" className="block" style={{ maxWidth: '100%', maxHeight: 140 }} />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{ ...boxStyle(crop), boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)', outline: '2px solid #ffffff' }}
            />
          </div>
        )}
        <span className="text-xs text-(--slate)">
          {crop
            ? labels.resourceSafeAreaSummary.replace('__w__', share(crop.width)).replace('__h__', share(crop.height))
            : labels.resourceCropNone}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Scissors size={13} aria-hidden="true" />} disabled={!url} onClick={() => setOpen(true)}>
            {crop ? labels.resourceCropEdit : labels.resourceCropMark}
          </Button>
          {crop && (
            <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>
              {labels.resourceCropRemove}
            </Button>
          )}
        </div>
      </div>
      {url && (
        <CropDialog
          open={open}
          url={url}
          resource={resource}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            setOpen(false);
            onChange(normalizeSafeArea(next));
          }}
        />
      )}
    </FieldRow>
  );
}

interface CropDialogProps {
  open: boolean;
  url: string;
  resource: Resource;
  onClose: () => void;
  onApply: (crop: ResourceSafeArea) => void;
}

function CropDialog({ open, url, resource, onClose, onApply }: CropDialogProps) {
  const labels = useSandboxLabels();
  const container = usePortalContainer();
  const [rect, setRect] = useState<ResourceSafeArea>(INITIAL_CROP);
  const [past, setPast] = useState<ResourceSafeArea[]>([]);
  const [loaded, setLoaded] = useState<{ width: number; height: number } | undefined>();
  const stageRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const drag = useRef<{ handle: Handle; from: ResourceSafeArea; origin: Point; before: ResourceSafeArea; moved: boolean } | null>(null);

  // Each opening starts from the saved crop, or a proposal.
  useEffect(() => {
    if (!open) return;
    setRect(normalizeSafeArea(resource.crop) ?? INITIAL_CROP);
    setPast([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const record = (before: ResourceSafeArea) => setPast((p) => [...p, before]);
  const undo = () => {
    if (!past.length) return;
    setRect(past[past.length - 1]!);
    setPast(past.slice(0, -1));
  };

  const pointAt = (e: { clientX: number; clientY: number }): Point => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = pointAt(e);
    const el = e.target as HTMLElement;
    const inside = el.closest('[data-crop]');
    const handle = (el.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined) ?? 'move';
    const before = rectRef.current;
    // Outside the frame: a new one, stretched from the pointer.
    drag.current = inside
      ? { handle, from: before, origin: p, before, moved: false }
      : { handle: 'se', from: { x: p.x, y: p.y, width: 0, height: 0 }, origin: p, before, moved: false };
    stageRef.current!.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = pointAt(e);
    d.moved = true;
    setRect(dragRect(d.handle, d.from, p, { x: p.x - d.origin.x, y: p.y - d.origin.y }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) record(d.before);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    record(rect);
    setRect(nudgeRect(rect, dir[0]!, dir[1]!, e.shiftKey));
  };

  const size = sizeOf(resource) ?? loaded;
  // The figure as it will print: the crop at its own ratio.
  const ratio = size ? (rect.height * size.height) / (rect.width * size.width) : rect.height / rect.width;
  const previewH = PREVIEW_W * ratio;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
        <Dialog.Popup
          data-postext-popup=""
          data-testid="crop-dialog"
          className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
          style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(920px, calc(100vw - 32px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              undo();
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: 0 }}>{labels.resourceCropLabel}</Dialog.Title>
            <IconButton label={labels.resourceSafeAreaCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
          </div>
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
            {labels.resourceCropDialogHelp}
          </Dialog.Description>

          <div className="flex flex-wrap items-start gap-4">
            <div
              ref={stageRef}
              data-testid="crop-stage"
              className="relative inline-block touch-none select-none"
              style={{ cursor: 'crosshair', maxWidth: '100%', overflow: 'hidden' }}
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
                data-crop=""
                role="group"
                tabIndex={0}
                aria-label={labels.resourceCropRectAria}
                onKeyDown={onKeyDown}
                className="absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foreground)"
                style={{ ...boxStyle(rect), cursor: 'move', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)', border: '2px solid #ffffff' }}
              >
                <RectHandles color="#ffffff" />
              </div>
            </div>

            {/* The cropped figure, as it will be set. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-(--slate)">{labels.resourceCropPreview}</span>
              <div
                aria-hidden="true"
                className="relative overflow-hidden rounded"
                style={{ width: PREVIEW_W, height: Math.min(previewH, 320), outline: '1px solid var(--rule)' }}
              >
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="absolute block"
                  style={{
                    maxWidth: 'none',
                    width: `${100 / rect.width}%`,
                    left: `${(-rect.x / rect.width) * 100}%`,
                    top: `${(-rect.y / rect.height) * 100}%`,
                    height: `${100 / rect.height}%`,
                  }}
                />
              </div>
              <span className="text-xs text-(--slate)">
                {pct(rect.width)} % × {pct(rect.height)} %
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <IconButton label={labels.resourceMarksUndo} icon={<Undo2 size={14} aria-hidden="true" />} onClick={undo} disabled={past.length === 0} />
            <Button size="sm" variant="ghost" onClick={() => { record(rect); setRect({ x: 0, y: 0, width: 1, height: 1 }); }}>
              {labels.resourceCropWhole}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>{labels.resourceSafeAreaCancel}</Button>
            <Button size="sm" onClick={() => onApply(rect)}>{labels.resourceCropApply}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
