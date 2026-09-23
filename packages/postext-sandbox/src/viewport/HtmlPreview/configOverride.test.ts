import { describe, it, expect, vi } from 'vitest';
import type { PostextConfig } from 'postext';
import { buildHtmlConfigOverride, partTitlesOf } from './configOverride';

// No canvas under node: every glyph measures 10px.
vi.mock('postext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('postext')>()),
  measureGlyphWidth: (text: string) => text.length * 10,
}));

const mm = (value: number) => ({ value, unit: 'mm' as const });

const base: PostextConfig = {
  headings: {
    levels: [
      { level: 1, breakBefore: { enabled: true, parity: 'odd' } },
      { level: 2, breakBefore: { enabled: true, parity: 'always-even' } },
    ],
  },
  parts: {
    breakBefore: { parity: 'odd' },
    breakAfter: { enabled: true, parity: 'even' },
    margins: { top: mm(76), bottom: mm(20), left: mm(43), right: mm(25), mirror: true },
  },
  header: { elements: [{ kind: 'rule', id: 'r', direction: 'horizontal', color: { hex: '#000', model: 'hex' }, thickness: mm(0.2), placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
};

const opts = {
  fontScale: 1,
  columnMode: 'multi' as const,
  pageWidthPx: 800,
  layoutType: 'double' as const,
  viewportHeightPx: 900,
  locale: 'es',
  optimalLineBreaking: false,
};

describe('buildHtmlConfigOverride', () => {
  it('keeps chapter and part page breaks but drops their parity', () => {
    const out = buildHtmlConfigOverride(base, opts);
    const levels = out.headings!.levels!;
    expect(levels.find((l) => l.level === 1)!.breakBefore).toEqual({ enabled: true, parity: 'any' });
    expect(levels.find((l) => l.level === 2)!.breakBefore).toEqual({ enabled: true, parity: 'any' });
    expect(out.parts!.breakBefore).toEqual({ parity: 'any' });
    // The blank verso after a part divider is a leaf's business.
    expect(out.parts!.breakAfter).toEqual({ enabled: false, parity: 'any' });
  });

  it('sets the part title as type at the top of its scroll unit', () => {
    const out = buildHtmlConfigOverride(
      { ...base, headings: { levels: [{ level: 1, fontSize: { value: 20, unit: 'pt' }, lineHeight: { value: 30, unit: 'pt' } }] } },
      opts,
    );
    const title = out.parts!.design!.elements[0]!;
    expect(title.id).toBe('htmlViewerPartTitle');
    expect(title.placement.anchor).toEqual({ to: 'container', edge: 'top-left' });
    // Two lines of the H1 face at 144 dpi (30pt → 60px), and the body
    // starts half a line below the band so it never lands over the title.
    expect(title.placement.size).toEqual({ width: 'fill', height: { value: 120, unit: 'px' } });
    expect(out.parts!.margins).toEqual({
      top: { value: 150, unit: 'px' },
      bottom: { value: 0, unit: 'px' },
      left: { value: 0, unit: 'px' },
      right: { value: 0, unit: 'px' },
    });
  });

  it('leads a part title on a grid-step H1 line height at 1.2, not the step', () => {
    // A 12pt heading grid under 30pt type: the title keeps clear of the
    // part's content by its drawn leading (30pt → 60px × 1.2 = 72px).
    const out = buildHtmlConfigOverride(
      {
        ...base,
        headings: {
          lineHeight: { value: 12, unit: 'pt' },
          levels: [{ level: 1, fontSize: { value: 30, unit: 'pt' } }],
        },
      },
      opts,
    );
    const title = out.parts!.design!.elements[0]!;
    expect(title.kind === 'text' && title.lineHeight).toBeCloseTo(1.2);
    expect(title.placement.size).toEqual({ width: 'fill', height: { value: 144, unit: 'px' } });
    expect(out.parts!.margins!.top!.value).toBeCloseTo(180);
  });

  it('makes the part band as tall as its longest title', () => {
    const cfg: PostextConfig = {
      ...base,
      headings: { levels: [{ level: 1, fontSize: { value: 20, unit: 'pt' }, lineHeight: { value: 30, unit: 'pt' } }] },
    };
    // Forced breaks: four lines.
    const out = buildHtmlConfigOverride(cfg, { ...opts, partTitles: ['I Uno', 'II Uno\nDos\nTres\nCuatro'] });
    expect(out.parts!.design!.elements[0]!.placement.size).toEqual({ width: 'fill', height: { value: 240, unit: 'px' } });
    expect(out.parts!.margins!.top!.value).toBe(270);
    // A one-line title wraps on a narrow page: 16 words of 90px + spaces
    // over 400px take four lines of four.
    const long = Array.from({ length: 16 }, () => 'palabrota').join(' ');
    const narrow = buildHtmlConfigOverride(cfg, { ...opts, pageWidthPx: 400, partTitles: [long] });
    expect(narrow.parts!.design!.elements[0]!.placement.size).toEqual({ width: 'fill', height: { value: 240, unit: 'px' } });
  });

  it('sends a leaf-relative side column to the right margin in vertical scroll', () => {
    const oneAndHalf: PostextConfig = { ...base, layout: { layoutType: 'oneAndHalf', sideColumnSide: 'inner' } };
    const single = buildHtmlConfigOverride(oneAndHalf, { ...opts, columnMode: 'single', layoutType: 'oneAndHalf' });
    expect(single.layout!.sideColumnSide).toBe('right');
    // The page views still have a spine to mirror against.
    const multi = buildHtmlConfigOverride(oneAndHalf, { ...opts, layoutType: 'oneAndHalf' });
    expect(multi.layout!.sideColumnSide).toBe('left');
  });

  const coverStyle: NonNullable<PostextConfig['headingStyles']>[number] = {
    id: 'cover',
    span: 'page' as const,
    advancedDesign: {
      enabled: true,
      minHeight: mm(235),
      slot: {
        elements: [
          { kind: 'box' as const, id: 'panel', style: { backgroundColor: { hex: '#f5f0e6', model: 'hex' as const } }, placement: { anchor: { to: 'bleed' as const, edge: 'top-left' as const }, offset: { x: mm(0), y: mm(0) }, size: { width: 'fill' as const, height: 'fill' as const } } },
          { kind: 'image' as const, id: 'plate', resourceId: 'art', placement: { anchor: { to: 'page' as const, edge: 'top-left' as const }, offset: { x: mm(18), y: mm(16) }, size: { width: mm(122), height: mm(150) } } },
        ],
      },
    },
  };
  // A 150 × 225 mm leaf with 20 mm heads and feet and 15 mm sides.
  const leaf = { sizePreset: 'custom' as const, width: mm(150), height: mm(225), margins: { top: mm(20), bottom: mm(20), left: mm(15), right: mm(15) } };
  const withCover: PostextConfig = { ...base, page: leaf, headingStyles: [coverStyle] };
  const px144 = (v: number) => v * 144 / 25.4;

  it('keeps a cover design and pins it to the band standing for the leaf', () => {
    const out = buildHtmlConfigOverride(withCover, { ...opts, columnMode: 'single', layoutType: 'single', pageWidthPx: 800 });
    const design = out.headingStyles![0]!.advancedDesign!;
    expect(design.enabled).toBe(true);
    const [panel, plate] = design.slot.elements;
    // Leaf frames mean nothing on a page as tall as its text: everything
    // hangs off the band instead, which stands for the leaf itself — a
    // cover asks for more than the leaf's height and gets all of it.
    expect(panel!.placement.anchor).toEqual({ to: 'container', edge: 'top-left' });
    expect(plate!.placement.anchor).toEqual({ to: 'container', edge: 'top-left' });
    // The 850 px leaf is wider than the 800 px page: all of it shrinks.
    const k = 800 / px144(150);
    const size = panel!.placement.size as { width: { value: number }; height: { value: number } };
    expect(size.width.value).toBeCloseTo(800, 5);
    expect(size.height.value).toBeCloseTo(px144(225) * k, 5);
    expect(design.minHeight!.value).toBeCloseTo(px144(225) * k, 5);
    // The plate keeps its place and size on the leaf, scaled.
    expect((plate!.placement.offset!.x as { value: number }).value).toBeCloseTo(px144(18) * k, 5);
    expect((plate!.placement.size!.width as { value: number }).value).toBeCloseTo(122 * k, 5);
  });

  it('scales a cover down to a page of the paged view', () => {
    // Pages there are the viewport (900 − 2 × 24 = 852 px): the leaf is
    // scaled to stand in one, with a line's worth of room to spare.
    const out = buildHtmlConfigOverride(withCover, { ...opts, pageWidthPx: 800 });
    const design = out.headingStyles![0]!.advancedDesign!;
    const k = (852 * 0.95) / px144(225);
    expect(design.minHeight!.value).toBeCloseTo(852 * 0.95, 5);
    expect((design.slot.elements[1]!.placement.size!.width as { value: number }).value).toBeCloseTo(122 * k, 5);
  });

  const photoOpener: PostextConfig = {
    ...base,
    page: leaf,
    layout: { layoutType: 'double', gutterWidth: mm(6) },
    headingStyles: [{
      id: 'article',
      span: 'page' as const,
      advancedDesign: {
        enabled: true,
        minHeight: mm(100),
        slot: {
          elements: [
            { kind: 'image' as const, id: 'plate', resourceId: 'photo', placement: { anchor: { to: 'bleed' as const, edge: 'top-left' as const }, offset: { x: mm(0), y: mm(0) }, size: { width: mm(156), height: mm(80) } } },
            { kind: 'box' as const, id: 'bar', style: { backgroundColor: { hex: '#2a7f97', model: 'hex' as const } }, placement: { anchor: { to: 'bleed' as const, edge: 'top-left' as const }, offset: { x: mm(0), y: mm(78) }, size: { width: 'fill' as const, height: mm(3) } } },
            { kind: 'text' as const, id: 'title', content: '{titleText}', fontSize: { value: 20, unit: 'pt' }, overflow: 'wrap' as const, placement: { anchor: { to: 'page' as const, edge: 'top-left' as const }, offset: { x: mm(15), y: mm(90) }, size: { width: mm(120), height: 'auto' as const } } },
          ],
        },
      },
    }],
  };

  it('sets a photo opener in one column of a two-column page, its bar as wide as its plate', () => {
    // A 1000 px page of two columns and a 6 mm gutter: each column is
    // (1000 - 34.02) / 2 px wide, and the 150 mm leaf is scaled to it.
    const out = buildHtmlConfigOverride(photoOpener, { ...opts, pageWidthPx: 1000 });
    const style = out.headingStyles![0]!;
    expect(style.span).toBe('column');
    const column = (1000 - px144(6)) / 2;
    const k = column / px144(150);
    const design = style.advancedDesign!;
    expect(design.minHeight!.value).toBeCloseTo(px144(120) * k, 5);
    const [plate, bar, title] = design.slot.elements;
    // The plate is cut at the leaf's edge and the bar fills the leaf, not
    // the page: both come out the column's width.
    expect((plate!.placement.size!.width as { value: number }).value).toBeCloseTo(column, 5);
    expect((bar!.placement.size!.width as { value: number }).value).toBeCloseTo(column, 5);
    expect((title!.placement.offset!.x as { value: number }).value).toBeCloseTo(px144(15) * k, 5);
    // A sized element keeps its unit; only offsets turn into px.
    expect(title!.placement.size!.width).toEqual({ value: 120 * k, unit: 'mm' });
  });

  it('keeps a photo opener across the page when the page holds one column', () => {
    const out = buildHtmlConfigOverride(photoOpener, { ...opts, columnMode: 'single', layoutType: 'single', pageWidthPx: 1000 });
    const style = out.headingStyles![0]!;
    expect(style.span).toBe('page');
    const bar = style.advancedDesign!.slot.elements[1]!;
    expect((bar.placement.size!.width as { value: number }).value).toBeCloseTo(1000, 5);
  });

  it('keeps a panel of boxes and type across a two-column page', () => {
    const banded: PostextConfig = {
      ...photoOpener,
      headingStyles: [{
        ...photoOpener.headingStyles![0]!,
        advancedDesign: {
          ...photoOpener.headingStyles![0]!.advancedDesign!,
          slot: { elements: photoOpener.headingStyles![0]!.advancedDesign!.slot.elements.filter((el) => el.kind !== 'image') },
        },
      }],
    };
    expect(buildHtmlConfigOverride(banded, { ...opts, pageWidthPx: 1000 }).headingStyles![0]!.span).toBe('page');
  });

  it('draws an opener as the top of its leaf, its panel across the page', () => {
    const opener: PostextConfig = {
      ...base,
      page: leaf,
      headingStyles: [{
        id: 'opener',
        span: 'page' as const,
        advancedDesign: {
          enabled: true,
          minHeight: mm(60),
          slot: {
            elements: [
              { kind: 'box' as const, id: 'stripe', style: { backgroundColor: { hex: '#2a7f97', model: 'hex' as const } }, placement: { anchor: { to: 'bleed' as const, edge: 'top-left' as const }, offset: { x: mm(0), y: mm(0) }, size: { width: 'fill' as const, height: mm(3) } } },
              { kind: 'text' as const, id: 'title', content: '{titleText}', fontSize: { value: 20, unit: 'pt' }, overflow: 'wrap' as const, placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(0), y: mm(2) }, size: { width: mm(120), height: 'auto' as const } } },
              { kind: 'text' as const, id: 'credit', content: '{attr.credit}', fontSize: { value: 8, unit: 'pt' }, overflow: 'wrap' as const, placement: { anchor: { to: 'page' as const, edge: 'bottom-left' as const }, offset: { x: mm(15), y: mm(-5) }, size: { width: mm(120), height: 'auto' as const } } },
            ],
          },
        },
      }],
    };
    const out = buildHtmlConfigOverride(opener, { ...opts, columnMode: 'single', layoutType: 'single', pageWidthPx: 1200 });
    const design = out.headingStyles![0]!.advancedDesign!;
    // The band runs from the leaf's top to the bottom of the 60 mm the
    // design reserves under the 20 mm head margin.
    expect(design.minHeight!.value).toBeCloseTo(px144(80), 5);
    const [band, stripe, title, credit] = design.slot.elements;
    // A leaf-wide panel spans the viewer's page, wider than the leaf.
    expect((stripe!.placement.size!.width as { value: number }).value).toBeCloseTo(1200, 5);
    // The container sits in by the leaf's margins.
    expect((title!.placement.offset!.x as { value: number }).value).toBeCloseTo(px144(15), 5);
    expect((title!.placement.offset!.y as { value: number }).value).toBeCloseTo(px144(22), 5);
    // A foot anchor hangs off an invisible box as tall as the band: the
    // heading's container has no floor to measure it against.
    expect(band).toMatchObject({ kind: 'box', id: 'htmlViewerBand' });
    expect((band!.placement.size!.height as { value: number }).value).toBeCloseTo(px144(80), 5);
    expect(credit!.placement.anchor).toEqual({ to: '#htmlViewerBand', edge: 'align-bottom' });
    expect((credit!.placement.offset!.y as { value: number }).value).toBeCloseTo(px144(-5), 5);
  });

  it('gives part body type its text colours when the divider loses its panel', () => {
    const white = { hex: '#ffffff', model: 'hex' as const };
    const painted: PostextConfig = {
      ...base,
      parts: {
        ...base.parts,
        design: { elements: [{ kind: 'box' as const, id: 'bg', style: { backgroundColor: { hex: '#2a7f97', model: 'hex' as const } }, placement: { anchor: { to: 'bleed' as const, edge: 'top-left' as const }, size: { width: 'fill' as const, height: 'fill' as const } } }] },
        bodyStyle: { color: white, numberColor: white, fontSize: { value: 14, unit: 'pt' } },
      },
    };
    expect(buildHtmlConfigOverride(painted, opts).parts!.bodyStyle).toEqual({ fontSize: { value: 14, unit: 'pt' } });
    // A divider drawn on the bare page keeps the colours it chose.
    const bare: PostextConfig = { ...painted, parts: { ...painted.parts, design: { elements: [] } } };
    expect(buildHtmlConfigOverride(bare, opts).parts!.bodyStyle).toEqual(painted.parts!.bodyStyle);
  });

  it('drops the parity of a heading style\u2019s break, keeping the break', () => {
    const styled: PostextConfig = { ...base, headingStyles: [{ id: 'front', breakBefore: { enabled: true, parity: 'odd' } }] };
    expect(buildHtmlConfigOverride(styled, opts).headingStyles![0]!.breakBefore).toEqual({ enabled: true, parity: 'any' });
  });

  it('fits figures to the screen-tall page', () => {
    expect(buildHtmlConfigOverride(base, opts).layout!.fitFiguresToPage).toBe(true);
  });

  it('leaves a design that already hangs off its own band alone', () => {
    const inBand: PostextConfig = {
      ...base,
      headingStyles: [{
        id: 'opener',
        advancedDesign: {
          enabled: true,
          minHeight: mm(52),
          slot: { elements: [{ kind: 'text' as const, id: 't', content: '{titleText}', fontSize: { value: 15, unit: 'pt' }, overflow: 'wrap' as const, placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(0), y: mm(2) }, size: { width: mm(122), height: 'auto' as const } } }] },
        },
      }],
    };
    const out = buildHtmlConfigOverride(inBand, { ...opts, columnMode: 'single', layoutType: 'single' });
    const design = out.headingStyles![0]!.advancedDesign!;
    expect(design.slot.elements[0]!.placement.size).toEqual({ width: mm(122), height: 'auto' });
    // 52 mm at 144 dpi, unchanged in value.
    expect(design.minHeight!.unit).toBe('px');
    expect(design.minHeight!.value).toBeCloseTo(52 * 144 / 25.4, 5);
  });

  it('scales the whole design through the DPI, leaving font sizes untouched', () => {
    const withSizes: PostextConfig = {
      ...base,
      bodyText: { fontSize: { value: 8, unit: 'pt' } },
      headings: { levels: [{ level: 1, fontSize: { value: 20, unit: 'pt' } }] },
    };
    const out = buildHtmlConfigOverride(withSizes, { ...opts, fontScale: 1.5 });
    // 144 dpi at scale 1 (8pt = 16px); 216 dpi at scale 1.5 (8pt = 24px).
    expect(out.page!.dpi).toBe(216);
    expect(out.bodyText!.fontSize).toEqual({ value: 8, unit: 'pt' });
    expect(out.headings!.levels!.find((l) => l.level === 1)!.fontSize).toEqual({ value: 20, unit: 'pt' });
    // Page geometry is in px, so it does not grow with the scale.
    expect(out.page!.width).toEqual({ value: 800, unit: 'px' });
    expect(buildHtmlConfigOverride(withSizes, opts).page!.dpi).toBe(144);
  });

  it('strips running heads and gives a part without margins the viewer\u2019s own', () => {
    const out = buildHtmlConfigOverride({ ...base, parts: undefined }, opts);
    expect(out.header).toEqual({ elements: [] });
    expect(out.footer).toEqual({ elements: [] });
    expect(out.parts!.margins!.left).toEqual({ value: 0, unit: 'px' });
    expect(out.parts!.margins!.top!.value).toBeGreaterThan(0);
    expect(out.parts!.breakBefore).toEqual({ parity: 'any' });
  });

  it('reads part titles from the source, forced breaks included', () => {
    const md = ':::part{number="I" title="Los materiales \\\\ de la célula"}\n1. Uno\n:::\n\n# Capítulo\n';
    expect(partTitlesOf(md)).toEqual(['I Los materiales\nde la célula']);
    expect(partTitlesOf('# Sin partes\n')).toEqual([]);
  });
});
