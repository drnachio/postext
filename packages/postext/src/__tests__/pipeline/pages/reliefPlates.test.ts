import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { preflightDocument } from '../../../checks/preflight.js';
import { pathBounds } from '../../../dieCut/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig } from '../../../types.js';

// Emboss and deboss (#1667): a template's cut element with `process` is a
// relief die. Nothing is cut and nothing painted; its outline goes on the
// page's technical plates, which the PDF fills on a plate that prints
// nothing. The preflight reports one by the trim or across a fold.

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
const mm = (value: number) => ({ value, unit: 'mm' as const });

const box = (x: number, y: number, w: number, h: number) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(x), y: pt(y) }, size: { width: pt(w), height: pt(h) } });

function build(elements: unknown[], foldMarks?: ReturnType<typeof mm>[], markdown = 'Card') {
  const t = {
    id: 'sheet',
    frames: [{ name: 'body', grid: { col: 1, row: 1 } }],
    decoration: { elements },
  } as unknown as PageTemplate;
  const config: PostextConfig = {
    page: {
      width: pt(360), height: pt(480), dpi: 72,
      margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) },
      ...(foldMarks ? { cutLines: { enabled: true, bleed: mm(3), foldMarks } } : {}),
    },
    layout: { layoutType: 'single' },
    pageTemplates: [t],
  } as PostextConfig;
  return buildDocument({ markdown: `::::page{template="sheet"}\n:::frame{slot="body"}\n${markdown}\n:::\n::::` }, config);
}

describe('relief plates', () => {
  it('lifts an emboss onto the page plates: no hole, nothing painted', () => {
    const doc = build([{ kind: 'cut', id: 'seal', process: 'emboss', placement: box(100, 100, 80, 40) }]);
    const page = doc.pages.find((p) => p.composed)!;
    expect(page.dieCut).toBeUndefined();
    expect(page.plates).toHaveLength(1);
    expect(page.plates![0]).toMatchObject({ process: 'emboss', source: 'seal' });
    const b = pathBounds(page.plates![0]!.paths[0]!)!;
    expect(b.x - doc.trimOffset).toBeCloseTo(100);
    expect(b.width).toBeCloseTo(80);
    expect(page.composed!.decoration?.blocks.some((x) => x.kind === 'path' && x.dieCut) ?? false).toBe(false);
  });

  it('keeps a deboss in its own path data, beside a hole the same template cuts', () => {
    const doc = build([
      { kind: 'cut', id: 'mark', process: 'deboss', d: 'M0 0L1 0L0.5 1Z', viewBox: [1, 1], placement: box(120, 200, 60, 60) },
      { kind: 'cut', id: 'window', placement: box(120, 300, 40, 40) },
    ]);
    const page = doc.pages.find((p) => p.composed)!;
    expect(page.plates!.map((p) => p.process)).toEqual(['deboss']);
    expect(page.plates![0]!.paths[0]!.filter((c) => c.op === 'L')).toHaveLength(2);
    expect(page.dieCut?.holes).toHaveLength(1);
  });

  it('leaves every page of a book without one as it was', () => {
    const doc = buildDocument({ markdown: 'Text.' }, {});
    expect(doc.pages.every((p) => p.plates === undefined)).toBe(true);
  });
});

describe('preflight of folds and reliefs', () => {
  const kinds = (doc: ReturnType<typeof build>, kind: string) => preflightDocument(doc).filter((i) => i.kind === kind);

  it('reports a relief past the trim as critical and one near it as a warning', () => {
    const past = build([{ kind: 'cut', id: 'edge', process: 'emboss', placement: box(-10, 100, 40, 40) }]);
    expect(kinds(past, 'reliefTrim')).toEqual([expect.objectContaining({ severity: 'critical', process: 'emboss', source: 'edge' })]);
    const near = build([{ kind: 'cut', id: 'edge', process: 'emboss', placement: box(4, 100, 40, 40) }]);
    expect(kinds(near, 'reliefTrim')).toEqual([expect.objectContaining({ severity: 'warning' })]);
    const clear = build([{ kind: 'cut', id: 'edge', process: 'emboss', placement: box(60, 100, 40, 40) }]);
    expect(kinds(clear, 'reliefTrim')).toEqual([]);
  });

  it('reports a relief across a fold and one close to it', () => {
    // A fold 100 mm from the left trim edge: 283.46 pt.
    const across = build([{ kind: 'cut', id: 'band', process: 'deboss', placement: box(260, 100, 50, 30) }], [mm(100)]);
    expect(kinds(across, 'reliefFold')).toEqual([expect.objectContaining({ severity: 'critical', distanceMm: 0 })]);
    const near = build([{ kind: 'cut', id: 'band', process: 'deboss', placement: box(240, 100, 40, 30) }], [mm(100)]);
    expect(kinds(near, 'reliefFold')).toEqual([expect.objectContaining({ severity: 'warning' })]);
  });

  it('reports text across a fold, and none on a sheet without folds', () => {
    const doc = build([], [mm(40)], 'A line of text that runs over the fold of the sheet');
    const found = kinds(doc, 'foldText');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'warning', distanceMm: 0 });
    expect(kinds(build([], undefined, 'A line of text'), 'foldText')).toEqual([]);
  });
});
