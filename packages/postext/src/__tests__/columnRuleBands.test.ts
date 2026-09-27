import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../index';
import { columnRuleSegments } from '../columnRule';
import { createMeasurementCache } from '../measure';
import type { DesignElement, LayoutConfig, PostextConfig } from '../types';
import type { VDTDocument, VDTPage } from '../vdt';

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

/** A 2D context that records every rule it strokes (`moveTo` → `lineTo`
 *  with the stroke style and width in force) and swallows other calls. */
function recordingCanvas(): { canvas: HTMLCanvasElement; strokes: { x0: number; y0: number; x1: number; y1: number; color: string; width: number }[] } {
  const strokes: { x0: number; y0: number; x1: number; y1: number; color: string; width: number }[] = [];
  let from = { x: 0, y: 0 };
  let to = { x: 0, y: 0 };
  const state: Record<string | symbol, unknown> = {};
  const ctx: Record<string | symbol, unknown> = new Proxy(state, {
    get(target, key) {
      if (key === 'moveTo') return (x: number, y: number) => { from = { x, y }; };
      if (key === 'lineTo') return (x: number, y: number) => { to = { x, y }; };
      if (key === 'stroke') return () => {
        strokes.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, color: String(target.strokeStyle), width: Number(target.lineWidth) });
      };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, strokes };
}

const verticalStrokes = (doc: VDTDocument, page: VDTPage) => {
  const { canvas, strokes } = recordingCanvas();
  renderPageToCanvas(page, doc, canvas);
  return strokes.filter((s) => s.x0 === s.x1 && s.y1 > s.y0);
};

const BODY = 'Body text that runs on for a while. '.repeat(60);
const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());

/** 400 × 500pt page at 72 dpi, 20pt margins; body 10/12pt. */
function base(layout: LayoutConfig, extra: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout,
    bodyText: { fontSize: pt(10), lineHeight: pt(12) },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  };
}

describe('column rule under a page-span heading (EF-101)', () => {
  const opener = (elements?: DesignElement[]): PostextConfig => base(
    { layoutType: 'double', gutterWidth: pt(20), columnRule: { enabled: true } },
    {
      headings: {
        balancing: { enabled: false },
        levels: [{
          level: 1, span: 'page', fontSize: pt(20), lineHeight: pt(30), marginBottom: pt(10), breakBefore: { enabled: true, parity: 'any' },
          ...(elements ? { advancedDesign: { enabled: true, slot: { elements } } } : {}),
        }],
      },
    },
  );

  it('starts the rule under the band of a default opener', () => {
    const doc = build(`# The Secret Canon\n\n${BODY}`, opener());
    const page = doc.pages[0]!;
    const band = page.openerBand!;
    const segs = columnRuleSegments(page.columns);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.top).toBeCloseTo(band.bbox.y + band.bbox.height, 5);
    // And the canvas draws what the segments say.
    const [rule] = verticalStrokes(doc, page);
    expect(rule!.y0).toBeCloseTo(band.bbox.y + band.bbox.height, 5);
  });

  it('starts the rule where the text starts under a designed band with a fill', () => {
    const fill: DesignElement = {
      kind: 'box', id: 'fill', style: { backgroundColor: hex('#223344') },
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: pt(40) } },
    };
    const doc = build(`# The Secret Canon\n\n${BODY}`, opener([fill]));
    const page = doc.pages[0]!;
    const firstText = page.columns[0]!.blocks.find((b) => b.type === 'paragraph')!;
    expect(columnRuleSegments(page.columns)[0]!.top).toBeCloseTo(firstText.bbox.y, 5);
    expect(page.columns[1]!.bbox.y).toBeCloseTo(firstText.bbox.y, 5);
  });

  it('keeps the rule from the top of pages without an opener', () => {
    const doc = build(`# The Secret Canon\n\n${BODY}${BODY}${BODY}`, opener());
    const page = doc.pages[1]!;
    expect(page.openerBand).toBeUndefined();
    expect(columnRuleSegments(page.columns)[0]!.top).toBeCloseTo(page.contentArea.y, 5);
  });
});

describe('column rule of a styled section (EF-112)', () => {
  const orange = hex('#e08a1e');
  const twoColumns = (columnRule?: LayoutConfig['columnRule']): PostextConfig['headingStyles'] => [{
    id: 'two', breakBefore: { enabled: true, parity: 'any' }, span: 'page',
    layout: { layoutType: 'double', gutterWidth: pt(20), ...(columnRule ? { columnRule } : {}) },
  }];
  const MD = `# A\n\nText of the first section.\n\n## B {style="two"}\n\n${BODY}`;
  const sectionPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) =>
    p.columns.some((c) => c.blocks.some((b) => b.type === 'heading' && b.headingStyleId === 'two')))!;

  it('draws the rule a heading style sets on its section\'s pages', () => {
    const doc = build(MD, base({ layoutType: 'single' }, {
      headingStyles: twoColumns({ enabled: true, color: orange, lineWidth: pt(3) }),
    }));
    const page = sectionPage(doc);
    expect(page.columnRule).toEqual({ enabled: true, color: '#e08a1e', lineWidthPx: 3 });
    const rules = verticalStrokes(doc, page);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.color).toBe('#e08a1e');
    expect(rules[0]!.width).toBe(3);
  });

  it('takes the document\'s rule on a section whose layout sets none', () => {
    const doc = build(MD, base(
      { layoutType: 'single', columnRule: { enabled: true, color: hex('#112233') } },
      { headingStyles: twoColumns() },
    ));
    const page = sectionPage(doc);
    expect(page.columnRule).toBeUndefined();
    const rules = verticalStrokes(doc, page);
    expect(rules.map((r) => r.color)).toEqual(['#112233']);
  });

  it('takes the fields a section leaves unset from the document\'s rule', () => {
    const doc = build(MD, base(
      { layoutType: 'single', columnRule: { enabled: true, color: hex('#112233'), lineWidth: pt(2) } },
      { headingStyles: twoColumns({ color: orange }) },
    ));
    const page = sectionPage(doc);
    expect(page.columnRule).toEqual({ enabled: true, color: '#e08a1e', lineWidthPx: 2 });
  });

  it('draws no rule on a section that turns the document\'s off', () => {
    const doc = build(MD, base(
      { layoutType: 'double', gutterWidth: pt(20), columnRule: { enabled: true } },
      { headingStyles: twoColumns({ enabled: false }) },
    ));
    const page = sectionPage(doc);
    expect(page.columnRule?.enabled).toBe(false);
    expect(verticalStrokes(doc, page)).toHaveLength(0);
    // The document's own pages keep theirs.
    const first = doc.pages[0]!;
    expect(first.columnRule).toBeUndefined();
    expect(verticalStrokes(doc, first).length).toBeGreaterThan(0);
  });
});
