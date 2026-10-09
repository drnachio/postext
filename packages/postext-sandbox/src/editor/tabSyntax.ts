'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/**
 * Editor support for tabs in body text (#622): marks `:tab` and the
 * attributes of `:tab{at=… align=… leader=…}` as the engine reads them
 * (`extractInlineTabs`), outside inline code and maths, link destinations,
 * fenced code and display formulas, and offers both forms after `:t…`. The
 * editor's Tab key moves the focus, so `:tab` is how a tab is typed here.
 */

/** The engine's `INLINE_TAB_RE` without the tab characters: a bare `:tab`
 *  followed by a letter is text (`3:table`). */
const TAB_RE = /:tab(?:\{[^}\n]*\}|(?!\p{L}))/gu;
/** Inline code, inline maths and link destinations: their `:tab` is text. */
const KEPT_RE = /`[^`\n]+?`|\$[^$\n]+\$|\]\([^)\n]*\)/g;
const FENCE_RE = /^\s*(?:```|~~~)/;
const DISPLAY_RE = /^\s*\$\$/;
/** How many lines above the viewport are read to tell whether it starts
 *  inside a code block or a display formula. */
const LOOK_BACK = 400;

const tabMark = Decoration.mark({ class: 'cm-tab-mark' });
const attrMark = Decoration.mark({ class: 'cm-tab-attr' });

/** The decoration ranges of every tab on a line, relative to the line:
 *  `:tab` itself and, when it has them, its attributes. */
export function tabRanges(text: string): Array<{ from: number; to: number; kind: 'tab' | 'attr' }> {
  if (!text.includes(':tab')) return [];
  const masked = text.replace(KEPT_RE, (m) => 'x'.repeat(m.length));
  const out: Array<{ from: number; to: number; kind: 'tab' | 'attr' }> = [];
  TAB_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAB_RE.exec(masked)) !== null) {
    const start = m.index;
    out.push({ from: start, to: start + 4, kind: 'tab' });
    if (m[0].length > 4) out.push({ from: start + 4, to: start + m[0].length, kind: 'attr' });
  }
  return out;
}

/** For each of `lines`, whether a tab may stand on it: not inside a fenced
 *  code block or a display formula (`code` and `display` say whether the
 *  first line is in one). */
export function tabbableLines(lines: readonly string[], code = false, display = false): boolean[] {
  let inCode = code;
  let inDisplay = display;
  return lines.map((text) => {
    if (!inDisplay && FENCE_RE.test(text)) {
      inCode = !inCode;
      return false;
    }
    if (inCode) return false;
    if (DISPLAY_RE.test(text)) {
      const t = text.trim();
      if (inDisplay) inDisplay = false;
      else if (!(t.length > 2 && t.endsWith('$$'))) inDisplay = true;
      return false;
    }
    return !inDisplay;
  });
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    const start = Math.max(1, first - LOOK_BACK);
    const lines: string[] = [];
    for (let n = start; n <= last; n++) lines.push(doc.line(n).text);
    const ok = tabbableLines(lines);
    for (let n = first; n <= last; n++) {
      if (!ok[n - start]) continue;
      const line = doc.line(n);
      for (const r of tabRanges(line.text)) builder.add(line.from + r.from, line.from + r.to, r.kind === 'tab' ? tabMark : attrMark);
    }
  }
  return builder.finish();
}

export const tabHighlight = ViewPlugin.fromClass(
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

export const tabTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-tab-mark': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-tab-attr': {
      color: 'var(--slate)',
    },
  }),
);

/** `:t`, `:ta`, `:tab` at the start of a word (not after `:::`). */
const DIRECTIVE_RE = /:t(?:ab?)?$/;
/** The one-off stop the second form inserts; its position is selected. */
const STOP_FORM = ':tab{at=end align=end leader="."}';
const STOP_AT = ':tab{at='.length;

/** The completion source: `:tab`, and `:tab{…}` with a one-off stop whose
 *  position is selected to be typed over. */
export function tabCompletionSource(cx: CompletionContext): CompletionResult | null {
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
    options: [
      { label: ':tab', detail: 'tab', apply: ':tab' },
      {
        label: ':tab{at=… align=end leader="."}',
        detail: 'tab',
        apply: (view, _c, from, to) => {
          view.dispatch({
            changes: { from, to, insert: STOP_FORM },
            selection: { anchor: from + STOP_AT, head: from + STOP_AT + 'end'.length },
          });
        },
      },
    ],
  };
}
