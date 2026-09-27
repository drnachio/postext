import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveChipStylesConfig, stripChipStylesDefaults } from '../../defaults/chipStyles';
import { createMeasurementCache } from '../../measure';
import { renderToHtml } from '../../html-backend';
import type { ChipStyleConfig, PostextConfig, VDTDocument, VDTLineSegment } from '../../index';

// Deterministic measurement that scales with the font size: every glyph is
// half an em wide (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: s.length * (m ? Number(m[1]) : 16) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// At 72 dpi a point is a pixel: the chip text is 10 px.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
const config = (chip: Partial<ChipStyleConfig>): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false } },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', hyphenation: { enabled: false } },
  chipStyles: [{ id: 'b', borderWidth: pt(0), paddingY: em(0.1), ...chip }],
});
const chipOf = (doc: VDTDocument): NonNullable<VDTLineSegment['chip']> =>
  doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.kind === 'chip')!.chip!;
const build = (cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: 'Answer :chip[A]{style="b"} here.' }, cfg, createMeasurementCache());

describe('chip paddingTop / paddingBottom (EF-172)', () => {
  it('follow paddingY when unset (1.4), and are kept when set', () => {
    const [r] = resolveChipStylesConfig([{ id: 'b' }]);
    expect(r!.paddingTop).toBeUndefined();
    expect(r!.paddingBottom).toBeUndefined();
    expect(stripChipStylesDefaults([{ id: 'b', paddingTop: em(0.2) }])).toEqual([{ id: 'b', paddingTop: em(0.2) }]);
    const chip = chipOf(build(config({})));
    // 0.8 em + 0.1 em above, 0.25 em + 0.1 em below.
    expect(chip.ascent).toBeCloseTo(9, 5);
    expect(chip.descent).toBeCloseTo(3.5, 5);
  });

  it('pad the top and the bottom of the band apart', () => {
    const chip = chipOf(build(config({ paddingTop: em(0.2), paddingBottom: em(0.02) })));
    expect(chip.ascent).toBeCloseTo(10, 5);
    expect(chip.descent).toBeCloseTo(2.7, 5);
    // The box's middle rises from 0.275 em above the baseline to 0.365 em,
    // the middle of a capital 0.73 em tall.
    expect((chip.ascent - chip.descent) / 2 / 10).toBeCloseTo(0.365, 5);
  });

  it('one side set keeps paddingY on the other', () => {
    const chip = chipOf(build(config({ paddingY: em(0.15), paddingBottom: em(0) })));
    expect(chip.ascent).toBeCloseTo(9.5, 5);
    expect(chip.descent).toBeCloseTo(2.5, 5);
  });

  it('never changes the line pitch, and paints the box it lays out', () => {
    const plain = build(config({}));
    const padded = build(config({ paddingTop: em(0.4), paddingBottom: em(0.3) }));
    const line = (d: VDTDocument) => d.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;
    expect(line(padded).bbox.height).toBeCloseTo(line(plain).bbox.height, 5);
    expect(line(padded).baseline).toBeCloseTo(line(plain).baseline, 5);
    const chip = chipOf(padded);
    expect(renderToHtml(padded)).toContain(`height:${(chip.ascent + chip.descent).toFixed(3)}px`);
  });
});
