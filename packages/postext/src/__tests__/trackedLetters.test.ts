import { describe, it, expect } from 'vitest';
import { renderBlock } from '../canvas-backend/blockRender.js';
import { fillTrackedWord, setLetterTracking } from '../canvas-backend/trackedText.js';
import { setSegmentLanguages } from '../canvas-backend/wordRuns.js';
import { setLetterSpacing } from '../canvas-backend/contextState.js';
import { renderToHtml } from '../html-backend/html-backend.js';
import { buildDocument } from '../pipeline/index.js';
import { setMeasureLanguage, measureSpacedWidth, measureTextWidth, clearTextWidthCache } from '../measure/canvas.js';
import { trackedLigaturePieces } from '../measure/trackedLigatures.js';
import type { PostextConfig } from '../types.js';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument, VDTLine } from '../vdt.js';

// #770: the layout counts the tracking of a tracked word once a letter. A
// ligature painted alone advanced by one tracking, as one glyph, so a word
// that held one ended a tracking short of its box for each letter joined
// (or ran over it, on a tightened line). In a document shaped in its own
// language the canvas sets the piece after a ligature the tracking of
// every letter before it further on, and the HTML writes the same pieces.
// A document that keeps its host's language is painted as it was
// (`trackedLigatures.test.ts`).

// A face with ff, fi, fl and ffi ligatures narrower than their letters, as
// a browser measures it: under a letter-spacing the ligatures are off and
// the spacing follows every letter. "fir" is kerned 0.2 px closer after the
// ligature, to tell the kerning across a cut.
const ADVANCE = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if ('ilf.,'.includes(ch)) return 0.3;
  if (/[A-Z]/.test(ch)) return 0.66;
  return 0.5;
};
const SHALOM = 'שלום';
const LIGATURES: [string, number][] = [['ffi', 0.75], ['ff', 0.5], ['fi', 0.5], ['fl', 0.5]];
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

class BrowserCtx {
  font = '10px Body';
  letterSpacing = '0px';
  lang = 'inherit';
  measureText(s: string): { width: number } {
    const spacing = parseFloat(this.letterSpacing) || 0;
    return { width: naturalWidth(s, sizeOf(this.font), spacing === 0) + spacing * s.length };
  }
}
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

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): BrowserCtx {
    return new BrowserCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px.
const OWN: PostextConfig = {
  page: { width: pt(160), height: pt(900), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, shapingLanguage: 'document' },
};
const HOST: PostextConfig = { ...OWN, bodyText: { ...OWN.bodyText, shapingLanguage: 'host' } };
// Three lines with 10‰ of negative tracking (`tightenRunts`).
const JUSTIFIED = 'fire stood the offices first is office within lets stood lets left stood is offices is office first a fire.';
const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const LIGA = "font-feature-settings:'liga' 1,'clig' 1;";

/** Where each word of `line` is painted to end, the tracking its last
 *  piece is owed counted (`owed` trackings a ligature), against where its
 *  segment ends. */
function wordEnds(block: VDTBlock, line: VDTLine, seen: Painted[], tracking: number, owed: (ligature: string) => number): { text: string; end: number; place: number }[] {
  const segments = line.segments!;
  const justified = block.textAlign === 'justify' && !line.isLastLine;
  const wordWidth = segments.reduce((w, s) => (s.kind === 'space' ? w : w + s.width), 0);
  const spaces = segments.filter((s) => s.kind === 'space').length;
  const out: { text: string; end: number; place: number }[] = [];
  let x = line.bbox.x;
  for (const seg of segments) {
    if (seg.kind === 'space') {
      x += justified ? (block.bbox.width - wordWidth) / spaces : seg.width;
      continue;
    }
    const pieces = seen.filter((p) => p.y === line.baseline && (Math.abs(p.x - x) < 1e-6 || (p.x > x && p.x < x + seg.width - 1e-6)));
    expect(pieces.map((p) => p.text).join('')).toBe(seg.text);
    const last = pieces[pieces.length - 1]!;
    out.push({ text: seg.text, end: last.x + last.width + (last.spacing === 0 ? owed(last.text) * tracking : 0), place: x + seg.width });
    x += seg.width;
  }
  return out;
}

describe('the ligatures of a tracked text, as the measurer sees them (#770)', () => {
  it('measures under a letter-spacing and leaves the context at none', () => {
    clearTextWidthCache();
    setMeasureLanguage('en');
    try {
      expect(measureSpacedWidth('first', '10px Body', 1)).toBeCloseTo(naturalWidth('first', 10, false) + 5, 9);
      // The measure after it is taken at no spacing.
      expect(measureTextWidth('first', '10px Body')).toBeCloseTo(naturalWidth('first', 10, true), 9);
    } finally {
      setMeasureLanguage(undefined);
    }
  });

  it('a ligature is a piece of its own with its letters, the rest between them', () => {
    setMeasureLanguage('en');
    try {
      expect(trackedLigaturePieces('first', '20px Body')).toEqual([
        { text: 'fi', offset: 0, width: 10, letters: 2, ligature: true },
        { text: 'rst', offset: 10, width: 30, letters: 3, ligature: false },
      ]);
      expect(trackedLigaturePieces('offices', '20px Body')!.map((p) => [p.text, p.offset, p.letters, p.ligature])).toEqual([
        ['o', 0, 1, false], ['ffi', 10, 3, true], ['ces', 25, 3, false],
      ]);
    } finally {
      setMeasureLanguage(undefined);
    }
  });

  it('a word the letter-spacing changes nothing of, and a right-to-left one, are set whole', () => {
    expect(trackedLigaturePieces('stood', '20px Body')).toBeNull();
    expect(trackedLigaturePieces(SHALOM, '20px Body')).toBeNull();
    expect(trackedLigaturePieces('a', '20px Body')).toBeNull();
  });
});

describe('a tracked word on canvas, every letter tracked (#770)', () => {
  it('sets the piece after a ligature the tracking of each letter before it further on', () => {
    const at = (on: boolean): number[] => {
      const { ctx, seen } = paintingCtx();
      ctx.font = '20px Body';
      setLetterSpacing(ctx, 0.5);
      setLetterTracking(on);
      fillTrackedWord(ctx, 'offices', 100, 50, 0.5, (text, x, y) => ctx.fillText(text, x, y));
      setLetterTracking(false);
      expect(seen.map((p) => p.text)).toEqual(['o', 'ffi', 'ces']);
      return seen.map((p) => p.x);
    };
    // o at 100; ffi after one letter; ces after four letters (o, f, f, i),
    // or after two glyphs where a ligature is one.
    expect(at(true)).toEqual([100, 100 + 10 + 0.5, 100 + 25 + 4 * 0.5]);
    expect(at(false)).toEqual([100, 100 + 10 + 0.5, 100 + 25 + 2 * 0.5]);
  });

  it('a paragraph shaped in its own language: every word ends where its box does', () => {
    const doc = buildDocument({ markdown: JUSTIFIED }, OWN);
    const block = paragraph(doc);
    const t = block.letterSpacing!;
    expect(t).toBeCloseTo(-0.1, 5);
    const { ctx, seen } = paintingCtx();
    setSegmentLanguages(true);
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    setSegmentLanguages(false);
    expect(seen.filter((p) => p.text === 'fi' || p.text === 'ffi')).toHaveLength(8);
    let withLigature = 0;
    for (const line of block.lines) {
      for (const word of wordEnds(block, line, seen, t, (ligature) => ligature.length)) {
        expect(word.end).toBeCloseTo(word.place, 6);
        if (/fi/.test(word.text)) withLigature++;
      }
    }
    expect(withLigature).toBe(8);
  });

  it('a paragraph that keeps its host\'s language: a ligature takes one tracking, as it did', () => {
    const doc = buildDocument({ markdown: JUSTIFIED }, HOST);
    const block = paragraph(doc);
    const t = block.letterSpacing!;
    const { ctx, seen } = paintingCtx();
    setSegmentLanguages(false);
    renderBlock(ctx, block, block.bbox.width, block.bbox.x);
    const short: number[] = [];
    for (const line of block.lines) {
      for (const word of wordEnds(block, line, seen, t, () => 1)) if (/fi/.test(word.text)) short.push(word.end - word.place);
    }
    // On a line tightened by 0.1 px a letter the four words with `fi` run
    // 0.1 px over their boxes, the four with `ffi` 0.2 px.
    expect(short.map((d) => Math.round(d * 1e6) / 1e6).sort()).toEqual([0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2]);
  });
});

describe('a tracked line in HTML, every letter tracked (#770)', () => {
  it('shaped in its own language: no feature asked for, each ligature in a box with the tracking of its letters', () => {
    const doc = buildDocument({ markdown: JUSTIFIED }, OWN);
    const t = paragraph(doc).letterSpacing!;
    const html = renderToHtml(doc);
    expect(html).toContain(`letter-spacing:${t}px;`);
    expect(html).not.toContain("'liga'");
    const box = (letters: number, text: string): string => `<span style="letter-spacing:0;margin-inline-end:${(letters * t).toFixed(3)}px;">${text}</span>`;
    expect(html).toContain(`>${box(2, 'fi')}re</span>`);
    expect(html).toContain(`>o${box(3, 'ffi')}ces</span>`);
    expect(html).toContain(`>${box(2, 'fi')}rst</span>`);
    expect(html.split('letter-spacing:0;margin-inline-end:').length - 1).toBe(8);
    // A word with no ligature is its text.
    expect(html).toContain('>stood</span>');
  });

  it('a run in another face is cut in its own font', () => {
    const doc = buildDocument({ markdown: JUSTIFIED.replace('first is', '**first** is') }, OWN);
    expect(paragraph(doc).letterSpacing).toBeLessThan(0);
    const html = renderToHtml(doc);
    expect(html).toMatch(/<span style="font:[^;]+;line-height:0;[^"]*"><span style="letter-spacing:0;margin-inline-end:[-\d.]+px;">fi<\/span>rst<\/span>/);
    expect(html).not.toContain("'liga'");
  });

  it('keeping its host\'s language: the ligatures asked for as features, the words whole', () => {
    const doc = buildDocument({ markdown: JUSTIFIED }, HOST);
    const t = paragraph(doc).letterSpacing!;
    const html = renderToHtml(doc);
    expect(html).toContain(`letter-spacing:${t}px;${LIGA}`);
    expect(html).not.toContain('margin-inline-end');
    expect(html).toContain('>first</span>');
  });

  it('an untracked line is written as it was, in either', () => {
    for (const config of [OWN, HOST]) {
      const html = renderToHtml(buildDocument({ markdown: 'The first of its offices.' }, config));
      expect(html).not.toContain("'liga'");
      expect(html).not.toContain('margin-inline-end');
    }
  });

  it('the two documents are laid out alike: the tracking changes no width', () => {
    const own = paragraph(buildDocument({ markdown: JUSTIFIED }, OWN));
    const host = paragraph(buildDocument({ markdown: JUSTIFIED }, HOST));
    expect(own.lines.map((l) => l.segments!.map((s) => [s.text, s.width]))).toEqual(host.lines.map((l) => l.segments!.map((s) => [s.text, s.width])));
  });
});

describe('a tracked design text in HTML, every letter tracked (#770)', () => {
  const head = (config: PostextConfig, content: string): PostextConfig => ({
    ...config,
    page: { ...config.page, width: pt(300), margins: { top: pt(40), bottom: pt(10), left: pt(10), right: pt(10) } },
    header: { elements: [{ kind: 'text', id: 'rh', content, fontSize: pt(10), letterSpacing: pt(0.2), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } } } as never] },
  });
  it('a running head: a box per word, its ligatures boxes of their own', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Text.' }, head(OWN, 'first office')));
    expect(html).not.toContain("'liga'");
    expect(html).toMatch(/top:0;"><span style="letter-spacing:0;margin-inline-end:0\.400px;">fi<\/span>rst<\/span>/);
    expect(html).toMatch(/top:0;">o<span style="letter-spacing:0;margin-inline-end:0\.600px;">ffi<\/span>ce<\/span>/);
    const hosted = renderToHtml(buildDocument({ markdown: 'Text.' }, head(HOST, 'first office')));
    expect(hosted).toContain(`letter-spacing:0.2px;${LIGA}`);
    expect(hosted).not.toContain('margin-inline-end');
  });
});

describe('a callout title set by the CJK composer (#770)', () => {
  const callout = (config: PostextConfig): PostextConfig => ({
    ...config,
    locale: 'ja',
    page: { ...config.page, width: pt(400), height: pt(300) },
    calloutStyles: [{ id: 'd' }],
  });
  const MD = 'Text.\n\n:::callout{type="d" title="Sandboxでやってみよう"}\nOne line.\n:::\n';
  const titleOf = (doc: VDTDocument): VDTDesignTextBlock => doc.blocks.find((b) => b.type === 'callout')!.designOverlay!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;

  it('shaped in its own language: the line carries the composer\'s runs, the Han–Latin space in a box', () => {
    const line = titleOf(buildDocument({ markdown: MD }, callout(OWN))).lines[0]!;
    expect(line.text).toBe('Sandboxでやってみよう');
    expect(line.runs).toBeDefined();
    expect(line.runs!.map((r) => r.text).join('')).toBe(line.text);
    // The runs are as wide as the line; set at its glyphs' advances the
    // text is narrower by the space between `Sandbox` and `で`.
    const sum = line.runs!.reduce((w, r) => w + r.width, 0);
    expect(sum).toBeCloseTo(line.width, 6);
    const glyphs = line.runs!.reduce((w, r) => w + naturalWidth(r.text, sizeOf(r.fontString), true), 0);
    expect(line.width - glyphs).toBeGreaterThan(1);
    expect(line.runs!.some((r) => r.inkOffset !== undefined)).toBe(true);
  });

  it('keeping its host\'s language: the line as it was, with no runs', () => {
    const own = titleOf(buildDocument({ markdown: MD }, callout(OWN))).lines[0]!;
    const host = titleOf(buildDocument({ markdown: MD }, callout(HOST))).lines[0]!;
    expect(host.runs).toBeUndefined();
    expect(host.width).toBeCloseTo(own.width, 6);
  });

  it('a title with nothing spaced by the composer carries no runs', () => {
    const line = titleOf(buildDocument({ markdown: MD.replace('Sandboxでやってみよう', 'やってみよう') }, callout(OWN))).lines[0]!;
    expect(line.runs).toBeUndefined();
  });
});

describe('other texts the HTML sets as they were measured (#770)', () => {
  const TOC = '# Contents {toc="false"}\n\n:::toc\n\n# The lantern\n\nText.\n\n# The second lantern\n\nText.';
  it('a leader of dots takes its own direction in a document shaped in its own language', () => {
    // The opening tag of each leader box. Its direction is a `dir`: an
    // EPUB's pages may carry no `direction` declaration (EPUBCheck CSS-001).
    const leader = (config: PostextConfig): string[] => [...renderToHtml(buildDocument({ markdown: TOC }, { ...config, page: { ...config.page, width: pt(300) } })).matchAll(/<span aria-hidden="true"[^>]*>(?:<span[^>]*>)?[. ]{4,}/g)].map((m) => m[0]!);
    const own = leader(OWN);
    expect(own.length).toBeGreaterThan(0);
    for (const tag of own) expect(tag).toMatch(/^<span aria-hidden="true" style="position:absolute;[^"]*" dir="ltr">/);
    const host = leader(HOST);
    expect(host).toHaveLength(own.length);
    for (const tag of [...own, ...host]) expect(tag).not.toContain('direction');
    for (const tag of host) expect(tag).not.toContain(' dir=');
  });

  it('a drop cap of a tracked line is set with no tracking, as it was measured', () => {
    const config: PostextConfig = { ...OWN, page: { ...OWN.page, width: pt(300) }, headings: { levels: [{ level: 1, dropCap: { lines: 2 } }] } } as PostextConfig;
    const doc = buildDocument({ markdown: '# One\n\nLong before there were title pages there were readers of the scrolls who kept their place with a finger and a lamp.' }, config);
    const block = paragraph(doc);
    expect(block.dropCap).toBeDefined();
    const cap = (html: string): string => /class="pt-dropcap" style="([^"]*)"/.exec(html)![1]!;
    expect(cap(renderToHtml(doc))).not.toContain('letter-spacing');
    block.letterSpacing = 0.25;
    expect(cap(renderToHtml(doc))).toContain('white-space:pre;letter-spacing:normal;');
  });

  it('a design line of one run in the block\'s font is a box per word, as a line with no runs', () => {
    const config: PostextConfig = {
      ...OWN,
      page: { ...OWN.page, width: pt(300), margins: { top: pt(40), bottom: pt(10), left: pt(10), right: pt(10) } },
      header: { elements: [{ kind: 'text', id: 'rh', content: 'Set in stone and so on', fontSize: pt(10), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } } } as never] },
    };
    const doc = buildDocument({ markdown: 'Text.' }, config);
    const WORDS = /<span style="position:absolute;left:0\.000px;top:0;">Set<\/span><span style="position:absolute;left:[\d.]+px;top:0;"> <\/span><span style="position:absolute;left:[\d.]+px;top:0;">in<\/span>/;
    const plain = renderToHtml(doc);
    expect(plain).toMatch(WORDS);
    // The same line as the composer of a Chinese or Japanese document
    // hands it over: one run, its whole text.
    const block = doc.pages[0]!.header!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    const line = block.lines[0]!;
    line.runs = [{ text: line.text, fontString: block.fontString, width: line.width }];
    expect(renderToHtml(doc)).toBe(plain);
    // A run that is not the line in the block's font keeps its own box.
    line.runs = [{ text: line.text, fontString: block.fontString, width: line.width, baselineShift: 1 }];
    expect(renderToHtml(doc)).not.toMatch(WORDS);
  });
});

describe('a right-to-left run of a design line (#770)', () => {
  it('is a box per word from the run\'s right, in a run box as wide as the run', () => {
    const config: PostextConfig = {
      ...OWN, locale: 'ar',
      page: { ...OWN.page, width: pt(300), margins: { top: pt(40), bottom: pt(10), left: pt(10), right: pt(10) } },
      header: { elements: [{ kind: 'text', id: 'rh', content: '\u0628\u0627\u0628 \u0643\u062A\u0627\u0628 \u0628\u0627\u0628', fontSize: pt(10), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } } } as never] },
    };
    const doc = buildDocument({ markdown: '\u0628\u0627\u0628.' }, config);
    const block = doc.pages[0]!.header!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    const run = block.lines[0]!.runs![0]!;
    expect(run.rtl).toBe(true);
    const html = renderToHtml(doc);
    // باب 15 px, a space 2.5 px, كتاب 20 px: each word from the right.
    expect(html).toContain(`white-space:pre;width:${run.width.toFixed(3)}px;"><span style="position:absolute;right:0.000px;top:0;">\u0628\u0627\u0628</span><span style="position:absolute;right:15.000px;top:0;"> </span><span style="position:absolute;right:17.500px;top:0;">\u0643\u062A\u0627\u0628</span>`);
    expect(html).not.toContain('display:inline-block;"> </span>\u0643');
    // A run the layout holds at another width than its words set so is
    // written as it was.
    run.width += 1;
    block.lines[0]!.width += 1;
    expect(renderToHtml(doc)).toContain('display:inline-block;"> </span>\u0643');
  });
});

describe('a sideways word down a vertical line (#770)', () => {
  it('its pieces are one box where the word was measured whole', () => {
    const config: PostextConfig = { ...OWN, layout: { writingMode: 'vertical-rl', layoutType: 'single' }, bodyText: { ...OWN.bodyText, textAlign: 'left' } };
    // Soft hyphens: the word in the pieces of its syllables.
    const MD = 'of\u00ADfice *x* of\u00ADficer';
    const doc = buildDocument({ markdown: MD }, config);
    const line = paragraph(doc).lines[0]!;
    // The layout holds the word in the pieces of its syllables, the
    // ligature across a cut: the second piece is what the word grew by.
    expect(line.segments!.map((s) => s.text).join('|')).toContain('of|fice');
    const html = renderToHtml(doc);
    expect(html).toMatch(/white-space:pre;[^"]*">office<\/span>/);
    expect(html).not.toMatch(/">of<\/span>/);
    // Keeping its host's language where no page is known: as it was.
    const hosted = renderToHtml(buildDocument({ markdown: MD }, { ...config, bodyText: { ...config.bodyText, shapingLanguage: 'host' } }));
    expect(hosted).toMatch(/">of<\/span>/);
  });
});
