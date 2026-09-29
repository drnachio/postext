import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTAnnotationRun } from '../../vdt';
import { SizedStubCtx } from '../vertical/stub';

// Zhuyin tone marks placed by their ink (T8 review): fonts set ˊ ˇ ˋ high
// in their em box (Noto Serif TC's ˇ inks 0.484–0.826 em over its
// baseline), so centring the em box on the last symbol's top put the ink
// beside the symbol before it. This stub inks the tone marks there.
class ToneInkCtx extends SizedStubCtx {
  override measureText(s: string): TextMetrics {
    const m = super.measureText(s);
    if (!/^[ˊˇˋ˙]$/.test(s)) return m;
    const em = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 10);
    return { ...m, actualBoundingBoxAscent: 0.826 * em, actualBoundingBoxDescent: -0.484 * em } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): ToneInkCtx {
    return new ToneInkCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'zh-Hant-TW',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});

const runsOf = (md: string, extra: Partial<PostextConfig> = {}): VDTAnnotationRun[] => {
  const doc = buildDocument({ markdown: md }, config(extra));
  return doc.blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).find((s) => s.ruby)!.ruby!.runs;
};

/** The zhuyin size: 60 % of the 10 px ruby. */
const Z = 6;
/** Where the stub's tone ink is centred over its baseline. */
const INK_MID = ((0.826 + 0.484) / 2) * Z;

describe('zhuyin tone marks by their ink', () => {
  it('right of horizontal text: the ink is centred on the last symbol’s top, right of the column', () => {
    for (const reading of ['ㄇㄢˇ', 'ㄊㄤˊ', 'ㄧㄢˊ', 'ㄓˋ']) {
      const runs = runsOf(`:ruby[滿]{rt="${reading}"}紙`);
      const tone = runs.find((r) => /[ˊˇˋ]/.test(r.text))!;
      const symbols = runs.filter((r) => r !== tone);
      const last = symbols[symbols.length - 1]!;
      // The last symbol's em box top (0.88 em over its baseline).
      const lastTop = last.dy - 0.88 * Z;
      expect(tone.dy - INK_MID).toBeCloseTo(lastTop, 9);
      expect(tone.dx).toBeGreaterThanOrEqual(last.dx + Z / 2);
    }
  });

  it('the neutral-tone dot sits just over the first symbol, the column centred with it', () => {
    const runs = runsOf(':ruby[麼]{rt="˙ㄇㄜ"}紙');
    const dot = runs.find((r) => r.text === '˙')!;
    const first = runs.find((r) => r.text === 'ㄇ')!;
    const firstTop = first.dy - 0.88 * Z;
    // In a tenth of an em (2 px) over the symbols.
    expect(dot.dy - INK_MID).toBeCloseTo(firstTop - 1, 9);
  });

  it('over vertical text: the tone mark stands upright, its ink centred on the last symbol’s top', () => {
    const runs = runsOf(':ruby[滿]{rt="ㄇㄢˇ"}紙', { layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    const [symbols, tone] = runs;
    expect(tone).toMatchObject({ text: 'ˇ', upright: true });
    // An upright cell stands its glyph on the central axis: the ink centre
    // is 0.38 em past the cell's centre less the ink's height over the
    // baseline.
    const inkAt = tone!.dx + Z / 2 + 0.38 * Z - INK_MID;
    expect(inkAt).toBeCloseTo(symbols!.dx + Z, 9);
  });
});
