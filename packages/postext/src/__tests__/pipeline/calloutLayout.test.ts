import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { resolveAllConfig } from '../../pipeline/config';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../../pipeline/styles';
import {
  computeLevelIndentsPx,
  computeOrderedLevelIndentsPx,
  computeOrderedListRunMetrics,
} from '../../pipeline/lists';
import type { BlockMeasureContext } from '../../pipeline/measureContentBlock';
import {
  deriveCalloutResolvedConfig,
  layoutCallout,
  offsetCalloutToAbsolute,
  pickCalloutStyle,
  planCallouts,
  type CalloutLayoutResult,
} from '../../pipeline/calloutLayout';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { dimensionToPx } from '../../units';
import type { CalloutStyleConfig, PostextConfig, Resource } from '../../types';
import type { VDTDesignBoxBlock, VDTDesignImageBlock, VDTDesignTextBlock } from '../../vdt';

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
const GAP = BODY_PX * 0.5;
const TITLE_LH = BODY_PX * 1.2;

const SENTENCE = 'Una nota breve sobre el estado de la linterna y el cuidado de la mecha cada noche. ';

interface Harness {
  ctx: BlockMeasureContext;
  layout: (md: string, width: number, attrs?: Record<string, string>, styleId?: string) => CalloutLayoutResult;
}

function harness(config?: PostextConfig, resources: Resource[] = []): Harness {
  const resolved = resolveAllConfig(config);
  const bodyStyle = resolveBodyStyle(resolved);
  const resourceTypes = defaultResourceTypes();
  const resourceById = new Map(resources.map((r) => [r.id, r] as const));
  const resourceTypeById = new Map(resourceTypes.map((t) => [t.id, t] as const));
  const build = (contentBlocks: ReturnType<typeof parseMarkdown>): BlockMeasureContext => {
    const orderedMetrics = computeOrderedListRunMetrics(contentBlocks, resolved, bodyStyle.fontSizePx);
    return {
      resolved,
      bodyStyle,
      blockquoteStyle: resolveBlockquoteStyle(resolved),
      headingPrefixes: [],
      listLevelIndentsPx: computeLevelIndentsPx(resolved, bodyStyle.fontSizePx),
      orderedLevelIndentsPx: computeOrderedLevelIndentsPx(resolved, bodyStyle.fontSizePx, orderedMetrics.maxWidthByDepth),
      orderedMetrics,
      resourceById,
      resourceTypeById,
      resourceNumberById: new Map(),
      contentBlocks,
      bodyOffset: 0,
      resources,
      resourceTypes,
      resourceNumbering: {},
      floatedIds: new Set(),
    };
  };
  const ctx = build([]);
  return {
    ctx,
    layout: (md, width, attrs = {}, styleId) => {
      const contentBlocks = parseMarkdown(`:::callout\n${md}\n:::\n`);
      const plan = planCallouts(contentBlocks).get(0)!;
      const style = pickCalloutStyle(resolved.calloutStyles, styleId ?? attrs.type)!;
      let n = 0;
      return layoutCallout({
        style,
        attrs,
        children: contentBlocks.slice(1, plan.endIdx),
        childStartIdx: 1,
        width,
        ctx: build(contentBlocks),
        resolved,
        containerId: plan.containerId,
        frameId: 'frame',
        nextChildId: () => `frame-c${n++}`,
      });
    },
  };
}

const withStyle = (extra: Partial<CalloutStyleConfig>): PostextConfig => ({
  calloutStyles: [{ id: 'note', ...extra }],
});

describe('layoutCallout', () => {
  it('height = padding + title + gap + children + padding', () => {
    const h = harness();
    const md = `${SENTENCE.repeat(3).trim()}\n\n- uno\n- dos`;
    const r = h.layout(md, 800, { title: 'Nota' });
    expect(r.children).toHaveLength(3);
    const first = r.children[0]!;
    const last = r.children[r.children.length - 1]!;
    expect(first.bbox.y).toBeCloseTo(PAD + TITLE_LH + GAP, 5);
    const childrenExtent = last.bbox.y + last.bbox.height - first.bbox.y;
    expect(r.totalHeight).toBeCloseTo(PAD + TITLE_LH + GAP + childrenExtent + PAD, 5);
    // Paragraph then list: the larger of the two margins separates them.
    expect(r.children[1]!.bbox.y - (first.bbox.y + first.bbox.height)).toBeCloseTo(GRID, 5);
    // Consecutive list items abut (itemSpacing 0).
    expect(r.children[2]!.bbox.y).toBeCloseTo(r.children[1]!.bbox.y + r.children[1]!.bbox.height, 5);
    // Title block is the last overlay block; no title → children start at the padding.
    const title = r.frame.designOverlay!.blocks[r.frame.designOverlay!.blocks.length - 1] as VDTDesignTextBlock;
    expect(title.kind).toBe('text');
    expect(title.lines[0]!.text).toBe('Nota');
    const noTitle = h.layout(md, 800);
    expect(noTitle.children[0]!.bbox.y).toBeCloseTo(PAD, 5);
    expect(noTitle.frame.designOverlay!.blocks.every((b) => b.kind !== 'text')).toBe(true);
  });

  it('is pure in width: page width yields fewer lines than column width', () => {
    const h = harness();
    const md = SENTENCE.repeat(6).trim();
    const narrow = h.layout(md, 500);
    const wide = h.layout(md, 1200);
    expect(wide.children[0]!.lines.length).toBeLessThan(narrow.children[0]!.lines.length);
    expect(wide.totalHeight).toBeLessThan(narrow.totalHeight);
    expect(wide.width).toBe(1200);
    expect(narrow.width).toBe(500);
    // Inner width follows the frame width.
    expect(wide.frame.callout!.innerRect.width).toBeCloseTo(1200 - 2 * PAD, 5);
  });

  it('stripe box spans the frame height and narrows the inner rect', () => {
    const h = harness(withStyle({ stripe: { enabled: true, side: 'left' } }));
    const r = h.layout(SENTENCE.repeat(2).trim(), 800);
    const stripeW = BODY_PX * 1.5;
    const blocks = r.frame.designOverlay!.blocks;
    const stripe = blocks[1] as VDTDesignBoxBlock;
    expect(stripe.kind).toBe('box');
    expect(stripe.bbox.x).toBe(0);
    expect(stripe.bbox.y).toBe(0);
    expect(stripe.bbox.width).toBeCloseTo(stripeW, 5);
    expect(stripe.bbox.height).toBeCloseTo(r.totalHeight, 5);
    expect(r.frame.callout!.innerRect.x).toBeCloseTo(stripeW + PAD, 5);
    expect(r.frame.callout!.innerRect.width).toBeCloseTo(800 - stripeW - 2 * PAD, 5);
    // A top stripe reduces height instead.
    const top = harness(withStyle({ stripe: { enabled: true, side: 'top' } })).layout(SENTENCE.trim(), 800);
    expect(top.frame.callout!.innerRect.x).toBeCloseTo(PAD, 5);
    expect(top.frame.callout!.innerRect.y).toBeCloseTo(stripeW + PAD, 5);
  });

  it('records the icon fileId and emits an image design block', () => {
    const icon: Resource = {
      id: 'ico',
      typeId: 'figure',
      kind: 'bitmap',
      createdAt: 0,
      updatedAt: 0,
      bitmap: { fileId: 'file-ico', format: 'png', width: 32, height: 32 },
    };
    const h = harness(withStyle({ icon: { kind: 'resource', resourceId: 'ico' } }), [icon]);
    const r = h.layout(SENTENCE.trim(), 800, { title: 'Objetivos' });
    expect(r.frame.callout!.iconFileId).toBe('file-ico');
    expect(r.frame.callout!.iconFormat).toBe('png');
    const image = r.frame.designOverlay!.blocks.find((b) => b.kind === 'image') as VDTDesignImageBlock;
    expect(image).toBeDefined();
    expect(image.fileId).toBe('file-ico');
    const iconSize = BODY_PX * 1.5;
    expect(image.bbox.x).toBeCloseTo(PAD, 5);
    expect(image.bbox.y).toBeCloseTo(PAD, 5);
    expect(image.bbox.width).toBeCloseTo(iconSize, 5);
    expect(image.bbox.height).toBeCloseTo(iconSize, 5);
    // The icon column is reserved: content starts after icon + gap.
    expect(r.frame.callout!.innerRect.x).toBeCloseTo(PAD + iconSize + GAP, 5);
    // Glyph icons become a text block instead.
    const g = harness(withStyle({ icon: { kind: 'glyph', glyph: '!' } })).layout(SENTENCE.trim(), 800);
    const glyph = g.frame.designOverlay!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    expect(glyph.lines[0]!.text).toBe('!');
    expect(g.frame.callout!.iconFileId).toBeUndefined();
  });

  it('children carry the containerId and lie inside innerRect', () => {
    const h = harness();
    const r = h.layout(`${SENTENCE.repeat(2).trim()}\n\n- a\n- b\n\n> quote`, 700);
    const inner = r.frame.callout!.innerRect;
    expect(r.children.length).toBe(4);
    for (const c of r.children) {
      expect(c.containerId).toBe(r.frame.containerId);
      expect(c.bbox.x).toBeCloseTo(inner.x, 5);
      expect(c.bbox.width).toBeCloseTo(inner.width, 5);
      expect(c.bbox.y).toBeGreaterThanOrEqual(inner.y - 1e-6);
      expect(c.bbox.y + c.bbox.height).toBeLessThanOrEqual(inner.y + inner.height + 1e-6);
      for (const ln of c.lines) {
        expect(ln.bbox.x).toBeGreaterThanOrEqual(inner.x - 1e-6);
        expect(ln.bbox.x).toBeLessThan(inner.x + inner.width);
        expect(ln.bbox.y).toBeGreaterThanOrEqual(inner.y - 1e-6);
      }
    }
    expect(r.frame.callout!.childIds).toEqual(r.children.map((c) => c.id));
    expect(r.frame.type).toBe('callout');
    expect(r.frame.lines).toEqual([]);
    // List children keep their bullet metadata, frame-relative.
    const item = r.children[1]!;
    expect(item.type).toBe('listItem');
    expect(item.bulletText).toBe('•');
    expect(item.bulletOffsetX).toBeCloseTo(inner.x, 5);
    // Offsetting to absolute moves everything by the same delta.
    const before = item.lines[0]!.baseline;
    offsetCalloutToAbsolute(r, 100, 200);
    expect(r.frame.bbox).toEqual({ x: 100, y: 200, width: 700, height: r.totalHeight });
    expect(item.bbox.x).toBeCloseTo(100 + inner.x, 5);
    expect(item.lines[0]!.baseline).toBeCloseTo(before + 200, 5);
    expect(item.bulletY).toBeGreaterThan(200);
    expect(r.frame.designOverlay!.bbox.x).toBe(100);
    expect((r.frame.designOverlay!.blocks[0] as VDTDesignBoxBlock).bbox.y).toBe(200);
  });

  it('unknown type falls back to the first configured style', () => {
    const config: PostextConfig = {
      calloutStyles: [
        { id: 'tip', title: 'Tip' },
        { id: 'warning', title: 'Warning' },
      ],
    };
    const resolved = resolveAllConfig(config);
    expect(pickCalloutStyle(resolved.calloutStyles, 'warning')!.id).toBe('warning');
    expect(pickCalloutStyle(resolved.calloutStyles, 'nope')!.id).toBe('tip');
    expect(pickCalloutStyle(resolved.calloutStyles, undefined)!.id).toBe('tip');
    expect(pickCalloutStyle([], 'tip')).toBeUndefined();
    const r = harness(config).layout(SENTENCE.trim(), 800, { type: 'nope' });
    expect(r.frame.callout!.styleId).toBe('tip');
    // Fence attributes override span / placement / title per instance.
    const o = harness(config).layout(SENTENCE.trim(), 800, { type: 'warning', span: 'page', placement: 'top', title: 'Custom' });
    expect(o.frame.callout!.span).toBe('page');
    expect(o.frame.callout!.placement).toBe('top');
    const title = o.frame.designOverlay!.blocks[o.frame.designOverlay!.blocks.length - 1] as VDTDesignTextBlock;
    expect(title.lines[0]!.text).toBe('Custom');
  });

  it("width: 'auto' shrink-wraps the title and ignores the children", () => {
    const h = harness(withStyle({ width: 'auto', title: 'Badge' }));
    const r = h.layout(SENTENCE.repeat(3).trim(), 800);
    expect(r.children).toEqual([]);
    expect(r.width).toBeCloseTo(PAD + 'Badge'.length * 7 + PAD, 5);
    expect(r.totalHeight).toBeCloseTo(PAD + TITLE_LH + PAD, 5);
    expect(r.frame.designOverlay!.bbox.width).toBeCloseTo(r.width, 5);
  });

  it('body / lists overrides flow through the derived config', () => {
    const h = harness(withStyle({
      body: { fontSize: { value: 6, unit: 'pt' }, lineHeight: { value: 1.2, unit: 'em' } },
      lists: { bulletChar: '–' },
      titleStyle: { textTransform: 'uppercase' },
    }));
    const r = h.layout(`${SENTENCE.trim()}\n\n- a`, 800, { title: 'Nota' });
    const smallPx = (6 * 300) / 72;
    expect(r.children[0]!.lines[0]!.bbox.height).toBeCloseTo(smallPx * 1.2, 5);
    expect(r.children[0]!.fontString).toContain(`${smallPx}px`);
    expect(r.children[1]!.bulletText).toBe('–');
    const title = r.frame.designOverlay!.blocks[r.frame.designOverlay!.blocks.length - 1] as VDTDesignTextBlock;
    expect(title.lines[0]!.text).toBe('NOTA');
    const derived = deriveCalloutResolvedConfig(h.ctx.resolved, h.ctx.resolved.calloutStyles[0]!);
    expect(dimensionToPx(derived.bodyText.fontSize, derived.page.dpi)).toBeCloseTo(smallPx, 5);
    expect(derived.unorderedLists.levels.every((l) => l.bulletChar === '–')).toBe(true);
    // Inheriting styles keep the document's per-level bullets.
    const plain = deriveCalloutResolvedConfig(h.ctx.resolved, resolveAllConfig().calloutStyles[0]!);
    expect(plain.unorderedLists.levels.map((l) => l.bulletChar)).toEqual(
      h.ctx.resolved.unorderedLists.levels.map((l) => l.bulletChar),
    );
  });

  it('planCallouts maps every start marker to its end and attributes', () => {
    const blocks = parseMarkdown([
      'Intro.',
      '',
      ':::callout{type="tip" title="T"}',
      'Body.',
      ':::',
      '',
      ':::paragraphs{style="x"}',
      ':::callout',
      'Nested.',
      ':::',
      ':::',
    ].join('\n'));
    const plan = planCallouts(blocks);
    const starts = [...plan.keys()].sort((a, b) => a - b);
    expect(starts).toHaveLength(2);
    const first = plan.get(starts[0]!)!;
    expect(blocks[first.endIdx]!.type).toBe('containerEnd');
    expect(blocks[first.endIdx]!.containerId).toBe(first.containerId);
    expect(first.attrs).toEqual({ type: 'tip', title: 'T' });
    const second = plan.get(starts[1]!)!;
    expect(second.attrs).toEqual({});
    expect(blocks[second.endIdx]!.containerId).toBe(second.containerId);
  });
});
