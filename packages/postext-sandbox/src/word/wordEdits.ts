// An edited Word export coming back (#1397): the edits `applyDocxEdits`
// finds in it, grouped as the review dialog and the tool list them, and
// written into the book as one change of the Sandbox's history.

import type { PostextConfig, Resource } from 'postext';
import { applyDocxEdits, exportMapLost, isExportedDocx, rebuildExportMap, type DocxComment, type DocxEdit, type DocxEditResult, type DocxImportNote, type RebuiltMap } from 'postext/word';
import { minimalChange } from '../book/textChanges.js';
import type { Chapter } from '../book/types.js';
import type { SandboxAction } from '../context/SandboxContext.js';
import { applyViewerEdit } from '../editor/viewerEdits.js';
import type { HistoryGroup, SandboxHistory } from '../history/sandboxHistory.js';
import type { SandboxLabels } from '../types/index.js';
import { rasterizeSvg, wordResourceBytes } from './wordExport.js';

/** The edits of one chapter, one resource, or the text the book makes
 *  itself (numbers, labels: `generated`); the comments left on no text
 *  that was exported (`comments`). */
export interface WordEditGroup {
  key: string;
  kind: 'chapter' | 'resource' | 'generated' | 'comments';
  chapterId?: string;
  resourceId?: string;
  edits: DocxEdit[];
  comments: DocxComment[];
}

export interface WordEditsReview {
  result: DocxEditResult;
  groups: WordEditGroup[];
  counts: { applied: number; conflict: number; rejected: number };
  /** Word dropped the hidden marks: none of the file's changes can be
   *  placed (the one edit saying so is counted, not grouped). */
  lost: boolean;
  /** What the import says about the file as a whole (`DocxImportNote`):
   *  its map written again from the book, a book that changed since. */
  notes: DocxImportNote[];
  /** Chapters whose text the applied edits change: id → new text. */
  chapterTexts: Map<string, string>;
  /** Resources the applied edits change, as they should be written. */
  resources: Resource[];
}

export interface WordEditsSource {
  chapters: readonly Chapter[];
  activeChapterId: string;
  /** The chapter on screen (mirrors its entry in `chapters`). */
  markdown: string;
  resources: readonly Resource[];
}

/** A chapter's text as the book holds it now. */
function chapterText(s: WordEditsSource, id: string): string | undefined {
  if (id === s.activeChapterId) return s.markdown;
  return s.chapters.find((c) => c.id === id)?.markdown;
}

/** Whether `bytes` is a Word document this book may take changes from: a
 *  postext export, with its export map or (as Google Docs saves it)
 *  without. */
export function isWordExport(bytes: Uint8Array): boolean {
  return isExportedDocx(bytes) || exportMapLost(bytes);
}

/**
 * The export map of a file that came back without it, written again from
 * the book as it stands (#1458): Google Docs drops the map and keeps the
 * marks, and the same book gives the same marks again. Undefined for a
 * file that carries its map; `null` when the map is gone and this book
 * cannot give it back (the file was exported from another book). The
 * map holds the book as it was read here, so a change made to the book
 * afterwards is merged by `reviewWordEdits` like any other.
 */
export async function rebuildWordMap(bytes: Uint8Array, s: WordEditsSource & { config: PostextConfig }): Promise<RebuiltMap | null | undefined> {
  if (!exportMapLost(bytes)) return undefined;
  const files = await wordResourceBytes(s.resources);
  const rebuilt = await rebuildExportMap(bytes, {
    chapters: s.chapters.map((c) => ({ id: c.id, title: c.title, markdown: chapterText(s, c.id) ?? c.markdown })),
    config: s.config,
    resources: [...s.resources],
    resourceBytes: (id) => files.get(id),
    rasterizeSvg,
  });
  return rebuilt ?? null;
}

/** Read an exported .docx against the book as it stands now (throws
 *  `DocxReadError` for a file that is not one). Nothing changes.
 *  `rebuilt`: the map of a file that came back without one
 *  (`rebuildWordMap`). */
export function reviewWordEdits(bytes: Uint8Array, s: WordEditsSource, rebuilt?: RebuiltMap): WordEditsReview {
  const result = applyDocxEdits(bytes, {
    chapters: s.chapters.map((c) => ({ id: c.id, title: c.title, markdown: chapterText(s, c.id) ?? c.markdown })),
    resources: [...s.resources],
  }, rebuilt ? { rebuilt } : {});
  const groups: WordEditGroup[] = [];
  const groupOf = (e: { chapter?: string; resourceId?: string }, loose: 'generated' | 'comments'): WordEditGroup => {
    const kind = e.chapter !== undefined ? 'chapter' : e.resourceId !== undefined ? 'resource' : loose;
    const key = kind === 'chapter' ? `c:${e.chapter}` : kind === 'resource' ? `r:${e.resourceId}` : kind;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, kind, edits: [], comments: [], ...(e.chapter !== undefined ? { chapterId: e.chapter } : {}), ...(e.resourceId !== undefined ? { resourceId: e.resourceId } : {}) };
      groups.push(g);
    }
    return g;
  };
  const counts = { applied: 0, conflict: 0, rejected: 0 };
  let lost = false;
  for (const e of result.edits) {
    counts[e.status]++;
    if (e.reason === 'bookmarks-lost' && e.chapter === undefined && e.resourceId === undefined) lost = true;
    else groupOf(e, 'generated').edits.push(e);
  }
  for (const c of result.comments) groupOf(c, 'comments').comments.push(c);
  // Chapters in book order, then resources, the generated text, and the
  // comments on no exported text.
  const rank = { chapter: 0, resource: 1, generated: 2, comments: 3 };
  const order = (g: WordEditGroup): number => {
    if (g.kind === 'chapter') {
      const i = s.chapters.findIndex((c) => c.id === g.chapterId);
      return i < 0 ? s.chapters.length : i;
    }
    return s.chapters.length + rank[g.kind];
  };
  groups.sort((a, b) => order(a) - order(b));

  const chapterTexts = new Map<string, string>();
  for (const c of result.chapters) {
    const now = chapterText(s, c.id);
    if (now !== undefined && now !== c.markdown) chapterTexts.set(c.id, c.markdown);
  }
  const before = new Map(s.resources.map((r) => [r.id, r]));
  const resources = (result.resources ?? []).filter((r) => {
    const old = before.get(r.id);
    return old !== undefined && JSON.stringify(old) !== JSON.stringify(r);
  });
  return { result, groups, counts, lost, notes: result.notes ?? [], chapterTexts, resources };
}

/** Whether applying the review changes the book. */
export const reviewChanges = (r: WordEditsReview): boolean => r.chapterTexts.size > 0 || r.resources.length > 0;

/** A piece of edited text made readable on one line: line breaks shown,
 *  a long one cut in the middle, nothing but spaces named. */
export function editSnippet(text: string, max = 90): string {
  let t = text.replace(/\r?\n/g, ' ¶ ').replace(/\t/g, ' ⇥ ');
  if (t.length > max) {
    const half = Math.floor((max - 1) / 2);
    t = `${t.slice(0, half)}…${t.slice(t.length - half)}`;
  }
  return t.trim() === '' ? t.replace(/ /g, '␣') : t;
}

/** Why an edit could not go in, in words. */
export function editReasonText(labels: SandboxLabels, reason: string | undefined): string | null {
  switch (reason) {
    case undefined: return null;
    case 'generated': return labels.wordEditReasonGenerated;
    case 'bookmarks-lost': return labels.wordEditReasonBookmarksLost;
    case 'format-crosses-markup': return labels.wordEditReasonFormatCrossesMarkup;
    case 'format-partial': return labels.wordEditReasonFormatPartial;
    case 'target-missing': return labels.wordEditReasonTargetMissing;
    case 'no-snapshot': return labels.wordEditReasonNoSnapshot;
    case 'changed-since-export': return labels.wordEditReasonChangedSinceExport;
    case 'overlap': return labels.wordEditReasonOverlap;
    case 'citation': return labels.wordEditReasonCitation;
    case 'citation-part': return labels.wordEditReasonCitationPart;
    default: return labels.wordEditReasonOther;
  }
}

/** The citation an edit falls in (#1516), and the part of it the author
 *  wrote, in words; empty for an edit outside citations. */
export function editCitationText(labels: SandboxLabels, e: Pick<DocxEdit, 'citation' | 'citationPart'>): string {
  if (e.citation === undefined) return '';
  const label = e.citationPart === 'prefix' ? labels.wordEditCitationPrefix
    : e.citationPart === 'locator' ? labels.wordEditCitationLocator
    : e.citationPart === 'suffix' ? labels.wordEditCitationSuffix
    : labels.wordEditCitation;
  return label.replace('__keys__', e.citation);
}

/** What the import says about the file as a whole, in words. */
export function importNoteText(labels: SandboxLabels, note: DocxImportNote): string {
  switch (note.code) {
    case 'map-rebuilt': return labels.wordEditsNoteRebuilt;
    case 'book-changed': return labels.wordEditsNoteBookChanged;
    case 'book-unverified': return labels.wordEditsNoteUnverified;
    case 'writer-changed': return labels.wordEditsNoteWriterChanged;
    case 'chapters-missing': return labels.wordEditsNoteChaptersMissing;
  }
}

/** The field of a resource an edit changed, in words. */
export function editFieldText(labels: SandboxLabels, field: string | undefined): string {
  if (!field) return '';
  if (field.startsWith('cell:')) return labels.wordEditFieldCell;
  switch (field) {
    case 'caption': return labels.wordEditFieldCaption;
    case 'note': return labels.wordEditFieldNote;
    case 'alt': return labels.wordEditFieldAlt;
    case 'label': return labels.wordEditFieldLabel;
    default: return field;
  }
}

/** What applying a review wrote. */
export interface WordEditsWritten {
  chapters: string[];
  resources: string[];
  /** The history group gathering the steps (closes by itself). */
  group: HistoryGroup | null;
}

/** Write the applied edits into the book as one change of the history:
 *  each chapter's text as one edit (the chapter on screen through its
 *  editor), then the resources, gathered into one step that Cmd/Ctrl+Z
 *  and `sandbox_undo` take back whole. */
export function writeWordEdits(
  dispatch: (action: SandboxAction) => void,
  history: Pick<SandboxHistory, 'group'> | null | undefined,
  s: WordEditsSource,
  review: WordEditsReview,
  now = Date.now(),
): WordEditsWritten {
  const edits: { id: string; from: string; to: string }[] = [];
  for (const c of s.chapters) {
    const to = review.chapterTexts.get(c.id);
    const from = chapterText(s, c.id);
    if (to !== undefined && from !== undefined && to !== from) edits.push({ id: c.id, from, to });
  }
  const resources = review.resources.filter((r) => s.resources.some((x) => x.id === r.id));
  if (edits.length === 0 && resources.length === 0) return { chapters: [], resources: [], group: null };
  const group = history?.group('word', { chapters: edits.map((e) => e.id), resources: resources.map((r) => r.id) }) ?? null;
  for (const e of edits) {
    const change = minimalChange(e.from, e.to)!;
    if (e.id === s.activeChapterId) applyViewerEdit(dispatch, e.id, [change], e.from.length);
    else dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: e.id, changes: [change], baseLength: e.from.length } });
  }
  for (const r of resources) dispatch({ type: 'UPSERT_RESOURCE', payload: { ...r, updatedAt: now }, history: { merge: false } });
  return { chapters: edits.map((e) => e.id), resources: resources.map((r) => r.id), group };
}
