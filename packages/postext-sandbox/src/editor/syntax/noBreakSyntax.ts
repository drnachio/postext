'use client';

import { MatchDecorator, ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * No-break spaces in the Markdown editor: each is shown (a tinted space
 * with a small mark under it), since it looks like any other space, with
 * its name as its tooltip: the no-break space (U+00A0), the narrow one
 * (U+202F, before « » ; : ? ! in French, between a number's groups) and
 * the figure space (U+2007, as wide as a digit). The toolbar's "Keep on one
 * line" button turns the spaces of a selection into no-break spaces, or
 * back. A line never breaks at one: the words it joins stay together
 * ("LR+ = 18.29", "authors [12]").
 */

const NBSP = ' ';

/** The names the marks give each space, in the interface's language. */
export interface NoBreakSpaceNames {
  noBreak: string;
  narrow: string;
  figure: string;
}

const ENGLISH: NoBreakSpaceNames = {
  noBreak: 'No-break space (U+00A0)',
  narrow: 'Narrow no-break space (U+202F)',
  figure: 'Figure space (U+2007)',
};

/** The no-break spaces marked, one decoration per kind. */
const SPACES = /[   ]/g;

/** The marks of the no-break spaces in a view, named in `names`. */
export function noBreakDecorator(names: NoBreakSpaceNames = ENGLISH): MatchDecorator {
  const marks = {
    ' ': Decoration.mark({ class: 'cm-nbsp', attributes: { title: names.noBreak } }),
    ' ': Decoration.mark({ class: 'cm-nbsp cm-nbsp-narrow', attributes: { title: names.narrow } }),
    ' ': Decoration.mark({ class: 'cm-nbsp cm-nbsp-figure', attributes: { title: names.figure } }),
  } as const;
  return new MatchDecorator({
    regexp: SPACES,
    decoration: (match) => marks[match[0] as keyof typeof marks],
  });
}

/** The mark of each no-break space, named in `names`. */
export function noBreakHighlight(names: NoBreakSpaceNames = ENGLISH) {
  const decorator = noBreakDecorator(names);
  return ViewPlugin.fromClass(
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
}

/** The marks in the Sandbox's brand colour, the colour the editor gives
 *  its other marks, in either theme. */
export const noBreakTheme = EditorView.baseTheme({
  '.cm-nbsp': {
    backgroundColor: 'color-mix(in srgb, var(--brand) 18%, transparent)',
    borderBottom: '1px dotted color-mix(in srgb, var(--brand) 90%, transparent)',
  },
});

/**
 * `text` (a selection) kept on one line: its spaces and tabs become
 * no-break spaces. A selection that already holds no-break spaces and no
 * plain space is given its plain spaces back, so the same button undoes it.
 * Line ends are left as they are.
 */
export function toggleNoBreak(text: string): string {
  if (!/[ \t]/.test(text) && text.includes(NBSP)) return text.replace(/ /g, ' ');
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
