import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { collectContentWarnings } from '../../../pipeline/contentWarnings.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import { pathBounds } from '../../../dieCut/index.js';
import { flattenPath, rectPolygonDistance } from '../../../dieCut/geometry.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTPage } from '../../../vdt.js';

// Die-cuts (#1565) on laid-out pages: the three placements, the leaf rule
// and the text kept clear of a hole.

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

const base: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(480),
    dpi: 72,
    margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) },
  },
  layout: { layoutType: 'single' },
};

const filler = (tag: string, n: number) =>
  Array.from({ length: n }, () => Array.from({ length: 60 }, () => tag).join(' ')).join('\n\n');

const lines = (page: VDTPage) => page.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines));

describe('dieCuts.pages: a porthole on page 3', () => {
  const config: PostextConfig = {
    ...base,
    dieCuts: {
      shapes: [{ id: 'porthole', shape: 'circle', x: pt(36), y: pt(120), width: pt(100), height: pt(100), wrap: { gap: pt(8) } }],
      pages: [{ pages: '3', die: 'porthole' }],
    },
  };
  const doc = buildDocument({ markdown: filler('Word', 30) }, config);

  it('cuts page 3 and the back of its leaf, mirrored', () => {
    expect(doc.pages.length).toBeGreaterThan(4);
    expect(doc.pages[2]!.dieCut?.sources).toEqual(['porthole']);
    expect(doc.pages[3]!.dieCut?.sources).toEqual(['porthole']);
    expect(doc.pages[1]!.dieCut).toBeUndefined();
    expect(doc.pages[4]!.dieCut).toBeUndefined();
    const front = pathBounds(doc.pages[2]!.dieCut!.holes[0]!)!;
    const back = pathBounds(doc.pages[3]!.dieCut!.holes[0]!)!;
    expect(front.x).toBeCloseTo(36);
    expect(back.x).toBeCloseTo(360 - 36 - 100);
    expect(doc.pages[2]!.dieCut!.wrapGapPx).toEqual([8]);
  });

  it('keeps every line clear of the hole and its gap, on both sides', () => {
    for (const page of [doc.pages[2]!, doc.pages[3]!]) {
      const hole = pathBounds(page.dieCut!.holes[0]!)!;
      const beside = lines(page).filter((l) => l.bbox.y < hole.y + hole.height && l.bbox.y + l.bbox.height > hole.y);
      expect(beside.length).toBeGreaterThan(0);
      // Lines follow the circle's curve, a few points off it.
      const polys = flattenPath(page.dieCut!.holes[0]!);
      for (const l of beside) expect(rectPolygonDistance(l.bbox, polys)).toBeGreaterThan(2);
      // Some line runs into the hole's box beside its curve.
      expect(beside.some((l) => l.bbox.x < hole.x + hole.width && l.bbox.x + l.bbox.width > hole.x + hole.width)).toBe(page.index === 2);
    }
    // Pages without a hole set full lines.
    const full = lines(doc.pages[1]!).filter((l) => l.bbox.width > 250);
    expect(full.length).toBeGreaterThan(5);
  });

  it('a die nobody has is a config warning', () => {
    const w = collectConfigWarnings({ ...config, dieCuts: { ...config.dieCuts, pages: [{ pages: '2', die: 'portole' }] } });
    expect(w).toContainEqual(expect.objectContaining({ kind: 'unknownConfigValue', path: 'dieCuts.pages[0].die', value: 'portole', suggestion: 'porthole' }));
  });
});

describe(':::diecut — a run of die-cut pages', () => {
  const config: PostextConfig = {
    ...base,
    dieCuts: { shapes: [{ id: 'tab', shape: 'roundRect', x: pt(300), y: pt(40), width: pt(40), height: pt(60), wrap: false, leaves: 2 }] },
  };
  const md = `${filler('Before', 4)}

:::diecut{die=tab}
${filler('Inside', 6)}
:::

${filler('After', 4)}`;
  const doc = buildDocument({ markdown: md }, config);

  it('starts on a page of its own and cuts every page it lands on, and the leaves after', () => {
    const inside = doc.pages.filter((p) => lines(p).some((l) => l.text.includes('Inside')));
    expect(inside.length).toBeGreaterThan(0);
    for (const p of inside) expect(p.dieCut?.sources).toContain('tab');
    expect(lines(inside[0]!).some((l) => l.text.includes('Before'))).toBe(false);
    const first = doc.pages.indexOf(inside[0]!);
    expect(doc.pages.slice(0, first - 1).every((p) => p.dieCut === undefined || first % 2 === 1)).toBe(true);
  });

  it('a run naming no die is a content warning', () => {
    const warnings = collectContentWarnings(':::diecut{die=star}\nText\n:::', config, []);
    expect(warnings).toContainEqual(expect.objectContaining({ kind: 'dieCutUnknown', die: 'star', known: ['tab'] }));
  });
});

describe('a template cut element', () => {
  const t: PageTemplate = {
    id: 'cut',
    frames: [{ name: 'body', grid: { col: 1, row: 1 } }],
    decoration: {
      elements: [{
        kind: 'cut', id: 'window', die: 'win',
        placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(60), y: pt(60) }, size: { width: pt(80), height: pt(40) } },
      }],
    },
  } as unknown as PageTemplate;
  const config: PostextConfig = {
    ...base,
    pageTemplates: [t],
    dieCuts: { shapes: [{ id: 'win', shape: 'ellipse', x: pt(0), y: pt(0), width: pt(1), height: pt(1), leaves: 1 }] },
  } as PostextConfig;
  const doc = buildDocument({ markdown: `Opening.\n\n::::page{template="cut"}\n:::frame{slot="body"}\nCard\n:::\n::::\n\nAfter.` }, config);

  it('is lifted out of the decoration onto the page and its leaf', () => {
    const at = doc.pages.findIndex((p) => p.composed);
    expect(at).toBeGreaterThan(-1);
    const page = doc.pages[at]!;
    expect(page.dieCut?.sources).toEqual(['win']);
    expect(page.composed!.decoration?.blocks.some((b) => b.kind === 'path' && b.dieCut) ?? false).toBe(false);
    const b = pathBounds(page.dieCut!.holes[0]!)!;
    expect(b.x).toBeCloseTo(60);
    expect(b.width).toBeCloseTo(80);
    // The ellipse of the die, stretched to the element's box.
    expect(page.dieCut!.holes[0]!.filter((c) => c.op === 'C')).toHaveLength(4);
    const mate = at % 2 === 0 ? at + 1 : at - 1;
    if (doc.pages[mate]) expect(doc.pages[mate]!.dieCut?.sources).toEqual(['win']);
  });
});
