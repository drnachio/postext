'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type Text } from '@codemirror/state';
import { fencedCodeLines } from 'postext';

/**
 * Code listings in the editor (#624): a ``` or ~~~ fence and the lines up
 * to its closing fence are one region, as the engine reads them: the
 * Postext markup highlighters (maths, chips, tabs, breaks, index marks…)
 * leave the lines inside alone, and the region gets a code background.
 */

const flagsByDoc = new WeakMap<Text, boolean[]>();

/** Whether line `n` (1-based) of `doc` is part of a fenced listing (its
 *  fences included). Read once per document version. */
export function inFencedCode(doc: Text, n: number): boolean {
  let flags = flagsByDoc.get(doc);
  if (!flags) {
    flags = fencedCodeLines(doc.toString().split('\n'));
    flagsByDoc.set(doc, flags);
  }
  return flags[n - 1] ?? false;
}

const codeLine = Decoration.line({ class: 'cm-code-line' });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      if (!inFencedCode(doc, n)) continue;
      const line = doc.line(n);
      builder.add(line.from, line.from, codeLine);
    }
  }
  return builder.finish();
}

export const codeFenceHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (v) => v.decorations },
);

export const codeFenceTheme = EditorView.baseTheme({
  '.cm-code-line': { backgroundColor: 'color-mix(in srgb, var(--slate, #888) 10%, transparent)' },
});
