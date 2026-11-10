'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { underlineRanges as engineUnderlineRanges } from 'postext';
import { inFencedCode } from './codeFences.js';

/**
 * Editor support for underlined text (`++text++`): the markers in the
 * colour of the other marks and the text underlined, where the engine
 * reads an underline (`use ++i rather than i++` stays plain).
 */

const delimMark = Decoration.mark({ class: 'cm-underline-delim' });
const textMark = Decoration.mark({ class: 'cm-underline-text' });

/** The decoration ranges of every underlined run on a line, relative to
 *  the line. */
export function underlineRanges(text: string): Array<{ from: number; to: number; kind: 'delim' | 'text' }> {
  return engineUnderlineRanges(text).flatMap(({ from, to, marker }) => [
    { from, to: from + marker, kind: 'delim' as const },
    { from: from + marker, to: to - marker, kind: 'text' as const },
    { from: to - marker, to, kind: 'delim' as const },
  ]);
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (!inFencedCode(doc, line.number)) {
        for (const r of underlineRanges(line.text)) {
          builder.add(line.from + r.from, line.from + r.to, r.kind === 'delim' ? delimMark : textMark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const underlineHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const underlineTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-underline-delim': {
      color: 'var(--brand)',
    },
    '.cm-underline-text': {
      textDecoration: 'underline',
    },
  }),
);
