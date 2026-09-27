import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTDocument } from '../../vdt';
import type { PostextConfig } from '../../types';

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

// The EF-126 repro (boxes-split-float-pin), with the word counts scaled to
// the stub's narrower glyphs: a split box whose rest opens page 2, then two
// paragraphs and a page-span box that levels the band above it.
const para = (n: number, seed: number): string =>
  `${Array.from({ length: Math.round(n * 2.4) }, (_, k) => `palabra${(k * 7 + seed) % 13}`).join(' ')}.`;
const steps = Array.from({ length: 14 }, (_, i) => `${i + 1}. ${para(22, i)}`).join('\n');
const markdown = (lead: number): string => [
  '# T', para(lead, 1),
  ':::callout{type="pasos"}', steps, ':::',
  para(40, 2), para(60, 3),
  ':::callout{type="box" span="page"}', para(40, 4), ':::',
  para(30, 5),
].join('\n\n');
const config = (beforeSpan: boolean): PostextConfig => ({
  layout: { layoutType: 'double' },
  headings: { balancing: { beforeSpan }, levels: [{ level: 1, breakBefore: { enabled: false, parity: 'any' } }] },
  calloutStyles: [{ id: 'pasos', keepTogether: false }, { id: 'box' }],
});

/** Lines set below the foot of the column that holds them. */
const linesOutside = (doc: VDTDocument): string[] => {
  const out: string[] = [];
  for (const page of doc.pages) {
    page.columns.forEach((col, c) => {
      for (const b of col.blocks) {
        for (const l of b.lines) {
          if (l.bbox.y + l.bbox.height > col.bbox.y + col.bbox.height + 0.5) out.push(`p${page.index}c${c} ${b.type}`);
        }
      }
    });
  }
  return out;
};

describe('a split box that opens a band levelled for a page-span box (EF-126)', () => {
  for (const beforeSpan of [true, false]) {
    it(`keeps every line of the rest inside its column (beforeSpan ${beforeSpan})`, () => {
      for (const lead of [200, 250, 300]) {
        const doc = buildDocument({ markdown: markdown(lead) }, config(beforeSpan), createMeasurementCache());
        expect(linesOutside(doc), `lead ${lead}`).toEqual([]);
        // Nothing lost: all fourteen steps are set, once each.
        const numbers = doc.blocks.filter((b) => b.type === 'listItem' && b.bulletText).map((b) => b.bulletText);
        expect(numbers, `lead ${lead}`).toHaveLength(14);
        // The page-span box still cuts page 2.
        const span = doc.pages[1]!.columns.find((c) => c.kind === 'span');
        expect(span, `lead ${lead}`).toBeDefined();
      }
    }, 60_000);
  }
});
