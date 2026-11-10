'use client';

import { MatchDecorator, ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * No-break spaces in the Markdown editor: each is shown (a tinted space
 * with a small mark under it), since it looks like any other space, and
 * the toolbar's "Keep on one line" button turns the spaces of a selection
 * into no-break spaces, or back. A line never breaks at one: the words it
 * joins stay together ("LR+ = 18.29", "authors [12]").
 */

const NBSP = '\u00A0';

const decorator = new MatchDecorator({
  regexp: /\u00A0/g,
  decoration: Decoration.mark({ class: 'cm-nbsp', attributes: { title: 'No-break space' } }),
});

export const noBreakHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorator.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = decorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

export const noBreakTheme = EditorView.baseTheme({
  '.cm-nbsp': {
    backgroundColor: 'rgba(212, 140, 40, 0.18)',
    borderBottom: '1px dotted rgba(212, 140, 40, 0.9)',
  },
});

/**
 * `text` (a selection) kept on one line: its spaces and tabs become
 * no-break spaces. A selection that already holds no-break spaces and no
 * plain space is given its plain spaces back, so the same button undoes it.
 * Line ends are left as they are.
 */
export function toggleNoBreak(text: string): string {
  if (!/[ \t]/.test(text) && text.includes(NBSP)) return text.replace(/\u00A0/g, ' ');
  return text.replace(/[ \t]/g, NBSP);
}

/** Apply {@link toggleNoBreak} to the editor's selection, keeping it
 *  selected. Nothing happens without a selection. */
export function keepSelectionTogether(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    view.focus();
    return;
  }
  const insert = toggleNoBreak(view.state.sliceDoc(from, to));
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from, head: from + insert.length } });
  view.focus();
}
