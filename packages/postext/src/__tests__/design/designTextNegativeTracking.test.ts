import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter';
import { renderToHtmlIndexed } from '../../html-backend';
import { buildDocument } from '../../pipeline';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, DesignTextElement, PostextConfig } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character is 7px wide whatever the font, so widths read as char counts.
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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const container = { x: 0, y: 0, width: 300, height: 200 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header',
  page: stubPage,
  allPages: [stubPage],
  metadata: {},
  chapterTitleByPageIndex: [],
};

const text = (content: string, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text',
  id: 't',
  content,
  fontSize: pt(36),
  overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } },
  ...extra,
} as DesignElement);

const layoutOne = (el: DesignElement): ResolvedTextPrimitive =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders }, 0).primitives[0] as ResolvedTextPrimitive;

describe('negative tracking in design text (EF-82)', () => {
  it('a negative letterSpacing tightens the text: its measured width shrinks by the tracking', () => {
    const plain = layoutOne(text('Title'));
    const tight = layoutOne(text('Title', { letterSpacing: pt(-0.3) }));
    expect(tight.letterSpacingPx).toBeCloseTo(-0.3, 5);
    // Five glyphs, 0.3px each.
    expect(tight.lines[0]!.width).toBeCloseTo(plain.lines[0]!.width - 5 * 0.3, 5);
    // An auto-width box follows the tightened text.
    expect(tight.width).toBeLessThan(plain.width);
  });

  it('an em tracking is relative to the element size, negative too', () => {
    const tight = layoutOne(text('Title', { letterSpacing: { value: -0.02, unit: 'em' } }));
    expect(tight.letterSpacingPx).toBeCloseTo(-0.72, 5);
  });

  it('the VDT block carries the negative tracking the renderers paint', () => {
    const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [text('Title', { letterSpacing: pt(-0.3) })] }), container, 0, placeholders, DPI);
    const block = slot!.blocks[0] as VDTDesignTextBlock;
    expect(block.letterSpacingPx).toBeCloseTo(-0.3, 5);
  });

  it('no tracking (or zero) leaves the block untracked', () => {
    const none = layoutSlotToVdt(resolveDesignSlot({ elements: [text('Title')] }), container, 0, placeholders, DPI);
    const zero = layoutSlotToVdt(resolveDesignSlot({ elements: [text('Title', { letterSpacing: pt(0) })] }), container, 0, placeholders, DPI);
    expect((none!.blocks[0] as VDTDesignTextBlock).letterSpacingPx).toBeUndefined();
    expect((zero!.blocks[0] as VDTDesignTextBlock).letterSpacingPx).toBeUndefined();
  });

  it('canvas paints the negative tracking and resets it', () => {
    const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [text('Title', { letterSpacing: pt(-0.3) })] }), container, 0, placeholders, DPI)!;
    const seen: string[] = [];
    const ctx = {
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic',
      _ls: '0px',
      get letterSpacing() { return this._ls; },
      set letterSpacing(v: string) { this._ls = v; seen.push(v); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      fillText() { seen.push(`fill@${this._ls}`); },
      strokeText() {},
    };
    renderHeaderFooterSlot(ctx as unknown as CanvasRenderingContext2D, slot);
    expect(seen).toEqual(['-0.3px', 'fill@-0.3px', '0px']);
  });

  it('HTML sets the negative letter-spacing on the element', () => {
    const config: PostextConfig = {
      page: { dpi: DPI, width: pt(300), height: pt(300), margins: { top: pt(40), bottom: pt(20), left: pt(20), right: pt(20) } },
      header: { elements: [text('Running head', { fontSize: pt(10), letterSpacing: pt(-0.4) }) as DesignTextElement] },
      footer: { elements: [] },
    };
    const doc = buildDocument({ markdown: 'Body text.' }, config);
    const header = doc.pages[0]!.header!.blocks[0] as VDTDesignTextBlock;
    expect(header.letterSpacingPx).toBeCloseTo(-0.4, 5);
    const { html } = renderToHtmlIndexed(doc);
    expect(html).toContain('letter-spacing:-0.4px;');
  });
});
