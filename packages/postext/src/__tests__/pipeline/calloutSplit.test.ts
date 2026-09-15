import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
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

const TITLE = 'Puntos clave';
const ICON = '★';
const styles = (keepTogether: boolean): PostextConfig['calloutStyles'] =>
  [{ id: 'kp', title: TITLE, span: 'page', keepTogether, icon: { kind: 'glyph', glyph: ICON } }];

/** Two-column page, ~23 grid lines tall, balancing on (the default). */
const TWO_COL = (keepTogether: boolean): PostextConfig => ({
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  calloutStyles: styles(keepTogether),
});

/** Small single-column page (~11 body lines). */
const SMALL_PAGE = (keepTogether: boolean): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: [{ id: 'kp', title: TITLE, keepTogether }],
});

const items = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `- Punto clave número ${i + 1} de la lista de cierre del capítulo.`);
const callout = (n: number): string => [':::callout{type="kp"}', ...items(n), ':::'].join('\n');

const build = (md: string, config: PostextConfig): VDTDocument =>
  buildDocument({ markdown: md }, config, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b.type !== 'callout'
    && b.pageIndex === frame.pageIndex && b.columnIndex === frame.columnIndex);
const columnOf = (doc: VDTDocument, b: VDTBlock): VDTColumn => doc.pages[b.pageIndex]!.columns[b.columnIndex]!;
const textColumns = (page: VDTPage): VDTColumn[] =>
  page.columns.filter((c) => c.kind !== 'span' && c.blocks.length > 0);
const usedBottom = (c: VDTColumn): number => c.bbox.y + (c.bbox.height - c.availableHeight);
const pageBottom = (page: VDTPage): number => page.contentArea.y + page.contentArea.height;
const overlayTexts = (frame: VDTBlock, needle: string): number =>
  (frame.designOverlay?.blocks ?? []).filter((b) => b.kind === 'text' && b.lines.some((l) => l.text.includes(needle))).length;
const titleBlocks = (frame: VDTBlock): number => overlayTexts(frame, TITLE);
const iconBlocks = (frame: VDTBlock): number => overlayTexts(frame, ICON);

/** Every item of the fence, once, in reading order across the fragments. */
function expectItemsOnceInOrder(doc: VDTDocument, fragments: VDTBlock[], count: number): void {
  const seen: number[] = [];
  for (const f of fragments) {
    const kids = childrenOf(doc, f);
    expect(kids.length).toBeGreaterThan(0);
    expect(f.callout!.childIds).toEqual(kids.map((k) => k.id));
    for (const k of kids) {
      expect(k.type).toBe('listItem');
      seen.push(k.contentIndex!);
    }
  }
  expect(seen).toHaveLength(count);
  expect(new Set(seen).size).toBe(count);
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
}

describe('splittable callouts (keepTogether: false)', () => {
  // Page 0 holds ~30 lines of text across its two columns; a level cut sits
  // near line 15 and leaves ~8 lines — the 12-item box needs more.
  const MD = [filler(16), '', '## Sección', '', filler(2), '', filler(8), '', callout(12), '', filler(6)].join('\n');

  it('a page-span box breaks between its items: the head closes the levelled page, the rest opens the next one', () => {
    const doc = build(MD, TWO_COL(false));
    const parts = frames(doc);
    expect(parts).toHaveLength(2);
    const [head, rest] = parts;
    expect(head!.pageIndex).toBe(0);
    expect(rest!.pageIndex).toBe(1);
    expect(head!.contentIndex).toBe(rest!.contentIndex);
    expect(head!.containerId).toBe(rest!.containerId);
    expect(head!.callout!.part).toBe(0);
    expect(head!.callout!.continued).toBe(true);
    expect(rest!.callout!.part).toBe(1);
    expect(rest!.callout!.continued).toBe(false);
    // Both are span columns; the head sits under the text columns of page
    // 0, which end level, and inside the page.
    const page0 = doc.pages[0]!;
    expect(columnOf(doc, head!).kind).toBe('span');
    expect(columnOf(doc, rest!).kind).toBe('span');
    const cols = textColumns(page0);
    expect(cols).toHaveLength(2);
    const [b0, b1] = cols.map(usedBottom);
    expect(Math.abs(b0! - b1!)).toBeLessThanOrEqual(GRID + 0.5);
    for (const c of cols) expect(c.bbox.y + c.bbox.height).toBeLessThanOrEqual(head!.bbox.y + 0.01);
    expect(head!.bbox.y + head!.bbox.height).toBeLessThanOrEqual(pageBottom(page0) + 0.01);
    expect(rest!.bbox.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 5);
    // The title and the icon are drawn once, on the head; the frame
    // decoration (background) is on both.
    expect(titleBlocks(head!)).toBe(1);
    expect(titleBlocks(rest!)).toBe(0);
    expect(iconBlocks(head!)).toBe(1);
    expect(iconBlocks(rest!)).toBe(0);
    expect((rest!.designOverlay?.blocks ?? []).some((b) => b.kind === 'box')).toBe(true);
    expectItemsOnceInOrder(doc, parts, 12);
    // The flow resumes under the rest on page 1.
    const after = doc.blocks.filter((b) => b.type === 'paragraph' && b.containerId === undefined && b.pageIndex === 1);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.min(...after.map((b) => b.bbox.y))).toBeGreaterThan(rest!.bbox.y + rest!.bbox.height - 0.01);
  }, 30_000);

  it('keepTogether: true (the default) moves the same box whole to the next page', () => {
    const doc = build(MD, TWO_COL(true));
    const parts = frames(doc);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.pageIndex).toBe(1);
    expect(parts[0]!.callout!.part).toBeUndefined();
    expectItemsOnceInOrder(doc, parts, 12);
  }, 30_000);

  it('a box that fits whole under the levelled columns is not split', () => {
    const md = [filler(16), '', '## Sección', '', filler(2), '', filler(8), '', callout(3), '', filler(6)].join('\n');
    const doc = build(md, TWO_COL(false));
    const parts = frames(doc);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.pageIndex).toBe(0);
    expect(parts[0]!.callout!.part).toBeUndefined();
    expectItemsOnceInOrder(doc, parts, 3);
  }, 30_000);

  it('an inline (column) box splits at the column bottom and continues on the next page without its title', () => {
    let split = 0;
    for (let n = 1; n <= 6; n++) {
      const md = [filler(n), '', callout(8), '', 'After.'].join('\n');
      const doc = build(md, SMALL_PAGE(false));
      const parts = frames(doc);
      expectItemsOnceInOrder(doc, parts, 8);
      if (parts.length === 1) continue;
      split++;
      expect(parts).toHaveLength(2);
      const [head, rest] = parts;
      expect(head!.pageIndex).toBe(0);
      expect(rest!.pageIndex).toBe(1);
      expect(head!.callout).toMatchObject({ part: 0, continued: true });
      expect(rest!.callout).toMatchObject({ part: 1, continued: false });
      expect(titleBlocks(head!)).toBe(1);
      expect(titleBlocks(rest!)).toBe(0);
      // The head fits its column; the rest opens the next page at the top.
      const col0 = columnOf(doc, head!);
      expect(head!.bbox.y + head!.bbox.height).toBeLessThanOrEqual(col0.bbox.y + col0.bbox.height + 0.01);
      expect(rest!.bbox.y).toBeCloseTo(columnOf(doc, rest!).bbox.y, 5);
      const after = doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]?.text.startsWith('After'))!;
      expect(after.pageIndex).toBe(1);
      expect(after.bbox.y).toBeGreaterThan(rest!.bbox.y + rest!.bbox.height - 0.01);
    }
    expect(split).toBeGreaterThan(0);
  }, 30_000);
});
