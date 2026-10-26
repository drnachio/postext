import { describe, it, expect } from 'vitest';
import { renderPageToCanvas } from '../canvas-backend/index.js';
import { renderBlock } from '../canvas-backend/blockRender.js';
import { beginMirroredFlow } from '../canvas-backend/mirrorFrame.js';
import { fillTrackedWord, trackedPieces, shapedOtherwise } from '../canvas-backend/trackedText.js';
import { setLetterSpacing } from '../canvas-backend/contextState.js';
import { renderHeaderFooterSlot, renderTextBlock } from '../canvas-backend/headerFooter.js';
import { renderComicBalloon } from '../canvas-backend/comic.js';
import { fillFlowText, setVerticalPaint } from '../canvas-backend/verticalText.js';
import { renderToHtml } from '../html-backend/html-backend.js';
import { buildDocument } from '../pipeline/index.js';
import { layoutSlotToVdt } from '../pipeline/pages/headerFooter.js';
import { resolveDesignSlot } from '../defaults/structure/headerFooter.js';
import type { DesignPlaceholderContext } from '../design/placeholders.js';
import type { DesignElement, DesignTextElement, PostextConfig, Resource } from '../types.js';
import type { VDTBlock, VDTComicBalloon, VDTDesignSlot, VDTDesignTextBlock, VDTDocument, VDTLine, VDTPage } from '../vdt.js';

// #663: a tracked word is measured at its natural width, ligatures counted,
// plus the tracking times its letters. A browser shapes it without its
// common ligatures once `letterSpacing` is not zero, so the canvas painted
// "first" wider than its place and the word space after it closed up
// ("firstis"). The word is painted in pieces instead, its ligature whole;
// the HTML asks for the ligatures as features.

// A face with ff, fi, fl and ffi ligatures narrower than their letters, as a
// browser measures it: under a letter-spacing the ligatures are off and the
// spacing follows every letter.
const ADVANCE = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if ('ilf.,'.includes(ch)) return 0.3;
  if (/[A-Z]/.test(ch)) return 0.66;
  return 0.5;
};
// An Arabic and a Hebrew word, and the ligature each holds in this face
// (lam + alef, alef + lamed), which the letter-spacing turns off as well.
const SALAM = '\u0633\u0644\u0627\u0645';
const ISRAEL = '\u05D9\u05E9\u05E8\u05D0\u05DC';
/** A Hebrew word with no ligature. */
const SHALOM = '\u05E9\u05DC\u05D5\u05DD';
const LIGATURES: [string, number][] = [['ffi', 0.75], ['ff', 0.5], ['fi', 0.5], ['fl', 0.5], ['\u0644\u0627', 0.5], ['\u05D0\u05DC', 0.5]];
function naturalWidth(text: string, size: number, ligatures: boolean): number {
  let w = 0;
  for (let i = 0; i < text.length;) {
    const lig = ligatures ? LIGATURES.find(([l]) => text.startsWith(l, i)) : undefined;
    if (lig) {
      w += lig[1] * size;
      i += lig[0].length;
    } else {
      w += ADVANCE(text[i]!) * size;
      i++;
    }
  }
  return w;
}
const sizeOf = (font: string): number => parseFloat(/(?<![\d.])(\d+(?:\.\d+)?|\.\d+)px/.exec(font)?.[1] ?? '10');

/** The measuring half of a browser's 2D context. `keeps`: a browser that
 *  keeps the ligatures under a letter-spacing, so no word is cut. */
class BrowserCtx {
  font = '10px Body';
  letterSpacing = '0px';
  measured = 0;
  constructor(readonly keeps = false) {}
  measureText(s: string): { width: number } {
    this.measured++;
    const spacing = parseFloat(this.letterSpacing) || 0;
    return { width: naturalWidth(s, sizeOf(this.font), this.keeps || spacing === 0) + spacing * s.length };
  }
}
/** A painting context: every `fillText` with the letter-spacing it had. */
type Painted = { text: string; x: number; y: number; spacing: number; width: number };
function paintingCtx(): { ctx: CanvasRenderingContext2D; seen: Painted[] } {
  const seen: Painted[] = [];
  const ctx = Object.assign(new BrowserCtx(), {
    fillStyle: '', textBaseline: 'alphabetic',
    fillText(this: BrowserCtx, text: string, x: number, y: number) {
      seen.push({ text, x, y, spacing: parseFloat(this.letterSpacing) || 0, width: this.measureText(text).width });
    },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, seen };
}

// The layout measures through an OffscreenCanvas at letter-spacing 0.
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): BrowserCtx {
    return new BrowserCtx();
  }
};

describe('the pieces of a tracked word (#663)', () => {
  it('a word with no ligature is painted whole', () => {
    const { ctx } = paintingCtx();
    expect(shapedOtherwise(ctx, 'hands')).toBe(false);
    expect(trackedPieces(ctx, 'hands')).toBeNull();
  });

  it('a ligature is a piece of its own, set where the natural shaping puts it', () => {
    const { ctx } = paintingCtx();
    expect(shapedOtherwise(ctx, 'first')).toBe(true);
    expect(trackedPieces(ctx, 'first')).toEqual([
      { text: 'fi', offset: 0, glyphsBefore: 0, lettersBefore: 0, ligature: true },
      { text: 'rst', offset: 5, glyphsBefore: 1, lettersBefore: 2, ligature: false },
    ]);
    // o | ffi | ces: the three letters of one ligature stay together.
    expect(trackedPieces(ctx, 'offices')!.map((p) => [p.text, p.offset, p.glyphsBefore, p.ligature])).toEqual([
      ['o', 0, 0, false],
      ['ffi', 5, 1, true],
      ['ces', 12.5, 2, false],
    ]);
  });

  it('leaves the letter-spacing as it found it and measures a word once', () => {
    const { ctx } = paintingCtx();
    setLetterSpacing(ctx, -0.2);
    trackedPieces(ctx, 'reflect');
    expect(ctx.letterSpacing).toBe('-0.2px');
    const before = (ctx as unknown as BrowserCtx).measured;
    trackedPieces(ctx, 'reflect');
    shapedOtherwise(ctx, 'reflect');
    expect((ctx as unknown as BrowserCtx).measured).toBe(before);
  });

  it('a context that measures no letter-spacing paints every word whole', () => {
    const stub = { font: '10px Stub', letterSpacing: '0px', measureText: (s: string) => ({ width: s.length * 5 }) };
    expect(trackedPieces(stub as unknown as CanvasRenderingContext2D, 'first')).toBeNull();
    expect(shapedOtherwise(stub as unknown as CanvasRenderingContext2D, 'first')).toBe(false);
    expect(trackedPieces({ font: '10px Other' } as unknown as CanvasRenderingContext2D, 'first')).toBeNull();
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px. The documents of this file keep their host's
// language: a ligature takes one tracking, as one glyph, and the HTML asks
// for the ligatures as features, as up to postext 1.29. A document shaped
// in its own language gives a ligature the tracking of each letter
// (`trackedLetters.test.ts`, #770).
const CONFIG: PostextConfig = {
  page: { width: pt(160), height: pt(900), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, shapingLanguage: 'host' },
};
// Four lines set naturally, the last a runt; three with 10‰ of negative
// tracking (`tightenRunts`). Justified, the second line holds no ligature;
// ragged, the third.
const JUSTIFIED = 'fire stood the offices first is office within lets stood lets left stood is offices is office first a fire.';
const RAGGED = 'is of office stood stood find osmosis first of osmosis lets fire its lets within is within and lets.';

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const tracked = (text: string, config: PostextConfig = CONFIG): { doc: VDTDocument; block: VDTBlock } => {
  const doc = buildDocument({ markdown: text }, config);
  return { doc, block: paragraph(doc) };
};
const LEFT: PostextConfig = { ...CONFIG, bodyText: { ...CONFIG.bodyText, textAlign: 'left' } };
/** Where the ink of each word of `line` ends against where its segment
 *  does, from the pieces the canvas painted inside it. */
function wordEnds(block: VDTBlock, line: VDTLine, seen: Painted[]): { text: string; ink: number; place: number }[] {
  const segments = line.segments!;
  const justified = block.textAlign === 'justify' && !line.isLastLine;
  const wordWidth = segments.reduce((w, s) => (s.kind === 'space' ? w : w + s.width), 0);
  const spaces = segments.filter((s) => s.kind === 'space').length;
  const out: { text: string; ink: number; place: number }[] = [];
  let x = line.bbox.x;
  for (const seg of segments) {
    if (seg.kind === 'space') {
      x += justified ? (block.bbox.width - wordWidth) / spaces : seg.width;
      continue;
    }
    const pieces = seen.filter((p) => p.y === line.baseline && (Math.abs(p.x - x) < 1e-6 || (p.x > x && p.x < x + seg.width - 1e-6)));
    expect(pieces.map((p) => p.text).join('')).toBe(seg.text);
    out.push({ text: seg.text, ink: Math.max(...pieces.map((p) => p.x + p.width)), place: x + seg.width });
    x += seg.width;
  }
  return out;
}

describe('a tracked paragraph on canvas (#663)', () => {
  it('the paragraphs are tightened and hold ligatures', () => {
    for (const block of [tracked(JUSTIFIED).block, tracked(RAGGED, LEFT).block]) {
      expect(block.lines).toHaveLength(3);
      expect(block.letterSpacing).toBeCloseTo(-0.1, 5);
      expect(block.lines.filter((l) => /fi/.test(l.text)).length).toBe(2);
    }
  });

  it('paints a word with a ligature in its place: the ligature whole, the rest tracked', () => {
    const { block } = tracked(JUSTIFIED);
    const t = block.letterSpacing!;
    const { ctx, seen } = paintingCtx();
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    // The ligatures were painted, each with no letter-spacing.
    const ligatures = seen.filter((p) => p.text === 'fi' || p.text === 'ffi');
    expect(ligatures).toHaveLength(8);
    expect(ligatures.every((p) => p.spacing === 0)).toBe(true);
    // No word shaped without its ligature, and every other piece tracked.
    expect(seen.some((p) => /fi/.test(p.text) && p.spacing !== 0)).toBe(false);
    expect(seen.filter((p) => !ligatures.includes(p)).every((p) => Math.abs(p.spacing - t) < 1e-9)).toBe(true);
    // Each word ends where its segment does: within the tracking the
    // letters of its ligatures do not take.
    for (const line of block.lines) {
      for (const word of wordEnds(block, line, seen)) {
        expect(Math.abs(word.ink - word.place)).toBeLessThanOrEqual(2 * Math.abs(t) + 1e-6);
      }
    }
  });

  it('painted with the letter-spacing alone, the same words would overrun their places', () => {
    const { block } = tracked(JUSTIFIED);
    const t = block.letterSpacing!;
    const measure = new BrowserCtx();
    measure.letterSpacing = `${t}px`;
    const first = block.lines.flatMap((l) => l.segments!).find((s) => s.text === 'first')!;
    // "first" without its ligature: one letter's advance wider than the place.
    expect(measure.measureText('first').width - first.width).toBeCloseTo(1, 5);
  });

  it('a ragged tracked line painted as one text goes word by word when it holds a ligature', () => {
    const { block } = tracked(RAGGED, LEFT);
    const t = block.letterSpacing!;
    const { ctx, seen } = paintingCtx();
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    const [one, two, three] = block.lines as [VDTLine, VDTLine, VDTLine];
    for (const line of [one, two]) {
      expect(seen.some((p) => p.text === line.text)).toBe(false);
      for (const word of wordEnds(block, line, seen)) expect(Math.abs(word.ink - word.place)).toBeLessThanOrEqual(2 * Math.abs(t) + 1e-6);
    }
    expect(seen.filter((p) => p.text === 'fi' || p.text === 'ffi').every((p) => p.spacing === 0)).toBe(true);
    // The line with no ligature: one fillText, as before.
    expect(seen.filter((p) => p.text === three.text)).toHaveLength(1);
    expect(ctx.letterSpacing).toBe('0px');
  });

  it('an untracked paragraph is painted as before, nothing measured', () => {
    const doc = buildDocument({ markdown: 'The first of its offices.' }, LEFT);
    const block = paragraph(doc);
    expect(block.letterSpacing).toBeUndefined();
    const ctx = Object.assign(new BrowserCtx(), {
      fillStyle: '', textBaseline: 'alphabetic', texts: [] as string[],
      fillText(this: { texts: string[] }, text: string) { this.texts.push(text); },
    });
    renderBlock(ctx as unknown as CanvasRenderingContext2D, block, block.bbox.width, block.bbox.x);
    expect(ctx.texts).toEqual(['The first of its offices.']);
    expect(ctx.measured).toBe(0);
  });
});

describe('a tracked line in HTML (#663)', () => {
  it('asks for its ligatures after the letter-spacing', () => {
    const { doc, block } = tracked(JUSTIFIED);
    const html = renderToHtml(doc);
    const t = block.letterSpacing!;
    expect(html).toContain(`letter-spacing:${t}px;font-feature-settings:'liga' 1,'clig' 1;`);
  });

  it('a run in another face asks again after its own font', () => {
    const doc = buildDocument({ markdown: JUSTIFIED.replace('first is', '**first** is') }, CONFIG);
    expect(paragraph(doc).letterSpacing).toBeLessThan(0);
    expect(renderToHtml(doc)).toMatch(/<span style="font:[^;]+;font-feature-settings:'liga' 1,'clig' 1;line-height:0;[^"]*">first<\/span>/);
  });

  it('an untracked line carries no feature', () => {
    const html = renderToHtml(buildDocument({ markdown: 'The **first** of its offices.' }, CONFIG));
    expect(html).not.toContain("'liga'");
  });
});

// #685: a right-to-left page paints its flow through a mirror and turns
// every `fillText` back about its own box (`mirrorFrame.ts`). The pieces of
// a tracked word are several `fillText`s: each was turned about itself and
// stayed at its mirrored place, the first piece at the right end of the
// word, so "five" came out "vefi". The word is one run: the frame turns it
// once, about its box. And no word with a right-to-left or a joining letter
// is ever cut.

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
/** A run as it lands on the sheet: where its box starts (`x`, `y`), the
 *  way its glyphs advance (`ux`, `uy`: (1, 0) on an upright page), whether
 *  they read mirrored (`det` < 0), and the context it was painted with. */
type Run = { text: string; x: number; y: number; ux: number; uy: number; det: number; width: number; baseline: number; spacing: number; direction: string; font: string };
const leftOf = (r: Run): number => Math.min(r.x, r.x + r.ux * r.width);
const rightOf = (r: Run): number => Math.max(r.x, r.x + r.ux * r.width);

/** A browser's 2D context (the measurer above) that keeps its transform
 *  and its state. `keeps`: see {@link BrowserCtx}; its fonts carry another
 *  name, so what is known of a word in one browser is not taken for the
 *  other. */
function sheetCanvas(keeps = false): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; runs: Run[]; strokes: Run[] } {
  const runs: Run[] = [];
  const strokes: Run[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: { m: M; state: Record<string, unknown> }[] = [];
  const measure = new BrowserCtx(keeps);
  const state: Record<string, unknown> = { font: '10px Body', textAlign: 'left', direction: 'ltr', textBaseline: 'alphabetic', letterSpacing: '0px', fillStyle: '' };
  const measureText = (s: string): { width: number } => {
    measure.font = state.font as string;
    measure.letterSpacing = state.letterSpacing as string;
    return measure.measureText(s);
  };
  const api: Record<string, unknown> = {
    save() { stack.push({ m, state: { ...state } }); },
    restore() {
      const top = stack.pop();
      if (!top) return;
      m = top.m;
      Object.assign(state, top.state);
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) { m = mul(m, [a, b, c, d, e, f]); },
    translate(x: number, y: number) { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale(x: number, y: number) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(t: number) { m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]); },
    measureText,
    fillText(text: string, x: number, y: number) { record(runs, text, x, y); },
    strokeText(text: string, x: number, y: number) { record(strokes, text, x, y); },
  };
  function record(list: Run[], text: string, x: number, y: number): void {
    const width = measureText(text).width;
    // The run's box from its alignment, as a browser places it.
    const rtl = state.direction === 'rtl';
    const from = state.textAlign === 'right' || (state.textAlign === 'start' && rtl) || (state.textAlign === 'end' && !rtl) ? x - width : x;
    list.push({
      text, x: m[0] * from + m[2] * y + m[4], y: m[1] * from + m[3] * y + m[5], ux: m[0], uy: m[1], det: m[0] * m[3] - m[1] * m[2],
      width, baseline: y, spacing: parseFloat(state.letterSpacing as string) || 0, direction: state.direction as string, font: state.font as string,
    });
  }
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key === 'string' && key in api) return api[key];
      if (typeof key === 'string' && key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) {
      // The mirrored frame puts its own `fillText` on the context.
      if (typeof key === 'string' && key in api) api[key] = value;
      else target[key as string] = key === 'font' && keeps ? `${value}, Keeps` : value;
      return true;
    },
    has(target, key) { return typeof key === 'string' && (key in api || key in target); },
    deleteProperty() { return true; },
    getOwnPropertyDescriptor() { return undefined; },
  }) as unknown as CanvasRenderingContext2D;
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ctx, runs, strokes };
}
function runsOn(doc: VDTDocument, page = 0, keeps = false): Run[] {
  const { canvas, runs } = sheetCanvas(keeps);
  renderPageToCanvas(doc.pages[page]!, doc, canvas);
  return runs;
}
/** The runs on each baseline of an upright page, from the sheet's left. */
function rows(runs: Run[]): Run[][] {
  const by = new Map<number, Run[]>();
  for (const r of runs) by.set(r.baseline, [...(by.get(r.baseline) ?? []), r]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row.sort((a, b) => leftOf(a) - leftOf(b)));
}

/**
 * The page painted by a browser that drops the ligatures of a tracked word
 * against the same page painted by one that keeps them, which paints every
 * word whole and so where the frame, the line's order and any turn of the
 * block put it. A word in pieces must start where the whole word starts,
 * read the same way, and hold its pieces at their places in the natural
 * shaping. Returns the words painted in pieces. For pages whose tracked
 * lines are painted word by word in either browser.
 */
function againstWholeWords(doc: VDTDocument, page = 0): Run[][] {
  const cut = runsOn(doc, page);
  const whole = runsOn(doc, page, true);
  const words: Run[][] = [];
  let j = 0;
  for (const w of whole) {
    const pieces: Run[] = [];
    let text = '';
    while (text.length < w.text.length && j < cut.length) {
      pieces.push(cut[j]!);
      text += cut[j++]!.text;
    }
    expect(text).toBe(w.text);
    const first = pieces[0]!;
    const known = pieces.length > 1 ? trackedPieces(Object.assign(paintingCtx().ctx, { font: first.font }), w.text)! : undefined;
    pieces.forEach((p, k) => {
      const at = known ? known[k]!.offset + w.spacing * known[k]!.glyphsBefore : 0;
      expect(p.x).toBeCloseTo(w.x + w.ux * at, 6);
      expect(p.y).toBeCloseTo(w.y + w.uy * at, 6);
      expect(p.ux).toBeCloseTo(w.ux, 9);
      expect(p.uy).toBeCloseTo(w.uy, 9);
      // Read as written, never through the mirror.
      expect(p.det).toBeGreaterThan(0);
      expect(p.direction).toBe(w.direction);
      expect(p.spacing).toBe(known?.[k]!.ligature ? 0 : w.spacing);
    });
    if (pieces.length > 1) words.push(pieces);
  }
  expect(j).toBe(cut.length);
  return words;
}

const RTL: PostextConfig = { ...CONFIG, direction: 'rtl' };
const RTL_LEFT: PostextConfig = { ...LEFT, direction: 'rtl' };
const ltrBlock = (text: string): string => `:::paragraphs{dir=ltr}\n${text}\n:::`;

describe('a word in pieces inside a mirrored frame (#685)', () => {
  it('is turned once, about its box: the pieces in reading order from the box\'s left', () => {
    const { ctx, runs } = sheetCanvas();
    const t = -0.1;
    setLetterSpacing(ctx, t);
    const end = beginMirroredFlow(ctx, 200);
    const paint = (text: string, x: number, y: number): void => ctx.fillText(text, x, y);
    fillTrackedWord(ctx, 'first', 40, 50, t, paint);
    // A word with no ligature beside it: one `fillText`, turned by the frame.
    fillTrackedWord(ctx, 'hands', 100, 50, t, paint);
    expect(ctx.letterSpacing).toBe(`${t}px`);
    end();
    expect(runs.map((r) => r.text)).toEqual(['fi', 'rst', 'hands']);
    const [fi, rst, hands] = runs as [Run, Run, Run];
    // "first" was measured 20 px wide and five letters tracked: its box is
    // [40, 59.5] in the flow, [140.5, 160] on the sheet.
    expect(leftOf(fi)).toBeCloseTo(200 - 40 - (20 + 5 * t), 6);
    expect(fi.spacing).toBe(0);
    // The rest after the ligature and its one glyph of tracking.
    expect(leftOf(rst)).toBeCloseTo(leftOf(fi) + 5 + t, 6);
    expect(rst.spacing).toBe(t);
    // It ends at the box's right, less the tracking the ligature's second
    // letter does not take (one glyph, as on a left-to-right page).
    expect(rightOf(rst)).toBeCloseTo(200 - 40 - t, 6);
    expect(runs.every((r) => r.det > 0 && r.ux === 1)).toBe(true);
    // The whole word stands as the frame always put it.
    expect(leftOf(hands)).toBeCloseTo(200 - 100 - (25 + 5 * t), 6);
    expect(rightOf(hands)).toBeCloseTo(100, 6);
  });

  it('outside a mirrored frame the pieces start at the word\'s left', () => {
    const { ctx, runs } = sheetCanvas();
    setLetterSpacing(ctx, -0.1);
    fillTrackedWord(ctx, 'first', 40, 50, -0.1, (text, x, y) => ctx.fillText(text, x, y));
    expect(runs.map((r) => [r.text, +leftOf(r).toFixed(6), r.spacing])).toEqual([['fi', 40, 0], ['rst', 44.9, -0.1]]);
  });
});

describe('a tracked left-to-right paragraph on a right-to-left page (#685)', () => {
  for (const [name, text, ltr, rtl] of [['justified', JUSTIFIED, CONFIG, RTL], ['ragged', RAGGED, LEFT, RTL_LEFT]] as const) {
    it(`${name}: every piece lands where a left-to-right page puts it`, () => {
      const plain = buildDocument({ markdown: text }, ltr);
      const mirrored = buildDocument({ markdown: ltrBlock(text) }, rtl);
      expect(mirrored.pages[0]!.flow?.writingMode).toBe('horizontal-tb');
      const block = paragraph(mirrored);
      const t = block.letterSpacing!;
      expect(t).toBeCloseTo(-0.1, 5);
      const a = rows(runsOn(plain));
      const b = rows(runsOn(mirrored));
      expect(b.length).toBe(block.lines.length);
      expect(b.length).toBe(a.length);
      b.forEach((row, i) => {
        // From the sheet's left the pieces spell the line: "fi" before
        // "rst", never after it.
        expect(row.map((r) => r.text).join('')).toBe(block.lines[i]!.text.replace(/ /g, ''));
        expect(row.every((r) => r.det > 0)).toBe(true);
        // The margins are equal, so the line stands as on the left-to-right
        // page; a ragged line of the mirrored page starts the tracking of
        // one glyph further in (it is aligned by its other end), words in
        // pieces and whole words alike.
        const shift = leftOf(row[0]!) - leftOf(a[i]![0]!);
        expect(Math.abs(shift)).toBeLessThanOrEqual(Math.abs(t) + 1e-9);
        if (a[i]!.length === 1) {
          // A line with no ligature: one text on the left-to-right page,
          // word by word on the mirrored one, over the same stretch.
          expect(rightOf(row[row.length - 1]!) - shift).toBeCloseTo(rightOf(a[i]![0]!), 6);
          return;
        }
        expect(row.length).toBe(a[i]!.length);
        row.forEach((r, k) => {
          const q = a[i]![k]!;
          expect(r.text).toBe(q.text);
          expect(r.spacing).toBe(q.spacing);
          expect(leftOf(r) - shift).toBeCloseTo(leftOf(q), 6);
          expect(rightOf(r) - shift).toBeCloseTo(rightOf(q), 6);
        });
      });
      expect(b.flat().filter((r) => r.text === 'fi' || r.text === 'ffi').length).toBeGreaterThan(3);
    });
  }
});

/** A page whose level-2 headings are tracked: half a point after each letter. */
const tracked2 = (config: PostextConfig): PostextConfig => ({
  ...config,
  page: { ...config.page, width: pt(400) },
  headings: { levels: [{ level: 2, letterSpacing: pt(0.5) }] },
});
const headingOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;

describe('right-to-left words on a tracked line (#685)', () => {
  it('an Arabic word, a word in two directions and a Hebrew word in a left-to-right context are never cut, though the face has ligatures', () => {
    const { ctx } = paintingCtx();
    for (const word of [SALAM, ISRAEL, `first${SALAM}`, `${ISRAEL}first`, `${ISRAEL}12`]) {
      // The browser shapes it otherwise under a letter-spacing…
      expect(shapedOtherwise(ctx, word)).toBe(true);
      // …and it is still painted whole, with one `fillText`.
      expect(trackedPieces(ctx, word)).toBeNull();
      const seen: [string, number, number][] = [];
      setLetterSpacing(ctx, 0.5);
      fillTrackedWord(ctx, word, 10, 20, 0.5, (text, x, y) => seen.push([text, x, y]));
      expect(seen).toEqual([[word, 10, 20]]);
      expect(ctx.letterSpacing).toBe('0.5px');
    }
  });

  for (const [name, config, dir] of [['a right-to-left line of a left-to-right page', CONFIG, ' {dir=rtl}'], ['a line of a right-to-left page', RTL, '']] as const) {
    it(`${name}: the Arabic word untracked, the Hebrew ones whole, the Latin ones in reading order`, () => {
      const doc = buildDocument({ markdown: `## ${SHALOM} first ${SALAM} office ${SHALOM}${dir}` }, tracked2(config));
      const line = headingOf(doc).lines[0]!;
      expect(line.segments!.filter((s) => s.rtl && s.kind !== 'space').map((s) => s.text)).toEqual([SHALOM, SALAM, SHALOM]);
      const runs = runsOn(doc);
      // Arabic: one `fillText`, no letter-spacing, right to left.
      expect(runs.filter((r) => r.text.includes('\u0644\u0627')).map((r) => [r.text, r.spacing, r.direction])).toEqual([[SALAM, 0, 'rtl']]);
      // Hebrew: one `fillText` a word, tracked as measured, right to left.
      expect(runs.filter((r) => r.text.includes('\u05E9')).map((r) => [r.text, r.spacing, r.direction])).toEqual([[SHALOM, 0.5, 'rtl'], [SHALOM, 0.5, 'rtl']]);
      // The Latin words: in pieces, where the whole words would stand.
      const words = againstWholeWords(doc);
      const first = words.find((w) => w[0]!.text === 'fi')!;
      const office = words.find((w) => w[0]!.text === 'o')!;
      expect(words).toHaveLength(2);
      expect(first.map((r) => r.text)).toEqual(['fi', 'rst']);
      expect(office.map((r) => r.text)).toEqual(['o', 'ffi', 'ce']);
      for (const w of words) for (let k = 1; k < w.length; k++) expect(leftOf(w[k]!)).toBeGreaterThan(leftOf(w[k - 1]!));
      // The line reads from the right: "first" stands right of "office",
      // the Arabic word between them.
      const salam = runs.find((r) => r.text === SALAM)!;
      expect(leftOf(first[0]!)).toBeGreaterThanOrEqual(rightOf(salam) - 1e-6);
      expect(leftOf(salam)).toBeGreaterThanOrEqual(rightOf(office[2]!) - 1);
    });
  }
});

const cell = (content: string) => ({ content });
/** A table whose header cells are tracked (`headerLetterSpacing`). */
const table = (extra: Partial<Resource> = {}, direction?: 'ltr' | 'rtl'): Resource => ({
  id: 'tab', typeId: 'table', kind: 'table', caption: 'A table', createdAt: 0, updatedAt: 0,
  table: {
    model: { headerRowCount: 1, rows: [[cell('first office'), cell('fire lets')], [cell('stood'), cell('is')]] },
    ...(direction ? { direction } : {}),
  },
  placement: { position: 'here' },
  ...extra,
});
const withTable = (config: PostextConfig): PostextConfig => ({
  ...config,
  page: { ...config.page, width: pt(300), height: pt(400) },
  tableStyle: { headerLetterSpacing: pt(0.5) },
});
const TABLE_MD = 'Text.\n\n::resource{id="tab"}\n\nMore.';
/** The page that holds the table, in the flow or as a float. */
const tablePage = (doc: VDTDocument): number =>
  doc.pages.findIndex((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])].some((b) => b.resourceBlock?.resource.id === 'tab'));

describe('tracked header cells in either direction (#685)', () => {
  const header = [['fi', 'rst'], ['o', 'ffi', 'ce'], ['fi', 're']];
  for (const [name, config, direction] of [
    ['a table of a left-to-right page', CONFIG, undefined],
    ['a table of a right-to-left page', RTL, undefined],
    ['a left-to-right table of a right-to-left page', RTL, 'ltr'],
    ['a right-to-left table of a left-to-right page', CONFIG, 'rtl'],
  ] as const) {
    it(`${name}: the words in pieces stand where the whole words would`, () => {
      const doc = buildDocument({ markdown: TABLE_MD, resources: [table({}, direction)] }, withTable(config));
      const words = againstWholeWords(doc, tablePage(doc));
      expect(words.map((w) => w.map((r) => r.text)).sort()).toEqual([...header].sort());
      // Upright: each word reads from the sheet's left.
      for (const w of words) for (let k = 1; k < w.length; k++) expect(leftOf(w[k]!)).toBeGreaterThan(leftOf(w[k - 1]!));
    });
  }

  for (const rotate of ['ccw', 'cw'] as const) {
    for (const [name, config] of [['left-to-right', CONFIG], ['right-to-left', RTL]] as const) {
      it(`a table turned ${rotate} on a ${name} page: the pieces follow the turn`, () => {
        const doc = buildDocument({ markdown: TABLE_MD, resources: [table({ placement: { rotate } })] }, withTable(config));
        const page = tablePage(doc);
        expect(page).toBeGreaterThanOrEqual(0);
        const words = againstWholeWords(doc, page);
        expect(words.map((w) => w.map((r) => r.text)).sort()).toEqual([...header].sort());
        for (const w of words) {
          // Turned a quarter: the letters advance up or down the sheet,
          // each piece further along than the one before.
          expect(Math.abs(w[0]!.ux)).toBeLessThan(1e-9);
          for (let k = 1; k < w.length; k++) expect((w[k]!.y - w[k - 1]!.y) * w[0]!.uy).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe('a tracked vertical line (#685, #703)', () => {
  it('paints its sideways Latin run with its ligatures, ending where the line was measured to end', () => {
    const doc = buildDocument({ markdown: '## first office fire' }, tracked2({ ...CONFIG, layout: { writingMode: 'vertical-rl', layoutType: 'single' } }));
    const heading = headingOf(doc);
    const t = heading.letterSpacing ?? heading.lines[0]!.letterSpacing!;
    expect(t).toBeCloseTo(0.5, 6);
    const cut = runsOn(doc);
    // Up to postext 1.27 the run was one text under the letter-spacing,
    // shaped without its ligatures and wider than its place.
    expect(cut.map((r) => r.text)).toEqual(['fi', 'rst o', 'ffi', 'ce ', 'fi', 're']);
    expect(cut.filter((r) => r.text === 'fi' || r.text === 'ffi').every((r) => r.spacing === 0)).toBe(true);
    expect(cut.filter((r) => r.text !== 'fi' && r.text !== 'ffi').every((r) => r.spacing === t)).toBe(true);
    // The frame turns the line a quarter: the letters advance down the sheet.
    expect(cut.every((r) => Math.abs(r.ux) < 1e-9 && r.uy === 1)).toBe(true);
    for (let k = 1; k < cut.length; k++) expect(cut[k]!.y).toBeGreaterThan(cut[k - 1]!.y);
    // Against a browser that keeps its ligatures, which paints the run
    // whole at the width the layout measured: the same start, and an end
    // short of it by the tracking the letters of its ligatures do not take
    // (fi, ffi, fi: four letters).
    const [whole, ...rest] = runsOn(doc, 0, true) as [Run, ...Run[]];
    expect(rest).toEqual([]);
    expect(whole.text).toBe('first office fire');
    expect(whole.width).toBeCloseTo(heading.lines[0]!.bbox.width, 6);
    expect(cut[0]!.y).toBeCloseTo(whole.y, 6);
    expect(cut[0]!.x).toBeCloseTo(whole.x, 6);
    const last = cut[cut.length - 1]!;
    expect(whole.y + whole.width - (last.y + last.width)).toBeCloseTo(4 * t, 6);
    // Painted whole without its ligatures it ran past its place.
    const dropped = new BrowserCtx();
    dropped.font = whole.font.replace(', Keeps', '');
    dropped.letterSpacing = `${t}px`;
    expect(dropped.measureText(whole.text).width - whole.width).toBeGreaterThan(3);
  });

  it('moves the pen past a sideways run by the width it was measured at', () => {
    // "first" then a Han character in one text: the character stands
    // after the run's natural width and the tracking of its five letters,
    // where a browser that keeps the ligature puts it.
    const cellAt = (keeps: boolean): Run => {
      const { ctx, runs } = sheetCanvas(keeps);
      setLetterSpacing(ctx, 0.5);
      const outer = setVerticalPaint({ region: 'mainland' });
      fillFlowText(ctx, 'first\u697C', 30, 50);
      setVerticalPaint(outer);
      expect(ctx.letterSpacing).toBe('0.5px');
      return runs.find((r) => r.text === '\u697C')!;
    };
    const cut = cellAt(false);
    const whole = cellAt(true);
    expect(cut.x).toBeCloseTo(whole.x, 6);
    expect(cut.y).toBeCloseTo(whole.y, 6);
    // Measured without its ligature the run is one letter's advance (a
    // third of an em less the ligature's saving: 1 px here) longer.
    const dropped = new BrowserCtx();
    dropped.letterSpacing = '0.5px';
    expect(dropped.measureText('first').width - (20 + 5 * 0.5)).toBeCloseTo(1, 6);
  });
});

describe('a tracked line in HTML, either direction (#685)', () => {
  it('a left-to-right paragraph of a right-to-left page asks for its ligatures as on a left-to-right page', () => {
    const plain = renderToHtml(buildDocument({ markdown: JUSTIFIED }, CONFIG));
    const mirrored = renderToHtml(buildDocument({ markdown: ltrBlock(JUSTIFIED) }, RTL));
    const asked = (html: string): number => html.split("font-feature-settings:'liga' 1,'clig' 1;").length - 1;
    expect(asked(plain)).toBe(3);
    expect(asked(mirrored)).toBe(3);
    // The words are whole in the markup: nothing to put in order.
    for (const word of ['first', 'offices', 'fire']) expect(mirrored).toContain(word);
  });

  it('an Arabic word of a tracked line takes no letter-spacing; a Hebrew one keeps the line\'s', () => {
    const html = renderToHtml(buildDocument({ markdown: `## ${SHALOM} first ${SALAM} office ${SHALOM}` }, tracked2(RTL)));
    expect(html).toContain("letter-spacing:0.5px;font-feature-settings:'liga' 1,'clig' 1;");
    expect(html).toMatch(new RegExp(`<span[^>]*letter-spacing:0;[^>]*>${SALAM}</span>`));
    expect(html).toContain(SHALOM);
    expect(html).not.toMatch(new RegExp(`<span[^>]*letter-spacing:0;[^>]*>${SHALOM}</span>`));
  });
});

// #703: letter-spacing never changes the glyphs. What #663 and #685 left
// out is painted by the same rule: design text (running heads, openers,
// callout titles, balloon lettering), the sideways Latin runs of a
// vertical line (above), the Western runs of a line of the CJK composer,
// and Hebrew words. And a Hebrew run of a tracked design text keeps the
// tracking it was measured with.

const container = { x: 20, y: 10, width: 300, height: 40 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
const T = 0.2;
/** A running head tracked by {@link T} px after each letter (72 dpi). */
const head = (content: string, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text', id: 'rh', content, fontSize: pt(10), letterSpacing: pt(T), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } },
  ...extra,
} as DesignElement);
const slotOf = (el: DesignElement): VDTDesignSlot => layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), container, 0, placeholders, 72)!;
const textOf = (slot: VDTDesignSlot): VDTDesignTextBlock => slot.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
function paintedSlot(slot: VDTDesignSlot, keeps = false): { runs: Run[]; strokes: Run[]; ctx: CanvasRenderingContext2D } {
  const { ctx, runs, strokes } = sheetCanvas(keeps);
  renderHeaderFooterSlot(ctx, slot);
  return { runs, strokes, ctx };
}
const where = (runs: Run[]): [string, number, number][] => runs.map((r) => [r.text, +leftOf(r).toFixed(6), r.spacing]);

describe('a tracked design text on canvas (#703)', () => {
  it('a running head with ligatures is painted in pieces and takes its measured width', () => {
    const slot = slotOf(head('first office'));
    const block = textOf(slot);
    const line = block.lines[0]!;
    expect(block.letterSpacingPx).toBeCloseTo(T, 6);
    // Measured with its ligatures: fi 5, ffi 7.5, the rest 5 a letter, the
    // space 2.5, and the tracking after each of its twelve characters.
    expect(line.width).toBeCloseTo(5 + 15 + 2.5 + 5 + 7.5 + 10 + 12 * T, 6);
    const x0 = block.bbox.x + line.xOffset;
    const { runs, ctx } = paintedSlot(slot);
    expect(where(runs)).toEqual([
      ['fi', x0, 0],
      ['rst o', +(x0 + 5 + T).toFixed(6), T],
      ['ffi', +(x0 + 27.5 + 6 * T).toFixed(6), 0],
      ['ce', +(x0 + 35 + 7 * T).toFixed(6), T],
    ]);
    expect(ctx.letterSpacing).toBe('0px');
    // Its ink ends where the line does, less the tracking the letters of
    // its two ligatures do not take (one for fi, two for ffi).
    const last = runs[runs.length - 1]!;
    const ink = rightOf(last) - T;
    const place = x0 + line.width - T;
    expect(place - ink).toBeCloseTo(3 * T, 6);
    // Painted as one text under the letter-spacing it was 2.5 px wider:
    // the letters of two ligatures set apart.
    const dropped = new BrowserCtx();
    dropped.letterSpacing = `${T}px`;
    expect(dropped.measureText('first office').width - line.width).toBeCloseTo(2.5, 6);
  });

  it('a text with no ligature, and any text in a browser that keeps them, is one fillText as before', () => {
    const plain = slotOf(head('RUNNING HEAD'));
    const x0 = textOf(plain).bbox.x + textOf(plain).lines[0]!.xOffset;
    expect(where(paintedSlot(plain).runs)).toEqual([['RUNNING HEAD', x0, T]]);
    const slot = slotOf(head('first office'));
    expect(where(paintedSlot(slot, true).runs)).toEqual([['first office', x0, T]]);
    // And an untracked one is never asked about.
    const untracked = slotOf(head('first office', { letterSpacing: pt(0) }));
    const { ctx, runs } = sheetCanvas();
    const measure = (ctx as unknown as { measureText: (s: string) => unknown }).measureText;
    let measured = 0;
    (ctx as unknown as Record<string, unknown>).measureText = (s: string) => { measured++; return measure(s); };
    renderHeaderFooterSlot(ctx, untracked);
    expect(runs.map((r) => [r.text, r.spacing])).toEqual([['first office', 0]]);
    expect(measured).toBe(0);
  });

  it('a bold run is cut in its own face, each run from where the layout put it', () => {
    const slot = slotOf(head('the **first** office', { inlineMarks: true }));
    const block = textOf(slot);
    const line = block.lines[0]!;
    expect(line.runs!.map((r) => r.text)).toEqual(['the ', 'first', ' office']);
    const { runs } = paintedSlot(slot);
    expect(runs.map((r) => r.text)).toEqual(['the ', 'fi', 'rst', ' o', 'ffi', 'ce']);
    const starts = line.runs!.map((_, k) => block.bbox.x + line.xOffset + line.runs!.slice(0, k).reduce((w, r) => w + r.width, 0));
    expect(leftOf(runs[0]!)).toBeCloseTo(starts[0]!, 6);
    expect(leftOf(runs[1]!)).toBeCloseTo(starts[1]!, 6);
    expect(leftOf(runs[3]!)).toBeCloseTo(starts[2]!, 6);
    // The bold word in the bold face, ligature and letters alike.
    expect(runs[1]!.font).toBe(line.runs![1]!.fontString);
    expect(runs[2]!.font).toBe(line.runs![1]!.fontString);
    expect(runs[1]!.font).not.toBe(runs[0]!.font);
    expect(runs.filter((r) => r.text === 'fi' || r.text === 'ffi').every((r) => r.spacing === 0)).toBe(true);
    // Each run ends inside its place.
    expect(rightOf(runs[2]!) - T).toBeLessThanOrEqual(starts[2]! + 1e-6);
    expect(rightOf(runs[5]!) - T).toBeLessThanOrEqual(starts[2]! + line.runs![2]!.width + 1e-6);
  });

  it('inside a mirrored frame the pieces of a line read from its box\'s left, turned once', () => {
    const block = textOf(slotOf(head('first office')));
    const paint = (keeps: boolean): Run[] => {
      const { ctx, runs } = sheetCanvas(keeps);
      const end = beginMirroredFlow(ctx, 400);
      renderTextBlock(ctx, block);
      end();
      return runs;
    };
    const cut = paint(false);
    const [whole] = paint(true) as [Run];
    expect(cut.map((r) => r.text)).toEqual(['fi', 'rst o', 'ffi', 'ce']);
    expect(cut.every((r) => r.det > 0 && r.ux === 1)).toBe(true);
    expect(leftOf(cut[0]!)).toBeCloseTo(leftOf(whole), 6);
    for (let k = 1; k < cut.length; k++) expect(leftOf(cut[k]!)).toBeGreaterThan(leftOf(cut[k - 1]!));
    expect(rightOf(cut[3]!)).toBeLessThanOrEqual(rightOf(whole) + 1e-6);
    expect(rightOf(whole) - rightOf(cut[3]!)).toBeCloseTo(3 * T, 6);
  });

  it('an outlined text strokes the same pieces it fills, a hollow one only strokes them', () => {
    const block = textOf(slotOf(head('first office')));
    const paint = (stroke: VDTDesignTextBlock['stroke']): { runs: Run[]; strokes: Run[] } => {
      const { ctx, runs, strokes } = sheetCanvas();
      renderTextBlock(ctx, { ...block, stroke });
      return { runs, strokes };
    };
    const outlined = paint({ widthPx: 1, color: '#000000' });
    expect(outlined.runs.map((r) => r.text)).toEqual(['fi', 'rst o', 'ffi', 'ce']);
    expect(where(outlined.strokes)).toEqual(where(outlined.runs));
    const hollow = paint({ widthPx: 1, color: '#000000', hollow: true });
    expect(hollow.runs).toEqual([]);
    expect(where(hollow.strokes)).toEqual(where(outlined.runs));
  });

  it('a balloon\'s lettering and its halo are painted in the same pieces', () => {
    const block = textOf(slotOf(head('first office')));
    const balloon = {
      id: 'b', panelIndex: 0, order: 0, kind: 'sfx', style: 'sfx', sourceStart: 0, sourceEnd: 0, group: 0,
      text: [block], bbox: block.bbox, halo: { width: 1, color: '#ffffff' },
    } as VDTComicBalloon;
    const { ctx, runs, strokes } = sheetCanvas();
    renderComicBalloon(ctx, balloon);
    // The halo (filled and stroked), then the letters over it.
    const pieces = ['fi', 'rst o', 'ffi', 'ce'];
    expect(strokes.map((r) => r.text)).toEqual(pieces);
    expect(runs.map((r) => r.text)).toEqual([...pieces, ...pieces]);
    expect(where(runs.slice(0, 4))).toEqual(where(runs.slice(4)));
    expect(where(strokes)).toEqual(where(runs.slice(4)));
  });

  it('a line with CJK text keeps the ligature of its Latin word', () => {
    const slot = slotOf(head('楼 first'));
    const { runs } = paintedSlot(slot);
    // The design composer sets the Han character, the space and the word
    // as runs of their own.
    expect(runs.map((r) => [r.text, r.spacing])).toEqual([['楼', T], [' ', T], ['fi', 0], ['rst', T]]);
  });
});

const calloutConfig = (config: PostextConfig): PostextConfig => ({
  ...config,
  page: { ...config.page, width: pt(300), height: pt(300) },
  calloutStyles: [{ id: 'd', titleStyle: { letterSpacing: pt(0.5) } }],
});
const CALLOUT_MD = 'Text.\n\n:::callout{type="d" title="first office"}\nOne line.\n:::\n';

describe('a tracked callout title (#703)', () => {
  for (const [name, config] of [['a left-to-right page', CONFIG], ['a right-to-left page', RTL]] as const) {
    it(`${name}: the title in pieces where the whole title would stand`, () => {
      const doc = buildDocument({ markdown: CALLOUT_MD }, calloutConfig(config));
      const frame = doc.blocks.find((b) => b.type === 'callout')!;
      const title = frame.designOverlay!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
      expect(title.letterSpacingPx).toBeCloseTo(0.5, 6);
      const words = againstWholeWords(doc);
      expect(words.map((w) => w.map((r) => r.text))).toEqual([['fi', 'rst o', 'ffi', 'ce']]);
      const [pieces] = words as [Run[]];
      for (let k = 1; k < pieces.length; k++) expect(leftOf(pieces[k]!)).toBeGreaterThan(leftOf(pieces[k - 1]!));
    });
  }
});

describe('a tracked Hebrew word of a face with a ligature (#703)', () => {
  for (const [name, config, dir] of [['a right-to-left line of a left-to-right page', CONFIG, ' {dir=rtl}'], ['a line of a right-to-left page', RTL, '']] as const) {
    it(`${name}: its pieces from the right end of its box, each painted right to left`, () => {
      const doc = buildDocument({ markdown: `## ${ISRAEL} ${SALAM} ${SHALOM}${dir}` }, tracked2(config));
      const t = 0.5;
      const cut = runsOn(doc);
      const whole = runsOn(doc, 0, true);
      // The Arabic word and the Hebrew one with no ligature: whole, as before.
      expect(cut.filter((r) => r.text === SALAM).map((r) => [r.spacing, r.direction])).toEqual([[0, 'rtl']]);
      expect(cut.filter((r) => r.text === SHALOM).map((r) => [r.spacing, r.direction])).toEqual([[t, 'rtl']]);
      const word = whole.find((r) => r.text === ISRAEL)!;
      const pieces = cut.filter((r) => r.text !== SALAM && r.text !== SHALOM);
      expect(pieces.map((r) => [r.text, r.spacing, r.direction])).toEqual([[ISRAEL.slice(0, 3), t, 'rtl'], [ISRAEL.slice(3), 0, 'rtl']]);
      expect(pieces.every((r) => r.det > 0 && r.ux === 1)).toBe(true);
      const [letters, ligature] = pieces as [Run, Run];
      // The word starts at its right end: its first letters end there.
      expect(rightOf(letters)).toBeCloseTo(rightOf(word), 6);
      // The ligature after them, to their left, inside the word's box:
      // short of its left end by the trailing tracking and the one its
      // second letter does not take.
      expect(rightOf(ligature)).toBeCloseTo(leftOf(letters), 6);
      expect(leftOf(ligature) - leftOf(word)).toBeCloseTo(2 * t, 6);
      // Painted whole under the letter-spacing it overran its segment.
      const seg = headingOf(doc).lines[0]!.segments!.find((sg) => sg.text === ISRAEL)!;
      expect(seg.width).toBeCloseTo(word.width, 6);
      const dropped = new BrowserCtx();
      dropped.font = word.font;
      dropped.letterSpacing = `${t}px`;
      expect(dropped.measureText(ISRAEL).width).toBeGreaterThan(seg.width + 1);
    });
  }

  it('a Hebrew run of a tracked running head keeps its tracking and its ligature', () => {
    const slot = slotOf(head(`${ISRAEL} first`, { direction: 'ltr' }));
    const block = textOf(slot);
    const line = block.lines[0]!;
    expect(block.letterSpacingPx).toBeCloseTo(T, 6);
    const hebrew = line.runs!.find((r) => r.rtl)!;
    const x0 = block.bbox.x + line.xOffset;
    const { runs } = paintedSlot(slot);
    const rtl = runs.filter((r) => r.direction === 'rtl');
    expect(rtl.map((r) => [r.text, r.spacing])).toEqual([[ISRAEL.slice(0, 3), T], [ISRAEL.slice(3), 0]]);
    expect(rightOf(rtl[0]!)).toBeCloseTo(x0 + hebrew.width, 6);
    expect(leftOf(rtl[1]!)).toBeGreaterThanOrEqual(x0 - 1e-6);
    // The Latin word after it, in its own pieces.
    expect(runs.filter((r) => r.direction !== 'rtl').map((r) => r.text).join('').trim()).toBe('first');
    expect(runs.filter((r) => r.text === 'fi').map((r) => r.spacing)).toEqual([0]);
  });

  it('a Hebrew running head is tracked as it was measured; an Arabic one is not', () => {
    const hebrew = slotOf(head(`${SHALOM} ${SHALOM}`, { direction: 'rtl' }));
    const block = textOf(hebrew);
    expect(block.letterSpacingPx).toBeCloseTo(T, 6);
    // Up to postext 1.27 every right-to-left run was painted untracked,
    // narrower than the width its line was measured at.
    const painted = paintedSlot(hebrew).runs;
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.every((r) => r.spacing === T && r.direction === 'rtl')).toBe(true);
    expect(painted.reduce((w, r) => w + r.width, 0)).toBeCloseTo(block.lines[0]!.width, 6);
    // A text with Arabic letters is measured and painted untracked.
    const arabic = slotOf(head(`${SALAM} ${SALAM}`, { direction: 'rtl' }));
    expect(textOf(arabic).letterSpacingPx ?? 0).toBe(0);
    expect(paintedSlot(arabic).runs.every((r) => r.spacing === 0)).toBe(true);
  });
});

describe('a Western run of a tracked line of the CJK composer (#703)', () => {
  it('keeps its ligature on canvas and asks for it in HTML beside the CJK features', () => {
    const doc = buildDocument(
      { markdown: '## 红楼 first 梦' },
      tracked2({ ...CONFIG, locale: 'zh', cjk: { region: 'mainland' } }),
    );
    const heading = headingOf(doc);
    expect(heading.lines[0]!.cjkComposed).toBe(true);
    const runs = runsOn(doc);
    expect(runs.filter((r) => /[a-z]/.test(r.text)).map((r) => [r.text, r.spacing])).toEqual([['fi', 0], ['rst', 0.5]]);
    const html = renderToHtml(doc);
    expect(html).toContain("letter-spacing:0.5px;font-feature-settings:'liga' 1,'clig' 1;text-spacing-trim:space-all;text-autospace:no-autospace;font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'liga' 1,'clig' 1;");
  });
});

const withHead = (content: string, extra: Partial<DesignTextElement> = {}, config: PostextConfig = CONFIG): PostextConfig => ({
  ...config,
  page: { ...config.page, width: pt(300), margins: { top: pt(40), bottom: pt(10), left: pt(10), right: pt(10) } },
  header: { elements: [head(content, extra)] },
});
const LIGA = "font-feature-settings:'liga' 1,'clig' 1;";

describe('a tracked design text in HTML (#703)', () => {
  it('asks for its ligatures after the letter-spacing', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('first office')));
    expect(html).toContain(`letter-spacing:${T}px;${LIGA}`);
    // One box, its word space in a box of its own, so nothing kerns across
    // it (#770).
    expect(html).toContain('>first<span style="display:inline-block;"> </span>office</span>');
    // Shaped in its own language: a box per word, and no feature asked
    // for (the ligatures are boxes of their own, `trackedLetters.test.ts`).
    const own = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('first office', {}, { ...CONFIG, bodyText: { ...CONFIG.bodyText, shapingLanguage: 'document' } })));
    expect(own).toContain(`letter-spacing:${T}px;`);
    expect(own).not.toContain(LIGA);
    expect(own).toMatch(/<span style="position:absolute;left:0\.000px;top:0;"><span [^>]+>fi<\/span>rst<\/span><span style="position:absolute;left:[\d.]+px;top:0;"> <\/span><span style="position:absolute;left:[\d.]+px;top:0;">o<span [^>]+>ffi<\/span>ce<\/span>/);
  });

  it('a run in another face asks again after its own font', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('the **first** office', { inlineMarks: true })));
    expect(html).toMatch(/<span style="font:[^;]+;line-height:1;font-feature-settings:'liga' 1,'clig' 1;">first<\/span>/);
  });

  it('an untracked design text carries no feature', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('the **first** office', { inlineMarks: true, letterSpacing: pt(0) })));
    expect(html).not.toContain("'liga'");
  });

  it('a line with CJK text holds both sets of features in one declaration', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('楼 first')));
    expect(html).toContain("font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'liga' 1,'clig' 1;\">楼</span>");
    // Untracked, the CJK declaration alone, as before.
    const plain = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('楼 first', { letterSpacing: pt(0) })));
    expect(plain).toContain("font-feature-settings:'chws' 0,'halt' 0,'vchw' 0;\">楼</span>");
    expect(plain).not.toContain("'liga'");
  });

  it('a Hebrew running head keeps the block\'s letter-spacing', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead(`${SHALOM} ${SHALOM}`, { direction: 'rtl' })));
    expect(html).toContain(`letter-spacing:${T}px;${LIGA}`);
    expect(html).toContain(SHALOM);
    expect(html).not.toContain('letter-spacing:0;');
  });

  it('a text set vertically asks after each font, which resets the features', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, withHead('first office', { writingMode: 'vertical-rl' })));
    expect(html).toContain(`letter-spacing:${T}px;`);
    expect(html).toMatch(/font:[^;"]+;color:[^;"]+;font-feature-settings:'liga' 1,'clig' 1;/);
  });

  it('a tracked line of a vertical page asks for the ligatures of its sideways runs', () => {
    const doc = buildDocument({ markdown: '## first office fire' }, tracked2({ ...CONFIG, layout: { writingMode: 'vertical-rl', layoutType: 'single' } }));
    const html = renderToHtml(doc);
    expect(html).toContain(`letter-spacing:0.5px;${LIGA}`);
    // An untracked vertical line carries none.
    const plain = renderToHtml(buildDocument({ markdown: '## first office fire' }, { ...CONFIG, layout: { writingMode: 'vertical-rl', layoutType: 'single' } }));
    expect(plain).not.toContain("'liga'");
  });
});
