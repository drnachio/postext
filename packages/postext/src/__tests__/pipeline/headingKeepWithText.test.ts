import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTDocument } from '../../index';

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
// One line each in the ~700 px column (7 px per character): the room under
// the heading sweeps every value as `k` grows.
const short = (i: number) => `Short line ${i}.`;
const shorts = (n: number) => Array.from({ length: n }, (_, i) => short(i)).join('\n\n');
const WORDS = 'carries enough words to take a few lines of the narrow column so the flow advances steadily and on';

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }], balancing: { enabled: false } },
};
const build = (md: string): VDTDocument => buildDocument({ markdown: md }, PAGE, createMeasurementCache());

// Ignacio's rule (EMP ch. 22 p. 252, "Técnicas de análisis" alone at a
// column foot): a heading never closes a column. If the widow minimum of
// the text after it fits under it, those lines stay with the heading —
// even when that leaves a short tail; otherwise heading and text move to
// the next column together.
describe('a heading never closes a column', () => {
  it('keeps at least the widow minimum of the text with the heading, or moves both', () => {
    const widowMin = 2;
    let splitUnderHeading = 0;
    let movedTogether = 0;
    for (let k = 1; k <= 60; k++) {
      // A three-line paragraph after the heading (a lead-in ending in a
      // colon and a list follow, as in the book), preceded by k one-line
      // paragraphs.
      const long = `Paragraph ${WORDS} ${WORDS} ${WORDS.slice(0, 40)}:`;
      const md = [shorts(k), '', '# Section', '', long, '', '- item one of the list', '- item two of the list', '', shorts(3)].join('\n');
      const doc = build(md);
      for (const page of doc.pages) {
        for (const col of page.columns) {
          if (col.kind === 'span' || col.blocks.length === 0) continue;
          const last = col.blocks[col.blocks.length - 1]!;
          expect(last.type, `page ${page.index} column ${col.index} ends on a heading (k=${k})`).not.toBe('heading');
          const hi = col.blocks.findIndex((b) => b.type === 'heading');
          if (hi === -1) continue;
          const next = col.blocks[hi + 1]!;
          expect(next.type).toBe('paragraph');
          const whole = doc.blocks.filter((b) => b.contentIndex === next.contentIndex).length === 1;
          if (!whole) {
            expect(next.lines.length).toBeGreaterThanOrEqual(widowMin);
            splitUnderHeading++;
          } else if (hi === 0) {
            movedTogether++;
          }
        }
      }
    }
    // The sweep exercised both outcomes.
    expect(splitUnderHeading).toBeGreaterThan(0);
    expect(movedTogether).toBeGreaterThan(0);
  });
});
