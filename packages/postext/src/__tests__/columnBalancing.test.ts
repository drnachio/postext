import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/build';
import { createMeasurementCache } from '../measure';
import { collectColumnGaps, proposeBalanceLines } from '../pipeline/columnBalancing';
import { createVDTPage, type VDTDocument, type VDTColumn, type VDTBlock } from '../vdt';
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

const SENTENCE =
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';

function paragraph(sentences: number): string {
  return SENTENCE.repeat(sentences).trim();
}

/** Body of repeated [heading + paragraphs] sections — long enough to span
 *  several pages in the default double-column A4 layout. */
function sampleMarkdown(): string {
  const parts: string[] = ['# Documento de prueba', '', paragraph(6), ''];
  for (let i = 1; i <= 8; i++) {
    parts.push(`## Sección ${i}`, '', paragraph(5), '', paragraph(4), '');
    parts.push(`### Detalle ${i}`, '', paragraph(5), '', paragraph(3), '');
  }
  return parts.join('\n');
}

const NO_FORCED = new Set<number>();

function totalGaps(doc: VDTDocument): number {
  return collectColumnGaps(doc, NO_FORCED).reduce((s, g) => s + g.gapLines, 0);
}

const builtDocs = new Map<string, VDTDocument>();
function buildWith(balancingEnabled: boolean, maxLinesPerHeading?: number): VDTDocument {
  const key = `${balancingEnabled}:${maxLinesPerHeading ?? 'default'}`;
  let doc = builtDocs.get(key);
  if (!doc) {
    const config: PostextConfig = {
      headings: { balancing: { enabled: balancingEnabled, maxLinesPerHeading } },
    };
    doc = buildDocument({ markdown: sampleMarkdown() }, config, createMeasurementCache());
    builtDocs.set(key, doc);
  }
  return doc;
}

const LONG = 30_000;

describe('column balancing (vertical justification)', () => {
  it('reduces bottom gaps without moving content across pages', () => {
    const plain = buildWith(false);
    const balanced = buildWith(true);

    // The unbalanced layout must exhibit at least one fillable gap, or this
    // test asserts nothing — adjust sampleMarkdown() if it ever goes flush.
    const plainGaps = collectColumnGaps(plain, NO_FORCED);
    const fillable = plainGaps.filter((g) => g.candidates.length > 0);
    expect(fillable.length).toBeGreaterThan(0);

    expect(totalGaps(balanced)).toBeLessThan(totalGaps(plain));

    // Balancing is local: the set of content blocks on each page must not
    // change — only vertical positions inside the page shift.
    expect(balanced.pages.length).toBe(plain.pages.length);
    const blocksPerPage = (doc: VDTDocument) =>
      doc.pages.map((p) =>
        p.columns.flatMap((c) => c.blocks.map((b) => b.id)).sort().join(','),
      );
    expect(blocksPerPage(balanced)).toEqual(blocksPerPage(plain));

    expect(balanced.converged).toBe(true);
    expect(balanced.iterationCount).toBeGreaterThan(1);
  }, LONG);

  it('fills every gap that has an eligible heading in its column (uncapped)', () => {
    // With the per-heading cap effectively lifted, a converged layout may
    // only retain gaps in columns without any eligible heading.
    const balanced = buildWith(true, 12);
    expect(balanced.converged).toBe(true);
    const leftover = collectColumnGaps(balanced, NO_FORCED);
    expect(leftover.filter((g) => g.candidates.length > 0)).toEqual([]);
  }, LONG);

  it('keeps text lines on the baseline grid after balancing', () => {
    const balanced = buildWith(true);
    const grid = balanced.baselineGrid;
    for (const page of balanced.pages) {
      for (const col of page.columns) {
        for (const block of col.blocks) {
          if (block.type !== 'paragraph') continue;
          for (const line of block.lines) {
            const offset = (line.baseline - col.bbox.y - 0.8 * grid) % grid;
            const dist = Math.min(offset, grid - offset);
            expect(dist).toBeLessThan(0.01);
          }
        }
      }
    }
  }, LONG);

  it('is a no-op when disabled', () => {
    const plain = buildWith(false);
    expect(plain.iterationCount).toBe(1);
  }, LONG);
});

// ---------------------------------------------------------------------------
// Distribution rule — unit-tested over a synthetic VDT so the share each
// heading receives is exact: round-robin in importance order, the most
// important heading (lowest level) takes the largest share.
// ---------------------------------------------------------------------------

function fakeBlock(partial: Partial<VDTBlock>): VDTBlock {
  return {
    id: partial.id ?? 'b',
    type: partial.type ?? 'paragraph',
    bbox: { x: 0, y: 0, width: 100, height: 10 },
    lines: [],
    pageIndex: 0,
    columnIndex: 0,
    dirty: false,
    snappedToGrid: false,
    fontString: '16px serif',
    color: '#000',
    textAlign: 'left',
    ...partial,
  };
}

function fakeDoc(columns: Array<{ blocks: VDTBlock[]; availableHeight: number }>[]): VDTDocument {
  const pages = columns.map((cols, pi) => {
    const page = createVDTPage(pi, 1000, 1000);
    page.columns = cols.map((c, ci): VDTColumn => ({
      index: ci,
      bbox: { x: ci * 500, y: 0, width: 480, height: 900 },
      blocks: c.blocks,
      availableHeight: c.availableHeight,
      baselineOffset: 0,
    }));
    return page;
  });
  return { pages, baselineGrid: 24 } as VDTDocument;
}

describe('proposeBalanceLines distribution', () => {
  const para = () => fakeBlock({ type: 'paragraph' });
  const heading = (contentIndex: number, level: number) =>
    fakeBlock({ type: 'heading', headingLevel: level, contentIndex });

  it('gives the larger share to the more important heading (3 lines → h2+2, h3+1)', () => {
    // Page 0, column 0: 3-line gap with an h2 (idx 10) and an h3 (idx 20).
    // Page 1 exists so page 0 counts as flowing on.
    const doc = fakeDoc([
      [
        { blocks: [para(), heading(10, 2), para(), heading(20, 3), para()], availableHeight: 3 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [[{ blocks: [para()], availableHeight: 0 }], []].flat() as never,
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, new Map(), 2);
    expect(proposal.changed).toBe(true);
    expect(proposal.lines.get(10)).toBe(2); // h2 — main heading, larger share
    expect(proposal.lines.get(20)).toBe(1); // h3
  });

  it('splits an even gap equally (2 lines → +1 and +1)', () => {
    const doc = fakeDoc([
      [
        { blocks: [para(), heading(10, 2), para(), heading(20, 3), para()], availableHeight: 2 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, new Map(), 2);
    expect(proposal.lines.get(10)).toBe(1);
    expect(proposal.lines.get(20)).toBe(1);
  });

  it('respects maxLinesPerHeading and ignores first/last-in-column headings', () => {
    const doc = fakeDoc([
      [
        // First block is a heading (ineligible), one eligible h2, trailing
        // heading (ineligible). Gap of 5 lines, cap 2 → only +2 assigned.
        { blocks: [heading(1, 2), para(), heading(10, 2), para(), heading(30, 3)], availableHeight: 5 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, new Map(), 2);
    expect(proposal.lines.get(1)).toBeUndefined();
    expect(proposal.lines.get(30)).toBeUndefined();
    expect(proposal.lines.get(10)).toBe(2);
  });

  it('does not balance the last column of a forced-break or final page', () => {
    const doc = fakeDoc([
      [
        { blocks: [para(), heading(10, 2), para()], availableHeight: 2 * 24 },
        { blocks: [para(), heading(20, 2), para()], availableHeight: 2 * 24 },
      ],
      [{ blocks: [para(), heading(40, 2), para()], availableHeight: 3 * 24 }],
    ]);
    // Page 1 is the last content page: its column is never balanced. With
    // page 0 forced, only its NON-last column (col 0) remains balanceable.
    const proposal = proposeBalanceLines(doc, new Set([0]), new Map(), 2);
    expect(proposal.lines.get(10)).toBe(2);
    expect(proposal.lines.get(20)).toBeUndefined();
    expect(proposal.lines.get(40)).toBeUndefined();
  });
});
