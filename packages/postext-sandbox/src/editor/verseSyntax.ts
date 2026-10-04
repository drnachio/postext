'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/**
 * Editor support for `:::verse` poems (#378): a highlighter that marks the
 * poem's fence lines and, on each bayt line, the separator between its two
 * hemistichs (`||`, or a spaced `\\`, the engine's rule).
 */

const fenceMark = Decoration.mark({ class: 'cm-verse-fence' });
const sepMark = Decoration.mark({ class: 'cm-verse-sep' });

const VERSE_OPEN_RE = /^\s*:::\s*verse\b/;
const FENCE_CLOSE_RE = /^\s*:::\s*$/;
/** How many lines above the viewport are read to tell whether it starts
 *  inside a poem. */
const LOOK_BACK = 400;

/** Where a bayt line's separator is (`[from, to)` in the line), or null
 *  for a line of one hemistich. */
export function verseSeparator(text: string): { from: number; to: number } | null {
  const bar = text.indexOf('||');
  if (bar >= 0) return { from: bar, to: bar + 2 };
  const wiki = /\s\\\\\s/.exec(text);
  return wiki ? { from: wiki.index + 1, to: wiki.index + 3 } : null;
}

/** For each of `lines`, whether it opens or closes a poem (`fence`), sits
 *  inside one (`bayt`), or neither; `open` says whether the first line is
 *  already inside one. */
export function verseLineKinds(lines: readonly string[], open = false): ('fence' | 'bayt' | null)[] {
  let inside = open;
  return lines.map((text) => {
    if (!inside && VERSE_OPEN_RE.test(text)) {
      inside = true;
      return 'fence';
    }
    if (inside && FENCE_CLOSE_RE.test(text)) {
      inside = false;
      return 'fence';
    }
    return inside ? 'bayt' : null;
  });
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    // Inside a poem at the top of the range: the nearest fence above says.
    let open = false;
    for (let n = first - 1; n >= 1 && n >= first - LOOK_BACK; n--) {
      const text = doc.line(n).text;
      if (VERSE_OPEN_RE.test(text)) {
        open = true;
        break;
      }
      if (FENCE_CLOSE_RE.test(text) || /^\s*:::/.test(text)) break;
    }
    const last = doc.lineAt(to).number;
    const lines: { from: number; text: string }[] = [];
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      lines.push({ from: line.from, text: line.text });
    }
    const kinds = verseLineKinds(lines.map((l) => l.text), open);
    lines.forEach((line, i) => {
      if (kinds[i] === 'fence') {
        builder.add(line.from, line.from + line.text.length, fenceMark);
      } else if (kinds[i] === 'bayt') {
        const sep = verseSeparator(line.text);
        if (sep) builder.add(line.from + sep.from, line.from + sep.to, sepMark);
      }
    });
  }
  return builder.finish();
}

export const verseHighlight = ViewPlugin.fromClass(
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

export const verseTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-verse-fence': {
      color: 'var(--brand)',
    },
    '.cm-verse-sep': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
  }),
);

/** `:::v`, `:::ve`, … `:::verse` alone at the start of a line. */
const VERSE_OPENER_RE = /^\s*:::v(?:e(?:r(?:se?)?)?)?$/;

/** The completion source: a `:::verse` block after `:::v…` at the start
 *  of a line, with one bayt to fill: the caret before the `||` that parts
 *  its two hemistichs. */
export function verseCompletionSource(cx: CompletionContext): CompletionResult | null {
  const line = cx.state.doc.lineAt(cx.pos);
  const before = line.text.slice(0, cx.pos - line.from);
  if (!VERSE_OPENER_RE.test(before)) return null;
  const start = line.from + before.indexOf(':::');
  return {
    from: start,
    to: cx.pos,
    filter: false,
    options: [{
      label: ':::verse',
      apply: (view, _c, from, to) => {
        const insert = ':::verse\n || \n:::';
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + ':::verse\n'.length } });
      },
    }],
  };
}
