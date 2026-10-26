import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import {
  collectColumnGaps,
  proposeBalanceLines,
  type BalanceProposalOptions,
  type BalanceState,
  type ColumnGap,
} from '../../pipeline/columns/columnBalancing.js';
import { createVDTPage, type VDTBlock, type VDTColumn, type VDTDocument, type VDTLine } from '../../vdt.js';
import type { PostextConfig, TextAlign } from '../../types.js';

// `headings.balancing.fillShortColumns` (#1236): a column of running text
// that the widow / orphan minimums left a line short is filled by setting
// one of its own paragraphs a line long or a line short — ragged text too.

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

const words = 'measurement comprehensive interpretation extraordinary circumstances considerable temperature approximately investigation particularly responsibility understanding communication the of and a to in is was for on that with as by it'.split(' ');
const para = (n: number, seed: number): string =>
  `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed * 13 + ((i * i) % 5)) % words.length]).join(' ')}.`;
/** Eight paragraphs of 10 to 59 words over two or three small two-column
 *  pages; `seed` picks their lengths and words. */
const markdown = (seed: number): string =>
  Array.from({ length: 8 }, (_, i) => para(10 + ((seed * (i + 3) * 7) % 50), seed + i)).join('\n\n');

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (textAlign: TextAlign, fillShortColumns: boolean): PostextConfig => ({
  page: { dpi: 96, width: pt(420), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'double', gutterWidth: pt(20) },
  bodyText: { textAlign, hyphenation: { enabled: false }, firstLineIndent: pt(0) },
  headings: { balancing: { fillShortColumns } },
});
const build = (seed: number, textAlign: TextAlign, fill: boolean): VDTDocument =>
  buildDocument({ markdown: markdown(seed) }, config(textAlign, fill), createMeasurementCache());

const NO_FORCED = new Set<number>();
/** The short columns of the pages that flow on. */
const shortColumns = (doc: VDTDocument): ColumnGap[] =>
  collectColumnGaps(doc, NO_FORCED).filter((g) => g.gapLines >= 1 && g.pageIndex < doc.pages.length - 1);
const columnAfter = (doc: VDTDocument, g: { pageIndex: number; columnIndex: number }): VDTColumn | undefined =>
  doc.pages[g.pageIndex]!.columns[g.columnIndex + 1] ?? doc.pages[g.pageIndex + 1]?.columns[0];
/** The words of the document in reading order (no hyphenation here). */
const text = (doc: VDTDocument): string =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text.trim())))).join(' ');
/** Lines of each piece of every paragraph split over a column break. */
const splitPieces = (doc: VDTDocument): number[][] => {
  const pieces = new Map<number, number[]>();
  for (const p of doc.pages) for (const c of p.columns) for (const b of c.blocks) {
    if (b.type !== 'paragraph' || b.contentIndex === undefined) continue;
    pieces.set(b.contentIndex, [...(pieces.get(b.contentIndex) ?? []), b.lines.length]);
  }
  return [...pieces.values()].filter((v) => v.length > 1);
};
const rebroken = (doc: VDTDocument): number[] =>
  doc.blocks.filter((b) => b.balancing?.levers.includes('looseParagraph')).map((b) => b.balancing!.extraLines!);

describe('headings.balancing.fillShortColumns (#1236)', () => {
  it.each([
    // A ragged paragraph of the column runs a line long.
    { name: 'ragged', textAlign: 'left' as const, seed: 29, lever: 1 },
    // No justified paragraph of the column can run long within the limits;
    // one is set a line short and the split after it takes the line.
    { name: 'justified', textAlign: 'justify' as const, seed: 297, lever: -1 },
  ])('fills the column the widow / orphan rule left a line short ($name)', ({ textAlign, seed, lever }) => {
    const off = build(seed, textAlign, false);
    const on = build(seed, textAlign, true);

    // Off: a column ends a line short while the paragraph after it opens
    // the next column — the break rules held the line back, and today's
    // levers do not close it.
    const short = shortColumns(off);
    expect(short).toHaveLength(1);
    expect(short[0]!.gapLines).toBe(1);
    expect(columnAfter(off, short[0]!)?.blocks.find((b) => !b.hidden)?.type).toBe('paragraph');
    expect(rebroken(off)).toEqual([]);

    // On: that column ends full, by one paragraph re-broken a line long or
    // short; no other column ends short, the text is the same, and every
    // split keeps the widow and orphan minimums (2 lines each side).
    expect(shortColumns(on)).toEqual([]);
    expect(rebroken(on)).toContain(lever);
    expect(text(on)).toBe(text(off));
    for (const pieces of splitPieces(on)) for (const n of pieces) expect(n).toBeGreaterThanOrEqual(2);
  });

  it.each(['left', 'justify'] as const)('leaves the column short when no paragraph can be re-broken (%s)', (textAlign) => {
    const off = build(3, textAlign, false);
    const on = build(3, textAlign, true);
    // Non-vacuous: the short column offers paragraphs to the lever.
    const short = shortColumns(on);
    expect(short).toHaveLength(1);
    expect(short[0]!.candidates.some((c) => c.kind === 'looseParagraph')).toBe(true);
    // None gains or loses its line within the limits: the layout is today's.
    expect(rebroken(on)).toEqual([]);
    expect(on.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => b.lines.map((l) => l.text)))))
      .toEqual(off.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => b.lines.map((l) => l.text)))));
  });
});

// The proposer, over a synthetic layout: one column a line short.
const line = (): VDTLine => ({ text: 'x', bbox: { x: 0, y: 0, width: 100, height: 24 }, baseline: 19, hyphenated: false });
const paragraph = (contentIndex: number, lines: number, textAlign: TextAlign = 'justify'): VDTBlock => ({
  id: `p-${contentIndex}`,
  type: 'paragraph',
  contentIndex,
  bbox: { x: 0, y: 0, width: 100, height: 10 },
  lines: Array.from({ length: lines }, line),
  pageIndex: 0,
  columnIndex: 0,
  dirty: false,
  snappedToGrid: false,
  fontString: '16px serif',
  color: '#000',
  textAlign,
});
const shortColumnDoc = (blocks: VDTBlock[], fillShortColumns: boolean): VDTDocument => {
  const pages = [0, 1].map((pi) => {
    const page = createVDTPage(pi, 1000, 1000);
    page.columns = [0, 1].map((ci): VDTColumn => ({
      index: ci,
      bbox: { x: ci * 500, y: 0, width: 480, height: 900 },
      blocks: pi === 0 && ci === 0 ? blocks : [paragraph(90 + pi * 2 + ci, 3)],
      availableHeight: pi === 0 && ci === 0 ? 24 : 0,
      baselineOffset: 0,
    }));
    return page;
  });
  return { pages, baselineGrid: 24, config: { headings: { balancing: { fillShortColumns } }, bodyText: { optimalRagged: true } } } as unknown as VDTDocument;
};
const options = (over?: Partial<BalanceProposalOptions>): BalanceProposalOptions => ({
  maxLinesPerHeading: 2,
  stretchAfterLists: true,
  maxLinesAfterList: 1,
  stretchAfterFloats: true,
  maxLinesAfterFloat: 1,
  looseParagraphs: true,
  maxLooseParagraphs: 2,
  optimalLineBreaking: true,
  failedLoose: new Set<number>(),
  ...over,
});
const empty = (): BalanceState => ({ lines: new Map(), loose: new Map() });

describe('fillShortColumns in the balancing proposal (#1236)', () => {
  it('offers the ragged paragraphs of a short column a line long only when on', () => {
    const blocks = [paragraph(1, 4, 'left'), paragraph(2, 7, 'right'), paragraph(3, 5, 'center')];
    const on = proposeBalanceLines(shortColumnDoc(blocks, true), NO_FORCED, empty(), options({ fillShortColumns: true }));
    expect([...on.loose]).toEqual([[2, 1], [1, 1]]); // longest first; centred text is left alone
    const off = proposeBalanceLines(shortColumnDoc(blocks, false), NO_FORCED, empty(), options());
    expect(off.loose.size).toBe(0);
  });

  it('sets a paragraph a line short once none is left to run long', () => {
    const doc = shortColumnDoc([paragraph(1, 4), paragraph(2, 7)], true);
    const allFailed = new Set([1, 2]);
    const tight = proposeBalanceLines(doc, NO_FORCED, empty(), options({ fillShortColumns: true, failedLoose: allFailed }));
    expect([...tight.loose]).toEqual([[2, -1], [1, -1]]);
    expect(tight.looseBudget.get(2)!.need).toBe(1);
    expect(tight.looseBudget.get(1)).toBe(tight.looseBudget.get(2));
    // Not while a paragraph may still run long, nor with the option off.
    expect([...proposeBalanceLines(doc, NO_FORCED, empty(), options({ fillShortColumns: true, failedLoose: new Set([1]) })).loose])
      .toEqual([[2, 1]]);
    expect(proposeBalanceLines(doc, NO_FORCED, empty(), options({ failedLoose: allFailed })).loose.size).toBe(0);
    // Paragraphs that failed a line short are not offered again, and a
    // column with one set short already gets no second one.
    const rest = proposeBalanceLines(doc, NO_FORCED, empty(), options({ fillShortColumns: true, failedLoose: allFailed, failedTight: new Set([2]) }));
    expect([...rest.loose]).toEqual([[1, -1]]);
    const applied = proposeBalanceLines(doc, NO_FORCED, { lines: new Map(), loose: new Map([[2, -1]]) }, options({ fillShortColumns: true, failedLoose: allFailed }));
    expect(applied.changed).toBe(false);
  });
});
