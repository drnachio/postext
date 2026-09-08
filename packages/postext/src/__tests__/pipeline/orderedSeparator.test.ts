import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveAllConfig } from '../../pipeline/config';
import {
  computeOrderedLevelIndentsPx,
  computeOrderedListRunMetrics,
  resolveOrderedListItemStyle,
} from '../../pipeline/lists';
import { resolveBodyStyle } from '../../pipeline/styles';
import { parseMarkdown } from '../../parse';
import { dimensionToPx } from '../../units';
import { applyPaletteToConfig, stripConfigDefaults } from '../../defaults';
import { resolveOrderedListsConfig, stripOrderedListsDefaults } from '../../defaults/orderedLists';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import type { PostextConfig, VDTBlock } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env): every
// glyph is 7px wide whatever the font, so widths only depend on text length.
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
const em = (value: number) => ({ value, unit: 'em' as const });
const RED = { hex: '#FF0000', model: 'hex' as const };

const base: PostextConfig = {
  page: {
    width: pt(400),
    height: pt(600),
    margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) },
  },
  layout: { layoutType: 'single' },
};

const md = Array.from({ length: 10 }, (_, i) => `${i + 1}. Item ${i + 1}`).join('\n');

function orderedItems(config: PostextConfig): VDTBlock[] {
  const doc = buildDocument({ markdown: md }, config);
  return doc.blocks.filter((b) => b.type === 'listItem' && b.listKind === 'ordered');
}

function px(config: PostextConfig, dim: { value: number; unit: 'em' | 'pt' }): number {
  const r = resolveAllConfig(config);
  const body = resolveBodyStyle(r);
  return dimensionToPx(dim, r.page.dpi, body.fontSizePx);
}

describe('ordered list separator run', () => {
  it('keeps a single number+separator run with the default config', () => {
    const items = orderedItems(base);
    expect(items).toHaveLength(10);
    const colX = items[0]!.bbox.x;
    const gapPx = px(base, em(0.5));
    // '10.' is the widest marker: 3 glyphs × 7px.
    const maxWidth = 21;
    for (let i = 0; i < items.length; i++) {
      const b = items[i]!;
      expect(b.bulletText).toBe(`${i + 1}.`);
      expect(b.separatorText).toBeUndefined();
      expect(b.separatorFontString).toBeUndefined();
      expect(b.separatorColor).toBeUndefined();
      expect(b.separatorX).toBeUndefined();
      // Right-aligned number column; text starts after indent + maxWidth + gap.
      const own = b.bulletText!.length * 7;
      expect(b.bulletOffsetX).toBeCloseTo(colX + (maxWidth - own), 6);
      expect(b.lines[0]!.bbox.x).toBeCloseTo(colX + maxWidth + gapPx, 6);
    }
  });

  it('treats a separator style equal to the number style as the default', () => {
    const r = resolveAllConfig(base);
    const same: PostextConfig = {
      ...base,
      orderedLists: {
        separatorFontFamily: r.orderedLists.fontFamily,
        separatorFontWeight: r.orderedLists.fontWeight,
        separatorItalic: r.orderedLists.italic,
        separatorColor: { ...r.orderedLists.color },
        separatorGap: em(0),
      },
    };
    const a = orderedItems(base);
    const b = orderedItems(same);
    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.bulletText).toBe(a[i]!.bulletText);
      expect(b[i]!.separatorText).toBeUndefined();
      expect(b[i]!.bulletOffsetX).toBe(a[i]!.bulletOffsetX);
      expect(b[i]!.lines[0]!.bbox).toEqual(a[i]!.lines[0]!.bbox);
    }
  });

  it('draws a distinct separator run after the right-aligned number, with the gap', () => {
    const cfg: PostextConfig = {
      ...base,
      orderedLists: {
        fontFamily: 'Optima',
        separatorFontFamily: 'DIN Pro',
        separatorColor: RED,
        separatorGap: pt(2),
      },
    };
    const items = orderedItems(cfg);
    const colX = items[0]!.bbox.x;
    const sepGapPx = px(cfg, pt(2));
    const listGapPx = px(cfg, em(0.5));
    const maxNumberWidth = 14; // '10'
    const sepWidth = 7; // '.'
    for (let i = 0; i < items.length; i++) {
      const b = items[i]!;
      expect(b.bulletText).toBe(`${i + 1}`);
      expect(b.bulletFontString).toContain('Optima');
      expect(b.separatorText).toBe('.');
      expect(b.separatorFontString).toContain('DIN Pro');
      expect(b.separatorFontString).not.toContain('Optima');
      expect(b.separatorColor).toBe('#FF0000');
      const own = b.bulletText!.length * 7;
      // Numbers stay right-aligned on the number column…
      expect(b.bulletOffsetX).toBeCloseTo(colX + (maxNumberWidth - own), 6);
      // …and the separator follows the number after `separatorGap`, so it
      // lands in the same column for every item.
      expect(b.separatorX).toBeCloseTo(b.bulletOffsetX! + own + sepGapPx, 6);
      expect(b.separatorX).toBeCloseTo(colX + maxNumberWidth + sepGapPx, 6);
      // Text starts after the whole marker column + list gap.
      expect(b.lines[0]!.bbox.x).toBeCloseTo(colX + maxNumberWidth + sepGapPx + sepWidth + listGapPx, 6);
    }
  });

  it('splits the run for a colour-only or gap-only difference', () => {
    const colourOnly = orderedItems({ ...base, orderedLists: { separatorColor: RED } });
    expect(colourOnly[0]!.bulletText).toBe('1');
    expect(colourOnly[0]!.separatorText).toBe('.');
    expect(colourOnly[0]!.separatorFontString).toBe(colourOnly[0]!.bulletFontString);
    const gapOnly = orderedItems({ ...base, orderedLists: { separatorGap: em(0.2) } });
    expect(gapOnly[0]!.separatorText).toBe('.');
    expect(gapOnly[0]!.separatorX! - gapOnly[0]!.bulletOffsetX!).toBeCloseTo(7 + px(base, em(0.2)), 6);
  });

  it('does not split an empty separator', () => {
    const items = orderedItems({ ...base, orderedLists: { separator: '', separatorColor: RED } });
    expect(items[0]!.bulletText).toBe('1');
    expect(items[0]!.separatorText).toBeUndefined();
  });

  it('measures the marker column (number + gap + separator) for the level cascade', () => {
    const cfg: PostextConfig = { ...base, orderedLists: { separatorColor: RED, separatorGap: pt(2) } };
    const r = resolveAllConfig(cfg);
    const body = resolveBodyStyle(r);
    const blocks = parseMarkdown('1. a\n2. b\n   1. nested\n   2. nested');
    const metrics = computeOrderedListRunMetrics(blocks, r, body.fontSizePx);
    const sepGapPx = dimensionToPx(pt(2), r.page.dpi, body.fontSizePx);
    expect(metrics.maxWidthByDepth.get(1)).toBeCloseTo(7 + sepGapPx + 7, 6);
    const indents = computeOrderedLevelIndentsPx(r, body.fontSizePx, metrics.maxWidthByDepth);
    const listGapPx = dimensionToPx(r.orderedLists.gap, r.page.dpi, body.fontSizePx);
    expect(indents[1]).toBeCloseTo(indents[0]! + 7 + sepGapPx + 7 + listGapPx, 6);
    const first = [...metrics.perBlock.values()][0]!;
    const style = resolveOrderedListItemStyle(1, r, indents, first);
    expect(style.bullet.bulletWidthPx).toBeCloseTo(7 + sepGapPx + 7, 6);
    expect(style.bullet.separatorOffsetPx).toBeCloseTo(7 + sepGapPx, 6);
  });
});

describe('ordered list separator config', () => {
  const body = resolveBodyTextConfig({ fontFamily: 'Literata' });

  it('inherits the number style per level and honours list-wide separator settings', () => {
    const r = resolveOrderedListsConfig({ levels: [{ level: 2, fontFamily: 'Optima', color: RED }] }, body);
    expect(r.separatorFontFamily).toBe('Literata');
    expect(r.separatorFontWeight).toBe(r.fontWeight);
    expect(r.separatorColor).toEqual(r.color);
    expect(r.separatorGap).toEqual(em(0));
    expect(r.levels[0]!.separatorFontFamily).toBe('Literata');
    expect(r.levels[1]!.separatorFontFamily).toBe('Optima');
    expect(r.levels[1]!.separatorColor).toEqual(RED);
    const explicit = resolveOrderedListsConfig(
      { separatorFontFamily: 'DIN Pro', levels: [{ level: 2, fontFamily: 'Optima' }, { level: 3, separatorFontFamily: 'Inter' }] },
      body,
    );
    expect(explicit.levels[1]!.separatorFontFamily).toBe('DIN Pro');
    expect(explicit.levels[2]!.separatorFontFamily).toBe('Inter');
  });

  it('strips only the static separator gap default and round-trips explicit values', () => {
    expect(stripOrderedListsDefaults({ separatorGap: em(0) })).toBeUndefined();
    const cfg = {
      separatorFontFamily: 'DIN Pro',
      separatorFontWeight: 700,
      separatorItalic: false,
      separatorColor: RED,
      separatorGap: pt(2),
      levels: [{ level: 2, separatorColor: RED, separatorGap: em(0.1) }],
    };
    expect(stripOrderedListsDefaults(cfg)).toEqual(cfg);
    expect(stripConfigDefaults({ orderedLists: cfg }).orderedLists).toEqual(cfg);
  });

  it('resolves palette references of the separator colour', () => {
    const palette = [{ id: 'accent', name: 'Accent', value: { hex: '#00FF00', model: 'hex' as const } }];
    const out = applyPaletteToConfig({
      colorPalette: palette,
      orderedLists: {
        separatorColor: { hex: '#000000', model: 'hex', paletteId: 'accent' },
        levels: [{ level: 2, separatorColor: { hex: '#000000', model: 'hex', paletteId: 'accent' } }],
      },
      parts: { bodyStyle: { orderedLists: { separatorColor: { hex: '#000000', model: 'hex', paletteId: 'accent' } } } },
    })!;
    expect(out.orderedLists!.separatorColor!.hex).toBe('#00FF00');
    expect(out.orderedLists!.levels![0]!.separatorColor!.hex).toBe('#00FF00');
    expect(out.parts!.bodyStyle!.orderedLists!.separatorColor!.hex).toBe('#00FF00');
  });
});
