import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import { collectColumnGaps } from '../../pipeline/columnBalancing';
import {
  normalizeSafeArea,
  safeAreaHeightRange,
  safeAreaSource,
  uncroppedPictureBox,
} from '../../pipeline/safeArea';
import { renderToHtml } from '../../index';
import type { PostextConfig, Resource, ResourceSafeArea, VDTBlock, VDTDocument } from '../../index';

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

const px = (value: number) => ({ value, unit: 'px' as const });

describe('safe area maths', () => {
  const area: ResourceSafeArea = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };

  it('ranges the body height from the safe area height to its width', () => {
    // A 2:1 landscape set 300 px wide stands 150 px tall.
    const r = safeAreaHeightRange(2000, 1000, area, 300);
    expect(r.min).toBeCloseTo(150 * 0.6, 6);
    expect(r.max).toBeCloseTo(150 / 0.5, 6);
  });

  it('crops the sides of a taller body, in proportion to the margins', () => {
    const src = safeAreaSource(2000, 1000, area, 300, 200)!;
    expect(src.height).toBe(1);
    expect(src.width).toBeCloseTo(150 / 200, 6);
    // Margins 0.1 left / 0.4 right: the crop of 0.25 takes 1/5 on the left.
    expect(src.x).toBeCloseTo(0.25 * (0.1 / 0.5), 6);
    // The safe area stays in view.
    expect(src.x).toBeLessThanOrEqual(area.x);
    expect(src.x + src.width).toBeGreaterThanOrEqual(area.x + area.width - 1e-9);
  });

  it('crops top and bottom of a shorter body', () => {
    const src = safeAreaSource(2000, 1000, area, 300, 120)!;
    expect(src.width).toBe(1);
    expect(src.height).toBeCloseTo(120 / 150, 6);
    expect(src.y).toBeCloseTo((1 - src.height) * (0.2 / 0.4), 6);
  });

  it('leaves the picture whole at its own ratio', () => {
    expect(safeAreaSource(2000, 1000, area, 300, 150)).toBeUndefined();
  });

  it('draws the whole picture so the shown part fills the body', () => {
    const box = uncroppedPictureBox(10, 20, 150, 100, { x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(box).toEqual({ x: 10 - 0.25 * 300, y: 20, width: 300, height: 100 });
  });

  it('ignores a malformed or whole-picture area and clamps the rest', () => {
    expect(normalizeSafeArea({ x: 0, y: 0, width: 1, height: 1 })).toBeUndefined();
    expect(normalizeSafeArea({ x: 0.5, y: 0.5, width: 0, height: 0.2 })).toBeUndefined();
    expect(normalizeSafeArea({ x: Number.NaN, y: 0, width: 0.5, height: 0.5 })).toBeUndefined();
    const clamped = normalizeSafeArea({ x: 0.8, y: -0.1, width: 0.5, height: 0.5 })!;
    expect(clamped.x).toBeCloseTo(0.8, 9);
    expect(clamped.y).toBe(0);
    expect(clamped.width).toBeCloseTo(0.2, 9);
    expect(clamped.height).toBeCloseTo(0.4, 9);
  });
});

/** A screen-like page: 600 × 400 px, no margins, one column. */
const PAGE: PostextConfig = {
  page: { dpi: 144, width: px(600), height: px(400), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const landscape = (over: Partial<Resource> = {}): Resource => ({
  id: 'plate',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A plate.',
  createdAt: 0,
  updatedAt: 0,
  // At the 600 px measure it stands 400 px tall.
  bitmap: { fileId: 'f', format: 'jpeg', width: 3000, height: 2000 },
  placement: { position: 'here' },
  ...over,
});

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances.`;

const figures = (doc: VDTDocument): { pageIndex: number; block: VDTBlock }[] => {
  const out: { pageIndex: number; block: VDTBlock }[] = [];
  for (const page of doc.pages) {
    for (const col of page.columns) for (const b of col.blocks) if (b.type === 'resource') out.push({ pageIndex: page.index, block: b });
    for (const f of page.floats ?? []) if (f.resourceBlock) out.push({ pageIndex: page.index, block: f });
  }
  return out;
};

describe('safe area in layout', () => {
  it('shows a picture without a safe area whole', () => {
    const doc = buildDocument({ markdown: '::resource{id="plate"}', resources: [landscape()] }, PAGE);
    const rb = figures(doc)[0]!.block.resourceBlock!;
    expect(rb.bodySource).toBeUndefined();
    expect(rb.bodyFlex).toBeUndefined();
  });

  it('reports how far a picture with a safe area may shrink or grow', () => {
    const safeArea = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const wide = landscape({ safeArea, bitmap: { fileId: 'f', format: 'jpeg', width: 3000, height: 1500 } });
    const doc = buildDocument({ markdown: '::resource{id="plate"}', resources: [wide] }, PAGE);
    const rb = figures(doc)[0]!.block.resourceBlock!;
    // Uncropped at its own ratio: 600 × 300, down to 150 or up to 600.
    expect(rb.bodySource).toBeUndefined();
    expect(rb.bodyRect.height).toBeCloseTo(300, 3);
    expect(rb.bodyFlex!.shrink).toBeCloseTo(150, 3);
    expect(rb.bodyFlex!.grow).toBeCloseTo(300, 3);
    expect(rb.bodyFlex!.delta).toBe(0);
  });

  it('crops a picture that with its caption overruns the page to fit it', () => {
    // 600 × 400 on a 400 px page: the caption would hang below the page.
    const safeArea = { x: 0, y: 0.2, width: 1, height: 0.6 };
    const doc = buildDocument({ markdown: '::resource{id="plate"}', resources: [landscape({ safeArea })] }, PAGE);
    const { block } = figures(doc)[0]!;
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(400 + 0.5);
    expect(block.resourceBlock!.bodyRect.width).toBeCloseTo(600, 3);
    expect(block.resourceBlock!.bodySource!.height).toBeLessThan(1);
  });

  it('crops a picture too tall for the page before shrinking it (fitFiguresToPage)', () => {
    const config = { ...PAGE, layout: { ...PAGE.layout, fitFiguresToPage: true } };
    const safeArea = { x: 0, y: 0.1, width: 1, height: 0.5 };
    const doc = buildDocument({ markdown: '::resource{id="plate"}', resources: [landscape({ safeArea })] }, config);
    const { block } = figures(doc)[0]!;
    const rb = block.resourceBlock!;
    // Width kept, height cut within the safe area so image + caption fit.
    expect(rb.bodyRect.width).toBeCloseTo(600, 3);
    expect(block.bbox.height).toBeLessThanOrEqual(400);
    expect(rb.bodySource!.width).toBe(1);
    expect(rb.bodySource!.height).toBeLessThan(1);
    expect(rb.bodySource!.y).toBeLessThanOrEqual(0.1);
  });

  it('crops an inline picture to the room left rather than move it on', () => {
    // Two paragraphs, then a picture the rest of the page cannot hold whole.
    const markdown = `${para(1)}\n\n${para(2)}\n\n::resource{id="plate"}\n\n${para(3)}`;
    const plain = buildDocument({ markdown, resources: [landscape()] }, PAGE);
    expect(figures(plain)[0]!.pageIndex).toBe(1);

    const safeArea = { x: 0, y: 0.2, width: 1, height: 0.5 };
    const doc = buildDocument({ markdown, resources: [landscape({ safeArea })] }, PAGE);
    const { pageIndex, block } = figures(doc)[0]!;
    expect(pageIndex).toBe(0);
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(400 + 0.5);
    expect(block.resourceBlock!.bodyRect.width).toBeCloseTo(600, 3);
    expect(block.resourceBlock!.bodySource!.height).toBeLessThan(1);
  });
});

describe('safe area in the HTML backend', () => {
  it('fits a cropped picture with object-fit, showing its shown part', () => {
    const markdown = `${para(1)}\n\n${para(2)}\n\n::resource{id="plate"}\n\n${para(3)}`;
    const safeArea = { x: 0, y: 0.2, width: 1, height: 0.5 };
    const doc = buildDocument({ markdown, resources: [landscape({ safeArea })] }, PAGE);
    const src = figures(doc)[0]!.block.resourceBlock!.bodySource!;
    const html = renderToHtml(doc, { resourceImageUrl: () => 'blob:plate' });
    const py = (src.y / (1 - src.height)) * 100;
    expect(html).toContain(`object-fit:cover;object-position:0% ${+py.toFixed(3)}%;`);
  });
});

const SENTENCE =
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';

/** Sections of text with a picture in each: long enough to span several
 *  pages of the default double-column A4 layout, and to leave columns
 *  short (keep-with-next headings) for balancing to fill. */
function sampleMarkdown(): string {
  const parts: string[] = ['# Documento de prueba', '', SENTENCE.repeat(6).trim(), ''];
  for (let i = 1; i <= 8; i++) {
    parts.push(`## Sección ${i}`, '', SENTENCE.repeat(5).trim(), '', `::resource{id="fig-${i}"}`, '', SENTENCE.repeat(4).trim(), '');
    parts.push(`### Detalle ${i}`, '', SENTENCE.repeat(5).trim(), '', SENTENCE.repeat(3).trim(), '');
  }
  return parts.join('\n');
}

const sampleFigures = (position: 'here' | 'auto', safeArea?: ResourceSafeArea): Resource[] =>
  Array.from({ length: 8 }, (_, k) => ({
    ...landscape(),
    id: `fig-${k + 1}`,
    caption: `Figura ${k + 1}.`,
    bitmap: { fileId: `f${k + 1}`, format: 'jpeg', width: 3000, height: 2000 },
    placement: { position },
    ...(safeArea ? { safeArea } : {}),
  }));

const BALANCED: PostextConfig = {
  headings: { balancing: { enabled: true, maxLinesPerHeading: 0, stretchAfterLists: false, stretchAfterFloats: false, looseParagraphs: false } },
};
const NO_FORCED = new Set<number>();
const totalGaps = (doc: VDTDocument): number => collectColumnGaps(doc, NO_FORCED).reduce((s, g) => s + g.gapLines, 0);
const LONG = 60_000;

describe('safe area as a balancing lever (flexFigure)', () => {
  for (const position of ['here', 'auto'] as const) {
    it(`grows ${position === 'here' ? 'inline' : 'floated'} pictures to fill short columns`, () => {
      const area = { x: 0.2, y: 0, width: 0.4, height: 1 };
      const plain = buildDocument({ markdown: sampleMarkdown(), resources: sampleFigures(position) }, BALANCED, createMeasurementCache());
      const flex = buildDocument({ markdown: sampleMarkdown(), resources: sampleFigures(position, area) }, BALANCED, createMeasurementCache());
      const grown = figures(flex).filter(({ block }) => block.balancing?.levers.includes('flexFigure'));
      expect(totalGaps(plain)).toBeGreaterThan(0);
      expect(grown.length).toBeGreaterThan(0);
      expect(totalGaps(flex)).toBeLessThan(totalGaps(plain));
      for (const { block } of grown) {
        const rb = block.resourceBlock!;
        // Grown by whole grid lines, the sides cropped within the safe area.
        expect(block.balancing!.bodyGrowth! / flex.baselineGrid).toBeCloseTo(Math.round(block.balancing!.bodyGrowth! / flex.baselineGrid), 3);
        expect(rb.bodySource!.height).toBe(1);
        expect(rb.bodySource!.width).toBeGreaterThanOrEqual(area.width - 1e-9);
        expect(rb.bodySource!.x).toBeLessThanOrEqual(area.x + 1e-9);
      }
    }, LONG);
  }
});
