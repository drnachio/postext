import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTDocument } from '../../vdt';
import type { PostextConfig, Resource, ResourcePlacement } from '../../types';

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

/**
 * The float rules the configuration docs state ("Float placement: where a
 * float can land"), checked on the layout they describe: a two-column
 * 17 × 24 cm page, a figure cited in the first paragraph.
 */

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const base = (): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'double' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
});
/** A chapter opener: a page-span H1 with a 30 mm design. */
const withOpener = (cfg: PostextConfig): PostextConfig => ({
  ...cfg,
  headings: {
    levels: [{
      level: 1,
      breakBefore: { enabled: true, parity: 'any' },
      span: 'page',
      advancedDesign: {
        enabled: true,
        minHeight: mm(30),
        slot: { elements: [{ kind: 'text', id: 't', content: '{titleText}', fontSize: pt(20), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
      },
    }],
  },
});

const fig = (id: string, placement: ResourcePlacement, w = 600, h = 300): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: id, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: w, height: h },
  placement,
});

const PARAS = Array.from({ length: 14 }, (_, i) => `Paragraph ${i} ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5)).join('\n\n');

const build = (markdown: string, resources: Resource[], cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

function whereIs(doc: VDTDocument, id: string): { page: number; column: number; y: number; bottom: number; atTop: boolean; atFoot: boolean } {
  for (const page of doc.pages) {
    for (const f of page.floats ?? []) {
      if (f.resourceBlock?.resource.id !== id) continue;
      const area = page.contentArea;
      return {
        page: page.index,
        column: f.columnIndex,
        y: f.bbox.y,
        bottom: f.bbox.y + f.bbox.height,
        atTop: Math.abs(f.bbox.y - area.y) < 1,
        atFoot: area.y + area.height - (f.bbox.y + f.bbox.height) < doc.baselineGrid,
      };
    }
  }
  throw new Error(`float ${id} not placed`);
}

describe('where a float cited on a page can land (EF-37)', () => {
  it("a page-span 'top' float cited on page 1 opens page 2 — never page 1, whose head is above its reference", () => {
    const doc = build(`# In-column title\n\nSee :ref{id="f"}.\n\n${PARAS}`, [fig('f', { position: 'top', span: 'page' })], base());
    const f = whereIs(doc, 'f');
    expect(f.page).toBe(1);
    expect(f.atTop).toBe(true);
  });

  it("'auto' and 'bottom' page-span floats take the foot band of the citing page", () => {
    for (const position of ['auto', 'bottom'] as const) {
      const doc = build(`# In-column title\n\nSee :ref{id="f"}.\n\n${PARAS}`, [fig('f', { position, span: 'page' })], base());
      const f = whereIs(doc, 'f');
      expect(f.page).toBe(0);
      expect(f.atFoot).toBe(true);
    }
  });

  it('…on a chapter opener page too; a top float still waits for the next page', () => {
    const md = `# Opener\n\nSee :ref{id="f"}.\n\n${PARAS}`;
    for (const position of ['auto', 'bottom'] as const) {
      const f = whereIs(build(md, [fig('f', { position, span: 'page' })], withOpener(base())), 'f');
      expect(f.page).toBe(0);
      expect(f.atFoot).toBe(true);
    }
    const top = whereIs(build(md, [fig('f', { position: 'top', span: 'page' })], withOpener(base())), 'f');
    expect(top.page).toBe(1);
    expect(top.atTop).toBe(true);
  });

  it("a column 'top' float takes the head of the next empty column of the same page", () => {
    const doc = build(`Intro. See :ref{id="f"}.\n\n${PARAS}`, [fig('f', { position: 'top', span: 'column' }, 300, 200)], base());
    const f = whereIs(doc, 'f');
    expect(f.page).toBe(0);
    expect(f.column).toBe(1);
    expect(f.atTop).toBe(true);
  });

  it('in one column the page-span float is a column float: top still means the next page', () => {
    const single = { ...base(), layout: { layoutType: 'single' as const } };
    const top = whereIs(build(`Intro. See :ref{id="f"}.\n\n${PARAS}`, [fig('f', { position: 'top', span: 'page' })], single), 'f');
    expect(top.page).toBe(1);
    const auto = whereIs(build(`Intro. See :ref{id="f"}.\n\n${PARAS}`, [fig('f', { position: 'auto', span: 'page' })], single), 'f');
    expect(auto.page).toBe(0);
    expect(auto.atFoot).toBe(true);
  });

  it('two column floats cited in one paragraph take two slots after it, in citation order', () => {
    const doc = build(
      `Intro ${'Lorem ipsum dolor sit amet. '.repeat(20)}\n\nCompare :ref{id="a"} with :ref{id="b"}.\n\n${PARAS}`,
      [fig('a', { position: 'auto', span: 'column' }, 300, 200), fig('b', { position: 'auto', span: 'column' }, 300, 200)],
      base(),
    );
    const a = whereIs(doc, 'a');
    const b = whereIs(doc, 'b');
    // The first takes the foot of the citing column, the second the head of
    // the next empty column: side by side, in reading order.
    expect([a.page, a.column, a.atFoot]).toEqual([0, 0, true]);
    expect([b.page, b.column, b.atTop]).toEqual([0, 1, true]);
  });

  describe('a citing paragraph that opens the next page (EF-69)', () => {
    const words = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
    const lineWith = (doc: VDTDocument, text: string): { page: number; column: number; y: number } | undefined => {
      for (const b of doc.blocks) {
        for (const l of b.lines) {
          if ((l.segments ?? []).map((s) => s.text).join('').includes(text)) {
            // Line boxes are in page coordinates once placed.
            return { page: b.pageIndex!, column: b.columnIndex!, y: l.bbox.y };
          }
        }
      }
      return undefined;
    };
    /** Filler that ends near the foot of page 1, then the citing paragraph
     *  (its reference near its end), then more text. */
    const cases = (layout: PostextConfig, placement: ResourcePlacement, fillers: number[]) => fillers.map((n) => {
      const md = `${words(n, 'w')}\n\n${words(60, 'a')} SEE :ref{id="f"} ${words(6, 'z')}\n\n${words(900, 'q')}`;
      const doc = build(md, [fig('f', placement, 600, 200)], layout);
      return { doc, filler: lineWith(doc, `w${n - 1}`)!, start: lineWith(doc, 'a0 ')!, ref: lineWith(doc, 'SEE')!, float: whereIs(doc, 'f') };
    });
    const single = { ...base(), layout: { layoutType: 'single' as const } };

    it('a page-span float cited in a paragraph that runs over (or moves whole) onto page 2 waits for its reference there', () => {
      for (const position of ['top', 'auto'] as const) {
        const all = cases(single, { position, span: 'page' }, [500, 520, 540, 560, 580, 600, 620, 640]);
        // Paragraphs begun at the foot of page 1 with the reference on page 2:
        // the float waits for the line that cites it, so the head of page 2,
        // above that line, is not its slot. A `top` float opens page 3; an
        // `auto` one takes the foot of page 2 when there is room, else page 3.
        const opened = all.filter((c) => c.filler.page === 0 && c.ref.page === 1);
        const runsOver = opened.filter((c) => c.start.page === 0);
        const movedWhole = opened.filter((c) => c.start.page === 1);
        expect(runsOver.length).toBeGreaterThan(0);
        expect(movedWhole.length).toBeGreaterThan(0);
        for (const c of opened) {
          expect(c.float.page > c.ref.page || (c.float.page === c.ref.page && c.float.y > c.ref.y)).toBe(true);
          if (position === 'top') expect([c.float.page, c.float.atTop]).toEqual([2, true]);
        }
        // A paragraph set on page 1: the rule holds — never above the reference.
        for (const c of all.filter((c) => c.ref.page === 0)) {
          expect(c.float.page > 0 || c.float.y > c.ref.y).toBe(true);
          if (position === 'top') expect(c.float.page).toBe(1);
        }
      }
    }, 30_000);

    it('within a page, a column float never heads the next column above a reference that ran into it', () => {
      const all = cases(base(), { position: 'top', span: 'column' }, [220, 240, 260, 280, 300]);
      const crossing = all.filter((c) => c.start.page === 0 && c.start.column === 0 && c.ref.page === 0 && c.ref.column === 1);
      expect(crossing.length).toBeGreaterThan(0);
      for (const c of crossing) expect(c.float.page).toBe(1);
    });
  });
});
