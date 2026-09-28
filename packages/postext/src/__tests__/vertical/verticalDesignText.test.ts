import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index';
import type { PostextConfig, Dimension, DesignTextElement } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';
import { installSizedStub, stubCharWidth } from './stub';

installSizedStub();

// Issue #192: design text elements set vertically (`writingMode:
// 'vertical-rl'`) in slots laid out on the sheet, and the fore-edge
// (`anchor.to: 'outer'`).

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const HLM = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。';

/** The fore-edge template: the chapter four characters below the head of
 *  the type area, the folio five above its foot. */
const foreEdge = (): DesignTextElement[] => [
  { kind: 'text', id: 'head', content: '{chapterTitle}', writingMode: 'vertical-rl', fontSize: pt(8), overflow: 'clip', placement: { anchor: { to: 'outer', edge: 'top' }, offset: { y: { value: 4, unit: 'em' } } } },
  { kind: 'text', id: 'folio', content: '{pageNumber}', writingMode: 'vertical-rl', fontSize: pt(8), overflow: 'clip', placement: { anchor: { to: 'outer', edge: 'bottom' }, offset: { y: { value: -5, unit: 'em' } } } },
];

const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'zh-Hant',
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(50), mirror: true } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16) },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: foreEdge() },
  footer: { elements: [] },
  ...extra,
});

function headOf(page: VDTPage, index = 0): VDTDesignTextBlock {
  return page.header!.blocks.filter((b): b is VDTDesignTextBlock => b.kind === 'text')[index]!;
}

describe('vertical running heads down the fore-edge (#192)', () => {
  const doc = buildDocument({ markdown: `# 第一回\n\n${Array.from({ length: 16 }, () => HLM).join('\n\n')}` }, config());

  it('sets the head in the outer margin: the left of an odd page, the right of an even one, in a right-bound book', () => {
    expect(doc.binding).toBe('right');
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    for (const page of doc.pages.slice(0, 2)) {
      const head = headOf(page);
      expect(head.vertical).toBeDefined();
      const area = { x: page.width - (page.contentArea.y + page.contentArea.height), y: page.contentArea.x, w: page.contentArea.height, h: page.contentArea.width };
      const recto = page.index % 2 === 0;
      if (recto) expect(head.bbox.x + head.bbox.width).toBeLessThanOrEqual(area.x + 1e-6);
      else expect(head.bbox.x).toBeGreaterThanOrEqual(area.x + area.w - 1e-6);
      // Four characters below the head of the type area.
      expect(head.bbox.y).toBeCloseTo(area.y + 4 * 8, 6);
      // A box as tall as its line: one cell per character.
      expect(head.bbox.height).toBeCloseTo(head.lines[0]!.text.length * 8, 6);
    }
  });

  it('prints the folio five characters above the foot, in the document’s numerals', () => {
    const numbered = buildDocument({ markdown: HLM }, config({
      page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(50), mirror: true }, pageNumbering: { format: 'trad-chinese-informal', startAt: 103 } },
    }));
    const page = numbered.pages[0]!;
    const folio = headOf(page, 1);
    expect(folio.lines[0]!.text).toBe('一百零三');
    const foot = page.contentArea.x + page.contentArea.width;
    expect(folio.bbox.y + folio.bbox.height).toBeCloseTo(foot - 5 * 8, 6);
    const decimal = buildDocument({ markdown: HLM }, config({
      page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(50), mirror: true }, pageNumbering: { format: 'cjk-decimal', startAt: 103 } },
    }));
    expect(headOf(decimal.pages[0]!, 1).lines[0]!.text).toBe('一〇三');
  });

  it('paints the head upright, one cell under the other, down the fore-edge', () => {
    const page = doc.pages[0]!;
    const head = headOf(page);
    const painted: Array<{ text: string; x: number; y: number; ax: number }> = [];
    type M = [number, number, number, number, number, number];
    let m: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const state: Record<string, unknown> = { font: '8px Test', letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
    const api: Record<string, unknown> = {
      save: () => stack.push(m),
      restore: () => { m = stack.pop() ?? m; },
      transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
      translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
      scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
      rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
      fillText: (text: string, x: number, y: number) => painted.push({ text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5], ax: Math.round(m[0]) }),
      measureText: (s: string) => ({ width: [...s].reduce((w, ch) => w + stubCharWidth(ch, Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? 8)), 0) }),
    };
    const ctx = new Proxy(state, {
      get: (t, k) => (typeof k === 'string' && k in api ? api[k] : k in t ? t[k as string] : () => undefined),
      set: (t, k, v) => { t[k as string] = v; return true; },
    });
    renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const chars = painted.filter((p) => head.lines[0]!.text.includes(p.text) && p.x > head.bbox.x - 1 && p.x < head.bbox.x + head.bbox.width + 1);
    expect(chars.length).toBe(head.lines[0]!.text.length);
    // Upright, each a cell below the one before.
    expect(chars.every((c) => c.ax === 1)).toBe(true);
    for (let i = 1; i < chars.length; i++) expect(chars[i]!.y - chars[i - 1]!.y).toBeCloseTo(8, 6);
  });

  it('writes the head as a vertical box in the HTML at the same rectangle', () => {
    const html = renderToHtml(doc, { mode: 'single' });
    const head = headOf(doc.pages[0]!);
    expect(html).toContain(`left:${head.bbox.x}px;top:${head.bbox.y}px;width:${head.bbox.width}px;height:${head.bbox.height}px;`);
    expect(html).toContain('transform:rotate(90deg)');
  });

  it('sets a vertical title beside a horizontal chapter (an opener slot)', () => {
    const horizontal = buildDocument({ markdown: `# 第一回\n\n${HLM}` }, config({
      layout: { writingMode: 'horizontal-tb', layoutType: 'single' },
      header: { elements: [] },
      headings: { levels: [{ level: 1, span: 'page', advancedDesign: { enabled: true, slot: { elements: [
        { kind: 'text', id: 't', content: '{titleText}', writingMode: 'vertical-rl', fontSize: pt(20), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-right' } } },
      ] } } }] },
    }));
    const band = horizontal.pages[0]!.openerBand ?? horizontal.pages[0]!.columns[0]!.blocks[0]!.designOverlay;
    const title = band!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    expect(title.vertical).toBeDefined();
    // Three characters down: three cells of 20 pt; one line across.
    expect(title.bbox.height).toBeCloseTo(60, 6);
    expect(title.lines).toHaveLength(1);
  });

  it('leaves horizontal elements as they were', () => {
    const plain = buildDocument({ markdown: HLM }, config({ header: { elements: [{ kind: 'text', id: 'h', content: '紅樓夢', fontSize: pt(8), overflow: 'clip', placement: { anchor: { to: 'container', edge: 'bottom-left' } } }] } }));
    expect(headOf(plain.pages[0]!).vertical).toBeUndefined();
  });
});
