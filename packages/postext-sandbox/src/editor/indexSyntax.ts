'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/**
 * Editor support for index marks (`:index[word]{…}`, `:index{term="…"}`,
 * #165): a highlighter that dims the mark's syntax and underlines the
 * indexed words, and a completion source that offers both forms after
 * `:in…` and the book's terms inside `term="…"`, `see="…"` and
 * `seealso="…"`.
 */

/** The engine's `INDEX_MARK_RE`: not after `:` (the `:::index` directive)
 *  or `\` (an escaped mark), bracketed text on one line, optional
 *  attributes. */
const INDEX_RE = /(?<![:\\]):index(?:\[((?:\\.|[^\]\\\n])*)\])?(\{[^}\n]*\})?/g;

const delimMark = Decoration.mark({ class: 'cm-index-delim' });
const textMark = Decoration.mark({ class: 'cm-index-text' });
const attrMark = Decoration.mark({ class: 'cm-index-attr' });

type RangeKind = 'delim' | 'text' | 'attr';

/** The decoration ranges of every index mark on a line, relative to the
 *  line. */
export function indexRanges(text: string): Array<{ from: number; to: number; kind: RangeKind }> {
  const out: Array<{ from: number; to: number; kind: RangeKind }> = [];
  INDEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INDEX_RE.exec(text)) !== null) {
    if (m[1] === undefined && m[2] === undefined) continue;
    const start = m.index;
    let at = start + ':index'.length;
    if (m[1] !== undefined) {
      out.push({ from: start, to: at + 1, kind: 'delim' });
      if (m[1].length > 0) out.push({ from: at + 1, to: at + 1 + m[1].length, kind: 'text' });
      at += m[1].length + 1;
      out.push({ from: at, to: at + 1, kind: 'delim' });
      at += 1;
    } else {
      out.push({ from: start, to: at, kind: 'delim' });
    }
    if (m[2]) out.push({ from: at, to: at + m[2].length, kind: 'attr' });
  }
  return out;
}

/** Every term a book's marks file entries under (main levels and full
 *  `Main!sub` paths), in first-seen order. */
export function indexTermsOf(markdowns: readonly string[]): string[] {
  const seen = new Set<string>();
  const add = (term: string): void => {
    const t = term.replace(/\s+/g, ' ').trim();
    if (t.length > 0) seen.add(t);
  };
  for (const md of markdowns) {
    if (!md.includes(':index')) continue;
    INDEX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INDEX_RE.exec(md)) !== null) {
      const term = m[2] ? /\bterm=(?:"([^"]*)"|'([^']*)')/.exec(m[2]) : null;
      const value = term ? (term[1] ?? term[2] ?? '') : m[1]?.replace(/[*_`^~]/g, '') ?? '';
      if (!value) continue;
      const levels = value.split('!');
      add(levels[0]!);
      if (levels.length > 1) add(value);
    }
  }
  return [...seen];
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (line.text.includes(':index')) {
        for (const r of indexRanges(line.text)) {
          const mark = r.kind === 'delim' ? delimMark : r.kind === 'text' ? textMark : attrMark;
          builder.add(line.from + r.from, line.from + r.to, mark);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const indexHighlight = ViewPlugin.fromClass(
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

export const indexTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-index-delim': {
      color: 'var(--slate)',
    },
    '.cm-index-text': {
      textDecoration: 'underline dotted',
      textUnderlineOffset: '3px',
    },
    '.cm-index-attr': {
      color: 'var(--slate)',
    },
  }),
);

/** `:i`, `:in`, `:ind`, `:inde`, `:index` at the start of a word. */
const DIRECTIVE_RE = /:i(?:n(?:d(?:ex?)?)?)?$/;
/** Inside a mark's attributes, after `term=`, `see=` or `seealso=` and an
 *  optional opening quote, up to the caret. */
const TERM_VALUE_RE = /:index(?:\[(?:\\.|[^\]\\\n])*\])?\{[^}\n]*\b(?:term|see|seealso)=(["']?)([^"'}\n]*)$/;

/** The completion source: the two mark forms after `:in…` and the book's
 *  terms inside `term="…"`, `see="…"` or `seealso="…"`. */
export function indexCompletionSource(getTerms: () => readonly string[]) {
  return (cx: CompletionContext): CompletionResult | null => {
    const line = cx.state.doc.lineAt(cx.pos);
    const before = line.text.slice(0, cx.pos - line.from);
    const termMatch = TERM_VALUE_RE.exec(before);
    if (termMatch) {
      const quote = termMatch[1] ?? '';
      const typed = termMatch[2] ?? '';
      const options: Completion[] = getTerms().map((t) => ({ label: t, apply: quote ? t : `"${t}"` }));
      if (options.length === 0) return null;
      return { from: cx.pos - typed.length, to: cx.pos, options };
    }
    const directive = DIRECTIVE_RE.exec(before);
    if (!directive) return null;
    const start = cx.pos - directive[0].length;
    // `:::index` is the directive that prints the index.
    if (start > line.from && line.text[start - line.from - 1] === ':') return null;
    return {
      from: start,
      to: cx.pos,
      filter: false,
      options: [
        {
          label: ':index[…]',
          detail: 'index',
          apply: (view, _c, from, to) => {
            view.dispatch({ changes: { from, to, insert: ':index[]' }, selection: { anchor: from + ':index['.length } });
          },
        },
        {
          label: ':index{term="…"}',
          detail: 'index',
          apply: (view, _c, from, to) => {
            view.dispatch({ changes: { from, to, insert: ':index{term=""}' }, selection: { anchor: from + ':index{term="'.length } });
          },
        },
      ],
    };
  };
}
