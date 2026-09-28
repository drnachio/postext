import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// A justified CJK line is spread per segment (`VDTLineSegment.tracking`):
// the PDF paints each tracked segment with that character spacing (`Tc`)
// at the x the layout gave it, and resets the spacing after it.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// CJK characters 16 px, anything else 8 px.
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? 16 : 8;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  locale: 'zh-Hans',
  page: { width: pt(221), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(16), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
};

async function contentOf(doc: VDTDocument): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

describe('CJK justification in the PDF', () => {
  it('paints every tracked segment with its character spacing, at its x', async () => {
    const doc = buildDocument({ markdown: '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借「通灵」之说，撰此《石头记》一书也。' }, config);
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    const expected: { x: number; tc: number }[] = [];
    for (const line of block.lines) {
      let x = line.bbox.x;
      for (const seg of line.segments!) {
        // A compressed mark is painted before its box (`inkOffset`).
        if (seg.tracking !== undefined) expected.push({ x: x + (seg.inkOffset ?? 0), tc: seg.tracking });
        x += seg.width;
      }
    }
    expect(expected.length).toBeGreaterThan(3);
    const content = await contentOf(doc);
    // Each tracked text object: `t Tc` before it, its text matrix at x, and
    // `0 Tc` after it.
    const shown = [...content.matchAll(/(-?[\d.]+) Tc\s+q[\s\S]*?1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm[\s\S]*?ET\s+Q\s+(-?[\d.]+) Tc/g)]
      .map((m) => ({ tc: Number(m[1]), x: Number(m[2]), reset: Number(m[4]) }));
    expect(shown.length).toBe(expected.length);
    shown.forEach((s, i) => {
      expect(s.tc).toBeCloseTo(expected[i]!.tc, 3);
      expect(s.x).toBeCloseTo(expected[i]!.x, 2);
      expect(s.reset).toBe(0);
    });
  }, 60_000);

  it('makes only the linked characters of a Chinese line a live link', async () => {
    const doc = buildDocument({ markdown: '请点击[这里](https://example.org)查看详情，然后返回首页继续阅读本书的其他章节。' }, config);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
    const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'));
    expect(annots).toBeInstanceOf(PDFArray);
    const rects: number[][] = [];
    for (let i = 0; i < (annots as PDFArray).size(); i++) {
      const a = (annots as PDFArray).lookup(i);
      if (!(a instanceof PDFDict)) continue;
      const rect = a.lookup(PDFName.of('Rect'));
      if (rect instanceof PDFArray) rects.push(rect.asArray().map((n) => (n as PDFNumber).asNumber()));
    }
    expect(rects.length).toBe(1);
    // 这里: two 16 px characters and their share of the spread, not the line.
    const w = rects[0]![2]! - rects[0]![0]!;
    expect(w).toBeGreaterThanOrEqual(32);
    expect(w).toBeLessThan(3 * 16);
  }, 60_000);
});
