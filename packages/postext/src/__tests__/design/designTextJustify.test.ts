import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter';
import { renderToHtml } from '../../html-backend';
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

const DPI = 72; // 1pt = 1px.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const container = { x: 0, y: 0, width: 300, height: 400 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [],
};

// 200px wide: 28 characters a line (196px).
const TEXT = 'Long before there were title pages there were readers who marked the scrolls by hand.';
const text = (extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text', id: 'lead', content: TEXT, fontSize: pt(10), overflow: 'wrap', align: 'justify',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200) } },
  ...extra,
} as DesignElement);

const layout = (el: DesignElement): ResolvedTextPrimitive[] =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders }, 0)
    .primitives as ResolvedTextPrimitive[];
const runsWidth = (runs: { width: number }[] | undefined) => (runs ?? []).reduce((s, r) => s + r.width, 0);

describe('justified design text (EF-109)', () => {
  it('fills every line but the last to the width of the box', () => {
    const [p] = layout(text());
    const lines = p!.lines;
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines.slice(0, -1)) {
      expect(line.wordSpacingPx).toBeGreaterThan(0);
      expect(runsWidth(line.runs)).toBeCloseTo(200, 5);
      expect(line.width).toBeCloseTo(200, 5);
      expect(line.runs!.map((r) => r.text).join('')).toBe(line.text);
    }
    const last = lines[lines.length - 1]!;
    expect(last.wordSpacingPx).toBeUndefined();
    expect(last.runs).toBeUndefined();
    expect(last.width).toBeLessThan(200);
  });

  it('breaks the lines where a flush-left text breaks them', () => {
    const justified = layout(text())[0]!.lines.map((l) => l.text);
    const left = layout(text({ align: 'left' }))[0]!.lines.map((l) => l.text);
    expect(justified).toEqual(left);
    expect(layout(text({ align: 'left' }))[0]!.lines.every((l) => l.runs === undefined && l.wordSpacingPx === undefined)).toBe(true);
  });

  it('sets the last line of every paragraph flush left', () => {
    const [p] = layout(text({ content: `${TEXT}\\n${TEXT}` }));
    const ends = p!.lines.filter((l) => l.wordSpacingPx === undefined);
    expect(ends).toHaveLength(2);
  });

  it('hyphenates a word to fill a line when hyphenation is on', () => {
    // "extraordinarily" does not fit after "Readers were so" (15 chars + space).
    const content = 'Readers were so extraordinarily patient with the scrolls that nobody complained.';
    const [plain] = layout(text({ content, hyphenate: false }));
    const [hyph] = layout(text({ content, hyphenate: true }));
    expect(plain!.lines[0]!.text).toBe('Readers were so');
    expect(hyph!.lines[0]!.text).toMatch(/^Readers were so extra\S*-$/);
    // The rest of the word opens the next line.
    const head = hyph!.lines[0]!.text.split(' ').pop()!.slice(0, -1);
    expect(hyph!.lines[1]!.text.startsWith('extraordinarily'.slice(head.length))).toBe(true);
    // Left-aligned text keeps its lines as they were.
    expect(layout(text({ content, hyphenate: true, align: 'left' }))[0]!.lines[0]!.text).toBe('Readers were so');
  });

  it('justifies text with inline marks run by run', () => {
    const [p] = layout(text({ content: TEXT.replace('title pages', '*title pages*'), inlineMarks: true }));
    const first = p!.lines[0]!;
    expect(first.runs!.some((r) => r.fontString.includes('italic'))).toBe(true);
    expect(runsWidth(first.runs)).toBeCloseTo(200, 5);
  });

  it('justifies the lines beside a drop cap to the room they have', () => {
    const [p] = layout(text({ dropCap: { lines: 2 } }));
    const first = p!.lines[0]!;
    expect(first.xOffset).toBeGreaterThan(0);
    expect(runsWidth(first.runs) + first.xOffset!).toBeCloseTo(200, 5);
  });

  it('paints the justified line to the right edge on canvas and with word-spacing in HTML', () => {
    const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [text()] }), container, 0, placeholders, DPI)!;
    const block = slot.blocks[0] as VDTDesignTextBlock;
    const calls: { text: string; x: number }[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (t: string, x: number) => { calls.push({ text: t, x }); };
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    renderHeaderFooterSlot(ctx, slot);
    const firstLine = block.lines[0]!;
    const lastWord = firstLine.text.split(' ').pop()!;
    const painted = calls.find((c) => c.text === lastWord)!;
    expect(painted.x + lastWord.length * 7).toBeCloseTo(block.bbox.x + 200, 5);

    const config: PostextConfig = {
      page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
      layout: { layoutType: 'single' },
      header: { elements: [text({ placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200) } } })] },
      footer: { elements: [] },
    };
    const html = renderToHtml(buildDocument({ markdown: 'Body.' }, config));
    expect(html).toMatch(/word-spacing:\d+(\.\d+)?px/);
  });
});
