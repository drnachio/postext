import { describe, it, expect, beforeAll } from 'vitest';
import { measureBlock } from '../measure/plain';
import { measureRichBlock } from '../measure/rich';
import { setHyphenationLocale } from '../hyphenate';
import { buildDocument } from '../pipeline';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTLine } from '../vdt';

// EF-65 (addendum): a justified line could be set past `maxWordSpacing`
// though the paragraph had a setting with every line within it. The runt
// fix sets a paragraph one line shorter (Knuth–Plass looseness −1), and the
// shorter setting it took could hold a line far looser than any the
// paragraph had: "…one, or one colony" at 1.75× with the limit at 1.7.

// Deterministic stub with widths that vary by character, so the breaks
// fall in many places.
const W = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if ('il.,;:!|\'()'.includes(ch)) return 0.28;
  if ('mwMW'.includes(ch)) return 0.8;
  if (/[A-Z]/.test(ch)) return 0.66;
  return 0.5;
};
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    let w = 0;
    for (const ch of s) w += W(ch) * size;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

beforeAll(() => setHyphenationLocale('en-us'));

const MAX = 1.7;

/** The loosest word spacing of a paragraph's justified lines. */
const loosest = (lines: readonly VDTLine[]): number =>
  Math.max(0, ...lines.filter((l) => !l.isLastLine && l.justifiedSpaceRatio !== undefined).map((l) => l.justifiedSpaceRatio!));

// A paragraph whose natural setting (10 lines, the last a runt) keeps every
// line within 1.7×; the best 9-line setting has a line at 2.1×.
const COLONY = 'first it the one, winter colonies is you wakes warm for one, if left or is it winter the one, do you you colony do you have and one, what is years for warm winter and worth keeps years wakes do warm is have had warm the has colony because colony and dry the the do and the first keeps because it had you honey do you honey two afternoon afternoon and if afternoon afternoon colony.';

describe('a shorter setting never buys a line past the word-spacing limit (EF-65)', () => {
  it('Knuth–Plass looseness −1 keeps the natural setting rather than stretch a line past the limit', () => {
    const options = {
      textAlign: 'justify' as const, optimal: true, hyphenate: true,
      maxStretchRatio: MAX, minShrinkRatio: 0.6, runtPenalty: 1000, runtMinCharacters: 20, firstLineIndentPx: 32.5,
    };
    const font = '400 21.666666666666668px serif';
    const natural = measureBlock(COLONY, font, 419.2913385826772, 20, options);
    expect(natural.lines.length).toBe(10);
    expect(natural.lastLineRunt).toBe(true);
    expect(loosest(natural.lines)).toBeLessThanOrEqual(MAX);
    const shorter = measureBlock(COLONY, font, 419.2913385826772, 20, { ...options, looseness: -1 });
    expect(loosest(shorter.lines)).toBeLessThanOrEqual(MAX);
  });

  it('a line with no word space (a URL) does not count as loose', () => {
    // The natural setting has lines far past the limit (a two-word line
    // beside long URLs); the shorter one sets a URL piece alone, which has
    // no space to stretch, and its spaced lines are less loose: it stands.
    const text = 'left you the https://doi.org/10.1016/j.jhealeco.2019.102245 https://www.example.org/archive/reports/2019/annual-health-survey.pdf you left and do.';
    const font = '400 20px serif';
    const spans = [{ text, bold: false, italic: false }];
    const options = { textAlign: 'justify' as const, optimal: true, hyphenate: true, maxStretchRatio: 2, minShrinkRatio: 0.6, runtPenalty: 1000, runtMinCharacters: 20 };
    const natural = measureRichBlock(spans, font, font, font, font, 433, 20, options);
    const shorter = measureRichBlock(spans, font, font, font, font, 433, 20, { ...options, looseness: -1 });
    expect(shorter.lines.length).toBe(natural.lines.length - 1);
    expect(shorter.lines.some((l) => !l.isLastLine && l.justifiedSpaceRatio === undefined)).toBe(true);
    expect(loosest(shorter.lines)).toBeLessThan(loosest(natural.lines));
  });

  it('the runt fix leaves no line looser than the limit or than the paragraph had', () => {
    // The generator the Cookbook probe used, at the widths where the fix
    // used to set a line past the limit (with and without tracking).
    const words = 'the colony wakes before you do and the first warm afternoon tells you what the winter has left and it is worth waiting for because honey keeps for years if it is dry one, and you have two colonies where you had one, or one colony'.split(' ');
    let s = 11;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const para = (n: number) => Array.from({ length: n }, () => words[Math.floor(rnd() * words.length)]).join(' ') + '.';
    const markdown = Array.from({ length: 30 }, (_, i) => para(20 + (i * 7) % 70)).join('\n\n');
    let tightened = 0;
    for (const width of [84, 90, 100, 101]) {
      const config = (tightenRunts: boolean): PostextConfig => ({
        page: { width: { value: width, unit: 'mm' }, height: { value: 5000, unit: 'mm' }, dpi: 150 },
        layout: { layoutType: 'single' },
        bodyText: { fontFamily: 'serif', fontSize: { value: 10.4, unit: 'pt' }, lineHeight: { value: 14.2, unit: 'pt' }, textAlign: 'justify', maxWordSpacing: MAX, tightenRunts },
      });
      const paragraphs = (on: boolean): VDTBlock[] => buildDocument({ markdown }, config(on)).blocks.filter((b) => b.type === 'paragraph');
      const fixed = paragraphs(true);
      const plain = paragraphs(false);
      expect(fixed.length).toBe(plain.length);
      fixed.forEach((b, i) => {
        if (b.lines.length < plain[i]!.lines.length) tightened++;
        expect(loosest(b.lines), `${width} mm, paragraph ${i}`).toBeLessThanOrEqual(Math.max(MAX, loosest(plain[i]!.lines)) + 1e-9);
      });
    }
    // The fix still sets runts short where it can.
    expect(tightened).toBeGreaterThan(0);
  }, 30_000);

  it('a line the paragraph sets ragged does not raise the bar', () => {
    // A line past 3x is set ragged, not stretched, so it is not a loose
    // line the reader sees. Taking the bar from it let a runt fix stretch
    // justified lines past the limit and past any justified line the
    // paragraph had (75 mm, paragraph 32: 2.405x without the fix, 2.714x
    // with it, the ragged line kept), or trade the ragged line for such
    // lines. The fix may not add a ragged line either.
    const words = 'the colony wakes before you do and the first warm afternoon tells you what the winter has left and it is worth waiting for because honey keeps for years if it is dry one, and you have two colonies where you had one, or one colony *honey*'.split(' ');
    let s = 11;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const para = (n: number) => Array.from({ length: n }, () => words[Math.floor(rnd() * words.length)]).join(' ') + '.';
    const markdown = Array.from({ length: 40 }, (_, i) => para(15 + (i * 7) % 80)).join('\n\n');
    const ragged = (lines: readonly VDTLine[]): number => lines.filter((l) => l.ragged).length;
    let tightened = 0;
    let withRagged = 0;
    for (const width of [74, 75, 76, 77, 82, 84, 88]) {
      const config = (tightenRunts: boolean): PostextConfig => ({
        page: { width: { value: width, unit: 'mm' }, height: { value: 5000, unit: 'mm' }, dpi: 150 },
        layout: { layoutType: 'single' },
        bodyText: { fontFamily: 'serif', fontSize: { value: 10.4, unit: 'pt' }, lineHeight: { value: 14.2, unit: 'pt' }, textAlign: 'justify', maxWordSpacing: MAX, tightenRunts },
      });
      const paragraphs = (on: boolean): VDTBlock[] => buildDocument({ markdown }, config(on)).blocks.filter((b) => b.type === 'paragraph');
      const fixed = paragraphs(true);
      const plain = paragraphs(false);
      fixed.forEach((b, i) => {
        const natural = plain[i]!.lines;
        if (b.lines.length === natural.length) return;
        tightened++;
        if (ragged(natural) > 0) withRagged++;
        const at = `${width} mm, paragraph ${i}`;
        // `loosest` reads `justifiedSpaceRatio`, which a ragged line drops.
        expect(loosest(b.lines), at).toBeLessThanOrEqual(Math.max(MAX, loosest(natural)) + 1e-9);
        expect(ragged(b.lines), at).toBeLessThanOrEqual(ragged(natural));
      });
    }
    expect(tightened).toBeGreaterThan(0);
    // Paragraphs with a ragged line are still fixed when the fix keeps to the bar.
    expect(withRagged).toBeGreaterThan(0);
  }, 30_000);
});
