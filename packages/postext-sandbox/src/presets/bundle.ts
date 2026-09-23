// Bundle codec as the sandbox uses it. The format itself — reading a
// manifest plus its files, planning and resolving an export — is
// `postext/bundle`'s; this layer adds the sandbox's own concerns: the
// deterministic ids preset files and chapters are stored under, chapter
// records, summaries, and the book's pagination (`layouts.json`). Nothing
// here touches storage or the DOM.

import type { PostextConfig, Resource } from 'postext';
import { planBundle as planCoreBundle, readBundle, resolveBundleFiles } from 'postext/bundle';
import type { BundleByteSources as CoreByteSources, BundleFileReader, BundleIdScheme, PlannedFile } from 'postext/bundle';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from '../book/layoutKeys';
import { createDefaultConfig } from '../context/defaultConfig';
import { svgIntrinsicSize } from '../panels/resources/svgIntrinsic';
import { deriveChapterTitle, newChapter } from '../book/chapterOps';
import type { Chapter, ChapterLayout, LayoutScope } from '../book/types';
import { presetChapterId, presetFileId, presetFontFileId } from './manifest';
import type {
  LoadedPreset,
  PresetManifestV2,
  PresetSummary,
} from './types';

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
  let read;
  try {
    read = await readBundle(manifest, readFile, {
      locale,
      ids: scheme,
      baseConfig: createDefaultConfig(locale),
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
  const idOf = (file: string): string => (chapterIds ? chapterIds() : presetChapterId(presetId, file));
  const untitled = untitledChapter ?? ((n: number) => `Chapter ${n}`);
  const chapters: Chapter[] = read.chapters.map((c, i) =>
    newChapter(idOf(c.file), c.title || deriveChapterTitle(c.markdown, untitled(i + 1)), c.markdown));
  const { config, resources } = read;

  // The bundle's pagination, taken as is when it was built by this engine
  // from this configuration and these resources — else laid out afresh.
  let layouts: Record<string, ChapterLayout> | undefined;
  const layoutsBytes = await readFile(LAYOUTS_FILE).catch(() => null);
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
      description: bundle.description ?? summary.description,
      // The locale of *this* load: a project cloned from the English side
      // of a bilingual bundle is an English project.
      locale: read.locale,
      ...(bundle.locales ? { locales: bundle.locales } : {}),
      ...(bundle.license ? { license: bundle.license } : {}),
      ...(bundle.credits ? { credits: bundle.credits } : {}),
      ...(bundle.tags ? { tags: bundle.tags } : {}),
    },
    locale: read.locale,
    chapters,
    config,
    resources,
    blobs: read.blobs.map(({ fileId, bytes, mime }) => ({ fileId, bytes, mime })),
    fonts: read.fonts.map(({ fileId, fileName, format, bytes }) => ({ fileId, fileName, format, buffer: bytes })),
    ...(layouts ? { layouts } : {}),
    ...(bundle.view?.canvasScope ? { canvasScope: bundle.view.canvasScope } : {}),
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
  /** The cover picture, carried as the manifest's `thumbnail` so a project
   *  keeps it across an export/import round trip. */
  thumbnail?: { fileId: string; mime: string };
}

/** `layouts.json`: the pagination of the bundle's chapters, keyed by
 *  chapter file, valid for the engine, configuration and resources named
 *  by their fingerprints (`layoutKeys.ts`). */
export const LAYOUTS_FILE = 'layouts.json';
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
    ...(content.thumbnail ? { thumbnail: content.thumbnail } : {}),
  });

  const layoutChapters: BundleLayoutsFile['chapters'] = {};
  content.chapters.forEach((c, i) => {
    const path = plan.chapterFiles[i]!.path;
    const layout = content.layouts?.[c.id];
    if (layout && layout.markdown === c.markdown && layout.engine === ENGINE_KEY
      && layout.configKey === configKeyOf(content.config) && layout.resourcesKey === resourcesKeyOf(content.resources)) {
      layoutChapters[path] = {
        continuationKey: layout.continuationKey,
        pageCount: layout.pageCount,
        leadingBlankPages: layout.leadingBlankPages,
        firstContentPageNumber: layout.firstContentPageNumber,
        firstContentPageFormat: layout.firstContentPageFormat,
        lastPageNumber: layout.lastPageNumber,
        lastPageFormat: layout.lastPageFormat,
        outlinePages: layout.outlinePages,
        outlineKey: layout.outlineKey,
      };
    }
  });
  // Whatever records are current: the reader takes them in book order and
  // lays out afresh from the first chapter without one, so a pagination
  // that stops short still spares the chapters before the gap.
  const layouts: BundleLayoutsFile | undefined = Object.keys(layoutChapters).length > 0
    ? { version: 1, engine: ENGINE_KEY, configKey: configKeyOf(content.config), resourcesKey: resourcesKeyOf(content.resources), chapters: layoutChapters }
    : undefined;

  return { ...plan, ...(layouts ? { layouts } : {}) };
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
  if (plan.layouts && resolved.missing.length === 0) files[LAYOUTS_FILE] = new TextEncoder().encode(JSON.stringify(plan.layouts));
  return { files, manifest: resolved.manifest, warnings: resolved.warnings };
}
