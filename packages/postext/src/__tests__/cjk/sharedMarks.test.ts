import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { measureRichBlock } from '../../measure/rich';
import { clearTextWidthCache } from '../../measure/canvas';
import { withMeasureWritingMode } from '../../measure/vertical';
import type { CjkComposition } from '../../measure/cjkPunctuation';
import type { Dimension, PostextConfig } from '../../types';
import type { VDTLine, VDTLineSegment } from '../../vdt';

// “ ” ‘ ’ … — · are shared by Latin and Chinese text. A font may set them
// proportionally (LXGW WenKai: “ ” at 0.35 em; Noto Serif SC: the em dash
// at 0.89 em, · at a third of an em). In Chinese text they take the box of
// a Chinese mark whatever the font's advance, with the glyph where a
// Chinese font puts it; next to Western text they keep their own advance.

const EM = 16;
const SIZE_RE = /(\d*\.?\d+)px/;
/** Advances in em: the shared marks proportional, as in LXGW WenKai. */
const PROPORTIONAL: Record<string, number> = { '“': 0.35, '”': 0.35, '‘': 0.35, '’': 0.35, '…': 0.8, '—': 0.9, '·': 0.3 };
const charWidth = (ch: string, em: number): number => {
  if (ch in PROPORTIONAL) return PROPORTIONAL[ch]! * em;
  if (ch === ' ') return em / 4;
  return ch.codePointAt(0)! >= 0x2e80 ? em : em / 2;
};
/** Kerning of whole runs, em. */
const KERN: Record<string, number> = {};
const width = (s: string, em: number): number => {
  let w = 0;
  for (const ch of s) w += charWidth(ch, em);
  for (const [pair, k] of Object.entries(KERN)) if (s.includes(pair)) w += k * em;
  return w;
};
/** Whether the stub gives ink metrics (a measurer without them sets a
 *  破折号 as the font sets the pair). */
let INK = true;
class StubCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? EM);
    const w = width(s, em);
    if (!INK) return { width: w } as TextMetrics;
    return { width: w, actualBoundingBoxAscent: em * 0.8, actualBoundingBoxDescent: em * 0.04, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = `${EM}px "Test Kai"`;
const composition = (c: Partial<CjkComposition> = {}): CjkComposition => ({
  region: 'mainland',
  punctuationWidth: 'kaiming',
  compressAdjacent: true,
  trimLineStart: false,
  hangingPunctuation: 'none',
  latinSpacing: { em: 0 },
  ...c,
});
const lines = (text: string, c: Partial<CjkComposition> = {}, measure = 40 * EM, textAlign: 'left' | 'justify' = 'left'): VDTLine[] =>
  measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, measure, 24, { textAlign, cjkLineBreak: 'gb', cjkComposition: composition(c) }).lines;
/** The segments holding exactly `text`, in order. */
const segs = (ls: VDTLine[], text: string): VDTLineSegment[] => ls.flatMap((l) => l.segments ?? []).filter((s) => s.text === text);

describe('marks shared with Latin text take a Chinese box in Chinese text', () => {
  it('sets proportional quotes in half-em Kaiming boxes, the opening glyph at the end of its box', () => {
    const ls = lines('他说：“你来了。”她答：“好”。');
    const open = segs(ls, '“');
    const close = segs(ls, '”');
    expect(open).toHaveLength(2);
    expect(close).toHaveLength(2);
    for (const s of open) {
      // One em box, its half-em blank before the glyph given up (Kaiming):
      // half an em, the 0.35-em glyph ending on the box's end.
      expect(s.width).toBeCloseTo(EM / 2);
      expect(s.inkOffset).toBeCloseTo(EM / 2 - 0.35 * EM);
      expect(s.inkOffset! + 0.35 * EM).toBeCloseTo(s.width);
    }
    // After 好 the closing quote is half an em; after 。 it holds the stop's
    // half em after its glyph (。”␣), the glyph still at the start of its box.
    expect(close.map((s) => s.width)).toEqual([EM, EM / 2]);
    for (const s of close) expect(s.inkOffset).toBe(0);
    expect(segs(ls, '。')[0]!.width).toBeCloseTo(EM / 2);
  });

  it('sets them one em under full width, an opening quote against the text it opens', () => {
    const ls = lines('他说“你来了。”', { punctuationWidth: 'fullwidth', compressAdjacent: false });
    const [open] = segs(ls, '“');
    const [close] = segs(ls, '”');
    expect(open!.width).toBeCloseTo(EM);
    expect(open!.inkOffset).toBeCloseTo(EM - 0.35 * EM);
    expect(close!.width).toBeCloseTo(EM);
    expect(close!.inkOffset).toBe(0);
    // The line: 6 characters and two one-em quotes.
    expect(ls[0]!.bbox.width).toBeCloseTo(8 * EM);
  });

  it('gives …… and —— one em per character: the ellipsis centred as the font sets it, the dash stretched over its ems', () => {
    const ls = lines('忽念及当日——一一细考较去……觉其', { punctuationWidth: 'fullwidth', compressAdjacent: false });
    const dashes = segs(ls, '—');
    const dots = segs(ls, '…');
    expect(dashes).toHaveLength(2);
    expect(dots).toHaveLength(2);
    for (const s of [...dashes, ...dots]) expect(s.width).toBeCloseTo(EM);
    // The ellipsis meets at its middle, 0.2 em blank on its outer sides.
    expect(dots[0]!.inkOffset).toBeCloseTo(0.2 * EM);
    expect(dots[1]!.inkOffset).toBeCloseTo(0);
    expect(dots[0]!.inkScale).toBeUndefined();
    // Each 0.9-em dash (ink edge to edge in the stub) stretched over its em
    // and 0.02 em past the join: one rule from 0 to 2 em.
    const scale = 1.02 / 0.9;
    for (const s of dashes) expect(s.inkScale).toBeCloseTo(scale);
    expect(dashes[0]!.inkOffset).toBeCloseTo(0);
    expect(dashes[1]!.inkOffset).toBeCloseTo(-0.02 * EM);
    expect(EM + dashes[1]!.inkOffset! + 0.9 * EM * scale).toBeCloseTo(2 * EM);
    expect(ls[0]!.bbox.width).toBeCloseTo(17 * EM);
  });

  it('keeps the kerning a face puts between the two dashes of a pair when the measurer gives no ink metrics', () => {
    // Noto Serif SC: — 0.89 em, —— kerned 0.088 em tighter, so the two
    // strokes join.
    KERN['——'] = -0.088;
    INK = false;
    clearTextWidthCache();
    try {
      const ls = lines('女子——一一细考', { punctuationWidth: 'fullwidth', compressAdjacent: false });
      const [a, b] = segs(ls, '—');
      const pair = (2 * 0.9 - 0.088) * EM;
      expect(a!.width).toBeCloseTo(EM);
      expect(b!.width).toBeCloseTo(EM);
      // The pair centred in its two ems; the second glyph starts where the
      // font puts it, 0.088 em into the first one's advance.
      expect(a!.inkOffset).toBeCloseTo(EM - pair / 2);
      expect(EM + b!.inkOffset!).toBeCloseTo(a!.inkOffset! + (0.9 - 0.088) * EM);
      expect(a!.inkScale).toBeUndefined();
    } finally {
      delete KERN['——'];
      INK = true;
      clearTextWidthCache();
    }
  });

  it('sets a single em dash and an interpunct centred; the mainland interpunct in half an em', () => {
    const ls = lines('北京—上海，约翰·史密斯', { punctuationWidth: 'fullwidth', compressAdjacent: true });
    const [dash] = segs(ls, '—');
    expect(dash!.width).toBeCloseTo(EM);
    expect(dash!.inkOffset).toBeCloseTo(0.05 * EM);
    const [dot] = segs(ls, '·');
    expect(dot!.width).toBeCloseTo(EM / 2);
    expect(dot!.inkOffset).toBeCloseTo((EM / 2 - 0.3 * EM) / 2);
    // Taiwan centres a one-em interpunct.
    const [tw] = segs(lines('約翰·史密斯', { region: 'taiwan', punctuationWidth: 'fullwidth', compressAdjacent: false }), '·');
    expect(tw!.width).toBeCloseTo(EM);
    expect(tw!.inkOffset).toBeCloseTo((EM - 0.3 * EM) / 2);
  });

  it('compresses a shared mark against a Chinese one as a Chinese mark', () => {
    // 。” under full width with compression: the stop gives up the blank
    // between them, the quote keeps its em box: 1.5 em together.
    const ls = lines('他说“你来了。”', { punctuationWidth: 'fullwidth', compressAdjacent: true });
    const [stop] = segs(ls, '。');
    const [close] = segs(ls, '”');
    expect(stop!.width).toBeCloseTo(EM / 2);
    expect(close!.width).toBeCloseTo(EM);
    expect(close!.inkOffset).toBe(0);
  });

  it('keeps their own advance next to Western text on both sides', () => {
    // A Chinese paragraph (more CJK letters than word spaces) quoting an
    // English sentence.
    const ls = lines('他回答说：He said “yes” and left. 然后他回到家中休息了很久很久很久。');
    const [open] = segs(ls, '“');
    const [close] = segs(ls, '”');
    expect(open!.width).toBeCloseTo(0.35 * EM);
    expect(open!.inkOffset).toBeUndefined();
    expect(close!.width).toBeCloseTo(0.35 * EM);
    // A quote between Chinese and Latin text is Chinese.
    const mixed = lines('他说“OK”就走了。', { punctuationWidth: 'fullwidth', compressAdjacent: false });
    expect(segs(mixed, '“')[0]!.width).toBeCloseTo(EM);
    expect(segs(mixed, '”')[0]!.width).toBeCloseTo(EM);
  });

  it('leaves a mark whose glyph is one em wide as it was', () => {
    PROPORTIONAL['“'] = 1;
    PROPORTIONAL['”'] = 1;
    clearTextWidthCache();
    try {
      const ls = lines('他说“你来了。”', { punctuationWidth: 'fullwidth', compressAdjacent: false });
      // No box to place a glyph in: the characters share a segment.
      expect(ls[0]!.segments!.map((s) => s.text)).toEqual(['他说“你来了。”']);
    } finally {
      PROPORTIONAL['“'] = 0.35;
      PROPORTIONAL['”'] = 0.35;
      clearTextWidthCache();
    }
  });

  it('leaves vertical text to its cells', () => {
    const ls = withMeasureWritingMode('vertical-rl', () => lines('他说“你来了。”', { punctuationWidth: 'fullwidth', compressAdjacent: false }));
    for (const s of ls.flatMap((l) => l.segments ?? [])) expect(s.inkOffset).toBeUndefined();
    expect(ls[0]!.bbox.width).toBeCloseTo(8 * EM);
  });

  it('sets the mainland interpunct in half an em under a composition that changes nothing else, as vertical text does', () => {
    // Full width, no compression, no trims, no Han–Latin space: the plain
    // composition. GB/T 15834 sets · and ・ in half an em whatever the
    // punctuation style, in both writing modes.
    const plain = { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { em: 0 } } as const;
    for (const name of ['列夫·托尔斯泰', '列夫・托尔斯泰']) {
      const across = lines(name, plain);
      const down = withMeasureWritingMode('vertical-rl', () => lines(name, plain));
      expect(across[0]!.bbox.width, name).toBeCloseTo(6.5 * EM);
      expect(down[0]!.bbox.width, name).toBeCloseTo(6.5 * EM);
    }
    // The glyph centred in its half em: · (0.3 em) a tenth of an em in,
    // ・ (one em) a quarter em before its box.
    expect(segs(lines('列夫·托尔斯泰', plain), '·')[0]!.inkOffset).toBeCloseTo(0.1 * EM);
    expect(segs(lines('列夫・托尔斯泰', plain), '・')[0]!.inkOffset).toBeCloseTo(-0.25 * EM);
    // Taiwan keeps its one-em interpunct.
    expect(lines('約翰・史密斯', { ...plain, region: 'taiwan' })[0]!.bbox.width).toBeCloseTo(6 * EM);
  });

  it('keeps their own advance in Japanese and Korean text', () => {
    const ko = '그는 “안녕하세요”라고 말했다. 김철수·이영희 두 사람은 서울에서 부산까지…… 먼 길을 걸었다—정말로.';
    const ja = '彼は“こんにちは”と言った。山田·田中の二人は東京から大阪まで……歩いた。';
    const own = (ls: VDTLine[]): void => {
      const marks = ls.flatMap((l) => l.segments ?? []).filter((s) => /[“”·…—]/.test(s.text));
      expect(marks.length).toBeGreaterThan(3);
      for (const s of marks) {
        expect(s.width, s.text).toBeCloseTo(width(s.text, EM));
        expect(s.inkOffset, s.text).toBeUndefined();
      }
    };
    own(lines(ko, { language: 'ko' }));
    own(lines(ja, { language: 'ja' }));
    // A paragraph with kana or hangul in a document of another language.
    own(lines(ja, { language: 'en' }));
    own(lines(ja));
    // Chinese text in such a document routes them.
    expect(segs(lines('他说“你来了。”', { language: 'en', punctuationWidth: 'fullwidth', compressAdjacent: false }), '“')[0]!.width).toBeCloseTo(EM);
    // The document language reaches the composer through the locale.
    const ragged = (locale: string): PostextConfig => {
      const cfg = config(locale);
      return { ...cfg, bodyText: { ...cfg.bodyText, textAlign: 'left' } };
    };
    for (const locale of ['ko', 'ja']) {
      const doc = buildDocument({ markdown: locale === 'ko' ? ko : ja }, ragged(locale));
      own(doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines));
    }
    const zh = buildDocument({ markdown: '他说“你来了。”山田·田中' }, ragged('zh-Hans'));
    const zhMarks = zh.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).filter((s) => /[“·]/.test(s.text));
    expect(zhMarks.map((s) => s.inkOffset !== undefined)).toEqual([true, true]);
  });

  it('routes a long run of shared marks in linear time', () => {
    // Each mark looks past its neighbours for the nearest text: a run of
    // n marks used to cost n² steps (16,000 quotes took three seconds).
    // The fastest of five runs, timed by the thread's CPU clock: when the
    // other packages' tests share the machine (turbo runs them together),
    // the wall clock stretched the 15 ms run several times and left the
    // 2 ms one alone, and read ~40× where the CPU clock reads ~10×.
    type Usage = { user: number; system: number };
    const clock = (globalThis as unknown as { process: { threadCpuUsage?: () => Usage; cpuUsage: () => Usage } }).process;
    const cpuMs = (): number => {
      const usage = clock.threadCpuUsage?.() ?? clock.cpuUsage();
      return (usage.user + usage.system) / 1000;
    };
    const time = (n: number): number => {
      const text = `他说${'“”'.repeat(n)}。`;
      let best = Infinity;
      for (let run = 0; run < 5; run++) {
        clearTextWidthCache();
        const t0 = cpuMs();
        lines(text, {}, 30 * EM, 'justify');
        best = Math.min(best, cpuMs() - t0);
      }
      return best;
    };
    time(500);
    const small = Math.max(time(1000), 1);
    const large = time(8000);
    // Eight times the marks: linear is ~8×, quadratic ~64×.
    expect(large / small).toBeLessThan(30);
  });
});

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const config = (locale: string, cjk: PostextConfig['cjk'] = {}): PostextConfig => ({
  locale,
  page: { width: pt(400), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test Kai', fontSize: pt(EM), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
});

describe('renderers paint a shared mark in its Chinese box', () => {
  it('canvas and HTML put each glyph at its box plus its ink offset', () => {
    const doc = buildDocument({ markdown: '作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。忽念及当日所有之女子——一一细考较去……“风月宝鉴”。' }, config('zh-Hans'));
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    const texts: { text: string; x: number }[] = [];
    const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: FONT };
    // The pen's horizontal transform: a stretched dash is painted at the
    // origin of a translated, scaled context.
    let tx = 0;
    let sx = 1;
    const saved: [number, number][] = [];
    const ctx = new Proxy(target, {
      get(t, key) {
        if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x: tx + sx * x }); };
        if (key === 'save') return () => { saved.push([tx, sx]); };
        if (key === 'restore') return () => { [tx, sx] = saved.pop() ?? [0, 1]; };
        if (key === 'translate') return (x: number) => { tx += sx * x; };
        if (key === 'scale') return (x: number) => { sx *= x; };
        if (key === 'measureText') return (s: string) => ({ width: width(s, EM) });
        if (key in t) return t[key];
        return () => undefined;
      },
      set(t, key, value) { t[key] = value; return true; },
    });
    renderPageToCanvas(doc.pages[0]!, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const html = renderToHtml(doc);
    let checked = 0;
    for (const line of block.lines) {
      let x = line.bbox.x;
      for (const s of line.segments ?? []) {
        if (s.kind === 'text' && s.text.length === 1 && s.text in PROPORTIONAL) {
          const at = x + s.inkOffset!;
          expect(texts.some((t) => t.text === s.text && Math.abs(t.x - at) < 1e-6), `${s.text} at ${at}`).toBe(true);
          expect(html).toContain(`left:${(at - line.bbox.x).toFixed(3)}px;`);
          if (s.inkScale !== undefined) expect(html).toContain(`transform:scaleX(${s.inkScale.toFixed(4)})`);
          checked++;
        }
        x += s.width;
      }
    }
    // “通灵”, ——, ……, “风月宝鉴”.
    expect(checked).toBe(8);
  });

  it('leaves a Latin paragraph quoting Chinese to the font', () => {
    const doc = buildDocument({ markdown: 'The novel “紅樓夢” — also called “石頭記” — was written… by Cao Xueqin.' }, config('en'));
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    const segments = block.lines.flatMap((l) => l.segments ?? []);
    expect(segments.some((s) => s.inkOffset !== undefined)).toBe(false);
    // Every word at the stub's own advances.
    for (const s of segments) if (s.kind === 'text') expect(s.width).toBeCloseTo(width(s.text, EM));
  });
});
