import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFHexString, PDFNumber, PDFRawStream, decodePDFRawStream, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { showTextShaped } from '../pdf-backend/primitives';
import { renderToPdf } from '../pdf-backend';

// EF-66: a no-break space glues its words, and the docs recommend the
// narrow no-break space (10 %) and the figure space (225 000). Most shipped
// faces have no glyph for them, nor for the word joiner or U+FEFF. The
// canvas measured them as the browser's shaper sets them — the face's space
// glyph at half its width, at a digit's width; invisible characters with no
// advance — while pdf-lib drew glyph 0, the notdef box (1/2 em in
// Newsreader), and pushed the rest of the word along. The PDF now paints
// them as the canvas did.

const face = (path: string) => fs.readFileSync(new URL(`../../../../apps/web/public/${path}`, import.meta.url));
const NEWSREADER = face('presets/deep-sky/fonts/Newsreader-Regular.ttf');
const SOURCE_SERIF = face('presets/openstax-fisica/fonts/SourceSerif4-Regular.ttf');
const EB_GARAMOND_BOLD = face('presets/pintura-espanola/fonts/EBGaramond-Bold.ttf');

interface Face {
  unitsPerEm: number;
  hasGlyphForCodePoint(cp: number): boolean;
  glyphForCodePoint(cp: number): { id: number; advanceWidth: number };
  getGlyph(id: number): { advanceWidth: number };
  layout(text: string): { positions: Array<{ xAdvance: number }> };
}

async function embed(bytes: Buffer, subset: boolean): Promise<{ font: PDFFont; face: Face }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(bytes, { subset });
  return { font, face: fontkit.create(bytes) as unknown as Face };
}

/** The glyph ids and adjustments a viewer reads from the operator. */
function operatorParts(font: PDFFont, text: string): Array<number[] | number> {
  const op = showTextShaped(font, text) as unknown as { args: unknown[] };
  const arg = op.args[0];
  const items = arg instanceof PDFArray ? arg.asArray() : [arg];
  return items.map((item) => {
    if (item instanceof PDFNumber) return item.asNumber();
    const hex = (item as PDFHexString).asString();
    return Array.from({ length: hex.length / 4 }, (_, i) => parseInt(hex.slice(i * 4, i * 4 + 4), 16));
  });
}

const glyphIds = (font: PDFFont, text: string): number[] => operatorParts(font, text).flatMap((p) => (typeof p === 'number' ? [] : p));

/** Advance of the operator (whole-font embedding: glyph ids are the face's),
 *  in 1000-unit text space. */
function paintedWidth(font: PDFFont, f: Face, text: string): number {
  let width = 0;
  for (const part of operatorParts(font, text)) {
    if (typeof part === 'number') width -= part;
    else for (const id of part) width += (f.getGlyph(id).advanceWidth * 1000) / f.unitsPerEm;
  }
  return width;
}

const shaped = (f: Face, text: string): number => (f.layout(text).positions.reduce((s, p) => s + p.xAdvance, 0) * 1000) / f.unitsPerEm;
const advance = (f: Face, cp: number): number => (f.glyphForCodePoint(cp).advanceWidth * 1000) / f.unitsPerEm;

describe('spaces and invisible characters the face has no glyph for (EF-66)', () => {
  it('Newsreader lacks them (the reason for the fallback)', () => {
    const f = fontkit.create(NEWSREADER) as unknown as Face;
    for (const cp of [0x202f, 0x2007, 0x2009, 0x2060, 0xfeff]) expect(f.hasGlyphForCodePoint(cp)).toBe(false);
    expect(f.hasGlyphForCodePoint(0x00a0)).toBe(true);
  });

  for (const subset of [true, false]) {
    it(`never paints the notdef glyph (subset: ${subset})`, async () => {
      const { font } = await embed(NEWSREADER, subset);
      for (const text of ['10 %', '225 000', '1 000', 'a﻿b', 'x⁠y', ' ', '⁠', 'p. 12']) {
        expect(glyphIds(font, text), JSON.stringify(text)).not.toContain(0);
      }
    });
  }

  it('sets each space at the advance the browser gives it, with the face\'s space glyph', async () => {
    const { font, face: f } = await embed(NEWSREADER, false);
    const space = advance(f, 0x20);
    const spaceId = f.glyphForCodePoint(0x20).id;
    // Narrow no-break space: half a word space.
    expect(paintedWidth(font, f, '10 %')).toBeCloseTo(shaped(f, '10') + space / 2 + shaped(f, '%'), 1);
    expect(glyphIds(font, '10 %')).toContain(spaceId);
    // Figure space: a digit.
    expect(paintedWidth(font, f, '225 000')).toBeCloseTo(shaped(f, '225') + advance(f, 0x30) + shaped(f, '000'), 1);
    // Thin space: a fifth of an em.
    expect(paintedWidth(font, f, '1 000')).toBeCloseTo(shaped(f, '1') + 200 + shaped(f, '000'), 1);
    // Word joiner and U+FEFF: nothing, and the letters on either side still
    // kern as one word.
    expect(paintedWidth(font, f, 'a﻿b')).toBeCloseTo(shaped(f, 'ab'), 1);
    expect(paintedWidth(font, f, 'x⁠y')).toBeCloseTo(shaped(f, 'xy'), 1);
  });

  it('keeps the face\'s own glyph when it has one', async () => {
    // Source Serif 4 has a narrow no-break space (1/8 em) of its own.
    const serif = await embed(SOURCE_SERIF, false);
    expect(glyphIds(serif.font, '10 %')).toContain(serif.face.glyphForCodePoint(0x202f).id);
    expect(paintedWidth(serif.font, serif.face, '10 %')).toBeCloseTo(shaped(serif.face, '10 %'), 1);
    // Newsreader's no-break space is its own glyph too: nothing changes.
    const news = await embed(NEWSREADER, false);
    expect(glyphIds(news.font, 'a b')).toContain(news.face.glyphForCodePoint(0xa0).id);
  });

  it('hides U+FEFF and the word joiner even where the face gives them an advance', async () => {
    // EB Garamond Bold maps both to a glyph 0.49 em wide; the browser hides
    // them whatever the face holds.
    const { font, face: f } = await embed(EB_GARAMOND_BOLD, false);
    expect(advance(f, 0xfeff)).toBeGreaterThan(400);
    expect(paintedWidth(font, f, 'a﻿b')).toBeCloseTo(shaped(f, 'ab'), 1);
    expect(paintedWidth(font, f, 'x⁠y')).toBeCloseTo(shaped(f, 'xy'), 1);
  });

  it('leaves text without them as it was', async () => {
    const { font } = await embed(NEWSREADER, false);
    const op = showTextShaped(font, 'plain words') as unknown as { name: string };
    expect(['Tj', 'TJ']).toContain(op.name);
    expect(glyphIds(font, 'plain words')).not.toContain(0);
  });
});

describe('a whole document in a face without them', () => {
  const fontProvider = async () => new Uint8Array(NEWSREADER);
  class StubCtx {
    font = '';
    measureText(s: string): { width: number } {
      return { width: s.length * 7 };
    }
  }
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(): StubCtx {
      return new StubCtx();
    }
  };
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config: PostextConfig = {
    page: { width: pt(300), height: pt(300), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontFamily: 'Newsreader', fontSize: pt(12), lineHeight: pt(16), firstLineIndent: pt(0), hyphenation: { enabled: false } },
  };
  const markdown = [
    'Plain: it holds 225 000 stars and 10 per cent of them⁠, see p. 12.',
    '',
    'Rich: *it* holds 225 000 stars and **10 %** of them⁠.',
  ].join('\n');

  for (const accessible of [false, true]) {
    it(`draws no notdef glyph (${accessible ? 'tagged' : 'untagged'})`, async () => {
      const doc = buildDocument({ markdown }, config);
      const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible }));
      const contents = pdf.getPage(0).node.Contents();
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
      const content = refs
        .map((ref) => {
          const s = pdf.context.lookup(ref);
          return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
        })
        .join('\n');
      const hexes = [...content.matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) => m[1]!);
      expect(hexes.length).toBeGreaterThan(5);
      for (const hex of hexes) {
        for (let i = 0; i < hex.length; i += 4) expect(hex.slice(i, i + 4), hex).not.toBe('0000');
      }
    }, 60_000);
  }
});
