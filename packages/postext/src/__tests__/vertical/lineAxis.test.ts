import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import type { PostextConfig, Dimension, DesignTextElement } from '../../types';
import type { VDTDesignTextBlock, VDTDocument, VDTPage } from '../../vdt';
import { installSizedStub, stubCharWidth } from './stub';

installSizedStub();

// A vertical line stands its characters in the middle of its line box: the
// body's columns in the middle of their pitch, so a rule drawn between two
// columns at a whole pitch is centred between them (Nº 085's 界行), and a
// design text (an opener's title, a couplet between rules, a fore-edge
// head) in the middle of its own line, whatever its size and line height
// (Nº 075). The stub's ideograph is the Noto CJK em box: its centre is
// 0.38 em above the baseline.

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const HLM = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。';
const W = 300;

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

/** Where the canvas paints the centre of each character's em box on the
 *  sheet: `(x, y)`, with the character and its size. */
function paintedCentres(page: VDTPage, doc: VDTDocument): Array<{ text: string; x: number; y: number; em: number }> {
  const out: Array<{ text: string; x: number; y: number; em: number }> = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const state: Record<string, unknown> = { font: '10px Test', letterSpacing: '0px', textBaseline: 'alphabetic', textAlign: 'start' };
  const emOf = () => Number(/(\d*\.?\d+)px/.exec(String(state.font))?.[1] ?? 10);
  const widthOf = (s: string) => [...s].reduce((w, ch) => w + stubCharWidth(ch, emOf()), 0);
  const api: Record<string, unknown> = {
    save: () => stack.push(m),
    restore: () => { m = stack.pop() ?? m; },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = mul(m, [a, b, c, d, e, f]); },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = [a, b, c, d, e, f]; },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (t: number) => { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    fillText: (text: string, x: number, y: number) => {
      const em = emOf();
      // The em box's centre in the glyph's own frame.
      const cx = x + widthOf(text) / 2;
      const cy = y - 0.38 * em;
      out.push({ text, x: m[0] * cx + m[2] * cy + m[4], y: m[1] * cx + m[3] * cy + m[5], em });
    },
    measureText: (s: string) => ({ width: widthOf(s) }),
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (typeof k === 'string' && k in api ? api[k] : k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
  return out;
}

const base = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'zh-Hant',
  page: { width: pt(W), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(50) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16), textAlign: 'justify' },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

describe('vertical characters stand in the middle of their line', () => {
  it('the body: each column of characters in the middle of its pitch, symmetric in the type area', () => {
    const doc = buildDocument({ markdown: Array.from({ length: 3 }, () => HLM).join('\n\n') }, base());
    const page = doc.pages[0]!;
    const lines = page.columns[0]!.blocks.flatMap((b) => b.lines);
    expect(lines.length).toBeGreaterThan(3);
    // The middle of each line box, on the sheet (flow y runs leftward from
    // the page's right edge).
    const middles = lines.map((l) => W - (l.bbox.y + l.bbox.height / 2));
    const centres = paintedCentres(page, doc).filter((c) => /\p{Script=Han}/u.test(c.text) && c.em === 10);
    expect(centres.length).toBeGreaterThan(20);
    for (const c of centres) {
      const nearest = Math.min(...middles.map((mx) => Math.abs(mx - c.x)));
      expect(nearest).toBeLessThan(1e-6);
    }
    // The first column as far from the right edge of the type area as the
    // pitch leaves on either side of a character: (16 − 10) / 2.
    const areaRight = W - page.contentArea.y;
    expect(Math.max(...centres.map((c) => c.x)) + 5).toBeCloseTo(areaRight - 3, 6);
  });

  it('a heading of a larger size: its characters in the middle of its line box', () => {
    const doc = buildDocument({ markdown: `# 甄士隱夢幻識通靈\n\n${HLM}` }, base({
      headings: { levels: [{ level: 1, fontSize: pt(20), lineHeight: pt(32), breakBefore: { enabled: false } }] },
    }));
    const page = doc.pages[0]!;
    const heading = page.columns[0]!.blocks.find((b) => b.type === 'heading')!;
    const line = heading.lines[0]!;
    const middle = W - (line.bbox.y + line.bbox.height / 2);
    const chars = paintedCentres(page, doc).filter((c) => c.em === 20);
    expect(chars.length).toBe(line.text.length);
    for (const c of chars) expect(c.x).toBeCloseTo(middle, 6);
  });

  it('an opener title in the flow: in the middle of its own line, whatever its line height', () => {
    for (const [size, lineHeight] of [[40, 1], [13.5, 28.5 / 13.5]] as const) {
      const title: DesignTextElement = {
        kind: 'text', id: 't', content: '{titleText}', fontSize: pt(size), lineHeight, align: 'left', overflow: 'clip',
        placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(20), y: pt(19) } },
      };
      const doc = buildDocument({ markdown: `# 桃園結義\n\n${HLM}` }, base({
        headings: { levels: [{ level: 1, breakBefore: { enabled: false }, advancedDesign: { enabled: true, minHeight: pt(95), slot: { elements: [title] } } }] },
      }));
      const page = doc.pages[0]!;
      const slot = page.openerBand ?? page.columns[0]!.blocks.find((b) => b.designOverlay)!.designOverlay!;
      const block = slot.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
      // One line, as tall as the element's box across the page.
      expect(block.lines).toHaveLength(1);
      const middle = W - (block.bbox.y + block.bbox.height / 2);
      const chars = paintedCentres(page, doc).filter((c) => Math.abs(c.em - size) < 1e-9);
      expect(chars.length, `${size}`).toBe(4);
      for (const c of chars) expect(c.x, `${size}/${lineHeight}`).toBeCloseTo(middle, 6);
    }
  });

  it('a fore-edge head set down the sheet: in the middle of its box', () => {
    const head: DesignTextElement = { kind: 'text', id: 'head', content: '紅樓夢', writingMode: 'vertical-rl', fontSize: pt(8), lineHeight: 2, overflow: 'clip', placement: { anchor: { to: 'outer', edge: 'top' }, offset: { y: { value: 4, unit: 'em' } } } };
    for (const writingMode of ['vertical-rl', 'horizontal-tb'] as const) {
      const doc = buildDocument({ markdown: HLM }, base({ layout: { writingMode, layoutType: 'single' }, header: { elements: [head] } }));
      const page = doc.pages[0]!;
      const block = page.header!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
      expect(block.vertical).toBeDefined();
      expect(block.bbox.width).toBeCloseTo(16, 6);
      const chars = paintedCentres(page, doc).filter((c) => c.em === 8);
      expect(chars.map((c) => c.text).join('')).toBe('紅樓夢');
      for (const c of chars) expect(c.x, writingMode).toBeCloseTo(block.bbox.x + block.bbox.width / 2, 6);
    }
  });
});
