'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { inFencedCode } from './codeFences';

/**
 * Editor support for inline small capitals (`:smallcaps[text]`): a
 * highlighter that marks the directive's brackets and sets its text in small
 * capitals, and a completion source that offers the directive after `:sm…`.
 */

/** The engine's `INLINE_SMALLCAPS_RE` (one line, non-empty text, `\]` for a
 *  literal bracket), plus the `:chip[…]` a run may hold: the engine takes
 *  chips out first, so their brackets never close the run. */
const SMALLCAPS_RE = /:smallcaps\[((?::chip\[(?:\\.|[^\]\\\n])+\]|\\.|[^\]\\\n])+)\]/g;
const OPENER = ':smallcaps[';

const delimMark = Decoration.mark({ class: 'cm-smallcaps-delim' });
const textMark = Decoration.mark({ class: 'cm-smallcaps-text' });

/** The decoration ranges of every small-caps run on a line, relative to the
 *  line. */
export function smallCapsRanges(text: string): Array<{ from: number; to: number; kind: 'delim' | 'text' }> {
  const out: Array<{ from: number; to: number; kind: 'delim' | 'text' }> = [];
  SMALLCAPS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SMALLCAPS_RE.exec(text)) !== null) {
    const start = m.index;
    const textStart = start + OPENER.length;
    const textEnd = textStart + m[1]!.length;
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
      if (line.text.includes(OPENER) && !inFencedCode(doc, line.number)) {
        for (const r of smallCapsRanges(line.text)) {
          builder.add(line.from + r.from, line.from + r.to, r.kind === 'delim' ? delimMark : textMark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const smallCapsHighlight = ViewPlugin.fromClass(
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

export const smallCapsTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-smallcaps-delim': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-smallcaps-text': {
      fontVariant: 'small-caps',
    },
  }),
);

/** `:sm`, `:sma`, … `:smallcaps` at the start of a word (`:s` alone is left
 *  to other marks, such as `:swatch`). */
const DIRECTIVE_RE = /:sm(?:a(?:l(?:l(?:c(?:a(?:ps?)?)?)?)?)?)?$/;

/** The completion source: the `:smallcaps[…]` directive after `:sm…`, with
 *  the caret landing between the brackets. */
export function smallCapsCompletionSource(cx: CompletionContext): CompletionResult | null {
  const line = cx.state.doc.lineAt(cx.pos);
  const before = line.text.slice(0, cx.pos - line.from);
  const directive = DIRECTIVE_RE.exec(before);
  if (!directive) return null;
  const start = cx.pos - directive[0].length;
  const prev = start > line.from ? line.text[start - line.from - 1]! : '';
  if (prev !== '' && !/[\s([{"'«¿¡*_]/.test(prev)) return null;
  return {
    from: start,
    to: cx.pos,
    filter: false,
    options: [{
      label: ':smallcaps[…]',
      apply: (view, _c, from, to) => {
        view.dispatch({ changes: { from, to, insert: ':smallcaps[]' }, selection: { anchor: from + OPENER.length } });
      },
    }],
  };
}
