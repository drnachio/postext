// A collection's catalogue edited as data (#1673): the titles of the
// series in order (`production.collection.catalogue`, each with an id, a
// title and a picture of the book's), and the one that is this book
// (`volume`). What the Cover panel and the tools write; an entry's id is
// what `volume` names, so renaming one carries the volume with it.

import type { ProductionConfig } from 'postext/production';

type Collection = NonNullable<ProductionConfig['collection']>;

export type CatalogueEntry = NonNullable<Collection['catalogue']>[number];

const ID = /^[A-Za-z0-9_-]+$/;

/** Whether a text can be a title's id: letters, digits, `-` and `_`. */
export const catalogueIdValid = (id: string): boolean => ID.test(id);

function withCatalogue(collection: Collection | undefined, catalogue: CatalogueEntry[]): Collection {
  const next: Collection = { ...(collection ?? { name: '' }) };
  if (catalogue.length > 0) next.catalogue = catalogue;
  else delete next.catalogue;
  // A volume the catalogue no longer has goes with it.
  if (next.volume !== undefined && !catalogue.some((e) => e.id === next.volume)) delete next.volume;
  return next;
}

/** `vol-1`, `vol-2`… the first id free. */
export function freeTitleId(catalogue: readonly CatalogueEntry[] | undefined): string {
  const used = new Set((catalogue ?? []).map((e) => e.id));
  let n = (catalogue?.length ?? 0) + 1;
  while (used.has(`vol-${n}`)) n++;
  return `vol-${n}`;
}

/** The collection with a title added at the end. */
export function addTitle(collection: Collection | undefined, entry: Partial<CatalogueEntry> = {}): Collection {
  const list = collection?.catalogue ?? [];
  const id = entry.id && catalogueIdValid(entry.id) && !list.some((e) => e.id === entry.id) ? entry.id : freeTitleId(list);
  const added: CatalogueEntry = { id, title: entry.title ?? '', ...(entry.resource ? { resource: entry.resource } : {}) };
  return withCatalogue(collection, [...list, added]);
}

/** The collection without a title (and without the volume, were it it). */
export function removeTitle(collection: Collection | undefined, id: string): Collection {
  return withCatalogue(collection, (collection?.catalogue ?? []).filter((e) => e.id !== id));
}

/** The collection with a title moved one place up (`-1`) or down (`1`). */
export function moveTitle(collection: Collection | undefined, id: string, step: 1 | -1): Collection {
  const list = [...(collection?.catalogue ?? [])];
  const i = list.findIndex((e) => e.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return collection ?? { name: '' };
  [list[i], list[j]] = [list[j]!, list[i]!];
  return withCatalogue(collection, list);
}

/** The collection with a title's fields changed: an empty picture goes;
 *  a new id must be valid and free (else it is kept), and the volume
 *  follows it. */
export function patchTitle(collection: Collection | undefined, id: string, patch: Partial<CatalogueEntry>): Collection {
  const list = collection?.catalogue ?? [];
  const nextId = patch.id?.trim();
  const rename = nextId !== undefined && nextId !== id && catalogueIdValid(nextId) && !list.some((e) => e.id === nextId) ? nextId : undefined;
  const catalogue = list.map((e) => {
    if (e.id !== id) return e;
    const next: CatalogueEntry = { ...e, ...patch, id: rename ?? e.id };
    if (!next.resource) delete next.resource;
    return next;
  });
  const out = withCatalogue(collection, catalogue);
  return rename && collection?.volume === id ? { ...out, volume: rename } : out;
}

/** The collection with this book's place in it: an entry's id, or none. */
export function setVolume(collection: Collection | undefined, volume: string | undefined): Collection {
  const next: Collection = { ...(collection ?? { name: '' }) };
  if (volume && next.catalogue?.some((e) => e.id === volume)) next.volume = volume;
  else delete next.volume;
  return next;
}
