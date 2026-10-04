import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { flowPageMirrored, pageMirrored } from '../../pipeline/buildHelpers';
import { mirroredLineOrder } from '../../pipeline/mirrorFrame';
import {
  flowRectToPage,
  flowToPage,
  pageIsMirrored,
  pageIsVertical,
  pageRectToFlow,
  pageToFlow,
  type BoundingBox,
  type VDTBlock,
  type VDTDocument,
  type VDTLine,
  type VDTPage,
} from '../../vdt';
import type { PostextConfig, Resource } from '../../types';
import { resolveParagraph, visualOrder } from '../../bidi';

// Issue #370: a right-to-left document lays its flow out as a left-to-right
// one and mirrors it onto the sheet (`VDTMirroredFlowFrame`).

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

// Latin placeholder text with marker words, so line order is checkable
// whatever the measurer does with Arabic.
const para = (i: number) => `Paragraph ${i} alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const svgFigure: Resource = {
  id: 'fig', typeId: 'figure', kind: 'svg', caption: 'A figure', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'file-fig', width: 200, height: 100 },
  placement: { position: 'top', span: 'column' },
};
const table: Resource = {
  id: 'tab', typeId: 'table', kind: 'table', caption: 'A table', createdAt: 0, updatedAt: 0,
  table: { model: { headerRowCount: 1, rows: [[{ content: 'First' }, { content: 'Second' }, { content: 'Third' }], [{ content: 'a1' }, { content: 'b1' }, { content: 'c1' }]] } },
  placement: { position: 'bottom', span: 'column' },
};

const MD = [
  ':::toc',
  ':::',
  '',
  '# الفصل الأول',
  '',
  'Opening words with a note[^1] and :ref{id="fig"} and :ref{id="tab"}.',
  '',
  '- alpha item',
  '- beta item',
  '',
  '1. first entry',
  '2. second entry',
  '',
  ':::callout{type="mark"}',
  'Callout body words set inside the box.',
  ':::',
  '',
  filler(10),
  '',
  '# الفصل الثاني',
  '',
  filler(6, 10),
  '',
  '[^1]: The note text of the first chapter.',
].join('\n');

function config(direction: 'ltr' | 'rtl', extra: Partial<PostextConfig> = {}): PostextConfig {
  return {
    direction,
    locale: 'en',
    page: {
      width: pt(420), height: pt(560),
      margins: { top: pt(30), bottom: pt(30), left: pt(50), right: pt(26), mirror: true },
      // The left-to-right twin is left-bound; the right-to-left book binds
      // on the right by default (#367).
      ...(direction === 'ltr' ? { binding: 'left' as const } : {}),
    },
    layout: { layoutType: 'double', gutterWidth: pt(14) },
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true } }] },
    calloutStyles: [{ id: 'mark', name: 'Mark', marker: { kind: 'glyph', glyph: '>', size: { value: 2, unit: 'em' } } }],
    ...extra,
  };
}

const build = (direction: 'ltr' | 'rtl', extra: Partial<PostextConfig> = {}, markdown = MD): VDTDocument =>
  buildDocument({ markdown, resources: [svgFigure, table] }, config(direction, extra));

function rounded<T>(v: T): T {
  if (typeof v === 'number') return (Math.round(v * 1e4) / 1e4) as T;
  if (Array.isArray(v)) return v.map(rounded) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)])) as T;
  return v;
}

/** Everything the flow lays out, minus the line order (which a mirrored
 *  page turns, see `mirrorFrame.ts`). */
function flowShape(doc: VDTDocument) {
  const line = (l: VDTLine) => ({ text: l.text, bbox: l.bbox, baseline: l.baseline });
  const block = (b: VDTBlock) => ({
    type: b.type, bbox: b.bbox, lines: b.lines.map(line),
    bullet: b.bulletOffsetX, separator: b.separatorX,
    overlay: b.designOverlay?.blocks.map((d) => ({ kind: d.kind, bbox: d.bbox })),
    resource: b.resourceBlock && {
      bodyRect: b.resourceBlock.bodyRect,
      caption: b.resourceBlock.captionLines.map(line),
      cells: b.resourceBlock.table?.cells.map((c) => ({ rect: c.rect, lines: c.lines.map(line) })),
    },
  });
  return rounded(doc.pages.map((p) => ({
    contentArea: p.contentArea,
    role: p.role,
    columns: p.columns.map((c) => ({ bbox: c.bbox, blocks: c.blocks.map(block) })),
    floats: (p.floats ?? []).map(block),
    footnotes: p.footnoteAreas?.map((a) => ({ bbox: a.bbox, rule: a.rule })),
    opener: p.openerBand?.bbox,
  })));
}

const blocksOf = (page: VDTPage): VDTBlock[] => [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])];
const right = (r: BoundingBox) => r.x + r.width;

describe('mirrored flow frame — helpers', () => {
  const page = { flow: { writingMode: 'horizontal-tb' as const, direction: 'rtl' as const, mirror: { originX: 400 } } };

  it('maps x to W − x and is its own inverse', () => {
    expect(flowToPage(page, 10, 20)).toEqual({ x: 390, y: 20 });
    expect(pageToFlow(page, 390, 20)).toEqual({ x: 10, y: 20 });
    for (const [x, y] of [[0, 0], [17.5, 3], [399, 299]] as const) {
      const p = flowToPage(page, x, y);
      expect(pageToFlow(page, p.x, p.y)).toEqual({ x, y });
    }
  });

  it('mirrors rects, keeping width and height', () => {
    const r = { x: 10, y: 20, width: 100, height: 30 };
    expect(flowRectToPage(page, r)).toEqual({ x: 290, y: 20, width: 100, height: 30 });
    expect(pageRectToFlow(page, flowRectToPage(page, r))).toEqual(r);
  });

  it('tells a mirrored page from a vertical one', () => {
    expect(pageIsMirrored(page)).toBe(true);
    expect(pageIsVertical(page)).toBe(false);
    const vertical = { flow: { writingMode: 'vertical-rl' as const, rotation: { direction: 'cw' as const, originX: 300, originY: 0, width: 420, height: 300 } } };
    expect(pageIsVertical(vertical)).toBe(true);
    expect(pageIsMirrored(vertical)).toBe(false);
    expect(pageIsMirrored({})).toBe(false);
    expect(pageIsVertical({})).toBe(false);
  });

  it('reverses a line order, dropping it when that is the logical order', () => {
    expect(mirroredLineOrder(undefined, 3)).toEqual([2, 1, 0]);
    expect(mirroredLineOrder([2, 1, 0], 3)).toBeUndefined();
    expect(mirroredLineOrder([3, 4, 2, 0, 1], 5)).toEqual([1, 0, 2, 4, 3]);
  });
});

describe('a right-to-left document', () => {
  const ltr = build('ltr');
  const rtl = build('rtl');

  it('gives every page the mirrored frame, and none to a left-to-right one', () => {
    expect(rtl.binding).toBe('right');
    expect(rtl.pages.length).toBeGreaterThan(3);
    for (const page of rtl.pages) expect(page.flow).toEqual({ writingMode: 'horizontal-tb', direction: 'rtl', mirror: { originX: page.width } });
    for (const page of ltr.pages) expect(page.flow).toBeUndefined();
  });

  it('lays its flow out as the left-bound left-to-right book does', () => {
    expect(rtl.pages.length).toBe(ltr.pages.length);
    expect(flowShape(rtl)).toEqual(flowShape(ltr));
  });

  it('puts the first column on the right of the sheet', () => {
    for (const page of rtl.pages) {
      if (page.columns.length < 2) continue;
      const [first, second] = page.columns.map((c) => flowRectToPage(page, c.bbox));
      expect(first!.x).toBeGreaterThan(right(second!));
    }
  });

  it('turns the margins over: the inner margin faces the spine on the right of a recto', () => {
    const trim = rtl.trimOffset;
    const [recto, verso] = rtl.pages.map((p) => flowRectToPage(p, p.contentArea));
    // Page 1 of a right-bound book is a recto whose spine is on its right:
    // the inner margin (written `left`, 50 pt) is on the right.
    const W = rtl.pages[0]!.width;
    const pt2px = (v: number) => (v * rtl.config.page.dpi) / 72;
    expect(W - trim - right(recto!)).toBeCloseTo(pt2px(50), 4);
    expect(recto!.x - trim).toBeCloseTo(pt2px(26), 4);
    expect(verso!.x - trim).toBeCloseTo(pt2px(50), 4);
  });

  it('hangs list markers on the right of their text', () => {
    const page = rtl.pages.find((p) => blocksOf(p).some((b) => b.bulletText))!;
    for (const b of blocksOf(page).filter((x) => x.bulletText && x.bulletOffsetX !== undefined)) {
      const marker = flowToPage(page, b.bulletOffsetX!, 0).x;
      const textRight = right(flowRectToPage(page, b.lines[0]!.bbox));
      expect(marker).toBeGreaterThanOrEqual(textRight - 0.5);
    }
  });

  it('draws the footnote rule from the right end of the column', () => {
    const page = rtl.pages.find((p) => p.footnoteAreas?.some((a) => a.rule))!;
    const area = page.footnoteAreas!.find((a) => a.rule)!;
    const col = flowRectToPage(page, page.columns[area.columnIndex]!.bbox);
    const rule = flowRectToPage(page, { x: area.rule!.x, y: area.rule!.y, width: area.rule!.width, height: 1 });
    expect(right(rule)).toBeCloseTo(right(col), 4);
    expect(rule.x).toBeGreaterThan(col.x + 1);
  });

  it('sets the contents page numbers on the left of their titles', () => {
    const page = rtl.pages[0]!;
    const entries = blocksOf(page).filter((b) => b.tocEntry && b.lines[0]?.segments && b.lines[0].segments.length > 1);
    expect(entries.length).toBeGreaterThan(0);
    for (const b of entries) {
      const line = b.lines[0]!;
      const segs = line.segments!;
      // The order the measurer gives the row of an Arabic title in a
      // right-to-left paragraph (the visual order of its bidi levels:
      // number, leader, title), turned for the mirrored flow: the title
      // first, at the flow's left.
      const par = resolveParagraph(segs.map((s) => s.text).join(''), 'rtl');
      let at0 = 0;
      const levels = segs.map((s) => { const l = par.levels[at0] ?? 1; at0 += s.text.length; return l; });
      const order = mirroredLineOrder(visualOrder(levels), segs.length) ?? segs.map((_, i) => i);
      let x = line.bbox.x;
      const at = new Map<number, number>();
      for (const i of order) { at.set(i, x); x += segs[i]!.width; }
      const label = segs.length - 1;
      const title = segs.findIndex((s) => s.kind === 'text');
      expect(flowToPage(page, at.get(label)!, 0).x).toBeLessThan(flowToPage(page, at.get(title)!, 0).x);
    }
  });

  it('puts the first column of a table on the right', () => {
    const blk = rtl.pages.flatMap(blocksOf).find((b) => b.resourceBlock?.table)!;
    const page = rtl.pages[blk.pageIndex]!;
    const cells = blk.resourceBlock!.table!.cells.filter((c) => c.row === 0);
    const first = flowRectToPage(page, cells.find((c) => c.col === 0)!.rect);
    const last = flowRectToPage(page, cells.find((c) => c.col === 2)!.rect);
    expect(first.x).toBeGreaterThan(last.x);
  });

  it('sets a callout marker column on the right of its box', () => {
    const frame = rtl.blocks.find((b) => b.type === 'callout')!;
    const page = rtl.pages[frame.pageIndex]!;
    const marker = frame.designOverlay!.blocks.find((d) => d.kind === 'text')!;
    const box = frame.designOverlay!.blocks.find((d) => d.kind === 'box')!;
    expect(flowRectToPage(page, marker.bbox).x).toBeGreaterThan(flowRectToPage(page, box.bbox).x);
  });

  it('advances the words of a Latin line in reverse in the flow, so they read left to right on the sheet', () => {
    const line = rtl.blocks.flatMap((b) => b.lines).find((l) => l.text.startsWith('Paragraph 3 '))!;
    const twin = ltr.blocks.flatMap((b) => b.lines).find((l) => l.text === line.text)!;
    const n = line.segments!.length;
    expect(twin.order).toBeUndefined();
    expect(line.order).toEqual(Array.from({ length: n }, (_, i) => n - 1 - i));
    // Shared measured lines are never changed in place: the left-to-right
    // twin's are untouched, and so is the line built again.
    const again = build('rtl').blocks.flatMap((b) => b.lines).find((l) => l.text === line.text)!;
    expect(again.order).toEqual(line.order);
  });
});

describe('parity in the mirrored flow', () => {
  it('is the physical parity turned over, with mirrored margins only', () => {
    const doc = build('rtl');
    for (const page of doc.pages) {
      expect(flowPageMirrored(doc.config, page)).toBe(!pageMirrored(doc.config, page.index));
    }
    const plain = build('rtl', { page: { ...config('rtl').page, margins: { ...config('rtl').page!.margins, mirror: false } } });
    for (const page of plain.pages) expect(flowPageMirrored(plain.config, page)).toBe(false);
  });

  it('keeps an outer side column on the side away from the spine', () => {
    const extra: Partial<PostextConfig> = {
      layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'outer' },
    };
    const doc = build('rtl', extra, filler(30));
    const twin = build('ltr', extra, filler(30));
    expect(flowShape(doc)).toEqual(flowShape(twin));
    for (const page of doc.pages.slice(0, 2)) {
      const [main, side] = page.columns.map((c) => flowRectToPage(page, c.bbox));
      // A recto (odd page) of a right-bound book has its spine on the right.
      const recto = page.index % 2 === 0;
      if (recto) expect(side!.x).toBeLessThan(main!.x);
      else expect(side!.x).toBeGreaterThan(main!.x);
    }
  });
});

describe('part pages of a right-to-left document', () => {
  it('are mirrored as the body pages are', () => {
    const md = `${filler(2)}\n\n:::part{number="I" title="Foundations"}\n:::\n\n# Chapter\n\n${filler(2)}`;
    const extra: Partial<PostextConfig> = { parts: { margins: { top: pt(60), left: pt(40), right: pt(20), bottom: pt(12) } } };
    const doc = build('rtl', extra, md);
    const twin = build('ltr', extra, md);
    const part = doc.pages.find((p) => p.partInfo)!;
    expect(pageIsMirrored(part)).toBe(true);
    const twinPart = twin.pages[part.index]!;
    expect(twinPart.partInfo).toBeDefined();
    expect(rounded(part.contentArea)).toEqual(rounded(twinPart.contentArea));
    expect(rounded(flowRectToPage(part, part.contentArea))).toEqual(rounded({
      ...twinPart.contentArea, x: part.width - right(twinPart.contentArea),
    }));
  });
});

describe('turned figures of a right-to-left document', () => {
  it('turn the other way in the flow, so the sheet shows the turn asked for', () => {
    const turned = (rotate: 'ccw' | 'cw'): Resource => ({ ...svgFigure, id: 'wide', placement: { position: 'top', rotate } });
    for (const rotate of ['ccw', 'cw'] as const) {
      const md = `See :ref{id="wide"}.\n\n${filler(8)}`;
      const ltr = buildDocument({ markdown: md, resources: [turned(rotate)] }, config('ltr'));
      const rtl = buildDocument({ markdown: md, resources: [turned(rotate)] }, config('rtl'));
      const of = (d: VDTDocument) => d.pages.flatMap((p) => p.floats ?? []).find((b) => b.resourceBlock?.rotation)!.resourceBlock!.rotation!;
      expect(of(ltr).direction).toBe(rotate);
      expect(of(rtl).direction).toBe(rotate === 'ccw' ? 'cw' : 'ccw');
    }
  });
});

describe('a vertical right-to-left document', () => {
  it('keeps the vertical frame', () => {
    const doc = buildDocument({ markdown: '此開卷第一回也。' }, { locale: 'zh-Hant', direction: 'rtl', layout: { writingMode: 'vertical-rl' } });
    for (const page of doc.pages) expect(pageIsVertical(page)).toBe(true);
  });
});
