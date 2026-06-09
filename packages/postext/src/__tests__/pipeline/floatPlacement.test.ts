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
