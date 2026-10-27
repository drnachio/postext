// The pieces a project is copied from: cover pictures, a loaded preset
// adopted under project ids, the layout records that still apply, and a
// project's own copies of its content and other editions (#1276: split
// out of projectActions.ts).
import type { PostextConfig, Resource } from 'postext';
import { invalidateResourceImage } from '../../controls/media/resourceImages.js';
import type { BundleContent } from '../../presets/bundle.js';
import type { PresetSummary, LoadedPreset } from '../../presets/index.js';
import { extensionForImageMime, mimeForFile } from '../../presets/manifest.js';
import { putBlobAt, getBlob } from '../../storage/blobStore.js';
import { putFontFile, getFontFile } from '../../storage/fontStorage.js';
import { cloneBook } from '../../book/chapterOps.js';
import type { BookContent, Chapter, ChapterLayout, BookStart } from '../../book/types.js';
import { createBookPlanner } from '../../book/pagination.js';
import { projectFileId, remapContentFileIds, projectFontFileId } from '../../storage/projectFiles.js';
import { PROJECT_RECORD_VERSION } from '../../storage/projectMigration.js';
import { type ProjectThumbnail, type ProjectContent, generateChapterId, type ProjectRecord, generateProjectId, editionTitleOf } from '../../storage/projects.js';
import { withDefaultResourceTypes } from '../defaultConfig.js';
import type { SandboxState } from '../SandboxContext.js';
import { getChapterLayouts } from '../../storage/layouts.js';
import { getPresetCover } from '../../storage/presetCovers.js';

/** Write `bytes` as the project's cover picture and give back the record
 *  field. A fresh file id every time, so a replacement never has to wait for
 *  a cached preview and the sweep drops the bytes the project left behind.
 *  Null for a media type the sandbox does not take as an image. */
export async function storeThumbnail(projectId: string, bytes: ArrayBuffer, mime: string): Promise<ProjectThumbnail | null> {
  const ext = extensionForImageMime(mime);
  if (!ext) return null;
  const fileId = projectFileId(projectId, `thumbnail-${Date.now().toString(36)}.${ext}`);
  await putBlobAt(fileId, bytes, mime);
  return { fileId, mime };
}

/** Copy another project's cover picture into `projectId` (each project owns
 *  its files). Undefined when there is none, or its bytes are gone. */
export async function copyThumbnail(from: ProjectThumbnail | undefined, projectId: string): Promise<ProjectThumbnail | undefined> {
  if (!from) return undefined;
  const rec = await getBlob(from.fileId).catch(() => null);
  if (!rec) return undefined;
  const stored = await storeThumbnail(projectId, rec.bytes, rec.contentType);
  return stored ? { ...stored, ...(from.generated ? { generated: true } : {}) } : undefined;
}

/** A showcase preset's cover picture, fetched from its source and copied
 *  into the project cloned from it — or, for a preset that ships none, the
 *  cover taken from its first page in `locale` (see covers/autoCover.ts).
 *  A failure only costs the picture. */
export async function presetThumbnailBytes(summary: PresetSummary, locale?: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const url = summary.thumbnailUrl;
  if (!url) return getPresetCover(summary.id, locale).catch(() => null);
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const byName = mimeForFile(summary.thumbnail ?? url);
    const mime = extensionForImageMime(byName) ? byName : (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    return { bytes, mime };
  } catch {
    return null;
  }
}

export async function adoptPresetThumbnail(summary: PresetSummary, projectId: string, locale?: string): Promise<ProjectThumbnail | undefined> {
  const fetched = await presetThumbnailBytes(summary, locale);
  if (!fetched) return undefined;
  const stored = await storeThumbnail(projectId, fetched.bytes, fetched.mime);
  // A preset that ships no cover hands over the one taken from its page.
  return stored ? { ...stored, ...(summary.thumbnailUrl ? {} : { generated: true }) } : undefined;
}

/** Take a preset's in-memory content and give the project its own copies of
 *  every file, under project ids. Bytes come from the loaded bundle when it
 *  carried them, else from IndexedDB (the built-in preset seeds its blobs
 *  directly). */
export function bookFromLoaded(loaded: LoadedPreset): BookContent {
  return { chapters: loaded.chapters, activeChapterId: loaded.chapters[0]!.id, ...(loaded.canvasScope ? { canvasScope: loaded.canvasScope } : {}), ...(loaded.start ? { start: loaded.start } : {}) };
}

export async function adoptLoadedPreset(loaded: LoadedPreset, projectId: string): Promise<ProjectContent> {
  // A preset's chapters carry ids derived from the preset (so re-applying
  // it keeps them); a project gets its own, unique across projects.
  const remapped = remapContentFileIds(
    { ...cloneBook(bookFromLoaded(loaded), generateChapterId), config: loaded.config, resources: loaded.resources },
    (_old, kind, hint) => (kind === 'blob' ? projectFileId(projectId, hint) : projectFontFileId(projectId, hint)),
  );
  const blobByOld = new Map(loaded.blobs.map((b) => [b.fileId, b]));
  const fontByOld = new Map(loaded.fonts.map((f) => [f.fileId, f]));
  await Promise.all([
    ...remapped.blobPairs.map(async ([from, to]) => {
      const inMemory = blobByOld.get(from);
      if (inMemory) {
        await putBlobAt(to, inMemory.bytes, inMemory.mime);
      } else {
        const rec = await getBlob(from).catch(() => null);
        if (rec) await putBlobAt(to, rec.bytes, rec.contentType);
      }
      invalidateResourceImage(to);
    }),
    ...remapped.fontPairs.map(async ([from, to]) => {
      const inMemory = fontByOld.get(from);
      if (inMemory) {
        await putFontFile({ fileId: to, fileName: inMemory.fileName, format: inMemory.format, buffer: inMemory.buffer });
      } else {
        const rec = await getFontFile(from).catch(() => null);
        if (rec) await putFontFile({ ...rec, fileId: to });
      }
    }),
  ]);
  return remapped.content;
}

/** The stored layout records of `chapters` that still apply to `config`
 *  and `resources`, chained from the first chapter — the planner's call,
 *  as for the working book. A preset or a project that is not active keeps
 *  its pagination in the 'layouts' store only (written while it was the
 *  working book); `extra` adds records held in memory, which win. */
export async function storedCurrentLayouts(
  chapters: readonly Chapter[],
  config: PostextConfig,
  resources: Resource[],
  extra: Record<string, ChapterLayout> = {},
  start?: BookStart,
): Promise<Record<string, ChapterLayout>> {
  const stored = await getChapterLayouts(chapters.map((c) => c.id)).catch(() => ({}));
  const plan = createBookPlanner().plan(chapters, config, resources, { ...stored, ...extra }, start);
  const out: Record<string, ChapterLayout> = {};
  for (const c of plan.chapters) if (c.layout) out[c.chapterId] = c.layout;
  return out;
}

export function newRecord(
  content: ProjectContent,
  meta: Pick<ProjectRecord, 'name' | 'description' | 'locale' | 'bundleId' | 'sourcePresetId' | 'thumbnail' | 'origin'>,
  id = generateProjectId(),
): ProjectRecord {
  const now = Date.now();
  return { version: PROJECT_RECORD_VERSION, id, ...meta, ...content, createdAt: now, updatedAt: now };
}

export function bookOfState(s: SandboxState): BookContent {
  return { chapters: s.chapters, activeChapterId: s.activeChapterId, ...(s.canvasScope === 'book' ? { canvasScope: s.canvasScope } : {}), ...(s.bookStart ? { start: s.bookStart } : {}) };
}

/** The slices of a stored book a project owns, nothing else of the record
 *  or draft it came from (its id, name, draft key…), with chapters under
 *  new ids. */
export function ownContent(source: ProjectContent): ProjectContent {
  return { ...cloneBook(source, generateChapterId), ...(source.canvasScope ? { canvasScope: source.canvasScope } : {}), config: source.config, resources: source.resources };
}

/** A copy of a project's other editions, chapters under new ids. */
export function ownEditions(editions: Record<string, ProjectContent> | undefined): Record<string, ProjectContent> | undefined {
  return editions ? Object.fromEntries(Object.entries(editions).map(([locale, e]) => [locale, ownContent(e)])) : undefined;
}

/** `record` with the other editions of the project it is copied from. */
export function withEditionsOf(record: ProjectRecord, from: Pick<ProjectRecord, 'editionLocales' | 'editionTitles' | 'titleEdited'> | undefined, editions: Record<string, ProjectContent> | undefined): ProjectRecord {
  if (!editions) return record;
  return {
    ...record,
    editions,
    ...(from?.editionLocales ? { editionLocales: from.editionLocales } : {}),
    // The copy's own name ("… copy") is a name the reader chose for every
    // edition (#968); the titles the bundle gave them stay for the export.
    ...(from?.editionTitles ? { editionTitles: from.editionTitles, titleEdited: true } : from?.titleEdited ? { titleEdited: true } : {}),
    editionsRev: Date.now(),
  };
}

/** The other editions of a project as a bundle writes them (#903): their
 *  content, each with the title the bundle gave it unless the reader named
 *  the project (#968), and the pagination kept for its chapters, which the
 *  bundle then carries as `layouts.<locale>.json`. */
export async function localizedOf(record: ProjectRecord): Promise<BundleContent['localized'] | undefined> {
  if (!record.locale || !record.editions) return undefined;
  const out: NonNullable<BundleContent['localized']> = {};
  for (const [locale, e] of Object.entries(record.editions)) {
    const title = record.titleEdited ? undefined : editionTitleOf(record, locale);
    const layouts = await getChapterLayouts(e.chapters.map((c) => c.id)).catch((): Record<string, ChapterLayout> => ({}));
    out[locale] = {
      chapters: e.chapters,
      config: withDefaultResourceTypes(e.config, locale),
      resources: e.resources,
      ...(e.start ? { start: e.start } : {}),
      ...(title ? { name: title.name, ...(title.description !== undefined ? { description: title.description } : {}) } : {}),
      ...(Object.keys(layouts).length > 0 ? { layouts } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** File id a preset's cover picture is handed to the bundle builder under
 *  while an export is being assembled (never stored). */
export const PRESET_THUMBNAIL_ID = 'preset-thumbnail';
/** Id the cover painted for an export goes to the bundle under. */
export const BUNDLE_COVER_ID = 'bundle-cover';
