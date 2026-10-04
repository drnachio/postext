import { describe, it, expect } from 'vitest';
import { buildDocument, renderToHtml, verticalFlowOf } from '../../index';
import type { PostextConfig, Dimension } from '../../types';
import type { VDTLine } from '../../vdt';
import { SizedStubCtx } from './stub';

// A mark a vertical line turns in a cell of its own (· ‧ – …) advances its
// cell in the layout, the canvas and the PDF, where a browser setting the
// text vertically advances it by its horizontal width (Noto's · is a third
// of an em, its – 0.56 em): the HTML sets each in a box of its cell, and
// stretches a dash to fill it by the advance the layout measured.

// The stub's widths, with a narrow interpunct and en dash as Noto has them.
class NarrowMarksCtx extends SizedStubCtx {
  override measureText(s: string): TextMetrics {
    const m = super.measureText(s);
    const em = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 10);
    let w = m.width;
    for (const ch of s) {
      if (ch === '·') w -= em - em * 0.3;
      if (ch === '–') w -= em - em * 0.5;
    }
    return { ...m, width: w, actualBoundingBoxRight: w } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): NarrowMarksCtx {
    return new NarrowMarksCtx();
  }
};

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const config = (locale: string): PostextConfig => ({
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  cjk: { latinSpacing: { value: 0, unit: 'em' } },
  locale,
});

/** The boxes the HTML sets turned marks in: their text, cell length (em),
 *  and the scale a dash is stretched by (1 when none). */
function turnedCells(html: string): { text: string; cell: number; scale: number }[] {
  const out: { text: string; cell: number; scale: number }[] = [];
  const re = /<span style="display:inline-flex;justify-content:center;inline-size:([\d.]+)em;[^"]*">(?:<span style="([^"]*)">)?([^<]*)(?:<\/span>)?<\/span>/g;
  for (const m of html.matchAll(re)) {
    const scale = /scaleY\(([\d.]+)\)/.exec(m[2] ?? '');
    out.push({ text: m[3]!, cell: parseFloat(m[1]!), scale: scale ? parseFloat(scale[1]!) : 1 });
  }
  return out;
}

function lines(doc: ReturnType<typeof buildDocument>): VDTLine[] {
  return doc.pages[0]!.columns[0]!.blocks.flatMap((b) => b.lines);
}

describe('turned marks in a vertical line of the HTML', () => {
  it('sets each dot of a leader in its one-em cell (Taiwan and Hong Kong)', () => {
    const leader = '·'.repeat(30);
    const doc = buildDocument({ markdown: `目錄${leader}一` }, config('zh-Hant'));
    // The layout gives every dot a cell of one em (10 px).
    const seg = lines(doc)[0]!.segments!.find((s) => s.text.includes(leader))!;
    expect(seg).toBeDefined();
    const cells = turnedCells(renderToHtml(doc, { mode: 'single' }));
    expect(cells).toHaveLength(30);
    for (const c of cells) expect(c).toEqual({ text: '·', cell: 1, scale: 1 });
  });

  it('sets the mainland interpunct in half a cell, and stretches an en dash over its cell', () => {
    const doc = buildDocument({ markdown: '这是一个测试‧再测试。丙–丁。列夫·托尔斯泰写了书。' }, config('zh-Hans'));
    // The layout measured the dash for the renderers without font metrics.
    expect(verticalFlowOf(doc.pages[0]!)!.dashAdvances).toEqual({ 'Test Serif': { '–': 0.5 } });
    const cells = turnedCells(renderToHtml(doc, { mode: 'single' }));
    expect(cells).toEqual([
      { text: '‧', cell: 0.5, scale: 1 },
      { text: '–', cell: 1, scale: 2 },
      { text: '·', cell: 0.5, scale: 1 },
    ]);
  });

  it('keeps the tracking of a tracked line after a turned mark', () => {
    // A design text tracked 2 px: the box of a dot gives its own tracking
    // back after it, as after any cell.
    const cfg: PostextConfig = {
      ...config('zh-Hant'),
      headings: {
        levels: [{
          level: 1,
          span: 'page',
          breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: {
            enabled: true,
            slot: { elements: [{ kind: 'text', id: 't', content: '第一回·甄士隱', fontFamily: 'Test Serif', fontSize: pt(12), letterSpacing: pt(2), overflow: 'clip', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200), height: pt(24) } } }] },
          },
        }],
      },
    };
    const html = renderToHtml(buildDocument({ markdown: '# 甄士隱\n\n此開卷第一回也。' }, cfg), { mode: 'single' });
    expect(html).toMatch(/<span style="display:inline-flex;justify-content:center;inline-size:1em;letter-spacing:0;margin-inline-end:2px;">·<\/span>/);
  });

  it('leaves a vertical line without turned marks as plain text', () => {
    const html = renderToHtml(buildDocument({ markdown: '此開卷第一回也。' }, config('zh-Hant')), { mode: 'single' });
    expect(html).not.toContain('inline-flex');
  });
});
