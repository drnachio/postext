import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import {
  editableRangeFor,
  editableRangesField,
  setEditableRanges,
  setSourceLocked,
  sourceLockedField,
  svgEditableRanges,
} from './svgEditableRanges';
import { scanSvgTextNodeRanges } from '../../controls/svgSource';

const SRC = '<svg><text x="1">Hello</text><rect/><text>Bye</text></svg>';
const HELLO = SRC.indexOf('Hello');
const BYE = SRC.indexOf('Bye');

function make(doc = SRC): EditorState {
  return EditorState.create({ doc, extensions: [svgEditableRanges()] });
}

/** Run a history command against a state, returning the new state. */
function run(state: EditorState, cmd: typeof undo): EditorState {
  let next = state;
  cmd({ state, dispatch: (tr) => { next = tr.state; } });
  return next;
}

/** Apply a change spec through the filter, returning the resulting doc. */
function apply(state: EditorState, changes: { from: number; to?: number; insert?: string }): string {
  return state.update({ changes }).state.doc.toString();
}

describe('svgEditableRanges', () => {
  it('seeds the field from the document', () => {
    expect(make().field(editableRangesField)).toEqual(scanSvgTextNodeRanges(SRC));
  });

  it('accepts typing inside a text node and maps the ranges', () => {
    const st = make().update({ changes: { from: HELLO + 5, insert: ' there' } }).state;
    expect(st.doc.toString()).toContain('<text x="1">Hello there</text>');
    const [a, b] = st.field(editableRangesField);
    expect(st.doc.sliceString(a!.start, a!.end)).toBe('Hello there');
    expect(st.doc.sliceString(b!.start, b!.end)).toBe('Bye');
  });

  it('rejects changes outside text nodes', () => {
    const st = make();
    expect(apply(st, { from: 0, insert: 'x' })).toBe(SRC);
    expect(apply(st, { from: SRC.indexOf('x="1"'), to: SRC.indexOf('x="1"') + 5, insert: '' })).toBe(SRC);
    // A selection that spans markup between two text nodes.
    expect(apply(st, { from: HELLO, to: BYE + 3, insert: 'z' })).toBe(SRC);
  });

  it('escapes markup characters typed into a text node', () => {
    const st = make();
    const next = st.update({ changes: { from: HELLO + 5, insert: ' <b> & c' } }).state;
    expect(next.doc.toString()).toContain('<text x="1">Hello &lt;b&gt; &amp; c</text>');
    // Caret lands after the escaped insert.
    expect(next.selection.main.head).toBe(HELLO + 'Hello &lt;b&gt; &amp; c'.length);
    const [a] = next.field(editableRangesField);
    expect(next.doc.sliceString(a!.start, a!.end)).toBe('Hello &lt;b&gt; &amp; c');
  });

  it('keeps an emptied text node editable', () => {
    const st = make().update({ changes: { from: HELLO, to: HELLO + 5, insert: '' } }).state;
    expect(st.doc.toString()).toContain('<text x="1"></text>');
    const [a] = st.field(editableRangesField);
    expect(a).toEqual({ start: HELLO, end: HELLO });
    expect(apply(st, { from: HELLO, insert: 'Hi' })).toContain('<text x="1">Hi</text>');
  });

  it('lets a load replace the whole document and reset the ranges', () => {
    const doc2 = '<svg><text>Z</text></svg>';
    const st = make().update({
      changes: { from: 0, to: SRC.length, insert: doc2 },
      effects: setEditableRanges.of(scanSvgTextNodeRanges(doc2)),
    }).state;
    expect(st.doc.toString()).toBe(doc2);
    expect(st.field(editableRangesField)).toEqual([{ start: doc2.indexOf('Z'), end: doc2.indexOf('Z') + 1 }]);
  });

  it('unlocking lets markup change and re-locking rescans the text nodes', () => {
    const locked = make();
    expect(locked.field(sourceLockedField)).toBe(true);
    const open = locked.update({ effects: setSourceLocked.of(false) }).state;
    expect(open.field(sourceLockedField)).toBe(false);
    // Outside a text node, and raw markup: both pass while unlocked.
    const x = SRC.indexOf('x="1"') + 3;
    const edited = open.update({ changes: { from: x, to: x + 1, insert: '42' } }).state;
    expect(edited.doc.toString()).toContain('x="42"');
    const withText = edited.update({ changes: { from: edited.doc.length - 6, insert: '<text>New</text>' } }).state;
    expect(withText.doc.toString()).toContain('<text>New</text></svg>');
    // Re-lock: the ranges now cover the three text nodes of the new source.
    const relocked = withText.update({ effects: setSourceLocked.of(true) }).state;
    expect(relocked.field(sourceLockedField)).toBe(true);
    expect(relocked.field(editableRangesField)).toEqual(scanSvgTextNodeRanges(withText.doc.toString()));
    expect(apply(relocked, { from: x, to: x + 2, insert: '7' })).toBe(withText.doc.toString());
  });

  it('lets undo and redo revert markup edits after re-locking, rescanning the text nodes', () => {
    const base = EditorState.create({ doc: SRC, extensions: [svgEditableRanges(), history()] });
    const x = SRC.indexOf('x="1"') + 3;
    const open = base.update({ effects: setSourceLocked.of(false) }).state;
    const edited = open.update({ changes: { from: x, to: x + 1, insert: '42' }, userEvent: 'input' }).state;
    const relocked = edited.update({ effects: setSourceLocked.of(true) }).state;
    const undone = run(relocked, undo);
    expect(undone.doc.toString()).toBe(SRC);
    expect(undone.field(editableRangesField)).toEqual(scanSvgTextNodeRanges(SRC));
    const redone = run(undone, redo);
    expect(redone.doc.toString()).toContain('x="42"');
    // Still locked: a fresh markup edit is refused.
    expect(apply(redone, { from: x, to: x + 2, insert: '7' })).toBe(redone.doc.toString());
  });

  it('editableRangeFor requires the whole span inside one range', () => {
    const ranges = scanSvgTextNodeRanges(SRC);
    expect(editableRangeFor(ranges, HELLO, HELLO + 5)).toEqual(ranges[0]);
    expect(editableRangeFor(ranges, HELLO - 1, HELLO)).toBeNull();
  });
});
