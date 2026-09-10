// CodeMirror extension that keeps an SVG source editable in its text nodes
// only. A `StateField` carries the `[start, end)` ranges of every text node
// inside a `<text>` element (mapped through document changes, so they stay
// exact without rescanning); a `transactionFilter` rejects any change that
// is not fully inside one range and XML-escapes `<`, `>` and `&` typed into
// a text node; decorations tint the editable ranges so the reader can see
// where typing is allowed. Pure CodeMirror state — runs in node for tests.

import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { escapeXmlText, scanSvgTextNodeRanges, type SourceRange } from '../../controls/svgSource';

/** Replace the editable ranges (after loading a new document). */
export const setEditableRanges = StateEffect.define<SourceRange[]>();

/** The editable text-node ranges of the current document. */
export const editableRangesField = StateField.define<SourceRange[]>({
  create(state) {
    return scanSvgTextNodeRanges(state.doc.toString());
  },
  update(ranges, tr) {
    for (const e of tr.effects) {
      if (e.is(setEditableRanges)) return e.value;
    }
    if (!tr.docChanged) return ranges;
    // An insertion at a range's start stays inside it (start keeps its
    // place), and one at its end extends it (end moves after the insert).
    return ranges.map((r) => ({
      start: tr.changes.mapPos(r.start, -1),
      end: tr.changes.mapPos(r.end, 1),
    }));
  },
});

/** The editable range containing `[from, to]`, if any. */
export function editableRangeFor(ranges: readonly SourceRange[], from: number, to: number): SourceRange | null {
  for (const r of ranges) {
    if (from >= r.start && to <= r.end) return r;
  }
  return null;
}

/** Reject changes outside text nodes; escape markup characters inside. */
const textNodesOnlyFilter = EditorState.transactionFilter.of((tr): TransactionSpec | readonly TransactionSpec[] => {
  if (!tr.docChanged) return tr;
  // Programmatic loads (setEditableRanges) replace the whole document.
  if (tr.effects.some((e) => e.is(setEditableRanges))) return tr;
  const ranges = tr.startState.field(editableRangesField, false);
  if (!ranges) return tr;
  let allowed = true;
  let needsEscape = false;
  const specs: { from: number; to: number; insert: string }[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (!allowed) return;
    if (!editableRangeFor(ranges, fromA, toA)) {
      allowed = false;
      return;
    }
    const text = inserted.toString();
    const escaped = escapeXmlText(text);
    if (escaped !== text) needsEscape = true;
    specs.push({ from: fromA, to: toA, insert: escaped });
  });
  if (!allowed) return [];
  if (!needsEscape) return tr;
  // Rebuild the transaction with the escaped inserts; the caret lands after
  // the last (escaped) insertion, as it would after plain typing.
  const changes = tr.startState.changes(specs);
  const last = specs[specs.length - 1]!;
  const head = changes.mapPos(last.from, 1);
  const userEvent = tr.annotation(Transaction.userEvent);
  return {
    changes,
    selection: EditorSelection.cursor(head),
    scrollIntoView: tr.scrollIntoView,
    ...(userEvent ? { userEvent } : {}),
  };
});

const editableMark = Decoration.mark({ class: 'cm-svg-editable' });

const editableDecorations = EditorView.decorations.compute([editableRangesField], (state) => {
  const ranges = state.field(editableRangesField);
  const marks = ranges
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
    .map((r) => editableMark.range(r.start, r.end));
  return Decoration.set(marks, true) as DecorationSet;
});

const editableTheme = EditorView.baseTheme({
  '.cm-svg-editable': {
    backgroundColor: 'rgba(224, 168, 22, 0.18)',
    borderRadius: '2px',
  },
});

/** The full extension: field, filter, tint. */
export function svgEditableRanges(): Extension {
  return [editableRangesField, textNodesOnlyFilter, editableDecorations, editableTheme];
}
