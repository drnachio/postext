/**
 * Writing a reshape of the page templates into the book on screen (#1065):
 * «Turn these frames into a grid», «Extract a module», a module renamed or
 * written into a page. As a style merge (#873), the chapters' text first,
 * each one step of the Sandbox's one history (#899), then the templates as
 * one design step; undo takes the design back first. The Design panel and
 * the sandbox_* tools write through here.
 */

import type { Dispatch } from 'react';
import type { PageTemplate } from 'postext';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import type { TextChange } from '../book/textChanges.js';
import { applyViewerEdit } from '../editor/viewerEdits.js';
import type { HistoryStepInfo, SandboxHistory } from '../history/sandboxHistory.js';

export interface TemplateRewrite {
  /** The templates after it; undefined: they do not change. */
  templates?: readonly PageTemplate[];
  chapters: readonly { chapterId: string; changes: readonly TextChange[]; baseLength: number }[];
}

export interface TemplateRewriteRecord {
  chapters: string[];
  design: boolean;
  /** Steps it added to the history. */
  steps: number;
}

/** The chapters as the edits read them: the one in the editor with the
 *  editor's text. */
export function bookChapters(s: Pick<SandboxState, 'chapters' | 'activeChapterId' | 'markdown'>): { id: string; title: string; markdown: string }[] {
  return s.chapters.map((c) => ({ id: c.id, title: c.title, markdown: c.id === s.activeChapterId ? s.markdown : c.markdown }));
}

export function applyTemplateRewrite(dispatch: Dispatch<SandboxAction>, rewrite: TemplateRewrite, activeChapterId?: string): TemplateRewriteRecord {
  for (const c of rewrite.chapters) {
    if (c.changes.length === 0) continue;
    if (c.chapterId === activeChapterId) applyViewerEdit(dispatch, c.chapterId, [...c.changes], c.baseLength);
    else dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: c.chapterId, changes: [...c.changes], baseLength: c.baseLength } });
  }
  const chapters = rewrite.chapters.filter((c) => c.changes.length > 0).map((c) => c.chapterId);
  if (rewrite.templates) {
    dispatch({ type: 'UPDATE_CONFIG', payload: { pageTemplates: rewrite.templates.length > 0 ? [...rewrite.templates] : undefined }, history: { merge: false } });
  }
  return { chapters, design: !!rewrite.templates, steps: chapters.length + (rewrite.templates ? 1 : 0) };
}

function ownStep(step: HistoryStepInfo | null, chapters: ReadonlySet<string>, designLeft: boolean): 'design' | 'text' | null {
  if (!step) return null;
  if (step.kind === 'config') return designLeft && step.keys.includes('pageTemplates') ? 'design' : null;
  if (step.kind === 'resource' || step.kind === 'group') return null;
  return chapters.has(step.chapterId) ? 'text' : null;
}

/** Whether the latest steps of the history are still `record`'s. */
export function canUndoTemplateRewrite(history: Pick<SandboxHistory, 'peek'> | undefined, record: TemplateRewriteRecord | null): boolean {
  if (!history || !record || record.steps === 0) return false;
  return ownStep(history.peek(), new Set(record.chapters), record.design) !== null;
}

/** Take back `record`'s steps from the top of the history; the number
 *  taken back. */
export function undoTemplateRewrite(history: Pick<SandboxHistory, 'peek' | 'undo'>, record: TemplateRewriteRecord): number {
  const chapters = new Set(record.chapters);
  let designLeft = record.design;
  let taken = 0;
  while (taken < record.steps) {
    const own = ownStep(history.peek(), chapters, designLeft);
    if (!own) break;
    const step = history.undo();
    if (!step) break;
    if (own === 'design') designLeft = false;
    else if (step.kind === 'text') chapters.delete(step.chapterId);
    taken++;
  }
  return taken;
}
