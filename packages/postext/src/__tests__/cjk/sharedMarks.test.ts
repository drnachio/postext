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
class StubCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? EM);
    const w = width(s, em);
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
    const ls = lines('他说：“你来了。”她答：“好。”');
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
    for (const s of close) {
      expect(s.width).toBeCloseTo(EM / 2);
      expect(s.inkOffset).toBe(0);
    }
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

  it('gives …… and —— one em per character, each pair centred as the font sets it', () => {
    const ls = lines('忽念及当日——一一细考较去……觉其', { punctuationWidth: 'fullwidth', compressAdjacent: false });
    const dashes = segs(ls, '—');
    const dots = segs(ls, '…');
    expect(dashes).toHaveLength(2);
    expect(dots).toHaveLength(2);
    for (const s of [...dashes, ...dots]) expect(s.width).toBeCloseTo(EM);
    // Each pair meets at its middle: 0.1 em blank on the outer sides of
    // the dash, 0.2 em on those of the ellipsis.
    expect(dashes[0]!.inkOffset).toBeCloseTo(0.1 * EM);
    expect(dashes[1]!.inkOffset).toBeCloseTo(0);
    expect(dots[0]!.inkOffset).toBeCloseTo(0.2 * EM);
    expect(dots[1]!.inkOffset).toBeCloseTo(0);
    expect(ls[0]!.bbox.width).toBeCloseTo(17 * EM);
  });

  it('keeps the kerning a face puts between the two dashes of a pair', () => {
    // Noto Serif SC: — 0.89 em, —— kerned 0.088 em tighter, so the two
    // strokes join.
    KERN['——'] = -0.088;
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
    } finally {
      delete KERN['——'];
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
    const ctx = new Proxy(target, {
      get(t, key) {
        if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x }); };
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
