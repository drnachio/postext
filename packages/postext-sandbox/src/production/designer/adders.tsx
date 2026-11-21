'use client';

/**
 * What adds an item to a layer of the cover designer: a picture of the
 * gallery or a new upload, a shape, a traced veil or finish, a logo, a
 * text box.
 */

import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { BASIC_SHAPES, type BasicShape, type Resource } from 'postext';
import { Button, Select } from '../../ui/index.js';
import { fill } from '../../print/fillTokens.js';
import {
  pictureAspect,
  type CoverElementSetting,
} from '../model/coverLayers.js';
import { COVER_FIELDS } from '../model/coverTexts.js';
import { galleryPictureOf, galleryPicturesFrom, type CoverGallery, type GalleryTrace } from '../library/coverGallery.js';
import { pictureSize } from '../library/coverImages.js';
import { PICTURE_ACCEPT, readPictureFile } from '../library/printFiles.js';
import { announce } from '../../ui/announcer.js';
import { logoResourceId, type LogoRecord } from '../library/logoLibrary.js';
import type { Labels } from '../productionUi.js';
import { SHAPE_LABEL, fieldLabel } from './designerLabels.js';


/** A picture's proportions: a library logo's, or a book picture's. */
export function aspectOf(el: CoverElementSetting, resources: readonly Resource[], library: readonly LogoRecord[]): number {
  const logo = library.find((l) => logoResourceId(l.id) === el.resourceId);
  if (logo && logo.width > 0 && logo.height > 0) return logo.width / logo.height;
  return pictureAspect(resources.find((r) => r.id === el.resourceId));
}
/** A picture of the cover's gallery to add. */
export function PictureAdder({ pictures, gallery, labels, onPick }: { pictures: readonly Resource[]; gallery: CoverGallery; labels: Labels; onPick: (p: Resource) => void }) {
  if (pictures.length === 0) return <p className="m-0 text-(--slate)">{labels.coverNoPictures}</p>;
  return (
    <Select
      size="sm"
      value=""
      onValueChange={(id) => { const picture = pictures.find((p) => p.id === id); if (picture) onPick(picture); }}
      options={[{ value: '', label: labels.coverAddPicture }, ...pictures.map((p) => ({ value: p.id, label: galleryPictureOf(gallery, p.id)?.name ?? p.id }))]}
      ariaLabel={labels.coverAddPicture}
    />
  );
}
/** Pictures uploaded into the cover's gallery from the designer; the
 *  first goes on the cover. */
export function GalleryUpload({ gallery, labels, onAdded }: { gallery: CoverGallery; labels: Labels; onAdded: (next: CoverGallery, first: CoverGallery['pictures'][number]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => ref.current?.click()}>{labels.coverUploadPicture}</Button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={PICTURE_ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void galleryPicturesFrom(files, pictureSize, readPictureFile).then(({ pictures, unreadable, postscript }) => {
            if (postscript.length > 0) announce(fill(labels.productionPicturePostscript, { name: postscript.join(', ') }));
            if (unreadable > 0) announce(labels.productionPictureUnreadable);
            if (pictures[0]) onAdded({ ...gallery, pictures: [...gallery.pictures, ...pictures] }, pictures[0]);
          });
        }}
      />
    </>
  );
}
/** A basic shape to add, its points then editable. */
export function ShapeAdder({ labels, onPick }: { labels: Labels; onPick: (k: BasicShape) => void }) {
  return (
    <Select
      size="sm"
      value=""
      onValueChange={(k) => { if (k) onPick(k as BasicShape); }}
      options={[{ value: '', label: labels.coverAddShape }, ...BASIC_SHAPES.map((k) => ({ value: k, label: String(labels[SHAPE_LABEL[k]]) }))]}
      ariaLabel={labels.coverAddShape}
    />
  );
}
/** A traced outline of the gallery to lay (as a veil, a finish). */
export function TraceAdder({ traces, label, onPick }: { traces: readonly GalleryTrace[]; label: string; onPick: (t: GalleryTrace) => void }) {
  if (traces.length === 0) return null;
  return (
    <Select
      size="sm"
      value=""
      onValueChange={(id) => { const t = traces.find((x) => x.id === id); if (t) onPick(t); }}
      options={[{ value: '', label }, ...traces.map((t) => ({ value: t.id, label: t.name }))]}
      ariaLabel={label}
    />
  );
}
export function LogoAdder({ library, pictures, labels, onLibrary, onBook }: {
  library: readonly LogoRecord[];
  pictures: readonly Resource[];
  labels: Labels;
  onLibrary: (l: LogoRecord) => void;
  onBook: (p: Resource) => void;
}) {
  return (
    <>
      {library.length > 0 ? (
        <Select
          size="sm"
          value=""
          onValueChange={(id) => { const l = library.find((x) => x.id === id); if (l) onLibrary(l); }}
          options={[{ value: '', label: labels.coverAddLogo }, ...library.map((l) => ({ value: l.id, label: l.name }))]}
          ariaLabel={labels.coverAddLogo}
        />
      ) : (
        <p className="m-0 text-(--slate)">{labels.coverNoLogos}</p>
      )}
      {pictures.length > 0 && (
        <Select
          size="sm"
          value=""
          onValueChange={(id) => { const p = pictures.find((x) => x.id === id); if (p) onBook(p); }}
          options={[{ value: '', label: labels.coverAddLogoFromBook }, ...pictures.map((p) => ({ value: p.id, label: p.id }))]}
          ariaLabel={labels.coverAddLogoFromBook}
        />
      )}
    </>
  );
}
/** A new text box: of one of the general texts, or of words of its own. */
export function TextAdder({ labels, onPick }: { labels: Labels; onPick: (field: (typeof COVER_FIELDS)[number] | undefined) => void }) {
  const OWN = '__own__';
  return (
    <Select
      size="sm"
      value=""
      onValueChange={(v) => { if (v) onPick(v === OWN ? undefined : (v as (typeof COVER_FIELDS)[number])); }}
      options={[{ value: '', label: labels.coverAddText }, ...COVER_FIELDS.map((f) => ({ value: f, label: fieldLabel(labels, f) })), { value: OWN, label: labels.coverAddTextOwn }]}
      ariaLabel={labels.coverAddText}
    />
  );
}
