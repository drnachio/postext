import { describe, it, expect } from 'vitest';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter';
import { renderToHtml } from '../../html-backend';
import { buildDocument } from '../../pipeline';
import type { PostextConfig } from '../../types';
import type { VDTDesignSlot, VDTDesignTextBlock } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';

// #637: a design run whose width is its box (a CJK mark that gave up
// blank) paints its glyphs `inkOffset` into it, on canvas and in HTML.
installSizedStub();

function recordingCtx() {
  const calls: { text: string; x: number }[] = [];
  const state = { font: '20px Test', fillStyle: '', strokeStyle: '', lineWidth: 1, letterSpacing: '0px', textBaseline: 'alphabetic' };
  const stack: typeof state[] = [];
  const ctx = {
    ...state,
    save() { stack.push({ ...this }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() {},
    rect() {},
    clip() {},
    measureText(s: string) {
      let w = 0;
      for (const ch of s) w += stubCharWidth(ch, 20);
      return { width: w };
    },
    fillText(text: string, x: number) { calls.push({ text, x }); },
    strokeText() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const slot = (): VDTDesignSlot => ({
  bbox: { x: 0, y: 0, width: 400, height: 40 },
  blocks: [{
    kind: 'text',
    bbox: { x: 10, y: 0, width: 400, height: 30 },
    fontString: '20px Test',
    color: '#111111',
    clip: false,
    lines: [{
      text: '见《说文》，此',
      xOffset: 0,
      baselineY: 20,
      width: 120,
      runs: [
        { text: '见', fontString: '20px Test', width: 20 },
        // An opening bracket that gave up the half em before its glyph.
        { text: '《', fontString: '20px Test', width: 10, inkOffset: -10 },
        { text: '说文', fontString: '20px Test', width: 40 },
        // A closing bracket and a comma that gave up the half em after.
        { text: '》', fontString: '20px Test', width: 10, inkOffset: 0 },
        { text: '，', fontString: '20px Test', width: 10, inkOffset: 0 },
        { text: '此', fontString: '20px Test', width: 20 },
      ],
    }],
  } as VDTDesignTextBlock],
});

describe('CJK design runs (#637)', () => {
  it('canvas paints each glyph at x + inkOffset and advances by the box', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, slot());
    const at = (t: string) => calls.find((c) => c.text === t || c.text.startsWith(t))!.x;
    expect(at('见')).toBe(10);
    expect(at('《')).toBe(20);
    expect(at('说')).toBe(40);
    expect(at('》')).toBe(80);
    expect(at('，')).toBe(90);
    expect(at('此')).toBe(100);
  });

  it('a built heading design sets its Chinese note as boxed runs in HTML', () => {
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const config: PostextConfig = {
      locale: 'zh-Hans',
      page: { width: pt(400), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontSize: pt(20), lineHeight: pt(30), firstLineIndent: pt(0), hyphenation: { enabled: false } },
      headings: {
        levels: [{
          level: 1,
          advancedDesign: {
            enabled: true,
            slot: {
              elements: [{
                kind: 'text', id: 'note', content: '{titleText}', fontSize: pt(20),
                placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(300) } },
              }],
            },
          },
        }],
      },
    } as PostextConfig;
    const doc = buildDocument({ markdown: '# 人物，页码；条目。\n\n正文。' }, config);
    const html = renderToHtml(doc);
    // ， and ； gave up their half em: boxes 10 px wide.
    expect(html).toMatch(/display:inline-block;width:10\.000px;">，</);
    expect(html).toMatch(/display:inline-block;width:10\.000px;">；</);
  });
});
