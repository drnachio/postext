import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLineSegment } from '../../vdt';
import { SizedStubCtx } from '../vertical/stub';

// A Latin reading's descenders clear its base (#194, Nº 086). The reading's
// em box stands on the base's, its baseline 0.12 em above the box's foot as
// in a CJK face; Noto Serif TC inks g, j, p, q and y 0.271 em under the
// baseline, so at half the text size the g of tīng ran 1 pt into a bold 汀
// set at 15 pt. This stub inks the Latin descenders that deep.
const DESCENT = 0.271;
class DescenderInkCtx extends SizedStubCtx {
  override measureText(s: string): TextMetrics {
    const m = super.measureText(s);
    if (!/[gjpqy]/.test(s)) return m;
    const em = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 10);
    return { ...m, actualBoundingBoxDescent: DESCENT * em } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): DescenderInkCtx {
    return new DescenderInkCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 20 px text on a 40 px line; readings at 10 px unless `cjk` says. */
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'zh-Hant',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});
const rubies = (doc: VDTDocument): VDTLineSegment[] =>
  doc.blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).filter((s) => s.ruby);

const EM = 20;
const RT = 10;
/** The base's em box top, from the baseline (0.88 em up). */
const EM_TOP = -0.88 * EM;

describe('Latin readings clear their base', () => {
  it('the face’s descenders end 0.04 em of the text over the base’s em box', () => {
    const [ting] = rubies(buildDocument({ markdown: '{汀|tīng}洲' }, config()));
    const run = ting!.ruby!.runs[0]!;
    // Under the old rule the baseline stood 0.12 em of the reading over the
    // em top (EM_TOP − 1.2) and the g reached 1.51 px into the base's box.
    expect(run.dy + DESCENT * RT).toBeCloseTo(EM_TOP - 0.04 * EM, 9);
  });

  it('every reading of a line keeps one baseline, descender or not', () => {
    const segs = rubies(buildDocument({ markdown: '{天|tiān}{汀|tīng}{庭|tíng}' }, config()));
    const dys = segs.map((s) => s.ruby!.runs[0]!.dy);
    expect(dys).toHaveLength(3);
    for (const dy of dys) expect(dy).toBeCloseTo(dys[1]!, 9);
  });

  it('kana, bopomofo over vertical text and readings under the base stay on the em box', () => {
    const kana = rubies(buildDocument({ markdown: '{漢|かん}字' }, config()))[0]!.ruby!.runs[0]!;
    expect(kana.dy).toBeCloseTo(EM_TOP - 0.12 * RT, 9);
    const under = rubies(buildDocument({ markdown: ':ruby[汀]{rt="tīng" pos="under"}洲' }, config()))[0]!.ruby!.runs[0]!;
    // Under: the reading's em box hangs from the base's foot (0.12 em down).
    expect(under.dy).toBeCloseTo(0.12 * EM + 0.88 * RT, 9);
  });

  it('in vertical text the sideways reading moves right, away from the column', () => {
    const vertical = config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    const run = rubies(buildDocument({ markdown: '{汀|tīng}洲' }, vertical))[0]!.ruby!.runs[0]!;
    expect(run.dy + DESCENT * RT).toBeCloseTo(EM_TOP - 0.04 * EM, 9);
  });

  it('the leading check counts the lift', () => {
    // A gap of 0.55 em holds a 0.5 em reading on the em box, not one lifted
    // by 0.271 × 10 + 0.8 − 1.2 = 2.31 px more (0.615 em in all).
    const tight = config({ bodyText: { fontSize: pt(20), lineHeight: pt(31), hyphenation: { enabled: false } } });
    const tingWarn = buildDocument({ markdown: '汀{汀|tīng}洲' }, tight).contentWarnings?.find((w) => w.kind === 'rubyExceedsLeading');
    expect(tingWarn).toMatchObject({ gapEm: 0.55, neededEm: 0.615 });
    const kana = buildDocument({ markdown: '漢{漢|かん}字' }, tight).contentWarnings ?? [];
    expect(kana.some((w) => w.kind === 'rubyExceedsLeading')).toBe(false);
  });
});
