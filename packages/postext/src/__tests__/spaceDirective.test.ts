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
