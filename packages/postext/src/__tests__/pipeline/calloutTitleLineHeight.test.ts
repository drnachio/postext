import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { stripCalloutStylesDefaults } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';
import { renderToHtml } from '../../html-backend';
import type { CalloutStyleConfig, PostextConfig } from '../../types';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../vdt';

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

// EF-182 (screenplay-format), at 72 dpi so a point is a pixel: body 12 pt
// on 12 pt, boxes with no frame, no padding and no gap under the title.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const ZERO = pt(0);
const config = (title: CalloutStyleConfig['titleStyle'] = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(12), lineHeight: pt(12), paragraphSpacing: true, firstLineIndent: ZERO },
  calloutStyles: [{
    id: 'd',
    backgroundEnabled: false,
    padding: { top: ZERO, right: ZERO, bottom: ZERO, left: ZERO },
    titleStyle: { gap: ZERO, ...title },
    marginTop: pt(12),
    marginBottom: pt(12),
    snapToGrid: false,
  }],
  headings: { balancing: { enabled: false } },
});
const MD = 'A paragraph.\n\n:::callout{type="d" title="A"}\nOne line.\n:::\n\n:::callout{type="d" title="B"}\nOne line.\n:::\n\nAfter.';

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, cfg, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const titleOf = (frame: VDTBlock): VDTDesignTextBlock =>
  frame.designOverlay!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
const byText = (doc: VDTDocument, start: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]?.text.startsWith(start))!;

describe('callout titleStyle.lineHeight (EF-182)', () => {
  it('defaults to 1.2em and strips the default', () => {
    expect(resolveAllConfig({ calloutStyles: [{ id: 'x' }] }).calloutStyles[0]!.titleStyle.lineHeight).toEqual({ value: 1.2, unit: 'em' });
    expect(stripCalloutStylesDefaults([{ id: 'x', titleStyle: { lineHeight: { value: 1.2, unit: 'em' } } }])).toEqual([{ id: 'x' }]);
    expect(stripCalloutStylesDefaults([{ id: 'x', titleStyle: { lineHeight: pt(12) } }])).toEqual([{ id: 'x', titleStyle: { lineHeight: pt(12) } }]);
  });

  it('by default the title sits on a line 1.2 times its size (1.4)', () => {
    const doc = build(config());
    const [a] = frames(doc);
    const title = titleOf(a!);
    // 14.4 pt of title and 12 pt of text: 2.4 pt over two lines.
    expect(a!.bbox.height).toBeCloseTo(26.4, 5);
    expect(title.lines[0]!.baselineY - byText(doc, 'A paragraph').lines[0]!.baseline).toBeCloseTo(12 + 12 + 14.4 * 0.8 - 12 * 0.8, 5);
  });

  it('a title on the body leading keeps each box a whole number of lines', () => {
    const doc = build(config({ lineHeight: pt(12) }));
    const [a, b] = frames(doc);
    expect(a!.bbox.height).toBeCloseTo(24, 5);
    expect(b!.bbox.height).toBeCloseTo(24, 5);
    const lead = byText(doc, 'A paragraph').lines[0]!.baseline;
    // The title's baseline lands two lines down (the paragraph spacing and
    // the box's top margin collapse into one line), as a line of text would.
    expect(titleOf(a!).lines[0]!.baselineY - lead).toBeCloseTo(24, 5);
    // …and the text after the boxes stays on the 12 pt grid.
    const after = byText(doc, 'After');
    expect((after.lines[0]!.baseline - lead) % 12).toBeCloseTo(0, 5);
  });

  it('reads em as the title\'s own size, and paints what it lays out', () => {
    const doc = build(config({ fontSize: pt(10), lineHeight: { value: 1, unit: 'em' } }));
    const [a] = frames(doc);
    expect(a!.bbox.height).toBeCloseTo(10 + 12, 5);
    const title = titleOf(a!);
    expect(title.bbox.height).toBeCloseTo(10, 5);
    expect(title.lines[0]!.baselineY - title.bbox.y).toBeCloseTo(8, 5);
    expect(renderToHtml(doc)).toContain('>A<');
  });
});
