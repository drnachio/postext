import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { FontCache } from '../fontCache.js';
import { loadComplexShaper } from '../complexShaping.js';
import { beginActualTextSpan, drawMeasuredTextPx, drawTextPx, endActualTextSpan, measuredTextShows, textShows, type PageCtx, type TextShow } from '../pdf-backend/primitives.js';
import '../pdf-backend/text/shapedText.js';

// #755: a font's `/ToUnicode` map is one per font and a glyph keeps the
// characters it was first given. A right-to-left run draws a bracket with
// the glyph of the other one, so after `(ب)` the glyph of `)` stood for
// `(`, and a later `(an, 2017)` set by fontkit in the same font read back
// `(an, 2017(`. The tests read the page as a reader does (each glyph
// through its font's map, an `/ActualText` span in place of its glyphs)
// and never shell out.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const AMIRI = fixture('arabic/amiri-subset.ttf');
// Basic Latin of Amiri, the way Fontsource's `latin` file holds it: the
// square brackets, which the Arabic subset lacks.
const LATIN_SLICE = fixture('arabic/amiri-latin-slice.ttf');
// The space and the no-break space on one glyph, the hyphen-minus and the
// hyphen on another (`make_shared_glyph_fixture.py`).
const SHARED = fixture('shared-glyphs.ttf');

// Every character half an em: the layout needs widths, not these ones.
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): { font: string; direction: string; letterSpacing: string; measureText(s: string): { width: number } } {
    return {
      font: '10px Amiri',
      direction: 'ltr',
      letterSpacing: '0px',
      measureText(s: string) {
        return { width: [...s].length * 0.5 * parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10') };
      },
    };
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  locale: 'ar',
  page: { sizePreset: 'custom', width: pt(560), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Amiri', fontSize: pt(14), lineHeight: pt(24), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false } },
};

function pageContent(pdf: PDFDocument, index = 0): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

const utf16 = (hex: string): string => String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16)));

/** The `/ToUnicode` map of every font of the page: resource name → glyph
 *  code (four hex digits, lower case) → text. */
function toUnicodeMaps(pdf: PDFDocument, index = 0): Map<string, Map<string, string>> {
  const maps = new Map<string, Map<string, string>>();
  const fonts = pdf.getPage(index).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  for (const [name, ref] of fonts.entries()) {
    const cmap = pdf.context.lookup(pdf.context.lookup(ref, PDFDict).get(PDFName.of('ToUnicode')));
    const map = new Map<string, string>();
    if (cmap instanceof PDFRawStream) {
      const text = new TextDecoder('latin1').decode(decodePDFRawStream(cmap).decode());
      for (const m of text.matchAll(/^<([0-9A-Fa-f]{4})> <([0-9A-Fa-f]*)>$/gm)) map.set(m[1]!.toLowerCase(), utf16(m[2]!));
    }
    maps.set(name.decodeText(), map);
  }
  return maps;
}

/**
 * The text of the page as a reader of `/ToUnicode` and `/ActualText` has
 * it, one string per text object in content-stream order (a span opened
 * outside a text object is a string of its own): each glyph is its font's
 * characters for it, and a span's text stands for every glyph shown until
 * the span ends. A right-to-left run comes out in visual order, left to
 * right, as its glyphs are shown.
 */
function readPage(pdf: PDFDocument, index = 0): string[] {
  const maps = toUnicodeMaps(pdf, index);
  const out: string[] = [];
  let object: string | undefined;
  let font: Map<string, string> | undefined;
  // One entry per open marked-content sequence: whether it is a span with
  // an `/ActualText`. Glyphs are read while none is.
  const open: boolean[] = [];
  const emit = (text: string) => {
    if (object === undefined) out.push(text);
    else object += text;
  };
  const glyphs = (hex: string) => {
    if (open.includes(true)) return;
    for (const code of hex.toLowerCase().match(/.{4}/g) ?? []) emit(font?.get(code) ?? '');
  };
  const token = /\/(\S+) [\d.]+ Tf|<([0-9A-Fa-f]*)> Tj|\[([^\]]*)\] TJ|\/ActualText <FEFF([0-9A-Fa-f]*)>\s*>> BDC|\b(BDC|BMC|EMC|BT|ET)\b/g;
  for (const m of pageContent(pdf, index).matchAll(token)) {
    if (m[1] !== undefined) font = maps.get(m[1]);
    else if (m[2] !== undefined) glyphs(m[2]);
    else if (m[3] !== undefined) for (const s of m[3].matchAll(/<([0-9A-Fa-f]*)>/g)) glyphs(s[1]!);
    else if (m[4] !== undefined) {
      if (!open.includes(true)) emit(utf16(m[4]));
      open.push(true);
    } else if (m[5] === 'BDC' || m[5] === 'BMC') open.push(false);
    else if (m[5] === 'EMC') open.pop();
    else if (m[5] === 'BT') object = '';
    else if (m[5] === 'ET') {
      if (object) out.push(object);
      object = undefined;
    }
  }
  return out;
}

const reversed = (s: string): string => [...s].reverse().join('');

/** How many `/ActualText` spans the page's content opens. */
const spans = (pdf: PDFDocument, index = 0): number => (pageContent(pdf, index).match(/\/ActualText/g) ?? []).length;

const hasVerapdf = process.env.VERAPDF === '1' && spawnSync('verapdf', ['--version'], { encoding: 'utf8' }).status === 0;

beforeAll(async () => {
  expect(await loadComplexShaper()).toBe(true);
});

describe('a bracket shared between a right-to-left run and left-to-right text (#755)', () => {
  const pairs: Array<{ name: string; open: string; close: string; files: Uint8Array | Uint8Array[] }> = [
    { name: 'parentheses', open: '(', close: ')', files: AMIRI },
    { name: 'square brackets', open: '[', close: ']', files: [AMIRI, LATIN_SLICE] },
    { name: 'guillemets', open: '«', close: '»', files: AMIRI },
  ];
  for (const { name, open, close, files } of pairs) {
    const arabic = `${open}ب${close} ب`;
    // A Latin word closes the sentence: guillemets are not a bracket pair
    // of the bidi algorithm, and a closing one at the end of a line of a
    // right-to-left paragraph would take the paragraph's direction.
    const latin = `an ${open}an, 2017${close} an`;
    const orders = { 'the right-to-left run first': `${arabic}\n\n${latin}\n`, 'the left-to-right text first': `${latin}\n\n${arabic}\n` };
    for (const [order, markdown] of Object.entries(orders)) {
      for (const accessible of [true, false]) {
        it(`${name}, ${order}, ${accessible ? 'tagged' : 'untagged'}: both read back as written`, async () => {
          const bytes = await renderToPdf(buildDocument({ markdown }, config), { fontProvider: async () => files, accessible });
          const pdf = await PDFDocument.load(bytes);
          const objects = readPage(pdf);
          // The Latin sentence, word by word in the content stream.
          expect(objects.join('').replace(/\s/g, '')).toContain(`an${open}an,2017${close}an`);
          // The Arabic word between its brackets: one run, glyphs left to
          // right, so its text is the word as written turned around.
          const word = objects.find((o) => o.includes('ب') && [...o.trim()].length === 3);
          expect(word && reversed(word.trim())).toBe(`${open}ب${close}`);
          // The two brackets of one side read through a span each; the
          // other side reads through the font's map.
          const content = pageContent(pdf);
          for (const bracket of [open, close]) {
            const hex = bracket.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
            expect(content.match(new RegExp(`/ActualText <FEFF${hex}>`, 'g')) ?? []).toHaveLength(1);
          }
        });
      }
    }
  }

  it('writes no span in a document of one direction', async () => {
    for (const markdown of ['an (an, 2017).\n', '(ب) ب\n']) {
      const pdf = await PDFDocument.load(await renderToPdf(buildDocument({ markdown }, config), { fontProvider: async () => AMIRI, accessible: false }));
      expect(spans(pdf)).toBe(0);
    }
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1) with the spans inside the tagged content', async () => {
    const markdown = '(ب) ب\n\nan (an, 2017) an «an» an\n\n«ب» ب an (an, 2017).\n';
    const bytes = await renderToPdf(buildDocument({ markdown }, config), { fontProvider: async () => AMIRI });
    expect(spans(await PDFDocument.load(bytes))).toBeGreaterThan(0);
    const file = path.join(os.tmpdir(), `postext-shared-glyph-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);

  it('reads a line of both directions back, the brackets of each side', async () => {
    const markdown = '(ب) ب an (an, 2017).\n';
    const pdf = await PDFDocument.load(await renderToPdf(buildDocument({ markdown }, config), { fontProvider: async () => AMIRI }));
    const objects = readPage(pdf);
    expect(objects.join('').replace(/\s/g, '')).toContain('an(an,2017).');
    expect(objects.some((o) => reversed(o.trim()) === '(ب)')).toBe(true);
  });
});

/** A page of a document with `bytes` embedded as a subset, and the page's
 *  drawing context. */
async function sheet(bytes: Uint8Array): Promise<{ pdf: PDFDocument; page: PDFPage; font: PDFFont; ctx: PageCtx }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(bytes, { subset: true });
  const page = pdf.addPage([400, 120]);
  return { pdf, page, font, ctx: { page, pageHeightPt: 120, scale: 1, colorSpace: 'rgb' } };
}

const saved = async (pdf: PDFDocument): Promise<PDFDocument> => PDFDocument.load(await pdf.save());
const black = rgb(0, 0, 0);

/** The glyph codes and pen adjustments a list of shows paints, spans
 *  aside: codes run together, adjustments summed. */
function painted(shows: readonly TextShow[]): Array<string | number> {
  const out: Array<string | number> = [];
  const push = (part: string | number) => {
    const last = out[out.length - 1];
    if (typeof part === 'number' && typeof last === 'number') out[out.length - 1] = Math.round((last + part) * 100) / 100;
    else if (typeof part === 'string' && typeof last === 'string') out[out.length - 1] = last + part;
    else out.push(part);
  };
  for (const show of shows) {
    const op = show.op.toString();
    if (/\b(BDC|EMC)$/.test(op)) continue;
    for (const m of op.matchAll(/<([0-9A-Fa-f]*)>|(-?\d+(?:\.\d+)?)(?= )/g)) push(m[1] !== undefined ? m[1].toLowerCase() : Number(m[2]));
  }
  return out;
}

describe('the glyphs painted under a read-back span (#755)', () => {
  it('are the same glyphs at the same places, cut into several show operators', async () => {
    const { font, ctx } = await sheet(AMIRI);
    // The right-to-left run gives each bracket glyph the other bracket.
    drawTextPx(ctx, '(ب)', 20, 40, font, 14, black, undefined, undefined, undefined, 'rtl');
    for (const text of ['(an,', '2017).', 'AAA)ZZZ(AAA', '()']) {
      const plain = textShows(font, text, false);
      const read = textShows(font, text);
      expect(plain).toHaveLength(1);
      expect(read.filter((s) => /BDC$/.test(s.op.toString()))).toHaveLength([...text].filter((ch) => ch === '(' || ch === ')').length);
      expect(painted(read)).toEqual(painted(plain));
    }
    // Text with no shared glyph is one operator, read or not.
    expect(textShows(font, 'Latin').map((s) => s.op)).toEqual(textShows(font, 'Latin', false).map((s) => s.op));
  });

  it('holds for a line set in measured pieces', async () => {
    const { font, ctx } = await sheet(AMIRI);
    drawTextPx(ctx, '(ب)', 20, 40, font, 14, black, undefined, undefined, undefined, 'rtl');
    const pieces = [{ text: 'an', width: 14 }, { text: ' ', width: 4 }, { text: '(an,', width: 26 }, { text: ' ', width: 4 }, { text: '2017).', width: 40 }];
    const plain = measuredTextShows(font, pieces, 14, 0, false)!;
    const read = measuredTextShows(font, pieces, 14)!;
    expect(plain).toHaveLength(1);
    expect(read.filter((s) => /BDC$/.test(s.op.toString()))).toHaveLength(2);
    expect(painted(read)).toEqual(painted(plain));
  });

  it('reads a line painted in measured pieces back as written', async () => {
    const { pdf, font, ctx } = await sheet(AMIRI);
    drawTextPx(ctx, '(ب)', 20, 40, font, 14, black, undefined, undefined, undefined, 'rtl');
    drawMeasuredTextPx(ctx, [{ text: 'an', width: 14 }, { text: ' ', width: 4 }, { text: '(an,', width: 26 }, { text: ' ', width: 4 }, { text: '2017).', width: 40 }], 20, 80, font, 14, black);
    const objects = readPage(await saved(pdf));
    expect(reversed(objects[0]!)).toBe('(ب)');
    expect(objects[1]).toBe('an (an, 2017).');
  });

  it('writes no span inside a span that already reads the text', async () => {
    const { pdf, font, ctx } = await sheet(AMIRI);
    drawTextPx(ctx, '(ب)', 20, 40, font, 14, black, undefined, undefined, undefined, 'rtl');
    // A text read through its own `/ActualText`.
    drawTextPx(ctx, '2017).', 20, 60, font, 14, black, undefined, '2017).');
    // A line read through the line's (a composed CJK line): a reader that
    // meets a span inside another drops the outer one.
    const state = { font, text: '(an,', sizePx: 14, xPx: 20, baselinePx: 80 };
    beginActualTextSpan(ctx, '(an, 2017). بِسْمِ', state);
    drawTextPx(ctx, '(an,', 20, 80, font, 14, black);
    drawTextPx(ctx, '2017).', 60, 80, font, 14, black);
    drawTextPx(ctx, 'بِسْمِ', 120, 80, font, 14, black);
    endActualTextSpan(ctx, state);
    // After the line the glyphs take their spans again.
    drawTextPx(ctx, '2017).', 20, 100, font, 14, black);
    const loaded = await saved(pdf);
    expect(spans(loaded)).toBe(3);
    expect(readPage(loaded).slice(1)).toEqual(['2017).', '(an, 2017). بِسْمِ', '2017).']);
  });
});

describe('two characters of a cmap on one glyph (#755)', () => {
  it('reads a hyphen-minus and a hyphen back as written, whichever came first', async () => {
    for (const texts of [['a‐b', 'a-b', 'b‐a'], ['a-b', 'a‐b', 'b-a']]) {
      const { pdf, font, ctx } = await sheet(SHARED);
      texts.forEach((text, i) => drawTextPx(ctx, text, 20, 30 + 20 * i, font, 14, black));
      const loaded = await saved(pdf);
      expect(readPage(loaded)).toEqual(texts);
      // The second character to take the glyph reads through a span.
      expect(spans(loaded)).toBe(1);
    }
  });

  it('reads a space as a space after a no-break space took the glyph', async () => {
    const { pdf, font, ctx } = await sheet(SHARED);
    drawTextPx(ctx, 'N 12', 20, 30, font, 14, black);
    drawTextPx(ctx, 'a b', 20, 50, font, 14, black);
    const loaded = await saved(pdf);
    expect(readPage(loaded)).toEqual(['N 12', 'a b']);
    expect(pageContent(loaded)).toContain('/ActualText <FEFF0020>');
  });

  it('leaves a no-break space on the space glyph read as a space, with no span', async () => {
    const { pdf, font, ctx } = await sheet(SHARED);
    drawTextPx(ctx, 'a b', 20, 30, font, 14, black);
    drawTextPx(ctx, 'N 12', 20, 50, font, 14, black);
    const loaded = await saved(pdf);
    expect(readPage(loaded)).toEqual(['a b', 'N 12']);
    expect(spans(loaded)).toBe(0);
  });

  it('gives the space glyph of a document face to the space, whatever is set first', async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const cache = new FontCache(pdf, async () => SHARED);
    const fontString = '400 14px "Shared Glyphs"';
    await cache.preloadFontStrings([fontString]);
    const font = cache.get(fontString)!;
    const page = pdf.addPage([400, 120]);
    const ctx: PageCtx = { page, pageHeightPt: 120, scale: 1, colorSpace: 'rgb' };
    drawTextPx(ctx, 'N 12', 20, 30, font, 14, black);
    drawTextPx(ctx, 'a b', 20, 50, font, 14, black);
    const loaded = await saved(pdf);
    expect(readPage(loaded)).toEqual(['N 12', 'a b']);
    expect(spans(loaded)).toBe(0);
  });
});
