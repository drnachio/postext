import { describe, it, expect } from 'vitest';
import { parseTemplate, formatNumeral, computeHeadingNumbers } from '../numbering';
import { parseMarkdown, type ContentBlock } from '../parse';
import { resolveBlockKind, uppercasePreservingLength } from '../pipeline/buildBlockKind';
import { resolveAllConfig } from '../pipeline/config';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../pipeline/styles';

describe('formatNumeral', () => {
  it('formats decimal', () => {
    expect(formatNumeral(1, 'decimal')).toBe('1');
    expect(formatNumeral(10, 'decimal')).toBe('10');
  });
  it('formats zero-padded', () => {
    expect(formatNumeral(1, 'decimal-02')).toBe('01');
    expect(formatNumeral(10, 'decimal-02')).toBe('10');
  });
  it('formats upper-alpha bijective', () => {
    expect(formatNumeral(1, 'upper-alpha')).toBe('A');
    expect(formatNumeral(26, 'upper-alpha')).toBe('Z');
    expect(formatNumeral(27, 'upper-alpha')).toBe('AA');
    expect(formatNumeral(52, 'upper-alpha')).toBe('AZ');
  });
  it('formats lower-alpha', () => {
    expect(formatNumeral(1, 'lower-alpha')).toBe('a');
    expect(formatNumeral(27, 'lower-alpha')).toBe('aa');
  });
  it('formats roman', () => {
    expect(formatNumeral(1, 'upper-roman')).toBe('I');
    expect(formatNumeral(4, 'upper-roman')).toBe('IV');
    expect(formatNumeral(9, 'upper-roman')).toBe('IX');
    expect(formatNumeral(1994, 'upper-roman')).toBe('MCMXCIV');
    expect(formatNumeral(2, 'lower-roman')).toBe('ii');
  });
  it('returns empty for 0', () => {
    expect(formatNumeral(0, 'decimal')).toBe('');
  });
});

describe('parseTemplate', () => {
  it('parses literal', () => {
    expect(parseTemplate('Hello')).toEqual([{ kind: 'literal', text: 'Hello' }]);
  });
  it('parses simple counter', () => {
    expect(parseTemplate('{1}')).toEqual([{ kind: 'counter', level: 1, style: 'decimal' }]);
  });
  it('parses counter with style', () => {
    expect(parseTemplate('{2:I}')).toEqual([{ kind: 'counter', level: 2, style: 'upper-roman' }]);
  });
  it('parses mixed', () => {
    const tokens = parseTemplate('{1}.{2}');
    expect(tokens).toEqual([
      { kind: 'counter', level: 1, style: 'decimal' },
      { kind: 'literal', text: '.' },
      { kind: 'counter', level: 2, style: 'decimal' },
    ]);
  });
  it('escapes braces', () => {
    expect(parseTemplate('\\{1\\}')).toEqual([{ kind: 'literal', text: '{1}' }]);
  });
});

function h(level: number): ContentBlock {
  return { type: 'heading', level, text: 'h', spans: [{ text: 'h', bold: false, italic: false }], sourceStart: 0, sourceEnd: 0, sourceMap: [0] };
}
function p(): ContentBlock {
  return { type: 'paragraph', text: 'p', spans: [{ text: 'p', bold: false, italic: false }], sourceStart: 0, sourceEnd: 0, sourceMap: [0] };
}

describe('computeHeadingNumbers', () => {
  it('assigns sequential decimals', () => {
    const blocks = [h(1), h(1), h(1)];
    const out = computeHeadingNumbers(blocks, { 1: '{1}.' });
    expect(out).toEqual(['1.', '2.', '3.']);
  });
  it('resets children when parent increments', () => {
    const blocks = [h(1), h(2), h(2), h(1), h(2)];
    const out = computeHeadingNumbers(blocks, { 1: '{1}.', 2: '{1}.{2}' });
    expect(out).toEqual(['1.', '1.1', '1.2', '2.', '2.1']);
  });
  it('no numbering for empty template', () => {
    const blocks = [h(1), h(2)];
    const out = computeHeadingNumbers(blocks, { 2: '{2:A}' });
    expect(out[0]).toBeUndefined();
    expect(out[1]).toBe('A');
  });
  it('user example: L4 = {1}.{2:I}.{3}', () => {
    const blocks = [h(1), h(2), h(3), h(4), h(4)];
    const out = computeHeadingNumbers(blocks, { 4: '{1}.{2:I}.{3}' });
    expect(out[3]).toBe('1.I.1');
    expect(out[4]).toBe('1.I.1');
  });
  it('collapses separator when ancestor counter is 0', () => {
    const blocks = [h(2)];
    const out = computeHeadingNumbers(blocks, { 2: '{1}.{2}' });
    expect(out[0]).toBe('1');
  });
  it('skips non-heading blocks', () => {
    const blocks = [h(1), p(), h(1)];
    const out = computeHeadingNumbers(blocks, { 1: '{1}' });
    expect(out).toEqual(['1', undefined, '2']);
  });
});

describe('heading textTransform', () => {
  it('heading textTransform uppercase keeps length and sourceMap (ß)', () => {
    const md = '## Straße *und* Fluss $x$';
    const [raw] = parseMarkdown(md);
    const resolved = resolveAllConfig({
      headings: { levels: [{ level: 2, textTransform: 'uppercase', numberingTemplate: 'Chapter {2}' }] },
    });
    const kind = resolveBlockKind(raw!, {
      resolved,
      bodyStyle: resolveBodyStyle(resolved),
      blockquoteStyle: resolveBlockquoteStyle(resolved),
      headingPrefixes: ['Chapter 1'],
      blockIdx: 0,
      listLevelIndentsPx: [],
      orderedLevelIndentsPx: [],
      orderedMetrics: { perBlock: new Map(), maxWidthByDepth: new Map() },
      resourceById: new Map(),
      resourceTypeById: new Map(),
      resourceNumberById: new Map(),
    });
    const text = kind.contentBlock.text;
    // The numbering prefix is kept as written; the title is upper-cased with
    // `ß` left alone (its upper-case form `SS` would change the length).
    expect(text).toBe('Chapter 1 STRAßE UND FLUSS \uFFFC');
    expect(text.length - 'Chapter 1 '.length).toBe(raw!.text.length);
    expect(raw!.sourceMap.length).toBe(raw!.text.length);
    // Spans are transformed in step; the math placeholder is untouched.
    expect(kind.contentBlock.spans.map((s) => s.text).join('')).toBe(text);
    const mathSpan = kind.contentBlock.spans[kind.contentBlock.spans.length - 1]!;
    expect(mathSpan.math).toBeDefined();
    expect(mathSpan.text).toBe('\uFFFC');
    // Levels without the transform are unchanged.
    const plain = resolveBlockKind(raw!, {
      resolved: resolveAllConfig(),
      bodyStyle: resolveBodyStyle(resolveAllConfig()),
      blockquoteStyle: resolveBlockquoteStyle(resolveAllConfig()),
      headingPrefixes: [],
      blockIdx: 0,
      listLevelIndentsPx: [],
      orderedLevelIndentsPx: [],
      orderedMetrics: { perBlock: new Map(), maxWidthByDepth: new Map() },
      resourceById: new Map(),
      resourceTypeById: new Map(),
      resourceNumberById: new Map(),
    });
    expect(plain.contentBlock.text).toBe(raw!.text);
    expect(uppercasePreservingLength('ﬁn ß é')).toBe('ﬁN ß É');
    expect(uppercasePreservingLength('ﬁn ß é').length).toBe('ﬁn ß é'.length);
  });
});
