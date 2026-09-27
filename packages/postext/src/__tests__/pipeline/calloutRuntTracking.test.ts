import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { renderBlock } from '../../canvas-backend/blockRender';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

// EF-111: a paragraph whose runt the engine takes up by setting it one line
// shorter with a little negative tracking (`bodyText.maxRuntTracking`) is
// measured with that tracking, so it must be painted with it too. The flow
// stamped the tracking on its block; a paragraph inside a box did not, so
// the box printed its lines untracked: justified lines with crushed spaces
// and a last line running past the measure.

// Widths that vary by character, so the breaks fall in many places.
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px. A box with no padding, so its text has the column's measure.
const CONFIG: PostextConfig = {
  page: { width: pt(160), height: pt(900), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false } },
  calloutStyles: [{ id: 'n', padding: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } }],
};
// Four lines set naturally, the last a runt; three with 10‰ of tracking.
const TEXT = 'and within a is its within lets left its osmosis a left and within a is its within lets left its.';

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;

describe('runt tracking inside a box (EF-111)', () => {
  it('the flow sets the paragraph short with negative tracking', () => {
    const flow = paragraph(buildDocument({ markdown: TEXT }, CONFIG));
    expect(flow.lines).toHaveLength(3);
    expect(flow.letterSpacing).toBeCloseTo(-0.1, 5);
    const untightened = paragraph(buildDocument({ markdown: TEXT }, { ...CONFIG, bodyText: { ...CONFIG.bodyText, maxRuntTracking: 0 } }));
    expect(untightened.lines.length).toBeGreaterThan(3);
  });

  it('a box paragraph carries the tracking it was measured with', () => {
    const flow = paragraph(buildDocument({ markdown: TEXT }, CONFIG));
    const boxed = paragraph(buildDocument({ markdown: `:::callout{type="n"}\n${TEXT}\n:::` }, CONFIG));
    expect(boxed.containerId).toBeDefined();
    expect(boxed.lines.map((l) => l.text)).toEqual(flow.lines.map((l) => l.text));
    expect(boxed.letterSpacing).toBeCloseTo(-0.1, 5);
  });

  it('the canvas and the HTML paint the box paragraph with it', () => {
    const doc = buildDocument({ markdown: `:::callout{type="n"}\n${TEXT}\n:::` }, CONFIG);
    const boxed = paragraph(doc);
    const seen: string[] = [];
    const ctx = {
      font: '', fillStyle: '', textBaseline: 'alphabetic', _ls: '0px',
      get letterSpacing() { return this._ls; },
      set letterSpacing(v: string) { this._ls = v; },
      fillText(text: string) { seen.push(`${this._ls}:${text}`); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    renderBlock(ctx as unknown as CanvasRenderingContext2D, boxed, boxed.bbox.width, boxed.bbox.x);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.startsWith('-0.1px:'))).toBe(true);
    expect(renderToHtml(doc)).toMatch(/class="pt-line"[^>]*letter-spacing:-0\.1px;/);
  });
});
