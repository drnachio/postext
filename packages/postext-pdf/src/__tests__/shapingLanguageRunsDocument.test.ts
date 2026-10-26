import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildDocument, lineRuns, resolveParagraph } from 'postext';
import type { PostextConfig, VDTBlock, VDTDocument, VDTLine, VDTPage } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { browserSizePx } from '../pdf-backend/text/wordPieces.js';
import { parseFontString } from '../fontString.js';
import { loadComplexShaper, shapeRun } from '../complexShaping.js';
import { paintedGlyphs } from './glyphPositions.js';

// #764, end to end, in the faces the page review found off: an Arabic
// paragraph with quotations in guillemets, brackets and full stops in
// Markazi Text and in Amiri, and a justified Catalan paragraph with `l·l`
// words in Crimson Pro. The document is laid out by a measurer that
// shapes as Chrome 154's canvas does (see `shapingLanguageRuns.test.ts`,
// which holds Chrome's own widths of these files), in the language and
// the direction the engine sets on it, and its PDF prints every word
// where the layout put it.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/fontsource/${name}`, import.meta.url)));
/** The files of each family, as Fontsource cuts it: `latin`, then
 *  `arabic`. */
const FACES: Record<string, Uint8Array[]> = {
  'Markazi Text': [fixture('markazi-text-latin.ttf'), fixture('markazi-text-arabic.ttf')],
  Amiri: [fixture('amiri-latin.ttf'), fixture('amiri-arabic.ttf')],
  'Crimson Pro': [fixture('crimson-pro-latin.ttf')],
  // The same file under a name the measurer sets as a browser does: at
  // its size cut to a hundredth of a pixel (see `CanvasCtx`).
  'Crimson Pro Cut': [fixture('crimson-pro-latin.ttf')],
};
/** The families the measurer sets at the size a browser does. */
const CUT_SIZES = /Cut$/;
const fontProvider = async (family: string) => FACES[family] ?? FACES.Amiri!;

/** The file the browser takes a character from: the `arabic` one for the
 *  Arabic blocks (its `unicode-range`), the `latin` one for the rest. */
const fileOf = (files: Uint8Array[], cp: number): Uint8Array => (files.length > 1 && cp >= 0x0600 && cp <= 0x08FF ? files[1]! : files[0]!);
const SCRIPTS: readonly [string, RegExp][] = [['Arab', /\p{Script=Arabic}/u], ['Latn', /\p{Script=Latin}/u], ['Grek', /\p{Script=Greek}/u], ['Cyrl', /\p{Script=Cyrillic}/u]];
const scriptOfLetter = (ch: string): string | undefined => SCRIPTS.find(([, re]) => re.test(ch))?.[0];

/** The advance (em) of one word of a run, as Chrome shapes it: each
 *  character in the script of the letter before it in the word, else of
 *  the first after it (none for a word with no letter; `latin`: the whole
 *  string had no character above U+00FF, and is Latin text), then cut by
 *  the file that draws it. */
function wordAdvance(files: Uint8Array[], word: string, rtl: boolean, language: string | undefined, latin: boolean): number {
  const chars = [...word];
  const own = chars.map((ch) => (latin ? 'Latn' : scriptOfLetter(ch)));
  const first = own.find((s) => s !== undefined);
  let before: string | undefined;
  const scripts = own.map((s) => (before = s ?? before) ?? first);
  let advance = 0;
  for (let a = 0; a < chars.length;) {
    const file = fileOf(files, chars[a]!.codePointAt(0)!);
    let b = a + 1;
    while (b < chars.length && scripts[b] === scripts[a] && fileOf(files, chars[b]!.codePointAt(0)!) === file) b++;
    const script = scripts[a];
    const run = shapeRun(file, chars.slice(a, b).join(''), { direction: rtl ? 'rtl' : 'ltr', ...(script ? { script } : {}), ...(language ? { language } : {}) });
    advance += run ? run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) / run.upem : (b - a) * 0.5;
    a = b;
  }
  return advance;
}

/** The strings the engine measured, each with the context's direction. */
const measured = new Set<string>();

/**
 * Measures as Chrome 154's canvas does, with HarfBuzz: the string cut
 * into runs of one direction (UAX #9, in the context's `direction`), each
 * run into words at its spaces, each word shaped in the script of its
 * letters and the context's language.
 */
class CanvasCtx {
  direction = 'ltr';
  letterSpacing = '0px';
  private fontString = '';
  private language = 'inherit';
  get font(): string {
    return this.fontString;
  }
  set font(value: string) {
    this.fontString = value;
  }
  get lang(): string {
    return this.language;
  }
  set lang(value: string) {
    this.language = value;
  }
  measureText(s: string): { width: number } {
    const parsed = parseFontString(this.fontString);
    const files = FACES[parsed?.family ?? ''] ?? FACES.Amiri!;
    const language = this.language === 'inherit' || this.language === '' ? undefined : this.language;
    const latin = /^[\u0000-\u00FF]*$/.test(s);
    measured.add(`${this.direction} ${s}`);
    let advance = 0;
    for (const run of lineRuns(resolveParagraph(s, this.direction === 'rtl' ? 'rtl' : 'ltr'))) {
      for (const word of s.slice(run.start, run.end).split(/( )/)) {
        if (word !== '') advance += wordAdvance(files, word, (run.level & 1) === 1, language, latin);
      }
    }
    // Chrome sets a face at its size cut to a hundredth of a pixel
    // (11.4583 px at 11.45); a measurer with no browser at the size asked.
    const sizePx = parsed?.sizePx ?? 16;
    return { width: advance * (CUT_SIZES.test(parsed?.family ?? '') ? Math.floor(sizePx * 100) / 100 : sizePx) };
  }
}
const host = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
host.OffscreenCanvasRenderingContext2D = CanvasCtx;
host.OffscreenCanvas = class {
  getContext(): CanvasCtx {
    return new CanvasCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const SIZE = 20;
const EM = SIZE / 1000;
const PAGE = 420;
const MARGIN = 20;
function config(locale: string, fontFamily: string, bodyText: Partial<PostextConfig['bodyText']> = {}): PostextConfig {
  return {
    page: { width: pt(PAGE), height: pt(400), dpi: 72, margins: { top: pt(MARGIN), bottom: pt(MARGIN), left: pt(MARGIN), right: pt(MARGIN) } },
    locale,
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontFamily, fontSize: pt(SIZE), lineHeight: pt(36), firstLineIndent: pt(0), textAlign: 'justify', hyphenation: { enabled: false }, shapingLanguage: 'document', ...bodyText },
  };
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
interface Box {
  left: number;
  right: number;
}
/** What pdftotext reads as words on each line of the PDF's first page,
 *  px at 72 dpi. It cuts a word where its font changes, and at a letter
 *  that leaves air before the next: a word may come in several boxes. */
function wordBoxes(bytes: Uint8Array): Box[][] {
  const file = path.join(os.tmpdir(), `postext-language-runs-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, bytes);
  const xml = execFileSync('pdftotext', ['-bbox', '-l', '1', file, '-'], { encoding: 'utf8' });
  fs.unlinkSync(file);
  const lines = new Map<number, Box[]>();
  for (const m of xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">/g)) {
    const y = Math.round(Number(m[2]));
    const key = [...lines.keys()].find((k) => Math.abs(k - y) < 8) ?? y;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key)!.push({ left: Number(m[1]), right: Number(m[3]) });
  }
  return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, boxes]) => boxes);
}
const firstBlock = (doc: VDTDocument): VDTBlock => doc.pages[0]!.columns[0]!.blocks[0]!;
/**
 * The words of a line as the layout placed them, on the sheet: its
 * segments in the order the line gives (flow order), from the line's
 * start, the spaces of a justified line that is not its paragraph's last
 * stretched to fill the measure; what stands between two spaces is one
 * word. A right-to-left page is the mirror of its flow.
 */
function wordPlaces(page: VDTPage, block: VDTBlock, line: VDTLine): Box[] {
  const segments = line.segments!;
  const measure = PAGE - 2 * MARGIN - (line.bbox.x - MARGIN);
  const spaces = segments.filter((s) => s.kind === 'space').length;
  const words = segments.reduce((sum, s) => sum + (s.kind === 'space' ? 0 : s.width), 0);
  const space = block.textAlign === 'justify' && !line.isLastLine && spaces > 0 ? (measure - words) / spaces : undefined;
  const places: Box[] = [];
  let x = line.bbox.x;
  let open: Box | undefined;
  for (const i of line.order ?? segments.map((_, k) => k)) {
    const seg = segments[i]!;
    const width = seg.kind === 'space' ? space ?? seg.width : seg.width;
    if (seg.kind === 'space') open = undefined;
    else if (open) open.right = x + width;
    else {
      open = { left: x, right: x + width };
      places.push(open);
    }
    x += width;
  }
  const flow = page.flow;
  const originX = flow && flow.writingMode === 'horizontal-tb' && flow.direction === 'rtl' ? flow.mirror.originX : undefined;
  return originX === undefined ? places : places.map((p) => ({ left: originX - p.right, right: originX - p.left }));
}
/** Every word of the PDF against its place: the boxes pdftotext read
 *  inside a place start where it starts and end where it ends, to a
 *  twentieth of a pixel, and no box lies outside every place. With
 *  `whole`, a place holds one box: pdftotext cuts no Latin word that has
 *  no hole in it. */
async function expectInPlace(doc: VDTDocument, what: string, whole = false): Promise<void> {
  const boxes = wordBoxes(await renderToPdf(doc, { fontProvider, accessible: false }));
  const block = firstBlock(doc);
  expect(boxes.length, what).toBe(block.lines.length);
  block.lines.forEach((line, n) => {
    const places = wordPlaces(doc.pages[0]!, block, line);
    const inside = places.map((place) => boxes[n]!.filter((box) => (box.left + box.right) / 2 > place.left && (box.left + box.right) / 2 < place.right));
    expect(inside.reduce((sum, list) => sum + list.length, 0), `${what} line ${n + 1}: ${line.text}`).toBe(boxes[n]!.length);
    places.forEach((place, i) => {
      expect(inside[i]!.length, `${what} line ${n + 1} word ${i + 1}`).toBeGreaterThan(0);
      if (whole) expect(inside[i]!.length, `${what} line ${n + 1} word ${i + 1} in one piece`).toBe(1);
      expect(Math.min(...inside[i]!.map((box) => box.left)), `${what} line ${n + 1} word ${i + 1} left`).toBeCloseTo(place.left, 1);
      expect(Math.max(...inside[i]!.map((box) => box.right)), `${what} line ${n + 1} word ${i + 1} right`).toBeCloseTo(place.right, 1);
    });
  });
}
/** The width the layout gave each text, thousandths of the em. */
const widthsOf = (doc: VDTDocument): Record<string, number> =>
  Object.fromEntries(firstBlock(doc).lines.flatMap((line) => line.segments!.filter((s) => s.kind !== 'space').map((s) => [s.text, Math.round((s.width / EM) * 10) / 10])));

beforeAll(async () => {
  await loadComplexShaper();
});

// An Arabic paragraph: «…» quotations, a bracketed aside, full stops, a
// question mark inside a quotation.
const ARABIC = '\u0642\u0644\u062A: \u00AB\u0623\u0646\u0627 \u064A\u0627 \u062E\u0627\u0644\u0629.\u00BB \u062B\u0645 \u0645\u0634\u064A\u062A (\u0648\u064A\u0642\u0627\u0644 \u0633\u0627\u0641\u0631\u062A) \u0625\u0644\u0649 \u0627\u0644\u0628\u064A\u0648\u062A. \u00AB\u064A\u0648\u0633\u0641\u061F\u00BB \u0643\u062A\u0627\u0628.';
// Set from its start side: a justified Arabic line takes kashidas.
const fromStart = { textAlign: 'left' } as const;

describe('an Arabic paragraph with quotations, brackets and full stops (#764)', () => {
  it('Markazi Text: the layout measures the guillemets and the stops of Arabic text in Arabic', () => {
    measured.clear();
    const widths = widthsOf(buildDocument({ markdown: ARABIC }, config('ar', 'Markazi Text', fromStart)));
    // Each word as a right-to-left run, as it is painted.
    expect([...measured]).toContain('rtl \u00AB\u0623\u0646\u0627');
    // Chrome's widths of these words in Arabic.
    expect(widths).toMatchObject({ '\u00AB\u0623\u0646\u0627': 939.5, '\u062E\u0627\u0644\u0629.\u00BB': 1892.1, '\u0643\u062A\u0627\u0628.': 1708 });
    // In Persian the face has no forms of its own, and the word is still
    // measured as the right-to-left run every output paints (#770): the
    // stop is kerned to the guillemet there (0.582 em; 0.587 when the two
    // were measured as a left-to-right run of their own, up to 1.29.2).
    measured.clear();
    const persian = widthsOf(buildDocument({ markdown: ARABIC }, config('fa', 'Markazi Text', fromStart)));
    expect([...measured]).toContain('rtl \u00AB\u0623\u0646\u0627');
    expect([...measured]).not.toContain('ltr \u00AB\u0623\u0646\u0627');
    expect(persian).toMatchObject({ '\u00AB\u0623\u0646\u0627': 1043.5, '\u062E\u0627\u0644\u0629.\u00BB': 1988.3, '\u0643\u062A\u0627\u0628.': 1714.8 });
  });

  it('Amiri: the stop, the brackets and the guillemets of an Arabic word are the Arabic ones', () => {
    const widths = widthsOf(buildDocument({ markdown: ARABIC }, config('ar', 'Amiri', fromStart)));
    expect(widths).toMatchObject({ '\u00AB\u0623\u0646\u0627': 1068, '\u062E\u0627\u0644\u0629.\u00BB': 2112, '(\u0648\u064A\u0642\u0627\u0644': 2380, '\u0643\u062A\u0627\u0628.': 2040 });
  });

  it.skipIf(!hasPdftotext)('the PDF prints every word where the layout put it, in both faces', async () => {
    for (const family of ['Markazi Text', 'Amiri']) {
      // Not Markazi Text in Persian: its words were measured left to
      // right (see above), five thousandths of the em wider than any
      // output sets `.»`.
      for (const locale of family === 'Amiri' ? ['ar', 'ar-EG', 'fa'] : ['ar', 'ar-EG']) {
        const doc = buildDocument({ markdown: ARABIC }, config(locale, family, fromStart));
        expect(firstBlock(doc).lines.length, `${family} ${locale}`).toBeGreaterThan(1);
        await expectInPlace(doc, `${family} ${locale}`);
      }
    }
  }, 120_000);

  it.skipIf(!hasPdftotext)('and in a document that keeps the host\u2019s language, measured in none', async () => {
    const doc = buildDocument({ markdown: ARABIC }, config('ar', 'Amiri', { ...fromStart, shapingLanguage: 'host' }));
    expect(widthsOf(doc)).toMatchObject({ '\u00AB\u0623\u0646\u0627': 1068, '\u062E\u0627\u0644\u0629.\u00BB': 2112, '\u0643\u062A\u0627\u0628.': 2040 });
    await expectInPlace(doc, 'Amiri host');
    // Markazi Text has no forms of its own in no language.
    expect(widthsOf(buildDocument({ markdown: ARABIC }, config('ar', 'Markazi Text', { ...fromStart, shapingLanguage: 'host' })))['\u00AB\u0623\u0646\u0627']).toBe(1043.5);
  }, 120_000);
});

describe('a justified Catalan paragraph in Crimson Pro (#764)', () => {
  // A paragraph with a word in italics is cut word by word: the pieces of
  // a word are as wide as the word grew by each. A plain one goes to the
  // text library, which measures each piece alone.
  const STYLED = 'La instal\u00B7laci\u00F3 de la il\u00B7luminaci\u00F3 col\u00B7lectiva *fou* una il\u00B7lusi\u00F3 paral\u00B7lela del col\u00B7legi.';
  const PLAIN = STYLED.replace(/\*/g, '');
  const hyphenated = (locale: string): Partial<PostextConfig['bodyText']> => ({ hyphenation: { enabled: true, locale } });
  /** The words of a paragraph: the pieces of each joined, with the width
   *  the layout gave them together. */
  const wordWidths = (doc: VDTDocument): Record<string, number> => {
    const words: Record<string, number> = {};
    for (const line of firstBlock(doc).lines) {
      let text = '';
      let width = 0;
      for (const seg of [...line.segments!, { kind: 'space' as const, text: ' ', width: 0 }]) {
        if (seg.kind !== 'space') {
          text += seg.text;
          width += seg.width;
        } else if (text !== '') {
          words[text] = Math.round((width / EM) * 10) / 10;
          text = '';
          width = 0;
        }
      }
    }
    return words;
  };
  /** Each line ends between two words: the piece that opens a line after
   *  a break inside a word keeps the width the word had beyond the break,
   *  whatever stood before it. */
  const expectNoWordBroken = (doc: VDTDocument): void => {
    for (const line of firstBlock(doc).lines) expect(line.text).not.toMatch(/-$/);
  };

  it('a word cut at its syllables is measured whole in a styled paragraph: the Catalan dot is in the piece after it', () => {
    const doc = buildDocument({ markdown: STYLED }, config('ca', 'Crimson Pro', hyphenated('ca')));
    expectNoWordBroken(doc);
    // Chrome's widths in Catalan (4381.8, 2708 and 2856.4 in any other
    // language).
    expect(wordWidths(doc)).toMatchObject({ 'instal\u00B7laci\u00F3': 4727.5, 'il\u00B7lusi\u00F3': 3053.7, 'col\u00B7legi.': 3430.7 });
    // `tal·` alone has the narrow dot (1292); the 354 units of 1024 the
    // Catalan one adds went to the piece after it, 725.6 wide alone.
    const pieces = firstBlock(doc).lines[0]!.segments!.filter((s) => s.kind !== 'space').map((s) => [s.text, Math.round((s.width / EM) * 10) / 10]);
    expect(pieces.slice(1, 5)).toEqual([['ins', 1191.4], ['tal\u00B7', 1292], ['la', 1071.3], ['ci\u00F3', 1172.9]]);
    const spanish = buildDocument({ markdown: STYLED }, config('es', 'Crimson Pro', hyphenated('es')));
    expect(wordWidths(spanish)).toMatchObject({ 'instal\u00B7laci\u00F3': 4381.8, 'il\u00B7lusi\u00F3': 2708, 'col\u00B7legi.': 3085 });
  });

  it('and in a plain paragraph too (#772); piece by piece, each as wide as it is alone, only under \'host\'', () => {
    const pieces = (doc: VDTDocument) => firstBlock(doc).lines[0]!.segments!.filter((s) => s.kind !== 'space').map((s) => [s.text, Math.round((s.width / EM) * 10) / 10]);
    const doc = buildDocument({ markdown: PLAIN }, config('ca', 'Crimson Pro', hyphenated('ca')));
    expectNoWordBroken(doc);
    expect(pieces(doc).slice(1, 5)).toEqual([['ins', 1191.4], ['tal\u00B7', 1292], ['la', 1071.3], ['ci\u00F3', 1172.9]]);
    const host = buildDocument({ markdown: PLAIN }, config('ca', 'Crimson Pro', { ...hyphenated('ca'), shapingLanguage: 'host' }));
    expect(pieces(host).slice(1, 5)).toEqual([['ins', 1191.4], ['tal\u00B7', 1292], ['la', 725.6], ['ci\u00F3', 1172.9]]);
  });

  it.skipIf(!hasPdftotext)('the PDF prints each word where the layout put it, as wide as measured: no hole after the dot', async () => {
    for (const markdown of [STYLED, PLAIN]) {
      for (const locale of ['ca', 'es']) {
        const doc = buildDocument({ markdown }, config(locale, 'Crimson Pro', hyphenated(locale)));
        expect(firstBlock(doc).lines.length, locale).toBeGreaterThan(1);
        expectNoWordBroken(doc);
        await expectInPlace(doc, `justified ${locale} ${markdown === STYLED ? 'styled' : 'plain'}`, true);
      }
      // Set ragged, and with no syllables: the words come whole.
      await expectInPlace(buildDocument({ markdown }, config('ca', 'Crimson Pro', { textAlign: 'left' })), 'ragged ca', true);
      await expectInPlace(buildDocument({ markdown }, config('ca', 'Crimson Pro')), 'whole words ca', true);
    }
  }, 120_000);

  it.skipIf(!hasPdftotext)('a document that keeps the host\u2019s language is measured with the plain dot and printed piece by piece', async () => {
    const doc = buildDocument({ markdown: STYLED }, config('ca', 'Crimson Pro', { ...hyphenated('ca'), shapingLanguage: 'host' }));
    expectNoWordBroken(doc);
    expect(wordWidths(doc)).toMatchObject({ 'instal\u00B7laci\u00F3': 4381.8, 'il\u00B7lusi\u00F3': 2708 });
    await expectInPlace(doc, 'host ca', true);
  }, 120_000);
});

describe('a word cut at its hyphen, on a line painted as one text (#770)', () => {
  // A compound may end a line at its hyphen, so a line carries it in two
  // pieces. In a paragraph with a style in it (the word in italics goes to
  // the second line) the first is as wide as it is alone and the second as
  // wide as the word grew by it, with whatever the face does across the
  // hyphen: Crimson Pro kerns it against the `o` after it by +14.6
  // thousandths of the em and against an `x` by -4.9. The first line has
  // no style of its own and is painted as one text, as the canvas paints
  // it in one `fillText`: Chrome 154 puts the `l` of `revisar-los.` in
  // Schibsted Grotesk (kerned -0.765 px at 19.58 px) 0.765 px before the
  // place of `los.`, and ends the word where that place ends.
  const TEXT = 'un porta-objectes de vidre i un para-xocs de *goma* negra.';
  const laidOut = (shapingLanguage: 'document' | 'host'): VDTDocument => buildDocument({ markdown: TEXT }, config('ca', 'Crimson Pro', { textAlign: 'left', shapingLanguage }));
  /** Where the layout starts and ends each text of the first line,
   *  thousandths of the em from the sheet's left. */
  const places = (doc: VDTDocument): Record<string, { start: number; end: number; width: number }> => {
    const line = firstBlock(doc).lines[0]!;
    const out: Record<string, { start: number; end: number; width: number }> = {};
    let x = line.bbox.x;
    for (const seg of line.segments!) {
      if (seg.kind !== 'space') out[seg.text] = { start: x / EM, end: (x + seg.width) / EM, width: Math.round((seg.width / EM) * 10) / 10 };
      x += seg.width;
    }
    return out;
  };
  /** Where the PDF sets the rest of each compound of the first line: the
   *  origin of the glyph after the hyphen, the pen the hyphen left, and
   *  the pen after the word's last glyph. */
  const rests = async (doc: VDTDocument): Promise<Array<{ start: number; afterHyphen: number; end: number }>> => {
    const glyphs = (await paintedGlyphs(await renderToPdf(doc, { fontProvider, accessible: false })))[0]!.filter((g) => g.object === 0);
    // The line is one text object, and reads as its text.
    expect(glyphs.map((g) => g.text).join('')).toBe(firstBlock(doc).lines[0]!.text);
    const out: Array<{ start: number; afterHyphen: number; end: number }> = [];
    glyphs.forEach((g, i) => {
      if (g.text !== '-') return;
      let last = i + 1;
      while (glyphs[last + 1] && glyphs[last + 1]!.text !== ' ') last++;
      out.push({ start: glyphs[i + 1]!.x / EM, afterHyphen: (g.x + g.advance) / EM, end: (glyphs[last]!.x + glyphs[last]!.advance) / EM });
    });
    return out;
  };

  it('the layout holds the head as wide as alone and the rest as wide as the word grew by it', () => {
    for (const mode of ['document', 'host'] as const) {
      const doc = laidOut(mode);
      expect(firstBlock(doc).lines.map((line) => line.text)).toEqual(['un porta-objectes de vidre i un para-xocs de', 'goma negra.']);
      // `objectes` is 3267.6 wide alone, `xocs` 1756.9.
      expect(places(doc)).toMatchObject({ 'porta-': { width: 2529.3 }, objectes: { width: 3282.2 }, 'para-': { width: 2150.4 }, xocs: { width: 1752 } });
    }
  });

  it('the PDF sets the word as one text: the rest stands the kerning from its place and ends where its place ends', async () => {
    const doc = laidOut('document');
    const at = places(doc);
    const [objectes, xocs] = await rests(doc);
    expect(objectes!.afterHyphen).toBeCloseTo(at.objectes!.start, 0);
    expect(objectes!.start - at.objectes!.start).toBeCloseTo(14.6, 0);
    expect(objectes!.end).toBeCloseTo(at.objectes!.end, 0);
    expect(xocs!.afterHyphen).toBeCloseTo(at.xocs!.start, 0);
    expect(xocs!.start - at.xocs!.start).toBeCloseTo(-4.9, 0);
    expect(xocs!.end).toBeCloseTo(at.xocs!.end, 0);
  }, 120_000);

  it('a document that keeps the host\u2019s language sets the rest alone at its place: it ends the kerning short of its place, or past it', async () => {
    const doc = laidOut('host');
    const at = places(doc);
    const [objectes, xocs] = await rests(doc);
    expect(objectes!.start).toBeCloseTo(at.objectes!.start, 0);
    expect(objectes!.end - at.objectes!.end).toBeCloseTo(-14.6, 0);
    expect(xocs!.start).toBeCloseTo(at.xocs!.start, 0);
    expect(xocs!.end - at.xocs!.end).toBeCloseTo(4.9, 0);
  }, 120_000);
});

describe('the size a browser sets a face at (#770)', () => {
  // Chrome measures and paints 11.4583 px text at 11.45 px: every width of
  // the layout is 0.072 % under the PDF's advance at the size asked for,
  // more than the half thousandth the word rule allows two widths of one
  // text. `Crimson Pro Cut` is measured so; `Crimson Pro` at the size
  // asked for, as a layout made with no browser is.
  const SIZE_PX = 11.4583;
  const UNIT = SIZE_PX / 1000;
  const laidOut = (markdown: string, fontFamily: string, bodyText: Partial<PostextConfig['bodyText']> = {}, width = PAGE): VDTDocument => {
    const base = config('ca', fontFamily, { fontSize: pt(SIZE_PX), lineHeight: pt(20), ...bodyText });
    return buildDocument({ markdown }, { ...base, page: { ...base.page, width: pt(width) } });
  };
  /** The glyphs of the first line, by what they read as. */
  const firstLine = async (doc: VDTDocument) => {
    const glyphs = (await paintedGlyphs(await renderToPdf(doc, { fontProvider, accessible: false })))[0]!;
    return glyphs.filter((g) => Math.abs(g.y - glyphs[0]!.y) < 0.5);
  };

  it('is the size cut to a hundredth of a pixel, in single precision', () => {
    // Chrome 154, the advance of thirty letters against the em.
    expect([20.208333333333332, 19.583333333333336, 21.666666666666668, 15.4167, 11.4583, 20.3, 20.22, 20.23, 15.42, 20.25, 20, 12].map(browserSizePx))
      .toEqual([20.2, 19.58, 21.66, 15.41, 11.45, 20.29, 20.21, 20.23, 15.42, 20.25, 20, 12]);
  });

  // The compound of the test above, on a line with no style of its own.
  const COMPOUND = 'un porta-objectes de vidre i un para-xocs de goma negra per a la casa gran de la vila vella, *nova* i bona.';
  for (const family of ['Crimson Pro Cut', 'Crimson Pro']) {
    it(`a word cut at its hyphen is set as one text, measured ${family === 'Crimson Pro' ? 'at the size asked for' : 'as a browser sets the face'}`, async () => {
      const doc = laidOut(COMPOUND, family, { textAlign: 'left' });
      const line = firstBlock(doc).lines[0]!;
      expect(line.text).toBe('un porta-objectes de vidre i un para-xocs de goma negra per a la casa gran de la vila');
      const head = line.segments!.findIndex((seg) => seg.text === 'porta-');
      const start = line.bbox.x + line.segments!.slice(0, head + 1).reduce((sum, seg) => sum + seg.width, 0);
      // The rest is as wide as the word grew by it: its 3267.6 alone and
      // the 14.6 of the hyphen against its `o`, at the size measured.
      const measuredAt = family === 'Crimson Pro' ? SIZE_PX : 11.45;
      expect(line.segments![head + 1]!.width / (measuredAt / 1000)).toBeCloseTo(3282.2, 0);
      const glyphs = await firstLine(doc);
      const hyphen = glyphs.findIndex((g) => g.text === '-');
      // The `o` stands the kerning after the hyphen's pen, which is where
      // the place of the rest starts, to the 2 units the head is wider at
      // the size asked for than at the size cut.
      expect((glyphs[hyphen + 1]!.x - (glyphs[hyphen]!.x + glyphs[hyphen]!.advance)) / UNIT).toBeCloseTo(14.6, 0);
      expect(Math.abs(glyphs[hyphen]!.x + glyphs[hyphen]!.advance - start) / UNIT).toBeLessThan(2.5);
    }, 120_000);

    it(`the hyphen a line ends on is set apart, measured ${family === 'Crimson Pro' ? 'at the size asked for' : 'as a browser sets the face'}`, async () => {
      // `po-`: the head 1020.5 and the hyphen 364.3, measured apart;
      // Crimson Pro kerns the hyphen against the `o` before it by +14.6.
      const WIDTH = 104;
      const doc = laidOut('el noi no po\u00ADdria venir a la casa del *pare* avui', family, {}, WIDTH);
      const line = firstBlock(doc).lines[0]!;
      expect(line.text).toBe('el noi no po-');
      expect(line.hyphenated).toBe(true);
      const measuredAt = family === 'Crimson Pro' ? SIZE_PX : 11.45;
      expect(line.segments![line.segments!.length - 1]!.width / (measuredAt / 1000)).toBeCloseTo(1384.8, 0);
      const glyphs = await firstLine(doc);
      expect(glyphs.map((g) => g.text).join('').replace(/ /g, '')).toBe('elnoinopo-');
      const hyphen = glyphs[glyphs.length - 1]!;
      const o = glyphs[glyphs.length - 2]!;
      // The hyphen starts where the `o` left the pen, to the unit the head
      // is wider at the size asked for than at the size cut, and the
      // justified line ends at its measure; set in the head's text the
      // hyphen stood 14.6 further on.
      expect(Math.abs(hyphen.x - (o.x + o.advance)) / UNIT).toBeLessThan(1.5);
      expect(Math.abs(hyphen.x + hyphen.advance - (WIDTH - MARGIN)) / UNIT).toBeLessThan(1.5);
    }, 120_000);
  }
});
