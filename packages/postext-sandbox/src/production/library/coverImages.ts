// The pictures a cover sheet carries itself (the barcode, the library's
// logos), decoded for the canvas, which draws pictures it has been given.

import { useEffect, useState } from 'react';
import { registerResourceImage, type MirrorPicture, type Resource } from 'postext';
import { getBlob } from '../../storage/blobStore.js';
import type { CoverDesignSettings } from '../model/bookProduction.js';
import { sniffLogoMime, svgSize, type LogoMime } from './logoLibrary.js';
import { galleryMirrorPicture, galleryPictureOf, type CoverGallery } from './coverGallery.js';

/** Decode the sheet's own pictures (the barcode, the library's logos) for
 *  the canvas: an SVG from its text, a PNG or JPEG from its bytes. */
export async function registerCoverImages(files: Record<string, Uint8Array>): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([fileId, bytes]) => {
    const mime = sniffLogoMime(bytes);
    if (!mime) return;
    const img = new Image();
    img.src = mime === 'image/svg+xml'
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new TextDecoder().decode(bytes))}`
      : URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    await img.decode().catch(() => undefined);
    registerResourceImage(fileId, img, { vector: mime === 'image/svg+xml', singleInk: false });
  }));
}

/** The pictures a cover's mirror bleed draws (the background picture and
 *  the movable elements') and those of the effects cut to an outline, the
 *  PNG or JPEG bitmaps of the cover's gallery or of the book, as data URIs
 *  (an SVG picture is left out). */
export async function loadMirrorPictures(design: CoverDesignSettings | undefined, resources: readonly Resource[], gallery?: CoverGallery): Promise<Record<string, MirrorPicture>> {
  const ids = new Set([
    design?.image?.resourceId,
    ...(design?.elements ?? []).map((e) => e.resourceId),
    // An effect cut to an outline draws its picture inside the cut.
    ...(design?.effects ?? []).filter((e) => e.clip).map((e) => e.resourceId),
  ].filter((id): id is string => !!id));
  const out: Record<string, MirrorPicture> = {};
  for (const id of ids) {
    const own = galleryPictureOf(gallery, id);
    if (own) {
      const p = galleryMirrorPicture(own);
      if (p) out[id] = p;
      continue;
    }
    const r = resources.find((x) => x.id === id);
    const bitmap = r?.kind === 'bitmap' ? r.bitmap : undefined;
    if (!bitmap?.fileId || !bitmap.width || !bitmap.height) continue;
    const rec = await getBlob(bitmap.fileId).catch(() => null);
    if (!rec) continue;
    const bytes = new Uint8Array(rec.bytes);
    const mime = sniffLogoMime(bytes);
    if (mime !== 'image/png' && mime !== 'image/jpeg') continue;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out[id] = { href: `data:${mime};base64,${btoa(bin)}`, width: bitmap.width, height: bitmap.height };
  }
  return out;
}

/** A picture's size in px: an SVG's own, a bitmap's decoded. */
export async function pictureSize(bytes: Uint8Array, mime: LogoMime): Promise<{ width: number; height: number }> {
  if (mime === 'image/svg+xml') return svgSize(new TextDecoder().decode(bytes)) ?? { width: 100, height: 100 };
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}


/** An object URL for a picture's bytes, made and revoked by the effect
 *  that uses it (so an effect run twice, as React's development mode
 *  does, never shows a revoked one); empty until it is made. */
export function useObjectUrl(bytes: Uint8Array, mime: string): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes, mime]);
  return url;
}
