// Upgrades stored project records (and the localStorage working copy) to the
// current book-shaped layout. Pure; ids and the fallback chapter title are
// supplied by the caller.

import type { PostextConfig, Resource } from 'postext';
import { deriveChapterTitle, newChapter } from '../book/chapterOps';
import type { BookContent, Chapter, LayoutScope } from '../book/types';

export const PROJECT_RECORD_VERSION = 2 as const;

export interface MigrationDeps {
  ids: () => string;
  /** Title for a chapter that has no heading, e.g. `(n) => \`Chapter ${n}\``. */
  untitled: (n: number) => string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isChapter(v: unknown): v is Chapter {
  return isRecord(v) && typeof v.id === 'string' && v.id.length > 0 && typeof v.title === 'string' && typeof v.markdown === 'string';
}

function isLayoutScope(v: unknown): v is LayoutScope {
  return v === 'book' || v === 'chapter';
}

/** Normalise a book slice: at least one chapter, a valid active id, a
 *  known layout scope. Returns null when there is no usable content. */
export function normalizeBookContent(raw: unknown, deps: MigrationDeps): BookContent | null {
  if (!isRecord(raw)) return null;
  const now = Date.now();
  let chapters: Chapter[] | null = null;
  if (Array.isArray(raw.chapters) && raw.chapters.every(isChapter)) {
    chapters = raw.chapters.map((c) => ({
      id: c.id,
      title: c.title || deriveChapterTitle(c.markdown, deps.untitled(1)),
      markdown: c.markdown,
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : now,
      updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : now,
    }));
  } else if (typeof raw.markdown === 'string') {
    // Legacy single-document shape.
    chapters = [newChapter(deps.ids(), deriveChapterTitle(raw.markdown, deps.untitled(1)), raw.markdown, now)];
  }
  if (!chapters) return null;
  if (chapters.length === 0) chapters = [newChapter(deps.ids(), deps.untitled(1), '', now)];
  const activeChapterId = typeof raw.activeChapterId === 'string' && chapters.some((c) => c.id === raw.activeChapterId)
    ? raw.activeChapterId
    : chapters[0]!.id;
  const layoutScope = isLayoutScope(raw.layoutScope) ? raw.layoutScope : 'book';
  return { chapters, activeChapterId, layoutScope };
}

export interface MigratedProjectRecord extends BookContent {
  version: typeof PROJECT_RECORD_VERSION;
  id: string;
  name: string;
  description?: string;
  locale?: string;
  bundleId?: string;
  sourcePresetId?: string;
  createdAt: number;
  updatedAt: number;
  config: PostextConfig;
  resources: Resource[];
}

/** A stored record in today's shape, or null when it cannot be read. Legacy
 *  records (`markdown: string`, no `version`) become one-chapter books. */
export function migrateProjectRecord(raw: unknown, deps: MigrationDeps): MigratedProjectRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') return null;
  const book = normalizeBookContent(raw, deps);
  if (!book) return null;
  const now = Date.now();
  return {
    version: PROJECT_RECORD_VERSION,
    id: raw.id,
    name: raw.name,
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(typeof raw.locale === 'string' ? { locale: raw.locale } : {}),
    ...(typeof raw.bundleId === 'string' ? { bundleId: raw.bundleId } : {}),
    ...(typeof raw.sourcePresetId === 'string' ? { sourcePresetId: raw.sourcePresetId } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    config: isRecord(raw.config) ? (raw.config as PostextConfig) : {},
    resources: Array.isArray(raw.resources) ? (raw.resources as Resource[]) : [],
    ...book,
  };
}
