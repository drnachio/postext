'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { inFencedCode } from './codeFences.js';

/**
 * Editor support for highlight marks (`:mark[text]{style="…"}`, #888): a
 * highlighter that marks the directive (brackets, attributes) and tints
 * the marked text, and a completion source that offers the directive after
 * `:m…` and the configured style ids inside `style="…"`.
 */

const OPENER = ':mark[';

const delimMark = Decoration.mark({ class: 'cm-mark-delim' });
const textMark = Decoration.mark({ class: 'cm-mark-text' });
const attrMark = Decoration.mark({ class: 'cm-mark-attr' });

/** The decoration ranges of every mark on a line, relative to the line:
 *  the engine's grammar on one line (brackets nest, `\]` is a bracket of
 *  the text, the text is not empty, `{attrs}` right after). A mark whose
 *  text runs on to the next line is left plain. */
export function markRanges(text: string): Array<{ from: number; to: number; kind: 'delim' | 'text' | 'attr' }> {
  const out: Array<{ from: number; to: number; kind: 'delim' | 'text' | 'attr' }> = [];
  for (let at = text.indexOf(OPENER); at >= 0; ) {
    const from = at + OPENER.length;
    let depth = 0;
    let i = from;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (c === '\\') { i++; continue; }
      if (c === '[') depth++;
      else if (c === ']') {
        if (depth === 0) break;
        depth--;
      }
    }
    if (i >= text.length || i === from) {
      at = text.indexOf(OPENER, at + 1);
      continue;
    }
    out.push({ from: at, to: from, kind: 'delim' });
    out.push({ from, to: i, kind: 'text' });
    out.push({ from: i, to: i + 1, kind: 'delim' });
    let end = i + 1;
    if (text[end] === '{') {
      const close = text.indexOf('}', end);
      if (close > end) {
        out.push({ from: end, to: close + 1, kind: 'attr' });
        end = close + 1;
      }
    }
    at = text.indexOf(OPENER, end);
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
        // Sorted by start for the builder (the ranges of one mark are in
        // order, marks follow each other).
        for (const r of markRanges(line.text)) {
          const mark = r.kind === 'delim' ? delimMark : r.kind === 'text' ? textMark : attrMark;
          builder.add(line.from + r.from, line.from + r.to, mark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const markHighlight = ViewPlugin.fromClass(
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

export const markTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-mark-delim': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-mark-text': {
      backgroundColor: 'rgba(255, 214, 10, 0.32)',
    },
    '.cm-mark-attr': {
      color: 'var(--slate)',
    },
  }),
);

/** A highlight style the completion offers (id + display name). */
export interface MarkStyleOption {
  id: string;
  name?: string;
}

/** `:m`, `:ma`, `:mar`, `:mark` at the start of a word. */
const DIRECTIVE_RE = /:m(?:a(?:rk?)?)?$/;
/** Inside the attribute braces of a mark, after `style=` and an optional
 *  opening quote, up to the caret. */
const STYLE_VALUE_RE = /:mark\[[^\n]*\]\{[^}\n]*\bstyle=(["']?)([\w-]*)$/;

/** The completion source: the `:mark[…]` directive after `:m…` (the caret
 *  lands between the brackets) and the style ids inside `style="…"`. */
export function markCompletionSource(getStyles: () => readonly MarkStyleOption[]) {
  return (cx: CompletionContext): CompletionResult | null => {
    const line = cx.state.doc.lineAt(cx.pos);
    const before = line.text.slice(0, cx.pos - line.from);
    const styleMatch = STYLE_VALUE_RE.exec(before);
    if (styleMatch) {
      const quote = styleMatch[1] ?? '';
      const typed = styleMatch[2] ?? '';
      const options: Completion[] = getStyles().map((s) => ({
        label: s.id,
        ...(s.name && s.name !== s.id ? { detail: s.name } : {}),
        apply: quote ? s.id : `"${s.id}"`,
      }));
      if (options.length === 0) return null;
      return { from: cx.pos - typed.length, to: cx.pos, options, validFor: /^[\w-]*$/ };
    }
    const directive = DIRECTIVE_RE.exec(before);
    if (!directive) return null;
    const start = cx.pos - directive[0].length;
    const prev = start > line.from ? line.text[start - line.from - 1]! : '';
    if (prev !== '' && !/[\s([{"'«¿¡]/.test(prev)) return null;
    return {
      from: start,
      to: cx.pos,
      filter: false,
      options: [{
        label: ':mark[…]',
        detail: 'mark',
        apply: (view, _c, from, to) => {
          view.dispatch({ changes: { from, to, insert: ':mark[]' }, selection: { anchor: from + OPENER.length } });
        },
      }],
    };
  };
}
