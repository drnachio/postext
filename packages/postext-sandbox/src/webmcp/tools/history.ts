// The Sandbox's one undo history of text and design (#899), for an agent:
// what Cmd/Ctrl+Z and the Undo / Redo buttons do.

import type { SandboxState } from '../../context/SandboxContext.js';
import type { HistoryStepInfo } from '../../history/sandboxHistory.js';
import { stateReaches } from '../chapterEdits.js';
import type { SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { WAIT_PARAM, layoutAnswer } from './book.js';

/** How long a change taken back may take to reach the state. */
const LANDING_MS = 5000;

/** A step of the history as the tools name it. */
export function describeHistoryStep(state: SandboxState, step: HistoryStepInfo): Record<string, unknown> {
  if (step.kind === 'text') {
    const index = state.chapters.findIndex((c) => c.id === step.chapterId);
    return { kind: 'text', chapter: index + 1, title: state.chapters[index]?.title ?? null };
  }
  if (step.kind === 'resource') return { kind: 'resource', resource: step.resourceId };
  if (step.kind === 'group') {
    const chapters = step.chapterIds.map((id) => state.chapters.findIndex((c) => c.id === id) + 1).filter((n) => n > 0);
    return { kind: 'wordEdits', chapters, ...(step.resourceIds.length > 0 ? { resources: step.resourceIds } : {}) };
  }
  return { kind: 'design', settings: step.paths };
}

/** What `sandbox_get_state` says of the history: the change undo would
 *  take back and the one redo would put back. */
export function historyState(host: SandboxToolHost): Record<string, unknown> {
  const { history } = host.store;
  if (!history) return {};
  const s = host.store.getSnapshot();
  const undo = history.peek(false);
  const redo = history.peek(true);
  return { history: { undo: undo ? describeHistoryStep(s, undo) : null, redo: redo ? describeHistoryStep(s, redo) : null } };
}

export function historyTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const undo: WebMcpTool = {
    name: 'sandbox_undo',
    title: 'Sandbox: take back the last change',
    description: "Take back the last change to the book, whatever it was, as Cmd/Ctrl+Z and the Undo button do; with redo put back the last one taken back. The Sandbox keeps one history of the text and the design in the order the changes were made: text typed in the Manuscript editor or edited by a tool or on the previews, and every change to the configuration (a setting set by sandbox_set_config or in the Design panel, a frame dragged in Design mode, a page template added). A setting dragged or typed digit by digit is one change. Answers with what was taken back: kind text with its chapter, or kind design with the settings it touched; then whether there is more to undo or redo. The chapter on screen stays the one on screen. The marks of a picture (its label anchors, safe area and lettering zones) saved in the Resources panel, set by sandbox_save_resource with marks, or an anchor dragged on a page are kind resource with the resource id. The changes of an edited Word export applied by sandbox_apply_word_edits or the import dialog are one change, kind wordEdits with the chapters (and resources) it touched. Chapters added, removed, split, merged or moved, other resource changes and fonts are not in the history, and opening another book empties it. For text only, sandbox_undo_text.",
    inputSchema: {
      type: 'object',
      properties: {
        redo: { type: 'boolean', description: 'Put back the last change taken back, instead of taking one back.' },
        wait: WAIT_PARAM,
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const redo = args.redo === true;
      const { history } = store;
      const before = store.getSnapshot();
      const step = redo ? history.redo() : history.undo();
      if (!step) {
        throw new ToolError(redo
          ? 'There is nothing to put back: nothing was taken back since the last change.'
          : 'There is nothing to take back: no change was made to this book since it was opened (or the page was loaded).');
      }
      // Answered once the change is in the state.
      await stateReaches(host, () => store.getSnapshot() !== before, LANDING_MS);
      const s = store.getSnapshot();
      return {
        [redo ? 'redone' : 'undone']: describeHistoryStep(s, step),
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  return [undo];
}
