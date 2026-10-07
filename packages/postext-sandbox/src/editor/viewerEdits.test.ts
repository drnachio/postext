import { afterEach, describe, expect, it } from 'vitest';
import type { SandboxAction } from '../context/SandboxContext';
import { applyTextChanges } from '../book/textChanges';
import { applyViewerEdit, redoViewerEdit, resetViewerEdits, takeViewerChanges, undoViewerEdit } from './viewerEdits';

afterEach(() => resetViewerEdits());

describe('viewer edits', () => {
  it('hands the editor the exact changes, then undoes and redoes them without an editor', () => {
    let text = 'split="30 / *"\n::panel\n';
    const sent: SandboxAction[] = [];
    const dispatch = (a: SandboxAction) => {
      sent.push(a);
      if (a.type === 'EDIT_CHAPTER_MARKDOWN') text = applyTextChanges(text, a.payload.changes);
    };
    const before = text;
    applyViewerEdit(dispatch, 'c1', [{ from: 7, to: 9, insert: '45', expect: '30' }, { from: 23, to: 23, insert: '::panel\n', expect: '' }], text.length);
    const after = text;
    expect(after).toBe('split="45 / *"\n::panel\n::panel\n');
    // The editor syncing the new value gets the two changes, not a diff.
    expect(takeViewerChanges(before, after)).toHaveLength(2);
    expect(takeViewerChanges(before, after)).toBeNull();
    expect(undoViewerEdit()).toBe(true);
    expect(text).toBe(before);
    expect(redoViewerEdit()).toBe(true);
    expect(text).toBe(after);
    expect(undoViewerEdit()).toBe(true);
    expect(undoViewerEdit()).toBe(false);
    expect(sent.every((a) => a.type === 'EDIT_CHAPTER_MARKDOWN' && a.payload.chapterId === 'c1')).toBe(true);
  });
});
