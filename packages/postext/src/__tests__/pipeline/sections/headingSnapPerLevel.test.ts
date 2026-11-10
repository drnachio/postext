import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../../../defaults/structure/headings.js';
import { resolveHeadingStylesConfig } from '../../../defaults/structure/headingStyles.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { HeadingsConfig, PostextConfig, Resource } from '../../../types.js';

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
const EPS = 0.01;

/** Heading margins off the grid (a line and a half under a heading), so a
 *  snapped heading and an unsnapped one set their text differently. */
const config = (headings: HeadingsConfig, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  ...extra,
  headings: {
    balancing: { enabled: false },
    marginTop: pt(14),
    marginBottom: pt(7),
    ...headings,
    levels: [{ level: 1, breakBefore: { enabled: false } }, ...(headings.levels ?? [])],
  },
});

const MD = [
  'Opening paragraph of the section.',
  '## Second level',
  'Text under the second-level heading.',
  '### Third level',
  'Text under the third-level heading.',
  '## Styled second level {style="loose"}',
  'Text under the styled heading.',
].join('\n\n');

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, cfg, createMeasurementCache());
const headingsOf = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'heading');
const textAfter = (doc: VDTDocument, h: VDTBlock): VDTBlock =>
  doc.blocks.find((b) => b.type === 'paragraph' && (b.contentIndex ?? -1) > (h.contentIndex ?? 0))!;
/** Whether a block's top sits on a baseline-grid line of its page. */
const onGrid = (doc: VDTDocument, b: VDTBlock): boolean => {
  const lines = (b.bbox.y - doc.pages[b.pageIndex]!.contentArea.y) / doc.baselineGrid;
  return Math.abs(lines - Math.round(lines)) < EPS;
};

describe('headings.levels[].snapToGrid (EF-22)', () => {
  it('inherits headings.snapToGrid when a level leaves it unset', () => {
    expect(resolveHeadingsConfig().levels.every((l) => l.snapToGrid)).toBe(true);
    expect(resolveHeadingsConfig({ snapToGrid: false }).levels.every((l) => !l.snapToGrid)).toBe(true);
    const mixed = resolveHeadingsConfig({ snapToGrid: false, levels: [{ level: 3, snapToGrid: true }] });
    expect(mixed.levels.map((l) => l.snapToGrid)).toEqual([false, false, true, false, false, false]);
  });

  it('an H2 off the grid and an H3 on it, in one document', () => {
    const doc = build(config({ levels: [{ level: 2, snapToGrid: false }] }));
    const [h2, h3] = headingsOf(doc);
    expect(h2!.snappedToGrid).toBe(false);
    expect(h3!.snappedToGrid).toBe(true);
    // The text under the H2 keeps the exact margin — off the grid; the text
    // under the H3 is back on it.
    expect(onGrid(doc, textAfter(doc, h2!))).toBe(false);
    expect(onGrid(doc, textAfter(doc, h3!))).toBe(true);
  });

  it('a level can snap when the headings default does not', () => {
    const doc = build(config({ snapToGrid: false, levels: [{ level: 3, snapToGrid: true }] }));
    const [h2, h3] = headingsOf(doc);
    expect(h2!.snappedToGrid).toBe(false);
    expect(h3!.snappedToGrid).toBe(true);
  });

  it('a heading style overrides its level', () => {
    const doc = build(config({}, { headingStyles: [{ id: 'loose', snapToGrid: false }] }));
    const hs = headingsOf(doc);
    expect(hs.map((h) => h.snappedToGrid)).toEqual([true, true, false]);
    const styles = resolveHeadingStylesConfig(
      [{ id: 'loose', snapToGrid: false }],
      resolveAllConfig().page, resolveAllConfig().bodyText, resolveAllConfig().unorderedLists, resolveAllConfig().orderedLists,
    );
    expect(styles[0]!.overrides.snapToGrid).toBe(false);
  });

  it('leaves the layout unchanged when no level sets it', () => {
    const plain = build(config({}));
    const explicit = build(config({ levels: [{ level: 2, snapToGrid: true }, { level: 3, snapToGrid: true }] }));
    expect(explicit.blocks.map((b) => [b.pageIndex, b.bbox.y])).toEqual(plain.blocks.map((b) => [b.pageIndex, b.bbox.y]));
  });

  it('strip keeps a level value only when it differs from headings.snapToGrid', () => {
    expect(stripHeadingsDefaults({ levels: [{ level: 2, snapToGrid: true }] })).toBeUndefined();
    expect(stripHeadingsDefaults({ levels: [{ level: 2, snapToGrid: false }] }))
      .toEqual({ levels: [{ level: 2, snapToGrid: false }] });
    expect(stripHeadingsDefaults({ snapToGrid: false, levels: [{ level: 2, snapToGrid: false }, { level: 3, snapToGrid: true }] }))
      .toEqual({ snapToGrid: false, levels: [{ level: 3, snapToGrid: true }] });
  });
});

describe('headings regainGrid: off the grid, regained at the text after', () => {
  /** The paragraph before `h` in reading order. */
  const textBefore = (doc: VDTDocument, h: VDTBlock): VDTBlock =>
    doc.blocks.filter((b) => b.type === 'paragraph' && (b.contentIndex ?? -1) < (h.contentIndex ?? 0)).at(-1)!;
  const bottom = (b: VDTBlock) => b.bbox.y + b.bbox.height;

  it('inherits headings.regainGrid, off by default, and strips like snapToGrid', () => {
    expect(resolveHeadingsConfig().levels.every((l) => !l.regainGrid)).toBe(true);
    expect(resolveHeadingsConfig({ regainGrid: true }).levels.every((l) => l.regainGrid)).toBe(true);
    expect(stripHeadingsDefaults({ regainGrid: false })).toBeUndefined();
    expect(stripHeadingsDefaults({ regainGrid: true })).toMatchObject({ regainGrid: true });
  });

  it('keeps the heading’s exact margins and puts its text back on the grid', () => {
    const doc = build(config({ levels: [{ level: 2, snapToGrid: false, regainGrid: true }] }));
    const h2 = headingsOf(doc)[0]!;
    expect(h2.snappedToGrid).toBe(false);
    expect(h2.regainsGrid).toBe(true);
    // Its space above is its own margin, exactly (14 pt; the paragraph
    // before has no space under it).
    const marginTop = 14 * doc.config.page.dpi / 72;
    expect(h2.bbox.y - bottom(textBefore(doc, h2))).toBeCloseTo(marginTop, 1);
    // And the text under it is on the grid, which off the grid it is not.
    expect(onGrid(doc, textAfter(doc, h2))).toBe(true);
    const off = build(config({ levels: [{ level: 2, snapToGrid: false }] }));
    expect(onGrid(off, textAfter(off, headingsOf(off)[0]!))).toBe(false);
  });

  it('is ignored while the heading snaps to the grid', () => {
    const doc = build(config({ levels: [{ level: 2, regainGrid: true }] }));
    expect(headingsOf(doc)[0]!.regainsGrid).toBeUndefined();
    expect(headingsOf(doc)[0]!.snappedToGrid).toBe(true);
  });
});

describe('regainGrid when a figure or a box follows the heading', () => {
  const figure: Resource = {
    id: 'fig', typeId: 'figure', kind: 'svg', caption: 'Figure.', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'f.svg', width: 400, height: 100 }, placement: { position: 'here' },
  };
  const off = { levels: [{ level: 2, snapToGrid: false }] };
  const regain = { levels: [{ level: 2, snapToGrid: false, regainGrid: true }] };
  const md = (next: string) => `Opening paragraph.\n\n## Second level\n\n${next}\n\nText after.`;
  const at = (headings: HeadingsConfig, next: string, type: VDTBlock['type']): { doc: VDTDocument; block: VDTBlock } => {
    const doc = buildDocument({ markdown: md(next), resources: [figure] }, config(headings), createMeasurementCache());
    return { doc, block: doc.blocks.find((b) => b.type === type)! };
  };

  it('opens a figure set in the text under the heading on a grid line', () => {
    const a = at(off, '::resource{id="fig"}', 'resource');
    expect(onGrid(a.doc, a.block)).toBe(false);
    const b = at(regain, '::resource{id="fig"}', 'resource');
    expect(onGrid(b.doc, b.block)).toBe(true);
  });

  it('opens a box under the heading on a grid line', () => {
    const a = at(off, ':::callout{type="note"}\nInside.\n:::', 'callout');
    expect(onGrid(a.doc, a.block)).toBe(false);
    const b = at(regain, ':::callout{type="note"}\nInside.\n:::', 'callout');
    expect(onGrid(b.doc, b.block)).toBe(true);
  });
});

describe('column balancing and regainGrid', () => {
  // Two columns (the default A4 page), balancing on: sections whose
  // headings leave gaps the heading lever fills.
  const SENTENCE = 'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
  const paragraph = (n: number) => SENTENCE.repeat(n).trim();
  const parts: string[] = ['# Documento de prueba', paragraph(6)];
  for (let i = 1; i <= 8; i++) parts.push(`## Sección ${i}`, paragraph(5), paragraph(4), `### Detalle ${i}`, paragraph(5), paragraph(3));
  const md = parts.join('\n\n');
  const levered = (doc: VDTDocument) => doc.blocks.filter((b) => b.type === 'heading' && b.balancing?.levers.includes('heading'));
  const twoCol = (levels: HeadingsConfig['levels']) => buildDocument({ markdown: md }, { headings: { levels } }, createMeasurementCache());
  const regaining = [{ level: 2, snapToGrid: false, regainGrid: true }, { level: 3, snapToGrid: false, regainGrid: true }];

  it('keeps the heading lever for headings that regain the grid', () => {
    // Control: the document takes heading levers with its headings on the
    // grid…
    const snapped = twoCol([]);
    expect(levered(snapped).length).toBeGreaterThan(0);
    // …and with them off the grid and regaining it the regaining headings
    // take them too: the lines balancing adds are whole grid lines, so the
    // text under them stays on the grid.
    const regained = twoCol(regaining);
    expect(regained.converged).toBe(true);
    expect(levered(regained).length).toBeGreaterThan(0);
    expect(levered(regained).every((b) => b.regainsGrid)).toBe(true);
    for (const h of regained.blocks.filter((b) => b.regainsGrid)) {
      const next = regained.blocks.find((b) => b.type === 'paragraph' && (b.contentIndex ?? -1) > (h.contentIndex ?? 0))!;
      if (next.pageIndex === h.pageIndex && next.columnIndex === h.columnIndex) {
        const lines = (next.bbox.y - regained.pages[next.pageIndex]!.columns[next.columnIndex]!.bbox.y) / regained.baselineGrid;
        expect(Math.abs(lines - Math.round(lines)), h.lines[0]?.text).toBeLessThan(EPS);
      }
    }
  }, 30_000);

  it('counts the rounding in keep-with-next: a regaining heading never closes a column', () => {
    const regained = twoCol(regaining);
    for (const page of regained.pages) {
      for (const col of page.columns) {
        const last = col.blocks[col.blocks.length - 1];
        expect(last?.type === 'heading' && last.regainsGrid === true).toBe(false);
      }
    }
  }, 30_000);
});
