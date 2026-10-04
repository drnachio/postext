import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDocument, PDFHexString, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument, VDTLine } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';
import { complexShaperReady, shapeRun } from '../complexShaping';
import { bidiLevels, firstStrongDirection, visualOrder } from '../bidiRuns';

// Issue #380: Arabic in the PDF is shaped by HarfBuzz (marks raised and
// lowered with the text rise, numbers and Latin kept left to right) and
// reads back in logical order.

const AMIRI = new Uint8Array(fs.readFileSync(new URL('./fixtures/arabic/amiri-subset.ttf', import.meta.url)));
const fontProvider = async () => AMIRI;

const face = fontkit.create(Buffer.from(AMIRI));

/** Measures like Chrome: HarfBuzz once it is loaded, each piece in the
 *  direction of its first strong letter; fontkit, whose advances agree,
 *  before that (the Latin-only document of the first test). */
class HarfBuzzCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = complexShaperReady() ? shapeRun(AMIRI, s, { direction: firstStrongDirection(s) ?? 'ltr' }) : undefined;
    const advance = run ? run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) / run.upem : face.layout(s).advanceWidth / face.unitsPerEm;
    return { width: advance * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): HarfBuzzCtx {
    return new HarfBuzzCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const SALAM = 'السلام عليكم ورحمة الله وبركاته';
const KASHIDA = 'لا إله إلا الله، كتـــاب';
const MIXED = 'كلمة Latin 2024 كلمة (قوس) سنة ١٤٤٥ هـ';
const PARAGRAPHS = [BASMALA, SALAM, KASHIDA, MIXED];

function config(bodyText: PostextConfig['bodyText'] = {}): PostextConfig {
  return {
    page: { width: pt(420), height: pt(260), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    locale: 'ar',
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontFamily: 'Amiri', fontSize: pt(18), lineHeight: pt(36), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, ...bodyText },
  };
}

function lines(doc: VDTDocument): VDTLine[] {
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));
}

/** Give a VDT the directions the engine will (SPEC D9): each segment's
 *  level from the paragraph's (right to left), `rtl` on the odd ones, and
 *  the line's visual order. */
function directed(doc: VDTDocument): VDTDocument {
  for (const line of lines(doc)) {
    const segments = line.segments ?? [];
    const text = segments.map((s) => s.text).join('');
    const levels = bidiLevels(text, 'rtl');
    const segLevels: number[] = [];
    let at = 0;
    for (const seg of segments) {
      const level = seg.text ? levels[at]! : 1;
      segLevels.push(level);
      if (level % 2 === 1) seg.rtl = true;
      if (level > 1) seg.level = level;
      at += seg.text.length;
    }
    line.order = visualOrder(segLevels);
  }
  return doc;
}

async function render(doc: VDTDocument): Promise<PDFDocument> {
  return PDFDocument.load(await renderToPdf(doc, { fontProvider }));
}

function pageContent(pdf: PDFDocument): string {
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

function actualTexts(content: string): string[] {
  return [...content.matchAll(/\/Span <<\n\/ActualText (<[0-9A-Fa-f]*>)\n>> BDC/g)].map((m) => PDFHexString.of(m[1]!.slice(1, -1)).decodeText());
}

/** The x of each text object's `Tm`, in content order, per baseline. */
function textOrigins(content: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const m of content.matchAll(/^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/gm)) {
    const y = Math.round(Number(m[2]));
    out.set(y, [...(out.get(y) ?? []), Number(m[1])]);
  }
  return out;
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** The text pdftotext reads from the PDF in reading order, one row per
 *  line, without the embedding controls Poppler wraps the right-to-left
 *  lines and their left-to-right runs in, and without spaces: Poppler
 *  infers them from the gaps between glyphs, and puts one before a comma
 *  that ends a right-to-left word. */
function extract(bytes: Uint8Array, name: string): string[] {
  const file = path.join(os.tmpdir(), `postext-arabic-${process.pid}-${name}.pdf`);
  fs.writeFileSync(file, bytes);
  const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
  fs.unlinkSync(file);
  return text.split('\n').map(squeeze).filter(Boolean);
}

function squeeze(text: string): string {
  return text.replace(/[\s\f\u202a-\u202e]/g, '');
}

/** Write a PDF for a look (`POSTEXT_ARABIC_PDF_DIR`). */
function keep(bytes: Uint8Array, name: string): void {
  const dir = process.env.POSTEXT_ARABIC_PDF_DIR;
  if (dir) fs.writeFileSync(path.join(dir, `${name}.pdf`), bytes);
}

describe('Arabic in the PDF (HarfBuzz)', () => {
  it('never loads HarfBuzz for a document without complex scripts', async () => {
    const doc = buildDocument({ markdown: 'Latin text, 2024 (only).' }, config());
    await renderToPdf(doc, { fontProvider });
    expect(complexShaperReady()).toBe(false);
  });

  it('loads it for a document with Arabic and raises and lowers the marks', async () => {
    const doc = buildDocument({ markdown: PARAGRAPHS.join('\n\n') }, config());
    const bytes = await renderToPdf(doc, { fontProvider });
    expect(complexShaperReady()).toBe(true);
    keep(bytes, 'legacy');
    const content = pageContent(await PDFDocument.load(bytes));
    // The basmala's harakat stack with the text rise; the rise is reset
    // before the glyphs on the baseline.
    const rises = [...content.matchAll(/^(-?[\d.]+) Ts$/gm)].map((m) => Number(m[1]));
    expect(rises.some((r) => r > 1)).toBe(true);
    expect(rises.some((r) => r < -1)).toBe(true);
    expect(rises).toContain(0);
  });

  it('paints a line with directions segment by segment, left to right on the sheet', async () => {
    const doc = directed(buildDocument({ markdown: PARAGRAPHS.join('\n\n') }, config({ textAlign: 'right' })));
    const mixed = lines(doc).find((l) => l.text.startsWith('كلمة'))!;
    // The segments' visual order: هـ, ١٤٤٥, سنة, (قوس), كلمة, Latin 2024, كلمة.
    const visual = mixed.order!.map((i) => mixed.segments![i]!).filter((s) => s.kind === 'text').map((s) => s.text);
    expect(visual).toEqual(['هـ', '١٤٤٥', 'سنة', '(قوس)', 'كلمة', 'Latin', '2024', 'كلمة']);
    const bytes = await renderToPdf(doc, { fontProvider });
    keep(bytes, 'directed');
    const content = pageContent(await PDFDocument.load(bytes));
    // Every text object of a line starts right of the one before.
    for (const xs of textOrigins(content).values()) {
      for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    }
    // Glyphs read back through the ToUnicode map; a vocalised letter (its
    // marks raised and lowered) reads through a span of its own, in
    // logical order.
    const spans = actualTexts(content);
    expect(spans.length).toBeGreaterThan(4);
    for (const span of spans) {
      expect(BASMALA).toContain(span);
      expect(span).toMatch(/^\p{L}\p{M}+$/u);
    }
    expect(spans).toContain('لَّ');
  });

  it('turns character spacing off for joining letters only', async () => {
    const doc = directed(buildDocument({ markdown: `${SALAM} AAA` }, config()));
    for (const block of doc.pages[0]!.columns[0]!.blocks) block.letterSpacing = 0.5;
    const content = pageContent(await render(doc));
    const objects = content.split('BT\n').slice(1);
    const arabic = objects.filter((o) => /\[ .*\] TJ/.test(o) && /^0 Tc$/m.test(o));
    expect(arabic.length).toBeGreaterThan(0);
    // The Latin word keeps the line's spacing.
    expect(content).toMatch(/^0\.5 Tc$/m);
  });

  it('leaves the kashidas justification inserted out of the text read', async () => {
    const doc = directed(buildDocument({ markdown: 'كتــاب الله' }, config()));
    expect(actualTexts(pageContent(await render(doc)))).toEqual([]);
    lines(doc)[0]!.kashida = 2;
    const bytes = await renderToPdf(doc, { fontProvider });
    const spans = actualTexts(pageContent(await PDFDocument.load(bytes)));
    // Amiri sets the two tatweels as one glyph: it reads as nothing.
    expect(spans).toEqual(['']);
    if (hasPdftotext) expect(extract(bytes, 'kashida')).toEqual([squeeze('كتاب الله')]);
  });

  it.skipIf(!hasPdftotext)('reads back in logical order (pdftotext)', async () => {
    for (const [name, doc] of [
      ['legacy', buildDocument({ markdown: PARAGRAPHS.join('\n\n') }, config())],
      ['directed', directed(buildDocument({ markdown: PARAGRAPHS.join('\n\n') }, config({ textAlign: 'justify' })))],
    ] as const) {
      const rows = extract(await renderToPdf(doc, { fontProvider }), name);
      // Poppler reads the unvocalised lines as written. (In a vocalised word
      // it puts a mark before its letter now and then.)
      for (const p of [SALAM, KASHIDA, MIXED]) expect(rows, name).toContain(squeeze(p));
      expect(rows, name).toHaveLength(4);
    }
  });

  it('reads unvocalised words through the ToUnicode map alone', async () => {
    // No mark raised, no glyph that reads as other text: no span. (Poppler
    // takes a line's direction from most of its letters: Latin here.)
    const doc = buildDocument({ markdown: 'AAA Latin السلام عليكم ZZZ Latin' }, config());
    const bytes = await renderToPdf(doc, { fontProvider });
    expect(actualTexts(pageContent(await PDFDocument.load(bytes)))).toEqual([]);
    if (hasPdftotext) expect(extract(bytes, 'ltr')).toEqual([squeeze('AAA Latin السلام عليكم ZZZ Latin')]);
  });
});
