import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { renderBlock } from '../../canvas-backend/blockRender.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDocument } from '../../vdt.js';

// #662: a note at the foot of its column whose runt the engine takes up by
// setting it one line shorter with a little negative tracking
// (`bodyText.tightenRunts`, `maxRuntTracking`) is measured with that
// tracking, so it must be painted with it too. The flow and the boxes stamp
// the tracking on their blocks (EF-111); the note blocks did not, so a
// one-line note printed its words at their natural widths on the places
// measured for the tightened ones: the word spaces closed up until the
// words joined.

// Widths that vary by character, so the breaks fall in many places.
const W = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if (ch === ' ') return 0.5;
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px.
const config = (footnotes: PostextConfig['footnotes'] = {}, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  page: { width: pt(160), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, ...bodyText },
  footnotes: { fontSize: pt(10), lineHeight: pt(14), ...footnotes },
});
// Two lines set naturally, the second a one-word runt; one with 5‰ of tracking.
const NOTE = 'and within a is its within then';
const MD = `The text cites a work.[^n]\n\n[^n]: ${NOTE}`;

const note = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.footnoteNote !== undefined)!;

describe('runt tracking in a note at the column foot (#662)', () => {
  it('a ragged note is set a line shorter with negative tracking, and its block carries it', () => {
    const tightened = note(buildDocument({ markdown: MD }, config({ textAlign: 'left' })));
    expect(tightened.lines.map((l) => l.text)).toEqual([`1\u2002${NOTE}`]);
    expect(tightened.letterSpacing).toBeCloseTo(-0.05, 5);
    // Measured with the tracking: the line fits its column.
    expect(tightened.lines[0]!.bbox.width).toBeLessThanOrEqual(tightened.bbox.width);
    const natural = note(buildDocument({ markdown: MD }, config({ textAlign: 'left' }, { maxRuntTracking: 0 })));
    expect(natural.lines.map((l) => l.text)).toEqual([`1\u2002${NOTE.slice(0, -5)}`, 'then']);
    expect(natural.letterSpacing).toBeUndefined();
  });

  it('the canvas and the HTML paint the note with it', () => {
    const doc = buildDocument({ markdown: MD }, config({ textAlign: 'left' }));
    const block = note(doc);
    const seen: string[] = [];
    const ctx = {
      font: '', fillStyle: '', textBaseline: 'alphabetic', _ls: '0px',
      get letterSpacing() { return this._ls; },
      set letterSpacing(v: string) { this._ls = v; },
      fillText(text: string) { seen.push(`${this._ls}:${text}`); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    renderBlock(ctx as unknown as CanvasRenderingContext2D, block, block.bbox.width, block.bbox.x);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.startsWith('-0.05px:'))).toBe(true);
    expect(renderToHtml(doc)).toMatch(/class="pt-line"[^>]*letter-spacing:-0\.05px;/);
  });

  it('a note that needs no tightening carries no tracking', () => {
    const block = note(buildDocument({ markdown: 'The text cites a work.[^n]\n\n[^n]: A short note.' }, config({ textAlign: 'left' })));
    expect(block.lines).toHaveLength(1);
    expect(block.letterSpacing).toBeUndefined();
  });
});
