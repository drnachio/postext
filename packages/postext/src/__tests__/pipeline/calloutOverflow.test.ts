import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { PostextConfig, Resource } from '../../types';

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
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });
const ICON = '★';

const noteStyle = (extra: Record<string, unknown> = {}) =>
  [{ id: 'note', title: '', span: 'column' as const, icon: { kind: 'glyph' as const, glyph: ICON }, ...extra }];

/** Small single-column page (~11 body lines). */
const SMALL_PAGE = (extra: Record<string, unknown> = {}): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: noteStyle(extra),
});

/** Two-column page, ~23 grid lines tall, balancing off. */
const TWO_COL = (extra: Record<string, unknown> = {}): PostextConfig => ({
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  calloutStyles: noteStyle(extra),
});

const note = (text: string): string => [':::callout{type="note"}', text, ':::'].join('\n');

const figure = (id: string, w: number, h: number, span: 'column' | 'page'): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: w, height: h },
  placement: { span },
});

const build = (md: string, config: PostextConfig, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown: md, resources }, config, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b.type !== 'callout'
    && b.pageIndex === frame.pageIndex && b.columnIndex === frame.columnIndex);
const linesOf = (doc: VDTDocument, frame: VDTBlock): number =>
  childrenOf(doc, frame).reduce((n, b) => n + b.lines.length, 0);
const iconBlocks = (frame: VDTBlock): number =>
  (frame.designOverlay?.blocks ?? []).filter((b) => b.kind === 'text' && b.lines.some((l) => l.text.includes(ICON))).length;
const floatsOf = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b, id: b.resourceBlock!.resource.id })));

describe('splittable box cut inside a paragraph', () => {
  it('splits a one-paragraph note between its lines, at least two lines on each side', () => {
    // 8 lines of text, then a note whose single paragraph runs 5 lines:
    // three fit at the foot of the page, two go on.
    const md = `${filler(8)}\n\n${note(filler(6))}`;
    const doc = build(md, SMALL_PAGE({ keepTogether: false }));
    const fs = frames(doc);
    expect(fs.length).toBe(2);
    const [head, tail] = fs as [VDTBlock, VDTBlock];
    expect(head.pageIndex).toBe(0);
    expect(tail.pageIndex).toBe(1);
    const headLines = linesOf(doc, head);
    const tailLines = linesOf(doc, tail);
    expect(headLines).toBeGreaterThanOrEqual(2);
    expect(tailLines).toBeGreaterThanOrEqual(2);
    // Same paragraph on both sides: one child each, the whole text once.
    const whole = build(note(filler(6)), SMALL_PAGE({ keepTogether: false }));
    expect(headLines + tailLines).toBe(linesOf(whole, frames(whole)[0]!));
    expect(childrenOf(doc, head)).toHaveLength(1);
    expect(childrenOf(doc, tail)).toHaveLength(1);
    // The continuation drops the icon; the head keeps it.
    expect(iconBlocks(head)).toBe(1);
    expect(iconBlocks(tail)).toBe(0);
    // Both fragments sit inside their page.
    for (const f of fs) {
      const page = doc.pages[f.pageIndex]!;
      expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.01);
    }
  }, 30000);

  it('never leaves fewer than splitMinLines on a side: moves whole instead', () => {
    // Same page: the 5-line note can leave 4 + 1 or 3 + 2 lines at the foot.
    const md = `${filler(8)}\n\n${note(filler(6))}`;
    const strict = build(md, SMALL_PAGE({ keepTogether: false, splitMinLines: 3 }));
    const lax = build(md, SMALL_PAGE({ keepTogether: false, splitMinLines: 1 }));
    // Minimum 1: the deepest cut, a lone line going on. Minimum 3: no cut
    // leaves three lines on both sides, so the box moves whole.
    const lf = frames(lax);
    expect(lf).toHaveLength(2);
    expect(linesOf(lax, lf[0]!)).toBe(4);
    expect(linesOf(lax, lf[1]!)).toBe(1);
    const sf = frames(strict);
    expect(sf).toHaveLength(1);
    expect(sf[0]!.pageIndex).toBe(1);
    expect(linesOf(strict, sf[0]!)).toBe(5);
  }, 30000);
});

describe('keep-together box in a column cut short by floats', () => {
  it('moves to the next page instead of overflowing, and a box taller than a column warns', () => {
    // Left column: a paragraph referencing a tall column figure and a
    // page-span figure, then a short paragraph (so the floats settle before
    // the box comes), then a keep-together note. The figure takes the head
    // of the right column, the span figure the page foot; the note does not
    // fit the sliver between them.
    const resources = [figure('f1', 400, 700, 'column'), figure('f2', 400, 200, 'page')];
    const md = `Intro :ref{id="f1"} and :ref{id="f2"} text. ${filler(14)}\n\nShort.\n\n${note(filler(7))}\n\n${filler(4)}`;
    const doc = build(md, TWO_COL(), resources);
    const fs = frames(doc);
    expect(fs).toHaveLength(1);
    const f = fs[0]!;
    // The figure took the head of the right column, which is now too
    // short for the box: it opens the next page instead of overflowing.
    const f1 = floatsOf(doc).find((x) => x.id === 'f1')!;
    expect(f1.page).toBe(0);
    expect(f1.block.columnIndex).toBe(1);
    expect(f.pageIndex).toBe(1);
    const page = doc.pages[f.pageIndex]!;
    // Placed whole inside its page, never past the column's foot.
    expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.01);
    const col = page.columns[f.columnIndex]!;
    expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.01);
    expect(doc.warnings ?? []).toHaveLength(0);

    // A box taller than any column is placed anyway and reported.
    const tall = build(note(filler(40)), SMALL_PAGE());
    expect(frames(tall)).toHaveLength(1);
    expect(tall.warnings).toBeDefined();
    expect(tall.warnings![0]!.kind).toBe('calloutOverflow');
    expect(tall.warnings![0]!.overflowPx).toBeGreaterThan(0);
    expect(tall.warnings![0]!.sourceStart).toBe(0);
  }, 30000);
});

describe('continuation fragment closing a column under a figure', () => {
  it('is levered down so its foot meets the foot of the head in the column before', () => {
    // Left column: text, then a splittable note whose head closes the
    // column. Right column: a figure at the head, then the note's tail;
    // a keep-together box after it does not fit and opens the next page,
    // so the tail closes the column with a gap under it.
    const resources = [figure('f1', 400, 500, 'column'), figure('f2', 400, 200, 'page')];
    const config: PostextConfig = {
      ...TWO_COL({ keepTogether: false }),
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    };
    config.calloutStyles = [...(config.calloutStyles ?? []), { id: 'kt', title: 'Puntos clave', span: 'column', keepTogether: true }];
    const kt = [':::callout{type="kt"}', filler(12), ':::'].join('\n');
    const md = `Intro :ref{id="f1"} and :ref{id="f2"} text. ${filler(18)}\n\n${note(filler(8))}\n\n${kt}\n\n${filler(4)}`;
    const doc = build(md, config, resources);
    const parts = frames(doc).filter((f) => f.callout?.styleId === 'note');
    expect(parts).toHaveLength(2);
    const [head, tail] = parts as [VDTBlock, VDTBlock];
    expect(head.pageIndex).toBe(0);
    expect(head.columnIndex).toBe(0);
    expect(tail.pageIndex).toBe(0);
    expect(tail.columnIndex).toBe(1);
    const f1 = floatsOf(doc).find((x) => x.id === 'f1')!;
    expect(f1.page).toBe(0);
    expect(f1.block.columnIndex).toBe(1);
    // Under the figure, and bottom-aligned with the head's foot.
    expect(tail.bbox.y).toBeGreaterThan(f1.block.bbox.y + f1.block.bbox.height);
    const headFoot = head.bbox.y + head.bbox.height;
    const tailFoot = tail.bbox.y + tail.bbox.height;
    expect(Math.abs(tailFoot - headFoot)).toBeLessThan(0.5);
    // Nothing else shares the column with the tail.
    const col = doc.pages[0]!.columns[1]!;
    expect(col.blocks.every((b) => b.containerId === tail.containerId)).toBe(true);
    expect(doc.warnings ?? []).toHaveLength(0);
  }, 60000);
});

describe('floats yield to a keep-together box', () => {
  it('a column figure defers to the next page when its slot would push the box off the page', () => {
    const resources = [figure('f1', 400, 700, 'column'), figure('f2', 400, 200, 'page')];
    // The note comes right after the referencing paragraph, which fills the
    // left column: without the yield rule f1 would take the head of the
    // right column and the note could not follow it on this page.
    const md = `Intro :ref{id="f1"} and :ref{id="f2"} text. ${filler(15)}\n\n${note(filler(7))}\n\n${filler(6)}`;
    const doc = build(md, TWO_COL(), resources);
    const f = frames(doc)[0]!;
    const f1 = floatsOf(doc).find((x) => x.id === 'f1')!;
    const f2 = floatsOf(doc).find((x) => x.id === 'f2')!;
    expect(f.pageIndex).toBe(0);
    expect(f.columnIndex).toBe(1);
    expect(f1.page).toBe(1);
    // Figure 2 keeps its place in the sequence: after figure 1, never on
    // page 0 ahead of it.
    expect(f2.page).toBeGreaterThanOrEqual(1);
    // A splittable note takes no such precedence: the figure keeps its slot.
    const split = build(md, TWO_COL({ keepTogether: false }), resources);
    expect(floatsOf(split).find((x) => x.id === 'f1')!.page).toBe(0);
  }, 30000);
});
