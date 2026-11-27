// A .postext read as a part of the open book, and the part joined to it
// (#1727): its files stored, its chapters added or put in place of the
// book's, its resources and the font families the book lacks added. The
// plan is postext's (`planPartJoin`, which the CLI's `postext join` follows
// too); this applies it to the Sandbox's state. One path for the import
// dialog and for the `sandbox_import_chapters` tool.

import type { Resource } from 'postext';
import { planPartJoin, type JoinSide, type PartChoice } from 'postext/bundle';
import { newChapter } from '../book/chapterOps.js';
import { minimalChange } from '../book/textChanges.js';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import { invalidateResourceImage } from '../controls/media/resourceImages.js';
import { slugify } from '../panels/resources/slugify.js';
import { putBlobAt } from '../storage/blobStore.js';
import { putFontFile } from '../storage/fontStorage.js';
import { generateChapterId } from '../storage/projects.js';
import { parseBundle } from './bundle.js';
import type { LoadedPreset } from './types.js';
import { openBundleZip } from './zip.js';

/** The part a .postext holds, read in `locale` (a bundle in several
 *  languages gives its edition in it). Its files get ids of their own, so
 *  that a part's `resources/fig-1-1.png` never lands on the book's. */
export async function readPartBundle(bytes: Uint8Array, fileName: string, locale: string, untitled: (n: number) => string): Promise<LoadedPreset> {
  const opened = openBundleZip(bytes);
  const manifestId = (opened.manifest as { id?: unknown } | null)?.id;
  const id = typeof manifestId === 'string' && manifestId ? manifestId : slugify(fileName) || 'part';
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return parseBundle(opened.manifest, opened.readFile, {
    locale,
    summary: { id, name: id, source: 'private', available: true },
    ids: { blob: (f) => `part:${stamp}:${slugify(f)}`, font: (f) => `part-font:${stamp}:${slugify(f)}` },
    chapterIds: generateChapterId,
    untitledChapter: untitled,
  });
}

/** The open book as the join reads it: each chapter's current text (the
 *  one on screen is in `markdown`), and where the book's count starts. */
export function openBook(state: SandboxState): JoinSide & { chapters: { id: string; title: string; markdown: string }[] } {
  return {
    chapters: state.chapters.map((c) => ({ id: c.id, title: c.title, markdown: c.id === state.activeChapterId ? state.markdown : c.markdown })),
    resources: state.resources,
    config: state.config,
    ...(state.bookStart?.headings ? { start: state.bookStart.headings } : {}),
  };
}

/** A part read from a bundle as the join reads it. */
export function partSide(part: LoadedPreset): JoinSide {
  return { chapters: part.chapters, resources: part.resources, config: part.config, ...(part.start?.headings ? { start: part.start.headings } : {}) };
}

/** Every string in `value`: the file ids a plan's records point at. */
function stringsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsIn(v, out);
  return out;
}

export interface PartJoined {
  added: number;
  replaced: number;
  resources: number;
  renamed: { from: string; to: string }[];
  fontsAdded: string[];
}

/** Join the chosen chapters of `part` to the open book. `dispatch` is
 *  awaited between steps when it returns a promise (the tools wait for the
 *  state; the dialog does not need to). */
export async function joinPart(
  state: SandboxState,
  part: LoadedPreset,
  choices: readonly PartChoice[],
  renames: Readonly<Record<string, string>>,
  dispatch: (action: SandboxAction) => void | Promise<void>,
): Promise<PartJoined> {
  const book = openBook(state);
  const plan = planPartJoin(book, partSide(part), choices, renames);
  // The files the resources brought point at, and the fonts of the families added.
  const named = stringsIn(plan.resources);
  await Promise.all(part.blobs.filter((b) => named.has(b.fileId)).map(async (b) => {
    await putBlobAt(b.fileId, b.bytes, b.mime);
    invalidateResourceImage(b.fileId);
  }));
  const fontIds = stringsIn(plan.customFonts ?? []);
  await Promise.all(part.fonts.filter((f) => fontIds.has(f.fileId)).map((f) => putFontFile(f)));

  const now = Date.now();
  for (const step of plan.steps) {
    if (step.kind === 'replace') {
      // The book's chapter keeps its id (and its history): only its text and title change.
      const chapter = book.chapters[step.at]!;
      const change = minimalChange(chapter.markdown, step.markdown);
      if (change) await dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: chapter.id, changes: [change], baseLength: chapter.markdown.length } });
      if (step.title && step.title !== chapter.title) await dispatch({ type: 'RENAME_CHAPTER', payload: { id: chapter.id, title: step.title } });
    } else {
      await dispatch({ type: 'ADD_CHAPTER', payload: { chapter: newChapter(generateChapterId(), step.title, step.markdown, now), index: step.index, activate: false } });
    }
  }
  for (const r of plan.resources) await dispatch({ type: 'UPSERT_RESOURCE', payload: { ...r, updatedAt: now } as Resource });
  if (plan.customFonts) await dispatch({ type: 'UPDATE_CONFIG', payload: { customFonts: plan.customFonts }, history: { merge: false } });

  return {
    added: plan.steps.filter((s) => s.kind === 'add').length,
    replaced: plan.steps.filter((s) => s.kind === 'replace').length,
    resources: plan.resources.length,
    renamed: plan.renamed,
    fontsAdded: plan.fontsAdded,
  };
}
