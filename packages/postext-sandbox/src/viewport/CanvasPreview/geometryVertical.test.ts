import { describe, expect, it } from 'vitest';
import { buildDocument, flowToPage, pageToFlow, type PostextConfig } from 'postext';
import { pixelToSourceOffset, designImageFileIdAtPixel } from './geometry';
import { groupPagesIntoRows } from './layoutUtils';

// CJK characters 1 em, anything else ½ em, at the font's size.
const SIZE_RE = /(\d*\.?\d+)px/;
class StubCtx {
  font = '10px Test';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? 10);
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? em : em / 2;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const TEXT = '此開卷第一回也作者自云因曾歷過一番夢幻之後故將真事隱去而借通靈之說撰此石頭記一書也';

describe('clicking vertical text in the canvas preview', () => {
  const config: PostextConfig = {
    page: { width: pt(200), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    bodyText: { fontSize: pt(10), lineHeight: pt(20), textAlign: 'left', firstLineIndent: pt(0) },
    layout: { writingMode: 'vertical-rl', layoutType: 'single' },
    locale: 'zh-Hant',
  };

  it('maps a click on the third character of the second column to its source offset', () => {
    const doc = buildDocument({ markdown: TEXT }, config);
    const page = doc.pages[0]!;
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    const line = block.lines[1]!;
    // The top of the second column's third cell (the caret goes before
    // the character), in the flow: 2.1 em along the line, in the middle of
    // its line box; then on the sheet.
    const fx = line.bbox.x + 21;
    const fy = line.bbox.y + line.bbox.height / 2;
    const sheet = flowToPage(page, fx, fy);
    // The sheet point is left of the first column's (lines advance leftward)
    // and 21 px down from the top of the content area.
    const firstCol = flowToPage(page, block.lines[0]!.bbox.x, block.lines[0]!.bbox.y + 10);
    expect(sheet.x).toBeLessThan(firstCol.x);
    expect(sheet.y).toBeCloseTo(20 + 21);
    const flow = pageToFlow(page, sheet.x, sheet.y);
    const expected = block.sourceMap![line.plainStart! + 2 - (block.plainPrefixLen ?? 0)]!;
    expect(pixelToSourceOffset(doc, 0, flow.x, flow.y)).toBe(expected);
    expect(TEXT[expected]).toBe(TEXT[line.plainStart! + 2]);
  });

  it('hit-tests a running head on the sheet and an opener in the flow', () => {
    const doc = buildDocument({ markdown: TEXT }, config);
    const page = { ...doc.pages[0]! };
    page.header = { bbox: { x: 20, y: 0, width: 160, height: 20 }, blocks: [{ kind: 'image', bbox: { x: 20, y: 2, width: 16, height: 16 }, fileId: 'logo' }] };
    page.openerBand = { bbox: { x: 20, y: 20, width: 160, height: 40 }, blocks: [{ kind: 'image', bbox: { x: 30, y: 25, width: 20, height: 20 }, fileId: 'art' }] };
    const d = { ...doc, pages: [page] };
    // The header on the sheet: its own coordinates.
    expect(designImageFileIdAtPixel(d, 0, 25, 8)).toBe('logo');
    // The opener in the flow: found through the turned point.
    const at = flowToPage(page, 40, 35);
    expect(designImageFileIdAtPixel(d, 0, at.x, at.y)).toBe('art');
  });
});

describe('spreads of a right-bound book', () => {
  it('groups pages [1] [2 3] [4 5]: the rows are shown reversed, [3 | 2]', () => {
    expect(groupPagesIntoRows(5, 'spread', true)).toEqual([[0], [1, 2], [3, 4]]);
  });
});
