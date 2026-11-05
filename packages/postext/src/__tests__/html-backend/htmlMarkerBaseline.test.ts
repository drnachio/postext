import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { clearTextWidthCache } from '../../measure/canvas.js';
import { fontSizePxOf } from '../../measure/breakRules.js';
import type { PostextConfig } from '../../types.js';
import { DEFAULT_CENTRAL_BASELINE, type VDTBlock } from '../../vdt.js';
import { elementsOf } from '../htmlText.js';

// A list marker stands where the canvas and the PDF set it: on
// `bulletBaselineY` when it has one, otherwise with its baseline 0.3 em of
// its own size below `bulletY`. A marker box left at `line-height: normal`
// stands it on the face's own ascent, above the text's baseline.

/** A measurer whose faces have a line box, as a browser's has. */
let box: { ascent: number; descent: number } | null = { ascent: 1.06, descent: 0.62 };
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
    return {
      width: s.length * 7,
      ...(box ? { fontBoundingBoxAscent: box.ascent * size, fontBoundingBoxDescent: box.descent * size } : {}),
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Test', fontSize: pt(10), lineHeight: pt(15), textAlign: 'left', hyphenation: { enabled: false } },
  ...extra,
});

/** The declarations of an element's own `style`. */
function styleOf(outer: string): Map<string, string> {
  const style = /style="([^"]*)"/.exec(outer)?.[1] ?? '';
  const decl = new Map<string, string>();
  for (const part of style.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) decl.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return decl;
}

/** Where a browser stands the text of a marker box: `(L + ascent − descent)
 *  / 2` from the top of a box of line height `L`. */
function baselineOfBox(outer: string, sizePx: number): number {
  const decl = styleOf(outer);
  const top = Number(decl.get('top')!.replace('px', ''));
  const lineHeight = Number(decl.get('line-height')!.replace('px', ''));
  return top + (lineHeight + (box!.ascent - box!.descent) * sizePx) / 2;
}

const itemOf = (blocks: readonly VDTBlock[]): VDTBlock => blocks.find((b) => b.type === 'listItem')!;

describe('an HTML list marker stands on the PDF\'s baseline', () => {
  beforeEach(() => {
    box = { ascent: 1.06, descent: 0.62 };
    clearTextWidthCache();
  });

  it('a bullet: 0.3 em of its own size below bulletY, whatever its size', () => {
    const doc = buildDocument({ markdown: '- First item' }, config({ unorderedLists: { bulletFontSize: pt(7) } }));
    const item = itemOf(doc.blocks);
    const size = fontSizePxOf(item.bulletFontString!);
    const marker = elementsOf(renderToHtml(doc), '<div class="pt-bullet"', '</div>')[0]!.outer;
    expect(baselineOfBox(marker, size)).toBeCloseTo(item.bulletY! + size * 0.3, 6);
  });

  it('a number, its prefix and its separator', () => {
    const doc = buildDocument({ markdown: '1. First item' }, config({
      orderedLists: { prefix: '(', separator: ')', separatorFontFamily: 'Other', separatorColor: { hex: '#FF0000', model: 'hex' } },
    }));
    const item = itemOf(doc.blocks);
    const html = renderToHtml(doc);
    const number = elementsOf(html, '<div class="pt-bullet"', '</div>')[0]!.outer;
    const size = fontSizePxOf(item.bulletFontString!);
    expect(baselineOfBox(number, size)).toBeCloseTo(item.bulletY! + size * 0.3, 6);
    const runs = elementsOf(html, '<div class="pt-separator"', '</div>');
    expect(runs).toHaveLength(2);
    const separatorSize = fontSizePxOf(item.separatorFontString!);
    for (const run of runs) expect(baselineOfBox(run.outer, separatorSize)).toBeCloseTo(item.bulletY! + separatorSize * 0.3, 6);
  });

  it('writes the line height after `font:`, which would reset it to `normal`', () => {
    const doc = buildDocument({ markdown: '- First item' }, config());
    const marker = elementsOf(renderToHtml(doc), '<div class="pt-bullet"', '</div>')[0]!.outer;
    const style = /style="([^"]*)"/.exec(marker)![1]!;
    expect(style.indexOf('line-height:')).toBeGreaterThan(style.indexOf('font:'));
  });

  it('keeps the box at the line\'s top where the measurer gives no face metrics', () => {
    box = null;
    clearTextWidthCache();
    const doc = buildDocument({ markdown: '- First item' }, config());
    const item = itemOf(doc.blocks);
    const marker = elementsOf(renderToHtml(doc), '<div class="pt-bullet"', '</div>')[0]!.outer;
    const decl = styleOf(marker);
    expect(decl.get('top')).toBe(`${item.lines[0]!.bbox.y}px`);
    expect(decl.has('line-height')).toBe(false);
  });

  it('on a vertical page, the marker\'s axis is its baseline less its face\'s axis', () => {
    const doc = buildDocument({ markdown: '- \u5929\u5730\u7384\u9ec4' }, config({ locale: 'zh', layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const page = doc.pages[0]!;
    const item = itemOf(page.columns[0]!.blocks);
    const size = fontSizePxOf(item.bulletFontString!);
    const marker = elementsOf(renderToHtml(doc), 'class="pt-bullet"', '</div>')[0]!.outer;
    const lineHeight = Number(/line-height:([\d.]+)px/.exec(marker)![1]);
    expect(lineHeight / 2).toBeCloseTo(item.bulletY! + size * 0.3 - DEFAULT_CENTRAL_BASELINE * size - item.lines[0]!.bbox.y, 2);
  });

  it('a contents number stays on the title\'s baseline, in the line\'s own line height', () => {
    const doc = buildDocument({ markdown: '- First item' }, config());
    const item = itemOf(doc.blocks);
    const line = item.lines[0]!;
    const marked = { ...doc, pages: doc.pages.map((p) => ({ ...p, columns: p.columns.map((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === item.id ? { ...b, bulletBaselineY: line.baseline } : b)) })) })) };
    const html = renderToHtml(marked);
    const decl = styleOf(elementsOf(html, '<div class="pt-bullet"', '</div>')[0]!.outer);
    expect(decl.get('top')).toBe(`${line.bbox.y}px`);
    const lineBox = elementsOf(html, '<div class="pt-line"', '>')[0]!.outer;
    expect(lineBox).toContain(`line-height:${decl.get('line-height')}`);
  });
});
