/**
 * A book's production inside its `.postext` bundle, so the cover travels
 * with the book: a `production/` folder beside the book's own files, which
 * the bundle's readers leave alone.
 *
 * - `production/production.json`: the versions, the cover's texts, its
 *   design, the paper and the endpapers (with the collection whose
 *   advertisements they take); the cover gallery's pictures (by file) and
 *   traces; the logos of the user's library the design places; and the
 *   binding and paper profiles of the library the book names, so it opens
 *   the same on another computer.
 * - `production/files/…`: the pictures' bytes.
 *
 * Opening the bundle stores the production under the new book's id; the
 * logos and profiles join the library, keeping the ones already there.
 */

import type { BindingProfile, PaperProfile } from 'postext';
import { readBookProduction, type BookProduction } from './bookProduction.js';
import { emptyGallery, type CoverGallery, type GalleryPicture, type GalleryTrace } from '../library/coverGallery.js';
import { sniffLogoMime, type LogoRecord } from '../library/logoLibrary.js';
import type { CatalogueAd, CollectionRecord } from '../library/collections.js';
import {
  getBookProduction,
  getCoverGallery,
  listCollections,
  listLogos,
  listProfiles,
  putBookProduction,
  putCollection,
  putCoverGallery,
  putLogos,
  putProfiles,
  type StoredProfile,
} from '../store/productionStore.js';

export const PRODUCTION_BUNDLE_DIR = 'production/';
export const PRODUCTION_BUNDLE_FILE = 'production/production.json';
const FORMAT = 'postext-book-production';
const VERSION = 1;

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

interface ProductionBundleJson {
  format: typeof FORMAT;
  version: number;
  production: Omit<BookProduction, 'projectId' | 'updatedAt'>;
  gallery: { pictures: (Omit<GalleryPicture, 'bytes' | 'updatedAt'> & { file: string })[]; traces: Omit<GalleryTrace, 'updatedAt'>[] };
  logos: (Omit<LogoRecord, 'bytes' | 'updatedAt'> & { file: string })[];
  bindings: BindingProfile[];
  papers: PaperProfile[];
  /** The collection whose advertisements the endpapers take. */
  collection?: Omit<CollectionRecord, 'ads' | 'updatedAt'> & { ads: (Omit<CatalogueAd, 'bytes'> & { file: string })[] };
}

/** The files of a book's production for its bundle (none when the book
 *  has no versions and no gallery). */
export function productionBundleFiles(
  record: BookProduction | null,
  gallery: CoverGallery | null,
  library: { logos: readonly LogoRecord[]; profiles: readonly StoredProfile[]; collections?: readonly CollectionRecord[] },
): Record<string, Uint8Array> {
  if (!record?.versions.length && !gallery?.pictures.length) return {};
  const files: Record<string, Uint8Array> = {};
  const pictures = (gallery?.pictures ?? []).map(({ bytes, updatedAt: _t, ...p }) => {
    const file = `${PRODUCTION_BUNDLE_DIR}files/gallery-${p.id}.${EXT[p.mime] ?? 'bin'}`;
    files[file] = bytes;
    return { ...p, file };
  });
  // The library's logos the design places.
  const placed = new Set((record?.design?.logos ?? []).map((l) => l.logoId).filter(Boolean));
  const logos = library.logos.filter((l) => placed.has(l.id)).map(({ bytes, updatedAt: _t, ...l }) => {
    const file = `${PRODUCTION_BUNDLE_DIR}files/logo-${l.id}.${EXT[l.mime] ?? 'bin'}`;
    files[file] = bytes;
    return { ...l, file };
  });
  // The profiles the versions and the paper name.
  const bindingIds = new Set((record?.versions ?? []).flatMap((v) => (typeof v.binding === 'string' ? [v.binding] : [])));
  const paperIds = new Set(record?.paper?.profileId ? [record.paper.profileId] : []);
  const bindings = library.profiles.flatMap((p) => (p.kind === 'binding' && bindingIds.has(p.profile.id) ? [p.profile] : []));
  const papers = library.profiles.flatMap((p) => (p.kind === 'paper' && paperIds.has(p.profile.id) ? [p.profile] : []));
  const production: ProductionBundleJson['production'] = { versions: [], texts: {}, ...record };
  delete (production as Partial<BookProduction>).projectId;
  delete (production as Partial<BookProduction>).updatedAt;
  const json: ProductionBundleJson = {
    format: FORMAT,
    version: VERSION,
    production,
    gallery: { pictures, traces: (gallery?.traces ?? []).map(({ updatedAt: _t, ...t }) => t) },
    logos,
    bindings,
    papers,
  };
  const collection = library.collections?.find((c) => c.id === record?.endpapers?.collectionId);
  if (collection) {
    json.collection = {
      id: collection.id,
      name: collection.name,
      ads: collection.ads.map(({ bytes, ...a }) => {
        const file = `${PRODUCTION_BUNDLE_DIR}files/ad-${a.id}.${EXT[a.mime] ?? 'bin'}`;
        files[file] = bytes;
        return { ...a, file };
      }),
    };
  }
  files[PRODUCTION_BUNDLE_FILE] = new TextEncoder().encode(JSON.stringify(json));
  return files;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A bundle's production, read for the book `projectId`: what reads, the
 *  pictures whose bytes are there and are pictures. Null when the bundle
 *  carries none. */
export function readProductionBundle(projectId: string, files: ReadonlyMap<string, Uint8Array>, now = Date.now()): {
  record: BookProduction;
  gallery: CoverGallery;
  logos: LogoRecord[];
  bindings: BindingProfile[];
  papers: PaperProfile[];
  collection?: CollectionRecord;
} | null {
  const raw = files.get(PRODUCTION_BUNDLE_FILE);
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (!isRecord(json) || json.format !== FORMAT || !isRecord(json.production)) return null;
  const record = readBookProduction({ ...json.production, projectId, updatedAt: now });
  if (!record) return null;
  const withBytes = <T extends { file?: unknown }>(list: unknown): (T & { bytes: Uint8Array; mime: LogoRecord['mime'] })[] =>
    (Array.isArray(list) ? list : []).flatMap((x) => {
      if (!isRecord(x) || typeof x.file !== 'string') return [];
      const bytes = files.get(x.file);
      const mime = bytes ? sniffLogoMime(bytes) : undefined;
      return bytes && mime ? [{ ...(x as T), bytes, mime }] : [];
    });
  const g = isRecord(json.gallery) ? json.gallery : {};
  const pictures: GalleryPicture[] = withBytes<GalleryPicture & { file: string }>(g.pictures)
    .filter((p) => typeof p.id === 'string')
    .map(({ file: _f, ...p }) => ({ ...p, name: typeof p.name === 'string' ? p.name : p.id, updatedAt: now }));
  const traces: GalleryTrace[] = (Array.isArray(g.traces) ? g.traces : []).flatMap((t) =>
    isRecord(t) && typeof t.id === 'string' && Array.isArray(t.outline)
      ? [{ id: t.id, name: typeof t.name === 'string' ? t.name : t.id, outline: t.outline as GalleryTrace['outline'], aspect: typeof t.aspect === 'number' ? t.aspect : 1, updatedAt: now }]
      : []);
  const logos: LogoRecord[] = withBytes<LogoRecord & { file: string }>(json.logos)
    .filter((l) => typeof l.id === 'string')
    .map(({ file: _f, ...l }) => ({ ...l, updatedAt: now }));
  const profiles = <T>(v: unknown): T[] => (Array.isArray(v) ? v.filter((p): p is T => isRecord(p) && typeof p.id === 'string' && typeof p.name === 'string') : []);
  const c = isRecord(json.collection) ? json.collection : undefined;
  const collection: CollectionRecord | undefined = c && typeof c.id === 'string' && typeof c.name === 'string'
    ? {
      id: c.id,
      name: c.name,
      ads: withBytes<CatalogueAd & { file: string }>(c.ads).filter((a) => typeof a.id === 'string').map(({ file: _f, ...a }) => ({ ...a, title: typeof a.title === 'string' ? a.title : a.id })),
      updatedAt: now,
    }
    : undefined;
  return {
    ...(collection ? { collection } : {}),
    record,
    gallery: { ...emptyGallery(projectId), pictures, traces },
    logos,
    bindings: profiles<BindingProfile>(json.bindings),
    papers: profiles<PaperProfile>(json.papers),
  };
}

/** The production of the book stored as `projectKey`, as bundle files. */
export async function storedProductionBundleFiles(projectKey: string): Promise<Record<string, Uint8Array>> {
  const [record, gallery, logos, profiles, collections] = await Promise.all([
    getBookProduction(projectKey).catch(() => null),
    getCoverGallery(projectKey).catch(() => null),
    listLogos().catch(() => []),
    listProfiles().catch(() => []),
    listCollections().catch(() => []),
  ]);
  return productionBundleFiles(record, gallery, { logos, profiles, collections });
}

/** A bundle's production stored for the book `projectId`: its record and
 *  gallery, and the logos and profiles the library lacks. */
export async function storeProductionBundle(projectId: string, files: ReadonlyMap<string, Uint8Array>): Promise<boolean> {
  const read = readProductionBundle(projectId, files);
  if (!read) return false;
  const [logos, profiles, collections] = await Promise.all([listLogos().catch(() => []), listProfiles().catch(() => []), listCollections().catch(() => [])]);
  if (read.collection && !collections.some((c) => c.id === read.collection!.id)) await putCollection(read.collection);
  const haveLogo = new Set(logos.map((l) => l.id));
  const haveProfile = new Set(profiles.map((p) => p.profile.id));
  await putBookProduction(read.record);
  if (read.gallery.pictures.length || read.gallery.traces.length) await putCoverGallery(read.gallery);
  await putLogos(read.logos.filter((l) => !haveLogo.has(l.id)));
  const papers = read.papers.filter((p) => !haveProfile.has(p.id));
  const bindings = read.bindings.filter((p) => !haveProfile.has(p.id));
  if (papers.length || bindings.length) await putProfiles(papers, bindings);
  return true;
}
