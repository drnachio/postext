import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDesignTextBlock, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// A 破折号 (——) in Chinese text prints as one rule over its two ems: each
// dash is shown with horizontal scaling (`Tz`) from where the layout put
// its glyph, and the scaling is reset after it.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// CJK characters 16 px; the em dash a proportional 0.8 em stroke with ink
// from 0.05 to 0.75 em (centred as a Latin dash is, low on the line); 國
// fills its em box.
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    let w = 0;
    for (const ch of s) w += ch === '—' ? 12.8 : ch === ' ' ? 4 : ch.codePointAt(0)! >= 0x2e80 ? 16 : 8;
    if (s === '—') return { width: w, actualBoundingBoxLeft: -0.8, actualBoundingBoxRight: 12, actualBoundingBoxAscent: 4.6, actualBoundingBoxDescent: -3.8 };
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: 14, actualBoundingBoxDescent: 2 };
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
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(16), lineHeight: pt(24), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk: { punctuationWidth: 'fullwidth' },
};

async function contentOf(doc: VDTDocument): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

describe('a 破折号 in the PDF', () => {
  it('shows each dash stretched from its ink offset and resets the scaling after it', async () => {
    const doc = buildDocument({ markdown: '女子——一一细考' }, config);
    const line = doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;
    const dashes = line.segments!.filter((s) => s.text === '—');
    expect(dashes).toHaveLength(2);
    // (16 − 0.8 + 0.32) / (12 − 0.8): the ink from 0.8 px into the pair to
    // 0.8 px before its end, 0.32 px past the join on each side.
    const scale = (16 - 0.8 + 0.32) / 11.2;
    for (const d of dashes) expect(d.inkScale).toBeCloseTo(scale);
    const content = await contentOf(doc);
    const on = [...content.matchAll(/([\d.]+) Tz/g)].map((m) => Number(m[1]));
    expect(on.filter((v) => Math.abs(v - scale * 100) < 0.01)).toHaveLength(2);
    expect(on.filter((v) => v === 100)).toHaveLength(2);
    // Each dash's text object starts at its box plus its ink offset, raised
    // by its baseline shift.
    const tms = [...content.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const x0 = line.bbox.x + 32;
    for (const [i, d] of dashes.entries()) {
      const x = x0 + 16 * i + d.inkOffset!;
      const y = 400 - (line.baseline + d.baselineShift!);
      expect(tms.some(([tx, ty]) => Math.abs(tx! - x) < 1e-3 && Math.abs(ty! - y) < 1e-3), `dash ${i} at ${x}, ${y}`).toBe(true);
    }
  }, 60_000);

  it('shows the dashes of a vertical line turned with the frame, stretched down the column (#191)', async () => {
    const doc = buildDocument({ markdown: '女子——一一细考' }, { ...config, layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    const line = doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;
    const dashes = line.segments!.filter((s) => s.text === '—');
    expect(dashes).toHaveLength(2);
    const scale = (16 - 0.8 + 0.32) / 11.2;
    for (const d of dashes) expect(d.inkScale).toBeCloseTo(scale);
    const content = await contentOf(doc);
    // Each dash: the scaling on, its own text object with the horizontal
    // font under an unturned text matrix (the flow's frame turns it), the
    // scaling off.
    const shows = [...content.matchAll(/([\d.]+) Tz\s+q[\s\S]*?BT[\s\S]*?\/(\S+) [\d.]+ Tf[\s\S]*?(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm[\s\S]*?ET\s+Q\s+100 Tz/g)];
    expect(shows).toHaveLength(2);
    for (const m of shows) {
      expect(Number(m[1])).toBeCloseTo(scale * 100, 2);
      expect(m[2]!.endsWith('V')).toBe(false);
      expect([m[3], m[4], m[5], m[6]].map(Number)).toEqual([1, 0, 0, 1]);
    }
    // One em apart down the line, from where the layout put each glyph.
    const xs = shows.map((m) => Number(m[7]));
    expect(xs[1]! - xs[0]!).toBeCloseTo(16 + dashes[1]!.inkOffset! - dashes[0]!.inkOffset!, 3);
  }, 60_000);

  // #652: the running heads, heading designs and comic balloons a design
  // text block carries.
  const withHead = (vertical: boolean): PostextConfig => ({
    ...config,
    header: {
      elements: [{
        kind: 'text', id: 'head', content: '女子——一一', fontFamily: 'Lora', fontSize: pt(16),
        placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(20), y: pt(2) } },
        ...(vertical ? { writingMode: 'vertical-rl' as const } : {}),
      }],
    },
  } as PostextConfig);
  const headOf = (doc: VDTDocument): VDTDesignTextBlock => doc.pages[0]!.header!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;

  it('stretches the dashes of a design text as it does the body’s (#652)', async () => {
    const doc = buildDocument({ markdown: '正文' }, withHead(false));
    const head = headOf(doc);
    const line = head.lines[0]!;
    const dashes = line.runs!.filter((r) => r.text === '—');
    expect(dashes).toHaveLength(2);
    const scale = (16 - 0.8 + 0.32) / 11.2;
    for (const d of dashes) expect(d.inkScale).toBeCloseTo(scale);
    const content = await contentOf(doc);
    const on = [...content.matchAll(/([\d.]+) Tz/g)].map((m) => Number(m[1]));
    expect(on.filter((v) => Math.abs(v - scale * 100) < 0.01)).toHaveLength(2);
    expect(on.filter((v) => v === 100)).toHaveLength(2);
    // Each dash's text object starts at its box plus its ink offset, raised
    // by its baseline shift.
    const tms = [...content.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].map((m) => [Number(m[1]), Number(m[2])]);
    let x = head.bbox.x + line.xOffset;
    for (const run of line.runs!) {
      if (run.inkScale !== undefined) {
        const gx = x + run.inkOffset!;
        const gy = 400 - (line.baselineY + run.baselineShift!);
        expect(tms.some(([tx, ty]) => Math.abs(tx! - gx) < 1e-3 && Math.abs(ty! - gy) < 1e-3), `dash at ${gx}, ${gy}`).toBe(true);
      }
      x += run.width;
    }
  }, 60_000);

  it('shows the dashes of a vertical design text turned with its frame, stretched down the column (#652)', async () => {
    const doc = buildDocument({ markdown: '正文' }, withHead(true));
    const head = headOf(doc);
    expect(head.vertical).toBeDefined();
    const dashes = head.lines[0]!.runs!.filter((r) => r.text === '—');
    expect(dashes).toHaveLength(2);
    const scale = (16 - 0.8 + 0.32) / 11.2;
    for (const d of dashes) expect(d.inkScale).toBeCloseTo(scale);
    const content = await contentOf(doc);
    const shows = [...content.matchAll(/([\d.]+) Tz\s+q[\s\S]*?BT[\s\S]*?\/(\S+) [\d.]+ Tf[\s\S]*?(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm[\s\S]*?ET\s+Q\s+100 Tz/g)];
    expect(shows).toHaveLength(2);
    for (const m of shows) {
      expect(Number(m[1])).toBeCloseTo(scale * 100, 2);
      // The horizontal glyph under an unturned text matrix: the block's
      // frame turns it.
      expect(m[2]!.endsWith('V')).toBe(false);
      expect([m[3], m[4], m[5], m[6]].map(Number)).toEqual([1, 0, 0, 1]);
    }
    const xs = shows.map((m) => Number(m[7]));
    expect(xs[1]! - xs[0]!).toBeCloseTo(16 + dashes[1]!.inkOffset! - dashes[0]!.inkOffset!, 3);
  }, 60_000);
});
