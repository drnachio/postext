import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// Issue #191: vertical text in the PDF. Upright characters are shown
// through an Identity-V twin of their font (the same CIDFont, the same
// ToUnicode), in their vertical forms where the font has one; Latin words
// and long numbers run sideways; a short number stands in one cell.

const FIXTURES = new URL('./fixtures/cjk/', import.meta.url);
const TC = new Uint8Array(fs.readFileSync(new URL('noto-serif-tc-vertical.ttf', FIXTURES)));
const SC = new Uint8Array(fs.readFileSync(new URL('noto-serif-sc-vertical.ttf', FIXTURES)));
const faces = { tc: fontkit.create(Buffer.from(TC)), sc: fontkit.create(Buffer.from(SC)) };
const fontProvider = async (family: string) => (family.includes('SC') ? SC : TC);

/** Measures with the fixture fonts, as a browser would. */
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const f = parseFontString(this.font);
    const face = f?.family.includes('SC') ? faces.sc : faces.tc;
    const run = face.layout(s);
    const k = (f?.sizePx ?? 16) / face.unitsPerEm;
    let w = 0;
    for (const p of run.positions) w += p.xAdvance;
    const b = run.glyphs[0]?.bbox;
    return {
      width: w * k,
      actualBoundingBoxAscent: b ? b.maxY * k : 0,
      actualBoundingBoxDescent: b ? -b.minY * k : 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: w * k,
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (locale: 'zh-Hant' | 'zh-Hans', extra: PostextConfig = {}): PostextConfig => ({
  locale,
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(30) } },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  bodyText: { fontFamily: locale === 'zh-Hant' ? 'Noto Serif TC' : 'Noto Serif SC', fontSize: pt(16), lineHeight: pt(24), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false } },
  headings: { fontFamily: locale === 'zh-Hant' ? 'Noto Serif TC' : 'Noto Serif SC' },
  header: { elements: [] },
  footer: { elements: [] },
  cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { value: 0, unit: 'em' } },
  ...extra,
});

async function render(markdown: string, cfg: PostextConfig, accessible = false) {
  const doc = buildDocument({ markdown }, cfg);
  const bytes = await renderToPdf(doc, { fontProvider, accessible });
  const pdf = await PDFDocument.load(bytes);
  return { doc, pdf, bytes };
}

function pageOps(pdf: PDFDocument, index = 0): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** The page's fonts by resource name: their dictionaries. */
function pageFonts(pdf: PDFDocument, index = 0): Map<string, PDFDict> {
  const fonts = pdf.getPage(index).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  const out = new Map<string, PDFDict>();
  for (const [name, ref] of fonts.entries()) out.set(name.asString().replace(/^\//, ''), pdf.context.lookup(ref as PDFRef, PDFDict));
  return out;
}

/** The embedded font file of a Type0 font, opened with fontkit. */
function embeddedFace(pdf: PDFDocument, type0: PDFDict) {
  const cid = type0.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
  const descriptor = cid.lookup(PDFName.of('FontDescriptor'), PDFDict);
  const file = descriptor.lookup(PDFName.of('FontFile2')) as PDFStream;
  const bytes = decodePDFRawStream(file as PDFRawStream).decode();
  return fontkit.create(Buffer.from(bytes));
}

/** Every upright run shown through a vertical twin: its font name, text
 *  matrix and the glyph ids it shows. */
function uprightShows(ops: string, fonts: Map<string, PDFDict>) {
  const out: Array<{ font: string; tm: number[]; cids: number[]; tj: number[] }> = [];
  let font = '';
  let tm: number[] = [];
  for (const line of ops.split('\n')) {
    const tf = /^\/(\S+) [\d.]+ Tf$/.exec(line);
    if (tf) font = tf[1]!;
    const m = /^([-\d. ]+) Tm$/.exec(line);
    if (m) tm = m[1]!.trim().split(/\s+/).map(Number);
    if (!/ (Tj|TJ)$/.test(line)) continue;
    if (fonts.get(font)?.get(PDFName.of('Encoding')) !== PDFName.of('Identity-V')) continue;
    const hex = [...line.matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => h[1]!).join('');
    const cids: number[] = [];
    for (let i = 0; i < hex.length; i += 4) cids.push(parseInt(hex.slice(i, i + 4), 16));
    const tj = [...line.replace(/<[0-9a-fA-F]+>/g, ' ').replace(/ T[jJ]$/, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0]));
    out.push({ font, tm, cids, tj });
  }
  return out;
}

describe('vertical text in the PDF (#191)', () => {
  it('shows upright characters through an Identity-V twin sharing the font', async () => {
    const { pdf } = await render('此開卷第一回也。', config('zh-Hant'));
    const fonts = pageFonts(pdf);
    const twins = [...fonts.values()].filter((f) => f.get(PDFName.of('Encoding')) === PDFName.of('Identity-V'));
    expect(twins).toHaveLength(1);
    const horizontal = [...fonts.values()].find((f) => f.get(PDFName.of('Encoding')) === PDFName.of('Identity-H'));
    // The twin is written with its font: same CIDFont, same ToUnicode.
    const cidOf = (f: PDFDict) => f.lookup(PDFName.of('DescendantFonts'), PDFArray).get(0);
    if (horizontal) {
      expect(cidOf(twins[0]!)).toBe(cidOf(horizontal));
      expect(twins[0]!.get(PDFName.of('ToUnicode'))).toBe(horizontal.get(PDFName.of('ToUnicode')));
    }
    const cid = twins[0]!.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
    expect(cid.lookup(PDFName.of('DW2'), PDFArray).asArray().map(String)).toEqual(['880', '-1000']);
    // One show for the whole line, its text matrix turned back upright.
    const shows = uprightShows(pageOps(pdf), fonts);
    expect(shows).toHaveLength(1);
    expect(shows[0]!.tm.slice(0, 4)).toEqual([0, 1, -1, 0]);
    expect(shows[0]!.cids).toHaveLength(8);
  });

  it('sets a mainland 。 in its vertical form and a Taiwan one as it is; 「 in its vertical form in both', async () => {
    for (const [locale, face] of [['zh-Hans', faces.sc], ['zh-Hant', faces.tc]] as const) {
      const { pdf } = await render('此「一」也。', config(locale));
      const fonts = pageFonts(pdf);
      const shows = uprightShows(pageOps(pdf), fonts);
      const cids = shows.flatMap((s) => s.cids);
      expect(cids).toHaveLength(6);
      const embedded = embeddedFace(pdf, fonts.get(shows[0]!.font)!);
      const bbox = (cid: number) => embedded.getGlyph(cid).bbox;
      // 「: the vertical form spans the cell across, its hook at the top.
      const bracket = bbox(cids[1]!);
      expect(bracket.maxX - bracket.minX).toBeGreaterThan(600);
      const vBracket = face.layout('「', ['vert']).glyphs[0]!.bbox;
      expect(bracket.minY).toBe(vBracket.minY);
      const stop = bbox(cids[5]!);
      if (locale === 'zh-Hans') {
        // The top right quadrant of the cell.
        expect(stop.minX).toBeGreaterThan(500);
        expect(stop.minY).toBeGreaterThan(400);
      } else {
        // Centred.
        expect((stop.minX + stop.maxX) / 2).toBeCloseTo(500, -2);
        expect((stop.minY + stop.maxY) / 2).toBeCloseTo(380, -2);
      }
    }
  });

  it('places the pen so every em box is centred on the column axis, one em apart', async () => {
    const { doc, pdf } = await render('此開卷也', config('zh-Hant'));
    const page = doc.pages[0]!;
    const line = page.columns[0]!.blocks[0]!.lines[0]!;
    const show = uprightShows(pageOps(pdf), pageFonts(pdf))[0]!;
    const axisFlowY = line.baseline - (page.flow!.centralBaselines?.['Noto Serif TC'] ?? 0.38) * 16;
    // Flow points: x along the line, y from the frame's top (y up).
    expect(show.tm[5]).toBeCloseTo(420 - axisFlowY, 3);
    // The pen at the vertical origin (0.88 em above the baseline): the cell
    // top when the em box's centre is 0.38 em above it.
    const central = page.flow!.centralBaselines?.['Noto Serif TC'] ?? 0.38;
    expect(show.tm[4]).toBeCloseTo(line.bbox.x + 16 * (0.5 - (0.88 - central)), 3);
  });

  it('spreads a justified vertical line with TJ numbers that move the pen down', async () => {
    const cfg = config('zh-Hant');
    cfg.bodyText = { ...cfg.bodyText, textAlign: 'justify' };
    // A full line is one em short of the measure: the gaps take it.
    const text = '此開卷第一回也作者自云因曾歷過一番夢幻之後故將真事隱去而借通靈之說撰石頭記書';
    const { pdf } = await render(text, cfg);
    const shows = uprightShows(pageOps(pdf), pageFonts(pdf));
    const spread = shows.find((s) => s.tj.length > 0);
    expect(spread).toBeDefined();
    expect(spread!.tj.every((n) => n > 0)).toBe(true);
  });

  it('sets Latin words and long numbers sideways and short numbers upright in one cell', async () => {
    const { pdf } = await render('今天是2026年9月28日，用iPhone拍照，:tcy[12345]。', config('zh-Hant'));
    const ops = pageOps(pdf);
    // Sideways: an unturned text matrix inside the page's frame.
    expect(ops).toMatch(/1 0 0 1 [-\d.]+ [-\d.]+ Tm/);
    // Upright cells of a horizontal font: 28 at full width, 12345 squeezed.
    const cells = [...ops.matchAll(/0 ([\d.]+) -1 0 [-\d.]+ [-\d.]+ Tm\s+(<[0-9a-fA-F]+> Tj|\[[^\]]*\] TJ)/g)].map((m) => Number(m[1]));
    expect(cells).toContain(1);
    expect(cells.some((k) => k < 1)).toBe(true);
  });

  it('reads every vertical line as written (/ActualText)', async () => {
    const { pdf } = await render('今天是2026年9月28日，用iPhone拍照。', config('zh-Hant'));
    const ops = pageOps(pdf);
    const texts = [...ops.matchAll(/\/ActualText <([0-9A-Fa-f]+)>/g)].map((m) => PDFHexString.of(m[1]!).decodeText());
    expect(texts.join('')).toContain('今天是2026年9月28日，用iPhone拍照。');
  });

  it('declares the vertical writing mode on the Document element and passes the page’s headings to the outline at the column top', async () => {
    const { doc, pdf } = await render('# 第一回\n\n此開卷第一回也。', config('zh-Hant'), true);
    const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const docElem = root.lookup(PDFName.of('K'), PDFArray).lookup(0, PDFDict);
    const attrs = docElem.lookup(PDFName.of('A'), PDFDict);
    expect(attrs.get(PDFName.of('O'))).toBe(PDFName.of('Layout'));
    expect(attrs.get(PDFName.of('WritingMode'))).toBe(PDFName.of('TbRl'));
    const outlines = pdf.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    const first = outlines.lookup(PDFName.of('First'), PDFDict);
    const dest = first.lookup(PDFName.of('Dest'), PDFArray).asArray();
    const heading = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading')!;
    expect(Number(String(dest[3]))).toBeCloseTo(420 - heading.bbox.x, 3);
  });

  it('leaves horizontal Chinese text without a twin', async () => {
    const { pdf } = await render('此開卷第一回也。', config('zh-Hant', { layout: { writingMode: 'horizontal-tb', layoutType: 'single' } }));
    const fonts = pageFonts(pdf);
    expect([...fonts.values()].some((f) => f.get(PDFName.of('Encoding')) === PDFName.of('Identity-V'))).toBe(false);
  });
});
