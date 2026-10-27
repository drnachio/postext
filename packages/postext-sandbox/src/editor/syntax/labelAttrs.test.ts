import { describe, expect, it } from 'vitest';
import { parseMarkdown } from 'postext';
import { applyTextChanges } from '../../book/textChanges.js';
import { attrTokens, iconDirective, labelBraces, setLabelAttr, setLabelLeader } from './labelAttrs.js';
import { pickerDirective, INITIAL_ICON_PICKER } from '../toolbar/IconPicker.js';

// #1064: a label's own attributes written in the chapter's Markdown, and the
// symbol picker's :icon directive.

const FIGURE = [
  ':::figure{resource="map"}',
  '::label[North Harbour]{at="harbour" style="town"}',
  '::label[Old Mill]',
  ':::label{at="key" style="key"}',
  ':icon[]{glyph="●"} Town',
  ':icon[]{line="dashed"} Border',
  ':::',
  ':::',
  '',
].join('\n');

/** The figure's labels as the parser reads them. */
function labels(md: string) {
  const fig = parseMarkdown(md).find((b) => b.type === 'resourceBlock' && b.figure)!.figure!;
  return fig.labels.map((l) => ({ start: l.sourceStart, textEnd: l.textEnd, leader: l.leader, text: l.text }));
}

describe('a label\'s attributes in the Markdown (#1064)', () => {
  it('reads the attributes of the braces one by one, quoted or bare', () => {
    expect(attrTokens('at="harbour" leader style=\'town\' size=2').map((t) => t.text)).toEqual(['at="harbour"', 'leader', "style='town'", 'size=2']);
  });

  it('finds the braces of the one-line and the container forms, and where a label without any takes them', () => {
    const [harbour, mill, key] = labels(FIGURE);
    expect(FIGURE.slice(labelBraces(FIGURE, harbour!)!.from, labelBraces(FIGURE, harbour!)!.to)).toBe('at="harbour" style="town"');
    expect(labelBraces(FIGURE, mill!)!.open).toBe(false);
    expect(FIGURE.slice(labelBraces(FIGURE, key!)!.from, labelBraces(FIGURE, key!)!.to)).toBe('at="key" style="key"');
  });

  it('turns the leader on and off and takes it away, the parser reading each', () => {
    const [harbour, mill, key] = labels(FIGURE);
    const on = applyTextChanges(FIGURE, [setLabelLeader(FIGURE, harbour!, 'on')!]);
    expect(on).toContain('::label[North Harbour]{at="harbour" style="town" leader}');
    expect(labels(on)[0]!.leader).toBe(true);
    const off = applyTextChanges(on, [setLabelLeader(on, labels(on)[0]!, 'off')!]);
    expect(off).toContain('{at="harbour" style="town" leader="none"}');
    expect(labels(off)[0]!.leader).toBe(false);
    const back = applyTextChanges(off, [setLabelLeader(off, labels(off)[0]!, 'anchor')!]);
    expect(back).toBe(FIGURE);
    // A label with no braces gets them; the container form keeps its lines.
    const millOn = applyTextChanges(FIGURE, [setLabelLeader(FIGURE, mill!, 'on')!]);
    expect(millOn).toContain('::label[Old Mill]{leader}');
    const keyOff = applyTextChanges(FIGURE, [setLabelLeader(FIGURE, key!, 'off')!]);
    expect(keyOff).toContain(':::label{at="key" style="key" leader="none"}\n:icon[]{glyph="●"} Town');
    expect(labels(keyOff)[2]!.leader).toBe(false);
    // Nothing to change: no change.
    expect(setLabelLeader(FIGURE, mill!, 'anchor')).toBeNull();
  });

  it('quotes a value without the characters that would end it', () => {
    const [harbour] = labels(FIGURE);
    const c = setLabelAttr(FIGURE, harbour!, 'style', 'a"b}c');
    expect(c!.insert).toBe('at="harbour" style="abc"');
  });
});

describe('the :icon directive (#1064)', () => {
  it('writes a picture, a glyph with its face, a line sample, with colour and size', () => {
    expect(iconDirective({ kind: 'resource', resource: 'town-pic' }, 'Town')).toBe(':icon[Town]{resource="town-pic"}');
    expect(iconDirective({ kind: 'glyph', glyph: '⊙', font: 'Noto Sans Symbols' }, 'Capital', { color: 'accent', size: 0.9 })).toBe(':icon[Capital]{glyph="⊙" font="Noto Sans Symbols" color="accent" size="0.9"}');
    expect(iconDirective({ kind: 'line', line: 'dotted' }, 'Track [old]', { color: '#aa0000' })).toBe(':icon[Track \\[old\\]]{line="dotted" color="#aa0000"}');
  });

  it('is read back as a symbol by the parser', () => {
    const md = `:::figure{resource="map"}\n::label[${iconDirective({ kind: 'glyph', glyph: '★' }, 'Capital')} Capital]{at="key"}\n:::\n`;
    const label = parseMarkdown(md).find((b) => b.type === 'resourceBlock')!.figure!.labels[0]!;
    expect(label.spans.some((s) => s.swatch?.icon?.glyph === '★')).toBe(true);
  });

  it('is what the picker writes, and nothing while it names no symbol', () => {
    expect(pickerDirective({ ...INITIAL_ICON_PICKER, alt: 'Capital' })).toBe(':icon[Capital]{glyph="⊙"}');
    expect(pickerDirective({ ...INITIAL_ICON_PICKER, kind: 'resource' })).toBeNull();
    expect(pickerDirective({ ...INITIAL_ICON_PICKER, kind: 'line', line: 'dashed', color: '#336699', size: 1.2 })).toBe(':icon[]{line="dashed" color="#336699" size="1.2"}');
  });
});

describe('iconDirective alt text (CodeQL js/incomplete-sanitization)', () => {
  it('drops backslashes and escapes brackets, so the alt cannot end the directive', () => {
    expect(iconDirective({ kind: 'glyph', glyph: '⊙' }, 'a\\] b [c]\\')).toBe(':icon[a\\] b \\[c\\]]{glyph="⊙"}');
  });
});
