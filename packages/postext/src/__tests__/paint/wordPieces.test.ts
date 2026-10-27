import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderPageToCanvas } from '../../canvas-backend/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { buildDocument } from '../../pipeline/index.js';
import { clearMeasurementCache } from '../../measure/index.js';
import { joinedWordPieces, lineWordSegments, lineWordSegmentsInOrder } from '../../paint/wordPieces.js';
import * as engine from '../../index.js';
import type { PostextConfig, Resource } from '../../types.js';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt.js';

// #770: the pieces of a word. A paragraph with a style in it is cut word
// by word, and a piece of a word is as wide as the word grew by it; a
// plain paragraph's pieces are each as wide as they are alone. Painted one
// by one, the pieces of the first kind show a hole or an overlap wherever
// the face draws across a cut: a ligature, a kerned pair, the dot of a
// Catalan `l·l`. The canvas, the HTML and the PDF set such pieces as one
// text, by one rule (`wordPieces.ts`).

/** The language of the page that hosts the layout and the canvas: what a
 *  context left at `inherit` measures and paints in. */
let host = 'en';
const primary = (lang: string): string => lang.toLowerCase().split('-')[0]!;
const sizeOf = (font: string): number => parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');

/**
 * The advance of `text` in a face that draws across its letters, as the
 * measured ones do: every letter half an em; the middle dot 0.6 em between
 * two `l` in Catalan and 0.25 em anywhere else (Crimson Pro); two `f`
 * side by side a ligature 0.2 em narrower; `y` and `o` kerned 0.1 em; a
 * hyphen after `e` kerned 0.06 em.
 */
function faceWidth(text: string, font: string, lang: string): number {
  const catalan = primary(lang) === 'ca';
  const chars = Array.from(text);
  let ems = 0;
  chars.forEach((ch, i) => {
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (ch === ' ' || ch === '\u00A0') ems += 0.25;
    else if (ch === '\u00B7') ems += catalan && prev === 'l' && next === 'l' ? 0.6 : 0.25;
    else ems += 0.5;
    const pair = `${prev ?? ''}${ch}`;
    if (pair === 'ff') ems -= 0.2;
    if (pair === 'yo') ems -= 0.1;
    if (pair === 'e-') ems -= 0.06;
  });
  return ems * sizeOf(font);
}
const inLanguage = (lang: string): string => (lang === 'inherit' ? host : lang);

/** The measuring context of the layout: an `OffscreenCanvas` of the page. */
class MeasureContext {
  private shorthand = '10px Punt';
  lang = 'inherit';
  letterSpacing = '0px';
  get font(): string {
    return this.shorthand;
  }
  set font(value: string) {
    this.shorthand = value;
  }
  measureText(s: string): { width: number } {
    return { width: faceWidth(s, this.shorthand, inLanguage(this.lang)) };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown; document?: unknown };
globals.OffscreenCanvasRenderingContext2D = MeasureContext;
globals.OffscreenCanvas = class {
  getContext(): MeasureContext {
    return new MeasureContext();
  }
};

interface Painted { text: string; x: number; y: number; width: number; font: string; lang: string; spacing: number; fill: string }
interface State { lang: string; spacing: number; font: string; direction: string; textAlign: string; textBaseline: string; fillStyle: string }

/** A painting context that records every text with the place, the font,
 *  the language and the letter-spacing it is painted with, and its advance
 *  in that state. `save()` keeps the state, as a canvas does. */
function paintContext(): { ctx: CanvasRenderingContext2D; painted: Painted[] } {
  const painted: Painted[] = [];
  const stack: State[] = [];
  let state: State = { lang: 'inherit', spacing: 0, font: '10px Punt', direction: 'ltr', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '' };
  const widthNow = (s: string): number => faceWidth(s, state.font, inLanguage(state.lang)) + state.spacing * Array.from(s).length;
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
      if (text.trim()) painted.push({ text, x, y, width: widthNow(text), font: state.font, lang: state.lang, spacing: state.spacing, fill: state.fillStyle });
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

beforeEach(() => {
  host = 'en';
  clearMeasurementCache();
});
afterEach(() => {
  delete globals.document;
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const OWN = { shapingLanguage: 'document' as const };
// What a document stored before postext 1.30 reads with; a configuration
// that names neither is shaped in its own language (#770).
const HOST = { shapingLanguage: 'host' as const };
function config(locale: string, width: number, extra: PostextConfig = {}): PostextConfig {
  return {
    locale,
    page: { width: pt(width + 40), height: pt(700), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
    bodyText: { fontFamily: 'Punt', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'justify', hyphenation: { enabled: false }, ...extra.bodyText },
  };
}
const build = (markdown: string, cfg: PostextConfig, resources: Resource[] = []): VDTDocument => buildDocument({ markdown, resources }, cfg);
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const textSegments = (line: VDTLine): VDTLineSegment[] => (line.segments ?? []).filter((s) => s.kind !== 'space');
const round = (n: number): number => Math.round(n * 1000) / 1000;

// A Catalan paragraph is cut at the dictionary's syllables (`ins|tal·|la|ció`:
// an author's soft hyphen beside the dot is no place to end a line).
const CATALAN = { hyphenation: { enabled: true, locale: 'ca' } };
// A paragraph with a word in italics is cut word by word.
const STYLED = 'La instal\u00B7laci\u00F3 de la il\u00B7luminaci\u00F3 col\u00B7lectiva *fou* una il\u00B7lusi\u00F3 paral\u00B7lela del col\u00B7legi.';
const PLAIN = STYLED.replace(/\*/g, '');
// With no dictionary the places a line may end inside a word are the
// author's soft hyphens: a ligature, a kerned pair and a kerned hyphen
// across them.
const SHY = '\u00AD';
const LATIN = `An of${SHY}fi${SHY}ci${SHY}na *was* a Toy${SHY}ota of se${SHY}da and sa${SHY}la.`;

/** The widths of a word's pieces as a line carries them, in ems of 10 px. */
const piecesOf = (doc: VDTDocument, first: string, count: number): [string, number][] => {
  for (const block of paragraphs(doc)) for (const line of block.lines) {
    const segs = textSegments(line);
    const at = segs.findIndex((s) => s.text === first);
    if (at >= 0) return segs.slice(at, at + count).map((s) => [s.text, round(s.width / 10)]);
  }
  return [];
};

/**
 * Every text painted on the lines of `block` against the boxes it covers,
 * matched by their characters: `off` holds the ones not as wide as their
 * boxes (the piece that opens a line after a break inside a word left
 * out: it keeps the width the word had beyond the break).
 */
function boxesAgainstInk(block: VDTBlock, painted: Painted[]): { texts: string[]; off: string[] } {
  const texts: string[] = [];
  const off: string[] = [];
  block.lines.forEach((line, li) => {
    const calls = painted.filter((p) => Math.abs(p.y - line.baseline) < 0.01);
    // A line painted as one text holds its word spaces.
    const segs = line.segments ?? [];
    let si = 0;
    for (let ci = 0; ci < calls.length;) {
      while (segs[si]?.kind === 'space') si++;
      let box = 0;
      let boxText = '';
      let ink = 0;
      let inkText = '';
      const opensLine = !segs.slice(0, si).some((s) => s.kind !== 'space');
      do {
        if (boxText.length <= inkText.length) {
          if (si >= segs.length) throw new Error(`line ${li} "${line.text}" is painted as ${calls.map((c) => c.text).join('|')}`);
          box += segs[si]!.width;
          boxText += segs[si++]!.text;
        } else {
          if (ci >= calls.length) throw new Error(`line ${li} "${line.text}" is painted as ${calls.map((c) => c.text).join('|')}`);
          ink += calls[ci]!.width;
          inkText += calls[ci++]!.text;
        }
      } while (boxText !== inkText);
      texts.push(inkText);
      const tail = opensLine && li > 0 && block.lines[li - 1]!.hyphenated;
      if (!tail && Math.abs(ink - box) > 0.001) off.push(`${inkText}: box ${round(box)}, set ${round(ink)}`);
    }
  });
  return { texts, off };
}

describe('which pieces are set as one text (joinedWordPieces)', () => {
  const width = (lang: string) => (text: string): number => faceWidth(text, '10px Punt', lang);
  /** The pieces of `word` cut at `|`, as wide as the word grew by each. */
  const grown = (word: string, lang: string): { text: string; width: number }[] => {
    const parts = word.split('|');
    let before = 0;
    return parts.map((text, i) => {
      const upTo = width(lang)(parts.slice(0, i + 1).join(''));
      const piece = { text, width: upTo - before };
      before = upTo;
      return piece;
    });
  };
  /** The same, each as wide as it is alone. */
  const alone = (word: string, lang: string): { text: string; width: number }[] => word.split('|').map((text) => ({ text, width: width(lang)(text) }));

  it('the pieces of a word measured whole, where one alone is not as wide as its place', () => {
    // The dot of `tal·` is narrow alone; `la` has the room of the wide one.
    const catalan = grown('ins|tal\u00B7|la|ci\u00F3', 'ca');
    expect(catalan.map((p) => round(p.width))).toEqual([15, 17.5, 13.5, 15]);
    expect(joinedWordPieces(catalan, width('ca'))).toEqual([[0, 4]]);
    // A ligature and a kerned pair across a cut.
    expect(joinedWordPieces(grown('of|fi|ci|na', 'en'), width('en'))).toEqual([[0, 4]]);
    expect(joinedWordPieces(grown('Toy|ota', 'en'), width('en'))).toEqual([[0, 2]]);
  });

  it('not the pieces measured one by one, nor a word with nothing across its cuts', () => {
    expect(joinedWordPieces(alone('ins|tal\u00B7|la|ci\u00F3', 'ca'), width('ca'))).toEqual([]);
    expect(joinedWordPieces(alone('Toy|ota', 'en'), width('en'))).toEqual([]);
    expect(joinedWordPieces(grown('ca|sa|da', 'en'), width('en'))).toEqual([]);
    // In another language than the one measured in the word is not as
    // wide whole as its pieces together: they stay as they are.
    expect(joinedWordPieces(grown('ins|tal\u00B7|la|ci\u00F3', 'ca'), width('en'))).toEqual([]);
    expect(joinedWordPieces([{ text: 'one', width: 15 }], width('en'))).toEqual([]);
  });

  it('the rest of a word that opens a line is one text, off by what its first piece carries from the line before', () => {
    // `la|ci\u00F3` opens a line after `instal-`: `la` keeps the room of the
    // dot that stayed on the line before, 3.5 px more than it takes, and
    // `laci\u00F3` is short of the two places by as much.
    const tail = grown('ins|tal\u00B7|la|ci\u00F3', 'ca').slice(2);
    expect(tail.map((p) => round(p.width))).toEqual([13.5, 15]);
    expect(width('ca')('laci\u00F3')).toBe(25);
    expect(joinedWordPieces(tail, width('ca'), true)).toEqual([[0, 2]]);
    // A longer rest, with a kerned pair across its last cut.
    const longTail = grown('pel\u00B7|l\u00ED|cu|lay|o', 'ca').slice(1);
    expect(longTail.map((p) => round(p.width))).toEqual([13.5, 10, 15, 4]);
    expect(joinedWordPieces(longTail, width('ca'), true)).toEqual([[0, 4]]);
    // Not when the text is off by anything else.
    expect(joinedWordPieces(tail, (text) => width('ca')(text) + (text.length > 3 ? 1 : 0), true)).toEqual([]);
    // Nor from a later piece on, nor inside a line: only the piece that
    // opens a line carries the end of the line before.
    const later = [{ text: 'ca', width: 10 }, ...tail];
    expect(joinedWordPieces(later, width('ca'), true)).toEqual([]);
    expect(joinedWordPieces(tail, width('ca'))).toEqual([]);
  });

  it('the longest stretch that is as wide as measured: a touching word measured alone stays out', () => {
    // `Toy|ote` and, touching it, a hyphen measured alone: the face kerns
    // `e-`, so the three are not as wide as one text; the first two are.
    const touching = [...grown('Toy|ote', 'en'), { text: '-', width: 5 }];
    expect(joinedWordPieces(touching, width('en'))).toEqual([[0, 2]]);
  });

  it('the same width within a twentieth of a percent', () => {
    const pieces = grown('Toy|ota', 'en');
    const near = (text: string): number => width('en')(text) * (text === 'Toyota' ? 1.0004 : 1);
    const far = (text: string): number => width('en')(text) * (text === 'Toyota' ? 1.001 : 1);
    expect(joinedWordPieces(pieces, near)).toEqual([[0, 2]]);
    expect(joinedWordPieces(pieces, far)).toEqual([]);
  });
});

describe('the segments a line is set from (lineWordSegments)', () => {
  const advance = (lang: string) => (seg: VDTLineSegment, text: string): number => faceWidth(text, seg.bold ? 'bold 10px Punt' : '10px Punt', seg.lang ?? lang);
  const text = (t: string, width: number, extra: Partial<VDTLineSegment> = {}): VDTLineSegment => ({ kind: 'text', text: t, width, ...extra });
  const space: VDTLineSegment = { kind: 'space', text: ' ', width: 2.5 };
  const lineOf = (segments: VDTLineSegment[], extra: Partial<VDTLine> = {}): VDTLine => ({
    text: segments.map((s) => s.text).join(''), bbox: { x: 0, y: 0, width: segments.reduce((w, s) => w + s.width, 0), height: 14 }, baseline: 11, segments, ...extra,
  }) as VDTLine;
  const set = (line: VDTLine, lang = 'ca', composed = false): [string, number][] => lineWordSegments(line, composed, advance(lang))!.map((s) => [s.text, round(s.width)]);

  it('joins the pieces of a word in one style, and leaves the line as it is where nothing is joined', () => {
    const line = lineOf([text('La', 10), space, text('ins', 15), text('tal\u00B7', 17.5), text('la', 13.5), text('ci\u00F3', 15), space, text('del', 15)]);
    expect(set(line)).toEqual([['La', 10], [' ', 2.5], ['instal\u00B7laci\u00F3', 61], [' ', 2.5], ['del', 15]]);
    // The line's own segments are not touched.
    expect(line.segments).toHaveLength(8);
    const plain = lineOf([text('ins', 15), text('tal\u00B7', 17.5), text('la', 10), text('ci\u00F3', 15)]);
    expect(lineWordSegments(plain, false, advance('ca'))).toBe(plain.segments);
  });

  it('a joined word keeps its style, its link and its language; pieces in two styles are two words', () => {
    const link = { href: 'https://example.org/', italic: true };
    const linked = lineOf([text('of', 10, link), text('fi', 8, link), text('ci', 10, link), text('na', 10, link)]);
    expect(lineWordSegments(linked, false, advance('en'))).toEqual([{ kind: 'text', text: 'officina', width: 38, ...link }]);
    // A regular `f` and a bold one are two tokens, measured one by one: no
    // ligature was measured, none is set.
    const twoStyles = lineOf([text('of', 10), text('f', 5, { bold: true }), text('ice', 15)]);
    expect(lineWordSegments(twoStyles, false, advance('en'))).toBe(twoStyles.segments);
    // And two runs in one style with different links are not one word.
    const twoLinks = lineOf([text('Toy', 15, { href: 'a' }), text('ota', 14, { href: 'b' })]);
    expect(lineWordSegments(twoLinks, false, advance('en'))).toBe(twoLinks.segments);
    // Nor two pieces in two colours, nor what stands on either side of a
    // chip or of a note's marker.
    const twoColours = lineOf([text('Toy', 15, { color: '#c00' }), text('ota', 14, { color: '#00c' })]);
    expect(lineWordSegments(twoColours, false, advance('en'))).toBe(twoColours.segments);
    const aroundChip = lineOf([text('Toy', 15), { kind: 'chip', text: 'x', width: 20 } as VDTLineSegment, text('ota', 14)]);
    expect(lineWordSegments(aroundChip, false, advance('en'))).toBe(aroundChip.segments);
    const marker = lineOf([text('Toy', 15), text('ota', 14), text('1', 4, { footnoteId: 'a', script: 'sup', fontString: '6px Punt', baselineShift: -3 })]);
    expect(set(marker, 'en')).toEqual([['Toyota', 29], ['1', 4]]);
    // A run in its own language is asked for in it.
    const run = lineOf([text('tal\u00B7', 17.5, { lang: 'ca' }), text('la', 13.5, { lang: 'ca' })]);
    expect(lineWordSegments(run, false, advance('en'))).toEqual([{ kind: 'text', text: 'tal\u00B7la', width: 31, lang: 'ca' }]);
  });

  it('leaves alone a line of the CJK composer, a directed line and what carries more than a style', () => {
    const pieces = (extra: Partial<VDTLineSegment> = {}): VDTLineSegment[] => [text('Toy', 15, extra), text('ota', 14, extra)];
    const composed = lineOf(pieces());
    expect(lineWordSegments(composed, true, advance('en'))).toBe(composed.segments);
    const ordered = lineOf(pieces(), { order: [0, 1] });
    expect(lineWordSegments(ordered, false, advance('en'))).toBe(ordered.segments);
    for (const extra of [{ rtl: true as const }, { scriptContext: 'Latn' as const }, { refResourceId: 'fig' }, { footnoteId: 'n' }, { tracking: 1 }, { runs: [{ text: 'Toy' }] }]) {
      const line = lineOf(pieces(extra));
      expect(lineWordSegments(line, false, advance('en')), Object.keys(extra)[0]).toBe(line.segments);
    }
    // Ideographs are measured one by one.
    const han = lineOf([text('\u6392', 10), text('\u7248', 10)]);
    let asked = 0;
    expect(lineWordSegments(han, false, () => (asked++, 11))).toBe(han.segments);
    expect(asked).toBe(0);
  });

  it('an Arabic word is never set in pieces, nor asked about', () => {
    const word = text('\u0643\u062A\u0627\u0628\u064B\u0627', 30, { rtl: true, runs: [{ text: '\u0643\u062A\u0627' }, { text: '\u0628\u064B\u0627', bold: true }] });
    const line = lineOf([text('\u0630\u0647\u0628', 15, { rtl: true }), space, word], { order: [2, 1, 0] });
    let asked = 0;
    expect(lineWordSegments(line, false, () => (asked++, 0))).toBe(line.segments);
    expect(asked).toBe(0);
    // A Latin word in pieces on a line with an Arabic one stays as it is:
    // the line's order counts its segments.
    const mixed = lineOf([text('Toy', 15), text('ota', 14), space, text('\u0630\u0647\u0628', 15, { rtl: true })]);
    expect(lineWordSegments(mixed, false, advance('en'))).toBe(mixed.segments);
  });

  it('the rest of a word that opens a line is one segment, as wide as the layout measured its pieces', () => {
    // `la|ci\u00F3 del`: after `instal-` on the line before.
    const tail = lineOf([text('la', 13.5), text('ci\u00F3', 15), space, text('del', 15)]);
    expect(set(tail)).toEqual([['laci\u00F3', 28.5], [' ', 2.5], ['del', 15]]);
    // The same pieces after another word are not the rest of anything.
    const inside = lineOf([text('del', 15), space, text('la', 13.5), text('ci\u00F3', 15)]);
    expect(lineWordSegments(inside, false, advance('ca'))).toBe(inside.segments);
  });

  it('the hyphen of a line end is set apart where the layout measured it apart', () => {
    // `paral·le-`: the last piece is as wide as the word grew by it, plus
    // a hyphen measured alone; the face kerns `e-`, so the word with its
    // hyphen is not as wide as that.
    const head = lineOf([text('pa', 10), text('ral\u00B7', 17.5), text('le-', 18.5)], { hyphenated: true });
    expect(set(head)).toEqual([['paral\u00B7le', 41], ['-', 5]]);
    // One piece with its hyphen.
    const one = lineOf([text('La', 10), space, text('se-', 15)], { hyphenated: true });
    expect(set(one)).toEqual([['La', 10], [' ', 2.5], ['se', 10], ['-', 5]]);
    // Not where the piece with its hyphen is as wide as measured (a face
    // that does not kern the pair, a hyphen the word carries).
    const exact = lineOf([text('La', 10), space, text('sa-', 15)], { hyphenated: true });
    expect(lineWordSegments(exact, false, advance('ca'))).toBe(exact.segments);
    // Nor inside a line.
    const inside = lineOf([text('se-', 15), space, text('La', 10)]);
    expect(lineWordSegments(inside, false, advance('ca'))).toBe(inside.segments);
  });

  it('is exported by the package, for the PDF to apply the same rule', () => {
    expect(engine.lineWordSegments).toBe(lineWordSegments);
    expect(engine.joinedWordPieces).toBe(joinedWordPieces);
  });
});

describe('a paragraph is laid out with its words measured whole, styled or plain, in a document shaped in its own language', () => {
  it('the Catalan dot is in the piece after it, the ligature in the second of its letters', () => {
    const styled = build(STYLED, config('ca', 600, { bodyText: { ...OWN, ...CATALAN } }));
    expect(piecesOf(styled, 'ins', 4)).toEqual([['ins', 1.5], ['tal\u00B7', 1.75], ['la', 1.35], ['ci\u00F3', 1.5]]);
    // #772: a plain paragraph is measured as a styled one.
    const plain = build(PLAIN, config('ca', 600, { bodyText: { ...OWN, ...CATALAN } }));
    expect(piecesOf(plain, 'ins', 4)).toEqual([['ins', 1.5], ['tal\u00B7', 1.75], ['la', 1.35], ['ci\u00F3', 1.5]]);
    // One shaped in the host's language keeps its pieces measured alone,
    // on a Catalan page too: `la` without the dot that draws into it.
    host = 'ca';
    clearMeasurementCache();
    const hosted = build(PLAIN, config('ca', 600, { bodyText: { ...HOST, ...CATALAN } }));
    expect(piecesOf(hosted, 'ins', 4)).toEqual([['ins', 1.5], ['tal\u00B7', 1.75], ['la', 1], ['ci\u00F3', 1.5]]);
    host = 'en';
    clearMeasurementCache();
    const latin = build(LATIN, config('en', 600, { bodyText: OWN }));
    expect(piecesOf(latin, 'of', 4)).toEqual([['of', 1], ['fi', 0.8], ['ci', 1], ['na', 1]]);
    expect(piecesOf(latin, 'Toy', 2)).toEqual([['Toy', 1.5], ['ota', 1.4]]);
  });
});

describe('the canvas paints the pieces of a word measured whole as one text', () => {
  it('one fillText for the word, where its first piece stands, as wide as its pieces together', () => {
    const doc = build(STYLED, config('ca', 600, { bodyText: { ...OWN, ...CATALAN } }));
    const block = paragraphs(doc)[0]!;
    expect(block.lines).toHaveLength(1);
    const painted = paint(doc);
    const texts = painted.map((p) => p.text);
    expect(texts.filter((t) => t === 'instal\u00B7laci\u00F3')).toHaveLength(1);
    for (const piece of ['ins', 'tal\u00B7', 'ci\u00F3']) expect(texts, piece).not.toContain(piece);
    // No dot is painted without the `l` after it.
    expect(texts.filter((t) => t.endsWith('\u00B7'))).toEqual([]);
    // `La`, a word space, then the word: at the place of its first piece.
    const line = block.lines[0]!;
    const word = painted.find((p) => p.text === 'instal\u00B7laci\u00F3')!;
    expect(round(word.x)).toBe(round(line.bbox.x + line.segments![0]!.width + line.segments![1]!.width));
    expect(round(word.width)).toBe(61);
    expect(word.lang).toBe('ca');
    // And the next word where the layout put it.
    const next = painted[painted.indexOf(word) + 1]!;
    expect(next.text).toBe('de');
    expect(round(next.x)).toBe(round(word.x + 61 + line.segments![6]!.width));
    expect(boxesAgainstInk(block, painted).off).toEqual([]);
  });

  it('a ligature and a kerned pair across a cut are painted, a word with nothing across its cuts stays in pieces', () => {
    const doc = build(LATIN, config('en', 600, { bodyText: OWN }));
    const painted = paint(doc);
    const texts = painted.map((p) => p.text);
    expect(texts).toContain('officina');
    expect(texts).toContain('Toyota');
    expect(texts).not.toContain('fi');
    expect(texts).toContain('sa');
    expect(texts).toContain('la.');
    expect(round(painted.find((p) => p.text === 'officina')!.width)).toBe(38);
    expect(boxesAgainstInk(paragraphs(doc)[0]!, painted).off).toEqual([]);
  });

  it('a document shaped in the host\'s language on a Catalan page too', () => {
    host = 'ca';
    const doc = build(STYLED, config('ca', 600, { bodyText: { ...HOST, ...CATALAN } }));
    expect(engine.shapingLanguageOf(doc.config)).toBeUndefined();
    expect(piecesOf(doc, 'ins', 4)).toEqual([['ins', 1.5], ['tal\u00B7', 1.75], ['la', 1.35], ['ci\u00F3', 1.5]]);
    const painted = paint(doc);
    expect(painted.filter((p) => p.text === 'instal\u00B7laci\u00F3').map((p) => [p.lang, round(p.width)])).toEqual([['inherit', 61]]);
    expect(boxesAgainstInk(paragraphs(doc)[0]!, painted).off).toEqual([]);
    // On a page in another language the layout measured the narrow dot,
    // and the pieces are as wide alone as their places: nothing to join.
    host = 'en';
    clearMeasurementCache();
    const english = build(STYLED, config('ca', 600, { bodyText: { ...HOST, ...CATALAN } }));
    const texts = paint(english).map((p) => p.text);
    expect(texts).toContain('tal\u00B7');
    expect(boxesAgainstInk(paragraphs(english)[0]!, paint(english)).off).toEqual([]);
  });

  it('a plain paragraph shaped in the host\'s language, measured piece by piece, is painted piece by piece', () => {
    host = 'ca';
    const doc = build(PLAIN, config('ca', 200, { bodyText: { ...HOST, ...CATALAN } }));
    const painted = paint(doc);
    const block = paragraphs(doc)[0]!;
    // A justified line of it with a dot at a cut: every piece at its place.
    const justified = block.lines.find((l) => !l.isLastLine && textSegments(l).some((s) => s.text.endsWith('\u00B7')))!;
    expect(justified).toBeDefined();
    const onLine = painted.filter((p) => Math.abs(p.y - justified.baseline) < 0.01).map((p) => p.text);
    expect(onLine.join('')).toBe(textSegments(justified).map((s) => s.text).join(''));
    expect(onLine.filter((t) => t.includes('l\u00B7l'))).toEqual([]);
    expect(onLine.some((t) => t.endsWith('\u00B7'))).toBe(true);
    expect(boxesAgainstInk(block, painted).off).toEqual([]);
  });

  it('a plain paragraph shaped in its own language is painted as its words, as a styled one (#772)', () => {
    const doc = build(PLAIN, config('ca', 200, { bodyText: { ...OWN, ...CATALAN } }));
    const painted = paint(doc);
    const block = paragraphs(doc)[0]!;
    expect(block.lines.length).toBeGreaterThan(1);
    // No dot is painted without the `l` after it, but where a line ends
    // inside the word.
    const lineEnds = block.lines.filter((l) => l.hyphenated).length;
    expect(painted.filter((p) => p.text.endsWith('\u00B7')).length).toBeLessThanOrEqual(lineEnds);
    expect(painted.map((p) => p.text).some((t) => t.includes('l\u00B7l'))).toBe(true);
    expect(boxesAgainstInk(block, painted).off).toEqual([]);
  });

  it('a ragged line is one text where that text is as wide as its words were measured, and its pieces where it is not', () => {
    // A last line in one style with a kerned pair across a cut, measured
    // piece by piece (shaped in the host's language): as one text it would
    // be 1 px short.
    const kerned = build(`Una casa de sa${SHY}la i un Toy${SHY}ota.`, config('en', 400, { bodyText: { ...HOST, textAlign: 'left' } }));
    const line = paragraphs(kerned)[0]!.lines[0]!;
    expect(textSegments(line).map((s) => s.text)).toContain('Toy');
    const pieces = paint(kerned);
    expect(pieces.map((p) => p.text)).toEqual(textSegments(line).map((s) => s.text));
    expect(boxesAgainstInk(paragraphs(kerned)[0]!, pieces).off).toEqual([]);
    // Nothing across its cuts: one fillText, as before.
    const even = build(`Una casa de sa${SHY}la i un ca${SHY}mi.`, config('en', 400, { bodyText: { ...HOST, textAlign: 'left' } }));
    expect(paint(even).map((p) => p.text)).toEqual(['Una casa de sala i un cami.']);
    // Shaped in its own language the words are measured whole (#772): the
    // kerned word is as wide as the face sets it, and the line one text.
    const whole = build(`Una casa de sa${SHY}la i un Toy${SHY}ota.`, config('en', 400, { bodyText: { ...OWN, textAlign: 'left' } }));
    expect(paint(whole).map((p) => p.text)).toEqual(['Una casa de sala i un Toyota.']);
    expect(boxesAgainstInk(paragraphs(whole)[0]!, paint(whole)).off).toEqual([]);
  });

  it('a ragged line that ends on an added hyphen with no two pieces touching: the hyphen apart, as measured', () => {
    // A word wider than the measure is cut at its soft hyphen and `se-`
    // ends the first line: the face kerns the hyphen 0.6 px into the `e`,
    // and the layout measured the two apart. As one text the line was
    // 0.6 px short of its boxes.
    for (const [mode, bodyText] of [['document', OWN], ['host', HOST]] as const) {
      clearMeasurementCache();
      const doc = build(`Una casa de se${SHY}dadadadadadada.`, config('en', 70, { bodyText: { ...bodyText, textAlign: 'left' } }));
      const block = paragraphs(doc)[0]!;
      const line = block.lines[0]!;
      expect(line.hyphenated, mode).toBe(true);
      expect(textSegments(line).map((s) => s.text), mode).toEqual(['Una', 'casa', 'de', 'se-']);
      const pieces = paint(doc).filter((p) => Math.abs(p.y - line.baseline) < 0.01);
      expect(pieces.map((p) => p.text), mode).toEqual(['Una', 'casa', 'de', 'se', '-']);
      expect(boxesAgainstInk(block, paint(doc)).off, mode).toEqual([]);
    }
  });

  it('a paragraph broken inside its words: every text as wide as its boxes, the hyphen where it was measured', () => {
    let broken = 0;
    let hyphens = 0;
    let rests = 0;
    const paragraphsOf: [string, string, PostextConfig['bodyText']][] = [
      [`${STYLED} `.repeat(3), 'ca', { ...OWN, ...CATALAN }],
      [`${LATIN} `.repeat(4), 'en', OWN],
    ];
    for (const [markdown, locale, bodyText] of paragraphsOf) {
      for (const measure of [150, 158, 166, 174, 182, 190, 198, 206, 214, 222]) {
        clearMeasurementCache();
        const doc = build(markdown, config(locale, measure, { bodyText }));
        const block = paragraphs(doc)[0]!;
        const painted = paint(doc);
        const { texts, off } = boxesAgainstInk(block, painted);
        expect(off, `${locale} at ${measure}`).toEqual([]);
        broken += block.lines.filter((l) => l.hyphenated).length;
        hyphens += painted.filter((p) => p.text === '-').length;
        // The rest of a broken word, in several pieces, as one text.
        block.lines.forEach((line, li) => {
          const first = painted.find((p) => Math.abs(p.y - line.baseline) < 0.01);
          const pieces = textSegments(line);
          if (li > 0 && block.lines[li - 1]!.hyphenated && first && pieces.length > 1 && first.text === pieces[0]!.text + pieces[1]!.text) rests++;
        });
        // No dot is painted without the `l` after it.
        expect(texts.filter((t) => t.endsWith('\u00B7')), `${locale} at ${measure}`).toEqual([]);
      }
    }
    expect(broken).toBeGreaterThan(10);
    expect(rests).toBeGreaterThan(0);
    // Some line ended on a hyphen the face kerns: set apart, as measured.
    expect(hyphens).toBeGreaterThan(0);
  });

  it('a tracked line: the word once, with the tracking it was measured with', () => {
    // Lines whose word spaces alone would be too wide take tracking.
    const doc = build(`${LATIN} `.repeat(4), config('en', 236, { bodyText: { ...OWN, maxWordSpacing: 1.02, minWordSpacing: 0.98, maxJustifyTracking: 80 } }));
    const block = paragraphs(doc)[0]!;
    const tracked = block.lines.filter((l) => (l.letterSpacing ?? 0) !== 0);
    expect(tracked.length).toBeGreaterThan(0);
    const painted = paint(doc);
    const onTracked = painted.filter((p) => tracked.some((l) => Math.abs(p.y - l.baseline) < 0.01));
    expect(onTracked.some((p) => p.spacing !== 0 && /^(officina|Toyota)/.test(p.text))).toBe(true);
    expect(onTracked.map((p) => p.text)).not.toContain('fi');
    expect(boxesAgainstInk(block, painted).off).toEqual([]);
  });

  it('a caption and a table cell too', () => {
    const table: Resource = {
      id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
      caption: 'La instal\u00B7laci\u00F3 *fou* una il\u00B7lusi\u00F3.',
      table: { model: { headerRowCount: 1, rows: [[{ content: 'Sa' }, { content: 'Lo' }], [{ content: 'Una **casa** i la instal\u00B7laci\u00F3 del sal\u00F3.' }, { content: 'Da' }]] } },
    } as Resource;
    const doc = build('Una casa.\n\n::resource{id="t"}\n', config('ca', 400, { bodyText: { ...OWN, ...CATALAN } }), [table]);
    // These lines carry their words whole; a caption or a cell cut at its
    // syllables carries them as the body does. Put the pieces in.
    const resource = doc.pages[0]!.columns[0]!.blocks.find((b) => b.resourceBlock)!.resourceBlock!;
    const cut = (line: VDTLine): void => {
      const at = line.segments!.findIndex((s) => s.text === 'instal\u00B7laci\u00F3');
      expect(at).toBeGreaterThan(0);
      line.segments = [...line.segments!.slice(0, at), ...[['ins', 15], ['tal\u00B7', 17.5], ['la', 13.5], ['ci\u00F3', 15]].map(([text, width]) => ({ kind: 'text' as const, text: text as string, width: width as number })), ...line.segments!.slice(at + 1)];
    };
    cut(resource.captionLines[0]!);
    cut(resource.table!.cells[2]!.lines[0]!);
    const painted = paint(doc);
    expect(painted.filter((p) => p.text === 'instal\u00B7laci\u00F3').map((p) => round(p.width))).toEqual([61, 61]);
    expect(painted.map((p) => p.text)).not.toContain('tal\u00B7');
    const html = renderToHtml(doc);
    expect(html.match(/>instal\u00B7laci\u00F3</g)).toHaveLength(2);
    expect(html).not.toContain('>tal\u00B7<');
  });
});

describe('the HTML sets the pieces of a word measured whole in one box', () => {
  const boxes = (html: string): string[] => [...html.matchAll(/<span[^>]*position:absolute[^>]*>(?:<span[^>]*>|<a[^>]*>)?([^<]+)</g)].map((m) => m[1]!);

  it('one positioned span for the word, at the place of its first piece', () => {
    const doc = build(STYLED, config('ca', 600, { bodyText: { ...OWN, ...CATALAN } }));
    const html = renderToHtml(doc);
    const texts = boxes(html);
    expect(texts.filter((t) => t === 'instal\u00B7laci\u00F3')).toHaveLength(1);
    for (const piece of ['ins', 'tal\u00B7', 'ci\u00F3']) expect(texts, piece).not.toContain(piece);
    expect(texts.filter((t) => t.endsWith('\u00B7'))).toEqual([]);
    const line = paragraphs(doc)[0]!.lines[0]!;
    const left = (line.segments![0]!.width + line.segments![1]!.width).toFixed(3);
    expect(html).toContain(`<span style="position:absolute;left:${left}px;top:0;white-space:pre;">instal\u00B7laci\u00F3</span>`);
    // The word in italics is one box as before, and the word spaces are
    // still text between the words.
    expect(html).toMatch(/font:italic[^>]*>fou</);
    expect(texts.filter((t) => t === ' ').length).toBeGreaterThanOrEqual(line.segments!.filter((s) => s.kind === 'space').length);
    // A ligature and a kerned pair across a cut.
    const latin = boxes(renderToHtml(build(LATIN, config('en', 600, { bodyText: OWN }))));
    expect(latin).toContain('officina');
    expect(latin).toContain('Toyota');
    expect(latin).not.toContain('fi');
  });

  it('a plain paragraph is set as a styled one in a document shaped in its own language (#772)', () => {
    const texts = boxes(renderToHtml(build(PLAIN, config('ca', 600, { bodyText: { ...OWN, ...CATALAN } }))));
    expect(texts.filter((t) => t === 'instal\u00B7laci\u00F3')).toHaveLength(1);
    for (const piece of ['ins', 'tal\u00B7', 'ci\u00F3']) expect(texts, piece).not.toContain(piece);
  });

  it('a plain paragraph shaped in the host\'s language keeps a box per piece', () => {
    host = 'ca';
    const texts = boxes(renderToHtml(build(PLAIN, config('ca', 600, { bodyText: { ...HOST, ...CATALAN } }))));
    for (const piece of ['ins', 'tal\u00B7', 'ci\u00F3']) expect(texts, piece).toContain(piece);
    expect(texts).not.toContain('instal\u00B7laci\u00F3');
  });

  it('a link holds its word whole: one anchor around one box', () => {
    const doc = build('Una **casa** i la [instal\u00B7laci\u00F3 del col\u00B7legi](https://example.org/) del sal\u00F3.', config('ca', 600, { bodyText: { ...OWN, ...CATALAN } }));
    const html = renderToHtml(doc);
    const anchor = /<a href="https:\/\/example\.org\/"[^>]*>(.*?)<\/a>/.exec(html)?.[1] ?? '';
    expect(boxes(anchor).filter((t) => t.trim())).toEqual(['instal\u00B7laci\u00F3', 'del', 'col\u00B7legi']);
    // The link's segments are the line's own: its pieces keep their boxes
    // for whoever reads the layout.
    const linked = paragraphs(doc)[0]!.lines.flatMap((l) => l.segments!).filter((s) => s.href !== undefined && s.kind === 'text');
    expect(linked.map((s) => s.text).slice(0, 4)).toEqual(['ins', 'tal\u00B7', 'la', 'ci\u00F3']);
    expect(linked.map((s) => s.text).join('')).toBe('instal\u00B7laci\u00F3delcol\u00B7legi');
    // On the canvas the word is one text in the link's colour.
    const painted = paint(doc).filter((p) => p.text === 'instal\u00B7laci\u00F3');
    expect(painted).toHaveLength(1);
  });

  it('a document shaped in the host\'s language: on its page, not where no page is known', () => {
    host = 'ca';
    const doc = build(STYLED, config('ca', 600, { bodyText: { ...HOST, ...CATALAN } }));
    // In a worker nobody knows the language of the page that will show
    // the text: its pieces stay as they were.
    expect(boxes(renderToHtml(doc))).toContain('tal\u00B7');
    // On the page that lays it out and shows it.
    globals.document = {};
    const texts = boxes(renderToHtml(doc));
    expect(texts.filter((t) => t === 'instal\u00B7laci\u00F3')).toHaveLength(1);
    expect(texts).not.toContain('tal\u00B7');
  });

  it('an Arabic paragraph is written as it was', () => {
    const arabic = '\u0630\u0647\u0628 *\u0627\u0644\u0648\u0644\u062F* \u0625\u0644\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0643\u062A\u0628 \u0643\u062A\u0627**\u0628**\u064B\u0627 \u0639\u0646 \u0627\u0644\u0639\u0631\u0628\u064A\u0651\u0629.';
    const doc = build(arabic, config('ar', 160, { direction: 'rtl', bodyText: OWN }));
    const segments = paragraphs(doc)[0]!.lines.flatMap((l) => l.segments!);
    expect(segments.some((s) => s.runs !== undefined)).toBe(true);
    // One box per word of the layout, in its order; the word in two styles
    // one shaped run that opens with its first letters.
    const words = segments.filter((s) => s.kind === 'text');
    const texts = boxes(renderToHtml(doc)).filter((t) => t.trim());
    expect(texts).toHaveLength(words.length);
    words.forEach((word, i) => expect(word.text.startsWith(texts[i]!), word.text).toBe(true));
    const painted = paint(doc).map((p) => p.text);
    for (const word of words) expect(painted, word.text).toContain(word.text);
  });
});

describe('a line that carries an order (lineWordSegmentsInOrder)', () => {
  const advance = (seg: VDTLineSegment, text: string): number => faceWidth(text, '10px Punt', seg.lang ?? 'en');
  const text = (t: string, width: number, extra: Partial<VDTLineSegment> = {}): VDTLineSegment => ({ kind: 'text', text: t, width, ...extra });
  const space = (): VDTLineSegment => ({ kind: 'space', text: ' ', width: 2.5 });
  const lineOf = (segments: VDTLineSegment[], extra: Partial<VDTLine> = {}): VDTLine => ({
    text: segments.map((s) => s.text).join(''), bbox: { x: 0, y: 0, width: segments.reduce((w, s) => w + s.width, 0), height: 14 }, baseline: 11, segments, ...extra,
  }) as VDTLine;
  const AR = '\u0643\u062A\u0627\u0628';
  const texts = (segments: VDTLineSegment[] | undefined): [string, number][] => segments!.map((s) => [s.text, round(s.width)]);

  it('a left-to-right line of a mirrored page: the word where its pieces stood, the order written again', () => {
    // `Toy|ota was`, advanced from the sheet's right: the last word first.
    const line = lineOf([text('Toy', 15), text('ota', 14), space(), text('was', 15)], { order: [3, 2, 1, 0] });
    const set = lineWordSegmentsInOrder(line, false, advance);
    expect(texts(set.segments)).toEqual([['Toyota', 29], [' ', 2.5], ['was', 15]]);
    expect(set.order).toEqual([2, 1, 0]);
    // Each segment once, at the place its pieces had along the line.
    expect(line.segments).toHaveLength(4);
  });

  it('a Latin word among right-to-left words: joined, its neighbours in their places', () => {
    const line = lineOf([text(AR, 20, { rtl: true }), space(), text('Toy', 15, { level: 2 }), text('ota', 14, { level: 2 }), space(), text(AR, 20, { rtl: true })], { order: [5, 4, 2, 3, 1, 0] });
    const set = lineWordSegmentsInOrder(line, false, advance);
    expect(texts(set.segments)).toEqual([[AR, 20], [' ', 2.5], ['Toyota', 29], [' ', 2.5], [AR, 20]]);
    expect(set.order).toEqual([4, 3, 2, 1, 0]);
    expect(set.segments![2]!.level).toBe(2);
    expect(set.segments![0]).toBe(line.segments![0]);
  });

  it('pieces that do not stand side by side along the line, or at two levels, stay apart', () => {
    const apart = lineOf([text('Toy', 15), text('ota', 14), space(), text('was', 15)], { order: [0, 3, 2, 1] });
    const same = lineWordSegmentsInOrder(apart, false, advance);
    expect(same.segments).toBe(apart.segments);
    expect(same.order).toBe(apart.order);
    const levels = lineOf([text('Toy', 15, { level: 2 }), text('ota', 14)], { order: [0, 1] });
    expect(lineWordSegmentsInOrder(levels, false, advance).segments).toBe(levels.segments);
    const rtl = lineOf([text('Toy', 15, { rtl: true }), text('ota', 14, { rtl: true })], { order: [1, 0] });
    expect(lineWordSegmentsInOrder(rtl, false, advance).segments).toBe(rtl.segments);
  });

  it('the hyphen of a line end, set apart: after its word the way the line reads', () => {
    // `se-` is measured as `se` and a hyphen apart, 15 px; set as one text
    // the face kerns the pair.
    const mirrored = lineOf([text('the', 15), space(), text('se-', 15)], { order: [2, 1, 0], hyphenated: true });
    const set = lineWordSegmentsInOrder(mirrored, false, advance);
    expect(texts(set.segments)).toEqual([['the', 15], [' ', 2.5], ['se', 10], ['-', 5]]);
    // From the sheet's right: the hyphen, the word it ends, the space, `the`.
    expect(set.order).toEqual([3, 2, 1, 0]);
    const forward = lineOf([text('the', 15), space(), text('se-', 15)], { order: [0, 1, 2], hyphenated: true });
    expect(lineWordSegmentsInOrder(forward, false, advance).order).toEqual([0, 1, 2, 3]);
    // A line that does not tell which way its Latin text runs is left as it is.
    const alone = lineOf([text('se-', 15)], { order: [0], hyphenated: true });
    expect(lineWordSegmentsInOrder(alone, false, advance).segments).toBe(alone.segments);
  });

  it('a line with no order is set as lineWordSegments sets it, a line of the composer as it is', () => {
    const line = lineOf([text('Toy', 15), text('ota', 14)]);
    const set = lineWordSegmentsInOrder(line, false, advance);
    expect(texts(set.segments)).toEqual([['Toyota', 29]]);
    expect(set.order).toBeUndefined();
    expect(set.segments).toEqual(lineWordSegments(line, false, advance));
    const composed = lineOf([text('Toy', 15), text('ota', 14)], { order: [0, 1] });
    expect(lineWordSegmentsInOrder(composed, true, advance)).toEqual({ segments: composed.segments, order: composed.order });
    // The rule the PDF applies is unchanged: a directed line as it is.
    expect(lineWordSegments(composed, false, advance)).toBe(composed.segments);
  });

  it('the canvas and the HTML set a joined word of a right-to-left page once, in its place', () => {
    // An English sentence on a right-to-left page: its line carries an
    // order, and `Toy|ota` was measured whole (a word in italics beside it).
    const doc = build(`A Toy${SHY}ota *was* here.`, config('ar', 600, { direction: 'rtl', bodyText: { ...OWN, textAlign: 'left' } }));
    const line = paragraphs(doc)[0]!.lines[0]!;
    expect(line.order).toBeDefined();
    expect(textSegments(line).map((s) => s.text)).toEqual(expect.arrayContaining(['Toy', 'ota']));
    const painted = paint(doc).filter((p) => /Toy|ota/.test(p.text));
    expect(painted.map((p) => p.text)).toEqual(['Toyota']);
    expect(painted[0]!.width).toBeCloseTo(29, 6);
    globals.document = {};
    const html = renderToHtml(doc);
    expect(html).toContain('>Toyota<');
    expect(html).not.toContain('>ota<');
  });
});

describe('the HTML sets a text of several words as the canvas measured it', () => {
  const header = { elements: [{ kind: 'text' as const, id: 'rh', content: 'The Art of War', fontFamily: 'Punt', fontSize: pt(8), overflow: 'wrap' as const, align: 'start' as const, placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, size: { width: 'fill' as const } } }] };

  it('a line of design text: a box per word, each where the canvas puts it, in a line box as wide as the line', () => {
    const html = renderToHtml(build('Body.', config('en', 300, { header, bodyText: OWN })));
    const box = (x: number, text: string): string => `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;">${text}</span>`;
    // Letters of 4 px and spaces of 2 px at 8 px.
    expect(html).toContain(`line-height:1;white-space:pre;width:50.000px;">${box(0, 'The')}${box(12, ' ')}${box(14, 'Art')}${box(26, ' ')}${box(28, 'of')}${box(36, ' ')}${box(38, 'War')}</span>`);
    // Read without its markup the head is its text.
    expect(html.replace(/<[^>]+>/g, '')).toContain('The Art of War');
  });

  it('where the language of the page is not known: one box, each space in a box of its own', () => {
    const html = renderToHtml(build('Body.', config('en', 300, { header, bodyText: HOST })));
    const apart = '<span style="display:inline-block;"> </span>';
    expect(html).toContain(`line-height:1;white-space:pre;">The${apart}Art${apart}of${apart}War</span>`);
    expect(html.replace(/<[^>]+>/g, '')).toContain('The Art of War');
  });

  it('a word of a line is written as it was: one box, its text alone', () => {
    const html = renderToHtml(build('Two words.', config('en', 300, { bodyText: { ...OWN, textAlign: 'left' } })));
    expect(html).toContain('<span style="position:absolute;left:0.000px;top:0;white-space:pre;">Two</span>');
    expect(html).not.toContain('display:inline-block');
    expect(html).not.toContain('top:0;">');
  });
});

describe('a doubled dash given the forms of Han text is set alone where it was measured alone', () => {
  const DASHES = '\u2014\u2014';
  /** A line whose first word is the pair, as the layout gives it the
   *  forms of Han text: its box `width` px wide (10: two dashes alone). */
  const withDashes = (width = 10, shaping: PostextConfig['bodyText'] = OWN): VDTDocument => {
    const doc = build('xx and here', config('en', 300, { bodyText: { ...shaping, textAlign: 'left' } }));
    const seg = paragraphs(doc)[0]!.lines[0]!.segments![0]!;
    Object.assign(seg, { text: DASHES, width, scriptContext: 'Hani' });
    return doc;
  };

  it('no mark beside it on the page whose canvas sets it alone at that width', () => {
    globals.document = {};
    const html = renderToHtml(withDashes());
    expect(html).toContain(`>${DASHES}</span>`);
    expect(html).not.toContain('font-size:0');
  });

  it('the mark where the word alone is not as wide as measured, and where the language is not known', () => {
    globals.document = {};
    expect(renderToHtml(withDashes(13))).toContain('font-size:0');
    delete globals.document;
    const host = withDashes(10, HOST);
    expect(renderToHtml(host)).toContain('font-size:0');
  });
});
