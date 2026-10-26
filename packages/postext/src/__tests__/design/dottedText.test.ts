import { describe, it, expect, vi, afterEach } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout.js';
import { resolveDesignSlot } from '../../defaults/structure/headerFooter.js';
import { layoutSlotToVdt } from '../../pipeline/pages/headerFooter.js';
import { resolveChipBox } from '../../pipeline/text/chips.js';
import { resolveChipStylesConfig, stripChipStylesDefaults } from '../../defaults/text/chipStyles.js';
import { dotsOnRaster, resolveTextDots, textDots, traceContours } from '../../paint/textDots.js';
import { renderTextBlock } from '../../canvas-backend/headerFooter.js';
import { beginMirroredFlow } from '../../canvas-backend/mirrorFrame.js';
import type { DesignPlaceholderContext } from '../../design/placeholders.js';
import type { DesignElement, DesignTextElement } from '../../types.js';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt.js';

// Every character 7px wide whatever the font (no DOM in the node test
// env); the stub context cannot be read back, so no dots are drawn from it.
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

const DPI = 72; // 1pt = 1px
const pt = (value: number) => ({ value, unit: 'pt' as const });
const container = { x: 0, y: 0, width: 300, height: 200 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };

const text = (content: string, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text',
  id: 't',
  content,
  fontSize: pt(10),
  overflow: 'clip',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } },
  ...extra,
} as DesignElement);

const layoutOne = (el: DesignElement): ResolvedTextPrimitive =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders }, 0).primitives[0] as ResolvedTextPrimitive;
const blockOf = (el: DesignElement): VDTDesignTextBlock =>
  layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), container, 0, placeholders, DPI)!.blocks[0] as VDTDesignTextBlock;

// The painters' dots, when a test sets them (`fake`); else the module's own.
const fake = vi.hoisted(() => ({ dots: undefined as undefined | (() => { points: Float32Array; width: number } | null) }));
vi.mock('../../paint/textDots.js', async (original) => {
  const actual = await original<typeof import('../../paint/textDots.js')>();
  return { ...actual, textDots: (req: Parameters<typeof actual.textDots>[0]) => (fake.dots ? fake.dots() : actual.textDots(req)) };
});

afterEach(() => {
  fake.dots = undefined;
});

describe('dotted text (#1017): settings', () => {
  it('resolves the spacing and the dot size in px, 0.1em and 0.05em by default', () => {
    expect(resolveTextDots({}, DPI, 20)).toEqual({ spacingPx: 2, sizePx: 1 });
    expect(resolveTextDots({ spacing: pt(3), size: pt(1.5) }, DPI, 20)).toEqual({ spacingPx: 3, sizePx: 1.5 });
    // A spacing under the dot is the dot.
    expect(resolveTextDots({ spacing: pt(0.5), size: pt(2) }, DPI, 20)).toEqual({ spacingPx: 2, sizePx: 2 });
  });

  it('a design text carries its dots to the VDT block, its layout unchanged', () => {
    const plain = layoutOne(text('gato'));
    const dotted = layoutOne(text('gato', { dotted: { size: pt(0.8) } }));
    expect(dotted.dotted).toEqual({ spacingPx: 1, sizePx: 0.8 });
    expect(dotted.width).toBe(plain.width);
    expect(blockOf(text('gato', { dotted: {} })).dotted).toEqual({ spacingPx: 1, sizePx: 0.5 });
    expect(blockOf(text('gato')).dotted).toBeUndefined();
  });

  it('a vertical text is filled', () => {
    expect(layoutOne(text('gato', { dotted: {}, writingMode: 'vertical-rl' })).dotted).toBeUndefined();
  });

  it('a chip style resolves its dots against the chip text and keeps them through stripping', () => {
    const [style] = resolveChipStylesConfig([{ id: 'dots', fontSize: { value: 2, unit: 'em' }, dotted: { spacing: { value: 0.2, unit: 'em' } } }]);
    const box = resolveChipBox(style!, DPI, 10);
    expect(box.dotted).toEqual({ spacingPx: 4, sizePx: 1 });
    expect(stripChipStylesDefaults([{ id: 'dots', dotted: {} }])).toEqual([{ id: 'dots', dotted: {} }]);
    expect(resolveChipBox(resolveChipStylesConfig([{ id: 'plain' }])[0]!, DPI, 10).dotted).toBeUndefined();
  });
});

describe('repeat (#1017)', () => {
  // `gato` is 28px; the room is 300px.
  it('sets as many whole copies as fit, a gap apart, as one line', () => {
    const p = layoutOne(text('gato', { repeat: { gap: pt(10) } }));
    // 28 + 7 × (10 + 28) = 294 ≤ 300; one more would be 332.
    expect(p.lines).toHaveLength(1);
    const line = p.lines[0]!;
    expect(line.width).toBe(294);
    expect(line.runs!.map((r) => r.text).join('')).toBe(Array(8).fill('gato').join(' '));
    expect(line.runs!.filter((r) => r.text === ' ').every((r) => r.width === 10)).toBe(true);
    expect(p.width).toBe(294);
  });

  it('stops at count, and the gap defaults to 1em', () => {
    const p = layoutOne(text('gato', { repeat: { count: 3 } }));
    expect(p.lines[0]!.width).toBe(3 * 28 + 2 * 10);
  });

  it('a text that does not fit twice, or that wraps, is set once', () => {
    expect(layoutOne(text('a'.repeat(30), { repeat: {} })).lines[0]!.runs).toBeUndefined();
    const wrapped = layoutOne(text('uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece', { overflow: 'wrap', repeat: {} }));
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.lines.every((l) => !l.runs || !l.runs.some((r) => r.text === ' ' && r.width === 10))).toBe(true);
  });

  it('a right-to-left text puts its first copy on the right', () => {
    const p = layoutOne(text('abc', { direction: 'rtl', repeat: { count: 3 } }));
    const line = p.lines[0]!;
    expect(line.runs).toHaveLength(5);
    // Copy k at 2k, the gap after it at 2k + 1: copies 2, 1, 0 from the
    // left, the gaps between them.
    expect(line.order).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('dots along strokes (#1017)', () => {
  const raster = (W: number, H: number, ink: (x: number, y: number) => boolean): Float32Array => {
    const a = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = ink(x, y) ? 1 : 0;
    return a;
  };

  it('traces one closed edge around a square, the ink on its right', () => {
    const loops = traceContours(raster(10, 10, (x, y) => x >= 3 && x < 7 && y >= 3 && y < 7), 10, 10, 0.5);
    expect(loops).toHaveLength(1);
    const xs = loops[0]!.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(2.5, 5);
    expect(Math.max(...xs)).toBeCloseTo(6.5, 5);
  });

  it('lays one row of dots along the middle of a bar, a spacing apart', () => {
    // A bar 4px thick from x = 20 to 140, rows 30–33: its middle at 31.5.
    const a = raster(160, 64, (x, y) => x >= 20 && x < 140 && y >= 30 && y < 34);
    const dots = dotsOnRaster(a, 160, 64, 12);
    const ys = dots.filter((_, i) => i % 2 === 1);
    const xs = dots.filter((_, i) => i % 2 === 0).sort((p, q) => p - q);
    expect(ys.every((y) => Math.abs(y - 31.5) <= 1)).toBe(true);
    // ~120 / 12 dots, never two closer than 0.8 spacing.
    expect(xs.length).toBeGreaterThanOrEqual(9);
    expect(xs.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(0.8 * 12 - 1e-6);
  });

  it('a mark too small for a row is one dot at its middle; the eye of a loop is none', () => {
    const blob = raster(40, 40, (x, y) => (x - 20) ** 2 + (y - 20) ** 2 <= 9);
    const dots = dotsOnRaster(blob, 40, 40, 12);
    expect(dots).toHaveLength(2);
    expect(dots[0]).toBeCloseTo(20, 0);
    expect(dots[1]).toBeCloseTo(20, 0);
    // A thin ring: one row on the ring, nothing in its hole.
    const ring = raster(80, 80, (x, y) => {
      const r = Math.hypot(x - 40, y - 40);
      return r >= 18 && r <= 21;
    });
    const ringDots = dotsOnRaster(ring, 80, 80, 12);
    for (let i = 0; i < ringDots.length; i += 2) {
      expect(Math.hypot(ringDots[i]! - 40, ringDots[i + 1]! - 40)).toBeGreaterThan(17);
    }
  });

  it('draws nothing without a canvas to read the letters from', () => {
    expect(textDots({ text: 'gato', font: '10px serif', spacingPx: 1 })).toBeNull();
    expect(textDots({ text: '  ', font: '10px serif', spacingPx: 1 })).toEqual({ points: new Float32Array(0), width: 0 });
  });
});

describe('painting dotted text on the canvas (#1017)', () => {
  const recorder = () => {
    const calls: string[] = [];
    const ctx = {
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic', textAlign: 'start', direction: 'ltr', letterSpacing: '0px',
      save() {}, restore() {}, beginPath() { calls.push('begin'); }, rect() {}, clip() {},
      translate(x: number) { calls.push(`translate ${x}`); }, scale(x: number) { calls.push(`scale ${x}`); },
      transform() { calls.push('transform'); },
      moveTo() {}, arc(x: number, y: number, r: number) { calls.push(`arc ${x} ${y} ${r}`); }, fill() { calls.push('fill'); },
      fillText(t: string) { calls.push(`text ${t}`); }, strokeText(t: string) { calls.push(`stroke ${t}`); },
      measureText(t: string) { return { width: t.length * 7 }; },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  const block = (): VDTDesignTextBlock => ({
    kind: 'text',
    bbox: { x: 10, y: 0, width: 100, height: 20 },
    fontString: '10px serif',
    color: '#123456',
    lines: [{ text: 'ab', xOffset: 5, baselineY: 16, width: 14 }],
    clip: false,
    dotted: { spacingPx: 1, sizePx: 0.6 },
    stroke: { widthPx: 1, color: '#000' },
  });

  it('paints the dots of each run where its glyphs go, and no glyphs, no outline', () => {
    fake.dots = () => ({ points: new Float32Array([1, -2, 3, -4]), width: 14 });
    const { ctx, calls } = recorder();
    renderTextBlock(ctx, block());
    expect(calls.filter((c) => c.startsWith('arc'))).toEqual(['arc 16 14 0.3', 'arc 18 12 0.3']);
    expect(calls.some((c) => c.startsWith('text') || c.startsWith('stroke'))).toBe(false);
  });

  it('turns the dots back about the run on a mirrored page', () => {
    fake.dots = () => ({ points: new Float32Array([1, -2]), width: 14 });
    const { ctx, calls } = recorder();
    const end = beginMirroredFlow(ctx, 200);
    renderTextBlock(ctx, block());
    end();
    // Flipped about [15, 29]: translate by 2 · 15 + 14, scale −1.
    expect(calls).toContain('translate 44');
    expect(calls).toContain('scale -1');
  });

  it('fills the letters where no dots can be drawn', () => {
    fake.dots = () => null;
    const { ctx, calls } = recorder();
    renderTextBlock(ctx, block());
    expect(calls.some((c) => c.startsWith('text ab'))).toBe(true);
  });
});
