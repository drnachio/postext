import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/build';
import { createMeasurementCache } from '../measure';
import {
  collectColumnGaps,
  proposeBalanceLines,
  type BalanceState,
  type BalanceProposalOptions,
} from '../pipeline/columnBalancing';
import { createVDTPage, type VDTDocument, type VDTColumn, type VDTBlock, type VDTLine } from '../vdt';
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
// New levers, end to end: list-end stretch and loose paragraphs.
// ---------------------------------------------------------------------------

describe('stretch levers (e2e)', () => {
  /** Paragraph/list mix without any heading — gaps can only be absorbed by
   *  the list-end and loose-paragraph levers. */
  const listMarkdown = (): string => {
    const parts: string[] = [];
    for (let i = 0; i < 14; i++) {
      parts.push(paragraph(4 + (i % 4)), '');
      parts.push(`- Primer punto de la lista ${i} con un texto razonablemente largo`, `- Segundo punto de la lista ${i}`, `- Tercer punto con algo más de desarrollo para ocupar línea y media ${i}`, '');
      parts.push(paragraph(3 + ((i + 2) % 3)), '');
    }
    return parts.join('\n');
  };

  /** Mostly short, split-resistant paragraphs (widow/orphan rules leave
   *  bottom slack) with periodic long ones — the loose-lever candidates. */
  const paragraphsMarkdown = (): string => {
    const parts: string[] = [];
    for (let i = 0; i < 30; i++) parts.push(paragraph(i % 5 === 0 ? 7 : 2), '');
    return parts.join('\n');
  };

  const build = (markdown: string, balancing: Record<string, boolean | number>): VDTDocument =>
    buildDocument(
      { markdown },
      { headings: { balancing: balancing as never } },
      createMeasurementCache(),
    );

  it('fills gaps after list ends when no heading is available', () => {
    const md = listMarkdown();
    const off = build(md, { enabled: true, stretchAfterLists: false, looseParagraphs: false });
    const on = build(md, { enabled: true, stretchAfterLists: true, looseParagraphs: false });

    // Non-vacuous: the lever-less layout must expose at least one gap with a
    // list-end stretch point.
    const offGaps = collectColumnGaps(off, NO_FORCED);
    expect(offGaps.some((g) => g.candidates.some((c) => c.kind === 'listEnd'))).toBe(true);

    expect(totalGaps(on)).toBeLessThan(totalGaps(off));
  }, LONG);

  it('runs a paragraph one line long as a last resort', () => {
    const md = paragraphsMarkdown();
    const off = build(md, { enabled: true, stretchAfterLists: false, looseParagraphs: false });
    const on = build(md, { enabled: true, stretchAfterLists: false, looseParagraphs: true });

    const offGaps = collectColumnGaps(off, NO_FORCED);
    expect(offGaps.some((g) => g.candidates.some((c) => c.kind === 'looseParagraph'))).toBe(true);

    expect(totalGaps(on)).toBeLessThan(totalGaps(off));

    // Loosened text must stay on the baseline grid.
    const grid = on.baselineGrid;
    for (const page of on.pages) {
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

function fakeLine(): VDTLine {
  return { text: 'x', bbox: { x: 0, y: 0, width: 100, height: 24 }, baseline: 19, hyphenated: false };
}

const baseOptions = (over?: Partial<BalanceProposalOptions>): BalanceProposalOptions => ({
  maxLinesPerHeading: 2,
  stretchAfterLists: true,
  maxLinesAfterList: 1,
  looseParagraphs: true,
  optimalLineBreaking: true,
  failedLoose: new Set<number>(),
  ...over,
});

const emptyState = (): BalanceState => ({ lines: new Map(), loose: new Map() });

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
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
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
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
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
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
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
    const proposal = proposeBalanceLines(doc, new Set([0]), emptyState(), baseOptions());
    expect(proposal.lines.get(10)).toBe(2);
    expect(proposal.lines.get(20)).toBeUndefined();
    expect(proposal.lines.get(40)).toBeUndefined();
  });
});

describe('list-end and loose-paragraph levers', () => {
  const para = () => fakeBlock({ type: 'paragraph' });
  const heading = (contentIndex: number, level: number) =>
    fakeBlock({ type: 'heading', headingLevel: level, contentIndex });
  const listItem = () => fakeBlock({ type: 'listItem', listDepth: 1, listKind: 'unordered' });
  const afterListPara = (contentIndex: number) =>
    fakeBlock({ type: 'paragraph', contentIndex, id: `p-${contentIndex}` });
  const justPara = (contentIndex: number, lineCount: number, id = `p-${contentIndex}`) =>
    fakeBlock({
      type: 'paragraph',
      textAlign: 'justify',
      contentIndex,
      id,
      lines: Array.from({ length: lineCount }, fakeLine),
    });

  it('assigns a line to the block after a list end, capped at maxLinesAfterList', () => {
    const doc = fakeDoc([
      [
        { blocks: [para(), listItem(), listItem(), afterListPara(50)], availableHeight: 2 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect(proposal.lines.get(50)).toBe(1); // cap 1 even though the gap is 2
  });

  it('exhausts heading capacity before touching list ends', () => {
    const doc = fakeDoc([
      [
        {
          blocks: [para(), heading(10, 2), para(), listItem(), listItem(), afterListPara(50)],
          availableHeight: 3 * 24,
        },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect(proposal.lines.get(10)).toBe(2); // heading first, up to its cap
    expect(proposal.lines.get(50)).toBe(1); // then the list end
  });

  it('skips list ends when stretchAfterLists is disabled', () => {
    const doc = fakeDoc([
      [
        { blocks: [para(), listItem(), afterListPara(50)], availableHeight: 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(
      doc, NO_FORCED, emptyState(), baseOptions({ stretchAfterLists: false }),
    );
    expect(proposal.lines.get(50)).toBeUndefined();
  });

  it('falls back to one loose paragraph per column — the longest one', () => {
    const doc = fakeDoc([
      [
        { blocks: [justPara(60, 3), justPara(61, 8), justPara(62, 5)], availableHeight: 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect([...proposal.loose.keys()]).toEqual([61]); // most lines wins
    expect(proposal.lines.size).toBe(0);
  });

  it('skips failed loose candidates and never adds a second one per column', () => {
    const doc = fakeDoc([
      [
        { blocks: [justPara(60, 3), justPara(61, 8), justPara(62, 5)], availableHeight: 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const afterFailure = proposeBalanceLines(
      doc, NO_FORCED, emptyState(), baseOptions({ failedLoose: new Set([61]) }),
    );
    expect([...afterFailure.loose.keys()]).toEqual([62]); // next longest

    const alreadyLoose = proposeBalanceLines(
      doc, NO_FORCED,
      { lines: new Map(), loose: new Map([[60, 1]]) },
      baseOptions(),
    );
    expect(alreadyLoose.loose.size).toBe(1); // no second loose paragraph
    expect(alreadyLoose.changed).toBe(false);
  });

  it('excludes split paragraphs and non-justified blocks from loosening', () => {
    const splitPart1 = justPara(70, 4, 'p-70');
    const splitPart2 = justPara(70, 4, 'p-70-cont-1');
    const leftAligned = fakeBlock({
      type: 'paragraph', textAlign: 'left', contentIndex: 71,
      lines: Array.from({ length: 6 }, fakeLine),
    });
    const doc = fakeDoc([
      [
        { blocks: [splitPart1, leftAligned], availableHeight: 24 },
        { blocks: [splitPart2], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect(proposal.loose.size).toBe(0);
    expect(proposal.changed).toBe(false);
  });

  it('disables loosening without optimal line breaking or when turned off', () => {
    const doc = fakeDoc([
      [
        { blocks: [justPara(60, 6), justPara(61, 4)], availableHeight: 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const noOptimal = proposeBalanceLines(
      doc, NO_FORCED, emptyState(), baseOptions({ optimalLineBreaking: false }),
    );
    expect(noOptimal.loose.size).toBe(0);
    const turnedOff = proposeBalanceLines(
      doc, NO_FORCED, emptyState(), baseOptions({ looseParagraphs: false }),
    );
    expect(turnedOff.loose.size).toBe(0);
  });
});
