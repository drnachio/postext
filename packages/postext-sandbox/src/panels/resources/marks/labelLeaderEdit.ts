import type { TextChange } from '../../../book/textChanges.js';
import { setLabelAttr, setLabelLeader, type LabelLeaderChoice } from '../../../editor/syntax/labelAttrs.js';
import type { MarkdownLabel } from './figureLabels.js';

// ---------------------------------------------------------------------------
// A label's own attribute written into its chapter (#1064): the anchor
// editor's per-label leader switch and the sandbox_edit_labels tool make
// the same change, one step of the history. The chapter on screen is read
// as typed (its offsets are those of the live text). Pure.
// ---------------------------------------------------------------------------

/** The chapters as the Sandbox holds them. */
export interface ChapterTexts {
  chapters: readonly { id: string; markdown: string }[];
  activeChapterId: string;
  /** The chapter on screen, as typed. */
  markdown: string;
}

/** The text of chapter `id` the label offsets refer to. */
export function chapterText(state: ChapterTexts, id: string): string | undefined {
  if (id === state.activeChapterId) return state.markdown;
  return state.chapters.find((c) => c.id === id)?.markdown;
}

export interface LabelEdit {
  chapterId: string;
  change: TextChange;
  baseLength: number;
}

/** The edit that writes `choice` as `label`'s own `leader` attribute; null
 *  when it says so already or the label is not where it was read. */
export function labelLeaderEdit(state: ChapterTexts, label: Pick<MarkdownLabel, 'chapterId' | 'start' | 'textEnd'>, choice: LabelLeaderChoice): LabelEdit | null {
  const text = chapterText(state, label.chapterId);
  if (text === undefined) return null;
  const change = setLabelLeader(text, label, choice);
  return change ? { chapterId: label.chapterId, change, baseLength: text.length } : null;
}

/** The edit that sets attribute `key` of `label` (see `setLabelAttr`). */
export function labelAttrEdit(state: ChapterTexts, label: Pick<MarkdownLabel, 'chapterId' | 'start' | 'textEnd'>, key: string, value: string | true | null): LabelEdit | null {
  const text = chapterText(state, label.chapterId);
  if (text === undefined) return null;
  const change = setLabelAttr(text, label, key, value);
  return change ? { chapterId: label.chapterId, change, baseLength: text.length } : null;
}

/** What a label's own `leader` attribute says. */
export const labelLeaderChoice = (label: Pick<MarkdownLabel, 'leader'>): LabelLeaderChoice => (label.leader === undefined ? 'anchor' : label.leader ? 'on' : 'off');
