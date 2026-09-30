import { describe, it, expect } from 'vitest';
import { buildDocument, renderToHtml, flowRectToPage } from '../../index';
import type { PostextConfig, Dimension } from '../../types';
import { installSizedStub } from './stub';
import { verticalSpans } from './verticalSpans';

installSizedStub();

// Issue #191: a vertical page's HTML is its flow in one box turned a
// quarter turn clockwise, each text line turned back upright inside it and
// set with `writing-mode: vertical-rl`.

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  cjk: { latinSpacing: { value: 0, unit: 'em' } },
  locale: 'zh-Hant',
  ...extra,
});

/** A 2D affine matrix [a b c d e f] of a CSS transform list of translate()
 *  and rotate(±90deg). */
function cssMatrix(transform: string): number[] {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (a: number[], b: number[]) => [
    a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
  for (const f of transform.matchAll(/(translate|rotate)\(([^)]*)\)/g)) {
    if (f[1] === 'translate') {
      const [x, y] = f[2]!.split(',').map((v) => parseFloat(v));
      m = mul(m, [1, 0, 0, 1, x!, y ?? 0]);
    } else {
      const t = (parseFloat(f[2]!) * Math.PI) / 180;
      m = mul(m, [Math.round(Math.cos(t)), Math.round(Math.sin(t)), -Math.round(Math.sin(t)), Math.round(Math.cos(t)), 0, 0]);
    }
  }
  return m;
}

describe('vertical pages in the HTML (#191)', () => {
  it('turns the flow onto the sheet and each line back upright, set vertically', () => {
    const doc = buildDocument({ markdown: '此開卷第一回也。作者自云。' }, config());
    const page = doc.pages[0]!;
    const html = renderToHtml(doc, { mode: 'single' });
    const flow = /class="pt-flow" style="([^"]*)"/.exec(html)![1]!;
    const frame = cssMatrix(/transform:([^;]*)/.exec(flow)![1]!);
    // translate(W, 0) rotate(90deg): a flow point (x, y) lands at (W − y, x).
    expect(frame).toEqual([0, 1, -1, 0, page.width, 0]);
    const line = page.columns[0]!.blocks[0]!.lines[0]!;
    // The line box, then the box turned back upright inside it.
    const m = new RegExp(`class="pt-line"[^>]*style="position:absolute;left:${line.bbox.x}px;top:${line.bbox.y}px;width:([\\d.]+)px;height:${line.bbox.height}px;"><div style="([^"]*)">`).exec(html)!;
    expect(m).not.toBeNull();
    const inner = m[2]!;
    expect(inner).toContain('writing-mode:vertical-rl');
    expect(inner).toContain('text-orientation:mixed');
    // The upright box covers the line's rectangle on the sheet, upright.
    const back = cssMatrix(/transform:([^;]*)/.exec(inner)![1]!);
    const width = parseFloat(m[1]!);
    const h = line.bbox.height;
    // A corner of the upright box (its top left, physically) through both
    // frames: the line's physical top left.
    const apply = (t: number[], x: number, y: number) => [t[0]! * x + t[2]! * y + t[4]!, t[1]! * x + t[3]! * y + t[5]!];
    const [lx, ly] = apply(back, 0, 0);
    const [px, py] = apply(frame, line.bbox.x + lx!, line.bbox.y + ly!);
    const sheet = flowRectToPage(page, { x: line.bbox.x, y: line.bbox.y, width, height: h });
    expect(px).toBeCloseTo(sheet.x, 6);
    expect(py).toBeCloseTo(sheet.y, 6);
    // Its x axis runs across the sheet to the right: upright.
    const ax = apply(frame, back[0]!, back[1]!).map((v, i) => v - [frame[4]!, frame[5]!][i]!);
    expect(ax).toEqual([1, 0]);
  });

  it('places each segment along the line with top, centred on the column axis', () => {
    const doc = buildDocument({ markdown: '第:tcy[12]回，:upright[GDP]與:sideways[34]。' }, config());
    const html = renderToHtml(doc, { mode: 'single' });
    expect(html).toContain('<span style="text-combine-upright:all;">12</span>');
    expect(html).toContain('<span style="text-orientation:upright;">GDP</span>');
    expect(html).toContain('<span style="text-orientation:sideways;">34</span>');
    const runs = verticalSpans(html);
    expect(runs.length).toBeGreaterThan(2);
    const line = doc.pages[0]!.columns[0]!.blocks[0]!.lines[0]!;
    // line-height = 2 × the axis's distance from the flow's top edge of the
    // line box: baseline less the central axis (0.38 em).
    expect(runs[0]!.lineHeight).toBeCloseTo(2 * (line.baseline - line.bbox.y - 0.38 * 10), 3);
  });

  it('centres a run in another face on the column axis, as the plain text', () => {
    // A run in its own face writes a `font` shorthand, which resets
    // `line-height`: the run's line height must come after it, or the
    // browser sets the run at `normal` and off the axis.
    const doc = buildDocument({ markdown: '此事**不可輕忽**，*千萬*記取。' }, config());
    const line = doc.pages[0]!.columns[0]!.blocks[0]!.lines[0]!;
    const runs = verticalSpans(renderToHtml(doc, { mode: 'single' }));
    const bold = runs.find((r) => r.text === '不可輕忽')!;
    const plain = runs.find((r) => r.text.startsWith('此事'))!;
    expect(bold.size).toBeDefined();
    expect(bold.axis).toBeCloseTo(line.baseline - line.bbox.y - 0.38 * 10, 3);
    expect(bold.axis).toBeCloseTo(plain.axis, 3);
    for (const r of runs) expect(Number.isFinite(r.lineHeight)).toBe(true);
  });

  it('wraps a short number in one cell (cjk.uprightDigits)', () => {
    const doc = buildDocument({ markdown: '今天是2026年9月28日。' }, config());
    const html = renderToHtml(doc, { mode: 'single' });
    expect(html).toContain('<span style="text-combine-upright:all;">28</span>');
    expect(html).toContain('<span style="text-combine-upright:all;">9</span>');
    expect(html).not.toContain('<span style="text-combine-upright:all;">2026</span>');
  });

  it('sets a design text of the flow where its block is, as the canvas does (#200)', () => {
    // An opener lowered 20 pt down the column: its line box starts at the
    // block's own top edge in the flow, not at the flow's origin.
    const cfg = config({
      headings: {
        levels: [{
          level: 1,
          span: 'page',
          breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: {
            enabled: true,
            slot: { elements: [{ kind: 'text', id: 'hui', content: '第一回', fontFamily: 'Test Serif', fontSize: pt(12), overflow: 'clip', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(20), y: pt(0) }, size: { width: pt(200), height: pt(24) } } }] },
          },
        }],
      },
    });
    const doc = buildDocument({ markdown: '# 甄士隱\n\n此開卷第一回也。' }, cfg);
    const block = doc.pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text')! as import('../../vdt').VDTDesignTextBlock;
    expect(block.bbox.x).toBeGreaterThan(20);
    const html = renderToHtml(doc, { mode: 'single' });
    const m = new RegExp(`left:${block.bbox.x}px;top:${block.bbox.y}px;[^"]*"><div style="position:absolute;left:(-?[\\d.]+)px;top:(-?[\\d.]+)px;`).exec(html)!;
    expect(m).not.toBeNull();
    const line = block.lines[0]!;
    const size = 12;
    expect(parseFloat(m[1]!)).toBeCloseTo(line.xOffset, 3);
    expect(parseFloat(m[2]!)).toBeCloseTo(line.baselineY - block.bbox.y - size * 1.5, 3);
  });

  it('keeps running heads on the sheet and horizontal pages as they were', () => {
    const doc = buildDocument({ markdown: '此開卷第一回也。' }, config({
      header: { elements: [{ kind: 'text', id: 'rh', content: '紅樓夢', fontSize: pt(8), overflow: 'clip', placement: { anchor: { to: 'container', edge: 'bottom-left' } } }] },
    }));
    const html = renderToHtml(doc, { mode: 'single' });
    const flowEnd = html.indexOf('</div>', html.lastIndexOf('class="pt-flow"'));
    expect(html.lastIndexOf('紅樓夢')).toBeGreaterThan(flowEnd);
    const horizontal = renderToHtml(buildDocument({ markdown: '此開卷第一回也。' }, config({ layout: { writingMode: 'horizontal-tb', layoutType: 'single' } })), { mode: 'single' });
    expect(horizontal).not.toContain('pt-flow');
    expect(horizontal).not.toContain('vertical-rl');
  });
});
