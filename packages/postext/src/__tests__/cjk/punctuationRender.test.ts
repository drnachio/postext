import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, columnClipRect } from '../../index';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument, VDTLine } from '../../vdt';
import { cjkMarkPieces } from '../../measure/cjkClasses';
import { graphemeCount } from '../../measure/graphemes';

// CJK characters 16 px (1 em at 16 px), a space 4 px, anything else 8 px.
const adv = (s: string): number => {
  let w = 0;
  for (const ch of s) w += ch === ' ' ? 4 : ch.codePointAt(0)! >= 0x2e80 ? 16 : 8;
  return w;
};
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    return { width: adv(s) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

function recordingCanvas(): { canvas: HTMLCanvasElement; texts: { text: string; x: number }[] } {
  const texts: { text: string; x: number }[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px' };
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x }); };
      if (key === 'measureText') return (s: string) => ({ width: adv(s) });
      if (key in t) return t[key];
      return () => undefined;
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, texts };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px. A 181 px measure.
const config = (cjk: PostextConfig['cjk'] = {}): PostextConfig => ({
  locale: 'zh-Hans',
  page: { width: pt(221), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(16), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: pt(32), hyphenation: { enabled: false } },
  cjk,
});

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;

/** Where each text segment of a line is painted: its box's x plus its ink
 *  offset. The composer's widths are final on every CJK line. A line with
 *  nothing set apart (no tracking, no compressed or hung mark, no Han–Latin
 *  space) is painted in one run. Two marks that meet (`。”`) are painted
 *  apart, the second where the first ends. */
function expectedPaint(line: VDTLine): { text: string; x: number }[] {
  const out: { text: string; x: number }[] = [];
  const put = (text: string, x: number, tracking = 0): void => {
    for (const piece of cjkMarkPieces(text, true)) {
      out.push({ text: piece, x });
      x += adv(piece) + tracking * graphemeCount(piece);
    }
  };
  if (!line.segments!.some((s) => s.tracking !== undefined || s.inkOffset !== undefined || s.hangs || s.autospace)) {
    put(line.text, line.bbox.x);
    return out;
  }
  let x = line.bbox.x;
  for (const seg of line.segments!) {
    if (seg.kind === 'text') put(seg.text, x + (seg.inkOffset ?? 0), seg.tracking);
    x += seg.width;
  }
  return out;
}

// 红楼梦, chapter 1, with Latin words and numbers mixed in.
const TEXT = '「此开卷第一回也。」作者自云：因曾历过一番梦幻之后，故将真事隐去，而借「通灵」之说，撰此《石头记》一书也。他用iPhone 15和Galaxy S24拍了1999年的照片，又说：“来了。”';

describe('compressed marks, hung marks and Han–Latin spaces in the renderers', () => {
  for (const [name, cjk] of [
    ['Kaiming', {}],
    ['full width, compressed pairs and trimmed edges', { punctuationWidth: 'fullwidth', compressAdjacent: true, trimLineStart: true }],
    ['hanging', { hangingPunctuation: 'force' }],
  ] as const) {
    it(`paint every segment where the layout put it (${name})`, () => {
      const doc = buildDocument({ markdown: TEXT }, config(cjk as PostextConfig['cjk']));
      const block = paragraph(doc);
      const right = block.bbox.x + block.bbox.width;
      const { canvas, texts } = recordingCanvas();
      renderPageToCanvas(doc.pages[0]!, doc, canvas);
      const painted = texts.filter((t) => block.lines.some((l) => l.text.includes(t.text)));
      const expected = block.lines.flatMap(expectedPaint);
      expect(painted.map((t) => t.text)).toEqual(expected.map((e) => e.text));
      painted.forEach((t, i) => expect(t.x).toBeCloseTo(expected[i]!.x, 6));
      for (const line of block.lines.slice(0, -1)) {
        // Every line but the last reaches the measure; a hung mark stays out.
        const inside = line.segments!.filter((s) => !s.hangs).reduce((s, seg) => s + seg.width, 0);
        expect(line.bbox.x + inside).toBeCloseTo(right, 6);
        expect(line.bbox.width).toBeCloseTo(inside, 6);
      }
      // HTML: each span at its box's x plus its ink offset.
      const html = renderToHtml(doc);
      for (const line of block.lines) {
        for (const e of expectedPaint(line).length > 1 ? expectedPaint(line) : []) {
          // Spans sit in the line's box.
          const left = (e.x - line.bbox.x).toFixed(3);
          expect(html).toContain(`left:${left}px;`);
        }
      }
    });
  }

  it('sets a trimmed opening bracket half an em into the first-line indent', () => {
    const doc = buildDocument({ markdown: TEXT }, config());
    const first = paragraph(doc).lines[0]!;
    expect(first.bbox.x - paragraph(doc).bbox.x).toBe(32);
    expect(first.segments![0]).toMatchObject({ text: '「', inkOffset: -8 });
    expect(first.segments![0]!.width - (first.segments![0]!.tracking ?? 0)).toBe(8);
  });

  it('widens the clip by the widest hung mark', () => {
    const doc = buildDocument({ markdown: TEXT }, config({ hangingPunctuation: 'force' }));
    const col = doc.pages[0]!.columns[0]!;
    const hung = paragraph(doc).lines.filter((l) => l.segments!.some((s) => s.hangs));
    expect(hung.length).toBeGreaterThan(0);
    const plain = buildDocument({ markdown: TEXT }, config());
    const base = columnClipRect(plain.pages[0]!.columns[0]!, 72);
    const clip = columnClipRect(col, 72);
    const widest = Math.max(...hung.map((l) => l.bbox.x + l.bbox.width + l.segments!.find((s) => s.hangs)!.width));
    // 2 pt of ink overhang past whatever reaches furthest.
    expect(clip.x + clip.width).toBeCloseTo(Math.max(base.x + base.width, widest + 2), 6);
  });
});
