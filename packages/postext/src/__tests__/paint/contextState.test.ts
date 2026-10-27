import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile, readdirSync as readDir } from 'node:fs';
import { renderPageToCanvas } from '../../canvas-backend/index.js';
import { renderBlock } from '../../canvas-backend/blockRender.js';
import { renderComicBalloon } from '../../canvas-backend/comic.js';
import { fillScriptWord } from '../../canvas-backend/scriptText.js';
import { fillFlowText } from '../../canvas-backend/verticalText.js';
import { languageOf, letterSpacingOf, resetContextState, restoreContext, saveContext, setLetterSpacing } from '../../canvas-backend/contextState.js';
import { buildDocument } from '../../pipeline/index.js';
import { clearMeasurementCache } from '../../measure/index.js';
import type { PostextConfig, Resource } from '../../types.js';
import type { VDTBlock, VDTComicBalloon, VDTDesignTextBlock, VDTDocument, VDTPage } from '../../vdt.js';

// #764, the paint side. Chrome (131 and 154, a DOM canvas and an
// OffscreenCanvas) makes every saved state with the language `inherit`,
// and answers `""` for the letter-spacing inside one until another value
// is set. The page painter saves before it paints any text, so a document
// measured in its own language was painted in the host's; and a painter
// that read the letter-spacing to put it back assigned `""`, which the
// canvas ignores. The backend saves through `saveContext`, which carries
// the language, and keeps the letter-spacing it sets (`contextState.ts`).

const readFileSync = readFile as (path: URL, encoding: 'utf-8') => string;
const readdirSync = readDir as (path: URL, options: { withFileTypes: true }) => { name: string; isDirectory(): boolean }[];
const SRC = new URL('../../', import.meta.url);
const HELPER = 'canvas-backend/contextState.ts';

/** Every source file of the engine by its path under `src`, tests and
 *  benchmarks left out. */
function sources(dir: URL = SRC, under = ''): { rel: string; url: URL }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = under + entry.name;
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === '__bench__' ? [] : sources(new URL(`${entry.name}/`, dir), `${rel}/`);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [{ rel, url: new URL(entry.name, dir) }] : [];
  });
}

/** The code of a file, its comments blanked (the line numbers kept). */
function code(file: URL): string[] {
  const text = readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment: string) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  return text.split('\n');
}

function offences(files: { rel: string; url: URL }[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (file.rel === HELPER) continue;
    code(file.url).forEach((line, i) => {
      if (pattern.test(line)) found.push(`${file.rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return found;
}

describe('the paint code saves and spaces through contextState.ts', () => {
  it('no source file of the engine calls save() or restore() on a context itself', () => {
    const bare = offences(sources(), /\.\s*(save|restore)\s*\(/);
    expect(bare, [
      'A 2D context is saved and restored through canvas-backend/contextState.ts:',
      '  saveContext(ctx) in place of ctx.save(), restoreContext(ctx) in place of ctx.restore().',
      'A bare save() makes a state in the host page\'s language (Chrome sets `lang` back to `inherit`),',
      'so the text painted inside it has other glyphs than the layout measured (#764); and a bare',
      'restore() leaves the letter-spacing the backend remembers one state behind. Found:',
      ...bare.map((o) => `  ${o}`),
    ].join('\n')).toEqual([]);
  });

  it('no painter reads or writes the letter-spacing of a context itself', () => {
    const painters = sources().filter((file) => file.rel.startsWith('canvas-backend/') || file.rel === 'checks/looseLines.ts');
    const direct = offences(painters, /\b(ctx|context|c)\s*\.\s*(letterSpacing|wordSpacing)\b/);
    expect(direct, [
      'The letter-spacing of a painting context is set with setLetterSpacing(ctx, px) and asked with',
      'letterSpacingOf(ctx), both of canvas-backend/contextState.ts. Inside a saved state Chrome answers',
      '`""` for ctx.letterSpacing whatever is in force, and ignores `""` assigned back: a painter that',
      'reads it leaves the rest of the state with no tracking (#764). Found:',
      ...direct.map((o) => `  ${o}`),
    ].join('\n')).toEqual([]);
  });
});

// ─── A context as Chrome makes it ───────────────────────────────────────────

/** The language of the page that hosts the canvas (`inherit`). */
const HOST = 'en';
const primary = (lang: string): string => lang.toLowerCase().split('-')[0]!;
const sizeOf = (font: string): number => parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');
/** A face that draws by language, as the measured ones do: its digits are
 *  narrower in Chinese and Japanese, its full stop wider in Arabic. */
function advance(ch: string, lang: string): number {
  const language = primary(lang);
  if (ch === ' ' || ch === '\u00A0') return 0.25;
  if (/[0-9]/.test(ch)) return language === 'zh' || language === 'ja' ? 0.471 : 0.55;
  if (ch === '.') return language === 'ar' ? 0.4 : 0.3;
  if (/[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(ch)) return 1;
  return 0.5;
}
function widthOf(text: string, font: string, lang: string, spacing: number): number {
  let width = 0;
  let letters = 0;
  for (const ch of text) {
    width += advance(ch, lang === 'inherit' ? HOST : lang) * sizeOf(font);
    letters++;
  }
  return width + spacing * letters;
}

/** The measuring context of the layout: an `OffscreenCanvas` of the page. */
class MeasureContext {
  private shorthand = '10px Body';
  lang = 'inherit';
  letterSpacing = '0px';
  // An accessor, as on a real context: the plain-paragraph breaker's own
  // context is found through it (`measure/pretextLanguage.ts`).
  get font(): string {
    return this.shorthand;
  }
  set font(value: string) {
    this.shorthand = value;
  }
  measureText(s: string): { width: number } {
    return { width: widthOf(s, this.shorthand, this.lang, 0) };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = MeasureContext;
globals.OffscreenCanvas = class {
  getContext(): MeasureContext {
    return new MeasureContext();
  }
};

interface Painted { text: string; x: number; lang: string; spacing: number; font: string; depth: number }
interface State { lang: string; spacing: number; spacingText: string; font: string; direction: string; textAlign: string; textBaseline: string; fillStyle: string }

/**
 * A painting context that keeps its states as Chrome does: `save()` makes
 * one with the language `inherit` and a letter-spacing that reads `""`
 * (the spacing in force kept); the getter answers again once another
 * value is set; a value that is no length is ignored; `restore()` brings
 * the state saved back whole. Every text is recorded with the language and
 * the letter-spacing in force when it was painted, and every read of the
 * letter-spacing is counted.
 */
function chromeContext(): { ctx: CanvasRenderingContext2D; painted: Painted[]; reads: () => number; ignored: () => number } {
  const painted: Painted[] = [];
  let reads = 0;
  let ignored = 0;
  const stack: State[] = [];
  let state: State = { lang: 'inherit', spacing: 0, spacingText: '0px', font: '10px Body', direction: 'ltr', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '' };
  const record = (text: string, x: number): void => {
    if (text.trim()) painted.push({ text, x, lang: state.lang, spacing: state.spacing, font: state.font, depth: stack.length });
  };
  const api: Record<string, unknown> = {
    save() {
      stack.push(state);
      state = { ...state, lang: 'inherit', spacingText: '' };
    },
    restore() {
      const saved = stack.pop();
      if (saved) state = saved;
    },
    measureText: (s: string) => ({ width: widthOf(s, state.font, state.lang, state.spacing) }),
    fillText: record,
    strokeText: record,
  };
  // What the painter puts on the context itself stays on it (the mirrored
  // flow sets its own `fillText` there, and takes it off again).
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(own, key) {
      if (typeof key === 'string' && Object.hasOwn(own, key)) return own[key];
      if (key === 'letterSpacing') {
        reads++;
        return state.spacingText;
      }
      if (key === 'wordSpacing') {
        reads++;
        return stack.length ? '' : '0px';
      }
      if (typeof key === 'string' && key in api) return api[key];
      if (typeof key === 'string' && key in state) return state[key as keyof State];
      return () => undefined;
    },
    set(own, key, value) {
      if (key === 'letterSpacing') {
        const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)px$/.exec(String(value));
        if (!m) ignored++;
        else if (Number(m[1]) !== state.spacing) {
          state.spacing = Number(m[1]);
          state.spacingText = `${state.spacing}px`;
        }
        return true;
      }
      if (typeof key === 'string' && key in state) (state as unknown as Record<string, unknown>)[key] = value;
      else if (typeof key === 'string') own[key] = value;
      return true;
    },
    has(_, key) {
      return typeof key === 'string' && (key in api || key in state || key === 'letterSpacing');
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, painted, reads: () => reads, ignored: () => ignored };
}

function paintPage(doc: VDTDocument, page: VDTPage = doc.pages[0]!): ReturnType<typeof chromeContext> {
  const chrome = chromeContext();
  const canvas = { width: 0, height: 0, getContext: () => chrome.ctx } as unknown as HTMLCanvasElement;
  renderPageToCanvas(page, doc, canvas);
  return chrome;
}

beforeEach(() => clearMeasurementCache());

const pt = (value: number) => ({ value, unit: 'pt' as const });
const OWN = { shapingLanguage: 'document' as const };
function config(locale: string, extra: PostextConfig = {}): PostextConfig {
  return {
    locale,
    page: { width: pt(260), height: pt(700), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [{ kind: 'text', id: 'rh', content: 'Running head 2026.', fontSize: pt(8), overflow: 'wrap', align: 'start', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } }] },
    footer: { elements: [{ kind: 'text', id: 'folio', content: 'Page {page}.', fontSize: pt(8), overflow: 'wrap', align: 'start', placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } } }] },
    chipStyles: [{ id: 'chip' }],
    ...extra,
    bodyText: { fontFamily: 'Body', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, ...OWN, ...extra.bodyText },
  };
}

const table: Resource = {
  id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
  caption: 'Prices in 2026.',
  table: { model: { headerRowCount: 1, rows: [[{ content: 'Dish 1.' }, { content: 'Price 2.' }], [{ content: 'Soup 3.' }, { content: 'Cell 4.' }]] } },
} as Resource;

const AR = '\u0633\u0644\u0627\u0645';
const AR2 = '\u0643\u062A\u0627\u0628';

/** Every kind of text a page paints: a heading, a paragraph with a chip, a
 *  list, a callout, a table with its caption. */
const PAGE = [
  '# Heading 1.',
  '',
  'A paragraph of 2026 with a :chip[chip 7.] in it.',
  '',
  '- First item 3.',
  '- Second item 4.',
  '',
  '1. Numbered item 5.',
  '',
  ':::callout',
  'Callout text 6.',
  ':::',
  '',
  '::resource{id="t"}',
  '',
].join('\n');

const build = (markdown: string, cfg: PostextConfig, resources: Resource[] = [table]): VDTDocument => buildDocument({ markdown, resources }, cfg);
const textsOf = (painted: Painted[]): string => painted.map((p) => p.text).join(' ');

describe('a page is painted in the language it was measured in, through every save()', () => {
  it('a page of a document in its own language: columns, running heads, lists, chips, callouts, table cells and captions', () => {
    const doc = build(PAGE, config('zh-Hans'));
    const { painted, reads, ignored } = paintPage(doc);
    const all = textsOf(painted);
    for (const part of ['Running', 'Page', 'Heading', 'paragraph', 'chip', 'First', 'Numbered', 'Callout', 'Dish', 'Soup', 'Cell', 'Prices']) expect(all).toContain(part);
    // A list bullet and a number are text too.
    expect(painted.some((p) => /^[\u2022\u00B7\-\u2013]$/.test(p.text.trim()) || p.text.trim() === '1.')).toBe(true);
    // Nearly all of it is painted inside a saved state: the column's clip,
    // a design text's own, a caption's.
    expect(painted.filter((p) => p.depth > 0).length).toBeGreaterThan(painted.length / 2);
    expect(new Set(painted.map((p) => p.lang))).toEqual(new Set(['zh-Hans']));
    // And nothing asked the context for its letter-spacing.
    expect(reads()).toBe(0);
    expect(ignored()).toBe(0);
  });

  it('a right-to-left page, painted through the mirror that turns every text back', () => {
    const doc = build(`# ${AR} ${AR2} 2026.\n\n${AR} ${AR2} 2026 ${AR}. :chip[${AR2} 7.] ${AR}\n\n- ${AR} 3.\n\n::resource{id="t"}\n`, config('ar', { direction: 'rtl' }));
    expect(doc.pages[0]!.flow?.writingMode).toBe('horizontal-tb');
    const { painted } = paintPage(doc);
    expect(painted.length).toBeGreaterThan(10);
    // The mirrored flow, a column and each text turned back: three states deep.
    expect(Math.max(...painted.map((p) => p.depth))).toBeGreaterThanOrEqual(3);
    expect(new Set(painted.map((p) => p.lang))).toEqual(new Set(['ar']));
  });

  it('a vertical page: cells, sideways runs and the digits set across the column', () => {
    const han = '\u6392\u7248\u5F15\u64CE\u7684\u8BBE\u8BA1';
    const doc = build(`# ${han}12\n\n${han}\uFF0C2016\u5E74 first ${han}\u2014\u2014${han}\u3002\n`, config('zh-Hant', { layout: { layoutType: 'single', writingMode: 'vertical-rl' } }), []);
    expect(doc.pages[0]!.flow?.writingMode).toBe('vertical-rl');
    const { painted, reads } = paintPage(doc);
    expect(painted.length).toBeGreaterThan(10);
    expect(new Set(painted.map((p) => p.lang))).toEqual(new Set(['zh-Hant']));
    expect(reads()).toBe(0);
  });

  it('a run that names its language is painted in it, on a line set word by word and on a line of the CJK composer', () => {
    const bare = { header: { elements: [] }, footer: { elements: [] } };
    // Word by word (`fillSegmentWord`).
    const latin = paintPage(build('In **2016** it ran, :ltr[dated 2016]{lang=en} and so on.\n', config('ca', bare), [])).painted;
    expect(latin.filter((p) => p.text.includes('2016')).map((p) => p.lang)).toEqual(['ca', 'en']);
    expect(latin[latin.length - 1]!.lang).toBe('ca');
    // The composer's line (`fillSegmentText`): up to postext 1.29.1 its
    // runs were painted in the document's language, measured in their own.
    const doc = build('\u6392\u7248 2016 \u5F15\u64CE :ltr[dated 2016]{lang=en} \u8BBE\u8BA1\u3002\n', config('zh-Hans', bare), []);
    expect(doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!.cjkComposed).toBe(true);
    const { painted } = paintPage(doc);
    expect(painted.filter((p) => p.text.includes('2016')).map((p) => p.lang)).toEqual(['zh-Hans', 'en']);
    expect(painted.find((p) => p.text.includes('dated'))!.lang).toBe('en');
    // The document's again after the run.
    expect(painted[painted.length - 1]!.lang).toBe('zh-Hans');
    expect(new Set(painted.map((p) => p.lang))).toEqual(new Set(['zh-Hans', 'en']));
  });

  it('and keeps it through the saves inside its word: a mirrored page\'s turn, a clip', () => {
    // On a right-to-left page every text is turned back inside a state of
    // its own.
    const doc = build(`${AR} ${AR2} :ltr[dated 2016]{lang=en} ${AR}.\n`, config('ar', { direction: 'rtl', header: { elements: [] }, footer: { elements: [] } }), []);
    const { painted } = paintPage(doc);
    const run = painted.filter((p) => /dated|2016/.test(p.text));
    expect(run.length).toBeGreaterThan(0);
    expect(run.every((p) => p.lang === 'en' && p.depth >= 3)).toBe(true);
    expect(painted.filter((p) => !/dated|2016/.test(p.text)).every((p) => p.lang === 'ar')).toBe(true);
    // A word with no letter is painted beside a mark of its script, the
    // mark clipped away (`fillScriptWord`): in the language of its run.
    const { ctx, painted: clipped } = chromeContext();
    (ctx as unknown as { lang: string }).lang = 'en';
    fillScriptWord(ctx, '2016', 'Hani', false, 0, 0, (text, x, y) => ctx.fillText(text, x, y));
    expect(clipped.map((p) => [p.lang, p.depth])).toEqual([['en', 1]]);
    expect(clipped[0]!.text.startsWith('2016')).toBe(true);
  });

  it('each text is as wide painted as the layout measured it', () => {
    // The digits of this face are 0.471 em wide in Chinese and 0.55 em in
    // the host's English: painted in the host's, `2026` is 0.32 em wider
    // than the box the layout holds for it.
    const doc = build('In 2026 and 1024.\n', config('zh-Hans', { header: { elements: [] }, footer: { elements: [] } }), []);
    const line = doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;
    const { painted } = paintPage(doc);
    const whole = painted.find((p) => p.text.includes('2026'))!;
    expect(widthOf(whole.text, whole.font, whole.lang, 0)).toBeCloseTo(line.bbox.width, 6);
    expect(widthOf(whole.text, whole.font, 'inherit', 0) - line.bbox.width).toBeCloseTo(8 * (0.55 - 0.471) * 10, 6);
  });

  it('a document shaped in the host\'s language is painted in the host\'s: its context is left as it comes', () => {
    for (const locale of ['zh-Hans', 'ar', 'ca']) {
      const doc = build(PAGE, config(locale, { bodyText: { shapingLanguage: 'host' } }));
      const { painted } = paintPage(doc);
      expect(painted.length).toBeGreaterThan(10);
      expect(new Set(painted.map((p) => p.lang))).toEqual(new Set(['inherit']));
    }
  });

  it('gives the context back in the language it came in', () => {
    const doc = build('In 2026.\n', config('ca'), []);
    const chrome = chromeContext();
    const canvas = { width: 0, height: 0, getContext: () => chrome.ctx } as unknown as HTMLCanvasElement;
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect((chrome.ctx as unknown as { lang: string }).lang).toBe('inherit');
    expect(chrome.painted.every((p) => p.lang === 'ca')).toBe(true);
  });

  it('a comic balloon lettered on a context in the document\'s language keeps it', () => {
    const block: VDTDesignTextBlock = {
      kind: 'text', bbox: { x: 10, y: 10, width: 120, height: 30 }, fontString: '10px Body', color: '#000000',
      lines: [{ text: 'BOOM 2026.', xOffset: 0, baselineY: 24 }],
    } as VDTDesignTextBlock;
    const balloon = {
      id: 'b', panelIndex: 0, order: 0, kind: 'sfx', style: 'sfx', sourceStart: 0, sourceEnd: 0, group: 0,
      text: [block], bbox: block.bbox, halo: { width: 1, color: '#ffffff' },
    } as VDTComicBalloon;
    const { ctx, painted } = chromeContext();
    (ctx as unknown as { lang: string }).lang = 'ja';
    renderComicBalloon(ctx, balloon);
    expect(painted.length).toBeGreaterThan(1);
    expect(painted.every((p) => p.depth >= 2)).toBe(true);
    expect(new Set(painted.map((p) => p.lang))).toEqual(new Set(['ja']));
  });
});

describe('the helper', () => {
  it('saveContext carries the language, restoreContext brings the outer one back', () => {
    const { ctx } = chromeContext();
    const c = ctx as unknown as { lang: string };
    c.lang = 'ar';
    saveContext(ctx);
    expect(c.lang).toBe('ar');
    c.lang = 'tr';
    saveContext(ctx);
    expect(c.lang).toBe('tr');
    restoreContext(ctx);
    restoreContext(ctx);
    expect(c.lang).toBe('ar');
    expect(languageOf(ctx)).toBe('ar');
  });

  it('a context in the host\'s language, or with none, is saved as it is', () => {
    const { ctx } = chromeContext();
    const set: unknown[] = [];
    const watched = new Proxy(ctx, { set: (t, k, v) => { if (k === 'lang') set.push(v); return Reflect.set(t, k, v); } });
    saveContext(watched);
    restoreContext(watched);
    expect(set).toEqual([]);
    expect(languageOf(ctx)).toBeUndefined();
    // No `lang` at all (a browser before Chrome 136): nothing is set.
    const old = { saved: 0, save() { this.saved++; }, restore() { this.saved--; } };
    saveContext(old);
    expect('lang' in old).toBe(false);
    restoreContext(old);
    expect(old.saved).toBe(0);
    expect(languageOf(old)).toBeUndefined();
  });

  it('the letter-spacing set is the one answered, state by state, where the context answers ""', () => {
    const { ctx, reads } = chromeContext();
    expect(letterSpacingOf(ctx)).toBe(0);
    setLetterSpacing(ctx, 1.5);
    saveContext(ctx);
    // Chrome's own answer here is `""`.
    expect((ctx as unknown as { letterSpacing: string }).letterSpacing).toBe('');
    expect(letterSpacingOf(ctx)).toBe(1.5);
    setLetterSpacing(ctx, 0);
    saveContext(ctx);
    expect(letterSpacingOf(ctx)).toBe(0);
    restoreContext(ctx);
    restoreContext(ctx);
    expect(letterSpacingOf(ctx)).toBe(1.5);
    expect((ctx as unknown as { letterSpacing: string }).letterSpacing).toBe('1.5px');
    expect(reads()).toBe(3 - 1);
    resetContextState(ctx);
    expect(letterSpacingOf(ctx)).toBe(0);
  });
});

describe('tracked text keeps its letter-spacing inside a saved state', () => {
  const tracked = (markdown: string, locale = 'en'): { doc: VDTDocument; block: VDTBlock } => {
    const doc = build(markdown, config(locale, { header: { elements: [] }, footer: { elements: [] } }), []);
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    return { doc, block };
  };

  it('a chip of a tracked line: the run after its Arabic run is painted with the tracking', () => {
    // The chip saves the context, lifts the tracking for its Arabic run
    // (a joining script is never tracked) and puts it back for the next.
    // Up to postext 1.29.1 it read the tracking after its save (`""` on
    // Chrome) and assigned that back: `first` was painted with none.
    const { block } = tracked(`A :chip[office *${AR}* first] here.\n`);
    block.letterSpacing = 0.6;
    const { ctx, painted, reads, ignored } = chromeContext();
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    const chip = painted.filter((p) => p.depth > 0);
    expect(chip.map((p) => [p.text.trim(), p.spacing])).toEqual([['office', 0.6], [AR, 0], ['first', 0.6]]);
    expect(painted.filter((p) => p.depth === 0).every((p) => p.spacing === 0.6)).toBe(true);
    expect(reads()).toBe(0);
    expect(ignored()).toBe(0);
    // The context is left with no tracking, as the block found it.
    expect(letterSpacingOf(ctx)).toBe(0);
  });

  it('a tracked header cell with such a chip, as the layout measured it', () => {
    const cell: Resource = {
      ...table, caption: undefined,
      table: { model: { headerRowCount: 1, rows: [[{ content: `:chip[office *${AR}* first]` }, { content: 'Price' }], [{ content: 'Soup' }, { content: '4' }]] } },
    } as Resource;
    const doc = build('::resource{id="t"}\n', config('en', { header: { elements: [] }, footer: { elements: [] }, tableStyle: { headerLetterSpacing: pt(2) } }), [cell]);
    const { painted, reads } = paintPage(doc);
    const first = painted.find((p) => p.text.trim() === 'first')!;
    expect(first.spacing).toBe(2);
    expect(painted.find((p) => p.text.trim() === AR)!.spacing).toBe(0);
    // The width the layout holds for the run is the one painted.
    const chip = JSON.stringify(doc.pages[0]).match(/"text":" first","fontString":"[^"]*","width":([\d.]+)/);
    expect(chip).not.toBeNull();
    expect(widthOf(first.text, first.font, first.lang, first.spacing)).toBeCloseTo(Number(chip![1]), 2);
    expect(painted.find((p) => p.text === 'Soup')!.spacing).toBe(0);
    expect(reads()).toBe(0);
  });

  it('text cut at its CJK marks inside a saved state is set by the tracking in force', () => {
    // Two marks that meet are painted apart, each piece after the one
    // before by its measure and the tracking of its characters.
    const { ctx, painted } = chromeContext();
    (ctx as unknown as { font: string }).font = '10px Body';
    setLetterSpacing(ctx, 1);
    saveContext(ctx);
    fillFlowText(ctx, '\u6392\uFF09\u300A\u7248', 0, 0, 'fill', undefined, 'composed');
    restoreContext(ctx);
    expect(painted.length).toBeGreaterThan(1);
    expect(painted.every((p) => p.spacing === 1)).toBe(true);
    // Each piece starts where the one before ends, its tracking counted.
    let x = 0;
    for (const p of painted) {
      expect(p.x).toBeCloseTo(x, 6);
      x += widthOf(p.text, p.font, 'inherit', 1);
    }
  });
});
