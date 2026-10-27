import { describe, it, expect } from 'vitest';
import { renderBlock } from '../../canvas-backend/blockRender.js';
import { fillTrackedWord, setLetterTracking } from '../../canvas-backend/trackedText.js';
import { setSegmentLanguages } from '../../canvas-backend/wordRuns.js';
import { setLetterSpacing } from '../../canvas-backend/contextState.js';
import { setVerticalPaint } from '../../canvas-backend/verticalText.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../vdt.js';
import { textOfHtml } from '../htmlText.js';

// #770: what a letter-spacing takes away besides ligatures. Chrome sets no
// contextual alternate under a letter-spacing, and the canvas cannot ask
// for one: a tracked word of a face with such forms was measured with them
// and painted without. In a document shaped in its own language a word
// whose pieces do not end where it was measured to end, or that the
// letter-spacing reshapes with no ligature to keep, is set whole at the
// letter-spacing that ends it there, on the canvas and in the HTML. And two
// more texts painted as measured: the pieces of a sideways word down a
// vertical line on the canvas, and the runs of a design line in the HTML.

// A face as a browser measures it. With no letter-spacing: ligatures (ff,
// fi, fl, ffi) narrower than their letters; a hyphen between two capitals
// 0.1 em wider (a form by its two neighbours: no pair of letters tells);
// an N after a U 0.05 em wider (a form by one neighbour, which reads as a
// ligature of the pair), and a Hebrew bet after an alef; a T after NI 0.1
// em wider (so `IT`, set alone
// after `UN`, is not as wide as its part of `UNIT`); a Han character
// between two others 0.2 em narrower (a face that draws its cells by their
// neighbours). Under a letter-spacing none of them, and the spacing after
// every letter. A zero width non-joiner advances nothing and takes no
// spacing; no ligature forms across it, and the forms by the neighbours
// stand across it.
const ZWNJ = '\u200C';
const ADVANCE = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if ('ilf-'.includes(ch)) return 0.3;
  if (/[A-Z]/.test(ch)) return 0.6;
  if (ch.codePointAt(0)! >= 0x2e80) return 1;
  return 0.5;
};
const LIGATURES: [string, number][] = [['ffi', 0.75], ['ff', 0.5], ['fi', 0.5], ['fl', 0.5]];
function naturalWidth(raw: string, size: number, shaped: boolean): number {
  // The letters, and whether a non-joiner stands before each.
  const text = raw.replaceAll(ZWNJ, '');
  const apart: boolean[] = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] !== ZWNJ) apart.push(raw[i - 1] === ZWNJ);
  let w = 0;
  for (let i = 0; i < text.length;) {
    const lig = shaped ? LIGATURES.find(([l]) => text.startsWith(l, i) && !apart.slice(i + 1, i + l.length).includes(true)) : undefined;
    if (lig) {
      w += lig[1] * size;
      i += lig[0].length;
      continue;
    }
    w += ADVANCE(text[i]!) * size;
    if (shaped) {
      if (text[i] === '-' && /[A-Z]/.test(text[i - 1] ?? '') && /[A-Z]/.test(text[i + 1] ?? '')) w += 0.1 * size;
      if (text[i] === 'N' && text[i - 1] === 'U') w += 0.05 * size;
      if (text[i] === '\u05D1' && text[i - 1] === '\u05D0') w += 0.05 * size;
      if (text[i] === 'T' && text.slice(i - 2, i) === 'NI') w += 0.1 * size;
      if (text[i] === '\u5B57' && text[i - 1] === '\u6F22' && text[i + 1] === '\u4F53') w -= 0.2 * size;
    }
    i++;
  }
  return w;
}
const lettersOf = (text: string): number => text.replaceAll(ZWNJ, '').length;
const sizeOf = (font: string): number => parseFloat(/(?<![\d.])(\d+(?:\.\d+)?|\.\d+)px/.exec(font)?.[1] ?? '10');

class BrowserCtx {
  font = '10px Body';
  letterSpacing = '0px';
  lang = 'inherit';
  measureText(s: string): { width: number } {
    const spacing = parseFloat(this.letterSpacing) || 0;
    return { width: naturalWidth(s, sizeOf(this.font), spacing === 0) + spacing * lettersOf(s) };
  }
}
type Painted = { text: string; x: number; y: number; spacing: number; width: number };
function paintingCtx(): { ctx: CanvasRenderingContext2D; seen: Painted[] } {
  const seen: Painted[] = [];
  const ctx = Object.assign(new BrowserCtx(), {
    fillStyle: '', textBaseline: 'alphabetic', textAlign: 'left',
    fillText(this: BrowserCtx, text: string, x: number, y: number) {
      seen.push({ text, x, y, spacing: parseFloat(this.letterSpacing) || 0, width: this.measureText(text).width });
    },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, seen };
}

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): BrowserCtx {
    return new BrowserCtx();
  }
};

/** `text` painted as a tracked word at 20 px, 2 px a letter, from x = 100,
 *  in a document shaped in its own language (`own`) or its host's. */
function tracked(text: string, own: boolean): { seen: Painted[]; advance: number | undefined; left: string } {
  const { ctx, seen } = paintingCtx();
  ctx.font = '20px Body';
  setLetterSpacing(ctx, 2);
  setLetterTracking(own);
  const advance = fillTrackedWord(ctx, text, 100, 50, 2, (piece, x, y) => ctx.fillText(piece, x, y));
  setLetterTracking(false);
  return { seen, advance, left: ctx.letterSpacing };
}
/** The width `text` was measured at: its natural width and 2 px a letter. */
const measured = (text: string): number => naturalWidth(text, 20, true) + 2 * text.length;

describe('a tracked word the letter-spacing reshapes, on canvas (#770)', () => {
  it('with no ligature to keep: whole, at the letter-spacing that ends it where it was measured', () => {
    const own = tracked('TEA-PARTY', true);
    expect(own.seen.map((p) => p.text)).toEqual(['TEA-PARTY']);
    const [p] = own.seen as [Painted];
    expect(p.x).toBe(100);
    // The hyphen is 2 px narrower under a letter-spacing: shared among nine letters.
    expect(p.spacing).toBeCloseTo(2 + 2 / 9, 9);
    expect(p.width).toBeCloseTo(measured('TEA-PARTY'), 9);
    expect(own.advance).toBeCloseTo(measured('TEA-PARTY'), 9);
    expect(own.left).toBe('2px');
    // Keeping its host's language: at the tracking, 2 px short of its box, as it was.
    const host = tracked('TEA-PARTY', false);
    expect(host.seen.map((p) => [p.text, p.spacing])).toEqual([['TEA-PARTY', 2]]);
    expect(host.seen[0]!.width).toBeCloseTo(measured('TEA-PARTY') - 2, 9);
    expect(host.advance).toBeUndefined();
  });

  it('whose pieces do not end where it was measured to end: whole, the same way', () => {
    const own = tracked('UNIT', true);
    expect(own.seen.map((p) => p.text)).toEqual(['UNIT']);
    // 1 px for the N and 2 px for the T, shared among four letters.
    expect(own.seen[0]!.spacing).toBeCloseTo(2 + 3 / 4, 9);
    expect(own.seen[0]!.x + own.seen[0]!.width).toBeCloseTo(100 + measured('UNIT'), 9);
    // Keeping its host's language: the pieces it had, which end 2 px short.
    const host = tracked('UNIT', false);
    expect(host.seen.map((p) => [p.text, p.spacing])).toEqual([['UN', 0], ['IT', 2]]);
  });

  it('letters in a form by their neighbour are no ligature: tracked as the rest of the line', () => {
    // `UN`: the N is 1 px wider after a U, a form the non-joiner leaves
    // and the letter-spacing takes away. Read as a ligature, the word was
    // painted with no tracking inside and 4 px of it after.
    const own = tracked('UN', true);
    expect(own.seen.map((p) => p.text)).toEqual(['UN']);
    const [p] = own.seen as [Painted];
    expect(p.x).toBe(100);
    // 2 px a letter, and the 1 px of the N's form shared between the two.
    expect(p.spacing).toBeCloseTo(2 + 1 / 2, 9);
    expect(p.x + p.width).toBeCloseTo(100 + measured('UN'), 9);
    expect(own.advance).toBeCloseTo(measured('UN'), 9);
    expect(own.left).toBe('2px');
    // In a line of several words it is spaced as they are.
    const line = tracked('UN MAD TEA-PARTY', true);
    expect(line.seen.map((q) => q.text)).toEqual(['UN', ' ', 'MAD', ' ', 'TEA-PARTY']);
    expect(line.seen[0]!.spacing).toBeCloseTo(2.5, 9);
    expect(line.seen[2]!.x).toBeCloseTo(100 + measured('UN '), 9);
    // A ligature, which the non-joiner dissolves, keeps its piece.
    expect(tracked('fi', true).seen.map((q) => [q.text, q.spacing])).toEqual([['fi', 0]]);
    // Keeping its host's language: the pair is painted as the ligature it
    // was read as.
    const host = tracked('UN', false);
    expect(host.seen.map((q) => [q.text, q.spacing])).toEqual([['UN', 0]]);
  });

  it('a right-to-left word is painted as it was, forms by the neighbours and all', () => {
    // Alef and bet, the bet in a form by its neighbour: never painted at a
    // letter-spacing of its own, so it keeps the piece it had.
    const WORD = '\u05D0\u05D1';
    const painted = (own: boolean): [string, number][] => {
      const { ctx, seen } = paintingCtx();
      ctx.font = '20px Body';
      ctx.direction = 'rtl';
      setLetterSpacing(ctx, 2);
      setLetterTracking(own);
      fillTrackedWord(ctx, WORD, 100, 50, 2, (piece, x, y) => ctx.fillText(piece, x, y));
      setLetterTracking(false);
      return seen.map((p) => [p.text, p.spacing]);
    };
    expect(painted(true)).toEqual([[WORD, 0]]);
    expect(painted(true)).toEqual(painted(false));
  });

  it('a word whose ligature pieces fit keeps them', () => {
    for (const own of [true, false]) {
      const { seen, advance } = tracked('first', own);
      expect(seen.map((p) => [p.text, p.spacing])).toEqual([['fi', 0], ['rst', 2]]);
      expect(advance).toBeCloseTo(measured('first'), 9);
    }
    // Every letter tracked: the piece after the ligature ends on the box.
    const last = tracked('first', true).seen[1]!;
    expect(last.x + last.width).toBeCloseTo(100 + measured('first'), 9);
  });

  it('a text of several words: word by word, each where the natural shaping puts it', () => {
    const { seen, advance } = tracked('first A MAD TEA-PARTY', true);
    expect(seen.map((p) => p.text)).toEqual(['fi', 'rst', ' ', 'A', ' ', 'MAD', ' ', 'TEA-PARTY']);
    // Each word starts at the natural width of what stands before it and
    // the tracking of every letter before it.
    const at = (before: string): number => 100 + measured(before);
    expect(seen[3]!.x).toBeCloseTo(at('first '), 9);
    expect(seen[5]!.x).toBeCloseTo(at('first A '), 9);
    expect(seen[7]!.x).toBeCloseTo(at('first A MAD '), 9);
    expect(seen.slice(1, 7).every((p) => p.spacing === 2)).toBe(true);
    expect(seen[7]!.spacing).toBeCloseTo(2 + 2 / 9, 9);
    expect(seen[7]!.x + seen[7]!.width).toBeCloseTo(at('first A MAD TEA-PARTY'), 9);
    expect(advance).toBeCloseTo(measured('first A MAD TEA-PARTY'), 9);
    // A text the letter-spacing leaves as it is: one text, as before.
    expect(tracked('A MAD DAY', true).seen.map((p) => p.text)).toEqual(['A MAD DAY']);
  });

  it('a text with a CJK character is left at the tracking: its cells are not measured at a natural width', () => {
    const { seen, advance } = tracked(CJK, true);
    expect(seen.map((p) => [p.text, p.spacing])).toEqual([[CJK, 2]]);
    expect(advance).toBeUndefined();
  });
});

// Three Han characters the face draws 0.2 em narrower together.
const CJK = '\u6F22\u5B57\u4F53';

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px.
const OWN: PostextConfig = {
  page: { width: pt(400), height: pt(900), dpi: 72, margins: { top: pt(40), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, shapingLanguage: 'document' },
};
const HOST: PostextConfig = { ...OWN, bodyText: { ...OWN.bodyText, shapingLanguage: 'host' } };
const head = (config: PostextConfig, element: Record<string, unknown>): PostextConfig => ({
  ...config,
  header: { elements: [{ kind: 'text', id: 'rh', fontSize: pt(10), placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } }, ...element } as never] },
});
const headOf = (doc: VDTDocument): VDTDesignTextBlock =>
  doc.pages[0]!.header!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;

describe('a tracked design text the letter-spacing reshapes, in HTML (#770)', () => {
  const TEXT = 'first TEA-PARTY UNIT';
  it('shaped in its own language: each such word in a box at its own letter-spacing', () => {
    const doc = buildDocument({ markdown: 'Text.' }, head(OWN, { content: TEXT, letterSpacing: pt(0.2) }));
    // Measured at its natural width and the tracking of each letter.
    expect(headOf(doc).lines[0]!.width).toBeCloseTo(naturalWidth(TEXT, 10, true) + 0.2 * TEXT.length, 6);
    const html = renderToHtml(doc);
    // 1 px over nine letters; 0.5 px and 1 px over four.
    expect(html).toContain('<span style="letter-spacing:0.3111px;">TEA-PARTY</span>');
    expect(html).toContain('<span style="letter-spacing:0.5750px;">UNIT</span>');
    // A ligature whose pieces fit stays a box of its own.
    expect(html).toMatch(/<span style="letter-spacing:0;margin-inline-end:0\.400px;">fi<\/span>rst/);
  });
  it('letters in a form by their neighbour are no ligature: the word in a box at its own letter-spacing', () => {
    const doc = buildDocument({ markdown: 'Text.' }, head(OWN, { content: 'UN first', letterSpacing: pt(0.2) }));
    const html = renderToHtml(doc);
    // 0.2 px a letter, and the 0.5 px of the N's form shared between the two.
    expect(html).toContain('<span style="letter-spacing:0.4500px;">UN</span>');
    expect(html).not.toMatch(/<span style="letter-spacing:0;[^"]*">UN<\/span>/);
    expect(html).toMatch(/<span style="letter-spacing:0;margin-inline-end:0\.400px;">fi<\/span>rst/);
  });
  it('keeping its host\'s language: as it was', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, head(HOST, { content: TEXT, letterSpacing: pt(0.2) })));
    expect(html).not.toContain('letter-spacing:0.3111px');
    expect(html).not.toContain('letter-spacing:0.5750px');
    expect(html).toContain('TEA-PARTY');
  });
});

describe('a tracked line down a vertical page, in HTML (#770)', () => {
  it('its CJK text takes no letter-spacing of its own', () => {
    const config: PostextConfig = { ...OWN, layout: { writingMode: 'vertical-rl', layoutType: 'single' }, headings: { levels: [{ level: 2, letterSpacing: pt(0.5) }] } };
    const html = renderToHtml(buildDocument({ markdown: `## ${CJK}` }, config));
    expect(html).toContain(CJK);
    expect(html).not.toMatch(new RegExp(`<span style="letter-spacing:[-\\d.]+px;">${CJK}</span>`));
  });
});

describe('a design line of several runs, in HTML (#770)', () => {
  const CONTENT = 'Ada Lovelace^1^, Alan Turing^2^, Grace Hopper';
  it('shaped in its own language: a box per run, each where the widths before it end', () => {
    const doc = buildDocument({ markdown: 'Text.' }, head(OWN, { content: CONTENT, inlineMarks: true }));
    const line = headOf(doc).lines[0]!;
    expect(line.runs!.map((r) => r.text)).toEqual(['Ada Lovelace', '1', ', Alan Turing', '2', ', Grace Hopper']);
    const html = renderToHtml(doc);
    let x = 0;
    for (const run of line.runs!) {
      expect(html).toContain(`<span dir="ltr" style="position:absolute;left:${x.toFixed(3)}px;`);
      x += run.width;
    }
    // The text reads as written.
    expect(textOfHtml(html)).toContain('Ada Lovelace1, Alan Turing2, Grace Hopper');
  });
  it('keeping its host\'s language: the runs inline, as they were', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, head(HOST, { content: CONTENT, inlineMarks: true })));
    expect(html).not.toContain('<span dir="ltr" style="position:absolute;left:');
    expect(textOfHtml(html)).toContain('Ada Lovelace1, Alan Turing2, Grace Hopper');
  });
});

describe('a sideways word down a vertical line, on canvas (#770)', () => {
  const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
  // Soft hyphens: the word in the pieces of its syllables. The italic word
  // makes the line one painted segment by segment.
  const MD = 'of­fice *x* of­ficer';
  const painted = (config: PostextConfig): string[] => {
    const doc = buildDocument({ markdown: MD }, { ...config, layout: { writingMode: 'vertical-rl', layoutType: 'single' }, bodyText: { ...config.bodyText, textAlign: 'left' } });
    const block = paragraph(doc);
    // The layout holds the word in its pieces, the ligature across a cut:
    // the second piece is what the word grew by.
    expect(block.lines[0]!.segments!.map((s) => s.text).join('|')).toContain('of|fice');
    const { ctx, seen } = paintingCtx();
    const outer = setVerticalPaint({ region: 'mainland' });
    setSegmentLanguages(config === OWN);
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    setSegmentLanguages(false);
    setVerticalPaint(outer);
    return seen.map((p) => p.text);
  };
  it('its pieces are one text where the word was measured whole', () => {
    for (const config of [OWN, HOST]) {
      const texts = painted(config);
      expect(texts).toContain('office');
      expect(texts).toContain('officer');
      expect(texts).not.toContain('of');
    }
  });

  // The Chinese guide's contents page opens on `**《Postext指南》**是Sandbox…`:
  // bold marks and a bold word beside plain text, down the column. Asking
  // which pieces to join sets the context's font to each style it measures
  // in and leaves it there; a text is painted in the font of its own
  // segment all the same, and pieces are joined inside one style only.
  it('every text in the font of its own segment, a bold one beside a plain one', () => {
    // The last pieces measured are bold and the first text painted is
    // plain; then bold marks around a plain word, and a word half bold.
    const STYLED = 'of­fice 是 **《**of­ficer**》** **of­**fice **of­ficer**';
    for (const config of [OWN, HOST]) {
      const doc = buildDocument({ markdown: STYLED }, { ...config, layout: { writingMode: 'vertical-rl', layoutType: 'single' }, bodyText: { ...config.bodyText, textAlign: 'left' } });
      const block = paragraph(doc);
      const line = block.lines[0]!;
      expect(line.cjkComposed).toBeFalsy();
      expect(line.segments!.filter((s) => s.kind === 'text').map((s) => (s.bold ? `[${s.text}]` : s.text)).join('|'))
        .toBe('of|fice|是|[《]|of|ficer|[》]|[of]|fice|[of]|[ficer]');
      const { ctx, seen } = paintingCtx();
      const fonts: [text: string, font: string][] = [];
      const fill = ctx.fillText.bind(ctx);
      Object.assign(ctx, {
        translate() {}, rotate() {}, scale() {},
        fillText(text: string, x: number, y: number) {
          fonts.push([text, ctx.font]);
          fill(text, x, y);
        },
      });
      const outer = setVerticalPaint({ region: 'mainland' });
      setSegmentLanguages(config === OWN);
      renderBlock(ctx, block, block.bbox.width, block.bbox.x);
      setSegmentLanguages(false);
      setVerticalPaint(outer);
      expect(seen.map((p) => p.text)).toEqual(['office', '是', '《', 'officer', '》', 'of', 'fice', 'officer']);
      const plain = fonts[0]![1];
      const bold = fonts[2]![1];
      expect(bold).not.toBe(plain);
      expect(bold).toMatch(/bold|[6-9]00/);
      expect(fonts.map(([, font]) => (font === bold ? 'bold' : font === plain ? 'plain' : font)))
        .toEqual(['plain', 'plain', 'bold', 'plain', 'bold', 'bold', 'plain', 'bold']);
    }
  });
});
