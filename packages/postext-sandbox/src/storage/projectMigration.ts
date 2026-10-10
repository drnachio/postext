// Upgrades stored project records (and the localStorage working copy) to the
// current book-shaped layout. Pure; ids and the fallback chapter title are
// supplied by the caller.

import type { PostextConfig, Resource } from 'postext';
import { CONFIG_VERSION, migrateConfig as migrateEngineConfig, pinLegacyBoxChildCut, pinLegacyBoxResourceGap, pinLegacyColonListRoom, pinLegacyDashBreaks, pinLegacyDropCapSize, pinLegacyHardBreaks, pinLegacyCodeBlocks, pinLegacyHeadingBreaks, pinLegacyHeadingMarks, pinLegacyHeadingSplit, pinLegacyHyphenBreaks, pinLegacyInlineGap, pinLegacyMathSize, pinLegacyPairedIndents, pinLegacyParagraphContainerSpacing, pinLegacyRaggedBreaking, pinLegacyVerseLayout, pinLegacyVerseTightening, pinLegacyDesignOverflow, pinLegacyGridBalancing, pinLegacyInlineTableSplit, pinLegacyFlowColumns, pinLegacyOpenerHeadFloats } from 'postext/bundle';
import { deriveChapterTitle, newChapter } from '../book/chapterOps';
import type { BookContent, Chapter } from '../book/types';
import type { ProjectThumbnail } from './projects';

/** Record shape: the engine's `CONFIG_VERSION` (`postext/bundle`) itself,
 *  so records, the working copy and `postext-config.json` exports are
 *  stamped with the configuration rules their config was saved under, and
 *  an older one is migrated once, then re-stamped. 8 in postext 1.5:
 *  records saved before 3 have their heading breaks pinned (see
 *  {@link pinLegacyHeadingBreaks}), records saved before 4 their maths
 *  size (see {@link pinLegacyMathSize}), records saved before 5 the
 *  space under their inline figures (see {@link pinLegacyInlineGap}), and
 *  records saved before 6 their headings' inline marks, their drop caps,
 *  the room under a colon line that introduces a list, the space around
 *  the inline figures of their boxes and the lines a box cut leaves of a
 *  paragraph or list item (see {@link pinLegacyHeadingMarks}, {@link
 *  pinLegacyDropCapSize}, {@link pinLegacyColonListRoom}, {@link
 *  pinLegacyBoxResourceGap} and {@link pinLegacyBoxChildCut}), and
 *  records saved before 7 their breaks at dashes and the line-by-line
 *  breaking of their ragged text (see {@link pinLegacyDashBreaks} and
 *  {@link pinLegacyRaggedBreaking}), and records saved before 8 their
 *  breaks at a compound's hyphen, the split of a paragraph under a heading
 *  and the space under their `:::paragraphs` containers (see {@link
 *  pinLegacyHyphenBreaks}, {@link pinLegacyHeadingSplit} and {@link
 *  pinLegacyParagraphContainerSpacing}), and records saved before 9 their
 *  poems with no hemistich separator, the indents of their paragraph
 *  styles that set both a first-line and a hanging indent, the
 *  backslashes they printed where #620 reads a forced line break and the
 *  code fences they read as Markdown (see {@link pinLegacyVerseLayout},
 *  {@link pinLegacyPairedIndents}, {@link pinLegacyHardBreaks}, #620, and
 *  {@link pinLegacyCodeBlocks}, #624), and records saved before 10 the
 *  turnovers of the lines of verse 1.23 set at their natural word spacing
 *  (see {@link pinLegacyVerseTightening}, #620) and the ellipsis that cut
 *  the heading and part design texts that set no `overflow` (see {@link
 *  pinLegacyDesignOverflow}, #628), and records saved before 11 the
 *  balancing of a horizontal page on a character grid (see {@link
 *  pinLegacyGridBalancing}, #632) and the inline tables that moved whole
 *  (see {@link pinLegacyInlineTableSplit}, #634) and the `:::columns`
 *  fences outside a box that were ignored (see {@link
 *  pinLegacyFlowColumns}, #634) and the slots a float found under a
 *  page-span opener (see {@link pinLegacyOpenerHeadFloats}, #639).
 *  Records 1 and 2 were numbered by the Sandbox alone, before 1.5; they
 *  are older than 3 on every count. Records 3 to 7 were written by the 1.5
 *  prereleases: 3 before the maths size changed, 4 before the inline gap
 *  did, 5 before the five version-6 rules did, 6 before the two version-7
 *  rules did, 7 before the three version-8 rules did; records 8 by postext
 *  1.5 to 1.22, records 9 by 1.23, records 10 by 1.24. */
export const PROJECT_RECORD_VERSION: number = CONFIG_VERSION;

export interface MigrationDeps {
  ids: () => string;
  /** Title for a chapter that has no heading, e.g. `(n) => \`Chapter ${n}\``. */
  untitled: (n: number) => string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isThumbnail(v: unknown): v is ProjectThumbnail {
  return isRecord(v) && typeof v.fileId === 'string' && v.fileId.length > 0 && typeof v.mime === 'string';
}

function isChapter(v: unknown): v is Chapter {
  return isRecord(v) && typeof v.id === 'string' && v.id.length > 0 && typeof v.title === 'string' && typeof v.markdown === 'string';
}

/** Normalise a book slice: at least one chapter, a valid active id and
 *  the canvas scope when the record names one. A `layoutScope` written by
 *  earlier versions is dropped. Returns null when there is no usable
 *  content. */
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
  const canvasScope = raw.canvasScope === 'book' || raw.canvasScope === 'chapter' ? raw.canvasScope : undefined;
  return { chapters, activeChapterId, ...(canvasScope ? { canvasScope } : {}) };
}

/** A configuration saved by postext 1.4 or earlier, pinned to the heading
 *  breaks, the maths size, the space around inline figures (in boxes
 *  too), the heading marks, the drop caps, the room under a colon line
 *  that introduces a list, the box cuts, the breaks at dashes and at
 *  compounds' hyphens, the breaking of ragged text, the split under a
 *  heading and the space under `:::paragraphs` containers it laid out: the
 *  engine's own migrations, which `.postext` bundles written without a
 *  `configVersion` go through too (see
 *  `pinLegacyHeadingBreaks`, `pinLegacyMathSize`, `pinLegacyInlineGap`,
 *  `pinLegacyBoxResourceGap`, `pinLegacyHeadingMarks`,
 *  `pinLegacyDropCapSize`, `pinLegacyColonListRoom`,
 *  `pinLegacyBoxChildCut`, `pinLegacyDashBreaks`, `pinLegacyHyphenBreaks`,
 *  `pinLegacyRaggedBreaking`, `pinLegacyHeadingSplit`,
 *  `pinLegacyParagraphContainerSpacing`, `pinLegacyVerseLayout`,
 *  `pinLegacyPairedIndents`, `pinLegacyHardBreaks`,
 *  `pinLegacyCodeBlocks`, `pinLegacyVerseTightening`,
 *  `pinLegacyDesignOverflow`, `pinLegacyGridBalancing` and
 *  `pinLegacyInlineTableSplit`, `pinLegacyFlowColumns` and
 *  `pinLegacyOpenerHeadFloats` in `postext/bundle`). */
export { pinLegacyBoxChildCut, pinLegacyBoxResourceGap, pinLegacyColonListRoom, pinLegacyDashBreaks, pinLegacyDropCapSize, pinLegacyHardBreaks, pinLegacyCodeBlocks, pinLegacyHeadingBreaks, pinLegacyHeadingMarks, pinLegacyHeadingSplit, pinLegacyHyphenBreaks, pinLegacyInlineGap, pinLegacyMathSize, pinLegacyPairedIndents, pinLegacyParagraphContainerSpacing, pinLegacyRaggedBreaking, pinLegacyVerseLayout, pinLegacyVerseTightening, pinLegacyDesignOverflow, pinLegacyGridBalancing, pinLegacyInlineTableSplit, pinLegacyFlowColumns, pinLegacyOpenerHeadFloats };

export interface MigratedProjectRecord extends BookContent {
  version: typeof PROJECT_RECORD_VERSION;
  id: string;
  name: string;
  description?: string;
  locale?: string;
  bundleId?: string;
  sourcePresetId?: string;
  thumbnail?: ProjectThumbnail;
  origin?: string;
  createdAt: number;
  updatedAt: number;
  config: PostextConfig;
  resources: Resource[];
}

/** A configuration stored under record `version` (a number, or absent for
 *  the earliest records), in today's terms. `content` is the markdown it
 *  lays out, when known: a book with no `$` sets no maths, and its
 *  configuration is not given a maths size; one with no `::resource{id="…"}`
 *  line embeds no inline figure, and is not given the 1.4 space under one;
 *  one with no such line inside a `:::callout` is not given the 1.4 space
 *  around a figure in a box; one whose headings carry no inline mark is
 *  not given the 1.4 plain headings; one with no list introduced by a line
 *  ending in a colon is not given the 1.4 room under such a line; one
 *  with no `:::callout` is not given the 1.4 box cut; one with no em or
 *  en dash set closed between words is not given the 1.4 dash breaks; one
 *  with no heading is not given the 1.4 split under a heading; one with
 *  no `:::paragraphs` container is not given the 1.4 space under
 *  containers; one with no hyphen between two letters is not given the 1.4
 *  compound breaks (see `migrateConfig` in `postext/bundle`). */
export function migrateConfig(config: PostextConfig, version: unknown, content?: Iterable<string>): PostextConfig {
  // Records are numbered as the engine numbers configuration rules
  // (`CONFIG_VERSION`), so the engine's migration applies as is.
  return migrateEngineConfig(config, typeof version === 'number' ? version : 0, content === undefined ? {} : { content });
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
    ...(isThumbnail(raw.thumbnail) ? { thumbnail: raw.thumbnail } : {}),
    ...(typeof raw.origin === 'string' && raw.origin ? { origin: raw.origin } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    config: isRecord(raw.config) ? migrateConfig(raw.config as PostextConfig, raw.version, book.chapters.map((c) => c.markdown)) : {},
    resources: Array.isArray(raw.resources) ? (raw.resources as Resource[]) : [],
    ...book,
  };
}
