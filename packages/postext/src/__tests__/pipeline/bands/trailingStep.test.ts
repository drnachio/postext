import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { bandCapLines, bandLinePitch, capRetryLimit, resolveTrailingCaps, type BandCap, type BandPassReport } from '../../../pipeline/columns/bandCaps.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, VDTBlock, VDTColumn, VDTDocument, VDTLine } from '../../../index.js';

// #711, `headings.balancing.trailingStep`: the level cut of a closing band
// counts lines of the band's own text when that text is off the baseline
// grid, so its columns end within a line of each other.

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

const line = (height: number): VDTLine => ({ text: 'x', bbox: { x: 0, y: 0, width: 10, height }, baseline: 0, hyphenated: false });
const block = (heights: number[], extra: Partial<VDTBlock> = {}): VDTBlock => ({
  id: 'b', type: 'paragraph', bbox: { x: 0, y: 0, width: 100, height: 0 }, lines: heights.map(line), pageIndex: 0, columnIndex: 0,
  dirty: false, snappedToGrid: false, fontString: '', color: '#000', textAlign: 'left', ...extra,
} as VDTBlock);
const column = (blocks: VDTBlock[], used = 0): VDTColumn => ({
  index: 0, bbox: { x: 0, y: 0, width: 100, height: 600 }, blocks, availableHeight: 600 - used, baselineOffset: 0,
});

describe('bandLinePitch', () => {
  it('is the grid for a band of body text, and for a band with no line', () => {
    expect(bandLinePitch([column([block([24, 24, 24])]), column([block([24])])], 24)).toBe(24);
    expect(bandLinePitch([column([])], 24)).toBe(24);
  });

  it('is the leading most lines of the band share', () => {
    expect(bandLinePitch([column([block([20, 20, 20]), block([20, 20])]), column([block([20])])], 24)).toBe(20);
    // A few lines on another leading (the group heads of an index) do not change it.
    expect(bandLinePitch([column([block([28, 20]), block([20]), block([20, 20])])], 24)).toBe(20);
  });

  it('stays on the grid without a majority', () => {
    expect(bandLinePitch([column([block([20, 20]), block([24, 24])])], 24)).toBe(24);
    expect(bandLinePitch([column([block([20, 20, 18, 18, 22])])], 24)).toBe(24);
  });

  it('ignores headings, hidden blocks and the blocks of a box', () => {
    const cols = [column([
      block([40], { type: 'heading' }),
      block([20, 20, 20], { hidden: true }),
      block([20, 20, 20, 20], { containerId: 3 }),
      block([24, 24]),
    ])];
    expect(bandLinePitch(cols, 24)).toBe(24);
  });
});

describe('bandLinePitch, the lines on their lattice', () => {
  /** Blocks of `lines` 20 px lines each, stacked from `top` with `gap`
   *  between them. */
  const stack = (blocks: number, lines: number, gap: number, top = 0): VDTBlock[] => {
    let y = top;
    return Array.from({ length: blocks }, () => {
      const b = block(Array.from({ length: lines }, () => 20));
      for (const l of b.lines) { l.bbox.y = y; y += 20; }
      y += gap;
      return b;
    });
  };

  it('keeps the grid for entries a gap apart that is no whole line: their lines share a height and no lattice', () => {
    // References of three lines, 1.7 px between entries.
    expect(bandLinePitch([column(stack(10, 3, 1.7)), column(stack(10, 3, 1.7))], 24)).toBe(24);
    // An index whose groups stand 21.4 px apart (a hand-set margin).
    expect(bandLinePitch([column(stack(6, 5, 21.4))], 24)).toBe(24);
  });

  it('counts the band in its lines when the gaps are whole lines, wherever each column starts', () => {
    expect(bandLinePitch([column(stack(6, 5, 20))], 24)).toBe(20);
    expect(bandLinePitch([column(stack(6, 5, 0, 33)), column(stack(6, 5, 20, 7.5))], 24)).toBe(20);
  });

  it('wants four lines in five on the lattice', () => {
    // Nine lines on it and one 6 px off: still the band's lines.
    const nine = stack(1, 9, 6);
    const [off] = stack(1, 1, 0, 9 * 20 + 6);
    expect(bandLinePitch([column([...nine, off!])], 24)).toBe(20);
    // Two runs of unequal length, 6 px out of step: 6 of 9 lines on the larger lattice.
    const six = stack(1, 6, 6);
    const three = stack(1, 3, 0, 6 * 20 + 6);
    expect(bandLinePitch([column([...six, ...three])], 24)).toBe(24);
  });
});

describe('a cut in lines of the band', () => {
  it('counts the band\'s lines with its pitch', () => {
    // 29 and 21 lines of 20 px: the mean is 25 lines, 21 grid lines of 24 px.
    const cols = [column([], 29 * 20), column([], 21 * 20)];
    expect(bandCapLines(cols, 20)).toBe(25);
    expect(bandCapLines(cols, 24)).toBe(21);
  });

  it('retries as far as three grid lines reach, at most six times', () => {
    expect(capRetryLimit(24, 24)).toBe(3);
    expect(capRetryLimit(20, 24)).toBe(4);
    expect(capRetryLimit(12, 24)).toBe(6);
    expect(capRetryLimit(6, 24)).toBe(6);
    expect(capRetryLimit(30, 24)).toBe(3);
  });

  it('grows a pitched cap by one of its lines, for as many retries as it is given', () => {
    const cap: BandCap = { kind: 'trailing', startContentIndex: 0, startPart: 0, lines: 10, retries: 0, pitchPx: 20, retryLimit: 4 };
    const seen: number[] = [];
    const report = (delivered: boolean): BandPassReport => ({
      bandCapProposals: new Map([[7, cap]]),
      spanPlacedInBand: new Set(delivered ? [7] : []),
      bandCapsApplied: new Set([7]),
    });
    const out = resolveTrailingCaps(report(false), new Map(), (caps) => {
      const c = caps.get(7)!;
      seen.push(c.lines);
      expect(c.pitchPx).toBe(20);
      return report(c.lines === 14);
    });
    // 10, then four retries of one line each: delivered at 14.
    expect(seen).toEqual([10, 11, 12, 13, 14]);
    expect(out.caps.get(7)!.lines).toBe(14);
    // On the grid: three retries, then the cap is dropped.
    const plain: BandCap = { kind: 'trailing', startContentIndex: 0, startPart: 0, lines: 10, retries: 0 };
    const tried: number[] = [];
    const never: BandPassReport = { bandCapProposals: new Map([[7, plain]]), spanPlacedInBand: new Set(), bandCapsApplied: new Set([7]) };
    const dropped = resolveTrailingCaps(never, new Map(), (caps) => { tried.push(caps.get(7)!.lines); return never; });
    expect(tried).toEqual([10, 11, 12, 13]);
    expect(dropped.caps.size).toBe(0);
  });
});

/** Two columns under a page-span H1: `n` one-line entries in a container
 *  whose style sets them on `lead` pt, over a body grid of 13.6 pt. */
const build = (n: number, lead: number, trailingStep?: 'grid', between = 0): VDTDocument => {
  const entries = Array.from({ length: n }, (_, i) => `Entry number ${i + 1}, ${i + 3}`);
  const md = ['# Index', '', ':::paragraphs{style="entry"}', entries.join('\n\n'), ':::'].join('\n');
  const config: PostextConfig = {
    page: { sizePreset: 'custom', width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' }, dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: pt(10), lineHeight: pt(13.6), textAlign: 'left', paragraphSpacing: false },
    headings: {
      ...(trailingStep ? { balancing: { trailingStep } } : {}),
      levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' }, marginBottom: pt(0) }],
    },
    paragraphStyles: [{ id: 'entry', fontSize: pt(8.6), lineHeight: pt(lead), firstLineIndent: pt(0), spaceBetween: pt(between), marginTop: pt(0), marginBottom: pt(0) }],
  };
  return buildDocument({ markdown: md }, config, createMeasurementCache());
};
/** Lines in each text column of the last page. */
const counts = (doc: VDTDocument): number[] => doc.pages[doc.pages.length - 1]!.columns.filter((c) => c.kind !== 'span')
  .map((c) => c.blocks.filter((b) => !b.hidden).reduce((sum, b) => sum + b.lines.length, 0));
const apart = (doc: VDTDocument): number => {
  const [a = 0, b = 0] = counts(doc);
  return Math.abs(a - b);
};

describe('headings.balancing.trailingStep (#711)', () => {
  it('ends a closing band of off-grid entries within one line, for every length', () => {
    let worstGrid = 0;
    for (let n = 21; n <= 70; n++) {
      const doc = build(n, 11.2);
      if (doc.pages.length !== 1) continue;
      expect(apart(doc), `${n} entries: ${counts(doc).join(' and ')}`).toBeLessThanOrEqual(1);
      worstGrid = Math.max(worstGrid, apart(build(n, 11.2, 'grid')));
    }
    // Cut on the body grid, as up to 1.27, the same bands ended up to three lines apart.
    expect(worstGrid).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('cuts a band of body text as before, whatever the setting', () => {
    for (const n of [21, 30, 44, 55, 70]) {
      expect(JSON.stringify(build(n, 13.6).pages)).toBe(JSON.stringify(build(n, 13.6, 'grid').pages));
      expect(apart(build(n, 13.6))).toBeLessThanOrEqual(1);
    }
  });

  it('cuts on the grid a band whose entries stand a fraction of a line apart', () => {
    // 1.3 pt between entries: no two lines a whole number of lines apart.
    for (const n of [21, 30, 44, 55]) {
      expect(JSON.stringify(build(n, 11.2, undefined, 1.3).pages)).toBe(JSON.stringify(build(n, 11.2, 'grid', 1.3).pages));
    }
  });

  it('records the cut on the columns: a whole number of the band\'s lines', () => {
    const doc = build(55, 11.2);
    const cols = doc.pages[0]!.columns.filter((c) => c.kind !== 'span');
    expect(cols.every((c) => c.trailingCap)).toBe(true);
    const pitch = (11.2 / 13.6) * doc.baselineGrid;
    const lines = cols[0]!.bbox.height / pitch;
    expect(Math.abs(lines - Math.round(lines))).toBeLessThan(0.01);
    expect(cols[1]!.bbox.y + cols[1]!.bbox.height).toBeCloseTo(cols[0]!.bbox.y + cols[0]!.bbox.height, 2);
  });
});
