/**
 * A book's cover gallery: the pictures its cover is made of, apart from
 * the figures of the book's pages (they rarely meet), and the outlines
 * traced from them. A picture of the gallery goes on the cover as a
 * picture of its own (`cover:<id>`), its bytes beside the sheet's; its
 * outline, when it has one, is its contour (what a finish shaped by it
 * follows). A traced outline is also kept on its own, to lay as a veil or
 * a finish wherever the design wants it.
 */

import type { CoverOutline, MirrorPicture, Resource } from 'postext';
import { largestPolygon } from './traceOutline.js';
import { sniffLogoMime, type LogoMime } from './logoLibrary.js';

export interface GalleryPicture {
  id: string;
  name: string;
  mime: LogoMime;
  bytes: Uint8Array;
  /** Its size in px. */
  width: number;
  height: number;
  /** Its traced outline, in fractions of the picture. */
  outline?: CoverOutline;
  /** A mask, to cut other pictures with in the cover designer. */
  role?: 'mask';
  /** A picture made by masking one of the gallery's with a mask of it:
   *  their ids, to make it again or undo it. */
  masked?: { source: string; mask: string; invert?: boolean };
  updatedAt: number;
}

/** An outline kept on its own, with the proportions of the picture it was
 *  traced from (width over height), so it is laid without distortion. */
export interface GalleryTrace {
  id: string;
  name: string;
  outline: CoverOutline;
  aspect: number;
  updatedAt: number;
}

export interface CoverGallery {
  /** The book's key in the Cover panel's store (its project id). */
  projectId: string;
  pictures: GalleryPicture[];
  traces: GalleryTrace[];
}

export const emptyGallery = (projectId: string): CoverGallery => ({ projectId, pictures: [], traces: [] });

export const galleryResourceId = (id: string): string => `cover:${id}`;
export const isGalleryResourceId = (id: string | undefined): boolean => !!id?.startsWith('cover:');

const EXT: Record<LogoMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

/** The file id a picture's bytes go by in a cover's files. */
export const galleryFileId = (p: Pick<GalleryPicture, 'id' | 'mime'>): string => `cover-${p.id}.${EXT[p.mime]}`;

/** A picture of the gallery as a resource a cover can lay out (its bytes
 *  in the cover's files under {@link galleryFileId}), its outline's
 *  largest part as its contour. */
export function galleryResource(p: GalleryPicture): Resource {
  const points = p.outline ? largestPolygon(p.outline) : undefined;
  const base = {
    id: galleryResourceId(p.id),
    typeId: 'figure',
    altText: p.name,
    createdAt: 0,
    updatedAt: p.updatedAt,
    ...(points ? { contour: { points } } : {}),
  };
  if (p.mime === 'image/svg+xml') return { ...base, kind: 'svg', svg: { fileId: galleryFileId(p), width: p.width, height: p.height } } as Resource;
  return { ...base, kind: 'bitmap', bitmap: { fileId: galleryFileId(p), format: p.mime === 'image/png' ? 'png' : 'jpeg', width: p.width, height: p.height } } as Resource;
}

/** The gallery's picture a resource id names, if it is one of it. */
export function galleryPictureOf(gallery: CoverGallery | null | undefined, resourceId: string | undefined): GalleryPicture | undefined {
  return isGalleryResourceId(resourceId) ? gallery?.pictures.find((p) => galleryResourceId(p.id) === resourceId) : undefined;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A PNG or JPEG of the gallery as a picture the mirror bleed draws. */
export function galleryMirrorPicture(p: GalleryPicture): MirrorPicture | undefined {
  if (p.mime === 'image/svg+xml') return undefined;
  return { href: `data:${p.mime};base64,${base64(p.bytes)}`, width: p.width, height: p.height };
}

export function newGalleryId(kind: 'pic' | 'trace'): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** A file read as pictures: one, or a PDF's pages (`page`); 'postscript'
 *  for an EPS, or undefined (`readPictureFile`, which makes print files
 *  PNG). */
export type PictureReader = (file: File) => Promise<{ bytes: Uint8Array; mime: LogoMime; page?: number }[] | 'postscript' | undefined>;

/** A file's bytes when they are a PNG, a JPEG or an SVG. */
const readAsIs: PictureReader = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffLogoMime(bytes);
  return mime ? [{ bytes, mime }] : undefined;
};

/** Pictures read from files, for the gallery, named after their file;
 *  the files that are no picture counted, and the PostScript ones (EPS)
 *  named, to say how to save them. `size` reads a picture's size in px
 *  (`pictureSize`), `read` its bytes. */
export async function galleryPicturesFrom(
  files: readonly File[],
  size: (bytes: Uint8Array, mime: LogoMime) => Promise<{ width: number; height: number }>,
  read: PictureReader = readAsIs,
): Promise<{ pictures: GalleryPicture[]; unreadable: number; postscript: string[] }> {
  const pictures: GalleryPicture[] = [];
  const postscript: string[] = [];
  let unreadable = 0;
  for (const file of files) {
    const got = await read(file);
    if (got === 'postscript') {
      postscript.push(file.name);
      continue;
    }
    if (!got) {
      unreadable++;
      continue;
    }
    for (const p of got) {
      const wh = await size(p.bytes, p.mime).catch(() => ({ width: 100, height: 100 }));
      const name = file.name.replace(/\.[^.]+$/, '');
      pictures.push({ id: newGalleryId('pic'), name: p.page ? `${name} · ${p.page}` : name, mime: p.mime, bytes: p.bytes, ...wh, updatedAt: Date.now() });
    }
  }
  return { pictures, unreadable, postscript };
}
