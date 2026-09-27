import { describe, it, expect } from 'vitest';
import { parseInlineFormatting } from '../parse/inlineFormatting';
import {
  measureRichBlock,
  scriptMetrics,
  SCRIPT_SIZE_RATIO,
  SUBSCRIPT_SHIFT_RATIO,
  STACKED_SUBSCRIPT_SHIFT_RATIO,
  SUPERSCRIPT_SHIFT_RATIO,
} from '../measure/rich';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../design/layout';
import { resolveDesignSlot } from '../defaults/headerFooter';
import { buildDocument } from '../pipeline';
import { raggedLooseLines } from '../pipeline/raggedLines';
import { trackSegments } from '../knuthPlass/tracking';
import { renderBlock } from '../canvas-backend/blockRender';
import { renderHeaderFooterSlot } from '../canvas-backend/headerFooter';
import { renderToHtmlIndexed } from '../html-backend';
import type { DesignPlaceholderContext } from '../design/placeholders';
import type { DesignElement, PostextConfig } from '../types';
import type { VDTBlock, VDTLine, VDTLineSegment, VDTPage } from '../vdt';

// EF-80: a subscript used to drop as far as a superscript rises (a third of
// the text size), so it hung below the descenders, and a superscript right
// after a subscript (`*T*~0~^2^`) was set after it instead of over it.

// Deterministic stub whose widths follow the font size, so a script
// measures narrower than the text around it: every character is half the
// size wide.
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const N = '20px Serif';
const B = '700 20px Serif';
const I = 'italic 20px Serif';
const BI = 'italic 700 20px Serif';
const SCRIPT_CHAR = 20 * SCRIPT_SIZE_RATIO * 0.5;

const measure = (md: string, width = 1000, options = {}) =>
  measureRichBlock(parseInlineFormatting(md), N, B, I, BI, width, 24, options);

/** Each segment of a line with the pen position it is painted at. */
function placed(line: VDTLine): { seg: VDTLineSegment; x: number }[] {
  let x = 0;
  return (line.segments ?? []).map((seg) => {
    const at = { seg, x };
    x += seg.width;
    return at;
  });
}

const BREAKERS = [
  { textAlign: 'left' as const },
  { textAlign: 'left' as const, hyphenate: true, hyphenationZonePx: 0 },
  { textAlign: 'justify' as const },
  { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.8 },
  { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 1.2, minShrinkRatio: 0.9, justifyTrackingPx: 1 },
];

describe('subscript and superscript positions (EF-80)', () => {
  it('a subscript drops 0.15 em, a superscript rises a third of an em, a stacked subscript drops 0.25 em', () => {
    expect(SUBSCRIPT_SHIFT_RATIO).toBeLessThan(SUPERSCRIPT_SHIFT_RATIO);
    expect(scriptMetrics(N, 'sup').baselineShift).toBeCloseTo(-20 * SUPERSCRIPT_SHIFT_RATIO, 6);
    expect(scriptMetrics(N, 'sub').baselineShift).toBeCloseTo(20 * 0.15, 6);
    expect(scriptMetrics(N, 'sub', true).baselineShift).toBeCloseTo(20 * STACKED_SUBSCRIPT_SHIFT_RATIO, 6);
    expect(STACKED_SUBSCRIPT_SHIFT_RATIO).toBe(0.25);
    // Stacking only ever lowers a subscript.
    expect(scriptMetrics(N, 'sup', true).baselineShift).toBeCloseTo(scriptMetrics(N, 'sup').baselineShift, 6);
  });

  it('a lone subscript sits 0.15 em below the baseline, after its base', () => {
    const segs = measure('H~2~O').lines[0]!.segments!;
    expect(segs.map((s) => s.text)).toEqual(['H', '2', 'O']);
    expect(segs[1]!.baselineShift).toBeCloseTo(3, 6);
    expect(segs[1]!.width).toBeCloseTo(SCRIPT_CHAR, 6);
    expect(segs.some((s) => s.stacked)).toBe(false);
  });

  it('stacks a superscript over the subscript before it, on every breaker', () => {
    for (const options of BREAKERS) {
      const { lines } = measure('whose *T*~0~^2^ is 2.0059 s, and *T*~0~^2^ against', 1000, options);
      expect(lines.length).toBe(1);
      const at = placed(lines[0]!);
      const zeros = at.filter((p) => p.seg.text === '0');
      expect(zeros.length, JSON.stringify(options)).toBe(2);
      for (const zero of zeros) {
        const i = at.indexOf(zero);
        const two = at[i + 1]!;
        expect(two.seg.text).toBe('2');
        // Both painted at the same pen position: the subscript advances
        // nothing, the superscript takes the pair's advance.
        expect(zero.seg.stacked).toBe(true);
        expect(zero.seg.width).toBe(0);
        expect(two.x).toBeCloseTo(zero.x, 6);
        expect(two.seg.stacked).toBeUndefined();
        expect(two.seg.width).toBeGreaterThanOrEqual(SCRIPT_CHAR - 1e-9);
        expect(zero.seg.script).toBe('sub');
        expect(zero.seg.baselineShift).toBeCloseTo(20 * STACKED_SUBSCRIPT_SHIFT_RATIO, 6);
        expect(two.seg.script).toBe('sup');
        expect(two.seg.baselineShift).toBeCloseTo(-20 * SUPERSCRIPT_SHIFT_RATIO, 6);
      }
    }
  });

  it('the pair advances as far as its wider script, in either order', () => {
    const widthOf = (md: string) => measure(md).lines[0]!.segments!.reduce((s, seg) => s + seg.width, 0);
    const T = 10; // an italic T at 20 px
    // A two-letter subscript under a one-letter superscript, and the reverse.
    expect(widthOf('*T*~ij~^2^')).toBeCloseTo(T + 2 * SCRIPT_CHAR, 6);
    expect(widthOf('*T*^2^~ij~')).toBeCloseTo(T + 2 * SCRIPT_CHAR, 6);
    const reversed = measure('*T*^2^~ij~').lines[0]!.segments!;
    expect(reversed.map((s) => [s.text, s.stacked ?? false, s.width])).toEqual([
      ['T', false, T], ['2', true, 0], ['ij', false, 2 * SCRIPT_CHAR],
    ]);
    expect(reversed[2]!.baselineShift).toBeCloseTo(20 * STACKED_SUBSCRIPT_SHIFT_RATIO, 6);
    // Two pairs in a row, and a third script after a pair, which is set after it.
    const three = measure('x~a~^b^~c~').lines[0]!.segments!;
    expect(three.map((s) => [s.text, s.stacked ?? false])).toEqual([['x', false], ['a', true], ['b', false], ['c', false]]);
    expect(three[3]!.baselineShift).toBeCloseTo(20 * SUBSCRIPT_SHIFT_RATIO, 6);
  });

  it('scripts a space or text keeps apart are not stacked', () => {
    for (const md of ['*T*~0~ ^2^', '*T*~0~x^2^', 'H~2~O', 'x^2^ + y^2^']) {
      expect(measure(md).lines[0]!.segments!.some((s) => s.stacked), md).toBe(false);
    }
  });

  it('never breaks or hyphenates inside a stacked pair', () => {
    const md = 'the long subscripted *x*~maximum~^2^ symbol and *x*~minimum~^2^ again';
    for (const options of BREAKERS) {
      for (let width = 40; width <= 400; width += 3) {
        const { lines } = measureRichBlock(parseInlineFormatting(md), N, B, I, BI, width, 24, { ...options, hyphenate: true });
        for (const line of lines) {
          const segs = line.segments ?? [];
          const last = segs[segs.length - 1];
          // A stacked subscript is always followed on its line by its superscript.
          segs.forEach((s, k) => { if (s.stacked) expect(segs[k + 1]?.script, `${width} ${JSON.stringify(options)}`).toBe('sup'); });
          expect(last?.stacked ?? false).toBe(false);
          expect(line.text).not.toMatch(/(maxi|mini)-?$/);
        }
      }
    }
  });

  it('a loose line set ragged gives a stacked pair back its natural widths', () => {
    // `raggedLooseLines` takes justification tracking off a line past 3x. It
    // has to undo what `trackSegments` did: the first run of a pair took
    // none, the second the longer run's.
    const natural: VDTLineSegment[] = [
      { kind: 'text', text: 'T', width: 10 },
      { kind: 'text', text: '0', width: 0, script: 'sub', stacked: true },
      { kind: 'text', text: '2', width: 6, script: 'sup' },
      { kind: 'space', text: ' ', width: 5 },
      { kind: 'text', text: 'grows', width: 50 },
    ];
    const tracked = natural.map((seg) => ({ ...seg }));
    const added = trackSegments(tracked, 1);
    expect(added).toBe(1 + 1 + 5);
    expect(tracked.map((seg) => seg.width)).toEqual([11, 0, 7, 5, 55]);
    const line: VDTLine = {
      text: 'T02 grows',
      bbox: { x: 0, y: 0, width: 71 + added, height: 20 },
      baseline: 16,
      hyphenated: false,
      segments: tracked,
      isLastLine: false,
      justifiedSpaceRatio: 4,
      letterSpacing: 1,
    };
    const [ragged] = raggedLooseLines([line], 'justify');
    expect(ragged!.ragged).toBe(true);
    expect(ragged!.letterSpacing).toBeUndefined();
    expect(ragged!.segments!.map((seg) => seg.width)).toEqual(natural.map((seg) => seg.width));
    expect(ragged!.bbox.width).toBe(71);
    // The line it came from is left as it was.
    expect(tracked[1]!.width).toBe(0);
  });

  it('a ragged loose line in a tracked paragraph keeps its stacked pairs whole', () => {
    const words = 'the incomprehensibilities of *T*~0~^2^ and x~max~^2^ extraordinarily uncharacteristically counterrevolutionaries a b'.split(' ');
    const markdown = [0, 1, 2].map((k) => words.slice(k).concat(words.slice(0, k)).join(' ')).join(' ');
    let ragged = 0;
    for (let width = 300; width <= 800; width += 10) {
      const doc = buildDocument(
        { markdown },
        {
          page: { width: { value: width, unit: 'px' }, height: { value: 4000, unit: 'px' }, dpi: 96 },
          layout: { layoutType: 'single' },
          bodyText: { fontFamily: 'Serif', fontSize: { value: 20, unit: 'px' }, textAlign: 'justify', maxJustifyTracking: 20, hyphenation: { enabled: false } },
        },
      );
      for (const block of doc.blocks) {
        for (const line of block.lines ?? []) {
          const segs = line.segments ?? [];
          if (!segs.some((seg) => seg.stacked)) continue;
          const at = `${width}px ${line.text}`;
          for (const seg of segs) expect(seg.width, at).toBeGreaterThanOrEqual(0);
          expect(segs.reduce((sum, seg) => sum + seg.width, 0), at).toBeCloseTo(line.bbox.width, 6);
          segs.forEach((seg, k) => {
            if (!seg.stacked) return;
            const next = segs[k + 1]!;
            expect(seg.width, at).toBe(0);
            // A ragged line is back at natural widths: the pair advances
            // exactly as far as its longer run.
            if (line.ragged) expect(next.width, at).toBeCloseTo(SCRIPT_CHAR * Math.max(seg.text.length, next.text.length), 6);
          });
          if (line.ragged) ragged++;
        }
      }
    }
    expect(ragged).toBeGreaterThan(0);
  });

  it('a chip stacks the scripts of its own words', () => {
    const doc = buildDocument(
      { markdown: 'Period :chip[T~0~^2^]{style="k"} squared.' },
      { chipStyles: [{ id: 'k' }], page: { width: { value: 400, unit: 'pt' }, height: { value: 400, unit: 'pt' }, dpi: 72 }, layout: { layoutType: 'single' } },
    );
    const chip = doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!.segments!.find((s) => s.chip)!.chip!;
    expect(chip.runs.map((r) => [r.text, r.stacked ?? false])).toEqual([['T', false], ['0', true], ['2', false]]);
    expect(chip.runs[1]!.width).toBe(0);
    expect(chip.runs[1]!.baselineShift!).toBeGreaterThan(0);
    expect(chip.runs[2]!.baselineShift!).toBeLessThan(0);
  });
});

describe('scripts in design text (EF-80)', () => {
  const DPI = 72;
  const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
  const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
  const layoutOne = (content: string): ResolvedTextPrimitive => layoutDesignSlot(
    resolveDesignSlot({ elements: [{
      kind: 'text', id: 't', content, inlineMarks: true, fontSize: { value: 20, unit: 'pt' },
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: 300, unit: 'pt' } } },
    } as DesignElement] }),
    { container: { x: 0, y: 0, width: 400, height: 200 }, dpi: DPI, placeholders },
    0,
  ).primitives[0] as ResolvedTextPrimitive;

  it('drops a subscript 0.15 em and stacks a superscript over it, as in the body', () => {
    const lone = layoutOne('H~2~O').lines[0]!.runs!;
    expect(lone[1]!.baselineShift).toBeCloseTo(3, 6);
    const p = layoutOne('*T*~ij~^2^ s');
    const runs = p.lines[0]!.runs!;
    expect(runs.map((r) => [r.text, r.stacked ?? false])).toEqual([['T', false], ['ij', true], ['2', false], [' s', false]]);
    expect(runs[1]!.width).toBe(0);
    expect(runs[1]!.baselineShift).toBeCloseTo(20 * STACKED_SUBSCRIPT_SHIFT_RATIO, 6);
    // The pair advances as far as the wider script: the two-letter subscript.
    expect(runs[2]!.width).toBeCloseTo(2 * SCRIPT_CHAR, 6);
    expect(p.lines[0]!.width).toBeCloseTo(runs.reduce((s, r) => s + r.width, 0), 6);
    expect(p.lines[0]!.width).toBeCloseTo(10 + 2 * SCRIPT_CHAR + 2 * 10, 6);
  });

  it('a word wider than the element is never cut inside a stacked pair', () => {
    // A word too wide for the element is cut by syllable or character; the
    // cut falls before the pair (or after it, when the pair opens what is
    // left), never between or inside its two scripts.
    let cuts = 0;
    for (let widthPt = 20; widthPt <= 120; widthPt += 2) {
      for (const hyphenate of [false, true]) {
        const p = layoutDesignSlot(
          resolveDesignSlot({ elements: [{
            kind: 'text', id: 't', content: 'Aa x~abcd~^efghij^ and T~0~^2^ end', inlineMarks: true, hyphenate, overflow: 'wrap',
            fontSize: { value: 20, unit: 'pt' },
            placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: widthPt, unit: 'pt' } } },
          } as DesignElement] }),
          { container: { x: 0, y: 0, width: 400, height: 400 }, dpi: DPI, placeholders },
          0,
        ).primitives[0] as ResolvedTextPrimitive;
        const lines = p.lines.map((l) => l.runs ?? []);
        const at = `${widthPt}pt hyphenate=${hyphenate}: ${lines.map((runs) => runs.map((r) => r.text).join('|')).join(' / ')}`;
        const scripts = lines.flat().filter((r) => r.baselineShift !== undefined).map((r) => r.text);
        // Every script is whole: nothing of `abcd`, `efghij`, `0` or `2` is divided.
        expect(scripts, at).toEqual(['abcd', 'efghij', '0', '2']);
        lines.forEach((runs, k) => {
          runs.forEach((r, i) => { if (r.stacked) expect(runs[i + 1]?.baselineShift, at).toBeDefined(); });
          const next = lines[k + 1]?.[0];
          const last = runs[runs.length - 1];
          if (next?.baselineShift !== undefined && last?.baselineShift !== undefined) {
            expect(Math.sign(next.baselineShift), at).toBe(Math.sign(last.baselineShift));
          }
        });
        if (lines.length > 4) cuts++;
      }
    }
    expect(cuts).toBeGreaterThan(0);
  });

  it('the canvas paints the pair at one x; HTML sets the first in a box that takes no room', () => {
    const calls: [string, number][] = [];
    const ctx = {
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, letterSpacing: '0px', textBaseline: 'alphabetic',
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      fillText(text: string, x: number) { calls.push([text, x]); },
      strokeText() {},
    };
    const slot = {
      bbox: { x: 0, y: 0, width: 200, height: 40 },
      blocks: [{
        kind: 'text', bbox: { x: 0, y: 0, width: 200, height: 20 }, fontString: '20px Serif', color: '#111111', clip: false,
        lines: [{ text: 'Tij2', xOffset: 0, baselineY: 16, width: 20, runs: [
          { text: 'T', fontString: '20px Serif', width: 10 },
          { text: 'ij', fontString: '11.66px Serif', width: 0, baselineShift: 5, stacked: true },
          { text: '2', fontString: '11.66px Serif', width: 11.66, baselineShift: -6.66 },
        ] }],
      }],
    };
    renderHeaderFooterSlot(ctx as unknown as CanvasRenderingContext2D, slot as never);
    expect(calls).toEqual([['T', 0], ['ij', 10], ['2', 10]]);
  });
});

describe('painting stacked body scripts (EF-80)', () => {
  const config: PostextConfig = {
    page: { width: { value: 400, unit: 'pt' }, height: { value: 400, unit: 'pt' }, dpi: 72 },
    layout: { layoutType: 'single' },
    bodyText: { fontFamily: 'Serif', fontSize: { value: 20, unit: 'pt' }, textAlign: 'left' },
  };
  const paragraph = (): VDTBlock => buildDocument({ markdown: 'Then *T*~0~^2^ grows.' }, config).blocks.find((b) => b.type === 'paragraph')!;

  it('the canvas paints the superscript at the subscript\'s x', () => {
    const block = paragraph();
    const calls: [string, number, number][] = [];
    const ctx = {
      font: '', fillStyle: '', textBaseline: 'alphabetic', letterSpacing: '0px',
      fillText(text: string, x: number, y: number) { calls.push([text, x, y]); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    renderBlock(ctx as unknown as CanvasRenderingContext2D, block, block.bbox.width, block.bbox.x);
    const zero = calls.find((c) => c[0] === '0')!;
    const two = calls.find((c) => c[0] === '2')!;
    expect(two[1]).toBeCloseTo(zero[1], 6);
    const baseline = block.lines[0]!.baseline;
    expect(zero[2] - baseline).toBeCloseTo(20 * STACKED_SUBSCRIPT_SHIFT_RATIO, 6);
    expect(two[2] - baseline).toBeCloseTo(-20 * SUPERSCRIPT_SHIFT_RATIO, 6);
    // The word after the pair starts past the wider script.
    const grows = calls.find((c) => c[0] === 'grows.')!;
    expect(grows[1] - two[1]).toBeCloseTo(SCRIPT_CHAR + 10, 6);
  });

  it('HTML places both scripts at one left', () => {
    const html = renderToHtmlIndexed(buildDocument({ markdown: 'Then *T*~0~^2^ grows.' }, config)).html;
    const left = (ch: string) => Number(new RegExp(`left:([\\d.]+)px;top:[-\\d.]+px;white-space:pre;"><span style="font:[^"]*">${ch}<`).exec(html)?.[1]);
    expect(left('0')).toBeGreaterThan(0);
    expect(left('2')).toBeCloseTo(left('0'), 3);
  });

  it('HTML design text sets the first script of a pair in a box that takes no room', () => {
    const cfg: PostextConfig = {
      ...config,
      header: { elements: [{
        kind: 'text', id: 'h', content: 'Period *T*~0~^2^', inlineMarks: true, fontSize: { value: 10, unit: 'pt' },
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: 200, unit: 'pt' } } },
      } as DesignElement] },
    };
    const html = renderToHtmlIndexed(buildDocument({ markdown: 'Text.' }, cfg)).html;
    expect(html).toMatch(/<span style="[^"]*display:inline-block;width:0;[^"]*">0<\/span><span style="[^"]*display:inline-block;min-width:[\d.]+px;[^"]*">2<\/span>/);
  });
});
