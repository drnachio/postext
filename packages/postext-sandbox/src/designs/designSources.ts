/**
 * The designs the gallery shows (#1523), from three places, read the same
 * way once loaded:
 *
 * - the reader's saved designs (design files kept in IndexedDB);
 * - the designs the host ships (`designUrls`: design files fetched from
 *   the site, the same format as one imported);
 * - the designs of the sample books, taken from their configuration.
 *
 * A design loaded is handed over with its font files and colour profiles
 * under ids of its own (`design-font:<entry>:…`), ready to be written to
 * the Sandbox's stores before a book names them.
 */

import { extractDesign, designFileIds, DESIGN_PARTS, type Design, type DesignPart, type PostextConfig } from 'postext';
import { openBundleZip, openDesignBundle, pickBundleMeta, type BundleIdScheme, type OpenedDesign } from 'postext/bundle';
import type { StoredFontFile } from '../storage/fontStorage.js';
import type { BlobRecord } from '../storage/blobStore.js';
import type { PresetProvider, PresetSummary } from '../presets/types.js';
import { slugify } from '../panels/resources/slugify.js';
import { getSavedDesign, listSavedDesigns } from './designStore.js';

/** Where a design of the gallery comes from. */
export type DesignEntryKind = 'saved' | 'builtin' | 'sample';

/** A design as the gallery lists it. */
export interface DesignEntry {
  /** `saved:<id>`, `builtin:<id>` or `sample:<preset id>`. */
  id: string;
  kind: DesignEntryKind;
  name: string;
  description?: string;
  /** The book a saved design was taken from. */
  source?: string;
  /** The parts it holds (a sample's: every part). */
  parts: DesignPart[];
}

/** A design loaded: its settings and the files they name. */
export interface ReadyDesign {
  entry: DesignEntry;
  design: Design;
  fonts: StoredFontFile[];
  blobs: BlobRecord[];
  /** Read from a book's file: its whole design. */
  fromBook: boolean;
  warnings: string[];
}

/** What the gallery reads from. */
export interface DesignSourcesContext {
  /** The language names are shown in. */
  locale: string;
  /** The design files the host ships. */
  designUrls?: readonly string[];
  presets: readonly PresetSummary[];
  presetProvider: (id: string) => PresetProvider | undefined;
}

/** The ids the files of a design are stored under. */
export function designFileScheme(entryId: string): BundleIdScheme {
  const key = slugify(entryId) || 'design';
  return {
    font: (file) => `design-font:${key}:${slugify(file)}`,
    blob: (file) => `design:${key}:${slugify(file)}`,
  };
}

/** The design files the host ships, fetched once per page. */
const shipped = new Map<string, Promise<Uint8Array | null>>();

function fetchShipped(url: string): Promise<Uint8Array | null> {
  let got = shipped.get(url);
  if (!got) {
    got = fetch(url).then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null)).catch(() => null);
    shipped.set(url, got);
    void got.then((bytes) => { if (!bytes) shipped.delete(url); });
  }
  return got;
}

function readyFrom(entry: DesignEntry, opened: OpenedDesign): ReadyDesign {
  const fonts: StoredFontFile[] = opened.fonts.map((f) => ({ fileId: f.fileId, fileName: f.fileName, format: f.format, buffer: f.bytes }));
  const blobs: BlobRecord[] = opened.blobs.map((b) => ({ fileId: b.fileId, contentType: b.mime, bytes: b.bytes }));
  return { entry, design: opened.design, fonts, blobs, fromBook: opened.fromBook, warnings: opened.warnings };
}

/** A design file read for the gallery: its entry and design, the files
 *  named under `entryId`'s ids. Throws when it is no design or book file
 *  (see `openDesignBundle`). */
export async function readDesignFile(bytes: Uint8Array, entry: Omit<DesignEntry, 'name' | 'parts'> & { name?: string }, locale: string): Promise<ReadyDesign> {
  const opened = await openDesignBundle(bytes, { locale, ids: designFileScheme(entry.id) });
  return readyFrom({
    ...entry,
    name: entry.name ?? opened.name,
    ...(entry.description ?? opened.description ? { description: entry.description ?? opened.description } : {}),
    parts: opened.design.parts,
  }, opened);
}

/** The id a shipped design file gives itself (its manifest's), else its
 *  file name. */
function shippedId(url: string, bytes: Uint8Array): string {
  try {
    const id = (openBundleZip(bytes).manifest as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id) return id;
  } catch {
    // Read below, and refused there.
  }
  return slugify(url.split('/').pop() ?? url) || 'design';
}

async function shippedEntries(ctx: DesignSourcesContext): Promise<{ url: string; entry: DesignEntry }[]> {
  const out = await Promise.all((ctx.designUrls ?? []).map(async (url) => {
    const bytes = await fetchShipped(url);
    if (!bytes) return null;
    try {
      const ready = await readDesignFile(bytes, { id: `builtin:${shippedId(url, bytes)}`, kind: 'builtin' }, ctx.locale);
      return { url, entry: ready.entry };
    } catch {
      return null;
    }
  }));
  return out.filter((e): e is { url: string; entry: DesignEntry } => e !== null);
}

function sampleEntry(p: PresetSummary, locale: string): DesignEntry {
  const meta = p.localized ? pickBundleMeta(p, locale) : { name: p.name, description: p.description };
  return {
    id: `sample:${p.id}`,
    kind: 'sample',
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    parts: [...DESIGN_PARTS],
  };
}

/** Every design the gallery shows: the saved ones (newest first), then
 *  the shipped ones, then the sample books'. */
export async function listDesignEntries(ctx: DesignSourcesContext): Promise<DesignEntry[]> {
  const saved = await listSavedDesigns().catch(() => []);
  const own: DesignEntry[] = saved.map((d) => ({
    id: `saved:${d.id}`,
    kind: 'saved',
    name: d.name,
    ...(d.description ? { description: d.description } : {}),
    ...(d.source ? { source: d.source } : {}),
    parts: d.parts,
  }));
  const builtins = (await shippedEntries(ctx)).map((e) => e.entry);
  const samples = ctx.presets.filter((p) => p.available).map((p) => sampleEntry(p, ctx.locale));
  return [...own, ...builtins, ...samples];
}

/** The design of a sample book, its files under the entry's ids. */
async function sampleDesign(entry: DesignEntry, provider: PresetProvider, locale: string): Promise<ReadyDesign> {
  const loaded = await provider.load(locale);
  const source: PostextConfig = loaded.sharedConfig ?? loaded.config;
  const design = extractDesign(source);
  const { fontIds, blobIds } = designFileIds(design.config);
  const fonts = loaded.fonts.filter((f) => fontIds.includes(f.fileId)).map((f) => ({ ...f }));
  const blobs = loaded.blobs.filter((b) => blobIds.includes(b.fileId)).map((b) => ({ fileId: b.fileId, contentType: b.mime, bytes: b.bytes }));
  return { entry, design, fonts, blobs, fromBook: true, warnings: [] };
}

/** Load the design an entry names. Throws when it cannot be read. */
export async function loadDesign(ctx: DesignSourcesContext, entryId: string): Promise<ReadyDesign> {
  const [kind, ...rest] = entryId.split(':');
  const id = rest.join(':');
  if (kind === 'saved') {
    const saved = await getSavedDesign(id);
    if (!saved) throw new Error(`No saved design "${id}"`);
    return readDesignFile(new Uint8Array(saved.bytes), {
      id: entryId,
      kind: 'saved',
      name: saved.name,
      ...(saved.description ? { description: saved.description } : {}),
      ...(saved.source ? { source: saved.source } : {}),
    }, ctx.locale);
  }
  if (kind === 'builtin') {
    for (const url of ctx.designUrls ?? []) {
      const bytes = await fetchShipped(url);
      if (bytes && shippedId(url, bytes) === id) return readDesignFile(bytes, { id: entryId, kind: 'builtin' }, ctx.locale);
    }
    throw new Error(`The design "${id}" could not be fetched`);
  }
  if (kind === 'sample') {
    const provider = ctx.presetProvider(id);
    const summary = ctx.presets.find((p) => p.id === id);
    if (!provider || !summary) throw new Error(`No sample book "${id}"`);
    return sampleDesign(sampleEntry(summary, ctx.locale), provider, ctx.locale);
  }
  throw new Error(`No design "${entryId}"`);
}

let hostDesignUrls: readonly string[] = [];

/** The design files the host ships (the `designUrls` prop). */
export function setDesignUrls(urls: readonly string[] | undefined): void {
  hostDesignUrls = urls ?? [];
}

export function designUrls(): readonly string[] {
  return hostDesignUrls;
}
