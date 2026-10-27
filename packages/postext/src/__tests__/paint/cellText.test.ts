import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderPageToCanvas } from '../../canvas-backend/index.js';
import { fillCellRuns } from '../../canvas-backend/cellText.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { buildDocument } from '../../pipeline/index.js';
import { clearMeasurementCache } from '../../measure/index.js';
import { cellsOf } from '../../paint/wordPieces.js';
import type { PostextConfig } from '../../types.js';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt.js';

// #770: the cells of the CJK composer. The composer measures a Chinese or
// Japanese character alone, and a line carries the cells of one style as
// one segment. Set as one text, the browser kerns inside it (a kana
// against the mark after it, a kana against a kana) and every character
// after the pair stands off its cell. The canvas paints such a segment in
// the runs the browser sets as wide as their cells; the HTML turns the
// kerning off on its box.

const sizeOf = (font: string): number => parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');

/** The pairs the face kerns, in ems, as Noto Sans JP does under `ja`. */
const KERNED: Record<string, number> = { 'す。': -0.1, 'れ、': 0.06, 'ノン': -0.04 };

/**
 * The advance of `text` in a face that kerns kana: a Han character, a
 * kana and a full-width mark one em, a Latin letter and a digit half an
 * em, a space a quarter; and the pairs of {@link KERNED} when both stand
 * in the text. `kerning: false`: a text set with the kerning off.
 */
function faceWidth(text: string, font: string, kerning = true): number {
  const chars = Array.from(text);
  let ems = 0;
  chars.forEach((ch, i) => {
    if (ch === ' ' || ch === ' ') ems += 0.25;
    else if (/[⺀-鿿＀-￯]/.test(ch)) ems += 1;
    else ems += 0.5;
    if (kerning && i > 0) ems += KERNED[chars[i - 1]! + ch] ?? 0;
  });
  return ems * sizeOf(font);
}

/** The measuring context of the layout: an `OffscreenCanvas` of the page. */
class MeasureContext {
  private shorthand = '10px Mincho';
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
    return { width: faceWidth(s, this.shorthand) };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown; document?: unknown };
globals.OffscreenCanvasRenderingContext2D = MeasureContext;
globals.OffscreenCanvas = class {
  getContext(): MeasureContext {
    return new MeasureContext();
  }
};

interface Painted { text: string; x: number; y: number; width: number; font: string; spacing: number }
interface State { lang: string; spacing: number; font: string; direction: string; textAlign: string; textBaseline: string; fillStyle: string }

/** A painting context that records every text with its place and its
 *  advance in the font and the letter-spacing it is painted with. */
function paintContext(): { ctx: CanvasRenderingContext2D; painted: Painted[] } {
  const painted: Painted[] = [];
  const stack: State[] = [];
  let state: State = { lang: 'inherit', spacing: 0, font: '10px Mincho', direction: 'ltr', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '' };
  const widthNow = (s: string): number => faceWidth(s, state.font) + state.spacing * Array.from(s).length;
  const api: Record<string, unknown> = {
    save() {
      stack.push(state);
      state = { ...state };
    },
    restore() {
      const saved = stack.pop();
      if (saved) state = saved;
    },
    measureText: (s: string) => ({ width: widthNow(s) }),
    fillText(text: string, x: number, y: number) {
      if (text.trim()) painted.push({ text, x, y, width: widthNow(text), font: state.font, spacing: state.spacing });
    },
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(own, key) {
      if (typeof key === 'string' && Object.hasOwn(own, key)) return own[key];
      if (key === 'letterSpacing') return `${state.spacing}px`;
      if (typeof key === 'string' && key in api) return api[key];
      if (typeof key === 'string' && key in state) return state[key as keyof State];
      return () => undefined;
    },
    set(own, key, value) {
      if (key === 'letterSpacing') {
        const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)px$/.exec(String(value));
        if (m) state.spacing = Number(m[1]);
      } else if (typeof key === 'string' && key in state) (state as unknown as Record<string, unknown>)[key] = value;
      else if (typeof key === 'string') own[key] = value;
      return true;
    },
    has(_, key) {
      return typeof key === 'string' && (key in api || key in state || key === 'letterSpacing');
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, painted };
}

function paint(doc: VDTDocument): Painted[] {
  const { ctx, painted } = paintContext();
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return painted;
}

beforeEach(() => clearMeasurementCache());
afterEach(() => {
  delete globals.document;
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
function config(extra: PostextConfig = {}): PostextConfig {
  return {
    locale: 'ja',
    page: { width: pt(340), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
    bodyText: { fontFamily: 'Mincho', fontSize: pt(10), lineHeight: pt(16), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, ...extra.bodyText },
    // No Han–Latin space and no mark given up: every box is its glyph's.
    cjk: { latinSpacing: { value: 0, unit: 'em' }, punctuationWidth: 'fullwidth', compressAdjacent: false, ...extra.cjk } as PostextConfig['cjk'],
  };
}
const linesOf = (doc: VDTDocument): VDTLine[] => doc.pages[0]!.columns.flatMap((column) => column.blocks.flatMap((block) => block.lines));
const textsOf = (line: VDTLine): VDTLineSegment[] => (line.segments ?? []).filter((s) => s.kind === 'text');
const onLine = (painted: Painted[], line: VDTLine): Painted[] => painted.filter((p) => Math.abs(p.y - line.baseline) < 0.01);

// A kana before a stop, a kana before a comma, two katakana: three pairs
// the face kerns, among characters it sets one em each.
const KANA = '画面で見ます。それ、ノンブルです';

describe('which texts are cells (cellsOf)', () => {
  it('two characters or more, each one the composer measures alone', () => {
    expect(cellsOf('です。')).toEqual(['で', 'す', '。']);
    expect(cellsOf('漢字')).toEqual(['漢', '字']);
    expect(cellsOf('——')).toEqual(['—', '—']);
  });

  it('not a Western run, a single character, or a word with a mark of its own inside', () => {
    expect(cellsOf('Unicode')).toBeUndefined();
    expect(cellsOf('2016')).toBeUndefined();
    expect(cellsOf('字')).toBeUndefined();
    expect(cellsOf('don’t')).toBeUndefined();
    expect(cellsOf('字a')).toBeUndefined();
    expect(cellsOf('')).toBeUndefined();
  });
});

describe('the canvas paints the cells of a line of the composer where it measured them', () => {
  it('the layout gives each character its cell, whatever the face kerns', () => {
    const [line] = linesOf(buildDocument({ markdown: KANA }, config()));
    expect(line!.cjkComposed).toBe(true);
    expect(textsOf(line!).map((s) => [s.text, s.width])).toEqual([[KANA, 160]]);
    // As one text the browser sets it 0.8 px short: -1 +0.6 -0.4.
    expect(faceWidth(KANA, '10px Mincho')).toBeCloseTo(159.2, 6);
  });

  it('in runs cut where the face kerns, each from where the cells before it end', () => {
    const doc = buildDocument({ markdown: KANA }, config());
    const [line] = linesOf(doc);
    const own = onLine(paint(doc), line!);
    expect(own.map((p) => p.text)).toEqual(['画面で見ます', '。それ', '、ノ', 'ンブルです']);
    // Each run as wide as its cells, and no gap or overlap between two.
    let x = line!.bbox.x;
    for (const p of own) {
      expect(p.x, p.text).toBeCloseTo(x, 6);
      expect(p.width, p.text).toBeCloseTo(10 * Array.from(p.text).length, 6);
      x += p.width;
    }
    expect(x - line!.bbox.x).toBeCloseTo(line!.bbox.width, 6);
  });

  it('a text the browser sets as wide as its cells is one call: a run of Han characters', () => {
    const doc = buildDocument({ markdown: '漢字組版規則' }, config());
    const [line] = linesOf(doc);
    const own = onLine(paint(doc), line!);
    expect(own.map((p) => [p.text, p.x, p.width])).toEqual([['漢字組版規則', line!.bbox.x, 60]]);
  });

  it('a Western run keeps its kerning: it was measured whole', () => {
    const doc = buildDocument({ markdown: '見ます。Unicodeです' }, config());
    const [line] = linesOf(doc);
    const own = onLine(paint(doc), line!);
    expect(own.map((p) => p.text)).toEqual(['見ます', '。', 'Unicode', 'です']);
    const run = own.find((p) => p.text === 'Unicode')!;
    expect(run.x).toBeCloseTo(line!.bbox.x + 40, 6);
    expect(run.width).toBeCloseTo(35, 6);
  });

  it('a justified line: each cell carries the space the line spread after it', () => {
    // Two lines; the first is spread over the measure.
    const doc = buildDocument({ markdown: `${KANA}${KANA}` }, config({ page: { width: pt(250), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } }, bodyText: { textAlign: 'justify' } }));
    const [first] = linesOf(doc);
    const own = onLine(paint(doc), first!);
    expect(own.length).toBeGreaterThan(1);
    const segs = textsOf(first!);
    let x = first!.bbox.x;
    let k = 0;
    for (const seg of segs) {
      // The runs of this segment, end to end across its box.
      let at = x;
      let text = '';
      while (text.length < seg.text.length) {
        const p = own[k++]!;
        expect(p.x, p.text).toBeCloseTo(at, 6);
        const cells = Array.from(p.text).length;
        expect(p.width, p.text).toBeCloseTo(cells * (10 + p.spacing), 6);
        at += p.width;
        text += p.text;
      }
      expect(text).toBe(seg.text);
      expect(at - x, seg.text).toBeCloseTo(seg.width, 6);
      x += seg.width;
    }
    expect(k).toBe(own.length);
    expect(x - first!.bbox.x).toBeCloseTo(210, 6);
  });

  it('a caption and a table cell too', () => {
    const doc = buildDocument({
      markdown: '::resource{id="t"}\n',
      resources: [{
        id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
        caption: '見ます。それ',
        table: { model: { headerRowCount: 0, rows: [[{ content: 'です。それ、' }]] } },
      } as never],
    }, config());
    const painted = paint(doc);
    for (const p of painted.filter((q) => /[ぁ-ん。、]/.test(q.text))) {
      expect(p.width, p.text).toBeCloseTo(sizeOf(p.font) * Array.from(p.text).length, 6);
    }
    expect(painted.map((p) => p.text)).toEqual(expect.arrayContaining(['見ます', '。それ', 'です']));
    expect(painted.some((p) => p.text.includes('す。') || p.text.includes('れ、'))).toBe(false);
  });

  it('fillCellRuns leaves to its caller what is not cells', () => {
    const { ctx, painted } = paintContext();
    const put = (text: string, x: number, y: number): void => ctx.fillText(text, x, y);
    expect(fillCellRuns(ctx, 'Unicode', 0, 0, put)).toBe(false);
    expect(fillCellRuns(ctx, '漢字', 0, 0, put)).toBe(false);
    expect(fillCellRuns(ctx, 'す', 0, 0, put)).toBe(false);
    expect(painted).toEqual([]);
    expect(fillCellRuns(ctx, 'です。', 5, 7, put)).toBe(true);
    expect(painted.map((p) => [p.text, p.x, p.y])).toEqual([['です', 5, 7], ['。', 25, 7]]);
  });
});

describe('the HTML sets the cells of a line of the composer with no kerning', () => {
  const boxOf = (html: string, text: string): string => {
    const at = html.indexOf(`>${text}<`);
    expect(at, text).toBeGreaterThan(0);
    return html.slice(html.lastIndexOf('<span', at), at + 1);
  };

  it('on the box of the cells, not on a Western run of the same line', () => {
    const doc = buildDocument({ markdown: '見ます。Unicodeです' }, config());
    const html = renderToHtml(doc);
    expect(boxOf(html, '見ます。')).toContain('font-kerning:none;');
    expect(boxOf(html, 'です')).toContain('font-kerning:none;');
    expect(boxOf(html, 'Unicode')).not.toContain('font-kerning:none');
    // One box for the cells still: a selection reads the text whole.
    expect(html.match(/>見ます。</g)).toHaveLength(1);
  });

  it('after the font of a run in another face, which resets it', () => {
    const doc = buildDocument({ markdown: '見**ます。**それ' }, config());
    const html = renderToHtml(doc);
    const bold = boxOf(html, 'ます。');
    expect(bold).toMatch(/font:[^;]+;.*font-kerning:none;/);
    expect(bold.indexOf('font-kerning:none;')).toBeGreaterThan(bold.indexOf('font:'));
  });

  it('a single character and a line set word by word are written as they were', () => {
    const latin = renderToHtml(buildDocument({ markdown: 'A word and 見ます。 in a Latin line' }, config({ locale: 'en' })));
    expect(latin).not.toContain('font-kerning:none');
    const single = renderToHtml(buildDocument({ markdown: '字' }, config()));
    expect(single).not.toContain('font-kerning:none');
  });
});
