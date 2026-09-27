import { describe, it, expect } from 'vitest';
import { parseMarkdown, spaceDirectiveLines } from '../parse/blockParser';
import { buildDocument } from '../pipeline';
import { computeBaselineGrid, resolveAllConfig } from '../pipeline/config';
import type { VDTBlock, VDTDocument } from '../vdt';
import type { PostextConfig } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// `:::space{lines=N}` (issue #150): explicit vertical space in body lines,
// the visible alternative to extra blank lines in the Markdown.

const pt = (value: number) => ({ value, unit: 'pt' as const });
const CONFIG: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'double' },
  calloutStyles: [{ id: 'note', span: 'column' }],
};
const GRID = computeBaselineGrid(resolveAllConfig(CONFIG));

const blockTexts = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.lines.length > 0);
const topOf = (doc: VDTDocument, text: string): number => {
  const b = blockTexts(doc).find((x) => x.lines[0]!.text.startsWith(text));
  if (!b) throw new Error(`no block ${text}`);
  return b.bbox.y;
};

describe(':::space parsing', () => {
  it('recognizes :::space and :::space{lines=2}', () => {
    const blocks = parseMarkdown('A\n\n:::space\n\n:::space{lines=2}\n\nB\n');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'directive', 'directive', 'paragraph']);
    expect(blocks[1]!.directiveName).toBe('space');
    expect(blocks[2]!.directiveAttrs).toEqual({ lines: '2' });
  });

  it('reads the lines attribute', () => {
    expect(spaceDirectiveLines({})).toBe(1);
    expect(spaceDirectiveLines({ lines: '3' })).toBe(3);
    expect(spaceDirectiveLines({ lines: '0.5' })).toBe(0.5);
    for (const bad of ['', '0', '-1', 'two', '21']) expect(spaceDirectiveLines({ lines: bad })).toBeUndefined();
  });

  it('extra blank lines stay a plain paragraph separator', () => {
    expect(parseMarkdown('A\n\n\n\nB\n').map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
  });
});

describe(':::space placement', () => {
  const base = topOf(buildDocument({ markdown: 'First.\n\nSecond.' }, CONFIG), 'Second.');

  it('pushes the next block down one body line by default', () => {
    const doc = buildDocument({ markdown: 'First.\n\n:::space\n\nSecond.' }, CONFIG);
    expect(topOf(doc, 'Second.') - base).toBeCloseTo(GRID, 3);
  });

  it('honours lines=N, fractions included', () => {
    const two = buildDocument({ markdown: 'First.\n\n:::space{lines=2}\n\nSecond.' }, CONFIG);
    expect(topOf(two, 'Second.') - base).toBeCloseTo(2 * GRID, 3);
    const half = buildDocument({ markdown: 'First.\n\n:::space{lines=0.5}\n\nSecond.' }, CONFIG);
    expect(topOf(half, 'Second.') - base).toBeCloseTo(GRID / 2, 3);
  });

  it('adds up when repeated and falls back to one line on a bad value', () => {
    const rep = buildDocument({ markdown: 'First.\n\n:::space\n\n:::space\n\nSecond.' }, CONFIG);
    expect(topOf(rep, 'Second.') - base).toBeCloseTo(2 * GRID, 3);
    const bad = buildDocument({ markdown: 'First.\n\n:::space{lines=abc}\n\nSecond.' }, CONFIG);
    expect(topOf(bad, 'Second.') - base).toBeCloseTo(GRID, 3);
  });

  it('adds to a heading top margin instead of collapsing into it', () => {
    const md = (s: string) => `First.\n\n${s}## Heading\n\nText.`;
    const plain = topOf(buildDocument({ markdown: md('') }, CONFIG), 'Heading');
    const spaced = topOf(buildDocument({ markdown: md(':::space\n\n') }, CONFIG), 'Heading');
    expect(spaced - plain).toBeCloseTo(GRID, 3);
  });

  it('vanishes at a column top', () => {
    const only = buildDocument({ markdown: 'Only.' }, CONFIG);
    const spaced = buildDocument({ markdown: ':::space{lines=3}\n\nOnly.' }, CONFIG);
    expect(topOf(spaced, 'Only.')).toBeCloseTo(topOf(only, 'Only.'), 3);
  });

  it('ends the column when it does not fit, without carrying over', () => {
    const doc = buildDocument({ markdown: 'First.\n\n:::space{lines=20}\n\n:::space{lines=20}\n\nSecond.' }, CONFIG);
    expect(doc.pages).toHaveLength(1);
    const page = doc.pages[0]!;
    const second = page.columns[1]!.blocks[0]!;
    expect(second.lines[0]!.text).toBe('Second.');
    expect(second.bbox.y).toBeCloseTo(page.columns[1]!.bbox.y, 3);
  });

  it('sets the paragraph after it flush when indentAfterHeading is off', () => {
    const config: PostextConfig = { ...CONFIG, bodyText: { firstLineIndent: pt(12), indentAfterHeading: false } };
    const doc = buildDocument({ markdown: 'First paragraph.\n\nIndented.\n\n:::space\n\nFlush.' }, config);
    const x = (t: string) => blockTexts(doc).find((b) => b.lines[0]!.text.startsWith(t))!.lines[0]!.bbox.x;
    expect(x('Indented.')).toBeGreaterThan(x('Flush.'));
  });

  it('separates the children of a callout, dropped at the box top', () => {
    const box = (body: string) => `Intro.\n\n:::callout{type="note"}\n${body}\n:::`;
    const plain = buildDocument({ markdown: box('A.\n\nB.') }, CONFIG);
    const spaced = buildDocument({ markdown: box(':::space\n\nA.\n\n:::space\n\nB.') }, CONFIG);
    expect(topOf(spaced, 'A.')).toBeCloseTo(topOf(plain, 'A.'), 3);
    expect(topOf(spaced, 'B.') - topOf(plain, 'B.')).toBeCloseTo(GRID, 3);
  });
});

// EF-04: a box made only of `:::space` (an answer box, writing room) is as
// tall as the space asks, and space right under the title opens the body
// that much lower. At the top of an untitled box with content, of a
// `:::columns` group, or of the continuation of a split box it still
// vanishes.
describe(':::space at the top of a box', () => {
  const frameOf = (doc: VDTDocument): VDTBlock => {
    const f = doc.blocks.find((b) => b.type === 'callout');
    if (!f) throw new Error('no callout frame');
    return f;
  };
  const heightOf = (md: string, config: PostextConfig = CONFIG): number =>
    frameOf(buildDocument({ markdown: md }, config)).bbox.height;
  const box = (body: string, attrs = '') => `Intro.\n\n:::callout{type="note"${attrs}}\n${body}\n:::\n\nAfter.`;

  it('sizes a box made only of space', () => {
    const empty = heightOf(box(''));
    expect(heightOf(box(':::space{lines=3}')) - empty).toBeCloseTo(3 * GRID, 3);
    expect(heightOf(box(':::space\n\n:::space{lines=0.5}')) - empty).toBeCloseTo(1.5 * GRID, 3);
  });

  it('keeps space right under the title', () => {
    const titled = heightOf(box('', ' title="Q1"'));
    expect(heightOf(box(':::space{lines=3}', ' title="Q1"')) - titled).toBeCloseTo(3 * GRID, 3);
    const doc = (body: string) => buildDocument({ markdown: box(body, ' title="Q1"') }, CONFIG);
    expect(topOf(doc(':::space{lines=2}\n\nAnswer.'), 'Answer.') - topOf(doc('Answer.'), 'Answer.')).toBeCloseTo(2 * GRID, 3);
  });

  it('still drops it at the top of a :::columns group', () => {
    const cols = (body: string) => box(`:::columns{count=2}\n${body}\n:::`);
    const plain = buildDocument({ markdown: cols('One.\n\nTwo.') }, CONFIG);
    const spaced = buildDocument({ markdown: cols(':::space{lines=2}\n\nOne.\n\nTwo.') }, CONFIG);
    expect(topOf(spaced, 'One.')).toBeCloseTo(topOf(plain, 'One.'), 3);
    expect(topOf(spaced, 'Two.')).toBeCloseTo(topOf(plain, 'Two.'), 3);
  });

  // EF-40: `breaks` counts blocks, not directives; a space before a column
  // start vanishes there, and equal spacing lines the columns up.
  it(':::columns breaks skips directives, and a space at a column head vanishes', () => {
    const md = box([
      ':::columns{count=2 breaks="4"}',
      'Uno.', '', 'Dos.', '', ':::space', '', 'Tres.', '', ':::space{lines=2}', '',
      'One.', '', 'Two.', '', ':::space', '', 'Three.',
      ':::',
    ].join('\n'));
    const doc = buildDocument({ markdown: md }, CONFIG);
    const x = (t: string) => blockTexts(doc).find((b) => b.lines[0]!.text === t)!.bbox.x;
    // The fourth block (the spaces not counted) opens the second column.
    expect(x('One.')).toBeGreaterThan(x('Tres.'));
    expect(x('Tres.')).toBeCloseTo(x('Uno.'), 3);
    // Both columns start level (the two-line space before "One." is gone)
    // and their stanza gaps line up.
    expect(topOf(doc, 'One.')).toBeCloseTo(topOf(doc, 'Uno.'), 3);
    expect(topOf(doc, 'Three.')).toBeCloseTo(topOf(doc, 'Tres.'), 3);
    expect(topOf(doc, 'Tres.') - topOf(doc, 'Dos.')).toBeCloseTo(2 * GRID, 3);
  });

  it('drops it at the top of the continuation of a split box', () => {
    const config: PostextConfig = {
      ...CONFIG,
      layout: { layoutType: 'single' },
      calloutStyles: [{ id: 'note', keepTogether: false, splitMinLines: 1 }],
    };
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`);
    const md = (gap: string) => `:::callout{type="note"}\n${lines.slice(0, 15).join('\n\n')}\n\n${gap}${lines.slice(15).join('\n\n')}\n:::`;
    const plain = buildDocument({ markdown: md('') }, config);
    const frames = plain.blocks.filter((b) => b.type === 'callout');
    expect(frames.length).toBeGreaterThan(1);
    // The first item of the second fragment, with and without a space
    // right before it in the source.
    const firstOfRest = (doc: VDTDocument): VDTBlock =>
      doc.blocks.find((b) => b.type === 'paragraph' && b.pageIndex === 1)!;
    const head = firstOfRest(plain);
    const gapAt = Number(head.lines[0]!.text.replace(/\D/g, '')) - 1;
    const withGap = `:::callout{type="note"}\n${lines.slice(0, gapAt).join('\n\n')}\n\n:::space{lines=2}\n\n${lines.slice(gapAt).join('\n\n')}\n:::`;
    const spaced = buildDocument({ markdown: withGap }, config);
    const rest = firstOfRest(spaced);
    expect(rest.lines[0]!.text).toBe(head.lines[0]!.text);
    expect(rest.bbox.y).toBeCloseTo(head.bbox.y, 3);
  });
});
