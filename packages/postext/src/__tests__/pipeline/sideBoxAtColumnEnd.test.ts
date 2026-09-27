import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { stripCalloutStylesDefaults } from '../../defaults/calloutStyles';
import { resolveAllConfig } from '../../pipeline/config';
import type { CalloutSideAtColumnEnd, PostextConfig, VDTDocument } from '../../index';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** The critical-edition page: eight 14 pt lines a page, a float-only side
 *  column, and a box style with no frame for the line numbers. */
const config = (sideAtColumnEnd?: CalloutSideAtColumnEnd): PostextConfig => ({
  page: { width: mm(100), height: mm(60), dpi: 150, margins: { top: mm(10), bottom: mm(10.48), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 20, sideColumnRole: 'floats', gutterWidth: mm(3) },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', firstLineIndent: pt(0) },
  paragraphStyles: [{ id: 'v' }],
  calloutStyles: [{
    id: 'n', backgroundEnabled: false,
    padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
    ...(sideAtColumnEnd ? { sideAtColumnEnd } : {}),
  }],
  header: { elements: [] },
  footer: { elements: [] },
});

/** Twelve one-line paragraphs, the box fenced after line `after`. */
const build = (after: number, sideAtColumnEnd?: CalloutSideAtColumnEnd): VDTDocument => {
  const blocks = Array.from({ length: 12 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
  blocks.splice(after, 0, ':::callout{type="n" span="side"}\nBOX\n:::');
  return buildDocument({ markdown: blocks.join('\n\n') }, config(sideAtColumnEnd), createMeasurementCache());
};

/** Page and baseline of the box's line, and of text line `n`. */
const boxAt = (doc: VDTDocument) => {
  for (const page of doc.pages) {
    const line = (page.floats ?? []).flatMap((b) => b.lines).find((l) => l.text === 'BOX');
    if (line) return { page: page.index, baseline: line.baseline };
  }
  throw new Error('no box');
};
const lineAt = (doc: VDTDocument, n: number) => {
  for (const page of doc.pages) {
    for (const b of page.columns.flatMap((c) => c.blocks)) {
      const line = b.lines.find((l) => l.text.startsWith(`Line ${n} `));
      if (line) return { page: page.index, baseline: line.baseline };
    }
  }
  throw new Error(`no line ${n}`);
};
const lineStarting = (doc: VDTDocument, prefix: string) => {
  for (const page of doc.pages) {
    for (const b of page.columns.flatMap((c) => c.blocks)) {
      const line = b.lines.find((l) => l.text.startsWith(prefix));
      if (line) return { page: page.index, baseline: line.baseline };
    }
  }
  throw new Error(`no line ${prefix}`);
};

describe('a side box fenced where its text column is full (EF-161)', () => {
  it("'after' stands it beside the text after the fence, at the head of the next page", () => {
    const doc = build(8, 'after');
    // Line 8 is the last line of page 1; line 9 opens page 2.
    expect(lineAt(doc, 8).page).toBe(0);
    expect(lineAt(doc, 9).page).toBe(1);
    expect(boxAt(doc)).toEqual(lineAt(doc, 9));
  });

  it("'before', the default, keeps it beside the text before the fence (postext 1.4)", () => {
    for (const doc of [build(8), build(8, 'before')]) {
      expect(boxAt(doc)).toEqual(lineAt(doc, 8));
    }
  });

  it('places a box fenced anywhere else the same way with either setting', () => {
    for (const after of [3, 6, 7, 10]) {
      const before = build(after, 'before');
      const next = build(after, 'after');
      expect(boxAt(next), `${after}`).toEqual(boxAt(before));
      // Beside the line after its fence.
      expect(boxAt(next), `${after}`).toEqual(lineAt(next, after + 1));
    }
  });

  it('keeps a box nothing follows with the text before it', () => {
    // Fenced after the last line of a chapter that fills its page: no text
    // resumes anywhere, so no page opens for the box.
    const blocks = Array.from({ length: 8 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
    blocks.push(':::callout{type="n" span="side"}\nBOX\n:::');
    const doc = buildDocument({ markdown: blocks.join('\n\n') }, config('after'), createMeasurementCache());
    expect(doc.pages).toHaveLength(1);
    expect(boxAt(doc)).toEqual(lineAt(doc, 8));
  });

  it("'after' follows the text when the break rules move it on with room left", () => {
    // Seven lines, then the box, then a paragraph of three lines: page 1
    // has room for one more line, and the widow and orphan rules send the
    // paragraph whole to page 2. The box goes with it.
    const blocks = Array.from({ length: 7 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
    blocks.push(':::callout{type="n" span="side"}\nBOX\n:::');
    blocks.push('Next paragraph: alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho.');
    blocks.push(...Array.from({ length: 4 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 20} of the text.\n:::`));
    const markdown = blocks.join('\n\n');
    const after = buildDocument({ markdown }, config('after'), createMeasurementCache());
    const next = lineStarting(after, 'Next paragraph');
    expect(lineAt(after, 7).page).toBe(0);
    expect(next.page).toBe(1);
    expect(boxAt(after)).toEqual(next);
    // 'before' leaves it at its fence, under line 7.
    const before = buildDocument({ markdown }, config('before'), createMeasurementCache());
    expect(boxAt(before).page).toBe(0);
  });

  it("'after' stands beside a heading kept with its text on the next page", () => {
    const blocks = Array.from({ length: 7 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
    blocks.push(':::callout{type="n" span="side"}\nBOX\n:::');
    blocks.push('## Next part');
    blocks.push(...Array.from({ length: 6 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 20} of the text.\n:::`));
    const doc = buildDocument({ markdown: blocks.join('\n\n') }, config('after'), createMeasurementCache());
    const heading = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'heading')!;
    expect(heading.pageIndex).toBe(1);
    const box = doc.pages[1]!.floats!.find((b) => b.lines.some((l) => l.text === 'BOX'))!;
    expect(box).toBeDefined();
    // The box's top is the heading's (on the baseline grid).
    expect(Math.abs(box.bbox.y - heading.bbox.y)).toBeLessThan(1);
  });

  it("keeps the order of boxes fenced together, whatever each one's setting", () => {
    const withGloss = (after: number): VDTDocument => {
      const blocks = Array.from({ length: 12 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
      blocks.splice(after, 0, ':::callout{type="n" span="side"}\nBOX\n:::', ':::callout{type="g" span="side"}\nGLOSS\n:::');
      const c = config('after');
      c.calloutStyles = [...c.calloutStyles!, { id: 'g', backgroundEnabled: false, padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) } }];
      return buildDocument({ markdown: blocks.join('\n\n') }, c, createMeasurementCache());
    };
    const glossAt = (doc: VDTDocument) => {
      for (const page of doc.pages) {
        const line = (page.floats ?? []).flatMap((b) => b.lines).find((l) => l.text === 'GLOSS');
        if (line) return { page: page.index, baseline: line.baseline };
      }
      throw new Error('no gloss');
    };
    // Mid-page: both at the fence, the line number first.
    const mid = withGloss(3);
    expect(boxAt(mid)).toEqual(lineAt(mid, 4));
    expect(glossAt(mid).page).toBe(0);
    expect(glossAt(mid).baseline).toBeGreaterThan(boxAt(mid).baseline);
    // At the full column: the line number goes on with line 9, the gloss
    // ('before') stays with the text it follows on page 1.
    const full = withGloss(8);
    expect(boxAt(full)).toEqual(lineAt(full, 9));
    expect(glossAt(full).page).toBe(0);
  });

  it('stacks two boxes fenced together at the full column in their order', () => {
    const blocks = Array.from({ length: 12 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
    blocks.splice(8, 0, ':::callout{type="n" span="side"}\nBOX\n:::', ':::callout{type="n" span="side"}\nBOX 2\n:::');
    const doc = buildDocument({ markdown: blocks.join('\n\n') }, config('after'), createMeasurementCache());
    const second = doc.pages[1]!.floats!.flatMap((b) => b.lines).find((l) => l.text === 'BOX 2')!;
    expect(boxAt(doc)).toEqual(lineAt(doc, 9));
    expect(second.baseline).toBeGreaterThan(boxAt(doc).baseline);
  });

  it('resolves and strips the setting', () => {
    const side = (sideAtColumnEnd?: CalloutSideAtColumnEnd) =>
      resolveAllConfig({ calloutStyles: [{ id: 'x', ...(sideAtColumnEnd ? { sideAtColumnEnd } : {}) }] }).calloutStyles[0]!.sideAtColumnEnd;
    expect(side()).toBe('before');
    expect(side('after')).toBe('after');
    expect(side('bogus' as CalloutSideAtColumnEnd)).toBe('before');
    expect(stripCalloutStylesDefaults([{ id: 'x', sideAtColumnEnd: 'before' }])).toEqual([{ id: 'x' }]);
    expect(stripCalloutStylesDefaults([{ id: 'x', sideAtColumnEnd: 'after' }])).toEqual([{ id: 'x', sideAtColumnEnd: 'after' }]);
  });
});
