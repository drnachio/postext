'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const delimMark = Decoration.mark({ class: 'cm-fm-delim' });
const keyMark = Decoration.mark({ class: 'cm-fm-key' });
const colonMark = Decoration.mark({ class: 'cm-fm-punct' });
const valueMark = Decoration.mark({ class: 'cm-fm-value' });
const lineDeco = Decoration.line({ attributes: { class: 'cm-fm-line' } });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  if (doc.lines < 1) return builder.finish();

  const firstLine = doc.line(1);
  if (firstLine.text.trim() !== '---') return builder.finish();

  let endLineNum = -1;
  for (let n = 2; n <= doc.lines; n++) {
    const ln = doc.line(n);
    if (ln.text.trim() === '---') { endLineNum = n; break; }
  }
  if (endLineNum === -1) return builder.finish();

  for (let n = 1; n <= endLineNum; n++) {
    const line = doc.line(n);
    builder.add(line.from, line.from, lineDeco);

    if (n === 1 || n === endLineNum) {
      const t = line.text;
      const idx = t.indexOf('---');
      if (idx !== -1) {
        builder.add(line.from + idx, line.from + idx + 3, delimMark);
      }
      continue;
    }

    const text = line.text;
    const colonIdx = text.indexOf(':');
    if (colonIdx === -1) continue;

    let keyStart = 0;
    while (keyStart < colonIdx && /\s/.test(text[keyStart]!)) keyStart++;
    if (keyStart < colonIdx) {
      builder.add(line.from + keyStart, line.from + colonIdx, keyMark);
    }
    builder.add(line.from + colonIdx, line.from + colonIdx + 1, colonMark);

    let valStart = colonIdx + 1;
    while (valStart < text.length && /\s/.test(text[valStart]!)) valStart++;
    if (valStart < text.length) {
      builder.add(line.from + valStart, line.from + text.length, valueMark);
    }
  }

  return builder.finish();
}

export const frontmatterHighlight = ViewPlugin.fromClass(
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

export const frontmatterTheme = EditorView.baseTheme({
  '.cm-fm-line': {
    backgroundColor: 'rgba(224, 168, 22, 0.05)',
  },
  '.cm-fm-delim': {
    color: 'var(--slate)',
    fontWeight: 'bold',
  },
  '.cm-fm-key': {
    color: 'var(--accent-blue)',
    fontWeight: 'bold',
  },
  '.cm-fm-punct': {
    color: 'var(--slate)',
  },
  '.cm-fm-value': {
    color: 'var(--gilt)',
  },
});
