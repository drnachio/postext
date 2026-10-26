import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtml } from '../../html-backend.js';
import { renderTextBlock } from '../../canvas-backend/headerFooter.js';
import type { DesignElement, PostextConfig } from '../../types.js';
import type { VDTChip, VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from '../../vdt.js';
import { CHIP_PLACEHOLDER } from '../../parse/inlineFormatting.js';
import { defaultOpenerTitle } from '../../pipeline/pages/headerFooter.js';
import { RichMeasurer, parseRichDesignText } from '../../design/richText.js';
import { resolveChipStylesConfig } from '../../defaults/chipStyles.js';

// #1162: a heading's chip printed by the opener or design that draws the
// heading's title.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: s.length * (m ? Number(m[1]) : 16) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const MARK = { id: 'mark', background: { hex: '#cc3300', model: 'hex' as const }, paddingX: pt(2) };
const titleElement = (inlineMarks: boolean): DesignElement => ({
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(18), inlineMarks,
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: 'auto' } },
} as DesignElement);
const config = (level: Record<string, unknown> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' }, ...level }] } as PostextConfig['headings'],
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', hyphenation: { enabled: false } },
  chipStyles: [MARK],
});
const designed = (inlineMarks: boolean): PostextConfig => config({ advancedDesign: { enabled: true, slot: { elements: [titleElement(inlineMarks)] } } });
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());

const textBlocks = (slot: VDTDesignSlot | undefined): VDTDesignTextBlock[] =>
  (slot?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text');
const openerBlocks = (doc: VDTDocument): VDTDesignTextBlock[] => doc.pages.flatMap((p) => textBlocks(p.openerBand));
const chipRuns = (blocks: VDTDesignTextBlock[]) => blocks.flatMap((b) => b.lines.flatMap((l) => l.runs ?? [])).filter((r) => r.chip);

const chip = (text: string, styleId = 'mark', bold = false): VDTChip => ({
  styleId, runs: [{ text, fontString: '16px serif', width: 10, ...(bold ? { bold: true } : {}) }],
  marginLeft: 0, marginRight: 0, boxWidth: 14, ascent: 13, descent: 4, paddingX: 2, borderWidth: 0, borderRadius: 0, background: '#cc3300',
});

describe('a heading chip in a design-drawn opener (#1162)', () => {
  it('writes the chip into the marked title and leaves it out of the plain one', () => {
    const lines = [{ text: `${CHIP_PLACEHOLDER} Title`, segments: [{ text: CHIP_PLACEHOLDER, chip: chip('///') }, { text: ' ' }, { text: 'Title' }] }];
    expect(defaultOpenerTitle(lines as never, '', undefined, 7)).toEqual({ titleText: 'Title', marked: ':chip[///]{style="mark"} Title', chips: true });
    // The chip's own runs keep their marks; brackets are escaped.
    const marked = [{ text: `A ${CHIP_PLACEHOLDER} *b*`, segments: [{ text: 'A' }, { text: ' ' }, { text: CHIP_PLACEHOLDER, chip: chip('x]', 'mark', true) }, { text: ' ' }, { text: 'b', italic: true }] }];
    expect(defaultOpenerTitle(marked as never, '', undefined, 5)).toEqual({ titleText: 'A b', marked: 'A :chip[**x\\]**]{style="mark"} *b*', chips: true });
  });

  it('reads a chip set alone on the first line of a heading', () => {
    const lines = [
      { text: CHIP_PLACEHOLDER, segments: [{ text: CHIP_PLACEHOLDER, chip: chip('///') }] },
      { text: 'Title', segments: [{ text: 'Title' }] },
    ];
    expect(defaultOpenerTitle(lines as never, '', undefined, 7)).toEqual({ titleText: 'Title', marked: ':chip[///]{style="mark"} Title', chips: true });
  });

  it('keeps the title without a chip as it was', () => {
    const lines = [{ text: 'Title', segments: [{ text: 'Title' }] }];
    expect(defaultOpenerTitle(lines as never, '', undefined, 5)).toEqual({ titleText: 'Title' });
    // A chip segment without its box gives the plain title.
    const bare = [{ text: `${CHIP_PLACEHOLDER} Title`, segments: [{ text: CHIP_PLACEHOLDER }, { text: ' ' }, { text: 'Title' }] }];
    expect(defaultOpenerTitle(bare as never, '', undefined, 7)).toEqual({ titleText: 'Title' });
  });

  it('measures a chip in design text with the chip styles, and reads it as text without them', () => {
    const spec = { family: 'serif', sizePx: 20, weight: 400, italic: false };
    const styles = resolveChipStylesConfig([MARK]);
    const rt = parseRichDesignText(':chip[///]{style="mark"} Title', spec, { styles, dpi: 72, letterSpacingPx: 0 });
    expect(rt.text).toBe(`${CHIP_PLACEHOLDER} Title`);
    const style = rt.styles[rt.styleAt[0]!]!;
    expect(style.chip?.styleId).toBe('mark');
    expect(style.chip?.background).toBe('#cc3300');
    // Three slashes at 10 px each, the 2 pt padding either side.
    expect(style.chipWidth).toBeCloseTo(30 + 4 + style.chip!.borderWidth * 2, 5);
    expect(parseRichDesignText(':chip[///]{style="mark"} Title', spec).text).toBe(':chip[///]{style="mark"} Title');
  });

  it('paints the chip in a designed opener that reads inline marks', () => {
    const doc = build('# :chip[///]{style=mark} Title\n\nText.', designed(true));
    const blocks = openerBlocks(doc);
    expect(blocks).toHaveLength(1);
    const runs = chipRuns(blocks);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.chip!.runs.map((r) => r.text).join('')).toBe('///');
    expect(runs[0]!.width).toBeGreaterThan(0);
    expect(blocks[0]!.lines[0]!.text).toBe(`${CHIP_PLACEHOLDER} Title`);
  });

  it('prints the plain title in a design text that does not read inline marks', () => {
    const doc = build('# :chip[///]{style=mark} Title\n\nText.', designed(false));
    const blocks = openerBlocks(doc);
    expect(blocks.map((b) => b.lines.map((l) => l.text).join(''))).toEqual(['Title']);
    expect(chipRuns(blocks)).toHaveLength(0);
  });

  it('paints the chip in the default opener, and the running heads keep the plain title', () => {
    const run = { kind: 'text', id: 'run', content: '{chapterTitle}', fontSize: pt(9), placement: { anchor: { to: 'container', edge: 'top-left' } } };
    const cfg = { ...config(), header: { elements: [run] } } as PostextConfig;
    const doc = build('# :chip[///]{style=mark} Title\n\nText.\n\nMore text.', cfg);
    expect(chipRuns(openerBlocks(doc))).toHaveLength(1);
    const heads = doc.pages.flatMap((p) => textBlocks(p.header)).flatMap((b) => b.lines.map((l) => l.text)).filter((t) => t);
    expect(heads.join('')).not.toContain(CHIP_PLACEHOLDER);
  });

  it('lays out a design without chips as before', () => {
    const md = '# **Bold** title\n\nText.';
    const a = build(md, designed(true));
    const b = build(md, { ...designed(true), chipStyles: [] });
    expect(openerBlocks(a)).toEqual(openerBlocks(b));
    expect(chipRuns(openerBlocks(a))).toHaveLength(0);
  });

  it('paints the chip box and words on canvas', () => {
    const doc = build('# :chip[///]{style=mark} Title\n\nText.', designed(true));
    const block = openerBlocks(doc)[0]!;
    const fills: string[] = [];
    const texts: string[] = [];
    const ctx = new Proxy({ fillStyle: '', font: '', letterSpacing: '0px' } as Record<string, unknown>, {
      get(target, key) {
        if (key in target) return target[key as string];
        if (key === 'fill') return () => fills.push(String(target.fillStyle));
        if (key === 'fillText') return (t: string) => texts.push(t);
        if (key === 'measureText') return (t: string) => ({ width: t.length * 5 });
        return () => undefined;
      },
      set(target, key, value) {
        target[key as string] = value;
        return true;
      },
    });
    renderTextBlock(ctx as unknown as CanvasRenderingContext2D, block);
    expect(fills).toContain('#cc3300');
    expect(texts.join('')).toContain('///');
    expect(texts.join('')).not.toContain(CHIP_PLACEHOLDER);
  });

  it('paints the chip box and words in the HTML', () => {
    const doc = build('# :chip[///]{style=mark} Title\n\nText.', designed(true));
    const html = renderToHtml(doc);
    expect(html).toContain('background:#cc3300');
    expect(html).toContain('///');
    expect(html).not.toContain(CHIP_PLACEHOLDER);
    expect(html).not.toContain(':chip[');
  });
  it('keeps the chip style gap across a space, and drops it at a line edge', () => {
    const spec = { family: 'serif', sizePx: 20, weight: 400, italic: false };
    // A 16 px gap against a 10 px space: 6 px of margin inside the chip.
    const styles = resolveChipStylesConfig([{ ...MARK, gap: { value: 16, unit: 'px' } }]);
    const rt = parseRichDesignText(':chip[ab]{style="mark"} Title', spec, { styles, dpi: 72, letterSpacingPx: 0 });
    const style = rt.styles[rt.styleAt[0]!]!;
    expect(style.chip!.marginLeft).toBe(0);
    expect(style.chip!.marginRight).toBeCloseTo(6, 5);
    expect(style.chipWidth).toBeCloseTo(style.chip!.boxWidth + 6, 5);
    const m = new RichMeasurer(rt, 0);
    // With the title on the line, the margin stays; closing the line, it goes.
    const whole = m.rangeLine(0, rt.text.length);
    expect(whole.runs[0]!.chip!.marginRight).toBeCloseTo(6, 5);
    const alone = m.rangeLine(0, 1);
    expect(alone.runs[0]!.chip!.marginRight).toBe(0);
    expect(alone.width).toBeCloseTo(style.chip!.boxWidth, 5);
    // Two chips across a space share the shortfall.
    const two = parseRichDesignText(':chip[a]{style="mark"} :chip[b]{style="mark"}', spec, { styles, dpi: 72, letterSpacingPx: 0 });
    expect(two.styles[two.styleAt[0]!]!.chip!.marginRight).toBeCloseTo(3, 5);
    expect(two.styles[two.styleAt[2]!]!.chip!.marginLeft).toBeCloseTo(3, 5);
    // A space wider than the gap needs no margin.
    const wide = parseRichDesignText(':chip[ab]{style="mark"}   Title', spec, { styles, dpi: 72, letterSpacingPx: 0 });
    expect(wide.styles[wide.styleAt[0]!]!.chip!.marginRight).toBe(0);
  });

  it('paints the chip in the HTML of a vertical opener', () => {
    const cfg: PostextConfig = { ...designed(true), locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } };
    const doc = build('# :chip[ab]{style=mark} 見出し\n\n本文。', cfg);
    const blocks = openerBlocks(doc);
    expect(chipRuns(blocks)).toHaveLength(1);
    const html = renderToHtml(doc);
    expect(html).toContain('background:#cc3300');
    expect(html).toContain('>ab<');
    expect(html).not.toContain(CHIP_PLACEHOLDER);
  });
});
