'use client';

/**
 * The Cover panel's gallery: the pictures this book's cover is made of,
 * apart from the figures of its pages, each of which can be traced; and
 * the outlines traced, kept to lay as veils or finishes in the designer.
 */

import { useRef, useState } from 'react';
import { Contrast, PenTool, Plus, Trash2 } from 'lucide-react';
import { outlinePathData } from 'postext';
import { Button, ConfirmPopover, IconButton, announce } from '../ui/index.js';
import { fill } from '../print/fillTokens.js';
import { galleryPicturesFrom, type GalleryPicture, type GalleryTrace } from './library/coverGallery.js';
import { pictureSize, useObjectUrl } from './library/coverImages.js';
import { PICTURE_ACCEPT, readPictureFile } from './library/printFiles.js';
import { Fold } from './Fold.js';
import { INPUT, type Labels } from './productionUi.js';
import { TraceDialog } from './TraceDialog.js';
import { useCoverGallery } from './store/useProduction.js';

function Thumb({ picture }: { picture: GalleryPicture }) {
  const url = useObjectUrl(picture.bytes, picture.mime);
  const d = picture.outline ? outlinePathData(picture.outline) : '';
  return (
    <span className="relative block h-8 w-12 shrink-0 overflow-hidden rounded border border-(--rule) bg-white">
      {url && <img src={url} alt="" className="h-full w-full object-contain p-0.5" />}
      {d && (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0.5 h-[calc(100%-4px)] w-[calc(100%-4px)]" aria-hidden="true">
          <path d={d} fill="none" stroke="#e53935" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </span>
  );
}

function TraceThumb({ trace }: { trace: GalleryTrace }) {
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" className="h-8 w-12 shrink-0 rounded border border-(--rule) bg-(--surface)" aria-hidden="true">
      <g transform={trace.aspect >= 1 ? `translate(0 ${(1 - 1 / trace.aspect) / 2}) scale(1 ${1 / trace.aspect})` : `translate(${(1 - trace.aspect) / 2} 0) scale(${trace.aspect} 1)`}>
        <path d={outlinePathData(trace.outline)} fill="currentColor" opacity={0.6} />
      </g>
    </svg>
  );
}

export function CoverGallerySection({ labels }: { labels: Labels }) {
  const [gallery, update] = useCoverGallery();
  const [tracing, setTracing] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const traced = gallery.pictures.find((p) => p.id === tracing);
  const count = gallery.pictures.length + gallery.traces.length;

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const { pictures, unreadable, postscript } = await galleryPicturesFrom(files, pictureSize, readPictureFile);
    if (postscript.length > 0) announce(fill(labels.productionPicturePostscript, { name: postscript.join(', ') }));
    if (unreadable > 0) announce(labels.productionPictureUnreadable);
    if (pictures.length > 0) update({ ...gallery, pictures: [...gallery.pictures, ...pictures] });
  };
  const rename = <T extends { id: string; name: string }>(list: T[], id: string, name: string): T[] => list.map((x) => (x.id === id ? { ...x, name } : x));

  return (
    <Fold title={labels.productionGallery} {...(count > 0 ? { note: String(count) } : {})}>
      <p className="m-0 text-xs text-(--slate)">{gallery.pictures.length === 0 ? labels.productionGalleryEmpty : labels.productionGalleryIntro}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
        {gallery.pictures.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="relative shrink-0">
              <Thumb picture={p} />
              {(p.role === 'mask' || p.masked) && (
                <span className="absolute -bottom-1 left-0 rounded bg-(--brand) px-1 text-[9px] leading-3 text-(--background)">
                  {p.role === 'mask' ? labels.coverMaskTag : labels.coverMaskedTag}
                </span>
              )}
            </span>
            <input
              type="text"
              aria-label={labels.productionGalleryName}
              defaultValue={p.name}
              onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== p.name) update({ ...gallery, pictures: rename(gallery.pictures, p.id, name) }); }}
              className={`${INPUT} min-w-0 flex-1`}
            />
            <IconButton label={fill(labels.productionGalleryTrace, { name: p.name })} icon={<PenTool size={14} aria-hidden="true" />} onClick={() => setTracing(p.id)} />
            {!p.masked && (
              <IconButton
                label={fill(p.role === 'mask' ? labels.coverMaskUnset : labels.coverMaskSet, { name: p.name })}
                icon={<Contrast size={14} aria-hidden="true" className={p.role === 'mask' ? 'text-(--brand)' : undefined} />}
                onClick={() => update({ ...gallery, pictures: gallery.pictures.map((x) => {
                  if (x.id !== p.id) return x;
                  const next = { ...x };
                  if (x.role === 'mask') delete next.role;
                  else next.role = 'mask';
                  return next;
                }) })}
              />
            )}
            <ConfirmPopover message={fill(labels.productionGalleryDelete, { name: p.name })} confirmLabel={labels.productionLogoDelete} onConfirm={() => update({ ...gallery, pictures: gallery.pictures.filter((x) => x.id !== p.id) })}>
              {({ open }) => <IconButton label={fill(labels.productionGalleryDelete, { name: p.name })} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
            </ConfirmPopover>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => uploadRef.current?.click()}>{labels.productionGalleryUpload}</Button>
      </div>
      <input ref={uploadRef} type="file" multiple accept={PICTURE_ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void upload(e)} />

      {gallery.traces.length > 0 && (
        <>
          <h4 className="m-0 mt-1 text-xs font-semibold">{labels.productionGalleryTraces}</h4>
          <p className="m-0 text-xs text-(--slate)">{labels.productionGalleryTracesIntro}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
            {gallery.traces.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-(--foreground)">
                <TraceThumb trace={t} />
                <input
                  type="text"
                  aria-label={labels.productionGalleryName}
                  defaultValue={t.name}
                  onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== t.name) update({ ...gallery, traces: rename(gallery.traces, t.id, name) }); }}
                  className={`${INPUT} min-w-0 flex-1`}
                />
                <ConfirmPopover message={fill(labels.productionGalleryDelete, { name: t.name })} confirmLabel={labels.productionLogoDelete} onConfirm={() => update({ ...gallery, traces: gallery.traces.filter((x) => x.id !== t.id) })}>
                  {({ open }) => <IconButton label={fill(labels.productionGalleryDelete, { name: t.name })} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
                </ConfirmPopover>
              </li>
            ))}
          </ul>
        </>
      )}
      {traced && <TraceDialog picture={traced} gallery={gallery} onSave={update} onClose={() => setTracing(null)} />}
    </Fold>
  );
}
