'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { findAnnotations, type AnnotationName } from 'postext';

/**
 * Editor support for the Chinese and Japanese annotations (#193–#195,
 * #421, #430): `:dots[…]`, `:name[…]`, `:book[…]`, `:sideline[…]{…}`,
 * `:ruby[…]{rt="…"}`, the compact ruby `{紅樓|hóng|lóu}`,
 * `:warichu[…]{…}` and the kanbun marks `:kunten[…]{kaeri okuri}`; and
 * the directional isolates `:rtl[…]` / `:ltr[…]` (#367). The highlighter
 * marks each directive's brackets and attributes and shows its text the
 * way the mark reads (dots under it, a straight or wavy line, a note in a
 * smaller size); the completion source offers the directives after `:do`,
 * `:na`, `:bo`, `:si`, `:ru`, `:wa`, `:ku`, `:rt` or `:lt`.
 */

const delimMark = Decoration.mark({ class: 'cm-annotation-delim' });
const TEXT_MARKS: Record<AnnotationName, Decoration> = {
  dots: Decoration.mark({ class: 'cm-annotation-dots' }),
  name: Decoration.mark({ class: 'cm-annotation-name' }),
  book: Decoration.mark({ class: 'cm-annotation-book' }),
  ruby: Decoration.mark({ class: 'cm-annotation-ruby' }),
  warichu: Decoration.mark({ class: 'cm-annotation-warichu' }),
  ltr: Decoration.mark({ class: 'cm-annotation-isolate' }),
  rtl: Decoration.mark({ class: 'cm-annotation-isolate' }),
  sideline: Decoration.mark({ class: 'cm-annotation-sideline' }),
  kunten: Decoration.mark({ class: 'cm-annotation-kunten' }),
};

/** Openers the highlighter looks for before reading a line. */
const HINT_RE = /:(?:dots|name|book|ruby|warichu|ltr|rtl|sideline|kunten)\[|\{[^{}\n|]*\|/;

/** The decoration ranges of every annotation on a line, relative to it and
 *  sorted: the opener and closer (`delim`) and the text between. A nested
 *  annotation's ranges fall inside its parent's text, which is cut around
 *  them. */
export function annotationRanges(text: string): Array<{ from: number; to: number; kind: 'delim' | AnnotationName }> {
  if (!HINT_RE.test(text)) return [];
  const found = findAnnotations(text);
  const out: Array<{ from: number; to: number; kind: 'delim' | AnnotationName }> = [];
  // Delimiters of every annotation cut the text ranges of the ones around it.
  const delims: Array<[number, number]> = [];
  for (const a of found) {
    delims.push([a.start, a.contentStart], [a.contentEnd, a.end]);
    out.push({ from: a.start, to: a.contentStart, kind: 'delim' });
    out.push({ from: a.contentEnd, to: a.end, kind: 'delim' });
  }
  for (const a of found) {
    let at = a.contentStart;
    const inside = delims.filter(([s, e]) => s >= a.contentStart && e <= a.contentEnd).sort((x, y) => x[0] - y[0]);
    for (const [s, e] of inside) {
      if (s > at) out.push({ from: at, to: s, kind: a.name });
      at = Math.max(at, e);
    }
    if (a.contentEnd > at) out.push({ from: at, to: a.contentEnd, kind: a.name });
  }
  return out.sort((x, y) => x.from - y.from || x.to - y.to);
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      for (const r of annotationRanges(line.text)) {
        if (r.to <= r.from) continue;
        builder.add(line.from + r.from, line.from + r.to, r.kind === 'delim' ? delimMark : TEXT_MARKS[r.kind]);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const annotationHighlight = ViewPlugin.fromClass(
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

export const annotationTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-annotation-delim': {
      color: 'var(--brand)',
    },
    '.cm-annotation-dots': {
      textEmphasis: 'filled dot',
      textEmphasisPosition: 'under right',
    },
    '.cm-annotation-name': {
      textDecoration: 'underline',
      textUnderlineOffset: '0.2em',
    },
    '.cm-annotation-book': {
      textDecoration: 'underline wavy',
      textUnderlineOffset: '0.2em',
    },
    '.cm-annotation-ruby': {
      backgroundColor: 'color-mix(in srgb, var(--brand) 10%, transparent)',
      borderRadius: '2px',
    },
    '.cm-annotation-warichu': {
      fontSize: '0.85em',
      color: 'var(--brand)',
    },
    '.cm-annotation-sideline': {
      textDecoration: 'underline',
      textDecorationColor: 'var(--brand)',
      textUnderlineOffset: '0.2em',
      textDecorationSkipInk: 'none',
    },
    '.cm-annotation-kunten': {
      backgroundColor: 'color-mix(in srgb, var(--brand) 10%, transparent)',
      borderBottom: '1px solid var(--brand)',
    },
    '.cm-annotation-isolate': {
      textDecoration: 'underline dotted',
      textDecorationColor: 'var(--brand)',
    },
  }),
);

/** The directives, the prefix that offers each (after `:`) and what they
 *  insert, the caret between the brackets. */
const DIRECTIVES: ReadonlyArray<{ name: AnnotationName; prefix: RegExp; insert: string; caret: number }> = [
  { name: 'dots', prefix: /:do(?:ts?)?$/, insert: ':dots[]', caret: 6 },
  { name: 'name', prefix: /:na(?:me?)?$/, insert: ':name[]', caret: 6 },
  { name: 'book', prefix: /:bo(?:ok?)?$/, insert: ':book[]', caret: 6 },
  { name: 'sideline', prefix: /:si(?:d(?:e(?:l(?:i(?:ne?)?)?)?)?)?$/, insert: ':sideline[]', caret: 10 },
  { name: 'ruby', prefix: /:ru(?:by?)?$/, insert: ':ruby[]{rt=""}', caret: 6 },
  { name: 'warichu', prefix: /:wa(?:r(?:i(?:c(?:hu?)?)?)?)?$/, insert: ':warichu[]', caret: 9 },
  { name: 'kunten', prefix: /:ku(?:n(?:t(?:en?)?)?)?$/, insert: ':kunten[]{kaeri="" okuri=""}', caret: 8 },
  { name: 'rtl', prefix: /:rtl?$/, insert: ':rtl[]', caret: 5 },
  { name: 'ltr', prefix: /:ltr?$/, insert: ':ltr[]', caret: 5 },
];

/** The completion source: an annotation directive after its first letters. */
export function annotationCompletionSource(cx: CompletionContext): CompletionResult | null {
  const line = cx.state.doc.lineAt(cx.pos);
  const before = line.text.slice(0, cx.pos - line.from);
  for (const d of DIRECTIVES) {
    const m = d.prefix.exec(before);
    if (!m) continue;
    const start = cx.pos - m[0].length;
    return {
      from: start,
      to: cx.pos,
      filter: false,
      options: [{
        label: `${d.insert.slice(0, d.caret - 1)}[…]`,
        apply: (view, _c, from, to) => {
          view.dispatch({ changes: { from, to, insert: d.insert }, selection: { anchor: from + d.caret } });
        },
      }],
    };
  }
  return null;
}
