import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { parseMarkdown, parseMarkdownWithIssues } from '../../parse';
import { initMathEngine } from '../../math';
import { resolveMathConfig, stripMathDefaults } from '../../defaults';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../index';

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

beforeAll(async () => {
  await initMathEngine();
}, 60_000);

const pt = (value: number) => ({ value, unit: 'pt' as const });
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
const sentences = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i} runs on.`).join(' ');

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  bodyText: { firstLineIndent: pt(12) },
  headings: { levels: [] },
};

const build = (markdown: string, config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown }, config, createMeasurementCache());

const blocksOf = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => p.columns.flatMap((c, ci) => c.blocks.map((b) => ({ page: p.index, column: ci, block: b }))));
const firstLineX = (b: VDTBlock) => b.lines[0]!.bbox.x - b.bbox.x;

describe('the text after a display formula (EF-85)', () => {
  it('a display on its own line interrupts a paragraph, blank line or not', () => {
    const blocks = parseMarkdown('The period is\n$$T = 2\\pi\\sqrt{L/g}$$\nwhere $L$ is the length.\n\nA new paragraph.');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'mathDisplay', 'paragraph', 'paragraph']);
    expect(blocks[0]!.text).toBe('The period is');
    expect(blocks[1]!.tex).toBe('T = 2\\pi\\sqrt{L/g}');
    expect(blocks[2]!.continuesParagraph).toBe(true);
    expect(blocks[3]!.continuesParagraph).toBeUndefined();
    // A fenced display the same way.
    const fenced = parseMarkdown('Lead in\n$$\nx^2\n$$\nand on.');
    expect(fenced.map((b) => b.type)).toEqual(['paragraph', 'mathDisplay', 'paragraph']);
    expect(fenced[2]!.continuesParagraph).toBe(true);
    // With blank lines the paragraph after it is a new one.
    const apart = parseMarkdown('Lead in\n\n$$x^2$$\n\nNew one.');
    expect(apart[2]!.continuesParagraph).toBeUndefined();
    // `$$` inside a line stays literal text, as before.
    expect(parseMarkdown('Costs $$5 and $$6 today.').map((b) => b.type)).toEqual(['paragraph']);
  });

  /** Per paragraph of `md`: whether it continues one a display interrupted. */
  const continues = (md: string) =>
    parseMarkdown(md).filter((b) => b.type === 'paragraph').map((b) => b.continuesParagraph ?? false);

  it('continues only a paragraph the display interrupted: 1.4 input reads as it did', () => {
    // A display set off from the text above by a blank line was a block of
    // its own in 1.4, and the text under it a new, indented paragraph.
    expect(continues('Lead in.\n\n$$x^2$$\nwhere x is small.')).toEqual([false, false]);
    expect(continues('Lead in.\n\n$$\nx^2\n$$\nwhere x is small.')).toEqual([false, false]);
    // Nor after a list item or a quotation.
    expect(continues('- An item\n$$x$$\nwhere x is small.')).toEqual([false]);
    expect(continues('> A quotation\n$$x$$\nwhere x is small.')).toEqual([false]);
    expect(continues('> A quotation\n\n$$x$$\nwhere x is small.')).toEqual([false]);
    // Inside a box the same.
    expect(continues(':::callout\nLead in.\n\n$$x$$\nwhere x is small.\n:::')).toEqual([false, false]);
    expect(continues(':::callout\nLead in.\n$$x$$\nwhere x is small.\n:::')).toEqual([false, true]);
    // Two displays in a row inside one paragraph: the text after both continues it.
    expect(continues('Lead in\n$$a$$\n$$b$$\nwhere a and b are small.')).toEqual([false, true]);
    // Text after the display, then another display, then more text: one paragraph throughout.
    expect(continues('Lead in\n$$a$$\nand then\n$$b$$\nand so on.')).toEqual([false, true, true]);
  });

  it('interrupts a paragraph only with a whole display', () => {
    // Two formulas on one line are not one display: the line stays text.
    const two = parseMarkdownWithIssues('Prose before\n$$a$$ and $$b$$\nmore prose.');
    expect(two.blocks.map((b) => b.type)).toEqual(['paragraph']);
    // A stray `$$` line with no closing fence after it opens no display
    // that would swallow the rest of the document.
    const stray = parseMarkdownWithIssues('Prose before\n$$\nmore prose.\n\nAnother paragraph.');
    expect(stray.blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    expect(stray.issues.some((i) => i.kind === 'unclosedMathBlock')).toBe(false);
    // Nor one whose only closing fence lies past a blank line: the display
    // later on stays a display of its own.
    const far = parseMarkdownWithIssues('Prose before\n$$\nmore prose.\n\n$$\nx^2\n$$');
    expect(far.blocks.map((b) => b.type)).toEqual(['paragraph', 'mathDisplay']);
    expect(far.blocks[1]!.tex).toBe('x^2');
  });

  it('indents the paragraph after a display set off by a blank line above, as 1.4 did', () => {
    const md = `${sentences(8)}\n\n$$x^2 + y^2 = z^2$$\n${sentences(8)}`;
    const on = blocksOf(build(md)).filter((b) => b.block.type === 'paragraph').map((b) => firstLineX(b.block));
    expect(on[0]).toBeGreaterThan(5);
    expect(on[1]).toBeCloseTo(on[0]!, 1);
    // `math.indentAfterDisplay: false` sets it flush.
    const off = blocksOf(build(md, { ...PAGE, math: { indentAfterDisplay: false } })).filter((b) => b.block.type === 'paragraph').map((b) => firstLineX(b.block));
    expect(off[1]).toBeCloseTo(0, 1);
  });

  it('sets the continuation flush, and the new paragraph indented', () => {
    const doc = build(`${sentences(8)}\n$$x^2 + y^2 = z^2$$\n${sentences(8)}\n\n$$a + b$$\n\n${sentences(8)}`);
    const paras = blocksOf(doc).filter((b) => b.block.type === 'paragraph').map((b) => b.block);
    expect(paras.length).toBe(3);
    const indent = firstLineX(paras[0]!);
    expect(indent).toBeGreaterThan(5);
    expect(firstLineX(paras[1]!)).toBeCloseTo(0, 1); // "where …": continues
    expect(firstLineX(paras[2]!)).toBeCloseTo(indent, 1); // after a blank line: a new paragraph
  });

  it('math.indentAfterDisplay: false sets every paragraph after a display flush', () => {
    expect(resolveMathConfig().indentAfterDisplay).toBe(true);
    expect(stripMathDefaults({ indentAfterDisplay: true })).toBeUndefined();
    expect(stripMathDefaults({ indentAfterDisplay: false })).toEqual({ indentAfterDisplay: false });
    const md = `${sentences(8)}\n\n$$a + b$$\n\n${sentences(8)}\n\n${sentences(8)}`;
    const on = blocksOf(build(md)).filter((b) => b.block.type === 'paragraph').map((b) => firstLineX(b.block));
    const off = blocksOf(build(md, { ...PAGE, math: { indentAfterDisplay: false } })).filter((b) => b.block.type === 'paragraph').map((b) => firstLineX(b.block));
    expect(on[1]).toBeGreaterThan(5);
    expect(off[1]).toBeCloseTo(0, 1);
    // Only the paragraph right after the formula.
    expect(off[0]).toBeCloseTo(on[0]!, 1);
    expect(off[2]).toBeCloseTo(on[2]!, 1);
  });
});

describe('a display formula keeps with its lead-in line (EF-84)', () => {
  /** Paragraph lengths that put the lead-in's last line at a column foot. */
  const cases = (keep: boolean) => {
    const out: { tail: number; doc: VDTDocument }[] = [];
    for (let tail = 4; tail <= 30; tail++) {
      const md = `${filler(8)}\n\nThe period is given by ${sentences(tail)} as\n\n$$T_0 = 2\\pi\\sqrt{\\frac{L}{g}}$$\n\n${filler(6, 20)}`;
      out.push({ tail, doc: build(md, { ...PAGE, math: { keepWithLeadIn: keep } }) });
    }
    return out;
  };
  /** Whether the formula sits in another column than the lead-in's last line. */
  const separated = (doc: VDTDocument): boolean => {
    const all = blocksOf(doc);
    const at = all.findIndex((b) => b.block.type === 'mathDisplay');
    const formula = all[at]!;
    const lead = all[at - 1]!;
    return lead.page !== formula.page || lead.column !== formula.column;
  };

  it('is off by default: the formula alone moves on', () => {
    expect(resolveMathConfig().keepWithLeadIn).toBe(false);
    expect(stripMathDefaults({ keepWithLeadIn: false })).toBeUndefined();
    expect(cases(false).filter(({ doc }) => separated(doc)).length).toBeGreaterThan(0);
  }, 60_000);

  it('takes the last line of the paragraph on with the formula', () => {
    const off = cases(false);
    const on = cases(true);
    let moved = 0;
    on.forEach(({ tail, doc }, i) => {
      expect(separated(doc), `tail=${tail}`).toBe(false);
      if (separated(off[i]!.doc)) moved++;
      // Every line of the lead-in is still set, once.
      const lines = (d: VDTDocument) => blocksOf(d).filter((b) => b.block.type === 'paragraph').reduce((n, b) => n + b.block.lines.length, 0);
      expect(lines(doc), `tail=${tail}`).toBe(lines(off[i]!.doc));
    });
    expect(moved).toBeGreaterThan(0);
  }, 60_000);
});
