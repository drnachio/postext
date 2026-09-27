import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { resolveHeadingsConfig } from '../../defaults/headings';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/headerFooter';
import { buildDocument } from '../../pipeline';
import { CONFIG_VERSION, migrateConfig, pinLegacyDropCapSize } from '../../bundle';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, DesignTextElement, PostextConfig } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character is 7px wide whatever the font.
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

const DPI = 72; // 1pt = 1px.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const container = { x: 0, y: 0, width: 300, height: 400 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders = (palette?: Record<string, string>): DesignPlaceholderContext => ({
  kind: 'header',
  page: stubPage,
  allPages: [stubPage],
  metadata: {},
  chapterTitleByPageIndex: [],
  ...(palette ? { partPaletteByPageIndex: [palette] } : {}),
});

const LEAD = 'Long before there were title pages, there were readers of the scrolls.';
const text = (extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text',
  id: 'lead',
  content: LEAD,
  fontSize: pt(10),
  lineHeight: 1.5,
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200) } },
  ...extra,
} as DesignElement);

const layout = (el: DesignElement, palette?: Record<string, string>): ResolvedTextPrimitive[] =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders: placeholders(palette) }, 0)
    .primitives as ResolvedTextPrimitive[];

describe('drop cap whatever the overflow (EF-106)', () => {
  for (const overflow of ['ellipsis-end', 'ellipsis-start', 'ellipsis-middle', 'clip'] as const) {
    it(`sets the initial and wraps the text when overflow is '${overflow}'`, () => {
      const [main, cap] = layout(text({ overflow, dropCap: { lines: 2 } }));
      expect(cap?.lines[0]!.text).toBe('L');
      expect(main!.lines.length).toBeGreaterThan(1);
      expect(main!.lines[0]!.text.startsWith('ong ')).toBe(true);
      expect(main!.lines.every((l) => !l.text.includes('…'))).toBe(true);
    });
  }

  it('leaves a text without a drop cap on one truncated line', () => {
    const [main, cap] = layout(text({ overflow: 'ellipsis-end' }));
    expect(cap).toBeUndefined();
    expect(main!.lines).toHaveLength(1);
    expect(main!.lines[0]!.text.endsWith('…')).toBe(true);
  });
});

describe('drop cap colour under a section palette (EF-107)', () => {
  const red = { hex: '#8c1c13', model: 'hex' as const, paletteId: 'accent' };

  it('recolours a palette-linked drop cap like the rest of the design', () => {
    const [main, cap] = layout(text({ overflow: 'wrap', color: red, dropCap: { lines: 2, color: red } }), { accent: '#24427a' });
    expect(main!.color).toBe('#24427a');
    expect(cap!.color).toBe('#24427a');
  });

  it('keeps a drop cap colour that names no palette entry', () => {
    const [, cap] = layout(text({ overflow: 'wrap', dropCap: { lines: 2, color: { hex: '#8c1c13', model: 'hex' } } }), { accent: '#24427a' });
    expect(cap!.color).toBe('#8c1c13');
  });

  it('follows a heading style\'s palette in the document', () => {
    const config: PostextConfig = {
      page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#8c1c13', model: 'hex' } }],
      headingStyles: [{
        id: 'blue', span: 'page', palette: { accent: '#24427a' },
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [
              { kind: 'text', id: 'kicker', content: 'Chapter', fontSize: pt(9), overflow: 'wrap', color: red, placement: { anchor: { to: 'container', edge: 'top-left' } } },
              {
                kind: 'text', id: 'lead', content: '{attr.lead}', fontSize: pt(10), overflow: 'wrap', dropCap: { lines: 2, color: red },
                placement: { anchor: { to: '#kicker', edge: 'below' }, size: { width: 'fill' } },
              },
            ],
          },
        },
      }],
    };
    const doc = buildDocument({ markdown: `# Title {style="blue" lead="${LEAD}"}\n\nText.` }, config);
    const blocks = doc.pages[0]!.openerBand!.blocks.filter((b): b is VDTDesignTextBlock => b.kind === 'text');
    const kicker = blocks.find((b) => b.lines[0]?.text === 'Chapter')!;
    const cap = blocks.find((b) => b.lines[0]?.text === 'L')!;
    expect(kicker.color).toBe('#24427a');
    expect(cap.color).toBe('#24427a');
  });
});

describe('drop cap in an opener\'s reserved height (EF-108)', () => {
  const heading = { titleText: 'T', formattedNumber: '', chapterNumber: '' };
  // 12pt, leading 1.5 (18px), 200px wide: two lines of the lead.
  const lead = (dropCap?: DesignTextElement['dropCap']): DesignElement => ({
    kind: 'text', id: 'lead', content: 'An opening lead of two lines that wraps once here.', fontSize: pt(12), lineHeight: 1.5,
    overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200) } },
    ...(dropCap ? { dropCap } : {}),
  } as DesignElement);
  const levelOf = (el: DesignElement) => resolveHeadingsConfig({
    levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [el] } } }],
  }).levels.find((l) => l.level === 1)!;
  const measure = (el: DesignElement) => measureHeadingAdvancedDesignHeight(levelOf(el), heading, 300, DPI, {}, 0);

  it('reserves no room under the paragraph for a large initial', () => {
    const without = measure(lead());
    expect(without).toBeCloseTo(36, 5);
    expect(measure(lead({ lines: 2, fontSize: pt(40) }))).toBeCloseTo(without, 5);
    expect(measure(lead({ lines: 2 }))).toBeCloseTo(without, 5);
  });

  it('still reserves a raised initial that stands above the text and the lines it spans', () => {
    // A one-line initial of 40pt stands on the first baseline: nothing below it.
    expect(measure(lead({ lines: 1, fontSize: pt(40) }))).toBeCloseTo(36, 5);
  });
});

describe('default drop cap size (EF-127)', () => {
  // 12pt text, leading 17/12 (17px): the initial spans `lines` lines.
  const capOf = (lines: number) => layout(text({
    content: `${LEAD} ${LEAD} ${LEAD}`, fontSize: pt(12), lineHeight: pt(17), overflow: 'wrap', dropCap: { lines },
  }));

  for (const lines of [2, 3, 5]) {
    it(`lines ${lines}: the initial\'s cap height reaches the first line\'s capitals`, () => {
      const [main, cap] = capOf(lines);
      const expected = 12 + ((lines - 1) * 17) / 0.72;
      expect(cap!.fontSizePx).toBeCloseTo(expected, 5);
      // Cap tops: the initial's (0.72 of its size above its baseline) and
      // the first line's (0.72 of the text size above the first baseline).
      const capBaseline = cap!.y + cap!.lines[0]!.baselineY;
      const firstBaseline = main!.y + main!.lines[0]!.baselineY;
      expect(capBaseline - 0.72 * cap!.fontSizePx).toBeCloseTo(firstBaseline - 0.72 * 12, 5);
      // Its foot stands on the baseline of the last line it spans.
      expect(capBaseline).toBeCloseTo(main!.y + main!.lines[lines - 1]!.baselineY, 5);
    });
  }

  it('lines 1: the initial is set at the text size', () => {
    expect(capOf(1)[1]!.fontSizePx).toBeCloseTo(12, 5);
  });

  it('an explicit size still wins', () => {
    const [, cap] = layout(text({ overflow: 'wrap', dropCap: { lines: 3, fontSize: pt(50) } }));
    expect(cap!.fontSizePx).toBe(50);
  });
});

describe('drop cap size in configurations stored before postext 1.5 (EF-127 pin)', () => {
  const withCap = (el: Partial<DesignTextElement>): PostextConfig => ({
    headings: {
      levels: [{
        level: 1,
        advancedDesign: { enabled: true, slot: { elements: [text({ overflow: 'wrap', ...el })] } },
      }],
    },
  });
  const capOf = (config: PostextConfig) => config.headings!.levels![0]!.advancedDesign!.slot!.elements[0] as DesignTextElement;

  it('writes out the size 1.4 set a drop cap with no size at', () => {
    // Leading 1.5 × 10pt, three lines: 3 × 15 / 0.72 pt.
    const pinned = pinLegacyDropCapSize(withCap({ lineHeight: 1.5, dropCap: { lines: 3 } }));
    expect(capOf(pinned).dropCap!.fontSize!.unit).toBe('pt');
    expect(capOf(pinned).dropCap!.fontSize!.value).toBeCloseTo((3 * 15) / 0.72, 9);
    // An absolute leading keeps its unit; the default two lines.
    const abs = pinLegacyDropCapSize(withCap({ lineHeight: { value: 17, unit: 'pt' }, dropCap: {} }));
    expect(capOf(abs).dropCap!.fontSize).toEqual({ value: (2 * 17) / 0.72, unit: 'pt' });
  });

  it('lays the pinned cap out at the size 1.4 did', () => {
    const el = text({ fontSize: pt(12), lineHeight: pt(17), overflow: 'wrap', dropCap: { lines: 5 }, content: `${LEAD} ${LEAD} ${LEAD}` });
    const pinned = capOf(pinLegacyDropCapSize({ headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [el] } } }] } }));
    const [, cap] = layout(pinned as DesignElement);
    expect(cap!.fontSizePx).toBeCloseTo((5 * 17) / 0.72, 9);
  });

  it('reads back to the very pixel 1.4 set, at the document\'s resolution', () => {
    // 10.5pt text, leading 1.333, three lines, at 300 dpi.
    const el = { fontSize: pt(10.5), lineHeight: 1.333, overflow: 'wrap', dropCap: { lines: 3 } } as Partial<DesignTextElement>;
    const pinned = pinLegacyDropCapSize({ page: { dpi: 300 }, ...withCap(el) });
    const size = capOf(pinned).dropCap!.fontSize!;
    const fontSizePx = (10.5 / 72) * 300;
    const legacyPx = (3 * (fontSizePx * 1.333)) / 0.72;
    expect(size.unit).toBe('pt');
    expect((size.value / 72) * 300).toBe(legacyPx);
  });

  it('leaves a cap with a size, and a configuration with no cap, as they are', () => {
    const sized = withCap({ dropCap: { lines: 2, fontSize: pt(30) } });
    expect(pinLegacyDropCapSize(sized)).toBe(sized);
    const none: PostextConfig = { header: { elements: [text()] } };
    expect(pinLegacyDropCapSize(none)).toBe(none);
  });

  it('pins older configurations only, wherever the cap sits', () => {
    const header: PostextConfig = { header: { elements: [text({ overflow: 'wrap', dropCap: { lines: 2 } })] } };
    const migrated = migrateConfig(header, 5);
    expect((migrated.header!.elements[0] as DesignTextElement).dropCap!.fontSize).toBeDefined();
    expect(migrateConfig(header, CONFIG_VERSION)).toBe(header);
    const styled: PostextConfig = { headingStyles: [{ id: 's', advancedDesign: { enabled: true, slot: { elements: [text({ dropCap: {} })] } } }] };
    const pinnedStyle = migrateConfig(styled, undefined, { content: '# Plain' });
    expect((pinnedStyle.headingStyles![0]!.advancedDesign!.slot!.elements[0] as DesignTextElement).dropCap!.fontSize).toBeDefined();
  });
});
