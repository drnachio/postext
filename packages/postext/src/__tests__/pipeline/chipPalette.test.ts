import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTDocument, VDTLineSegment } from '../../index';

// EF-87: a section's or a part's palette recolours the chips set on its
// pages, as it recolours headings, bold runs and callout frames.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const lake = (hex = '#2d6a7d') => ({ hex, model: 'hex' as const, paletteId: 'lake' });

const base: PostextConfig = {
  page: { width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  bodyText: { textAlign: 'left', hyphenation: { enabled: false } },
  colorPalette: [{ id: 'lake', name: 'Lake', value: { hex: '#2d6a7d', model: 'hex' } }],
  chipStyles: [{ id: 'end', background: lake(), borderColor: lake(), borderWidth: pt(0.5), color: lake() }],
  headingStyles: [{ id: 'guide', palette: { lake: '#9a5a2e' } }],
};

/** Chip segments on each page, in page order. */
const chipsByPage = (doc: VDTDocument): VDTLineSegment[][] =>
  doc.pages.map((p) => p.columns.flatMap((c) => c.blocks).flatMap((b) => b.lines)
    .flatMap((l) => (l.segments ?? []).filter((s) => s.kind === 'chip')));

describe('EF-87: section and part palettes recolour chips', () => {
  it('a heading style palette recolours the chip fill, outline and text on its pages only', () => {
    const para = 'The end mark :chip[⁠]{style="end"} closes the piece.';
    const markdown = [para, '', '# Five Kinds of Ice {style="guide"}', '', para].join('\n');
    const doc = buildDocument({ markdown }, base);
    const pages = chipsByPage(doc).filter((c) => c.length > 0);
    expect(pages).toHaveLength(2);
    const before = pages[0]![0]!.chip!;
    const inside = pages[1]![0]!.chip!;
    // Outside the section: the base palette value.
    expect(before.background?.toLowerCase()).toBe('#2d6a7d');
    expect(before.borderColor?.toLowerCase()).toBe('#2d6a7d');
    expect(before.color?.toLowerCase()).toBe('#2d6a7d');
    // Inside it: the section's value, on every chip colour.
    expect(inside.background?.toLowerCase()).toBe('#9a5a2e');
    expect(inside.borderColor?.toLowerCase()).toBe('#9a5a2e');
    expect(inside.color?.toLowerCase()).toBe('#9a5a2e');
  });

  it('a part palette recolours chips on the part\'s pages', () => {
    const markdown = [
      '# Zero', '', 'Before :chip[x]{style="end"} words.', '',
      ':::part{number="II" title="Two" palette="lake=#f6c297"}', ':::', '',
      '# One', '', 'After :chip[x]{style="end"} words.',
    ].join('\n');
    const doc = buildDocument({ markdown }, { ...base, headingStyles: [] });
    const chips = chipsByPage(doc).flat();
    expect(chips.map((s) => s.chip!.background?.toLowerCase())).toEqual(['#2d6a7d', '#f6c297']);
  });

  it('never recolours the measured lines a cache shares between pages', () => {
    // The same paragraph before and inside the section: one measurement,
    // shared through the cache — the section's colour must not leak back.
    const para = 'Same words :chip[tag]{style="end"} here.';
    const markdown = [para, '', '# Section {style="guide"}', '', para].join('\n');
    const cache = createMeasurementCache();
    buildDocument({ markdown }, base, cache);
    const doc = buildDocument({ markdown }, base, cache);
    const chips = chipsByPage(doc).flat();
    expect(chips.map((s) => s.chip!.background?.toLowerCase())).toEqual(['#2d6a7d', '#9a5a2e']);
  });

  it('a chip without a text colour of its own keeps inheriting the surrounding text colour', () => {
    const cfg: PostextConfig = { ...base, chipStyles: [{ id: 'end', background: lake(), borderWidth: pt(0) }] };
    const markdown = ['# Section {style="guide"}', '', 'Words :chip[tag]{style="end"} here.'].join('\n');
    const doc = buildDocument({ markdown }, cfg);
    const chip = chipsByPage(doc).flat()[0]!.chip!;
    expect(chip.background?.toLowerCase()).toBe('#9a5a2e');
    expect(chip.color).toBeUndefined();
  });
});
