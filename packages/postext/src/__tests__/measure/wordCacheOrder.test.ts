import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { clearMeasurementCache } from '../../measure/index.js';
import { canvasText, measureMarkedWidth, measureRunWidth, measureTextWidth, measureUncachedWidth, scriptSensitive, setMeasureLanguage } from '../../measure/canvas.js';
import { measureBlock } from '../../measure/plain.js';
import { pretextLanguageState } from '../../measure/pretextLanguage.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDocument } from '../../vdt.js';

// #770: Chrome's canvas keeps the words it shaped, by context, font and
// language, under the word's text alone, and a word with no letter has two
// shapes: Latin forms when its string reached the shaper one byte a
// character, the font's default forms when the string held a character
// past U+00FF. The first shape kept answers for both, so on one context a
// width depended on what was measured before: `2026` after `2026 — 2027`,
// the stop of an Arabic word after `.` was measured alone. A document
// shaped in its own language is measured on two contexts, one for each
// kind of string; one shaped in its host's on one, as it always was.

const NBSP = '\u00A0';
const EM_DASH = '\u2014';
const HAN = '\u5E74';
const KITAB = '\u0643\u062A\u0627\u0628';
const BEH = '\u0628';
const VERSE_SIGN = '\u060E';
const WIDE_RE = /[^\u0000-\u00FF]/;

type Shape = 'latin' | 'default';
const isHan = (ch: string): boolean => /\p{Script=Han}/u.test(ch);
const isRtlLetter = (ch: string): boolean => /[\u0590-\u08FF]/.test(ch) && /\p{L}/u.test(ch);
const isLtrLetter = (ch: string): boolean => /\p{L}/u.test(ch) && !isRtlLetter(ch);
const isDigit = (ch: string): boolean => /[0-9]/.test(ch);
const hasScript = (ch: string): boolean => /[^\p{Script=Common}\p{Script=Inherited}]/u.test(ch);

/** Advances, in ems, of a face that draws its marks and digits by script
 *  as Amiri and Noto Serif SC do (`Reads`), and of one that draws them one
 *  way (`Plain`). */
function advance(ch: string, shape: Shape, font: string): number {
  if (ch === ' ' || ch === NBSP) return 0.25;
  if (isHan(ch)) return 1;
  const latin = shape === 'latin' || font.includes('Plain');
  if (ch === '.') return latin ? 0.2 : 0.3;
  if (ch === '(' || ch === ')') return latin ? 0.25 : 0.45;
  if (ch === '"') return latin ? 0.39 : 0.37;
  if (isDigit(ch)) return latin ? 0.55 : 0.47;
  return 0.5;
}

/** The words Chrome 154 shapes and keeps of a canvas text: what stands
 *  between two spaces, cut where the direction changes and before a Han
 *  character. */
function wordsOf(text: string, direction: string): string[] {
  const out: string[] = [];
  for (const word of text.split(' ')) {
    if (word === '') continue;
    const rtl = direction === 'rtl';
    const side = (ch: string): string => (rtl ? (isLtrLetter(ch) || isDigit(ch) ? 'l' : 'r') : isRtlLetter(ch) ? 'r' : 'l');
    let piece = '';
    for (const ch of word) {
      if (piece !== '' && (isHan(ch) || side(ch) !== side(piece[piece.length - 1]!))) {
        out.push(piece);
        piece = '';
      }
      piece += ch;
    }
    if (piece !== '') out.push(piece);
  }
  return out;
}

/** How a word is shaped the first time: by its first letter's script when
 *  it has one, else by the kind of string it came in. */
function shapeOf(word: string, wide: boolean): Shape {
  const letter = [...word].find(hasScript);
  if (letter !== undefined) return /\p{Script=Latin}/u.test(letter) ? 'latin' : 'default';
  return wide ? 'default' : 'latin';
}

/** The width of `text` on a context that kept the shapes of `kept`. */
function shapedWidth(text: string, font: string, lang: string, direction: string, kept: Map<string, Shape>): number {
  const size = parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');
  const wide = WIDE_RE.test(text);
  let width = (text.split(' ').length - 1) * advance(' ', 'latin', font) * size;
  for (const word of wordsOf(text, direction)) {
    const key = `${font}|${lang}|${word}`;
    let shape = kept.get(key);
    if (shape === undefined) {
      shape = shapeOf(word, wide);
      kept.set(key, shape);
    }
    for (const ch of word) width += advance(ch, shape, font) * size;
  }
  return width;
}

/** What a context that never measured anything gives `text`. */
const fresh = (text: string, font: string, lang = 'ar', direction = 'ltr'): number => shapedWidth(text, font, lang, direction, new Map());

class Context2D {
  private shorthand = '10px Body';
  lang = 'inherit';
  direction = 'ltr';
  letterSpacing = '0px';
  /** The words this context shaped, and how. */
  readonly kept = new Map<string, Shape>();
  /** The kinds of string it was handed, by language. */
  readonly kinds = new Map<string, Set<'narrow' | 'wide'>>();
  measures = 0;
  get font(): string {
    return this.shorthand;
  }
  set font(value: string) {
    this.shorthand = value;
  }
  measureText(s: string): { width: number } {
    this.measures++;
    let kinds = this.kinds.get(this.lang);
    if (!kinds) this.kinds.set(this.lang, kinds = new Set());
    kinds.add(WIDE_RE.test(s) ? 'wide' : 'narrow');
    return { width: shapedWidth(s, this.shorthand, this.lang, this.direction, this.kept) };
  }
}
const contexts: Context2D[] = [];
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = Context2D;
globals.OffscreenCanvas = class {
  getContext(): Context2D {
    const ctx = new Context2D();
    contexts.push(ctx);
    return ctx;
  }
};
const newContext = (): Context2D => new (globals.OffscreenCanvas as new () => { getContext(): Context2D })().getContext();

/** The contexts that took both kinds of string in one language other than
 *  the host's: none may, or a word of theirs has two shapes. */
const mixed = (): Context2D[] => contexts.filter((ctx) => [...ctx.kinds].some(([lang, kinds]) => lang !== 'inherit' && kinds.size > 1));

const READS = '10px Reads';
const PLAIN = '10px Plain';

beforeEach(() => {
  setMeasureLanguage(undefined);
  clearMeasurementCache();
});

describe('the model of the canvas (#770)', () => {
  it('a word with no letter is shaped by the kind of string it comes in, and the first shape is kept', () => {
    const a = newContext();
    a.font = READS;
    expect(a.measureText('2026').width).toBeCloseTo(22, 6);
    // `2026` is kept in its Latin forms; `2027` enters in the default ones.
    expect(a.measureText(`2026 ${EM_DASH} 2027`).width).toBeCloseTo(22 + 2.5 + 5 + 2.5 + 18.8, 6);
    const b = newContext();
    b.font = READS;
    b.measureText(`2026 ${EM_DASH} 2027`);
    expect(b.measureText('2026').width).toBeCloseTo(18.8, 6);
    // The stop of an Arabic word is a run of its own left to right.
    const c = newContext();
    c.font = READS;
    expect(c.measureText(`${KITAB}.`).width).toBeCloseTo(23, 6);
    expect(c.measureText('.').width).toBeCloseTo(3, 6);
    expect(fresh('.', READS)).toBeCloseTo(2, 6);
  });
});

/** Strings as the engine measures them: words alone, words that hold a
 *  wider character, runs of several words. */
const CORPUS = [
  '2026', '.', '(1)', '46.', '"', 'end.', `2026 ${EM_DASH} 2027`, `2026${HAN}`, `"${HAN}"`, `${KITAB}.`, `(${KITAB})`, `${KITAB} .`,
  'in 2026', '2026 2027', `${KITAB}2026`, `(1) ${EM_DASH}`, `. ${EM_DASH}`, `${EM_DASH}`, `${BEH}${NBSP}.`,
];
const ORDERS: number[][] = [
  CORPUS.map((_, i) => i),
  CORPUS.map((_, i) => CORPUS.length - 1 - i),
  // The strings with a wider character first, then the Latin-1 ones.
  [...CORPUS.keys()].sort((a, b) => Number(WIDE_RE.test(CORPUS[b]!)) - Number(WIDE_RE.test(CORPUS[a]!))),
  [...CORPUS.keys()].sort((a, b) => Number(WIDE_RE.test(CORPUS[a]!)) - Number(WIDE_RE.test(CORPUS[b]!))),
];

describe('a width does not depend on what was measured before (#770)', () => {
  it('in the host\'s language a document is measured on one context, as it always was', () => {
    const before = contexts.length;
    // The stop of the Arabic word is kept in the font's default forms…
    expect(measureTextWidth(`${KITAB}.`, READS)).toBeCloseTo(23, 6);
    // …and answers for the stop measured alone, 2 px on a context that
    // measured nothing.
    expect(measureTextWidth('.', READS)).toBeCloseTo(3, 6);
    expect(contexts.slice(before).filter((ctx) => ctx.measures > 0).length).toBeLessThanOrEqual(1);
    expect(contexts.every((ctx) => [...ctx.kinds.keys()].every((lang) => lang === 'inherit') || mixed().length === 0)).toBe(true);
  });

  it('in its own language every string has the width a context that measured nothing gives it, in any order', () => {
    setMeasureLanguage('ar');
    for (const order of ORDERS) {
      // The engine drops its own widths; the browser keeps its shaped words.
      clearMeasurementCache();
      for (const i of order) {
        const text = CORPUS[i]!;
        expect(measureTextWidth(text, READS), text).toBeCloseTo(fresh(text, READS), 6);
        expect(measureRunWidth(text, READS), text).toBeCloseTo(fresh(text, READS), 6);
        expect(measureUncachedWidth(text, READS), text).toBeCloseTo(fresh(text, READS), 6);
      }
    }
    expect(mixed()).toEqual([]);
  });

  it('a word beside its mark, and one measured right to left, likewise', () => {
    setMeasureLanguage('ar');
    const marked = (): number[] => [
      measureMarkedWidth('46.', READS, '', `${NBSP}n`, false),
      measureMarkedWidth('46.', READS, '', `${NBSP}${VERSE_SIGN}`, false),
      measureMarkedWidth('.', READS, `${BEH}${NBSP}`, '', true),
      measureMarkedWidth(`${KITAB}.`, READS, '', '', true),
      measureMarkedWidth('.', READS, '', '', true),
    ];
    const first = marked();
    // Latin forms beside a Latin letter, the default ones beside an Arabic
    // sign; the stop of the Arabic word is in its run right to left.
    expect(first[0]).toBeCloseTo(13, 6);
    expect(first[1]).toBeCloseTo(12.4, 6);
    expect(first[3]).toBeCloseTo(23, 6);
    expect(first[4]).toBeCloseTo(2, 6);
    clearMeasurementCache();
    for (const text of [`${KITAB}.`, '.', `. ${EM_DASH}`, '46.', `46. ${EM_DASH}`]) measureTextWidth(text, READS);
    expect(marked()).toEqual(first);
    expect(mixed()).toEqual([]);
  });

  it('the probe of a face answers the same after any text', () => {
    setMeasureLanguage('ar');
    const marks = [`${NBSP}n`, `${NBSP}${VERSE_SIGN}`];
    expect(scriptSensitive(READS, marks)).toBe(true);
    expect(scriptSensitive(PLAIN, marks)).toBe(false);
    clearMeasurementCache();
    for (const text of CORPUS) measureTextWidth(text, READS);
    expect(scriptSensitive(READS, marks)).toBe(true);
    expect(mixed()).toEqual([]);
  });

  it('each language keeps its own two contexts\' worth of shapes, and going back to the host\'s changes nothing there', () => {
    setMeasureLanguage('ar');
    expect(measureTextWidth(`${KITAB}.`, READS)).toBeCloseTo(23, 6);
    expect(measureTextWidth('.', READS)).toBeCloseTo(2, 6);
    setMeasureLanguage('fa');
    expect(measureTextWidth('.', READS)).toBeCloseTo(2, 6);
    expect(measureTextWidth(`${KITAB}.`, READS)).toBeCloseTo(23, 6);
    setMeasureLanguage(undefined);
    expect(measureTextWidth(`${KITAB}.`, READS)).toBeCloseTo(23, 6);
    expect(measureTextWidth('.', READS)).toBeCloseTo(3, 6);
    expect(mixed()).toEqual([]);
  });

  it('the text handed to the canvas is the text measured', () => {
    expect(canvasText('2026')).toBe('2026');
    setMeasureLanguage('en');
    for (const text of ['2026', '978-3-16-148410-0', 'caf\u00E9', `2026 ${EM_DASH} 2027`, KITAB]) expect(canvasText(text)).toBe(text);
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (family: string, shaping: 'document' | 'host', bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  page: { width: pt(220), height: pt(600), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  locale: 'ar',
  bodyText: { fontFamily: family, fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, shapingLanguage: shaping, ...bodyText },
});
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const widths = (doc: VDTDocument): string => JSON.stringify(paragraphs(doc).map((b) => b.lines.map((l) => (l.segments ?? []).map((s) => [s.text, +s.width.toFixed(3)]))));

// Two documents in one face: words that carry their marks, and the same
// marks standing alone. A word with no letter is shaped alone here
// (`scriptContext: false`, as up to postext 1.27), which is where the two
// shapes of one word meet on the engine's context.
const CARRIED = `${KITAB}. (${KITAB}) ${KITAB}.\n\n**${KITAB}.** (${KITAB}) ${KITAB}.\n`;
const ALONE = `${KITAB} . ( 1 ) ${KITAB} .\n\n**${KITAB}** . ( 1 ) ${KITAB} .\n`;

describe('two documents laid out in either order (#770)', () => {
  const alone = (markdown: string, cfg: PostextConfig): string => {
    // A page that laid out nothing: the engine's widths dropped and its
    // contexts' shaped words too.
    clearMeasurementCache();
    for (const ctx of contexts) ctx.kept.clear();
    return widths(buildDocument({ markdown }, cfg));
  };

  it('shaped in their own language: each is laid out as it is alone', () => {
    const cfg = config('Reads', 'document', { scriptContext: false });
    const carried = alone(CARRIED, cfg);
    const apart = alone(ALONE, cfg);
    for (const ctx of contexts) ctx.kept.clear();
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: CARRIED }, cfg))).toBe(carried);
    expect(widths(buildDocument({ markdown: ALONE }, cfg))).toBe(apart);
    // The other way round, the engine's widths dropped in between as a
    // host may do, the browser's shaped words kept.
    for (const ctx of contexts) ctx.kept.clear();
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: ALONE }, cfg))).toBe(apart);
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: CARRIED }, cfg))).toBe(carried);
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: ALONE }, cfg))).toBe(apart);
    expect(mixed()).toEqual([]);
  });

  it('shaped in their host\'s language: the second depends on the first, as it did', () => {
    const cfg = config('Reads', 'host', { scriptContext: false });
    const apart = alone(ALONE, cfg);
    for (const ctx of contexts) ctx.kept.clear();
    clearMeasurementCache();
    buildDocument({ markdown: CARRIED }, cfg);
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: ALONE }, cfg))).not.toBe(apart);
  });

  it('with the script of a word with no letter decided by the layout (the default), no context takes a word in two shapes', () => {
    const cfg = config('Reads', 'document');
    const carried = alone(CARRIED, cfg);
    const apart = alone(ALONE, cfg);
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: CARRIED }, cfg))).toBe(carried);
    clearMeasurementCache();
    expect(widths(buildDocument({ markdown: ALONE }, cfg))).toBe(apart);
    expect(mixed()).toEqual([]);
  });
});

describe('the plain-paragraph library\'s segments (#770)', () => {
  // A paragraph with no formatting, every word with a letter: the text
  // library breaks it and measures its segments itself.
  const PLAIN_TEXT = `He wrote "${HAN}" twice, then "no" and "yes" (as said) at the end.`;

  it('are measured by the engine\'s contexts in a document shaped in its own language', () => {
    setMeasureLanguage('en');
    const block = measureBlock(PLAIN_TEXT, PLAIN, 400, 14, { textAlign: 'left' });
    expect(block.lines.length).toBeGreaterThan(0);
    expect(pretextLanguageState()).toBe('followed');
    // Whatever the library measured went to a context that takes one kind
    // of string: none took both.
    expect(mixed()).toEqual([]);
    const measured = contexts.filter((ctx) => (ctx.kinds.get('en')?.size ?? 0) > 0);
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.length).toBeLessThanOrEqual(2);
  });

  it('and by the library\'s own context in the host\'s language, as before', () => {
    setMeasureLanguage('en');
    measureBlock(PLAIN_TEXT, PLAIN, 400, 14, { textAlign: 'left' });
    const count = (): number => contexts.reduce((sum, ctx) => sum + ctx.measures, 0);
    const own = contexts.map((ctx) => ctx.measures);
    setMeasureLanguage(undefined);
    clearMeasurementCache();
    const before = count();
    measureBlock(`${PLAIN_TEXT} Again and again.`, PLAIN, 400, 14, { textAlign: 'left' });
    expect(count()).toBeGreaterThan(before);
    // The contexts of the language measured in took none of it.
    contexts.forEach((ctx, i) => {
      if ((ctx.kinds.get('en')?.size ?? 0) > 0 && !ctx.kinds.has('inherit')) expect(ctx.measures).toBe(own[i]);
    });
  });
});
