import { describe, it, expect } from 'vitest';
import { buildDocument } from '../index';
import { createMeasurementCache } from '../measure';
import type { ColorValue, PostextConfig } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const BODY = 'Body text that runs on for a while. '.repeat(20);
const MD = `# News\n\n${BODY}\n\n# Business {style="business"}\n\n${BODY}\n\n# Sport\n\n${BODY}`;

const config = (backgroundColor: ColorValue): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, backgroundColor },
  colorPalette: [
    { id: 'paper', name: 'paper', value: { hex: '#f6f4ef', model: 'hex' } },
    { id: 'ink', name: 'ink', value: { hex: '#111111', model: 'hex' } },
  ],
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [{ id: 'business', palette: { paper: '#f2d3c0' } }],
});

describe('a section palette gives its pages their own paper (#506)', () => {
  it('paints the section pages in the colour the page colour links to', () => {
    const doc = buildDocument({ markdown: MD }, config({ hex: '#f6f4ef', model: 'hex', paletteId: 'paper' }), createMeasurementCache());
    const bg = doc.pages.map((p) => p.background);
    expect(bg[0]).toBeUndefined();
    expect(bg).toContain('#f2d3c0');
    expect(bg[bg.length - 1]).toBeUndefined();
  });

  it('matches an unlinked page colour by value, as the flow is matched', () => {
    const doc = buildDocument({ markdown: MD }, config({ hex: '#f6f4ef', model: 'hex' }), createMeasurementCache());
    expect(doc.pages.some((p) => p.background === '#f2d3c0')).toBe(true);
  });

  it('leaves every page on the document colour without an override', () => {
    const doc = buildDocument({ markdown: MD.replace(' {style="business"}', '') }, config({ hex: '#f6f4ef', model: 'hex', paletteId: 'paper' }), createMeasurementCache());
    expect(doc.pages.every((p) => p.background === undefined)).toBe(true);
  });
});
