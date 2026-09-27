import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter';
import { renderToHtml } from '../../html-backend';
import type { CalloutStyleConfig, PostextConfig } from '../../types';
import type { VDTBlock, VDTDesignBoxBlock, VDTDocument } from '../../vdt';

// EF-99: a callout's stripe follows the frame's rounding — it is clipped to
// the rounded rectangle of the background and border, as CSS clips a
// `border-left` to `border-radius` — on canvas, in HTML and in the PDF.

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const STRIPE = '#2d5a8a';

const config = (extra: Partial<CalloutStyleConfig> = {}): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  layout: { layoutType: 'single' },
  calloutStyles: [{
    id: 'note',
    background: hex('#eef2f7'),
    borderRadius: mm(3),
    stripe: { enabled: true, side: 'left', width: mm(3), color: hex(STRIPE) },
    ...extra,
  }],
});

const frameOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const boxes = (frame: VDTBlock) => frame.designOverlay!.blocks.filter((b): b is VDTDesignBoxBlock => b.kind === 'box');
const stripeOf = (frame: VDTBlock) => boxes(frame).find((b) => b.box.backgroundColor === STRIPE)!;
const backgroundOf = (frame: VDTBlock) => boxes(frame).find((b) => b.box.backgroundColor === '#eef2f7')!;

describe('EF-99: a callout stripe follows borderRadius', () => {
  it('clips the side stripe to the frame\'s rounded rectangle', () => {
    const frame = frameOf(buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, config()));
    const bg = backgroundOf(frame);
    const stripe = stripeOf(frame);
    expect(bg.box.borderRadiusPx).toBeGreaterThan(0);
    expect(stripe.clip).toBeDefined();
    const r = bg.box.borderRadiusPx;
    // The clip is the frame (absolute coordinates, like the stripe itself).
    expect(stripe.clip).toEqual({ x: bg.bbox.x, y: bg.bbox.y, width: bg.bbox.width, height: bg.bbox.height, radii: [r, r, r, r] });
    // The stripe keeps its own geometry: its left edge is the frame's.
    expect(stripe.bbox.x).toBeCloseTo(bg.bbox.x, 5);
  });

  it('clips a top stripe too, and clamps the radius to half the frame', () => {
    const doc = buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, config({
      borderRadius: mm(200),
      stripe: { enabled: true, side: 'top', width: mm(3), color: hex(STRIPE) },
    }));
    const frame = frameOf(doc);
    const bg = backgroundOf(frame);
    const clip = stripeOf(frame).clip!;
    const half = Math.min(bg.bbox.width, bg.bbox.height) / 2;
    expect(clip.radii).toEqual([half, half, half, half]);
  });

  it('leaves a square frame\'s stripe unclipped (unchanged output)', () => {
    const doc = buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, config({ borderRadius: mm(0) }));
    expect(stripeOf(frameOf(doc)).clip).toBeUndefined();
  });

  it('canvas: clips to the rounded frame before painting the stripe', () => {
    const frame = frameOf(buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, config()));
    const stripe = stripeOf(frame);
    const log: string[] = [];
    const state = { fillStyle: '' };
    const ctx = {
      ...state,
      save() { log.push('save'); },
      restore() { log.push('restore'); },
      beginPath() { log.push('beginPath'); },
      moveTo() { log.push('moveTo'); },
      lineTo() {},
      arcTo() { log.push('arcTo'); },
      bezierCurveTo() { log.push('curve'); },
      quadraticCurveTo() { log.push('curve'); },
      closePath() {},
      rect() { log.push('rect'); },
      clip() { log.push('clip'); },
      fill() { log.push(`fill ${this.fillStyle}`); },
      fillRect() { log.push(`fillRect ${this.fillStyle}`); },
      stroke() {},
      strokeRect() {},
    };
    renderHeaderFooterSlot(ctx as unknown as CanvasRenderingContext2D, { bbox: frame.designOverlay!.bbox, blocks: [stripe] });
    const clipAt = log.indexOf('clip');
    const paintAt = log.findIndex((l) => l === `fillRect ${STRIPE}` || l === `fill ${STRIPE}`);
    expect(clipAt).toBeGreaterThan(-1);
    expect(paintAt).toBeGreaterThan(clipAt);
    // The clip path is rounded.
    expect(log.slice(0, clipAt).some((l) => l === 'arcTo' || l === 'curve')).toBe(true);
    // The clip does not outlive the stripe.
    expect(log.lastIndexOf('restore')).toBeGreaterThan(paintAt);
  });

  it('html: nests the stripe in a rounded, clipping box the size of the frame', () => {
    const doc = buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, config());
    const frame = frameOf(doc);
    const bg = backgroundOf(frame);
    const r = bg.box.borderRadiusPx;
    const html = renderToHtml(doc);
    const at = html.indexOf(`background:${STRIPE}`);
    expect(at).toBeGreaterThan(-1);
    // stripe div ← page-coordinate layer ← clipping wrapper on the frame.
    const stripeStart = html.lastIndexOf('<div', at);
    const layerStart = html.lastIndexOf('<div', stripeStart - 1);
    const wrapperStart = html.lastIndexOf('<div', layerStart - 1);
    const wrapper = html.slice(wrapperStart, layerStart);
    expect(wrapper).toContain('overflow:hidden');
    expect(wrapper).toContain(`border-radius:${r}px ${r}px ${r}px ${r}px`);
    expect(wrapper).toContain(`left:${bg.bbox.x}px;top:${bg.bbox.y}px;width:${bg.bbox.width}px;height:${bg.bbox.height}px`);
    // The stripe keeps its page coordinates inside the shifted layer.
    expect(html.slice(layerStart, stripeStart)).toContain(`left:${-bg.bbox.x}px`);
    expect(html.slice(stripeStart, at)).toContain(`left:${stripeOf(frame).bbox.x}px`);
  });

  it('html: a square frame\'s stripe is not wrapped', () => {
    const doc = buildDocument({ markdown: ':::callout{type="note"}\nSome text.\n:::' }, config({ borderRadius: mm(0) }));
    const html = renderToHtml(doc);
    const at = html.indexOf(`background:${STRIPE}`);
    const stripeStart = html.lastIndexOf('<div', at);
    const before = html.slice(html.lastIndexOf('<div', stripeStart - 1), stripeStart);
    expect(before).not.toContain('overflow:hidden');
  });
});
