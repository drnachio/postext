'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { orientationMarkAt } from 'postext';

/**
 * Editor support for the orientation marks of vertical text (`:tcy[12]`,
 * `:upright[GDP]`, `:sideways[12]`): a highlighter that marks each
 * directive's brackets and underlines its text.
 */

const delimMark = Decoration.mark({ class: 'cm-orientation-delim' });
const textMark = Decoration.mark({ class: 'cm-orientation-text' });

type OrientationRange = { from: number; to: number; kind: 'delim' | 'text' };

/** The ranges of the marks in `[from, to)` of `text`, in order; `inside`
 *  when the range is a mark's text, whose pieces between inner marks are
 *  text. The engine's rule (`orientationMarkAt`): one line, non-empty
 *  text, balanced brackets inside, `\]` for a literal bracket. */
function collect(text: string, from: number, to: number, inside: boolean, out: OrientationRange[]): void {
  let last = from;
  for (let i = text.indexOf(':', from); i >= 0 && i < to; i = text.indexOf(':', i + 1)) {
    const mark = orientationMarkAt(text, i, to);
    if (!mark) continue;
    if (inside && i > last) out.push({ from: last, to: i, kind: 'text' });
    out.push({ from: i, to: mark.start, kind: 'delim' });
    collect(text, mark.start, mark.close, true, out);
    out.push({ from: mark.close, to: mark.close + 1, kind: 'delim' });
    last = mark.close + 1;
    i = mark.close;
  }
  if (inside && to > last) out.push({ from: last, to, kind: 'text' });
}

/** The decoration ranges of every orientation mark on a line, relative to
 *  the line, in order and apart: a mark inside another one splits its
 *  text. */
export function orientationRanges(text: string): OrientationRange[] {
  const out: OrientationRange[] = [];
  collect(text, 0, text.length, false, out);
  return out;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (line.text.includes(':tcy[') || line.text.includes(':upright[') || line.text.includes(':sideways[')) {
        for (const r of orientationRanges(line.text)) {
          builder.add(line.from + r.from, line.from + r.to, r.kind === 'delim' ? delimMark : textMark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const orientationHighlight = ViewPlugin.fromClass(
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

export const orientationTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-orientation-delim': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-orientation-text': {
      textDecoration: 'underline dotted',
      textUnderlineOffset: '3px',
    },
  }),
);
