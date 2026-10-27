import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index.js';
import { columnRuleSegments } from '../../paint/columnRule.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { DesignElement, LayoutConfig, PostextConfig } from '../../types.js';
import type { VDTDocument, VDTPage } from '../../vdt.js';

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

describe('column rule between a page-span opener and a page-span box (#675)', () => {
  // A page-span box that opens with a headline follows the opener: a
  // heading before a heading is not snapped to the grid, so the opener's
  // band ends between two grid lines (minHeight 50 on a 12pt grid) and the
  // box sits on the next one. The band of columns the opener heads closes
  // with nothing in it but the hidden heading.
  const cfg = base(
    { layoutType: 'double', gutterWidth: pt(20), columnRule: { enabled: true } },
    {
      headings: {
        balancing: { enabled: false },
        levels: [{
          level: 1, span: 'page', fontSize: pt(20), lineHeight: pt(30), marginBottom: pt(0), breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, minHeight: pt(50), slot: { elements: [{
            kind: 'text', id: 'name', content: '{titleText}', fontSize: pt(20),
            placement: { anchor: { to: 'container', edge: 'top-left' } },
          }] } },
        }],
      },
    },
  );
  const md = `# The Daily Canon\n\n:::callout{span="page" title="Lead"}\n## The headline of the day\n\nIts standfirst.\n:::\n\n${BODY}`;

  it('rules no gutter in the band that holds only the opener', () => {
    const doc = build(md, cfg);
    const page = doc.pages[0]!;
    const box = page.columns.find((c) => c.kind === 'span')!;
    const head = page.columns[0]!;
    // The case: the opener's column ends under its band, on the box's top.
    expect(head.blocks.every((b) => b.type === 'heading' && b.hidden)).toBe(true);
    expect(head.bbox.y + head.bbox.height).toBeGreaterThan(page.openerBand!.bbox.y + page.openerBand!.bbox.height + 1);
    const segs = columnRuleSegments(page.columns);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.top).toBeGreaterThanOrEqual(box.bbox.y + box.bbox.height - 0.01);
    // And the canvas draws what the segments say.
    const rules = verticalStrokes(doc, page);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.y0).toBeGreaterThanOrEqual(box.bbox.y + box.bbox.height - 0.01);
  });

  it('still rules the gutter under an opener that text follows', () => {
    const doc = build(`# The Daily Canon\n\n${BODY}`, cfg);
    const page = doc.pages[0]!;
    const segs = columnRuleSegments(page.columns);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.bottom).toBeCloseTo(page.contentArea.y + page.contentArea.height, 1);
  });

  it('keeps the rules of a page that holds an opener and nothing else', () => {
    const doc = build('# The Daily Canon', cfg);
    expect(columnRuleSegments(doc.pages[0]!.columns)).toHaveLength(1);
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

describe('column rule of a closing band (#713)', () => {
  // A closing band ends its columns, and so its rule, on the grid line
  // under its text, whether a level cut was needed (two lines and more:
  // a trailing cap) or the band was level already (one line, or a story
  // that ends level with the picture beside it).
  const WORD = 'abcdefgh';
  const para = (k: number): string => Array.from({ length: k }, () => WORD).join(' ');
  const plain = (extra: Partial<PostextConfig> = {}): PostextConfig => base(
    { layoutType: 'double', gutterWidth: pt(20), columnRule: { enabled: true } },
    { bodyText: { fontSize: pt(10), lineHeight: pt(12), textAlign: 'left', hyphenation: { enabled: false }, firstLineIndent: pt(0) }, ...extra },
  );
  const textFoot = (page: VDTPage): number => {
    let foot = 0;
    for (const c of page.columns) for (const b of c.blocks) for (const l of b.lines) foot = Math.max(foot, l.bbox.y + l.bbox.height);
    return foot;
  };

  // 170pt columns: two words to the line.
  for (const lines of [1, 2, 3, 4, 10]) {
    it(`ends the rule with the text of a two-column document of ${lines} line${lines === 1 ? '' : 's'}`, () => {
      const doc = build(para(lines * 2), plain());
      expect(doc.pages).toHaveLength(1);
      const page = doc.pages[0]!;
      const segments = columnRuleSegments(page.columns, page.footnoteAreas);
      expect(segments).toHaveLength(1);
      expect(segments[0]!.top).toBeCloseTo(20, 2);
      const foot = textFoot(page);
      expect(segments[0]!.bottom).toBeGreaterThanOrEqual(foot - 0.01);
      expect(segments[0]!.bottom).toBeLessThanOrEqual(foot + doc.baselineGrid + 0.01);
      // The canvas strokes the same segment.
      const strokes = verticalStrokes(doc, page);
      expect(strokes).toHaveLength(1);
      expect(strokes[0]!.y0).toBeCloseTo(segments[0]!.top, 2);
      expect(strokes[0]!.y1).toBeCloseTo(segments[0]!.bottom, 2);
    });
  }

  it('rules one line beside one line, and flags no level cut where none was made', () => {
    const doc = build(para(2), plain());
    const page = doc.pages[0]!;
    expect(columnRuleSegments(page.columns, page.footnoteAreas)).toEqual([{ x: 200, top: 20, bottom: 32 }]);
    for (const c of page.columns) {
      expect(c.bbox.y + c.bbox.height).toBeCloseTo(32, 2);
      // Nothing is to be filled up to the cut: balancing must not read the
      // band as one a trailing cap cut.
      expect(c.trailingCap ?? false).toBe(false);
    }
  });

  it('leaves a band that takes a level cut as it was', () => {
    const doc = build(para(8), plain());
    const page = doc.pages[0]!;
    expect(page.columns.map((c) => c.trailingCap)).toEqual([true, true]);
    expect(page.columns.map((c) => c.blocks.reduce((n, b) => n + b.lines.length, 0))).toEqual([2, 2]);
    expect(columnRuleSegments(page.columns, page.footnoteAreas)).toEqual([{ x: 200, top: 20, bottom: 44 }]);
  });

  it('keeps an uneven band whole when trailing balance is off or a column break ended it', () => {
    const off = build(para(2), plain({ headings: { balancing: { trailing: false } } })).pages[0]!;
    expect(columnRuleSegments(off.columns, off.footnoteAreas)[0]!.bottom).toBeCloseTo(480, 2);
    const broken = build(`${para(2)}\n\n:::columnbreak\n\n${para(2)}`, plain()).pages[0]!;
    expect(broken.columns.map((c) => c.blocks.length)).toEqual([1, 1]);
    expect(columnRuleSegments(broken.columns, broken.footnoteAreas)[0]!.bottom).toBeCloseTo(480, 2);
  });

  it('runs the rule on to the notes at the foot of a column closed at its text', () => {
    const doc = build(`${WORD} note.[^a]\n\n[^a]: ${para(3)}`, plain({ footnotes: { placement: 'column' } }));
    const page = doc.pages[0]!;
    // The column ends under its one line; the note stays at the page's foot.
    expect(page.columns[0]!.bbox.y + page.columns[0]!.bbox.height).toBeCloseTo(32, 2);
    const area = page.footnoteAreas![0]!;
    expect(area.bbox.y + area.bbox.height).toBeCloseTo(480, 2);
    const note = doc.blocks.find((b) => b.footnoteNote === 'a')!;
    expect(note.bbox.y).toBeCloseTo(460, 1);
    expect(columnRuleSegments(page.columns, page.footnoteAreas)).toEqual([{ x: 200, top: 20, bottom: 480 }]);
  });

  it('lays out the same document twice the same way', () => {
    for (const lines of [1, 4]) {
      const first = JSON.stringify(build(para(lines * 2), plain()).pages);
      expect(JSON.stringify(build(para(lines * 2), plain()).pages)).toBe(first);
    }
  });
});
