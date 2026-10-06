import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, columnRuleSegments } from 'postext';
import type { PostextConfig, VDTDesignTextBlock, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

/** The page's content stream operators, inflated. */
function pageContent(page: PDFPage): string {
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const stream = page.doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return '';
      const filter = stream.dict.get(PDFName.of('Filter'));
      const bytes = filter ? inflateSync(stream.contents) : stream.contents;
      return new TextDecoder('latin1').decode(bytes);
    })
    .join('\n');
}

/** Stroked lines (`x y m x y l S`) of a content stream, with the stroke
 *  colour and width in force, in PDF points. */
function strokedLines(content: string): { x1: number; y1: number; x2: number; y2: number; rgb: string; width: number }[] {
  const out: { x1: number; y1: number; x2: number; y2: number; rgb: string; width: number }[] = [];
  let rgb = '';
  let width = 1;
  const tokens = content.split(/\s+/);
  const stack: string[] = [];
  for (const tok of tokens) {
    if (tok === 'RG') rgb = stack.slice(-3).map((v) => Number(v).toFixed(3)).join(' ');
    else if (tok === 'w') width = Number(stack[stack.length - 1]);
    else if (tok === 'S') {
      // … x1 y1 m x2 y2 l S
      const l = stack.lastIndexOf('l');
      const m = stack.lastIndexOf('m');
      if (l > 0 && m > 0) {
        out.push({ x1: Number(stack[m - 2]), y1: Number(stack[m - 1]), x2: Number(stack[l - 2]), y2: Number(stack[l - 1]), rgb, width });
      }
    }
    stack.push(tok);
    if (stack.length > 64) stack.splice(0, 32);
  }
  return out;
}

const BODY = 'Body text that runs on for a while and fills the columns of the section. '.repeat(40);

describe('a heading style\'s column rule in the PDF (EF-112)', () => {
  const config: PostextConfig = {
    page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    locale: 'en-us',
    header: { elements: [] },
    footer: { elements: [] },
    headingStyles: [{
      id: 'two', breakBefore: { enabled: true, parity: 'any' }, span: 'page',
      layout: { layoutType: 'double', gutterWidth: pt(20), columnRule: { enabled: true, color: hex('#e08a1e'), lineWidth: pt(3) } },
    }],
  };
  let doc: VDTDocument;
  let pdf: PDFDocument;
  beforeAll(async () => {
    doc = buildDocument({ markdown: `# A\n\nText of the first section.\n\n## B {style="two"}\n\n${BODY}` }, config);
    pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false, outlines: false }));
  }, 60_000);

  it('strokes the section\'s rule in its colour and width, under its opener band', () => {
    const index = doc.pages.findIndex((p) => p.columnRule?.enabled);
    expect(index).toBeGreaterThan(0);
    const page = doc.pages[index]!;
    const vertical = strokedLines(pageContent(pdf.getPage(index))).filter((l) => Math.abs(l.x1 - l.x2) < 0.01);
    expect(vertical).toHaveLength(1);
    expect(vertical[0]!.rgb).toBe('0.878 0.541 0.118');
    // 3pt at the layout's dpi, back in points.
    expect(vertical[0]!.width).toBeCloseTo(3, 3);
    // The rule starts where the text does, under the band (EF-101).
    const scale = 72 / doc.config.page.dpi;
    const seg = columnRuleSegments(page.columns)[0]!;
    const band = page.openerBand!;
    expect(seg.top).toBeCloseTo(band.bbox.y + band.bbox.height, 5);
    const pageHeightPt = pdf.getPage(index).getHeight();
    expect(Math.max(vertical[0]!.y1, vertical[0]!.y2)).toBeCloseTo(pageHeightPt - seg.top * scale, 2);
  });

  it('strokes no rule on the document\'s single-column pages', () => {
    expect(doc.pages[0]!.columnRule).toBeUndefined();
    const vertical = strokedLines(pageContent(pdf.getPage(0))).filter((l) => Math.abs(l.x1 - l.x2) < 0.01);
    expect(vertical).toHaveLength(0);
  });
});

describe('column rules of a multiple layout in the PDF (#505)', () => {
  it.each([3, 4, 6])('strokes one rule in each of the %i columns\' gutters, where the layout puts them', async (n) => {
    const config: PostextConfig = {
      page: { width: pt(800), height: pt(600), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
      layout: { layoutType: 'multiple', columnCount: n, gutterWidth: pt(12), columnRule: { enabled: true, color: hex('#2266aa'), lineWidth: pt(1) } },
      locale: 'en-us',
      header: { elements: [] },
      footer: { elements: [] },
    };
    const doc = buildDocument({ markdown: `${BODY}\n\n${BODY}\n\n${BODY}\n\n${BODY}\n\n${BODY}` }, config);
    const page = doc.pages[0]!;
    expect(page.columns.filter((c) => c.blocks.length > 0)).toHaveLength(n);
    const segments = columnRuleSegments(page.columns);
    expect(segments).toHaveLength(n - 1);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false, outlines: false }));
    const vertical = strokedLines(pageContent(pdf.getPage(0)))
      .filter((l) => Math.abs(l.x1 - l.x2) < 0.01 && l.rgb === '0.133 0.400 0.667');
    expect(vertical).toHaveLength(n - 1);
    // Each rule in the middle of its gutter, top to bottom as the layout says.
    const scale = 72 / doc.config.page.dpi;
    const heightPt = pdf.getPage(0).getHeight();
    const xs = vertical.map((l) => l.x1).sort((a, b) => a - b);
    const width = (740 - (n - 1) * 12) / n;
    xs.forEach((x, i) => expect(x).toBeCloseTo(30 + (i + 1) * width + i * 12 + 6, 2));
    for (const seg of segments) {
      const line = vertical.find((l) => Math.abs(l.x1 - seg.x * scale) < 0.01)!;
      expect(line).toBeDefined();
      expect(Math.max(line.y1, line.y2)).toBeCloseTo(heightPt - seg.top * scale, 2);
      expect(Math.min(line.y1, line.y2)).toBeCloseTo(heightPt - seg.bottom * scale, 2);
      expect(line.width).toBeCloseTo(1, 3);
    }
  }, 60_000);
});

describe('justified design text in the PDF (EF-109)', () => {
  it('paints each word of a justified line where the layout put it', async () => {
    const config: PostextConfig = {
      page: { width: pt(400), height: pt(500), margins: { top: pt(60), bottom: pt(20), left: pt(40), right: pt(40) } },
      layout: { layoutType: 'single' },
      locale: 'en-us',
      footer: { elements: [] },
      header: {
        elements: [{
          kind: 'text', id: 'lead', align: 'justify', overflow: 'wrap', fontSize: pt(10), fontFamily: 'Lora',
          content: 'Long before there were title pages there were readers who marked the scrolls by hand.',
          placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(150) } },
        }],
      },
    };
    const doc = buildDocument({ markdown: 'Body.' }, config);
    const block = doc.pages[0]!.header!.blocks[0] as VDTDesignTextBlock;
    const first = block.lines[0]!;
    expect(first.wordSpacingPx).toBeGreaterThan(0);
    const bytes = await renderToPdf(doc, { fontProvider, accessible: false, outlines: false });
    const content = pageContent((await PDFDocument.load(bytes)).getPage(0));
    // One text object per run of the first line, at the run's x.
    const scale = 72 / doc.config.page.dpi;
    let x = block.bbox.x + first.xOffset;
    const tds = [...content.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].map((m) => Number(m[1]));
    for (const run of first.runs!) {
      expect(tds.some((t) => Math.abs(t - x * scale) < 0.01)).toBe(true);
      x += run.width;
    }
    // The last run ends at the right edge of the box.
    expect(x).toBeCloseTo(block.bbox.x + block.bbox.width, 3);
  });
});
