// A .postext read as a part of the open book (book/partImport.ts), and the
// part joined to it: its files stored, its chapters added or put in place of
// the book's, its resources and the font families the book lacks added.
// One path for the import dialog and for the `sandbox_import_chapters` tool.

import type { Resource } from 'postext';
import { newChapter } from '../book/chapterOps.js';
import { planPartImport, resourceClashes, type PartChoice, type PartImport } from '../book/partImport.js';
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

/** The open book as the part import reads it: each chapter's current text
 *  (the one on screen is in `markdown`). */
export function openBook(state: SandboxState) {
  return {
    chapters: state.chapters.map((c) => ({ id: c.id, title: c.title, markdown: c.id === state.activeChapterId ? state.markdown : c.markdown })),
    resources: state.resources,
    config: state.config,
  };
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
  const clashes = resourceClashes(book, part, choices);
  const plan: PartImport = planPartImport(book, part, choices, renames);
  // The files the resources brought point at, and the fonts of the families added.
  const named = JSON.stringify(plan.resources);
  await Promise.all(part.blobs.filter((b) => named.includes(b.fileId)).map(async (b) => {
    await putBlobAt(b.fileId, b.bytes, b.mime);
    invalidateResourceImage(b.fileId);
  }));
  const fontIds = JSON.stringify(plan.customFonts ?? []);
  await Promise.all(part.fonts.filter((f) => fontIds.includes(f.fileId)).map((f) => putFontFile(f)));

  const now = Date.now();
  for (const step of plan.steps) {
    if (step.kind === 'replace') {
      const before = book.chapters.find((c) => c.id === step.chapterId)!.markdown;
      const change = minimalChange(before, step.markdown);
      if (change) await dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: step.chapterId, changes: [change], baseLength: before.length } });
      if (step.title && step.title !== book.chapters.find((c) => c.id === step.chapterId)!.title) {
        await dispatch({ type: 'RENAME_CHAPTER', payload: { id: step.chapterId, title: step.title } });
      }
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
    renamed: clashes.map((c) => ({ from: c.id, to: renames[c.id] ?? c.rename })).filter((r) => r.from !== r.to),
    fontsAdded: plan.fontsAdded,
  };
}
