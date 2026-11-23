// The editions of a local project imported from a bundle in several
// languages (#903). Pure: `projectActions.ts` reads and stores, this decides
// what the record holds.

import { isBundleManifest, pickBundleMeta } from 'postext/bundle';
import type { LoadedPreset } from '../presets/index.js';
import { sameLocaleTag } from '../presets/locale.js';
import { chineseScriptOf, isJapaneseLanguage } from 'postext';
import type { PostextConfig } from 'postext';
import type { BookContent } from '../book/types.js';
import { cloneBook } from '../book/chapterOps.js';
import { relocalizedResourceTypes } from '../context/defaultConfig.js';
import { arabicDefaults, isArabicScriptLanguage } from '../context/arabicDefaults.js';
import { chineseDefaults } from '../context/chineseDefaults.js';
import { japaneseDefaults } from '../context/japaneseDefaults.js';
import type { ProjectContent, ProjectEditionTitle, ProjectRecord } from './projects.js';

/** What a loaded edition gives a record: its chapters (the first active),
 *  canvas scope and start, configuration and resources. */
export function contentOfLoaded(loaded: LoadedPreset): ProjectContent {
  const book: BookContent = {
    chapters: loaded.chapters,
    activeChapterId: loaded.chapters[0]!.id,
    ...(loaded.canvasScope ? { canvasScope: loaded.canvasScope } : {}),
    ...(loaded.start ? { start: loaded.start } : {}),
    ...(loaded.coverMarkdown ? { coverMarkdown: loaded.coverMarkdown } : {}),
  };
  return { ...book, config: loaded.config, resources: loaded.resources };
}

export interface ProjectEditionFields {
  /** The editions other than the one the record opens with, by locale. */
  editions: Record<string, ProjectContent>;
  /** Every edition's tag in the bundle's order, the opening one included. */
  editionLocales: string[];
}

/** The edition fields of a record opened on `picked`, with the bundle's
 *  other editions read beside it (`asides`) and the order its manifest
 *  lists them in (`tags`). Undefined for a book in one language. */
export function projectEditionFields(
  picked: Pick<LoadedPreset, 'locale'>,
  asides: readonly LoadedPreset[],
  tags: readonly string[],
): ProjectEditionFields | undefined {
  if (asides.length === 0) return undefined;
  const all = [picked.locale, ...asides.map((l) => l.locale)];
  const editions: Record<string, ProjectContent> = {};
  for (const l of asides) editions[l.locale] = contentOfLoaded(l);
  const listed = tags.map((t) => all.find((l) => sameLocaleTag(l, t)) ?? t);
  const editionLocales = [...new Set([...listed, ...all])];
  return { editions, editionLocales };
}

/** What a bundle's manifest calls each of its editions (`localized.<lang>.name`
 *  and `description`, else the manifest's own, #968), by tag. Undefined for
 *  a manifest that is not valid. */
export function editionTitlesOf(manifest: unknown, tags: readonly string[]): Record<string, ProjectEditionTitle> | undefined {
  if (!isBundleManifest(manifest)) return undefined;
  const out: Record<string, ProjectEditionTitle> = {};
  for (const tag of tags) {
    const meta = pickBundleMeta(manifest, tag);
    if (meta.name) out[tag] = { name: meta.name, ...(meta.description !== undefined ? { description: meta.description } : {}) };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The language tag a record is in: the edition it opens with, else the
 *  document language its configuration names, else `fallback`. */
export function recordLocaleOf(record: Pick<ProjectRecord, 'locale' | 'config'>, fallback: string): string {
  return record.locale || record.config.locale || record.config.bodyText?.hyphenation?.locale || fallback;
}

/** Every language tag a record holds an edition in, the one on screen first. */
export function recordEditionTags(record: Pick<ProjectRecord, 'locale' | 'config' | 'editions' | 'editionLocales'>, fallback: string): string[] {
  const own = recordLocaleOf(record, fallback);
  return [...new Set([own, ...(record.editionLocales ?? []), ...Object.keys(record.editions ?? {})])];
}

/** Whether `locale` is one of the languages a record already has (tags
 *  compared without case). */
export function recordHasEdition(record: Pick<ProjectRecord, 'locale' | 'config' | 'editions' | 'editionLocales'>, locale: string, fallback: string): boolean {
  return recordEditionTags(record, fallback).some((t) => sameLocaleTag(t, locale));
}

export interface NewEditionDeps {
  /** A fresh chapter id each call. */
  ids: () => string;
  /** The language to read a record as when it names none (the
   *  interface's). */
  fallbackLocale: string;
}

/** The defaults of a language a new edition was given (#989). */
export interface LanguageDefaultsApplied {
  /** The script family whose defaults were applied. */
  script: 'arabic' | 'chinese' | 'japanese';
  /** How many settings moved. */
  count: number;
}

/**
 * The settings a new book in `locale` gets, applied to `config`, an
 * edition's configuration whose document language is already `locale`:
 * the Arabic, Chinese or Japanese defaults of the Design panel, with the
 * rows the book set to a value of its own left out (the lists mark them
 * `customised`, and apply only the rest and the rows that are part of the
 * language). The writing mode the book has is kept (a horizontal book
 * stays horizontal). Any other language has no defaults: the configuration
 * comes back as it is.
 */
export function withLanguageDefaults(config: PostextConfig, locale: string, fallbackLocale: string): { config: PostextConfig; applied: LanguageDefaultsApplied | null } {
  let result: { config: PostextConfig; changes: readonly { applied: boolean }[] } | null = null;
  let script: LanguageDefaultsApplied['script'] | null = null;
  if (isArabicScriptLanguage(locale)) {
    script = 'arabic';
    result = arabicDefaults(config, { locale });
  } else if (chineseScriptOf(locale) !== undefined) {
    script = 'chinese';
    result = chineseDefaults(config, { locale, fallbackLocale });
  } else if (isJapaneseLanguage(locale)) {
    script = 'japanese';
    result = japaneseDefaults(config, { book: config.layout?.writingMode === 'vertical-rl' ? 'vertical' : 'horizontal', fallbackLocale });
  }
  if (!result || !script) return { config, applied: null };
  return { config: result.config, applied: { script, count: result.changes.filter((c) => c.applied).length } };
}

/** What a new edition in `locale` starts from: the chapters, the
 *  configuration and the resources of `source`, an edition in `from`. The
 *  chapters take ids of their own; the pictures and faces stay the same
 *  files (every edition of a record may point at one, the sweep counts
 *  them all). The document language is `locale`; the built-in figure and
 *  table names that were still those of the old language follow it, an
 *  explicit hyphenation language, which was the old one's, is dropped so
 *  hyphenation follows the document, and an Arabic, Chinese or Japanese
 *  edition gets the defaults of its language (`withLanguageDefaults`). */
export function contentForNewEdition(
  source: ProjectContent,
  from: string,
  locale: string,
  ids: () => string,
  fallbackLocale = from,
): { content: ProjectContent; applied: LanguageDefaultsApplied | null } {
  const book = cloneBook(source, ids);
  let config: PostextConfig = structuredClone(source.config);
  config.locale = locale;
  const types = relocalizedResourceTypes(config.resourceTypes, [from, source.config.locale ?? from], locale);
  if (types) config.resourceTypes = types;
  const hyphenation = config.bodyText?.hyphenation;
  if (hyphenation && hyphenation.locale !== undefined) {
    const { locale: _old, ...rest } = hyphenation;
    void _old;
    config.bodyText = { ...config.bodyText, hyphenation: rest };
  }
  const defaults = withLanguageDefaults(config, locale, fallbackLocale);
  config = defaults.config;
  return {
    content: {
      ...book,
      ...(source.canvasScope ? { canvasScope: source.canvasScope } : {}),
      config,
      resources: structuredClone(source.resources),
    },
    applied: defaults.applied,
  };
}

/** The record with an edition in `locale` added, made from the edition on
 *  screen (copy the chapters, set the document language and the
 *  language's defaults), and left on screen as it was: `withActiveEdition`
 *  opens the new one. Null when the record already has that language. */
export function withNewEdition(record: ProjectRecord, locale: string, deps: NewEditionDeps): { record: ProjectRecord; applied: LanguageDefaultsApplied | null } | null {
  if (recordHasEdition(record, locale, deps.fallbackLocale)) return null;
  const own = recordLocaleOf(record, deps.fallbackLocale);
  const { content, applied } = contentForNewEdition(record, own, locale, deps.ids, deps.fallbackLocale);
  return {
    record: {
      ...record,
      locale: own,
      editions: { ...(record.editions ?? {}), [locale]: content },
      editionLocales: [...recordEditionTags(record, deps.fallbackLocale), locale],
      editionsRev: Date.now(),
    },
    applied,
  };
}
