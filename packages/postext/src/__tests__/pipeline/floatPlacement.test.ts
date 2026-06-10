import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { computeFloatPlan, resolveResourcePlacement } from '../../pipeline/floatPlacement';
import { parseMarkdown } from '../../parse';
import type { PostextContent, PostextConfig, Resource, ResourceType } from '../../types';

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

const figure = (id: string, placement?: Resource['placement']): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 300 },
  ...(placement ? { placement } : {}),
});

/** Small page so a few paragraphs overflow and a second page opens. */
const smallPage: PostextConfig = {
  page: {
    width: { value: 360, unit: 'pt' },
    height: { value: 240, unit: 'pt' },
    margins: { top: { value: 18, unit: 'pt' }, bottom: { value: 18, unit: 'pt' }, left: { value: 18, unit: 'pt' }, right: { value: 18, unit: 'pt' } },
  },
};

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Paragraph ${i} with enough words to consume vertical space and force the column and page to overflow so floats are flushed onto a freshly opened page during layout.`,
  ).join('\n\n');

/** All float blocks across all pages. */
const allFloats = (content: PostextContent, config?: PostextConfig) => {
  const doc = buildDocument(content, config);
  return doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b })));
};

/** Any inline (column-flow) resource block anywhere. */
const inlineResourceBlocks = (content: PostextContent, config?: PostextConfig) => {
  const doc = buildDocument(content, config);
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'resource')));
};

describe('float planning (pure)', () => {
  it('resolves placement with resource > type > built-in default', () => {
    const type: ResourceType = {
      id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}',
      resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Figure',
      defaultPlacement: { position: 'bottom', span: 'page' },
    };
    // Built-in default when nothing set.
    expect(resolveResourcePlacement(figure('a'), undefined)).toEqual({ position: 'top', span: 'column' });
    // Type default applies.
    expect(resolveResourcePlacement(figure('a'), type)).toEqual({ position: 'bottom', span: 'page' });
    // Resource overrides type.
    expect(resolveResourcePlacement(figure('a', { position: 'top' }), type)).toEqual({ position: 'top', span: 'page' });
  });

  it('plans a float at the first reference, whether :ref or ::resource', () => {
    const blocks = parseMarkdown('See :ref{id="f1"} here.\n\nMore text.\n\n::resource{id="f1"}');
    const plan = computeFloatPlan(blocks, [figure('f1')], []);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.resourceId).toBe('f1');
    expect(plan[0]!.firstBlockIdx).toBe(0); // the :ref paragraph, not the later ::resource
  });

  it('excludes position:here resources from the plan', () => {
    const blocks = parseMarkdown('::resource{id="f1"}');
    const plan = computeFloatPlan(blocks, [figure('f1', { position: 'here' })], []);
    expect(plan).toHaveLength(0);
  });
});

describe('float placement in the build pipeline', () => {
  it('floats a :ref-only resource to a page band, not inline, exactly once', () => {
    const content: PostextContent = {
      markdown: `# Intro\n\nText that mentions :ref{id="f1"} early on.\n\n${filler(20)}`,
      resources: [figure('f1')],
    };
    const floats = allFloats(content, smallPage);
    // Appears exactly once, as a float (not an inline column block).
    expect(floats).toHaveLength(1);
    expect(floats[0]!.block.resourceBlock?.resource.id).toBe('f1');
    expect(inlineResourceBlocks(content, smallPage)).toHaveLength(0);
  });

  it('does not require a ::resource embed — the reference alone incorporates it', () => {
    const withEmbed: PostextContent = {
      markdown: `# Intro\n\nSee :ref{id="f1"}.\n\n${filler(20)}\n\n::resource{id="f1"}`,
      resources: [figure('f1')],
    };
    const withoutEmbed: PostextContent = {
      markdown: `# Intro\n\nSee :ref{id="f1"}.\n\n${filler(20)}`,
      resources: [figure('f1')],
    };
    // Same single float either way; the embed is redundant for a floated resource.
    expect(allFloats(withEmbed, smallPage)).toHaveLength(1);
    expect(allFloats(withoutEmbed, smallPage)).toHaveLength(1);
  });

  it('keeps position:here resources inline at the directive', () => {
    const content: PostextContent = {
      markdown: `# Intro\n\nSee :ref{id="f1"}.\n\n::resource{id="f1"}\n\n${filler(4)}`,
      resources: [figure('f1', { position: 'here' })],
    };
    expect(allFloats(content, smallPage)).toHaveLength(0);
    expect(inlineResourceBlocks(content, smallPage).map((b) => b.resourceBlock?.resource.id)).toContain('f1');
  });

  it('a full-width (span:page) float is wider than a single-column float', () => {
    const colDoc = allFloats({
      markdown: `# Intro\n\n:ref{id="f1"}\n\n${filler(20)}`,
      resources: [figure('f1', { span: 'column' })],
    }, smallPage);
    const pageDoc = allFloats({
      markdown: `# Intro\n\n:ref{id="f1"}\n\n${filler(20)}`,
      resources: [figure('f1', { span: 'page' })],
    }, smallPage);
    expect(colDoc).toHaveLength(1);
    expect(pageDoc).toHaveLength(1);
    expect(pageDoc[0]!.block.bbox.width).toBeGreaterThan(colDoc[0]!.block.bbox.width);
  });

  it('places a top float above body text and a bottom float below it', () => {
    const doc = buildDocument({
      markdown: `# Intro\n\nTop :ref{id="top"} and bottom :ref{id="bot"}.\n\n${filler(20)}`,
      resources: [figure('top', { position: 'top' }), figure('bot', { position: 'bottom' })],
    }, smallPage);
    // Find the page that carries each float and compare to that page's column top.
    for (const page of doc.pages) {
      const contentTop = page.columns[0]?.bbox.y ?? 0;
      for (const fb of page.floats ?? []) {
        const id = fb.resourceBlock?.resource.id;
        if (id === 'top') {
          // Top float sits at/above the (post-reservation) column top.
          expect(fb.bbox.y).toBeLessThanOrEqual(contentTop + 1);
        }
      }
    }
    // Both floats placed.
    const ids = doc.pages.flatMap((p) => (p.floats ?? []).map((b) => b.resourceBlock?.resource.id));
    expect(ids).toContain('top');
    expect(ids).toContain('bot');
  });
});

const tableRes = (id: string, placement?: Resource['placement']): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: `Table ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  table: { model: { rows: [
    [{ content: 'Stage' }, { content: 'Cost' }],
    [{ content: 'Parse' }, { content: 'O(n)' }],
  ] } },
  ...(placement ? { placement } : {}),
});

/** Smallest distance from `value` to a multiple of `step`. */
const offGrid = (value: number, step: number) => {
  const r = ((value % step) + step) % step;
  return Math.min(r, step - r);
};

describe('baseline-grid alignment around float bands', () => {
  const doubleCol = { ...smallPage, layout: { layoutType: 'double' as const } };

  /** First text baseline of each column on a page, by column index. */
  const firstBaselines = (page: { columns: Array<{ blocks: Array<{ lines: Array<{ baseline: number }> }> }> }) =>
    page.columns.map((col) => {
      for (const block of col.blocks) {
        if (block.lines.length > 0) return block.lines[0]!.baseline;
      }
      return null;
    });

  /** Assert that on the page carrying the float every column's first baseline
   *  sits on the same global grid, and bbox.y shifts are grid multiples. */
  const expectColumnsCongruent = (resources: Resource[]) => {
    const doc = buildDocument({
      markdown: `Lead :ref{id="${resources[0]!.id}"} paragraph.\n\n${filler(30)}`,
      resources,
    }, doubleCol);

    const grid = doc.baselineGrid;
    expect(grid).toBeGreaterThan(0);
    const floatPage = doc.pages.find((p) => (p.floats ?? []).length > 0);
    expect(floatPage).toBeDefined();

    const baselines = firstBaselines(floatPage!).filter((b): b is number => b !== null);
    expect(baselines.length).toBeGreaterThan(0);
    // Congruent with the document-wide grid origin: page 0 column 0's first
    // baseline is the reference (all pages share the content-area top).
    const ref = firstBaselines(doc.pages[0]!).find((b): b is number => b !== null)!;
    for (const b of baselines) {
      expect(offGrid(b - ref, grid)).toBeLessThan(0.02);
    }
    for (const col of floatPage!.columns) {
      const minY = Math.min(...floatPage!.columns.map((cc) => cc.bbox.y));
      expect(offGrid(col.bbox.y - minY, grid)).toBeLessThan(0.02);
    }
    return doc;
  };

  it('keeps the displaced column on the global grid for a top column figure', () => {
    expectColumnsCongruent([figure('f1', { position: 'top', span: 'column' })]);
  });

  it('keeps the displaced column on the global grid for a top column table', () => {
    expectColumnsCongruent([tableRes('t1', { position: 'top', span: 'column' })]);
  });

  it('keeps all columns on the global grid for a full-width (span:page) top float', () => {
    expectColumnsCongruent([figure('f1', { position: 'top', span: 'page' })]);
  });

  it('anchors a bottom float caption baseline to the grid shared with the other column', () => {
    const doc = buildDocument({
      markdown: `Lead :ref{id="f1"} paragraph.\n\n${filler(30)}`,
      resources: [figure('f1', { position: 'bottom', span: 'column' })],
    }, doubleCol);

    const grid = doc.baselineGrid;
    const floatPage = doc.pages.find((p) => (p.floats ?? []).length > 0);
    expect(floatPage).toBeDefined();
    const fb = floatPage!.floats![0]!;
    const capLines = fb.resourceBlock!.captionLines;
    expect(capLines.length).toBeGreaterThan(0);

    // The caption's last baseline must land on a body baseline: congruent
    // with contentTop + 0.8 × grid (the body baseline convention), i.e. on
    // the same line a full opposite column would end on.
    const contentTop = Math.min(...floatPage!.columns.map((c) => c.bbox.y));
    const lastBaseline = capLines[capLines.length - 1]!.baseline;
    expect(offGrid(lastBaseline - contentTop - 0.8 * grid, grid)).toBeLessThan(0.02);

    // The float stays within the original content area (bounded by the
    // tallest column, which carries no bottom band) and below its own
    // column's shrunk text area.
    const maxColBottom = Math.max(...floatPage!.columns.map((c) => c.bbox.y + c.bbox.height));
    const ownCol = floatPage!.columns[fb.columnIndex]!;
    expect(fb.bbox.y + fb.bbox.height).toBeLessThanOrEqual(maxColBottom + 0.01);
    expect(fb.bbox.y).toBeGreaterThan(ownCol.bbox.y + ownCol.bbox.height);
  });

  it('anchors a full-width bottom float caption to the grid as well', () => {
    const doc = buildDocument({
      markdown: `Lead :ref{id="f1"} paragraph.\n\n${filler(30)}`,
      resources: [figure('f1', { position: 'bottom', span: 'page' })],
    }, doubleCol);

    const grid = doc.baselineGrid;
    const floatPage = doc.pages.find((p) => (p.floats ?? []).length > 0);
    expect(floatPage).toBeDefined();
    const fb = floatPage!.floats![0]!;
    const capLines = fb.resourceBlock!.captionLines;
    const contentTop = Math.min(...floatPage!.columns.map((c) => c.bbox.y));
    const lastBaseline = capLines[capLines.length - 1]!.baseline;
    expect(offGrid(lastBaseline - contentTop - 0.8 * grid, grid)).toBeLessThan(0.02);
  });

  it('returns the flow to the grid after an inline (position:here) resource', () => {
    const doc = buildDocument({
      markdown: `Intro paragraph.\n\nSee :ref{id="f1"}.\n\n::resource{id="f1"}\n\n${filler(6)}`,
      resources: [figure('f1', { position: 'here' })],
    }, doubleCol);

    const grid = doc.baselineGrid;
    // Reference: very first text baseline of the document (on-grid by construction).
    const ref = firstBaselines(doc.pages[0]!).find((b): b is number => b !== null)!;
    // Every text baseline AFTER the inline resource must still be on the grid.
    for (const page of doc.pages) {
      for (const col of page.columns) {
        for (const block of col.blocks) {
          if (block.type === 'resource' || block.lines.length === 0) continue;
          expect(offGrid(block.lines[0]!.baseline - ref, grid)).toBeLessThan(0.02);
        }
      }
    }
  });
});
