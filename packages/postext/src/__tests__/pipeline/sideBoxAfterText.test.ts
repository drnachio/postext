import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** The page of `sideBoxAtColumnEnd.test.ts`: eight 14 pt lines a page and a
 *  float-only side column. */
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(100), height: mm(60), dpi: 150, margins: { top: mm(10), bottom: mm(10.48), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 20, sideColumnRole: 'floats', gutterWidth: mm(3) },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', firstLineIndent: pt(0) },
  paragraphStyles: [{ id: 'v' }],
  calloutStyles: [{ id: 'n', backgroundEnabled: false, padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) } }],
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

const box = (name: string, lines: number): string =>
  `:::callout{type="n" span="side"}\n${Array.from({ length: lines }, (_, i) => `:::paragraphs{style="v"}\n${name}${i + 1}\n:::`).join('\n\n')}\n:::`;
const text = (n: number): string => Array.from({ length: n }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`).join('\n\n');

const figure = (id: string, height: number): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 100, height },
  placement: { span: 'side' },
});

const build = (markdown: string, cfg: PostextConfig = config(), resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

/** Page of the first line of box `name`. */
const pageOf = (doc: VDTDocument, name: string): number | undefined => {
  for (const page of doc.pages) {
    if ((page.floats ?? []).some((b) => b.lines.some((l) => l.text === `${name}1`))) return page.index;
  }
  return undefined;
};
const pagesOf = (doc: VDTDocument, names: string): (number | undefined)[] => [...names].map((n) => pageOf(doc, n));
/** Whether a page's text column holds a block. */
const holdsText = (doc: VDTDocument, page: number): boolean =>
  doc.pages[page]!.columns.some((c) => c.kind !== 'side' && c.blocks.length > 0);
const afterText = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'afterText');
const unplaced = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'unplaced');

describe('side boxes still waiting when the text ends (#639)', () => {
  it('sets each of them, in order, on pages after the text, and reports those pages', () => {
    for (const names of ['ABC', 'ABCD']) {
      for (const lines of [5, 6, 7]) {
        const md = [text(3), ...[...names].map((n) => box(n, lines))].join('\n\n');
        const doc = build(md);
        // A stands beside the text; every other box takes a page after it.
        expect(pagesOf(doc, names)).toEqual([...names].map((_, i) => i));
        expect(doc.pages).toHaveLength(names.length);
        expect(holdsText(doc, 0)).toBe(true);
        for (let p = 1; p < names.length; p++) expect(holdsText(doc, p)).toBe(false);
        // One warning per page with no text, pointing at its box.
        const found = afterText(doc);
        expect(found.map((w) => w.pageIndex)).toEqual([...names].slice(1).map((_, i) => i + 1));
        [...names].slice(1).forEach((n, i) => {
          expect(md.slice(found[i]!.sourceStart, found[i]!.sourceEnd)).toContain(`${n}1`);
          expect(md.slice(found[i]!.sourceStart, found[i]!.sourceEnd)).toMatch(/^:::callout/);
        });
        expect(unplaced(doc)).toEqual([]);
        expect(doc.warnings ?? []).toEqual([]);
      }
    }
  });

  it('sets them before a chapter barrier, none on the pages of the next chapter', () => {
    const cfg = config({ headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] } });
    const md = [text(3), box('A', 5), box('B', 5), box('C', 5), box('D', 5), '# Next chapter', text(2)].join('\n\n');
    const doc = build(md, cfg);
    expect(pagesOf(doc, 'ABCD')).toEqual([0, 1, 2, 3]);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.pageIndex).toBe(4);
    expect(doc.pages).toHaveLength(5);
    expect(doc.pages[4]!.floats ?? []).toEqual([]);
    expect(afterText(doc).map((w) => w.pageIndex)).toEqual([1, 2, 3]);
    expect(unplaced(doc)).toEqual([]);
  });

  it('does the same in vertical text', () => {
    // Sixteen lines a tier there: nine-line boxes do not share one.
    const cfg = config({ layout: { layoutType: 'oneAndHalf', sideColumnPercent: 20, sideColumnRole: 'floats', gutterWidth: mm(3), writingMode: 'vertical-rl' } });
    for (const names of ['ABC', 'ABCD']) {
      const doc = build([text(3), ...[...names].map((n) => box(n, 9))].join('\n\n'), cfg);
      expect(pagesOf(doc, names)).toEqual([...names].map((_, i) => i));
      expect(afterText(doc).map((w) => w.pageIndex)).toEqual([...names].slice(1).map((_, i) => i + 1));
      expect(unplaced(doc)).toEqual([]);
    }
    // And before a chapter barrier.
    const barrier = config({
      layout: { layoutType: 'oneAndHalf', sideColumnPercent: 20, sideColumnRole: 'floats', gutterWidth: mm(3), writingMode: 'vertical-rl' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    });
    const doc = build([text(3), box('A', 9), box('B', 9), box('C', 9), '# Next chapter', text(2)].join('\n\n'), barrier);
    expect(pagesOf(doc, 'ABC')).toEqual([0, 1, 2]);
    expect(doc.blocks.find((b) => b.type === 'heading')!.pageIndex).toBe(3);
  });

  it('shares a page after the text between boxes that fit one side column', () => {
    // Three-line boxes: two to a column of eight lines, with the gap.
    const doc = build([text(6), box('A', 3), box('B', 3), box('C', 3), box('D', 3)].join('\n\n'));
    expect(pagesOf(doc, 'ABCD')).toEqual([0, 1, 1, 2]);
    expect(afterText(doc).map((w) => w.pageIndex)).toEqual([1, 1, 2]);
  });

  it('keeps a side figure queued behind them after them', () => {
    // Ten lines a page: the figure (its label under it, three lines with
    // its gap) would fit under B on page 2, where C, fenced before the
    // figure's citation, does not.
    const tall = config({ page: { width: mm(100), height: mm(69.88), dpi: 150, margins: { top: mm(10), bottom: mm(10.48), left: mm(10), right: mm(10) } } });
    const cite = ':::paragraphs{style="v"}\nSee :ref{id="f"} here.\n:::';
    const md = [text(5), box('A', 5), box('B', 5), box('C', 5), cite].join('\n\n');
    const doc = build(md, tall, [figure('f', 25)]);
    const figurePage = doc.pages.find((p) => (p.floats ?? []).some((b) => b.resourceBlock?.resource.id === 'f'))!;
    expect(pagesOf(doc, 'ABC')).toEqual([0, 1, 2]);
    expect(figurePage.index).toBe(2);
    const c = figurePage.floats!.find((b) => b.type === 'callout')!;
    const f = figurePage.floats!.find((b) => b.resourceBlock?.resource.id === 'f')!;
    expect(f.bbox.y).toBeGreaterThanOrEqual(c.bbox.y + c.bbox.height - 0.01);
    // The figure is reported with the block that cites it.
    const found = afterText(doc).find((w) => w.resourceId === 'f')!;
    expect(found.pageIndex).toBe(2);
    expect(md.slice(found.sourceStart, found.sourceEnd)).toContain(':ref{id="f"}');
  });

  it('sets a box taller than an empty side column anyway, and reports the overflow', () => {
    const md = [text(3), box('A', 5), box('B', 11), box('C', 5)].join('\n\n');
    const doc = build(md);
    expect(pagesOf(doc, 'ABC')).toEqual([0, 1, 2]);
    const side = doc.pages[1]!.columns.find((c) => c.kind === 'side')!;
    expect(doc.warnings).toHaveLength(1);
    expect(doc.warnings![0]).toMatchObject({ kind: 'calloutOverflow', pageIndex: 1, columnIndex: side.index });
    expect(doc.warnings![0]!.overflowPx).toBeGreaterThan(0);
    expect(md.slice(doc.warnings![0]!.sourceStart, doc.warnings![0]!.sourceEnd)).toContain('B1');
  });

  it('reports a box no page it opens can take instead of dropping it', () => {
    // The section the last heading opens has no side column: the pages
    // opened after the text cannot take the box still waiting.
    const cfg = config({
      headings: { levels: [{ level: 2, breakBefore: { enabled: false } }] },
      headingStyles: [{ id: 'plain', layout: { layoutType: 'single' } }],
    });
    const md = [text(1), '## Section {style="plain"}', text(1), box('A', 6), box('B', 6)].join('\n\n');
    const doc = build(md, cfg);
    expect(pageOf(doc, 'A')).toBe(0);
    expect(pageOf(doc, 'B')).toBeUndefined();
    const found = unplaced(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.pageIndex).toBeUndefined();
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toContain('B1');
    expect(afterText(doc)).toEqual([]);
  });

  it('raises nothing when the side column holds every box', () => {
    const doc = build([text(8), box('A', 2), text(4), box('B', 2)].join('\n\n'));
    expect(doc.contentWarnings ?? []).toEqual([]);
    expect(doc.warnings ?? []).toEqual([]);
  });
});
