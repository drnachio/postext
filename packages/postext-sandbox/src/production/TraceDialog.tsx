'use client';

/**
 * Tracing a picture of the cover's gallery: what stands out from its
 * transparency or from a flat colour round it, shown over the picture as
 * it is found. Saving keeps the outline twice: as the picture's own
 * contour (a finish shaped by the picture follows it) and as a trace of
 * the gallery, to lay as a veil or a finish of its own.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { outlinePathData } from 'postext';
import { useSandboxLabels } from '../context/SandboxContext.js';
import { Button, NumberField, SegmentedControl, usePortalContainer } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { fill } from '../print/fillTokens.js';
import { newGalleryId, type CoverGallery, type GalleryPicture } from './library/coverGallery.js';
import { useObjectUrl } from './library/coverImages.js';
import { TRACE_SIZE, traceOutline, type Pixels, type TraceMode } from './library/traceOutline.js';

/** A picture's pixels, read at most {@link TRACE_SIZE} px a side. */
async function readPixels(p: GalleryPicture): Promise<Pixels> {
  const url = URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.mime }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || p.width;
    const h0 = img.naturalHeight || p.height;
    const scale = Math.min(1, TRACE_SIZE / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale));
    const height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TraceDialog({ picture, gallery, onSave, onClose }: {
  picture: GalleryPicture;
  gallery: CoverGallery;
  onSave: (next: CoverGallery) => void;
  onClose: () => void;
}) {
  const labels = useSandboxLabels();
  const container = usePortalContainer();
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<TraceMode>('auto');
  const [key, setKey] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(12);
  const url = useObjectUrl(picture.bytes, picture.mime);
  useEffect(() => {
    let alive = true;
    readPixels(picture).then((px) => { if (alive) setPixels(px); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [picture]);
  const result = useMemo(
    () => (pixels ? traceOutline(pixels, { mode, tolerance, ...(mode === 'colour' ? { key } : {}) }) : null),
    [pixels, mode, key, tolerance],
  );
  const d = result ? outlinePathData(result.outline) : '';
  const aspect = picture.width > 0 && picture.height > 0 ? picture.width / picture.height : 1;

  const save = () => {
    if (!result || result.outline.length === 0) return;
    const pictures = gallery.pictures.map((p) => (p.id === picture.id ? { ...p, outline: result.outline, updatedAt: Date.now() } : p));
    const trace = { id: newGalleryId('trace'), name: fill(labels.coverTraceName, { picture: picture.name }), outline: result.outline, aspect, updatedAt: Date.now() };
    onSave({ ...gallery, pictures, traces: [...gallery.traces, trace] });
    onClose();
  };
  const clear = () => {
    const pictures = gallery.pictures.map((p) => {
      if (p.id !== picture.id) return p;
      const next = { ...p, updatedAt: Date.now() };
      delete next.outline;
      return next;
    });
    onSave({ ...gallery, pictures });
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
        <Dialog.Popup
          data-postext-popup=""
          className="fixed left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-3"
          style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(520px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', padding: 16, fontSize: 13, lineHeight: '19px' }}
        >
          <Dialog.Title className="m-0 text-[15px] font-semibold">{fill(labels.coverTraceTitle, { picture: picture.name })}</Dialog.Title>
          <Dialog.Description className="m-0 text-xs text-(--slate)">{labels.coverTraceIntro}</Dialog.Description>

          <div
            className="relative self-center"
            style={{
              width: aspect >= 1 ? 'min(100%, 440px)' : `min(100%, ${Math.round(320 * aspect)}px)`,
              aspectRatio: String(aspect),
              // A checkerboard shows what is transparent.
              backgroundImage: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%)',
              backgroundSize: '12px 12px',
            }}
          >
            {url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-fill" />}
            {d && (
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <path d={d} fill="rgba(229, 57, 53, 0.25)" stroke="#e53935" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          {failed && <p role="alert" className="m-0 text-xs">{labels.coverTraceUnreadable}</p>}
          {result && (
            <p className="m-0 text-xs text-(--slate)" aria-live="polite">
              {result.outline.length === 0 ? labels.coverTraceNone : fill(labels.coverTraceParts, { count: String(result.outline.length) })}
              {result.left !== 'transparent' && mode === 'auto' ? ` · ${fill(labels.coverTraceLeftColour, { colour: result.left })}` : ''}
            </p>
          )}

          <div className="flex flex-col gap-1 text-xs">
            {labels.coverTraceMode}
            <SegmentedControl
              size="sm"
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'auto', label: labels.coverTraceAuto },
                { value: 'transparent', label: labels.coverTraceTransparent },
                { value: 'colour', label: labels.coverTraceColour },
              ]}
              ariaLabel={labels.coverTraceMode}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {mode === 'colour' && (
              <label className="flex items-center gap-2">
                {labels.coverTraceKey}
                <input type="color" value={key} onChange={(e) => setKey(e.target.value)} aria-label={labels.coverTraceKey} className="h-6 w-9 cursor-pointer rounded border border-(--pt-control-border) bg-transparent p-0" />
              </label>
            )}
            {mode !== 'transparent' && (
              <label className="flex items-center gap-2">
                {labels.coverTraceTolerance}
                <NumberField value={tolerance} onValueChange={(v) => setTolerance(Math.max(0, Math.min(100, v)))} min={0} max={100} step={2} widthCh={5} ariaLabel={labels.coverTraceTolerance} />
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {picture.outline && <Button variant="ghost" size="sm" onClick={clear}>{labels.coverTraceClear}</Button>}
            <Button variant="outline" size="sm" onClick={onClose}>{labels.coverTraceCancel}</Button>
            <Button variant="primary" size="sm" disabled={!result || result.outline.length === 0} onClick={save}>{labels.coverTraceSave}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
