// Bundle codec as the sandbox uses it. The format itself — reading a
// manifest plus its files, planning and resolving an export — is
// `postext/bundle`'s; this layer adds the sandbox's own concerns: the
// deterministic ids preset files and chapters are stored under, chapter
// records, summaries, and the book's pagination (`layouts.json`). Nothing
// here touches storage or the DOM.

import type { PostextConfig, Resource } from 'postext';
import { isBundleManifest, pickBundleMeta, pickBundleView, pickLocaleOverrides, planBundle as planCoreBundle, readBundle, resolveBundleConfigLocale, resolveBundleFiles } from 'postext/bundle';
import type { BundleByteSources as CoreByteSources, BundleFileReader, BundleIdScheme, PlannedFile } from 'postext/bundle';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from '../book/layoutKeys.js';
import { createDefaultConfig } from '../context/defaultConfig.js';
import { svgIntrinsicSize } from '../panels/resources/svg/svgIntrinsic.js';
import { deriveChapterTitle, newChapter } from '../book/chapterOps.js';
import type { BookStart, Chapter, ChapterLayout, LayoutScope } from '../book/types.js';
import { presetChapterId, presetFileId, presetFontFileId } from './manifest.js';
import type {
  LoadedPreset,
  PresetManifestV2,
  PresetSummary,
} from './types.js';

export type { BundleFileReader, BundleIdScheme, PlannedFile };
export { EXPORTABLE_FONT_FORMATS } from 'postext/bundle';

export function presetIdScheme(presetId: string): BundleIdScheme {
  return {
    blob: (file) => presetFileId(presetId, file),
    font: (file) => presetFontFileId(presetId, file),
  };
}

export interface ParseBundleOptions {
  locale: string;
  summary: PresetSummary;
  ids?: BundleIdScheme;
  onWarning?: (message: string) => void;
  /** Id generator for the loaded chapters. Defaults to ids derived from
   *  the preset id and the chapter file (`presetChapterId`), so applying
   *  the same preset again yields the same ids; a project imports with
   *  random ids (chapter ids are unique across projects). */
  chapterIds?: () => string;
  /** Fallback title for a chapter without a heading (`n` is 1-based). */
  untitledChapter?: (n: number) => string;
}

/** Read a bitmap's pixel size; zero when it cannot be decoded (or outside a
 *  browser). */
export async function bitmapSize(bytes: ArrayBuffer, mime: string): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'undefined') return { width: 0, height: 0 };
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Turn a manifest plus its files into an in-memory `LoadedPreset`. Throws
 *  on an invalid manifest or a missing file. */
export async function parseBundle(
  manifest: unknown,
  readFile: BundleFileReader,
  { locale, summary, ids, onWarning, chapterIds, untitledChapter }: ParseBundleOptions,
): Promise<LoadedPreset> {
  const presetId = (manifest as { id?: unknown } | null)?.id;
  if (typeof presetId !== 'string' || !presetId) throw new Error(`Invalid preset manifest for "${summary.id}"`);
  const scheme = ids ?? presetIdScheme(presetId);
  // The pristine configuration in the bundle's language, which is not the
  // viewer's when the bundle has one language only: a Spanish book opened
  // from /en keeps "Figura" and "Tabla" (EF-150).
  const language = isBundleManifest(manifest) ? resolveBundleConfigLocale(manifest, locale) : locale;
  let read;
  try {
    read = await readBundle(manifest, readFile, {
      locale,
      ids: scheme,
      baseConfig: createDefaultConfig(language),
      measureSvg: svgIntrinsicSize,
      measureBitmap: bitmapSize,
      ...(onWarning ? { onWarning } : {}),
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid bundle manifest')) {
      throw new Error(`Invalid preset manifest for "${summary.id}"`);
    }
    throw err;
  }
  const bundle = read.manifest;
  const view = pickBundleView(bundle, read.locale);
  // The edition's own title and description (`localized.<lang>.name`,
  // #891); without one, the name the source lists the preset under.
  const meta = pickBundleMeta(bundle, read.locale);
  const ownName = pickLocaleOverrides(bundle, read.locale)?.name?.trim() ? meta.name : undefined;
  const idOf = (file: string): string => (chapterIds ? chapterIds() : presetChapterId(presetId, file));
  const untitled = untitledChapter ?? ((n: number) => `Chapter ${n}`);
  const chapters: Chapter[] = read.chapters.map((c, i) =>
    newChapter(idOf(c.file), c.title || deriveChapterTitle(c.markdown, untitled(i + 1)), c.markdown));
  const { config, resources } = read;

  // The bundle's pagination, taken as is when it was built by this engine
  // from this configuration and these resources — else laid out afresh. A
  // multilingual bundle sets each language with its own configuration, so
  // it may carry one per language (`layouts.<locale>.json`).
  let layouts: Record<string, ChapterLayout> | undefined;
  const layoutsBytes = await readFile(localeLayoutsFile(read.locale)).catch(() => null)
    ?? await readFile(LAYOUTS_FILE).catch(() => null);
  if (layoutsBytes) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(layoutsBytes)) as BundleLayoutsFile;
      const configKey = configKeyOf(config);
      const resourcesKey = resourcesKeyOf(resources);
      if (parsed.version === 1 && parsed.engine === ENGINE_KEY && parsed.configKey === configKey && parsed.resourcesKey === resourcesKey) {
        layouts = {};
        read.chapters.forEach((spec, i) => {
          const rest = parsed.chapters[spec.file];
          const chapter = chapters[i];
          if (rest && chapter) layouts![chapter.id] = { ...rest, chapterId: chapter.id, markdown: chapter.markdown, configKey, resourcesKey, engine: ENGINE_KEY };
        });
      }
    } catch (err) {
      onWarning?.(`${LAYOUTS_FILE}: ${err instanceof Error ? err.message : 'unreadable'}, ignored`);
    }
  }

  return {
    summary: {
      ...summary,
      ...(ownName ? { name: ownName } : {}),
      description: meta.description ?? summary.description,
      // The locale of *this* load: a project cloned from the English side
      // of a bilingual bundle is an English project.
      locale: read.locale,
      ...(bundle.locales ? { locales: bundle.locales } : {}),
      ...(bundle.openLocale ? { openLocale: bundle.openLocale } : {}),
      ...(bundle.license ? { license: bundle.license } : {}),
      ...(bundle.credits ? { credits: bundle.credits } : {}),
      ...(bundle.tags ? { tags: bundle.tags } : {}),
    },
    locale: read.locale,
    chapters,
    config,
    // A book in several languages: its general settings (#1209).
    ...(read.sharedConfig ? { sharedConfig: read.sharedConfig } : {}),
    resources,
    blobs: read.blobs.map(({ fileId, bytes, mime }) => ({ fileId, bytes, mime })),
    fonts: read.fonts.map(({ fileId, fileName, format, bytes }) => ({ fileId, fileName, format, buffer: bytes })),
    ...(layouts ? { layouts } : {}),
    // The edition's own view over the bundle's (`localized[…].view`).
    ...(view?.canvasScope ? { canvasScope: view.canvasScope } : {}),
    // Where the book starts, for a bundle that holds part of a longer one.
    ...(read.start ? { start: read.start } : {}),
  };
}

// ---------------------------------------------------------------------------
// Export side

export interface BundleMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
}

export interface BundleContent {
  chapters: readonly Chapter[];
  config: PostextConfig;
  resources: Resource[];
  /** Current layout records by chapter id, carried as `layouts.json` so
   *  the bundle opens paginated. */
  layouts?: Record<string, ChapterLayout>;
  /** The book's canvas scope, written as the manifest's `view` when it is
   *  not the default. */
  canvasScope?: LayoutScope;
  /** Where the book starts, written as the manifest's `start` (#695). */
  start?: BookStart;
  /** The cover picture, carried as the manifest's `thumbnail` so a project
   *  keeps it across an export/import round trip. */
  thumbnail?: { fileId: string; mime: string };
  /** The other editions of a book in several languages (#903), by locale
   *  tag, written as the manifest's `locales`, a chapter map and
   *  `localized` (`BundleMeta.locale` then names the language of the rest). */
  localized?: Record<string, BundleEdition>;
  /** The book's general settings (#1209), with `localized`: the manifest's
   *  `config`, every edition written as the fields it sets of its own. */
  sharedConfig?: PostextConfig;
}

/** An edition of a book in several languages beside the primary one. */
export interface BundleEdition {
  chapters: readonly Chapter[];
  config: PostextConfig;
  resources: Resource[];
  start?: BookStart;
  /** The edition's own title and description, written as
   *  `localized[…].name` and `description` (#968). */
  name?: string;
  description?: string;
  /** Current layout records by chapter id of the edition's chapters,
   *  carried as `layouts.<locale>.json` (#968). */
  layouts?: Record<string, ChapterLayout>;
}

/** `layouts.json`: the pagination of the bundle's chapters, keyed by
 *  chapter file, valid for the engine, configuration and resources named
 *  by their fingerprints (`layoutKeys.ts`). */
export const LAYOUTS_FILE = 'layouts.json';
/** The pagination of one language of a multilingual bundle, read before
 *  `layouts.json`. */
export function localeLayoutsFile(locale: string): string {
  return `layouts.${locale}.json`;
}
export interface BundleLayoutsFile {
  version: 1;
  engine: string;
  configKey: string;
  resourcesKey: string;
  chapters: Record<string, Omit<ChapterLayout, 'chapterId' | 'markdown' | 'configKey' | 'resourcesKey' | 'engine'>>;
}

export interface BundlePlan {
  manifest: PresetManifestV2;
  files: PlannedFile[];
  /** Chapter file path → text, in book order. */
  chapterFiles: { path: string; markdown: string }[];
  /** The pagination file, when any chapter has a current record. */
  layouts?: BundleLayoutsFile;
  /** The pagination of the other editions, by locale, each written as
   *  `layouts.<locale>.json` (#968): one for every edition with a record
   *  that still applies to it. */
  localeLayouts?: Record<string, BundleLayoutsFile>;
  warnings: string[];
}

/** The v1 single-document file name (read path only). */
export const MARKDOWN_FILE = 'document.md';

/** Decide file names and the manifest for a bundle (`postext/bundle`'s
 *  `planBundle`), plus the pagination of every chapter whose record is
 *  current. Pure; bytes are resolved by `buildBundleFiles`. */
export function planBundle(meta: BundleMeta, content: BundleContent): BundlePlan {
  const plan = planCoreBundle(meta, {
    chapters: content.chapters,
    config: content.config,
    resources: content.resources,
    ...(content.canvasScope ? { canvasScope: content.canvasScope } : {}),
    ...(content.start ? { start: content.start } : {}),
    ...(content.thumbnail ? { thumbnail: content.thumbnail } : {}),
    ...(content.sharedConfig && content.localized && Object.keys(content.localized).length > 0 ? { sharedConfig: content.sharedConfig } : {}),
    ...(content.localized && Object.keys(content.localized).length > 0
      ? { localized: Object.fromEntries(Object.entries(content.localized).map(([locale, e]) => [locale, {
          chapters: e.chapters.map((c) => ({ title: c.title, markdown: c.markdown })),
          config: e.config,
          resources: e.resources,
          ...(e.start ? { start: e.start } : {}),
          ...(e.name ? { name: e.name } : {}),
          ...(e.description ? { description: e.description } : {}),
        }])) }
      : {}),
  });

  const layouts = layoutsFileOf(content.chapters, plan.chapterFiles.map((f) => f.path), content.layouts, content.config, content.resources);
  // Each edition's own pagination, keyed by the paths its chapters were
  // written under, valid for its configuration and resources.
  const localeLayouts: Record<string, BundleLayoutsFile> = {};
  for (const [locale, edition] of Object.entries(content.localized ?? {})) {
    const paths = plan.localeChapterFiles?.[locale];
    if (!paths || !edition.layouts) continue;
    const file = layoutsFileOf(edition.chapters, paths, edition.layouts, edition.config, edition.resources);
    if (file) localeLayouts[locale] = file;
  }
  return { ...plan, ...(layouts ? { layouts } : {}), ...(Object.keys(localeLayouts).length > 0 ? { localeLayouts } : {}) };
}

/** The pagination file of a set of chapters written under `paths`: the
 *  records that are current for their text, the engine, the configuration
 *  and the resources. Whatever records are current: the reader takes them
 *  in book order and lays out afresh from the first chapter without one, so
 *  a pagination that stops short still spares the chapters before the gap. */
function layoutsFileOf(
  chapters: readonly Chapter[],
  paths: readonly string[],
  layouts: Record<string, ChapterLayout> | undefined,
  config: PostextConfig,
  resources: Resource[],
): BundleLayoutsFile | undefined {
  if (!layouts) return undefined;
  const configKey = configKeyOf(config);
  const resourcesKey = resourcesKeyOf(resources);
  const layoutChapters: BundleLayoutsFile['chapters'] = {};
  chapters.forEach((c, i) => {
    const path = paths[i];
    const layout = layouts[c.id];
    // Not a layout made without a face it asked for (#757).
    if (path && layout && !layout.withoutFaces && layout.markdown === c.markdown && layout.engine === ENGINE_KEY
      && layout.configKey === configKey && layout.resourcesKey === resourcesKey) {
      layoutChapters[path] = {
        continuationKey: layout.continuationKey,
        pageCount: layout.pageCount,
        leadingBlankPages: layout.leadingBlankPages,
        firstContentPageNumber: layout.firstContentPageNumber,
        firstContentPageFormat: layout.firstContentPageFormat,
        lastPageNumber: layout.lastPageNumber,
        lastPageFormat: layout.lastPageFormat,
        outlinePages: layout.outlinePages,
        ...(layout.carriedOutline ? { carriedOutline: layout.carriedOutline } : {}),
        outlineKey: layout.outlineKey,
        // The stories the chapter sends to a page of a later one (#943).
        ...(layout.jumps ? { jumps: layout.jumps, jumpsKey: layout.jumpsKey } : {}),
      };
    }
  });
  return Object.keys(layoutChapters).length > 0
    ? { version: 1, engine: ENGINE_KEY, configKey, resourcesKey, chapters: layoutChapters }
    : undefined;
}

export interface BundleByteSources {
  readBlob: (fileId: string) => Promise<ArrayBuffer | null>;
  readFont: (fileId: string) => Promise<ArrayBuffer | null>;
}

export interface BuiltBundle {
  /** Path → bytes, ready to zip. */
  files: Record<string, Uint8Array>;
  manifest: PresetManifestV2;
  warnings: string[];
}

/** Resolve a plan's bytes (see `postext/bundle`'s `resolveBundleFiles`) and
 *  add `layouts.json` when nothing was dropped. */
export async function buildBundleFiles(
  meta: BundleMeta,
  content: BundleContent,
  sources: BundleByteSources,
): Promise<BuiltBundle> {
  const plan = planBundle(meta, content);
  const resolved = await resolveBundleFiles(plan, sources as CoreByteSources);
  const files = resolved.files;
  if (resolved.missing.length === 0) {
    if (plan.layouts) files[LAYOUTS_FILE] = new TextEncoder().encode(JSON.stringify(plan.layouts));
    for (const [locale, layouts] of Object.entries(plan.localeLayouts ?? {})) {
      files[localeLayoutsFile(locale)] = new TextEncoder().encode(JSON.stringify(layouts));
    }
  }
  return { files, manifest: resolved.manifest, warnings: resolved.warnings };
}
