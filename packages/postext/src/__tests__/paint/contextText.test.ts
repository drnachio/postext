import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile, readdirSync as readDir } from 'node:fs';
import { renderPageToCanvas } from '../../canvas-backend/index.js';
import { contextTextWidth, fillContextText, handedText, measureContextText, strokeContextText } from '../../canvas-backend/contextText.js';
import { buildDocument } from '../../pipeline/index.js';
import { clearMeasurementCache } from '../../measure/index.js';
import type { PostextConfig } from '../../types.js';
import type { VDTDocument, VDTLine } from '../../vdt.js';

// #770, the painter's side of Chrome's word cache. A canvas keeps the
// words it shaped under their text alone, and a word with no letter
// shapes two ways: by the font's Latin rules in a string of Latin-1
// characters, by its default rules in a string that holds a wider
// character. The first shape kept answers for both, so a text painted on
// the page's one canvas was as wide as what had been painted there
// before made it. The backend hands every text over through
// `contextText.ts`, which keeps a cache per kind of string on the one
// context; and a line that holds both kinds is not painted as one text.

const readFileSync = readFile as (path: URL, encoding: 'utf-8') => string;
const readdirSync = readDir as (path: URL) => string[];
const BACKEND = new URL('../../canvas-backend/', import.meta.url);

/** The code of a file, its comments blanked (the line numbers kept). */
function code(file: URL): string[] {
  const text = readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment: string) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  return text.split('\n');
}

describe('the paint code hands its texts over through contextText.ts', () => {
  it('no painter calls fillText, strokeText or measureText on a context itself', () => {
    // `contextText.ts` is the helper; `mirrorFrame.ts` wraps the context's
    // own methods for a mirrored page, below the helper.
    const files = readdirSync(BACKEND).filter((name) => /\.ts$/.test(name) && name !== 'contextText.ts' && name !== 'mirrorFrame.ts');
    const bare: string[] = [];
    for (const name of files) {
      code(new URL(name, BACKEND)).forEach((line, i) => {
        if (/\.\s*(fillText|strokeText|measureText)\s*\(/.test(line)) bare.push(`canvas-backend/${name}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bare, [
      'A text is painted and measured on a painting context through canvas-backend/contextText.ts:',
      '  fillContextText(ctx, text, x, y), strokeContextText(ctx, text, x, y), contextTextWidth(ctx, text),',
      '  measureContextText(ctx, text).',
      'Chrome keeps the words a context shaped under their text alone, and a word with no letter shapes',
      'otherwise in a string with a character past U+00FF: a bare call fills the cache the other kind of',
      'string is read from, and the next `2016` is as wide as the line painted before made it (#770). Found:',
      ...bare.map((o) => `  ${o}`),
    ].join('\n')).toEqual([]);
    expect(files.length).toBeGreaterThan(10);
  });
});

// ─── A context that keeps its words as Chrome does ──────────────────────────

const sizeOf = (font: string): number => parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');
const WIDE = /[^\u0000-ÿ]/;
/** A character with a script of its own: a word with none has no letter. */
const LETTER = /[^\p{Script=Common}\p{Script=Inherited}]/u;
const HAN = /[一-鿿]/;

/** The words of a string as the browser cuts it: at its spaces, each a
 *  word of its own, and before a Han character that follows another
 *  character. */
function wordsOf(text: string): string[] {
  const words: string[] = [];
  let word = '';
  for (const ch of text) {
    if (ch === ' ') {
      if (word) words.push(word);
      words.push(ch);
      word = '';
    } else {
      if (word && HAN.test(ch)) {
        words.push(word);
        word = '';
      }
      word += ch;
    }
  }
  if (word) words.push(word);
  return words;
}

/**
 * The advance, in ems, of a word shaped alone in a face that draws a word
 * with no letter by script, as Noto Serif SC and Amiri do: a digit 0.55 em
 * and a bracket 0.3 em by its Latin rules, 0.5 em and 0.4 em by its
 * default ones. `byDefault`: the word has no letter and came in a string
 * with a character past U+00FF.
 */
function shaped(word: string, byDefault: boolean): number {
  let ems = 0;
  for (const ch of word) {
    if (ch === ' ' || ch === ' ') ems += 0.25;
    else if (/[0-9]/.test(ch)) ems += byDefault ? 0.5 : 0.55;
    else if (ch === '(' || ch === ')') ems += byDefault ? 0.4 : 0.3;
    else if (/[⺀-鿿＀-￯]/.test(ch)) ems += 1;
    else ems += 0.5;
  }
  return ems;
}

/** The words a context shaped: its cache. */
type Words = Map<string, number>;

/** The width of `text` on a context that shaped `words` before, in the
 *  state `key` (font, language, letter-spacing and word spacing: each
 *  value keeps its own words). */
function cachedWidth(words: Words, key: string, text: string, font: string, spacing: number): number {
  const wide = WIDE.test(text);
  let width = 0;
  for (const word of wordsOf(text)) {
    const at = `${key}\u0000${word}`;
    let ems = words.get(at);
    if (ems === undefined) words.set(at, ems = shaped(word, wide && !LETTER.test(word) && word !== ' '));
    width += ems * sizeOf(font);
  }
  return width + spacing * Array.from(text).length;
}

/** The measuring context of the layout: an `OffscreenCanvas`, with a cache
 *  of its own. */
class MeasureContext {
  private shorthand = '10px Body';
  private words: Words = new Map();
  lang = 'inherit';
  letterSpacing = '0px';
  direction = 'ltr';
  get font(): string {
    return this.shorthand;
  }
  set font(value: string) {
    this.shorthand = value;
  }
  measureText(s: string): { width: number } {
    return { width: cachedWidth(this.words, `${this.shorthand}|${this.lang}`, s, this.shorthand, 0) };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = MeasureContext;
globals.OffscreenCanvas = class {
  getContext(): MeasureContext {
    return new MeasureContext();
  }
};

interface Painted { text: string; x: number; y: number; width: number; wordSpacing: string }
interface State { lang: string; spacing: number; wordSpacing: string; font: string; direction: string; textAlign: string; textBaseline: string; fillStyle: string }

/**
 * A painting context with one cache of words for as long as it lives,
 * keyed by its font, language, letter-spacing and word spacing as
 * Chrome's is. `save()` keeps the state and makes one in the language
 * `inherit` whose word spacing reads `""` though the one saved is in
 * force; a value set there is taken; `restore()` brings the outer state
 * back. Every text is recorded with its advance in the state it was
 * painted in. `wordSpacing: false`: a context without the attribute.
 */
function chromeContext(options: { wordSpacing?: boolean } = {}): { ctx: CanvasRenderingContext2D; painted: Painted[]; spacing: () => string } {
  const painted: Painted[] = [];
  const words: Words = new Map();
  const stack: State[] = [];
  /** What `wordSpacing` reads in each state saved. */
  const reads: string[] = [];
  let read = '0px';
  let state: State = { lang: 'inherit', spacing: 0, wordSpacing: '0px', font: '10px Body', direction: 'ltr', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '' };
  const widthNow = (s: string): number => cachedWidth(words, `${state.font}|${state.lang}|${state.spacing}|${state.wordSpacing}`, s, state.font, state.spacing);
  const record = (text: string, x: number, y: number): void => {
    const width = widthNow(text);
    if (text.trim()) painted.push({ text, x, y, width, wordSpacing: state.wordSpacing });
  };
  const hasSpacing = options.wordSpacing !== false;
  const api: Record<string, unknown> = {
    save() {
      stack.push(state);
      reads.push(read);
      state = { ...state, lang: 'inherit' };
      read = '';
    },
    restore() {
      const saved = stack.pop();
      if (!saved) return;
      state = saved;
      read = reads.pop()!;
    },
    measureText: (s: string) => ({ width: widthNow(s) }),
    fillText: record,
    strokeText: record,
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(own, key) {
      if (typeof key === 'string' && Object.hasOwn(own, key)) return own[key];
      if (key === 'letterSpacing') return stack.length ? '' : `${state.spacing}px`;
      if (key === 'wordSpacing') return hasSpacing ? read : undefined;
      if (typeof key === 'string' && key in api) return api[key];
      if (typeof key === 'string' && key in state) return state[key as keyof State];
      return () => undefined;
    },
    set(own, key, value) {
      if (key === 'letterSpacing') {
        const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)px$/.exec(String(value));
        if (m) state.spacing = Number(m[1]);
      } else if (key === 'wordSpacing') {
        if (hasSpacing && /^(-?\d*\.?\d+(?:e[+-]?\d+)?)px$/.test(String(value))) {
          state.wordSpacing = String(value);
          read = state.wordSpacing;
        }
      } else if (typeof key === 'string' && key in state) (state as unknown as Record<string, unknown>)[key] = value;
      else if (typeof key === 'string') own[key] = value;
      return true;
    },
    has(_, key) {
      return typeof key === 'string' && (key in api || (key in state && (key !== 'wordSpacing' || hasSpacing)) || key === 'letterSpacing');
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, painted, spacing: () => state.wordSpacing };
}

beforeEach(() => clearMeasurementCache());

const pt = (value: number) => ({ value, unit: 'pt' as const });
function config(shaping: 'document' | 'host', extra: PostextConfig = {}): PostextConfig {
  return {
    locale: 'en',
    page: { width: pt(400), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
    bodyText: { fontFamily: 'Body', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, shapingLanguage: shaping, ...extra.bodyText },
  };
}

/** Every line of the document's first page, in order. */
function linesOf(doc: VDTDocument): VDTLine[] {
  return doc.pages[0]!.columns.flatMap((column) => column.blocks.flatMap((block) => block.lines));
}

/** The advance painted on the baseline of `line`, word spaces at their
 *  measured width: from the first text's start to the last one's end. */
function paintedExtent(painted: Painted[], line: VDTLine): number {
  const own = painted.filter((p) => Math.abs(p.y - line.baseline) < 0.01);
  return Math.max(...own.map((p) => p.x + p.width)) - Math.min(...own.map((p) => p.x));
}

function paint(doc: VDTDocument, chrome = chromeContext()): ReturnType<typeof chromeContext> {
  const canvas = { width: 0, height: 0, getContext: () => chrome.ctx } as unknown as HTMLCanvasElement;
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return chrome;
}

const HAN_LINE = '好 2016 10 (3) 行 2020';
const LATIN_LINE = '2016 (3) 10';

describe('the helper', () => {
  it('hands a text with a character past U+00FF over under the word spacing of its cache, any other under 0px', () => {
    const { ctx, spacing } = chromeContext();
    expect(handedText(ctx, 'in 2016 — 2020')).toBe('in 2016 — 2020');
    expect(spacing()).toBe('1e-9px');
    expect(handedText(ctx, 'café 2016')).toBe('café 2016');
    expect(spacing()).toBe('0px');
    expect(handedText(ctx, '好')).toBe('好');
    expect(spacing()).toBe('1e-9px');
  });

  it('a text is as wide whatever was painted before it, through fill, stroke and measure', () => {
    const texts = ['2016', '(3)', '好 2016 (3)', '2016 — (3)', 'in 2016', '10'];
    const fresh = (text: string): number => contextTextWidth(chromeContext().ctx, text);
    for (const order of [texts, [...texts].reverse()]) {
      const { ctx } = chromeContext();
      order.forEach((text, i) => {
        if (i % 3 === 0) fillContextText(ctx, text, 0, 0);
        else if (i % 3 === 1) strokeContextText(ctx, text, 0, 0);
        else measureContextText(ctx, text);
      });
      for (const text of texts) expect(contextTextWidth(ctx, text), text).toBeCloseTo(fresh(text), 6);
    }
    // What the helper is for: handed over bare, `2016` is 22 px alone and
    // 20 px once a line with a Han character was painted.
    const bare = chromeContext().ctx;
    expect(bare.measureText('2016').width).toBeCloseTo(22, 6);
    const after = chromeContext().ctx;
    after.fillText('好 2016 (3)', 0, 0);
    expect(after.measureText('2016').width).toBeCloseTo(20, 6);
  });

  it('holds through the states of a page: a value set inside a saved state is taken', () => {
    const { ctx, spacing } = chromeContext();
    fillContextText(ctx, '好 2016', 0, 0);
    ctx.save();
    expect(ctx.wordSpacing).toBe('');
    expect(contextTextWidth(ctx, '2016')).toBeCloseTo(22, 6);
    expect(spacing()).toBe('0px');
    ctx.save();
    expect(contextTextWidth(ctx, '好 2016')).toBeCloseTo(10 + 2.5 + 20, 6);
    ctx.restore();
    ctx.restore();
    expect(contextTextWidth(ctx, '2016')).toBeCloseTo(22, 6);
  });

  it('leaves a context without the attribute as it is', () => {
    const { ctx, painted } = chromeContext({ wordSpacing: false });
    fillContextText(ctx, '好 2016', 1, 2);
    expect(painted.map((p) => [p.text, p.x, p.y])).toEqual([['好 2016', 1, 2]]);
    expect('wordSpacing' in ctx).toBe(false);
    expect(Object.hasOwn(ctx, 'wordSpacing')).toBe(false);
  });
});

describe('a line with a Han character and a word with no letter', () => {
  for (const shaping of ['document', 'host'] as const) {
    it(`is painted word by word, each as wide as it was measured (${shaping})`, () => {
      const doc = buildDocument({ markdown: HAN_LINE }, config(shaping));
      const [line] = linesOf(doc);
      expect(line!.segments!.filter((s) => s.kind === 'text').map((s) => [s.text, Math.round(s.width * 100) / 100])).toEqual([['好', 10], ['2016', 22], ['10', 11], ['(3)', 11.5], ['行', 10], ['2020', 22]]);
      const { painted } = paint(doc);
      // As one text the line is 10 + 20 + 10 + 13 + 10 + 20 and five spaces:
      // 95.5 px for the 99 px of its words.
      expect(painted.map((p) => [p.text, Math.round(p.width * 100) / 100])).toEqual([['好', 10], ['2016', 22], ['10', 11], ['(3)', 11.5], ['行', 10], ['2020', 22]]);
      expect(paintedExtent(painted, line!)).toBeCloseTo(line!.bbox.width, 6);
    });

    it(`and leaves the words of the next line as they were measured (${shaping})`, () => {
      const doc = buildDocument({ markdown: `${HAN_LINE}\n\n${LATIN_LINE}` }, config(shaping));
      const [, second] = linesOf(doc);
      const { painted } = paint(doc);
      const own = painted.filter((p) => Math.abs(p.y - second!.baseline) < 0.01);
      // One text, as a line in one style always was: its words read from
      // the cache of the Latin-1 strings.
      expect(own.map((p) => p.text)).toEqual([LATIN_LINE]);
      expect(own[0]!.wordSpacing).toBe('0px');
      expect(own[0]!.width).toBeCloseTo(second!.bbox.width, 6);
      expect(second!.bbox.width).toBeCloseTo(22 + 2.5 + 11.5 + 2.5 + 11, 6);
    });
  }

  it('a line of Latin-1 words with a dash is one text still: its words have letters', () => {
    const doc = buildDocument({ markdown: 'north — south and east' }, config('document'));
    const [line] = linesOf(doc);
    const { painted } = paint(doc);
    expect(painted.map((p) => p.text)).toEqual(['north — south and east']);
    expect(painted[0]!.wordSpacing).toBe('1e-9px');
    expect(painted[0]!.width).toBeCloseTo(line!.bbox.width, 6);
  });

  it('a line of the CJK composer in one style is painted segment by segment: its number in a string of its own', () => {
    // No Han–Latin space: nothing on the line but its text.
    const doc = buildDocument({ markdown: '年は2016です' }, config('document', { locale: 'ja', cjk: { latinSpacing: { value: 0, unit: 'em' } } as PostextConfig['cjk'] }));
    const [line] = linesOf(doc);
    expect(line!.cjkComposed).toBe(true);
    expect(line!.bbox.width).toBeCloseTo(20 + 22 + 20, 6);
    const { painted } = paint(doc);
    // As one text the number takes the forms of a word with no letter
    // among Han characters: 20 px for the 22 px measured.
    expect(painted.map((p) => [p.text, Math.round(p.width * 100) / 100, p.wordSpacing])).toEqual([['年は', 20, '1e-9px'], ['2016', 22, '0px'], ['です', 20, '1e-9px']]);
    expect(paintedExtent(painted, line!)).toBeCloseTo(line!.bbox.width, 6);
  });

  it('a page painted again on its canvas is as wide as the first time', () => {
    const doc = buildDocument({ markdown: `${LATIN_LINE}\n\n${HAN_LINE}` }, config('document'));
    const chrome = chromeContext();
    paint(doc, chrome);
    const first = chrome.painted.map((p) => p.width);
    chrome.painted.length = 0;
    paint(doc, chrome);
    expect(chrome.painted.map((p) => p.width)).toEqual(first);
  });

  it('gives the context back with the word spacing it came with', () => {
    const doc = buildDocument({ markdown: HAN_LINE }, config('document'));
    const chrome = paint(doc);
    expect(chrome.painted.some((p) => p.wordSpacing === '1e-9px')).toBe(true);
    expect(chrome.spacing()).toBe('0px');
  });
});
