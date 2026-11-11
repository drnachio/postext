import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { paletteTintHex } from '../../../defaults/shared.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTDocument } from '../../../vdt.js';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const LAKE = '#2d6a7d';
const RUST = '#9a5a2e';

// A callout ground at 8 % of the main colour: it follows the entry, as a
// whole palette change and as a section's palette.
const config = (main: string): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  colorPalette: [{ id: 'main-color', name: 'Main', value: { hex: main, model: 'hex' } }],
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [{ id: 'guide', palette: { 'main-color': RUST } }],
  calloutStyles: [{ id: 'eq', background: { hex: '#eeeeee', model: 'hex', paletteId: 'main-color', tint: 8 } }],
});

const markdown = [
  '# Plain chapter', '', ':::callout{type="eq"}', 'Box.', ':::', '',
  '# Guided chapter {style="guide"}', '', ':::callout{type="eq"}', 'Box.', ':::',
].join('\n');

const grounds = (doc: VDTDocument): string[] =>
  doc.blocks.filter((b) => b.type === 'callout').map((frame) =>
    (frame.designOverlay?.blocks ?? []).flatMap((b) => (b.kind === 'box' ? [b.box.backgroundColor] : []))[0]!);

describe('a palette-linked colour at a tint (ColorValue.tint)', () => {
  it('paints the entry at that strength over the paper', () => {
    expect(paletteTintHex('#295aa3', 8)).toBe('#eef2f8');
    expect(paletteTintHex('#295aa3', 100)).toBe('#295aa3');
    expect(paletteTintHex('#295aa3', undefined)).toBe('#295aa3');
    expect(paletteTintHex('#295aa3', 0)).toBe('#ffffff');
  });

  it('a callout ground follows the main colour, and a section palette, at its tint', () => {
    const doc = buildDocument({ markdown }, config(LAKE));
    expect(grounds(doc)).toEqual([paletteTintHex(LAKE, 8), paletteTintHex(RUST, 8)]);
  });

  it('changing the palette entry changes the ground', () => {
    const doc = buildDocument({ markdown }, config('#7a1f4a'));
    expect(grounds(doc)[0]).toBe(paletteTintHex('#7a1f4a', 8));
  });
});
