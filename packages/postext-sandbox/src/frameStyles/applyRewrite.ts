/**
 * Writing a style merge or rename into the book on screen (#873), as
 * steps of the Sandbox's one history (#899): one step per chapter whose
 * fences are rewritten, then one for the styles and the templates. Undo
 * then takes the styles back first, so every state on the way names styles
 * that exist; the Frame styles section offers one button that takes the
 * whole rewrite back.
 */

import type { Dispatch } from 'react';
import type { PostextConfig } from 'postext';
import type { SandboxAction } from '../context/SandboxContext.js';
import { applyViewerEdit } from '../editor/viewerEdits.js';
import type { HistoryStepInfo, SandboxHistory } from '../history/sandboxHistory.js';
import type { StyleRewritePlan } from './styleMerge.js';

/** What a rewrite wrote: the chapters it changed, for its undo. */
export interface StyleRewriteRecord {
  message: string;
  chapters: string[];
  /** Steps it added to the history (the chapters and the design). */
  steps: number;
}

/** Write `plan`: the fences of each chapter (the chapter in the editor
 *  through the editor, as one step of its history), then the styles and
 *  templates as one design step of their own. */
export function applyStyleRewrite(
  dispatch: Dispatch<SandboxAction>,
  config: Pick<PostextConfig, 'calloutStyles' | 'pageTemplates'>,
  plan: StyleRewritePlan,
  message: string,
  activeChapterId?: string,
): StyleRewriteRecord {
  for (const c of plan.chapters) {
    if (c.chapterId === activeChapterId) applyViewerEdit(dispatch, c.chapterId, c.changes, c.baseLength);
    else dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: c.chapterId, changes: c.changes, baseLength: c.baseLength } });
  }
  const payload: Partial<PostextConfig> = { calloutStyles: plan.calloutStyles.length > 0 ? plan.calloutStyles : undefined };
  if (plan.pageTemplates !== config.pageTemplates) payload.pageTemplates = plan.pageTemplates;
  // The boxes the exercises name (#1244), in the same step.
  if ('exerciseStyles' in plan) payload.exerciseStyles = plan.exerciseStyles;
  if ('exercises' in plan) payload.exercises = plan.exercises;
  dispatch({ type: 'UPDATE_CONFIG', payload, history: { merge: false } });
  return { message, chapters: plan.chapters.map((c) => c.chapterId), steps: plan.chapters.length + 1 };
}

/** The step is one `record` added: its design step, or the fences of one
 *  of its chapters. */
function ownStep(step: HistoryStepInfo | null, record: StyleRewriteRecord, chapters: ReadonlySet<string>, designDone: boolean): 'design' | 'text' | null {
  if (!step) return null;
  if (step.kind === 'config') return !designDone && step.keys.includes('calloutStyles') ? 'design' : null;
  // A picture's marks (#866) and a group (#1397) are no step of a rewrite.
  if (step.kind === 'resource' || step.kind === 'group') return null;
  return chapters.has(step.chapterId) ? 'text' : null;
}

/** Whether the latest steps of the history are still `record`'s (nothing
 *  was changed after it). */
export function canUndoStyleRewrite(history: Pick<SandboxHistory, 'peek'> | undefined, record: StyleRewriteRecord | null): boolean {
  if (!history || !record) return false;
  return ownStep(history.peek(), record, new Set(record.chapters), false) !== null;
}

/** Take back `record`'s steps from the top of the history, and no other;
 *  the number taken back. */
export function undoStyleRewrite(history: Pick<SandboxHistory, 'peek' | 'undo'>, record: StyleRewriteRecord): number {
  const chapters = new Set(record.chapters);
  let designDone = false;
  let taken = 0;
  while (taken < record.steps) {
    const own = ownStep(history.peek(), record, chapters, designDone);
    if (!own) break;
    const step = history.undo();
    if (!step) break;
    if (own === 'design') designDone = true;
    else if (step.kind === 'text') chapters.delete(step.chapterId);
    taken++;
  }
  return taken;
}
