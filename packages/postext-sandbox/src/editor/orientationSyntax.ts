'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';

/**
 * Editor support for the orientation marks of vertical text (`:tcy[12]`,
 * `:upright[GDP]`, `:sideways[12]`): a highlighter that marks each
 * directive's brackets and underlines its text.
 */

/** The engine's `ORIENTATION_MARK_RE` (one line, non-empty text, `\]` for
 *  a literal bracket). */
const MARK_RE = /:(tcy|upright|sideways)\[((?:\\.|[^\]\\\n])+)\]/g;

const delimMark = Decoration.mark({ class: 'cm-orientation-delim' });
const textMark = Decoration.mark({ class: 'cm-orientation-text' });

/** The decoration ranges of every orientation mark on a line, relative to
 *  the line. */
export function orientationRanges(text: string): Array<{ from: number; to: number; kind: 'delim' | 'text' }> {
  const out: Array<{ from: number; to: number; kind: 'delim' | 'text' }> = [];
  MARK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARK_RE.exec(text)) !== null) {
    const start = m.index;
    const textStart = start + m[1]!.length + 2;
    const textEnd = textStart + m[2]!.length;
    out.push({ from: start, to: textStart, kind: 'delim' });
    out.push({ from: textStart, to: textEnd, kind: 'text' });
    out.push({ from: textEnd, to: textEnd + 1, kind: 'delim' });
  }
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
