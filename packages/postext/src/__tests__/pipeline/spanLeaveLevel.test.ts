import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentPass } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { parseMarkdown } from '../../parse';
import type { VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../vdt';
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

// Default 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px.
const BODY_PX = (8 * 300) / 72;
const GRID = BODY_PX * 1.5;

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, ~23 grid lines tall, balancing on (the default). */
const TWO_COL: PostextConfig = {
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  calloutStyles: [{ id: 'kp', title: 'Puntos clave', span: 'page' }],
};
const withBalancing = (balancing: NonNullable<PostextConfig['headings']>['balancing']): PostextConfig =>
  ({ ...TWO_COL, headings: { balancing } });

const ITEMS = Array.from({ length: 12 }, (_, i) => `- Punto clave número ${i + 1} de la lista de cierre del capítulo.`);
const TALL_CALLOUT = [':::callout{type="kp"}', ...ITEMS, ':::'].join('\n');

// Page 0 holds ~30 lines of text across its two columns; a level cut sits
// near line 15 and leaves ~8 lines — the 12-item box needs more.
const MD = [filler(16), '', '## Sección', '', filler(2), '', filler(8), '', TALL_CALLOUT, '', filler(6)].join('\n');
const CALLOUT_INDEX = parseMarkdown(MD).findIndex((b) => b.type === 'containerStart' && b.containerName === 'callout');

const build = (md: string, config: PostextConfig = TWO_COL): VDTDocument =>
  buildDocument({ markdown: md }, config, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const textColumns = (page: VDTPage): VDTColumn[] =>
  page.columns.filter((c) => c.kind !== 'span' && c.blocks.length > 0);
const usedBottom = (c: VDTColumn): number => c.bbox.y + (c.bbox.height - c.availableHeight);
const pageBottom = (page: VDTPage): number => page.contentArea.y + page.contentArea.height;

describe('a page-span box that has to leave the page levels the band behind it (balancing.beforeSpan)', () => {
  it('by default the columns it leaves end level and short of the page bottom, the box opens the next page', () => {
    const doc = build(MD);
    const [frame] = frames(doc);
    expect(frames(doc)).toHaveLength(1);
    expect(frame!.pageIndex).toBe(1);
    expect(frame!.bbox.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 5);
    const page0 = doc.pages[0]!;
    const cols = textColumns(page0);
    expect(cols).toHaveLength(2);
    const [b0, b1] = cols.map(usedBottom);
    expect(Math.abs(b0! - b1!)).toBeLessThanOrEqual(GRID + 0.5);
    // Cut level: neither column reaches the page bottom.
    for (const c of cols) expect(c.bbox.y + c.bbox.height).toBeLessThan(pageBottom(page0) - GRID);
    expect(doc.iterationCount).toBeGreaterThan(1);
  }, 30_000);

  it('the first pass proposes a trailing cap keyed by the box and marks the page as an explicit break', () => {
    const pass = buildDocumentPass({ markdown: MD }, TWO_COL, createMeasurementCache());
    expect(CALLOUT_INDEX).toBeGreaterThan(0);
    const cap = pass.bandCapProposals.get(CALLOUT_INDEX);
    expect(cap).toBeDefined();
    expect(cap!.kind).toBe('trailing');
    expect(cap!.startContentIndex).toBe(0);
    expect(pass.forcedBreakPages.has(0)).toBe(true);
    // A capped pass that reaches the box inside the levelled band reports
    // it delivered even though the box still moves on, and leaves the page
    // flowing on (the polish round may fill a column ending a line under
    // the cut). Like the driver, grow the cap a line at a time when the
    // capped band overflows (a widow / keep-with-next rule pushed text past
    // the cut).
    let delivered = false;
    for (let retry = 0; retry <= 3 && !delivered; retry++) {
      const capped = buildDocumentPass({ markdown: MD }, TWO_COL, createMeasurementCache(), undefined, {
        bandCaps: new Map([[CALLOUT_INDEX, { ...cap!, lines: cap!.lines + retry, retries: retry }]]),
      });
      expect(capped.bandCapsApplied.has(CALLOUT_INDEX)).toBe(true);
      if (!capped.spanPlacedInBand.has(CALLOUT_INDEX)) continue;
      delivered = true;
      expect(capped.forcedBreakPages.has(0)).toBe(false);
      expect(frames(capped.doc)[0]!.pageIndex).toBe(1);
    }
    expect(delivered).toBe(true);
  }, 30_000);

  it('beforeSpan: false keeps the old close — the first column fills the page, the page stays balanceable', () => {
    const doc = build(MD, withBalancing({ beforeSpan: false }));
    expect(frames(doc)[0]!.pageIndex).toBe(1);
    const page0 = doc.pages[0]!;
    const [c0] = textColumns(page0);
    expect(c0!.bbox.y + c0!.bbox.height).toBeCloseTo(pageBottom(page0), 3);
    expect(usedBottom(c0!)).toBeGreaterThan(pageBottom(page0) - GRID - 0.5);
    const pass = buildDocumentPass({ markdown: MD }, withBalancing({ beforeSpan: false }), createMeasurementCache());
    expect(pass.bandCapProposals.has(CALLOUT_INDEX)).toBe(false);
    expect(pass.forcedBreakPages.has(0)).toBe(false);
  }, 30_000);

  it('balancing disabled: nothing is proposed', () => {
    const pass = buildDocumentPass({ markdown: MD }, withBalancing({ enabled: false }), createMeasurementCache());
    expect(pass.bandCapProposals.has(CALLOUT_INDEX)).toBe(false);
    expect(pass.forcedBreakPages.has(0)).toBe(false);
  }, 30_000);
});
