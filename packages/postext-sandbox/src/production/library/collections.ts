/**
 * The user's collections and their catalogue of advertisements for the
 * endpapers (novelties, titles of the collection, the collection itself),
 * and what each book puts on its endpapers: a paper colour for each, and
 * on each page (the pastedown, the flyleaf) an advertisement of its
 * collection's catalogue or a text.
 *
 * An advertisement is a picture made for a page, usually to its size and
 * bleed; on the sheet it runs to the bleed at the page's outer edges. It
 * goes on a sheet as a picture of its own (`ad:<id>`), its bytes beside
 * the sheet's.
 */

import type { Resource } from 'postext';
import type { LogoMime } from './logoLibrary.js';

export interface CatalogueAd {
  id: string;
  title: string;
  mime: LogoMime;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface CollectionRecord {
  id: string;
  name: string;
  ads: CatalogueAd[];
  updatedAt: number;
}

/** A page of an endpaper: an advertisement of the collection, or a text
 *  (Markdown). */
export interface EndpaperPage {
  ad?: string;
  text?: string;
}

/** One endpaper (the front or the back): its paper colour, and its two
 *  pages. */
export interface EndpaperSide {
  colour?: string;
  pastedown?: EndpaperPage;
  flyleaf?: EndpaperPage;
}

export interface BookEndpapers {
  /** The collection whose catalogue the advertisements come from. */
  collectionId?: string;
  front?: EndpaperSide;
  back?: EndpaperSide;
}

export const adResourceId = (id: string): string => `ad:${id}`;

const EXT: Record<LogoMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };
export const adFileId = (ad: Pick<CatalogueAd, 'id' | 'mime'>): string => `ad-${ad.id}.${EXT[ad.mime]}`;

/** An advertisement as a picture a sheet can lay out. */
export function adResource(ad: CatalogueAd): Resource {
  const base = { id: adResourceId(ad.id), typeId: 'figure', altText: ad.title, createdAt: 0, updatedAt: 0 };
  if (ad.mime === 'image/svg+xml') return { ...base, kind: 'svg', svg: { fileId: adFileId(ad), width: ad.width, height: ad.height } } as Resource;
  return { ...base, kind: 'bitmap', bitmap: { fileId: adFileId(ad), format: ad.mime === 'image/png' ? 'png' : 'jpeg', width: ad.width, height: ad.height } } as Resource;
}

const HEX = /^#[0-9a-f]{6}$/i;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function readPage(raw: unknown): EndpaperPage | undefined {
  if (!isRecord(raw)) return undefined;
  const out: EndpaperPage = {
    ...(typeof raw.ad === 'string' && raw.ad ? { ad: raw.ad } : {}),
    ...(typeof raw.text === 'string' && raw.text.trim() ? { text: raw.text } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

function readSide(raw: unknown): EndpaperSide | undefined {
  if (!isRecord(raw)) return undefined;
  const pastedown = readPage(raw.pastedown);
  const flyleaf = readPage(raw.flyleaf);
  const out: EndpaperSide = {
    ...(typeof raw.colour === 'string' && HEX.test(raw.colour) ? { colour: raw.colour } : {}),
    ...(pastedown ? { pastedown } : {}),
    ...(flyleaf ? { flyleaf } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/** A book's stored endpapers that read. */
export function readEndpapers(raw: unknown): BookEndpapers | undefined {
  if (!isRecord(raw)) return undefined;
  const front = readSide(raw.front);
  const back = readSide(raw.back);
  const out: BookEndpapers = {
    ...(typeof raw.collectionId === 'string' && raw.collectionId ? { collectionId: raw.collectionId } : {}),
    ...(front ? { front } : {}),
    ...(back ? { back } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

export function newCollectionId(kind: 'col' | 'ad'): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** What an endpaper sheet draws (`coverDocumentInput`'s `endpaper`): the
 *  book's side for the sheet chosen, and its collection's catalogue.
 *  Undefined for any other sheet. */
export function endpaperInput(choice: string, endpapers: BookEndpapers | undefined, collections: readonly CollectionRecord[]): { side: EndpaperSide | undefined; ads: readonly CatalogueAd[] } | undefined {
  if (choice !== 'endpaperFront' && choice !== 'endpaperBack') return undefined;
  return {
    side: endpapers?.[choice === 'endpaperFront' ? 'front' : 'back'],
    ads: collections.find((c) => c.id === endpapers?.collectionId)?.ads ?? [],
  };
}
