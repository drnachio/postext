import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';

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
const lake = { hex: LAKE, model: 'hex' as const, paletteId: 'lake' };

// EF-88: the docs said a heading style's `palette` reached the design slots
// of its section's pages only; it recolours the text flow there too, as a
// part's palette does. This pins the documented behaviour.
const config: PostextConfig = {
  page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  colorPalette: [{ id: 'lake', name: 'Lake', value: { hex: LAKE, model: 'hex' } }],
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, { level: 2, color: lake }] },
  headingStyles: [{ id: 'guide', palette: { lake: RUST } }],
  calloutStyles: [{ id: 'note', stripe: { enabled: true, side: 'left', width: pt(3), color: lake } }],
};

const markdown = [
  '# Five kinds of ice {style="guide"}', '', '## Crosshead', '', 'Text.', '', ':::callout{type="note"}', 'Box.', ':::', '',
  '# Plain chapter', '', '## Other crosshead', '', 'Text.',
].join('\n');

const heading = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes(text)))!;

describe('a heading style palette recolours the flow of its section (EF-88)', () => {
  it('a palette-linked heading colour takes the section value inside the section only', () => {
    const doc = buildDocument({ markdown }, config);
    expect(heading(doc, 'Crosshead').color).toBe(RUST);
    expect(heading(doc, 'Other crosshead').color).toBe(LAKE);
  });

  it('a callout stripe linked to the palette follows it too', () => {
    const doc = buildDocument({ markdown }, config);
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    const colours = (frame.designOverlay?.blocks ?? []).flatMap((b) => (b.kind === 'box' ? [b.box.backgroundColor] : []));
    expect(colours).toContain(RUST);
    expect(colours).not.toContain(LAKE);
  });
});
