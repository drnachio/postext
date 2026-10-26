import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { directDesignTextBlock, directedTextWidth, measuresRunsAsPainted } from '../../design/bidiText.js';
import { resolveDesignSlot } from '../../defaults/headerFooter.js';
import { layoutSlotToVdt } from '../../pipeline/pages/headerFooter.js';
import { clearMeasurementCache } from '../../measure/index.js';
import { setMeasureLanguage } from '../../measure/canvas.js';
import { chipToken } from '../../measure/rich.js';
import { createBoundingBox, type VDTDesignTextBlock, type VDTDesignTextLine, type VDTPage } from '../../vdt.js';
import type { DesignPlaceholderContext } from '../../design/placeholders.js';
import type { DesignElement, DesignTextElement } from '../../types.js';
import type { InlineSpan } from '../../parse/types.js';

// #770, round 2: the runs of a design text (a running head, an opener, a
// callout's title) and of a chip. A renderer paints a right-to-left run
// with its context set right to left; the layout measured the line left to
// right, whole, and each run but the last left to right too. A document
// shaped in its own language measures each run as it is painted.

const isArabicLetter = (ch: string): boolean => /[ء-يـ]/.test(ch);
const isBracket = (ch: string): boolean => ch === '(' || ch === ')';

/**
 * The advance of `text` at 10 px in a face that draws its marks by the
 * run they stand in, as Markazi Text and Amiri do. Left to right, the
 * marks beside an Arabic word are runs apart: a guillemet is 4.7 px and a
 * stop 3 px; right to left they are one run with the word, 4.1 px and
 * 2 px. A bracket is 4.5 px in a text measured left to right that holds
 * an Arabic letter, and 2.5 px alone or in a right-to-left run.
 */
function faceWidth(text: string, rtl: boolean): number {
  const chars = Array.from(text);
  const arabic = chars.some(isArabicLetter);
  let px = 0;
  for (const ch of chars) {
    if (ch === ' ') px += 2.5;
    else if (ch === '«' || ch === '»') px += rtl ? 4.1 : 4.7;
    else if (ch === '.') px += rtl ? 2 : 3;
    else if (isBracket(ch)) px += !rtl && arabic ? 4.5 : 2.5;
    else px += 5;
  }
  return px;
}
class MeasureContext {
  font = '10px Kitab';
  lang = 'inherit';
  direction = 'ltr';
  measureText(s: string): { width: number } {
    return { width: faceWidth(s, this.direction === 'rtl') };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = MeasureContext;
globals.OffscreenCanvas = class {
  getContext(): MeasureContext {
    return new MeasureContext();
  }
};

const FONT = '10px Kitab';
const DPI = 72;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
const round = (n: number): number => Math.round(n * 1000) / 1000;

const OPENER = '«الحرف العربي.»';
const DATE = '(٧٣٢–٨٠٨هـ)';

/** A one-element slot of a right-to-left document laid out to its line. */
function slotLine(content: string, extra: Partial<DesignTextElement> = {}): VDTDesignTextLine {
  const el = {
    kind: 'text', id: 't', content, fontFamily: 'Kitab', fontSize: pt(10), overflow: 'wrap', align: 'start',
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(300) } },
    ...extra,
  } as DesignElement;
  const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 400, height: 100 }, 0, placeholders, DPI, { direction: 'rtl' });
  return (slot!.blocks[0] as VDTDesignTextBlock).lines[0]!;
}
/** What a renderer sets for each run of a line: its text in a context of
 *  its direction. */
const painted = (line: VDTDesignTextLine): number[] => line.runs!.map((r) => faceWidth(r.text, r.rtl === true));
const widths = (line: VDTDesignTextLine): number[] => line.runs!.map((r) => round(r.width));

beforeEach(() => clearMeasurementCache());
afterEach(() => setMeasureLanguage(undefined));

describe('the runs of a design text, measured as they are painted (#770)', () => {
  it('only in a document shaped in its own language', () => {
    expect(measuresRunsAsPainted()).toBe(false);
    setMeasureLanguage('ar');
    expect(measuresRunsAsPainted()).toBe(true);
  });

  it('a right-to-left line is as wide as the one run it is painted as', () => {
    // Left to right the guillemets and the stop are runs apart: 9.4 px and
    // 3 px for the 8.2 px and 2 px of the run painted.
    setMeasureLanguage('ar');
    const line = slotLine(OPENER);
    expect(line.runs!.map((r) => [r.text, r.rtl])).toEqual([[OPENER, true]]);
    expect(widths(line)).toEqual(painted(line).map(round));
    expect(round(line.width)).toBe(round(faceWidth(OPENER, true)));
    expect(round(faceWidth(OPENER, false) - faceWidth(OPENER, true))).toBe(2.2);
    // Flush with the right edge of its box, at the width painted.
    expect(line.xOffset + line.width).toBeCloseTo(300, 6);
  });

  it('a document in its host\'s language keeps the width measured left to right', () => {
    const line = slotLine(OPENER);
    expect(round(line.width)).toBe(round(faceWidth(OPENER, false)));
    expect(widths(line)).toEqual([round(faceWidth(OPENER, false))]);
  });

  it('a bracket that is a run of its own: every run its own width, the line their sum', () => {
    setMeasureLanguage('ar');
    const line = slotLine(DATE);
    expect(line.runs!.map((r) => [r.text, r.rtl ?? false])).toEqual([
      ['(', true], ['٧٣٢', false], ['–', true], ['٨٠٨', false], ['هـ)', true],
    ]);
    expect(widths(line)).toEqual(painted(line).map(round));
    expect(widths(line)).toEqual([2.5, 15, 5, 15, 12.5]);
    expect(round(line.width)).toBe(50);
  });

  it('in its host\'s language the last run keeps what the line measured whole left over', () => {
    const line = slotLine(DATE);
    // 54 px whole (both brackets 4.5 px beside the Arabic letters); the
    // first four runs alone are 37.5 px, and the last takes 16.5 px for
    // the 12.5 px it is painted in.
    expect(round(line.width)).toBe(54);
    expect(widths(line)).toEqual([2.5, 15, 5, 15, 16.5]);
  });

  it('a justified line still ends on its edge, its runs as wide as painted and their spaces', () => {
    setMeasureLanguage('ar');
    const words = ['الحرف.', 'العربي.', 'الحرف.', 'العربي.', 'الحرف.'];
    const el = {
      kind: 'text', id: 't', content: words.join(' '), fontFamily: 'Kitab', fontSize: pt(10), overflow: 'wrap', align: 'justify',
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(70) } },
    } as DesignElement;
    const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 400, height: 100 }, 0, placeholders, DPI, { direction: 'rtl' });
    const lines = (slot!.blocks[0] as VDTDesignTextBlock).lines;
    expect(lines.length).toBeGreaterThan(1);
    const first = lines[0]!;
    expect(first.runs!.reduce((s, r) => s + r.width, 0)).toBeCloseTo(70, 6);
    const spacing = first.wordSpacingPx ?? 0;
    for (const r of first.runs!) {
      const spaces = r.text.split(' ').length - 1;
      expect(r.width).toBeCloseTo(faceWidth(r.text, r.rtl === true) + spacing * spaces, 6);
    }
  });

  it('a text built by hand (a callout\'s title): its runs as painted, the line their sum', () => {
    const block = (): VDTDesignTextBlock => ({
      kind: 'text',
      bbox: createBoundingBox(0, 0, 200, 14),
      fontString: FONT,
      color: '#000',
      lines: [{ text: DATE, xOffset: 0, baselineY: 10, width: 54 }],
      clip: false,
    });
    setMeasureLanguage('ar');
    const own = block();
    directDesignTextBlock(own, 'rtl', true);
    expect(widths(own.lines[0]!)).toEqual([2.5, 15, 5, 15, 12.5]);
    expect(own.lines[0]!.width).toBe(50);
    setMeasureLanguage(undefined);
    const host = block();
    directDesignTextBlock(host, 'rtl', true);
    expect(widths(host.lines[0]!)).toEqual([2.5, 15, 5, 15, 16.5]);
    expect(host.lines[0]!.width).toBe(54);
  });

  it('a text measured for wrapping is the sum of its runs as painted', () => {
    setMeasureLanguage('ar');
    expect(directedTextWidth(OPENER, FONT, 'rtl')).toBe(faceWidth(OPENER, true));
    expect(directedTextWidth(DATE, FONT, 'rtl')).toBe(50);
    // A left-to-right text with no right-to-left character: whole.
    expect(directedTextWidth('Alpha (beta).', FONT, 'ltr')).toBe(faceWidth('Alpha (beta).', false));
  });
});

describe('the runs of a chip', () => {
  const chip = (text: string) => {
    const span: InlineSpan = { text: '￼', bold: false, italic: false, chip: { spans: [{ text, bold: false, italic: false }] } };
    return chipToken(span, FONT, FONT, FONT, FONT, 0).chip!;
  };

  it('are as wide as painted, and the chip as wide as its runs, in a document shaped in its own language', () => {
    setMeasureLanguage('ar');
    const own = chip(OPENER);
    expect(own.runs.map((r) => [r.rtl, round(r.width)])).toEqual([[true, round(faceWidth(OPENER, true))]]);
    expect(round(own.boxWidth)).toBe(round(faceWidth(OPENER, true)));
    setMeasureLanguage(undefined);
    const host = chip(OPENER);
    expect(round(host.boxWidth)).toBe(round(faceWidth(OPENER, false)));
    expect(round(host.runs[0]!.width)).toBe(round(faceWidth(OPENER, false)));
  });
});
