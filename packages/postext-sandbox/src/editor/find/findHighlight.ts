// The find bar's matches painted in the chapter editor: every match tinted,
// the current one stronger. The bar computes them (editor/FindBar.tsx);
// the editor hands them in with `showFindMatches`.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { findCommands, openFind, searchableSelection } from './findStore.js';

const setFindMatches = StateEffect.define<{ ranges: readonly { from: number; to: number }[]; current: number }>();

const matchMark = Decoration.mark({ class: 'cm-findMatch' });
const currentMark = Decoration.mark({ class: 'cm-findMatch cm-findMatch-current' });

const findMatchesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFindMatches)) continue;
      const len = tr.state.doc.length;
      const marks = e.value.ranges
        .filter((r) => r.from < r.to && r.to <= len)
        .map((r, i) => (i === e.value.current ? currentMark : matchMark).range(r.from, r.to));
      next = Decoration.set(marks, true);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const findTheme = EditorView.baseTheme({
  '.cm-findMatch': {
    backgroundColor: 'color-mix(in srgb, var(--brand) 22%, transparent)',
    borderRadius: '2px',
  },
  '.cm-findMatch-current': {
    backgroundColor: 'color-mix(in srgb, var(--brand) 50%, transparent)',
    outline: '1px solid var(--brand)',
  },
});

function selectionQuery(view: EditorView): string | undefined {
  const { from, to } = view.state.selection.main;
  return searchableSelection(view.state.sliceDoc(from, to));
}

/** Mod-F opens the find bar on the chapter, Mod-Shift-F on the whole
 *  book (the selection, when there is one, as the query); Mod-Alt-F opens
 *  it with the replace row (Cmd-H hides the app on a Mac); Mod-G / F3 go to the next match and Shift with
 *  them to the previous one. */
const findKeymap = keymap.of([
  { key: 'Mod-f', preventDefault: true, run: (view) => { openFind({ scope: 'chapter', query: selectionQuery(view) }); return true; } },
  { key: 'Mod-Shift-f', preventDefault: true, run: (view) => { openFind({ scope: 'book', query: selectionQuery(view) }); return true; } },
  { key: 'Mod-Alt-f', preventDefault: true, run: (view) => { openFind({ query: selectionQuery(view), replace: true }); return true; } },
  { key: 'Mod-g', preventDefault: true, run: () => (findCommands.next ? (findCommands.next(), true) : false) },
  { key: 'Shift-Mod-g', preventDefault: true, run: () => (findCommands.previous ? (findCommands.previous(), true) : false) },
  { key: 'F3', run: () => (findCommands.next ? (findCommands.next(), true) : false) },
  { key: 'Shift-F3', run: () => (findCommands.previous ? (findCommands.previous(), true) : false) },
]);

export const findHighlight = [findMatchesField, findTheme, findKeymap];

/** Paint `ranges` in `view`, the one at `current` as the current match. */
export function showFindMatches(view: EditorView, ranges: readonly { from: number; to: number }[], current: number): void {
  view.dispatch({ effects: setFindMatches.of({ ranges, current }) });
}
