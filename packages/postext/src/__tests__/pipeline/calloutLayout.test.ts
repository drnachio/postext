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
import type { VDTDesignBoxBlock, VDTDesignImageBlock, VDTDesignRuleBlock, VDTDesignTextBlock } from '../../vdt';

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

  it('fits a non-square resource icon inside the square box', () => {
    const tall: Resource = {
      id: 'tall',
      typeId: 'figure',
      kind: 'svg',
      createdAt: 0,
      updatedAt: 0,
      svg: { fileId: 'file-tall', width: 14, height: 28 },
    };
    const h = harness(withStyle({ icon: { kind: 'resource', resourceId: 'tall' } }), [tall]);
    const r = h.layout(SENTENCE.repeat(2).trim(), 800);
    const image = r.frame.designOverlay!.blocks.find((b) => b.kind === 'image') as VDTDesignImageBlock;
    const iconSize = BODY_PX * 1.5;
    expect(image.bbox.height).toBeCloseTo(iconSize, 5);
    expect(image.bbox.width).toBeCloseTo(iconSize / 2, 5);
    // Centred horizontally in its column, top-aligned (default align).
    expect(image.bbox.x).toBeCloseTo(PAD + iconSize / 4, 5);
    expect(image.bbox.y).toBeCloseTo(PAD, 5);
    // The column is still `size` wide.
    expect(r.frame.callout!.innerRect.x).toBeCloseTo(PAD + iconSize + GAP, 5);
    // An SVG with no declared size fills the square.
    const unsized: Resource = { ...tall, id: 'unsized', svg: { fileId: 'file-unsized' } };
    const u = harness(withStyle({ icon: { kind: 'resource', resourceId: 'unsized' } }), [unsized])
      .layout(SENTENCE.trim(), 800);
    const uImage = u.frame.designOverlay!.blocks.find((b) => b.kind === 'image') as VDTDesignImageBlock;
    expect(uImage.bbox.width).toBeCloseTo(iconSize, 5);
    expect(uImage.bbox.height).toBeCloseTo(iconSize, 5);
  });

  it('an icon taller than the content grows the box and centres the title on it', () => {
    // Badge: a single title line (TITLE_LH) with a 3em icon.
    const iconSize = BODY_PX * 3;
    const centred = harness(withStyle({
      width: 'auto',
      title: 'Badge',
      icon: { kind: 'glyph', glyph: '?', size: { value: 3, unit: 'em' }, align: 'center' },
    })).layout('', 800);
    expect(centred.totalHeight).toBeCloseTo(PAD + iconSize + PAD, 5);
    const blocks = centred.frame.designOverlay!.blocks;
    const glyph = blocks.find((b) => b.kind === 'text' && b.lines[0]!.text === '?') as VDTDesignTextBlock;
    const title = blocks[blocks.length - 1] as VDTDesignTextBlock;
    expect(glyph.bbox.y).toBeCloseTo(PAD, 5);
    expect(title.bbox.y).toBeCloseTo(PAD + (iconSize - TITLE_LH) / 2, 5);
    expect(title.lines[0]!.baselineY).toBeCloseTo(title.bbox.y + TITLE_LH * 0.8, 5);
    expect(centred.frame.callout!.innerRect.height).toBeCloseTo(iconSize, 5);
    // `align: 'top'` grows the box the same way but keeps the title at the top.
    const top = harness(withStyle({
      width: 'auto',
      title: 'Badge',
      icon: { kind: 'glyph', glyph: '?', size: { value: 3, unit: 'em' }, align: 'top' },
    })).layout('', 800);
    expect(top.totalHeight).toBeCloseTo(PAD + iconSize + PAD, 5);
    const topTitle = top.frame.designOverlay!.blocks[top.frame.designOverlay!.blocks.length - 1] as VDTDesignTextBlock;
    expect(topTitle.bbox.y).toBeCloseTo(PAD, 5);
    // Children move with the title.
    const withKids = harness(withStyle({
      title: 'Nota',
      icon: { kind: 'glyph', glyph: '?', size: { value: 6, unit: 'em' }, align: 'center' },
    })).layout(SENTENCE.trim(), 800);
    const contentH = TITLE_LH + GAP + withKids.children[0]!.bbox.height;
    const extra = BODY_PX * 6 - contentH;
    expect(extra).toBeGreaterThan(0);
    expect(withKids.children[0]!.bbox.y).toBeCloseTo(PAD + TITLE_LH + GAP + extra / 2, 5);
    expect(withKids.children[0]!.lines[0]!.baseline).toBeGreaterThan(withKids.children[0]!.bbox.y);
  });

  it('marker: icon and rule outside the box, frame as tall as the tallest part', () => {
    const hand: Resource = {
      id: 'hand',
      typeId: 'figure',
      kind: 'svg',
      createdAt: 0,
      updatedAt: 0,
      svg: { fileId: 'file-hand', width: 14, height: 25 },
    };
    const markerSize = BODY_PX * 4; // taller than the badge box
    const ruleW = 4;
    const ruleLen = BODY_PX * 5; // taller than both
    const markerGap = BODY_PX; // 1em
    const h = harness(withStyle({
      width: 'auto',
      title: 'Badge',
      marker: {
        kind: 'resource',
        resourceId: 'hand',
        size: { value: 4, unit: 'em' },
        gap: { value: 1, unit: 'em' },
        rule: { enabled: true, width: { value: ruleW, unit: 'px' }, length: { value: 5, unit: 'em' }, color: { hex: '#004988', model: 'hex' } },
      },
    }), [hand]);
    const r = h.layout('', 800);
    const boxW = PAD + 'Badge'.length * 7 + PAD;
    const boxH = PAD + TITLE_LH + PAD;
    const column = markerSize + ruleW + markerGap;
    expect(r.width).toBeCloseTo(column + boxW, 5);
    expect(r.totalHeight).toBeCloseTo(ruleLen, 5);
    const blocks = r.frame.designOverlay!.blocks;
    // Marker image first (aspect-fitted in its square, centred vertically on the frame).
    const image = blocks[0] as VDTDesignImageBlock;
    expect(image.kind).toBe('image');
    expect(image.fileId).toBe('file-hand');
    expect(image.bbox.height).toBeCloseTo(markerSize, 5);
    expect(image.bbox.width).toBeCloseTo(markerSize * 14 / 25, 5);
    expect(image.bbox.x).toBeCloseTo((markerSize - image.bbox.width) / 2, 5);
    expect(image.bbox.y).toBeCloseTo((ruleLen - markerSize) / 2, 5);
    // Then the vertical rule, right after the marker square.
    const rule = blocks[1] as VDTDesignRuleBlock;
    expect(rule.kind).toBe('rule');
    expect(rule.direction).toBe('vertical');
    expect(rule.color).toBe('#004988');
    expect(rule.thicknessPx).toBe(ruleW);
    expect(rule.bbox.x).toBeCloseTo(markerSize, 5);
    expect(rule.bbox.y).toBe(0);
    expect(rule.bbox.width).toBe(ruleW);
    expect(rule.bbox.height).toBeCloseTo(ruleLen, 5);
    // The box background sits after the column, centred on the frame.
    const bg = blocks[2] as VDTDesignBoxBlock;
    expect(bg.kind).toBe('box');
    expect(bg.bbox.x).toBeCloseTo(column, 5);
    expect(bg.bbox.y).toBeCloseTo((ruleLen - boxH) / 2, 5);
    expect(bg.bbox.width).toBeCloseTo(boxW, 5);
    expect(bg.bbox.height).toBeCloseTo(boxH, 5);
    const title = blocks[blocks.length - 1] as VDTDesignTextBlock;
    expect(title.bbox.x).toBeCloseTo(column + PAD, 5);
    expect(title.lines[0]!.baselineY).toBeCloseTo(bg.bbox.y + PAD + TITLE_LH * 0.8, 5);
    expect(r.frame.callout!.innerRect.x).toBeCloseTo(column + PAD, 5);
    expect(r.frame.callout!.innerRect.y).toBeCloseTo(bg.bbox.y + PAD, 5);
    expect(r.frame.callout!.markerFileId).toBe('file-hand');
    expect(r.frame.callout!.iconFileId).toBeUndefined();
    // Absolute placement moves marker, rule and box together.
    offsetCalloutToAbsolute(r, 50, 70);
    expect((r.frame.designOverlay!.blocks[0] as VDTDesignImageBlock).bbox.y).toBeCloseTo(70 + (ruleLen - markerSize) / 2, 5);
    expect((r.frame.designOverlay!.blocks[1] as VDTDesignRuleBlock).bbox.x).toBeCloseTo(50 + markerSize, 5);
  });

  it('marker: a fill-width box narrows by the column; a glyph marker with no rule; top alignment', () => {
    const h = harness(withStyle({
      marker: { kind: 'glyph', glyph: '→', size: { value: 2, unit: 'em' }, align: 'top' },
    }));
    const r = h.layout(SENTENCE.repeat(3).trim(), 800);
    const column = BODY_PX * 2 + GAP; // no rule: size + gap (0.5em default)
    expect(r.width).toBe(800);
    const blocks = r.frame.designOverlay!.blocks;
    const glyph = blocks[0] as VDTDesignTextBlock;
    expect(glyph.kind).toBe('text');
    expect(glyph.lines[0]!.text).toBe('→');
    expect(glyph.bbox.y).toBe(0);
    expect(blocks.some((b) => b.kind === 'rule')).toBe(false);
    const bg = blocks[1] as VDTDesignBoxBlock;
    expect(bg.bbox.x).toBeCloseTo(column, 5);
    expect(bg.bbox.y).toBe(0);
    expect(bg.bbox.width).toBeCloseTo(800 - column, 5);
    // The box is taller than the marker: the frame is the box height.
    expect(r.totalHeight).toBeCloseTo(bg.bbox.height, 5);
    expect(r.children[0]!.bbox.x).toBeCloseTo(column + PAD, 5);
    expect(r.children[0]!.bbox.width).toBeCloseTo(800 - column - 2 * PAD, 5);
    // Lines follow (the first one carries the body's first-line indent).
    expect(r.children[0]!.lines[0]!.bbox.x).toBeGreaterThanOrEqual(column + PAD - 1e-6);
    expect(r.children[0]!.lines[1]!.bbox.x).toBeCloseTo(column + PAD, 5);
    // A rule with no explicit length spans exactly the box.
    const ruled = harness(withStyle({
      marker: { kind: 'glyph', glyph: '→', rule: { enabled: true } },
    })).layout(SENTENCE.trim(), 800);
    const rule = ruled.frame.designOverlay!.blocks[1] as VDTDesignRuleBlock;
    expect(rule.kind).toBe('rule');
    expect(rule.bbox.height).toBeCloseTo(ruled.totalHeight, 5);
    expect(rule.bbox.y).toBe(0);
    expect(rule.thicknessPx).toBeCloseTo((0.5 * 300) / 72, 5);
    // A missing marker resource draws nothing but still reserves the column.
    const missing = harness(withStyle({ marker: { kind: 'resource', resourceId: 'nope' } })).layout(SENTENCE.trim(), 800);
    expect(missing.frame.designOverlay!.blocks[0]!.kind).toBe('box');
    expect((missing.frame.designOverlay!.blocks[0] as VDTDesignBoxBlock).bbox.x).toBeCloseTo(BODY_PX * 1.5 + GAP, 5);
    expect(missing.frame.callout!.markerFileId).toBeUndefined();
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
