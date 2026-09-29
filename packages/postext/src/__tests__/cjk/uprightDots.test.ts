import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTLine } from '../../vdt';
import { SizedStubCtx, stubCharWidth } from '../vertical/stub';

// Emphasis dots over an `:upright[…]` run down a vertical line (#190 with
// #193): each letter stands in a cell of one em, so each dot is centred on
// its cell, whatever the letter's horizontal width. The stub is the sized
// one (CJK 1 em) with proportional Latin letters: W a full em, i a quarter,
// l three tenths, anything else half an em.
const LATIN: Record<string, number> = { W: 1, i: 0.25, l: 0.3 };
class ProportionalCtx extends SizedStubCtx {
  override measureText(s: string): TextMetrics {
    const m = super.measureText(s);
    const em = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 10);
    let w = 0;
    for (const ch of s) w += LATIN[ch] !== undefined ? LATIN[ch]! * em : stubCharWidth(ch, em);
    return { ...m, width: w, actualBoundingBoxRight: w } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): ProportionalCtx {
    return new ProportionalCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  locale: 'zh-Hant',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Proportional Test', fontSize: pt(20), lineHeight: pt(30), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk: { latinSpacing: { value: 0, unit: 'em' } },
};

const firstLine = (markdown: string): VDTLine => buildDocument({ markdown }, config).blocks.find((b) => b.type === 'paragraph')!.lines[0]!;

describe('emphasis dots over upright letters in vertical text', () => {
  it('centres a dot on each letter’s cell', () => {
    const line = firstLine('甲:dots[:upright[Wil]]乙');
    // 甲 takes 0–20 px; W, i and l a cell each after it.
    expect(line.marks!.filter((m) => m.kind === 'dot').map((m) => m.x)).toEqual([30, 50, 70]);
  });

  it('does the same with capitals and with digits', () => {
    expect(firstLine('甲:dots[:upright[GDP]]乙').marks!.map((m) => m.x)).toEqual([30, 50, 70]);
    expect(firstLine('甲:dots[:upright[W1]]乙').marks!.map((m) => m.x)).toEqual([30, 50]);
  });
});
