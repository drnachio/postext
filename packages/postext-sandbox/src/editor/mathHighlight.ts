'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';

const displayMark = Decoration.mark({ class: 'cm-math-display' });
const inlineMark = Decoration.mark({ class: 'cm-math-inline' });
const delimMark = Decoration.mark({ class: 'cm-math-delim' });

function scanLine(text: string, lineFrom: number, builder: RangeSetBuilder<Decoration>): void {
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && text[i + 1] === '$') { i += 2; continue; }
    if (ch !== '$') { i++; continue; }
    // $$...$$ on the same line
    if (text[i + 1] === '$') {
      const closeIdx = text.indexOf('$$', i + 2);
      if (closeIdx < 0) { i += 2; continue; }
      builder.add(lineFrom + i, lineFrom + closeIdx + 2, displayMark);
      builder.add(lineFrom + i, lineFrom + i + 2, delimMark);
      builder.add(lineFrom + closeIdx, lineFrom + closeIdx + 2, delimMark);
      i = closeIdx + 2;
      continue;
    }
    // $...$ inline — scan for closing `$` honouring `\$`
    let j = i + 1;
    let found = -1;
    while (j < text.length) {
      if (text[j] === '\\' && text[j + 1] === '$') { j += 2; continue; }
      if (text[j] === '$') { found = j; break; }
      j++;
    }
    if (found < 0) { i++; continue; }
    builder.add(lineFrom + i, lineFrom + found + 1, inlineMark);
    builder.add(lineFrom + i, lineFrom + i + 1, delimMark);
    builder.add(lineFrom + found, lineFrom + found + 1, delimMark);
    i = found + 1;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      // Skip front-matter lines (between leading `---` fences) — they're
      // coloured by frontmatterHighlight and shouldn't carry math marks.
      scanLine(line.text, line.from, builder);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const mathHighlight = ViewPlugin.fromClass(
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

export const mathTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-math-inline, .cm-math-display': {
      fontFamily: 'var(--font-mono, monospace)',
      color: 'var(--accent-blue)',
    },
    '.cm-math-display': {
      backgroundColor: 'rgba(88, 134, 191, 0.06)',
    },
    '.cm-math-delim': {
      color: 'var(--gilt)',
      fontWeight: 'bold',
    },
  }),
);
