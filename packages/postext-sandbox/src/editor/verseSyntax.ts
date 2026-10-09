'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { inFencedCode } from './codeFences';

/**
 * Editor support for `:::verse` poems (#378, #620): a highlighter that
 * marks the poem's fence lines; on each bayt line of a poem in the bayt
 * layout, the separator between its two hemistichs (`||`, or a spaced
 * `\\`, the engine's rule); on each line of a poem set line by line, its
 * indent (a guide over the leading whitespace) and the `+` of a stepped
 * line. A poem's layout follows the engine: `layout=` on its fence, else
 * the bayt layout when any of its lines carries a separator.
 */

const fenceMark = Decoration.mark({ class: 'cm-verse-fence' });
const sepMark = Decoration.mark({ class: 'cm-verse-sep' });
const indentMark = Decoration.mark({ class: 'cm-verse-indent' });
const stepMark = Decoration.mark({ class: 'cm-verse-step' });

const VERSE_OPEN_RE = /^\s*:::\s*verse\b/;
const FENCE_CLOSE_RE = /^\s*:::\s*$/;
/** How many lines above the viewport are read to tell whether it starts
 *  inside a poem, and below it to read the rest of a poem. */
const LOOK_BACK = 400;
const LOOK_AHEAD = 400;

/** Where a bayt line's separator is (`[from, to)` in the line), or null
 *  for a line of one hemistich. */
export function verseSeparator(text: string): { from: number; to: number } | null {
  const bar = text.indexOf('||');
  if (bar >= 0) return { from: bar, to: bar + 2 };
  const wiki = /\s\\\\\s/.exec(text);
  return wiki ? { from: wiki.index + 1, to: wiki.index + 3 } : null;
}

/** A poem's layout, as the engine picks it: `layout=` on the fence, else
 *  `bayt` when a line of its body carries a separator. */
export function poemLayout(fence: string, body: readonly string[]): 'bayt' | 'lines' {
  const named = /\blayout\s*=\s*"?(bayt|lines)\b/.exec(fence)?.[1];
  if (named === 'bayt' || named === 'lines') return named;
  return body.some((l) => verseSeparator(l) !== null) ? 'bayt' : 'lines';
}

/** A line of verse's indent (its leading whitespace, `[0, to)`) and the
 *  `+` of a stepped line (`[from, from + 1)`), as the engine reads them. */
export function verseLineMarks(text: string): { indent: number; step?: number } {
  const indent = /^[ \t\u3000]*/.exec(text)![0].length;
  return /^\+[ \t]/.test(text.slice(indent)) ? { indent, step: indent } : { indent };
}

/** For each of `lines`, whether it opens or closes a poem (`fence`), sits
 *  inside one in the bayt layout (`bayt`) or in the line layout (`line`),
 *  or neither; `open` says whether the first line is already inside one,
 *  and in which layout (`true`: the bayt layout). A poem whose closing
 *  fence lies past `lines` is read to their end. */
export function verseLineKinds(lines: readonly string[], open: boolean | 'bayt' | 'lines' = false): ('fence' | 'bayt' | 'line' | null)[] {
  let inside: false | 'bayt' | 'lines' = open === true ? 'bayt' : open;
  return lines.map((text, i) => {
    if (!inside && VERSE_OPEN_RE.test(text)) {
      let end = i + 1;
      while (end < lines.length && !FENCE_CLOSE_RE.test(lines[end]!)) end++;
      inside = poemLayout(text, lines.slice(i + 1, end));
      return 'fence';
    }
    if (inside && FENCE_CLOSE_RE.test(text)) {
      inside = false;
      return 'fence';
    }
    return inside === 'bayt' ? 'bayt' : inside === 'lines' ? 'line' : null;
  });
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    // Inside a poem at the top of the range: the nearest fence above says,
    // and its lines (up to its close) tell its layout.
    let open: false | 'bayt' | 'lines' = false;
    for (let n = first - 1; n >= 1 && n >= first - LOOK_BACK; n--) {
      const text = doc.line(n).text;
      if (VERSE_OPEN_RE.test(text)) {
        const body: string[] = [];
        for (let k = n + 1; k <= doc.lines && k <= first + LOOK_AHEAD; k++) {
          const t = doc.line(k).text;
          if (FENCE_CLOSE_RE.test(t)) break;
          body.push(t);
        }
        open = poemLayout(text, body);
        break;
      }
      if (FENCE_CLOSE_RE.test(text) || /^\s*:::/.test(text)) break;
    }
    // The lines of the range, and past it the rest of a poem it opens.
    const lines: { from: number; text: string }[] = [];
    for (let n = first; n <= doc.lines && n <= last + LOOK_AHEAD; n++) {
      const line = doc.line(n);
      if (n > last && FENCE_CLOSE_RE.test(line.text)) break;
      lines.push({ from: line.from, text: line.text });
    }
    const kinds = verseLineKinds(lines.map((l) => l.text), open);
    lines.forEach((line, i) => {
      if (i > last - first || inFencedCode(doc, first + i)) return;
      if (kinds[i] === 'fence') {
        builder.add(line.from, line.from + line.text.length, fenceMark);
      } else if (kinds[i] === 'bayt') {
        const sep = verseSeparator(line.text);
        if (sep) builder.add(line.from + sep.from, line.from + sep.to, sepMark);
      } else if (kinds[i] === 'line') {
        const marks = verseLineMarks(line.text);
        if (marks.indent > 0 && marks.indent < line.text.length) builder.add(line.from, line.from + marks.indent, indentMark);
        if (marks.step !== undefined) builder.add(line.from + marks.step, line.from + marks.step + 1, stepMark);
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
    // A line of verse's indent: a guide, so its depth reads at a glance.
    '.cm-verse-indent': {
      backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--brand) 35%, transparent) 1px, transparent 1px)',
      backgroundSize: '2ch 100%',
      backgroundRepeat: 'repeat-x',
    },
    '.cm-verse-step': {
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
