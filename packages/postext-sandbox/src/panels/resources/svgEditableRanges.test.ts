import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { editableRangeFor, editableRangesField, setEditableRanges, svgEditableRanges } from './svgEditableRanges';
import { scanSvgTextNodeRanges } from '../../controls/svgSource';

const SRC = '<svg><text x="1">Hello</text><rect/><text>Bye</text></svg>';
const HELLO = SRC.indexOf('Hello');
const BYE = SRC.indexOf('Bye');

function make(doc = SRC): EditorState {
  return EditorState.create({ doc, extensions: [svgEditableRanges()] });
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

  it('editableRangeFor requires the whole span inside one range', () => {
    const ranges = scanSvgTextNodeRanges(SRC);
    expect(editableRangeFor(ranges, HELLO, HELLO + 5)).toEqual(ranges[0]);
    expect(editableRangeFor(ranges, HELLO - 1, HELLO)).toBeNull();
  });
});
