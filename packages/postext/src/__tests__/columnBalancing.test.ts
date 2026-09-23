import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/build';
import { createMeasurementCache } from '../measure';
import {
  collectColumnGaps,
  proposeBalanceLines,
  firstDivergentColumn,
  balanceKey,
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
    // change — only vertical positions inside the page shift (a paragraph
    // may split differently between the columns of the levelled last page).
    expect(balanced.pages.length).toBe(plain.pages.length);
    const blocksPerPage = (doc: VDTDocument) =>
      doc.pages.map((p) =>
        [...new Set(p.columns.flatMap((c) => c.blocks.map((b) => b.contentIndex)))].sort((a, b) => a! - b!).join(','),
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
  stretchAfterFloats: true,
  maxLinesAfterFloat: 1,
  looseParagraphs: true,
  maxLooseParagraphs: 1,
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
    // page 0 forced, only its NON-last column (col 0) remains balanceable —
    // and only up to the last column's level: both end two lines short, so
    // nothing moves (a closing page ends level, not one column lower).
    const proposal = proposeBalanceLines(doc, new Set([0]), emptyState(), baseOptions());
    expect(proposal.lines.get(10)).toBeUndefined();
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

  it('adds a line under a top float band when headings and list ends cannot', () => {
    const doc = fakeDoc([
      [
        // Column 0 starts under a figure band: its top sits at y=300, the
        // float ends right above it.
        { blocks: [afterListPara(60), para()], availableHeight: 2 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const col = doc.pages[0]!.columns[0]!;
    col.bbox = { ...col.bbox, y: 300, height: 600 };
    doc.pages[0]!.floats = [fakeBlock({ type: 'resource', bbox: { x: 0, y: 0, width: 480, height: 280 } })];
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect(proposal.lines.get(60)).toBe(1); // cap 1 even though the gap is 2

    // Off: the lever stays unused.
    const off = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions({ stretchAfterFloats: false }));
    expect(off.lines.get(60)).toBeUndefined();

    // A column whose float sits below its text is not a candidate.
    const bottom = fakeDoc([
      [
        { blocks: [afterListPara(61), para()], availableHeight: 2 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    bottom.pages[0]!.floats = [fakeBlock({ type: 'resource', bbox: { x: 0, y: 700, width: 480, height: 200 } })];
    expect(proposeBalanceLines(bottom, NO_FORCED, emptyState(), baseOptions()).lines.get(61)).toBeUndefined();
  });

  it('levers the paragraph resuming under a float band on its own fragment', () => {
    // EMP / Deep Sky: the column under the figure opens with the tail of a
    // paragraph that started in the column before. The room belongs under
    // the figure, and the adjustment is keyed to *this* fragment so the
    // paragraph's head, laid out earlier, keeps its own spacing.
    const doc = fakeDoc([
      [
        { blocks: [afterListPara(80), para()], availableHeight: 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const col = doc.pages[0]!.columns[0]!;
    col.bbox = { ...col.bbox, y: 300, height: 600 };
    col.blocks[0]!.id = 'p-80-cont-1';
    doc.pages[0]!.floats = [fakeBlock({ type: 'resource', bbox: { x: 0, y: 0, width: 480, height: 280 } })];

    const gaps = collectColumnGaps(doc, NO_FORCED);
    expect(gaps[0]!.candidates.find((c) => c.contentIndex === 80)?.kind).toBe('afterFloat');
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect(proposal.lines.get(balanceKey(80, 1))).toBe(1);
    expect(proposal.lines.get(80)).toBeUndefined();
  });

  it('treats a heading that opens a column under a float band as a heading lever', () => {
    // A column-top table with a level-4 heading right under it (EMP p. 310):
    // the two missing lines go above the heading (heading cap), not one line
    // under the float (after-float cap).
    const doc = fakeDoc([
      [
        { blocks: [heading(70, 4), para(), para()], availableHeight: 2 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const col = doc.pages[0]!.columns[0]!;
    col.bbox = { ...col.bbox, y: 300, height: 600 };
    doc.pages[0]!.floats = [fakeBlock({ type: 'resource', bbox: { x: 0, y: 0, width: 480, height: 280 } })];
    const gaps = collectColumnGaps(doc, NO_FORCED);
    expect(gaps[0]!.candidates.find((c) => c.contentIndex === 70)?.kind).toBe('heading');
    const proposal = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions({ stretchAfterFloats: false }));
    expect(proposal.lines.get(70)).toBe(2);

    // Without a float above it, a heading opening the column is still no lever.
    const plain = fakeDoc([
      [
        { blocks: [heading(71, 4), para(), para()], availableHeight: 2 * 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    expect(proposeBalanceLines(plain, NO_FORCED, emptyState(), baseOptions()).lines.get(71)).toBeUndefined();
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
    // Every candidate is offered, most lines first; the pass stops after the
    // first one that gains its line (budget of 1).
    expect([...proposal.loose.keys()]).toEqual([61, 62, 60]);
    expect(proposal.looseBudget.get(61)!.need).toBe(1);
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
    expect([...afterFailure.loose.keys()]).toEqual([62, 60]); // next longest first

    const alreadyLoose = proposeBalanceLines(
      doc, NO_FORCED,
      { lines: new Map(), loose: new Map([[60, 1]]) },
      baseOptions(),
    );
    expect(alreadyLoose.loose.size).toBe(1); // no second loose paragraph
    expect(alreadyLoose.changed).toBe(false);
  });

  it('loosens up to maxLooseParagraphs per column, longest first, never more than the gap', () => {
    const twoShort = fakeDoc([
      [
        { blocks: [justPara(60, 3), justPara(61, 8), justPara(62, 5)], availableHeight: 48 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const two = proposeBalanceLines(twoShort, NO_FORCED, emptyState(), baseOptions({ maxLooseParagraphs: 2 }));
    // Every candidate is offered, longest first, sharing a budget of 2.
    expect([...two.loose.keys()]).toEqual([61, 62, 60]);
    expect(two.looseBudget.get(61)!.need).toBe(2);
    expect(two.looseBudget.get(60)).toBe(two.looseBudget.get(61)); // same column

    // Gap of one line: a second paragraph would overshoot — only one.
    const oneShort = fakeDoc([
      [
        { blocks: [justPara(60, 3), justPara(61, 8), justPara(62, 5)], availableHeight: 24 },
        { blocks: [para()], availableHeight: 0 },
      ],
      [{ blocks: [para()], availableHeight: 0 }],
    ]);
    const one = proposeBalanceLines(oneShort, NO_FORCED, emptyState(), baseOptions({ maxLooseParagraphs: 2 }));
    expect([...one.loose.keys()]).toEqual([61, 62, 60]);
    expect(one.looseBudget.get(61)!.need).toBe(1);

    // One already loose and one failed: the third candidate fills the cap.
    const next = proposeBalanceLines(
      twoShort, NO_FORCED,
      { lines: new Map(), loose: new Map([[61, 1]]) },
      baseOptions({ maxLooseParagraphs: 2, failedLoose: new Set([62]) }),
    );
    expect([...next.loose.keys()].sort()).toEqual([60, 61]);
    expect(next.looseBudget.get(60)!.need).toBe(1);
    expect(next.looseBudget.has(61)).toBe(false); // already applied, no new budget
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

describe('cascade containment', () => {
  const para = (contentIndex: number, cont = false) =>
    fakeBlock({ type: 'paragraph', contentIndex, id: cont ? `p-${contentIndex}-cont-1` : `p-${contentIndex}` });
  const heading = (contentIndex: number) => fakeBlock({ type: 'heading', headingLevel: 2, contentIndex });

  it('finds the first column whose blocks or floats changed', () => {
    const a = fakeDoc([
      [{ blocks: [para(1), heading(2), para(3)], availableHeight: 48 }, { blocks: [para(3, true), para(4)], availableHeight: 0 }],
      [{ blocks: [para(5)], availableHeight: 0 }],
    ]);
    const same = fakeDoc([
      [{ blocks: [para(1), heading(2), para(3)], availableHeight: 0 }, { blocks: [para(3, true), para(4)], availableHeight: 0 }],
      [{ blocks: [para(5)], availableHeight: 0 }],
    ]);
    expect(firstDivergentColumn(a, same)).toBeNull();
    // Paragraph 3 moved whole into the second column.
    const moved = fakeDoc([
      [{ blocks: [para(1), heading(2)], availableHeight: 0 }, { blocks: [para(3), para(4)], availableHeight: 0 }],
      [{ blocks: [para(5)], availableHeight: 0 }],
    ]);
    expect(firstDivergentColumn(a, moved)).toEqual({ pageIndex: 0, columnIndex: 0 });
    // Same blocks, a float left the second column: that column diverges.
    const withFloat = fakeDoc([
      [{ blocks: [para(1), heading(2), para(3)], availableHeight: 48 }, { blocks: [para(3, true), para(4)], availableHeight: 0 }],
      [{ blocks: [para(5)], availableHeight: 0 }],
    ]);
    withFloat.pages[0]!.floats = [fakeBlock({ type: 'resource', columnIndex: 1, id: 'fig' })];
    expect(firstDivergentColumn(a, withFloat)).toEqual({ pageIndex: 0, columnIndex: 1 });
    // A page missing from the other layout diverges at its first column.
    const shorter = fakeDoc([
      [{ blocks: [para(1), heading(2), para(3)], availableHeight: 48 }, { blocks: [para(3, true), para(4)], availableHeight: 0 }],
    ]);
    expect(firstDivergentColumn(a, shorter)).toEqual({ pageIndex: 1, columnIndex: 0 });
  });

  it('a blacklisted spacing candidate takes no further lines', () => {
    const doc = fakeDoc([
      [{ blocks: [para(1), heading(2), para(3)], availableHeight: 2 * 24 }, { blocks: [para(4)], availableHeight: 0 }],
      [{ blocks: [para(5)], availableHeight: 0 }],
    ]);
    const open = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions());
    expect(open.lines.get(2)).toBe(2);
    const blocked = proposeBalanceLines(doc, NO_FORCED, emptyState(), baseOptions({ failedLines: new Set([2]) }));
    expect(blocked.lines.get(2)).toBeUndefined();
    // Lines already applied stay; only the increase is refused.
    const kept = proposeBalanceLines(doc, NO_FORCED, { lines: new Map([[2, 1]]), loose: new Map() }, baseOptions({ failedLines: new Set([2]) }));
    expect(kept.lines.get(2)).toBe(1);
  });
});

describe('collectColumnGaps: room below a list tail', () => {
  const grid = 10;
  // One line per grid step, so the last line ends where the box does unless
  // `boxExtra` (a baked margin) stretches the box below it.
  const block = (type: string, y: number, height: number, contentIndex: number, extra: Record<string, unknown> = {}, boxExtra = 0) =>
    ({
      id: `b${contentIndex}`, type, contentIndex, bbox: { x: 0, y, width: 100, height: height + boxExtra },
      lines: Array.from({ length: Math.max(1, Math.round(height / grid)) }, (_, i) => ({ text: 'x', bbox: { x: 0, y: y + i * grid, width: 100, height: grid } })),
      ...extra,
    });
  const page = (columns: unknown[]) => ({ index: 0, contentArea: { x: 0, y: 0, width: 220, height: 100 }, columns, floats: [] });
  const docWith = (columns: unknown[]) =>
    ({ pages: [page(columns), page([{ index: 0, kind: 'text', bbox: { x: 0, y: 0, width: 100, height: 100 }, availableHeight: 50, blocks: [block('paragraph', 0, 50, 9)] }])], blocks: [], baselineGrid: grid } as unknown as VDTDocument);

  it('sees the line a list tail hides behind its baked bottom margin', () => {
    // Column 0: a heading at line 2, then list items ending at y = 90 (one
    // free line), but the tail's margin left `availableHeight` under a line.
    const col0 = {
      index: 0, kind: 'text', bbox: { x: 0, y: 0, width: 100, height: 100 }, availableHeight: 4,
      blocks: [
        block('paragraph', 0, 20, 0),
        block('heading', 20, 10, 1, { headingLevel: 2 }),
        block('listItem', 30, 30, 2),
        // Two lines drawn (62–82); the box runs to the column bottom with
        // the baked margin — which is what hid the free line.
        block('listItem', 62, 20, 3, {}, 14),
      ],
    };
    const col1 = {
      index: 1, kind: 'text', bbox: { x: 120, y: 0, width: 100, height: 100 }, availableHeight: 0,
      blocks: [block('paragraph', 0, 100, 4)],
    };
    const gaps = collectColumnGaps(docWith([col0, col1]), NO_FORCED);
    expect(gaps.map((g) => [g.columnIndex, g.gapLines])).toEqual([[0, 1]]);
    expect(gaps[0]!.candidates.some((c) => c.kind === 'heading' && c.contentIndex === 1)).toBe(true);
  });

  it('still trusts availableHeight when the last block sits lower than it says', () => {
    const col0 = {
      index: 0, kind: 'text', bbox: { x: 0, y: 0, width: 100, height: 100 }, availableHeight: 20,
      blocks: [block('paragraph', 0, 20, 0), block('heading', 20, 10, 1, { headingLevel: 2 }), block('paragraph', 30, 50, 2)],
    };
    const col1 = {
      index: 1, kind: 'text', bbox: { x: 120, y: 0, width: 100, height: 100 }, availableHeight: 0,
      blocks: [block('paragraph', 0, 100, 4)],
    };
    const gaps = collectColumnGaps(docWith([col0, col1]), NO_FORCED);
    expect(gaps.map((g) => [g.columnIndex, g.gapLines])).toEqual([[0, 2]]);
  });
});

describe('after-display lever and the level of a closing band', () => {
  const para = (contentIndex: number) => fakeBlock({ type: 'paragraph', contentIndex });
  const math = (contentIndex: number) => fakeBlock({ type: 'mathDisplay', contentIndex });
  const boxChild = (contentIndex: number) => fakeBlock({ type: 'paragraph', contentIndex, containerId: 7 });

  it('offers the block after a display formula or a callout box one extra grid line', () => {
    const doc = fakeDoc([
      [
        { blocks: [para(1), math(2), para(3), boxChild(4), para(5)], availableHeight: 2 * 24 },
        { blocks: [para(6)], availableHeight: 0 },
      ],
      [{ blocks: [para(10)], availableHeight: 0 }],
    ]);
    const gaps = collectColumnGaps(doc, new Set());
    const kinds = gaps.find((g) => g.pageIndex === 0 && g.columnIndex === 0)!.candidates.map((c) => `${c.kind}:${c.contentIndex}`);
    expect(kinds).toContain('afterDisplay:3');
    expect(kinds).toContain('afterDisplay:5');
    const proposal = proposeBalanceLines(doc, new Set(), emptyState(), baseOptions());
    expect(proposal.lines.get(3)).toBe(1);
    expect(proposal.lines.get(5)).toBe(1);
  });

  it('never stretches a column of a closing page past the tallest column beside it', () => {
    // Page 0 does not flow on (forced break): column 0 ends one line above
    // column 1, which is the page's last column. Column 0 may take that one
    // line, not the two it has to its foot.
    const doc = fakeDoc([
      [
        { blocks: [para(1), fakeBlock({ type: 'heading', headingLevel: 2, contentIndex: 2 }), para(3)], availableHeight: 3 * 24 },
        { blocks: [para(4)], availableHeight: 2 * 24 },
      ],
      [{ blocks: [para(10)], availableHeight: 0 }],
    ]);
    const gaps = collectColumnGaps(doc, new Set([0]));
    expect(gaps.find((g) => g.pageIndex === 0 && g.columnIndex === 0)!.gapLines).toBe(1);
  });

  it('sees the line a capped column held back from a widow', () => {
    // A closing band cut level at 900: column 0's last paragraph splits at
    // the cut and keeps a line back (no widow in column 1), which closes
    // the column (availableHeight 0) though its text ends one line above
    // column 1's. That line is the formula's to take.
    const tail = (contentIndex: number, bottom: number) =>
      fakeBlock({ type: 'paragraph', contentIndex, bbox: { x: 0, y: bottom - 96, width: 100, height: 96 } });
    const doc = fakeDoc([
      [
        { blocks: [para(1), math(2), tail(3, 876)], availableHeight: 0 },
        { blocks: [para(4), tail(5, 900)], availableHeight: 0 },
      ],
      [{ blocks: [para(10)], availableHeight: 0 }],
    ]);
    for (const col of doc.pages[0]!.columns) { col.trailingCap = true; col.bandCapped = true; }
    const gaps = collectColumnGaps(doc, new Set([0]));
    const gap = gaps.find((g) => g.pageIndex === 0 && g.columnIndex === 0)!;
    expect(gap.gapLines).toBe(1);
    expect(gap.candidates.map((c) => `${c.kind}:${c.contentIndex}`)).toContain('afterDisplay:3');
    expect(gaps.find((g) => g.pageIndex === 0 && g.columnIndex === 1)).toBeUndefined();
  });
});
