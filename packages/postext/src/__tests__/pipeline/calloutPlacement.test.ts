import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { collectColumnGaps } from '../../pipeline/columnBalancing';
import { createVDTPage, createVDTColumn, createVDTDocument, type VDTBlock, type VDTDocument } from '../../vdt';
import { resolveAllConfig } from '../../pipeline/config';
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

// Default page is 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px.
const BODY_PX = (8 * 300) / 72;
const GRID = BODY_PX * 1.5;
const PAD = BODY_PX * 0.75;

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Small single-column page (~11 body lines) so short sweeps of the filler
 *  length walk a callout across the column bottom. */
const SMALL_PAGE: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
};

function build(md: string, config: PostextConfig = { headings: { balancing: { enabled: false } } }): VDTDocument {
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b !== frame);
const columnOf = (doc: VDTDocument, b: VDTBlock) => doc.pages[b.pageIndex]!.columns[b.columnIndex]!;

const CALLOUT = [
  ':::callout{title="Recuerda"}',
  filler(2),
  '',
  '- Revisa la mecha.',
  '- Recórtala al anochecer.',
  ':::',
].join('\n');

describe(':::callout placement', () => {
  it('places the frame then its children in the same column, inside innerRect', () => {
    const doc = build(['Intro.', '', CALLOUT, '', 'After.'].join('\n'));
    const [frame] = frames(doc);
    expect(frame).toBeDefined();
    const children = childrenOf(doc, frame!);
    expect(children.map((c) => c.type)).toEqual(['paragraph', 'listItem', 'listItem']);
    const col = columnOf(doc, frame!);
    const idx = col.blocks.indexOf(frame!);
    expect(idx).toBeGreaterThan(0);
    expect(col.blocks.slice(idx + 1, idx + 1 + children.length)).toEqual(children);
    // doc.blocks keeps reading order: frame first, then the children.
    const di = doc.blocks.indexOf(frame!);
    expect(doc.blocks.slice(di + 1, di + 1 + children.length)).toEqual(children);
    const inner = frame!.callout!.innerRect;
    const absInner = { x: frame!.bbox.x + inner.x, y: frame!.bbox.y + inner.y, width: inner.width, height: inner.height };
    for (const c of children) {
      expect([c.pageIndex, c.columnIndex]).toEqual([frame!.pageIndex, frame!.columnIndex]);
      expect(c.containerId).toBe(frame!.containerId);
      expect(c.bbox.x).toBeCloseTo(absInner.x, 5);
      expect(c.bbox.y).toBeGreaterThanOrEqual(absInner.y - 1e-6);
      expect(c.bbox.y + c.bbox.height).toBeLessThanOrEqual(absInner.y + absInner.height + 1e-6);
      expect(c.lines[0]!.bbox.y).toBeGreaterThanOrEqual(c.bbox.y - 1e-6);
    }
    expect(frame!.bbox.x).toBeCloseTo(col.bbox.x, 5);
    expect(frame!.bbox.width).toBeCloseTo(col.bbox.width, 5);
    expect(absInner.x).toBeCloseTo(col.bbox.x + PAD, 5);
    // Decoration follows the frame.
    expect(frame!.designOverlay!.bbox.x).toBeCloseTo(frame!.bbox.x, 5);
    expect(frame!.designOverlay!.bbox.y).toBeCloseTo(frame!.bbox.y, 5);
    expect(frame!.callout!.styleId).toBe('note');
    expect(frame!.callout!.childIds).toEqual(children.map((c) => c.id));
    // The frame maps back to the whole fenced source range.
    expect(frame!.sourceStart).toBeLessThan(children[0]!.sourceStart!);
    expect(frame!.sourceEnd).toBeGreaterThan(children[2]!.sourceEnd!);
  });

  it('marginTop separates the box from the previous block', () => {
    const doc = build(['Intro.', '', CALLOUT, '', 'After.'].join('\n'));
    const intro = doc.blocks.find((b) => b.type === 'paragraph')!;
    const [frame] = frames(doc);
    // Margins collapse: the larger of the intro's paragraph spacing and the
    // box's marginTop (0.75em) applies.
    const introSpacing = resolveAllConfig().bodyText.paragraphSpacing ? GRID : 0;
    expect(frame!.bbox.y - (intro.bbox.y + intro.bbox.height)).toBeCloseTo(Math.max(introSpacing, PAD), 5);
  });

  it('the flow after a callout is back on the baseline grid', () => {
    const doc = build(['Intro.', '', CALLOUT, '', 'After.'].join('\n'));
    const [frame] = frames(doc);
    const after = doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]!.text === 'After.')!;
    const colTop = columnOf(doc, after).bbox.y;
    expect((after.bbox.y - colTop) % GRID).toBeCloseTo(0, 5);
    // At least marginBottom (0.75em) below the box.
    expect(after.bbox.y - (frame!.bbox.y + frame!.bbox.height)).toBeGreaterThanOrEqual(PAD - 0.01);
    // The box itself is off-grid (its height is arbitrary) — the snap is what
    // restores the rhythm.
    expect(frame!.snappedToGrid).toBe(false);
  });

  it('a callout that does not fit moves to the next column (never splits)', () => {
    let pushed = 0;
    for (let n = 2; n <= 12; n++) {
      const doc = build([filler(n), '', CALLOUT, '', 'After.'].join('\n'), SMALL_PAGE);
      const [frame] = frames(doc);
      expect(frame).toBeDefined();
      const children = childrenOf(doc, frame!);
      expect(children).toHaveLength(3);
      for (const c of children) {
        expect([c.pageIndex, c.columnIndex]).toEqual([frame!.pageIndex, frame!.columnIndex]);
      }
      const fillerParts = doc.blocks.filter((b) => b.contentIndex === 0);
      const lastFiller = fillerParts[fillerParts.length - 1]!;
      const sameCol = lastFiller.pageIndex === frame!.pageIndex && lastFiller.columnIndex === frame!.columnIndex;
      if (!sameCol) {
        pushed++;
        // It moved because it did not fit: the space left after the filler
        // is smaller than the box (plus the spacing above it).
        const fillerCol = columnOf(doc, lastFiller);
        const fillerBottom = lastFiller.bbox.y + lastFiller.bbox.height - fillerCol.bbox.y;
        expect(fillerCol.bbox.height - fillerBottom).toBeLessThan(frame!.bbox.height + GRID);
        // And it opens the new column at the top.
        expect(frame!.bbox.y).toBeCloseTo(columnOf(doc, frame!).bbox.y, 5);
      }
    }
    expect(pushed).toBeGreaterThan(0);
  }, 30_000);

  it('a heading immediately before a callout keeps with it', () => {
    let pushed = 0;
    for (let n = 1; n <= 12; n++) {
      const md = [filler(n), '', '## Aviso', '', CALLOUT, '', 'After.'].join('\n');
      const doc = build(md, SMALL_PAGE);
      const heading = doc.blocks.find((b) => b.type === 'heading')!;
      const [frame] = frames(doc);
      expect(frames(doc)).toHaveLength(1);
      expect([heading.pageIndex, heading.columnIndex]).toEqual([frame!.pageIndex, frame!.columnIndex]);
      const col = columnOf(doc, frame!);
      expect(col.blocks.indexOf(frame!)).toBe(col.blocks.indexOf(heading) + 1);
      const fillerParts = doc.blocks.filter((b) => b.contentIndex === 0);
      const lastFiller = fillerParts[fillerParts.length - 1]!;
      const fillerCol = columnOf(doc, lastFiller);
      const sameCol = lastFiller.pageIndex === heading.pageIndex && lastFiller.columnIndex === heading.columnIndex;
      // A keep-with-next push leaves the filler's column with room the
      // heading itself would have fitted in.
      if (!sameCol && fillerCol.availableHeight >= heading.bbox.height) pushed++;
    }
    expect(pushed).toBeGreaterThan(0);
  }, 30_000);

  it('excludes callout blocks from column-balancing candidates', () => {
    // Synthetic single column: a free heading, a callout frame with a heading
    // and a list inside it, a trailing paragraph, and a bottom gap.
    const resolved = resolveAllConfig();
    const doc = createVDTDocument(resolved, GRID);
    const page = createVDTPage(0, 1000, 1000);
    const col = createVDTColumn(0, { x: 0, y: 0, width: 500, height: 800 });
    page.columns.push(col);
    const page2 = createVDTPage(1, 1000, 1000);
    const col2 = createVDTColumn(0, { x: 0, y: 0, width: 500, height: 800 });
    page2.columns.push(col2);
    doc.pages.push(page, page2);
    const mk = (id: string, type: VDTBlock['type'], contentIndex: number, extra: Partial<VDTBlock> = {}): VDTBlock => ({
      id, type, bbox: { x: 0, y: 0, width: 500, height: GRID }, lines: [],
      pageIndex: 0, columnIndex: 0, dirty: false, snappedToGrid: false,
      fontString: '', color: '', textAlign: 'left', contentIndex, ...extra,
    });
    const blocks = [
      mk('p0', 'paragraph', 0),
      mk('h1', 'heading', 1, { headingLevel: 2 }),
      mk('frame', 'callout', 2, { containerId: 7 }),
      mk('c-h', 'heading', 3, { headingLevel: 3, containerId: 7 }),
      mk('c-li', 'listItem', 4, { containerId: 7 }),
      mk('p5', 'paragraph', 5),
      mk('p6', 'paragraph', 6),
    ];
    col.blocks.push(...blocks);
    col.availableHeight = 2 * GRID;
    col2.blocks.push(mk('p7', 'paragraph', 7, { pageIndex: 1 }));
    doc.blocks.push(...blocks, ...col2.blocks);
    const [gap] = collectColumnGaps(doc, new Set());
    expect(gap).toBeDefined();
    const kinds = gap!.candidates.map((c) => `${c.kind}:${c.contentIndex}`);
    expect(kinds).toContain('heading:1');
    expect(kinds.some((k) => k.endsWith(':2') || k.endsWith(':3') || k.endsWith(':4'))).toBe(false);
    // The block after the callout is not a "list end" stretch point even
    // though the box ends with a list item.
    expect(kinds).not.toContain('listEnd:5');
  });

  it('renders children as ordinary blocks with the derived typography', () => {
    const config: PostextConfig = {
      headings: { balancing: { enabled: false } },
      calloutStyles: [{
        id: 'tip',
        body: { fontSize: { value: 6, unit: 'pt' }, lineHeight: { value: 1.2, unit: 'em' } },
      }],
    };
    const doc = build(['Intro.', '', ':::callout{type="tip"}', filler(2), ':::', '', 'After.'].join('\n'), config);
    const [frame] = frames(doc);
    const [child] = childrenOf(doc, frame!);
    const intro = doc.blocks[0]!;
    expect(child!.type).toBe('paragraph');
    expect(child!.fontString).not.toBe(intro.fontString);
    expect(child!.lines[0]!.bbox.height).toBeCloseTo(((6 * 300) / 72) * 1.2, 5);
    const after = doc.blocks.find((b) => b.lines[0]?.text === 'After.')!;
    expect(after.fontString).toBe(intro.fontString);
  });

  it('falls back to inline placement for span/page and floating placements (v1)', () => {
    const doc = build([
      'Intro.',
      '',
      ':::callout{span="page" placement="top"}',
      filler(1),
      ':::',
      '',
      'After.',
    ].join('\n'));
    const [frame] = frames(doc);
    expect(frame!.callout!.span).toBe('page');
    expect(frame!.callout!.placement).toBe('top');
    // Still placed inline at the column width for now.
    expect(frame!.bbox.width).toBeCloseTo(columnOf(doc, frame!).bbox.width, 5);
    expect(columnOf(doc, frame!).blocks).toContain(frame);
  });

  it('with no callout styles configured the children flow as ordinary blocks', () => {
    const doc = build(['Intro.', '', CALLOUT, '', 'After.'].join('\n'), {
      headings: { balancing: { enabled: false } },
      calloutStyles: [],
    });
    expect(frames(doc)).toHaveLength(0);
    expect(doc.blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'listItem', 'listItem', 'paragraph']);
    expect(doc.blocks.every((b) => b.containerId === undefined)).toBe(true);
  });
});
