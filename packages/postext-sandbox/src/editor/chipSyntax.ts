'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/**
 * Editor support for inline chips (`:chip[text]{style="…"}`): a highlighter
 * that marks the directive (brackets, attributes) and tints the chip text,
 * and a completion source that offers the directive after `:c…` and the
 * configured style ids inside `style="…"`.
 */

/** Same grammar as the engine's `INLINE_CHIP_RE` (one line, non-empty text,
 *  `\]` for a literal bracket, optional `{attrs}` right after). */
const CHIP_RE = /:chip\[((?:\\.|[^\]\\\n])+)\](\{[^}\n]*\})?/g;

const delimMark = Decoration.mark({ class: 'cm-chip-delim' });
const textMark = Decoration.mark({ class: 'cm-chip-text' });
const attrMark = Decoration.mark({ class: 'cm-chip-attr' });

/** The decoration ranges of every chip on a line, relative to the line. */
export function chipRanges(text: string): Array<{ from: number; to: number; kind: 'delim' | 'text' | 'attr' }> {
  const out: Array<{ from: number; to: number; kind: 'delim' | 'text' | 'attr' }> = [];
  CHIP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHIP_RE.exec(text)) !== null) {
    const start = m.index;
    const textStart = start + ':chip['.length;
    const textEnd = textStart + m[1]!.length;
    out.push({ from: start, to: textStart, kind: 'delim' });
    out.push({ from: textStart, to: textEnd, kind: 'text' });
    out.push({ from: textEnd, to: textEnd + 1, kind: 'delim' });
    if (m[2]) out.push({ from: textEnd + 1, to: textEnd + 1 + m[2].length, kind: 'attr' });
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
      if (line.text.includes(':chip[')) {
        for (const r of chipRanges(line.text)) {
          const mark = r.kind === 'delim' ? delimMark : r.kind === 'text' ? textMark : attrMark;
          builder.add(line.from + r.from, line.from + r.to, mark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const chipHighlight = ViewPlugin.fromClass(
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

export const chipTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-chip-delim': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-chip-text': {
      backgroundColor: 'rgba(43, 74, 203, 0.16)',
      borderRadius: '3px',
    },
    '.cm-chip-attr': {
      color: 'var(--slate)',
    },
  }),
);

/** A chip style the completion offers (id + display name). */
export interface ChipStyleOption {
  id: string;
  name?: string;
}

/** `:c`, `:ch`, `:chi`, `:chip` at the start of a word. */
const DIRECTIVE_RE = /:c(?:h(?:ip?)?)?$/;
/** Inside the attribute braces of a chip, after `style=` and an optional
 *  opening quote, up to the caret. */
const STYLE_VALUE_RE = /:chip\[(?:\\.|[^\]\\\n])+\]\{[^}\n]*\bstyle=(["']?)([\w-]*)$/;

/** The completion source: the `:chip[…]` directive after `:c…` (the caret
 *  lands between the brackets) and the style ids inside `style="…"`. */
export function chipCompletionSource(getStyles: () => readonly ChipStyleOption[]) {
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
        label: ':chip[…]',
        detail: 'chip',
        apply: (view, _c, from, to) => {
          view.dispatch({ changes: { from, to, insert: ':chip[]' }, selection: { anchor: from + ':chip['.length } });
        },
      }],
    };
  };
}
