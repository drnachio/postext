/**
 * The editions of the book on screen laid out behind the reader (#867),
 * kept for the session: the Checks panel lists their composed checks, the
 * side-by-side view paints their pages. One entry per book and locale,
 * laid out again when what it was read from changes (the book on screen
 * after an edit; another edition's draft after it was saved).
 *
 * The Sandbox holds one edition at a time. Another one is read the way
 * opening it would read it: its draft when the reader edited it, else the
 * bundle's text in that language. Its fonts are the book's (the editions
 * of a bundle share their families); a custom family only its own
 * configuration declares is served for its layout (`declareEditionFonts`,
 * #968); its pictures are stored and decoded for the side-by-side view.
 */

import { loadPresetGeneral } from '../storage/persistence.js';
import { presetSharedConfig, rebaseEdition } from './configLayers.js';
import type { LayoutService } from '../worker/LayoutService.js';
import { declareEditionFonts, ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { getBlob, putBlobsAt } from '../storage/blobStore.js';
import { getPresetDraft, type PresetDraftSummary } from '../storage/presetDrafts.js';
import { getChapterLayouts } from '../storage/layouts.js';
import { editionContentOf, getProject } from '../storage/projects.js';
import { withDefaultResourceTypes } from '../context/defaultConfig.js';
import { sameLocaleTag } from '../presets/locale.js';
import type { LoadedPresetBlob, PresetProvider } from '../presets/types.js';
import { chapterHasComposedChecks, layOutEdition, type EditionLayout, type EditionSource, type LayOutEditionOptions } from './editionLayout.js';

export type EditionStatus = 'loading' | 'ready' | 'error';

export interface EditionEntry {
  locale: string;
  status: EditionStatus;
  /** The last layout (kept while a newer one is under way). */
  layout: EditionLayout | null;
  error?: string;
  /** What the layout was read from (compared by identity). */
  identity: readonly unknown[];
  /** The chapters (by index) laid out besides the checked ones. */
  chapters: ReadonlySet<number>;
}

const entries = new Map<string, EditionEntry>();
const running = new Map<string, AbortController>();
/** The chapters (by index) some view asked to see of each edition besides
 *  the checked ones (the side-by-side view's), kept for the session so the
 *  Checks panel does not lay the edition out again without them. */
const askedChapters = new Map<string, Set<number>>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version++;
  for (const l of listeners) l();
}

export function subscribeEditions(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Changes whenever an entry does (for `useSyncExternalStore`). */
export function editionsVersion(): number {
  return version;
}

/** The books whose editions the reader asked to check all at once, for
 *  books too big to be laid out unasked (see `onDemand.ts`). */
const askedBooks = new Set<string>();

/** Whether the reader asked for the editions of `bookKey`. */
export function editionsAsked(bookKey: string): boolean {
  return askedBooks.has(bookKey);
}

/** Ask for every edition of `bookKey` to be laid out and checked. */
export function askEditions(bookKey: string): void {
  if (askedBooks.has(bookKey)) return;
  askedBooks.add(bookKey);
  emit();
}

export function editionKey(bookKey: string, locale: string): string {
  return `${bookKey}|${locale}`;
}

export function editionEntry(bookKey: string, locale: string): EditionEntry | undefined {
  return entries.get(editionKey(bookKey, locale));
}

function sameIdentity(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export interface EnsureEditionOptions {
  bookKey: string;
  locale: string;
  /** What the edition is read from; a change lays it out again. */
  identity: readonly unknown[];
  load: () => Promise<{ source: EditionSource; blobs?: readonly LoadedPresetBlob[] }>;
  service: LayoutService;
  /** Another edition than the one on screen: its faces and pictures are
   *  loaded first. */
  other: boolean;
  /** Chapters (by index) to lay out besides the ones with composed checks:
   *  the side-by-side view shows any chapter (#1007). */
  chapters?: readonly number[];
}

/** Lay an edition out unless its entry already holds (or is building) the
 *  layout of the same inputs. */
export function ensureEdition(opts: EnsureEditionOptions): void {
  const key = editionKey(opts.bookKey, opts.locale);
  const entry = entries.get(key);
  let asked = askedChapters.get(key);
  if (!asked) askedChapters.set(key, (asked = new Set()));
  for (const i of opts.chapters ?? []) asked.add(i);
  const chapters: ReadonlySet<number> = new Set(asked);
  const covered = entry !== undefined && [...chapters].every((i) => entry.chapters.has(i));
  if (entry && covered && sameIdentity(entry.identity, opts.identity) && entry.status !== 'error') return;
  running.get(key)?.abort();
  const controller = new AbortController();
  running.set(key, controller);
  entries.set(key, { locale: opts.locale, status: 'loading', layout: entry?.layout ?? null, identity: opts.identity, chapters });
  emit();
  const clientId = `edition:${key}`;
  void (async () => {
    const loaded = await opts.load();
    if (controller.signal.aborted) return;
    const layout = await layOutLoadedEdition(opts.service, clientId, loaded, {
      other: opts.other,
      signal: controller.signal,
      wanted: (c, i) => chapterHasComposedChecks(c.markdown) || chapters.has(i),
    });
    if (controller.signal.aborted) return;
    entries.set(key, { locale: opts.locale, status: 'ready', layout, identity: opts.identity, chapters });
    emit();
  })().catch((err: unknown) => {
    if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
    entries.set(key, { locale: opts.locale, status: 'error', layout: entries.get(key)?.layout ?? null, identity: opts.identity, error: err instanceof Error ? err.message : String(err), chapters });
    emit();
  }).finally(() => {
    if (running.get(key) === controller) running.delete(key);
  });
}

/** Lay out an edition that was read (its faces and pictures first when it
 *  is not the one on screen), on the layout worker at background priority,
 *  under `clientId`. The entries above and the WebMCP checks (#952) both
 *  lay editions out this way, so the worker's cache is shared. */
export async function layOutLoadedEdition(
  service: LayoutService,
  clientId: string,
  loaded: { source: EditionSource; blobs?: readonly LoadedPresetBlob[] },
  options: { other: boolean; signal?: AbortSignal; wanted?: LayOutEditionOptions['wanted'] },
): Promise<EditionLayout> {
  const { source, blobs } = loaded;
  if (options.other) {
    // The edition's own custom families, which the book on screen may not
    // declare, are served as the book's are (#968).
    declareEditionFonts(source.config.customFonts);
    await ensureConfigFontsLoaded(source.config, source.chapters.map((c) => c.markdown)).catch(() => undefined);
    await storeEditionPictures(source, blobs ?? []).catch(() => undefined);
  }
  return layOutEdition(source, (content, config, cacheKey) => service.build({
    clientId, priority: 'background', content, config, cacheKey,
  }), { signal: options.signal, ...(options.wanted ? { wanted: options.wanted } : {}) });
}

/** Stop the layouts of a book (it left the screen). */
export function cancelEditions(bookKey: string, service?: LayoutService): void {
  for (const [key, controller] of running) {
    if (!key.startsWith(`${bookKey}|`)) continue;
    controller.abort();
    running.delete(key);
    service?.cancel(`edition:${key}`);
  }
}

/** Another edition's pictures, for its pages to be painted: the payloads
 *  the store lacks are written (a translated diagram has a file of its
 *  own), then every picture is decoded. */
async function storeEditionPictures(source: EditionSource, blobs: readonly LoadedPresetBlob[]): Promise<void> {
  const missing: LoadedPresetBlob[] = [];
  for (const b of blobs) {
    if (!(await getBlob(b.fileId).catch(() => null))) missing.push(b);
  }
  if (missing.length > 0) await putBlobsAt(missing.map((b) => ({ fileId: b.fileId, contentType: b.mime, bytes: b.bytes })));
  await ensureResourceImages(source.resources);
}

/** Read another edition of a preset as opening it would: the reader's
 *  draft in that language when there is one, else the bundle's text. */
export async function loadPresetEdition(
  provider: PresetProvider,
  locale: string,
  drafts: readonly PresetDraftSummary[],
): Promise<{ source: EditionSource; blobs?: readonly LoadedPresetBlob[] }> {
  const summary = drafts.find((d) => d.presetId === provider.summary.id && sameLocaleTag(d.locale, locale));
  if (summary) {
    const draft = await getPresetDraft(summary.key).catch(() => null);
    if (draft) {
      // On the general settings in force now (#1209).
      const general = draft.sharedConfig ? loadPresetGeneral(provider.summary.id) ?? draft.sharedConfig : null;
      return {
        source: {
          locale: draft.locale || locale,
          chapters: draft.chapters,
          config: general && draft.sharedConfig ? rebaseEdition(draft.sharedConfig, general, draft.config) : draft.config,
          resources: draft.resources,
          ...(draft.start ? { start: draft.start } : {}),
        },
      };
    }
  }
  const loaded = await provider.load(locale);
  const original = presetSharedConfig(loaded);
  const general = original ? loadPresetGeneral(provider.summary.id) : null;
  return {
    source: {
      locale: loaded.locale,
      chapters: loaded.chapters,
      config: original && general ? rebaseEdition(original, general, loaded.config) : loaded.config,
      resources: loaded.resources,
      ...(loaded.layouts ? { layouts: loaded.layouts } : {}),
      ...(loaded.start ? { start: loaded.start } : {}),
    },
    blobs: loaded.blobs,
  };
}

/** Read another edition of a local project (#903): the content the record
 *  keeps aside for it (or its own, when it is the one the record opens),
 *  with the pagination stored for its chapters. */
export async function loadProjectEdition(
  projectId: string,
  locale: string,
): Promise<{ source: EditionSource; blobs?: readonly LoadedPresetBlob[] }> {
  const record = await getProject(projectId);
  const content = record ? editionContentOf(record, locale) : null;
  if (!record || !content) throw new Error(`Edition "${locale}" not found`);
  const layouts = await getChapterLayouts(content.chapters.map((c) => c.id)).catch(() => ({}));
  return {
    source: {
      locale,
      chapters: content.chapters,
      // The record keeps the configuration without its defaults.
      config: withDefaultResourceTypes(content.config, locale),
      resources: content.resources,
      layouts,
      ...(content.start ? { start: content.start } : {}),
    },
  };
}

/** Forget every entry (tests). */
export function resetEditions(): void {
  for (const c of running.values()) c.abort();
  running.clear();
  entries.clear();
  askedChapters.clear();
  askedBooks.clear();
  emit();
}
