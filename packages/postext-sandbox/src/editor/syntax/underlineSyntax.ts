'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { underlineRanges as engineUnderlineRanges } from 'postext';
import { inFencedCode } from './codeFences.js';

/**
 * Editor support for underlined text: `:underline[text]` always, and the
 * `++text++` shorthand when the document's `bodyText.plusUnderline` is on
 * (#1465). The markers in the colour of the other marks and the text
 * underlined, where the engine reads an underline.
 */

const delimMark = Decoration.mark({ class: 'cm-underline-delim' });
const textMark = Decoration.mark({ class: 'cm-underline-text' });

/** The decoration ranges of every underlined run on a line, relative to
 *  the line; `plusUnderline` reads `++…++` too. */
export function underlineRanges(text: string, plusUnderline = false): Array<{ from: number; to: number; kind: 'delim' | 'text' }> {
  return engineUnderlineRanges(text, { plusUnderline }).flatMap(({ from, to, open, close }) => [
    { from, to: from + open, kind: 'delim' as const },
    { from: from + open, to: to - close, kind: 'text' as const },
    { from: to - close, to, kind: 'delim' as const },
  ]);
}

function buildDecorations(view: EditorView, plusUnderline: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (!inFencedCode(doc, line.number)) {
        for (const r of underlineRanges(line.text, plusUnderline)) {
          builder.add(line.from + r.from, line.from + r.to, r.kind === 'delim' ? delimMark : textMark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/** The highlighter, reading `++…++` when `plusUnderline` is on (put it in
 *  a compartment that follows the configuration). */
export function underlineHighlight(plusUnderline = false) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, plusUnderline);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, plusUnderline);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

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
