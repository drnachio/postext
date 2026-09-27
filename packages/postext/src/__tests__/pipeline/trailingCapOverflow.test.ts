import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
/** One paragraph of `n` short sentences. */
const long = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i} runs on.`).join(' ');

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const build = (md: string, config: PostextConfig = PAGE, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown: md, resources }, config, createMeasurementCache());

/** Lines painted below the foot of the column that holds them — the
 *  renderers clip to the column box, so these never show. */
const clippedLines = (doc: VDTDocument) => {
  const out: { page: number; column: number; text: string }[] = [];
  for (const p of doc.pages) {
    p.columns.forEach((c, ci) => {
      const foot = c.bbox.y + c.bbox.height;
      for (const b of c.blocks) {
        for (const l of b.lines ?? []) {
          if (l.bbox.y + l.bbox.height > foot + 0.5) out.push({ page: p.index, column: ci, text: l.text });
        }
      }
    });
  }
  return out;
};

const lastLineText = (doc: VDTDocument): string | undefined => {
  const blocks = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks));
  const last = blocks[blocks.length - 1];
  return last?.lines?.[last.lines.length - 1]?.text;
};

describe('a closing band cut level never holds more than its columns (EF-55, EF-72)', () => {
  it('a two-line tail that cannot split 1 + 1 gets a column tall enough for both lines', () => {
    // 27 paragraphs fill page 1; the last one spills two lines onto page 2.
    // The level cut of two lines over two columns is one line each, but the
    // widow / orphan minimum keeps the two lines together.
    const doc = build(`${filler(27)}\n\n${long(30)}`);
    expect(doc.pages.length).toBe(2);
    expect(clippedLines(doc)).toEqual([]);
    const last = doc.pages[1]!;
    const col = last.columns.find((c) => c.blocks.length > 0)!;
    expect(col.availableHeight).toBeGreaterThanOrEqual(-0.5);
    expect(lastLineText(doc)).toMatch(/Sentence 29 runs on\.$/);
  });

  it('holds before a chapter opener with an odd-page break too (EF-55)', () => {
    const config: PostextConfig = {
      ...PAGE,
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
    };
    for (const tail of [30, 31]) {
      const doc = build(`# One\n\n${filler(26)}\n\n${long(tail)}\n\n# Two\n\n${filler(2)}`, config);
      expect(clippedLines(doc)).toEqual([]);
    }
  });

  it('holds before a chapter opener whose break takes any page (EF-55 addendum)', () => {
    // The spill page before a `parity: 'any'` break is a closing page like
    // the one before an odd break: its level cut never holds fewer lines
    // than the block it cuts.
    const config: PostextConfig = {
      ...PAGE,
      layout: { layoutType: 'double' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    };
    for (const [n, tails] of [[24, [30, 34, 38, 40]], [25, [20, 26, 30]], [26, [20, 24]]] as const) {
      for (const t of tails) {
        const doc = build(`# One\n\n${para(99)}\n\n${filler(n)}\n\n${long(t)}\n\n# Two\n\n${filler(2)}`, config);
        expect(clippedLines(doc), `n=${n} t=${t}`).toEqual([]);
      }
    }
  });

  it('holds under a column-top float on the closing page', () => {
    // The figure heads column 1 of the closing page; the level cut is an
    // absolute line, so that column is the shorter one.
    const figure: Resource = {
      id: 'f1',
      typeId: 'figure',
      kind: 'bitmap',
      caption: 'Figure f1.',
      createdAt: 0,
      updatedAt: 0,
      bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 60 },
      placement: { position: 'top' },
    };
    const md = [filler(24), `${para(24)} See :ref{id="f1"}.`, filler(2, 25), long(30)].join('\n\n');
    const doc = build(md, PAGE, [figure]);
    const last = doc.pages[doc.pages.length - 1]!;
    expect(last.floats?.length).toBe(1);
    expect(clippedLines(doc)).toEqual([]);
    expect(lastLineText(doc)).toMatch(/Sentence 29 runs on\.$/);
  });

  it('no column of any page is shorter than the lines it holds, across tail lengths', () => {
    for (const n of [26, 27]) {
      for (const t of [28, 30, 32, 34, 36, 38, 40]) {
        const doc = build(`${filler(n)}\n\n${long(t)}`);
        expect(clippedLines(doc), `n=${n} t=${t}`).toEqual([]);
      }
    }
  });
});
