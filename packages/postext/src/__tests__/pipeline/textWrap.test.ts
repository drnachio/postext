import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults';
import type { ContentWarning, PostextConfig, Resource, VDTBlock, VDTColumn, VDTDocument, VDTLine } from '../../index';

// #627 Phase 2: text wrapped round an inline picture narrower than its
// column (`placement: { position: 'here', wrap }`).

// 7 px a character, whatever the font.
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
/** A 260 px measure at 72 dpi; 10 px text on 14 px lines. */
const config = (extra: Partial<PostextConfig> = {}, body: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'justify', boldFontWeight: 700, hyphenation: { enabled: false }, ...body },
  ...extra,
});
const LINE = 14;
const LEFT = 20;
const MEASURE = 260;

const sentence = 'The heap needs a cubic metre of mixed waste before it holds its heat.';
const para = (n: number) => Array.from({ length: n }, () => sentence).join(' ');

const figure = (placement: Resource['placement'], id = 'fig', height = 300): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: 'A bed.', createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: 400, height },
  placement: { position: 'here', ...placement },
});
const table: Resource = {
  id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  table: { model: { rows: [[{ content: 'a' }, { content: 'b' }], [{ content: 'c' }, { content: 'd' }]] } },
};

const build = (md: string, resources: Resource[], cfg: PostextConfig = config()): VDTDocument =>
  buildDocument({ markdown: md, resources }, cfg, createMeasurementCache());

const blocksOf = (doc: VDTDocument, page = 0, col = 0): VDTBlock[] => doc.pages[page]!.columns[col]!.blocks;
const colOf = (doc: VDTDocument, page = 0, col = 0): VDTColumn => doc.pages[page]!.columns[col]!;
const resourceOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'resource')!;
const warnings = (doc: VDTDocument): Extract<ContentWarning, { kind: 'textWrap' }>[] =>
  (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'textWrap' }> => w.kind === 'textWrap');
const onGrid = (doc: VDTDocument, line: VDTLine): boolean => {
  const off = (line.bbox.y - doc.pages[0]!.contentArea.y) / doc.baselineGrid;
  return Math.abs(off - Math.round(off)) < 1e-6;
};
const inkWidth = (line: VDTLine): number => (line.segments ?? []).reduce((a, s) => a + s.width, 0) || line.bbox.width;
/** The width of a line's words (its spaces stretch or shrink when justified). */
const wordWidth = (line: VDTLine): number => (line.segments ?? []).filter((s) => s.kind !== 'space').reduce((a, s) => a + s.width, 0);
/** Every word of the paragraphs, in order. */
const words = (doc: VDTDocument): string[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.map((l) => l.text)).join(' ').split(/\s+/).filter(Boolean);

describe('an inline picture with wrap: the text after it runs beside it (#627)', () => {
  it('right: picture at the right edge, lines beside it short, then the full measure again', () => {
    const md = `${para(2)}\n\n::resource{id="fig"}\n\n${para(8)}`;
    const doc = build(md, [figure({ wrap: 'right', width: 0.4 })]);
    const col = colOf(doc);
    expect(col.exclusions).toHaveLength(1);
    const ex = col.exclusions![0]!;
    expect(ex.side).toBe('right');
    const fig = resourceOf(doc);
    const body = fig.resourceBlock!.bodyRect;
    // The picture's box ends flush with the column's right edge.
    expect(fig.bbox.x + body.x + body.width).toBeCloseTo(LEFT + MEASURE, 1);
    expect(body.width).toBeCloseTo(0.4 * MEASURE, 1);
    // The gap: one body line between the picture's box and the text.
    expect(ex.width).toBeCloseTo(0.4 * MEASURE + LINE, 1);
    expect(ex.x + ex.width).toBeCloseTo(LEFT + MEASURE, 1);
    // Its height covers picture, caption and gap in whole grid lines.
    expect(ex.height / LINE).toBeCloseTo(Math.round(ex.height / LINE), 6);
    expect(ex.y + ex.height).toBeGreaterThanOrEqual(fig.bbox.y + fig.bbox.height + LINE - 0.01);

    const wrapped = blocksOf(doc).filter((b) => b.type === 'paragraph')[1]!;
    // One paragraph: beside the picture and on under it, no split.
    expect(doc.blocks.filter((b) => b.contentIndex === wrapped.contentIndex)).toHaveLength(1);
    // The picture's top is level with the next line's top.
    expect(wrapped.lines[0]!.bbox.y).toBeCloseTo(fig.bbox.y, 6);
    let besideCount = 0;
    let belowCount = 0;
    wrapped.lines.forEach((line, i) => {
      expect(onGrid(doc, line)).toBe(true);
      if (i > 0) expect(line.bbox.y - wrapped.lines[i - 1]!.bbox.y).toBeCloseTo(LINE, 6);
      const beside = line.bbox.y < ex.y + ex.height - 0.01;
      expect(line.bbox.x).toBeCloseTo(LEFT, 6);
      if (beside) {
        besideCount++;
        expect(line.measure).toEqual({ x: LEFT, width: MEASURE - ex.width, wrap: true });
        expect(wordWidth(line)).toBeLessThanOrEqual(MEASURE - ex.width + 1);
      } else {
        belowCount++;
        expect(line.measure).toBeUndefined();
      }
    });
    expect(besideCount).toBeGreaterThanOrEqual(5);
    expect(belowCount).toBeGreaterThanOrEqual(3);
    expect(Math.max(...wrapped.lines.filter((l) => !l.measure && !l.isLastLine).map(inkWidth))).toBeGreaterThan(MEASURE - ex.width + 40);
    expect(words(doc)).toEqual(`${para(2)} ${para(8)}`.split(/\s+/));
    expect(warnings(doc)).toEqual([]);
  });

  it('left / start: the lines beside it start past it and its gap', () => {
    for (const wrap of ['left', 'start'] as const) {
      const doc = build(`${para(1)}\n\n::resource{id="fig"}\n\n${para(6)}`, [figure({ wrap, width: 0.4 })]);
      const ex = colOf(doc).exclusions![0]!;
      expect(ex.side).toBe('left');
      expect(ex.x).toBeCloseTo(LEFT, 6);
      const fig = resourceOf(doc);
      expect(fig.bbox.x + fig.resourceBlock!.bodyRect.x).toBeCloseTo(LEFT, 1);
      const p = blocksOf(doc).filter((b) => b.type === 'paragraph')[1]!;
      expect(p.lines[0]!.bbox.x).toBeCloseTo(LEFT + ex.width, 6);
      expect(p.lines[0]!.measure).toEqual({ x: LEFT + ex.width, width: MEASURE - ex.width, wrap: true });
      expect(p.lines[p.lines.length - 1]!.bbox.x).toBeCloseTo(LEFT, 6);
    }
  });

  it('runs every paragraph that comes while the picture is beside, ragged ones too', () => {
    const md = `::resource{id="fig"}\n\n${para(1)}\n\n${para(1)}\n\n${para(6)}`;
    const doc = build(md, [figure({ wrap: 'right', width: 0.4 })], config({}, { textAlign: 'left' }));
    const ex = colOf(doc).exclusions![0]!;
    const lines = blocksOf(doc).filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
    for (const l of lines) {
      const beside = l.bbox.y < ex.y + ex.height - 0.01;
      expect(!!l.measure).toBe(beside);
      if (beside) expect(l.bbox.width).toBeLessThanOrEqual(MEASURE - ex.width + 0.5);
    }
    expect(lines.filter((l) => l.measure).length).toBeGreaterThanOrEqual(5);
  });

  it('a heading, a display formula and an inline table that come beside it clear it', () => {
    for (const between of ['## A heading', '$$x^2$$', '::resource{id="t"}']) {
      const md = `::resource{id="fig"}\n\n${para(1)}\n\n${between}\n\n${para(4)}`;
      const doc = build(md, [figure({ wrap: 'right', width: 0.4 }), table]);
      const ex = colOf(doc).exclusions![0]!;
      const after = doc.blocks.find((b) => b.type === 'heading' || b.type === 'mathDisplay' || (b.type === 'resource' && b.resourceBlock?.resource.id === 't'))!;
      expect(after.bbox.y, between).toBeGreaterThanOrEqual(ex.y + ex.height - 0.01);
      // The text after it runs the full measure.
      const last = doc.blocks.filter((b) => b.type === 'paragraph').pop()!;
      expect(last.lines.every((l) => !l.measure), between).toBe(true);
      expect(onGrid(doc, last.lines[0]!), between).toBe(true);
    }
  });

  it('keeps today\'s band when the block after it cannot run beside it', () => {
    const doc = build(`${para(1)}\n\n::resource{id="fig"}\n\n## Heading\n\n${para(2)}`, [figure({ wrap: 'right', width: 0.4 })]);
    expect(colOf(doc).exclusions).toBeUndefined();
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const fig = resourceOf(doc);
    expect(heading.bbox.y).toBeGreaterThanOrEqual(fig.bbox.y + fig.bbox.height + LINE - 0.01);
  });

  it('a list item beside a picture on the left has its marker past the picture', () => {
    const doc = build(`::resource{id="fig"}\n\n- ${para(1)}\n- ${para(1)}`, [figure({ wrap: 'left', width: 0.4 })]);
    const ex = colOf(doc).exclusions![0]!;
    const items = doc.blocks.filter((b) => b.type === 'listItem');
    expect(items.length).toBe(2);
    for (const item of items) {
      if (item.lines[0]!.bbox.y >= ex.y + ex.height) continue;
      expect(item.bulletOffsetX!).toBeGreaterThanOrEqual(LEFT + ex.width - 0.01);
      expect(item.lines[0]!.bbox.x).toBeGreaterThan(item.bulletOffsetX!);
    }
  });

  it('a picture taller than the room left moves on with its anchor, and says so', () => {
    const md = `${para(15)}\n\n::resource{id="fig"}\n\n${para(6)}`;
    const doc = build(md, [figure({ wrap: 'right', width: 0.4 }, 'fig', 600)]);
    const fig = resourceOf(doc);
    expect(fig.pageIndex).toBe(1);
    expect(colOf(doc, 1).exclusions).toHaveLength(1);
    expect(warnings(doc).map((w) => [w.reason, w.resourceId])).toEqual([['moved', 'fig']]);
  });

  it('ends the wrap at the column\'s foot: the paragraph runs on full width in the next column', () => {
    // A tall picture near the page foot, a paragraph longer than the room.
    const md = `${para(12)}\n\n::resource{id="fig"}\n\n${para(14)}`;
    const doc = build(md, [figure({ wrap: 'right', width: 0.4 }, 'fig', 160)]);
    const fig = resourceOf(doc);
    expect(fig.pageIndex).toBe(0);
    const next = blocksOf(doc, 1)[0]!;
    expect(next.lines.every((l) => !l.measure)).toBe(true);
    expect(doc.pages[1]!.columns[0]!.exclusions).toBeUndefined();
    expect(words(doc)).toEqual(`${para(12)} ${para(14)}`.split(/\s+/));
    // The column of the picture ends at its foot.
    const col = colOf(doc);
    const last = col.blocks[col.blocks.length - 1]!;
    expect(last.lines[last.lines.length - 1]!.bbox.y + LINE).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.01);
  });

  it('too narrow a measure beside it, or too few lines: the picture takes its band, with a warning', () => {
    const narrow = build(`::resource{id="fig"}\n\n${para(4)}`, [figure({ wrap: 'right', width: 0.6 })]);
    expect(colOf(narrow).exclusions).toBeUndefined();
    expect(warnings(narrow).map((w) => w.reason)).toEqual(['tooNarrow']);
    expect(blocksOf(narrow).find((b) => b.type === 'paragraph')!.lines.every((l) => !l.measure)).toBe(true);

    const few = build(`::resource{id="fig"}\n\n${para(4)}`, [figure({ wrap: 'right', width: 0.4 })], config({ layout: { layoutType: 'single', wrap: { minLinesBeside: 40 } } }));
    expect(colOf(few).exclusions).toBeUndefined();
    expect(warnings(few).map((w) => w.reason)).toEqual(['fewLines']);

    // A share of the column, and a gap of its own.
    const share = build(`::resource{id="fig"}\n\n${para(4)}`, [figure({ wrap: 'right', width: 0.4 })], config({ layout: { layoutType: 'single', wrap: { minTextWidth: 0.7 } } }));
    expect(warnings(share).map((w) => w.reason)).toEqual(['tooNarrow']);
    const gap = build(`::resource{id="fig"}\n\n${para(4)}`, [figure({ wrap: 'right', width: 0.4, wrapGap: pt(20) })]);
    expect(colOf(gap).exclusions![0]!.width).toBeCloseTo(0.4 * MEASURE + 20, 1);
  });

  it('takes layout.wrap.defaultWidth when the placement sets no width', () => {
    const doc = build(`::resource{id="fig"}\n\n${para(4)}`, [figure({ wrap: 'right' })]);
    expect(resourceOf(doc).resourceBlock!.bodyRect.width).toBeCloseTo(0.45 * MEASURE, 1);
    const own = build(`::resource{id="fig"}\n\n${para(4)}`, [figure({ wrap: 'right' })], config({ layout: { layoutType: 'single', wrap: { defaultWidth: 0.3 } } }));
    expect(resourceOf(own).resourceBlock!.bodyRect.width).toBeCloseTo(0.3 * MEASURE, 1);
  });

  it('a drop cap next to a picture on the left stands past it, its lines short of both', () => {
    const cfg = config({ paragraphStyles: [{ id: 'cap', dropCap: { lines: 3 } }] });
    const doc = build(`::resource{id="fig"}\n\n:::paragraphs{style="cap"}\n${para(5)}\n:::`, [figure({ wrap: 'left', width: 0.4 })], cfg);
    const ex = colOf(doc).exclusions![0]!;
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.dropCap).toBeDefined();
    expect(p.dropCap!.x).toBeCloseTo(LEFT + ex.width, 1);
    for (const line of p.lines.slice(0, 3)) expect(line.bbox.x).toBeGreaterThan(LEFT + ex.width + p.dropCap!.width - 0.01);
  });

  it('line numbers stand beside the shortened lines', () => {
    const doc = build(`::resource{id="fig"}\n\n${para(6)}`, [figure({ wrap: 'right', width: 0.4 })], config({ lineNumbers: { enabled: true, count: 'all', interval: 1 } }));
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    const marks = doc.pages[0]!.lineNumberMarks!;
    expect(marks.length).toBe(p.lines.length);
    marks.forEach((m, i) => {
      const text = doc.pages[0]!.lineNumbers!.blocks[i]!;
      if (text.kind !== 'text') throw new Error('not text');
      expect(m.lineIndex).toBe(i);
      expect(text.lines[0]!.baselineY).toBeCloseTo(p.lines[i]!.baseline, 6);
    });
    expect(p.lines.filter((l) => l.measure).length).toBeGreaterThan(3);
  });

  it('builds the same twice', () => {
    const md = `${para(3)}\n\n::resource{id="fig"}\n\n${para(10)}\n\n## Next\n\n${para(20)}`;
    const shape = (doc: VDTDocument) => doc.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => [b.id, b.bbox.y, b.lines.map((l) => [l.text, l.bbox.x, l.bbox.y, l.measure?.width])])));
    const a = build(md, [figure({ wrap: 'right', width: 0.4 })]);
    const b = build(md, [figure({ wrap: 'right', width: 0.4 })]);
    expect(shape(a)).toEqual(shape(b));
  });

  it('two columns: the picture belongs to its column, the other runs full', () => {
    const md = `::resource{id="fig"}\n\n${para(40)}`;
    const wide = config({ layout: { layoutType: 'double', gutterWidth: pt(10) } });
    wide.page = { ...wide.page, width: pt(560) };
    const doc = build(md, [figure({ wrap: 'right', width: 0.4 })], wide);
    const c0 = colOf(doc, 0, 0);
    const c1 = colOf(doc, 0, 1);
    expect(c0.exclusions).toHaveLength(1);
    expect(c1.exclusions).toBeUndefined();
    expect(c1.blocks.flatMap((b) => b.lines).every((l) => !l.measure)).toBe(true);
    const ex = c0.exclusions![0]!;
    expect(ex.x + ex.width).toBeCloseTo(c0.bbox.x + c0.bbox.width, 6);
  });

  it('a right-to-left document wraps on the flow\'s sides, mirrored on the sheet', () => {
    const arabic = 'كان الكتاب على الطاولة وكان القارئ يقرأ بصوت هادئ في الغرفة الكبيرة.';
    const md = `::resource{id="fig"}\n\n${Array.from({ length: 6 }, () => arabic).join(' ')}`;
    const doc = build(md, [figure({ wrap: 'start', width: 0.4 })], config({ direction: 'rtl' } as Partial<PostextConfig>));
    const ex = colOf(doc).exclusions![0]!;
    expect(ex.side).toBe('left');
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.lines[0]!.measure?.wrap).toBe(true);
    expect(p.lines[0]!.measure!.width).toBeCloseTo(MEASURE - ex.width, 1);
  });
});

describe('layout.wrap (#627)', () => {
  it('resolves its defaults and strips them', () => {
    expect(resolveLayoutConfig().wrap).toEqual({ minTextWidth: { value: 12, unit: 'em' }, minLinesBeside: 2, defaultWidth: 0.45 });
    expect(resolveLayoutConfig({ wrap: { gap: pt(6), minTextWidth: 0.3, minLinesBeside: 3, defaultWidth: 0.5 } }).wrap)
      .toEqual({ gap: pt(6), minTextWidth: 0.3, minLinesBeside: 3, defaultWidth: 0.5 });
    // Misspelt values fall back to the defaults.
    expect(resolveLayoutConfig({ wrap: { minLinesBeside: 0, defaultWidth: 2, minTextWidth: 4 } }).wrap).toEqual(resolveLayoutConfig().wrap);
    expect(stripLayoutDefaults({ wrap: { minLinesBeside: 2, defaultWidth: 0.45, minTextWidth: { value: 12, unit: 'em' } } })).toBeUndefined();
    expect(stripLayoutDefaults({ wrap: { defaultWidth: 0.4 } })).toEqual({ wrap: { defaultWidth: 0.4 } });
  });
});

// #627 Phase 3: a column float with `wrap` at the head or foot of one
// column of a two-column page.
describe('a column float with wrap: the column\'s first or last lines run beside it (#627)', () => {
  const two = (extra: Partial<PostextConfig> = {}): PostextConfig => {
    const c = config({ layout: { layoutType: 'double', gutterWidth: pt(10) }, ...extra });
    c.page = { ...c.page, width: pt(560) };
    return c;
  };
  const floated = (position: 'top' | 'bottom', wrap: 'left' | 'right', span: 'column' | 'page' = 'column'): Resource => ({
    ...figure({ wrap, width: 0.45 }), placement: { position, span, wrap, width: 0.45 },
  });
  const md = `${para(4)} :ref{id="fig"}\n\n${para(30)}\n\n${para(30)}`;

  it('top: the float heads the next column at its side, the column\'s first lines beside it', () => {
    const doc = build(md, [floated('top', 'right')], two());
    const col = colOf(doc, 0, 1);
    expect(col.exclusions).toHaveLength(1);
    const ex = col.exclusions![0]!;
    const float = doc.pages[0]!.floats!.find((b) => b.id === 'float-fig')!;
    expect(ex.ownerId).toBe('float-fig');
    expect(ex.y).toBeCloseTo(col.bbox.y, 6);
    expect(float.bbox.y).toBeCloseTo(col.bbox.y, 6);
    expect(float.bbox.x + float.bbox.width).toBeCloseTo(col.bbox.x + col.bbox.width, 1);
    expect(ex.x + ex.width).toBeCloseTo(col.bbox.x + col.bbox.width, 1);
    // The column's text starts at its head, beside the float.
    const lines = col.blocks.flatMap((b) => b.lines);
    expect(lines[0]!.bbox.y).toBeCloseTo(col.bbox.y, 6);
    for (const l of lines) {
      const beside = l.bbox.y < ex.y + ex.height - 0.01;
      expect(!!l.measure, `${l.bbox.y}`).toBe(beside);
      if (beside) expect(l.measure!.width).toBeCloseTo(col.bbox.width - ex.width, 6);
    }
    expect(lines.filter((l) => l.measure).length).toBeGreaterThanOrEqual(5);
    // The other column runs full.
    expect(colOf(doc, 0, 0).blocks.flatMap((b) => b.lines).every((l) => !l.measure)).toBe(true);
    // The text is all there, in order (the reference prints its label).
    expect(words(doc).slice(-2 * para(30).split(' ').length)).toEqual(`${para(30)} ${para(30)}`.split(/\s+/));
  });

  it('bottom: the column\'s last lines run beside the float, the column fills to its foot', () => {
    const doc = build(md, [floated('bottom', 'left')], two());
    const col = colOf(doc, 0, 0);
    expect(col.exclusions).toHaveLength(1);
    const ex = col.exclusions![0]!;
    expect(ex.side).toBe('left');
    expect(ex.y + ex.height).toBeCloseTo(col.bbox.y + col.bbox.height, 1);
    const lines = col.blocks.flatMap((b) => b.lines);
    const beside = lines.filter((l) => l.bbox.y + LINE > ex.y + 0.01);
    expect(beside.length).toBeGreaterThanOrEqual(5);
    for (const l of beside) {
      expect(l.bbox.x).toBeCloseTo(col.bbox.x + ex.width, 6);
      expect(l.measure?.wrap).toBe(true);
    }
    // The last line reaches the column's foot.
    const last = lines[lines.length - 1]!;
    expect(last.bbox.y + LINE).toBeGreaterThan(col.bbox.y + col.bbox.height - LINE);
  });

  it('keeps the band when the column opens with a heading', () => {
    const doc = build(`${para(4)} :ref{id="fig"}\n\n${para(14)}\n\n## A heading\n\n${para(30)}`, [floated('top', 'right')], two());
    for (const page of doc.pages) for (const c of page.columns) {
      if (c.blocks[0]?.type === 'heading' && (page.floats ?? []).some((f) => f.columnIndex === c.index)) expect(c.exclusions).toBeUndefined();
    }
  });

  it('a page-span float keeps its band whole', () => {
    const doc = build(md, [floated('top', 'right', 'page')], two());
    for (const page of doc.pages) for (const c of page.columns) expect(c.exclusions).toBeUndefined();
  });

  it('a column with a wrapped float is left out of balancing, and the build settles', () => {
    const cfg = two({ headings: { balancing: { enabled: true } } } as Partial<PostextConfig>);
    const text = `${para(4)} :ref{id="fig"}\n\n${para(12)}\n\n## End\n\n${para(5)}`;
    const a = build(text, [floated('top', 'right')], cfg);
    const b = build(text, [floated('top', 'right')], cfg);
    const shape = (doc: VDTDocument) => doc.pages.map((p) => p.columns.map((c) => [c.exclusions?.length ?? 0, c.blocks.map((blk) => [blk.id, blk.bbox.y, blk.lines.map((l) => [l.text, l.bbox.x, l.measure?.width])])]));
    expect(shape(a)).toEqual(shape(b));
    for (const page of a.pages) for (const c of page.columns) {
      if (c.exclusions) for (const blk of c.blocks) expect(blk.balancing).toBeUndefined();
    }
  });
});

// #627 Phase 4: boxes text wraps round (`:::callout{wrap=… width=…}`).
describe('a box with wrap: pull quotes and sidebars (#627)', () => {
  it('here: the box sits at its side, the text after it runs beside it', () => {
    const md = `${para(1)}\n\n:::callout{wrap="right" width=0.4}\nA short pull quote set in the box.\n:::\n\n${para(6)}`;
    const doc = build(md, []);
    const col = colOf(doc);
    expect(col.exclusions).toHaveLength(1);
    const ex = col.exclusions![0]!;
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    expect(ex.ownerId).toBe(frame.id);
    expect(doc.pages[0]!.floats).toContain(frame);
    expect(frame.bbox.width).toBeCloseTo(0.4 * MEASURE, 1);
    expect(frame.bbox.x + frame.bbox.width).toBeCloseTo(LEFT + MEASURE, 1);
    const p = col.blocks.filter((b) => b.type === 'paragraph')[1]!;
    expect(p.lines[0]!.bbox.y).toBeCloseTo(frame.bbox.y, 6);
    expect(p.lines[0]!.measure).toEqual({ x: LEFT, width: MEASURE - ex.width, wrap: true });
    expect(p.lines[p.lines.length - 1]!.measure).toBeUndefined();
    // The box's text is inside its frame.
    for (const child of doc.blocks.filter((b) => b.containerId !== undefined && b.type !== 'callout')) {
      for (const l of child.lines) expect(l.bbox.x).toBeGreaterThanOrEqual(frame.bbox.x - 0.01);
    }
  });

  it('floated: a column box at the head of a column with its text beside it', () => {
    const c = config({ layout: { layoutType: 'double', gutterWidth: pt(10) } });
    c.page = { ...c.page, width: pt(560) };
    const md = `${para(4)}\n\n:::callout{placement="top" wrap="left" width=0.45}\nA sidebar of a few words, set in the box at the head of a column.\n:::\n\n${para(40)}`;
    const doc = build(md, [], c);
    const withEx = doc.pages.flatMap((p) => p.columns).filter((col) => col.exclusions);
    expect(withEx).toHaveLength(1);
    const col = withEx[0]!;
    const ex = col.exclusions![0]!;
    expect(ex.side).toBe('left');
    const first = col.blocks[0]!.lines[0]!;
    expect(first.bbox.y).toBeCloseTo(col.bbox.y, 6);
    expect(first.bbox.x).toBeCloseTo(col.bbox.x + ex.width, 6);
  });

  it('a box too wide to leave text beside it is set in the flow as any, with a warning', () => {
    const doc = build(`:::callout{wrap="right" width=0.7}\nA box.\n:::\n\n${para(3)}`, []);
    expect(colOf(doc).exclusions).toBeUndefined();
    expect(warnings(doc).map((w) => [w.reason, w.box !== undefined])).toEqual([['tooNarrow', true]]);
    expect(colOf(doc).blocks.some((b) => b.type === 'callout')).toBe(true);
  });
});

describe('text wrap in CJK and vertical text (#627)', () => {
  it('under a character grid the room a picture takes is whole characters', () => {
    const chinese = '春眠不觉晓处处闻啼鸟夜来风雨声花落知多少'.repeat(12);
    const doc = build(`::resource{id="fig"}\n\n${chinese}`, [figure({ wrap: 'right', width: 0.4 })], config({ locale: 'zh-Hans', cjk: { grid: { enabled: true, charsPerLine: 24 } } } as Partial<PostextConfig>));
    const ex = colOf(doc).exclusions![0]!;
    const em = 10;
    expect(ex.width / em).toBeCloseTo(Math.round(ex.width / em), 6);
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.lines[0]!.measure!.width / em).toBeCloseTo(Math.round(p.lines[0]!.measure!.width / em), 6);
  });

  it('vertical text keeps the band whole and says so; a type default warns in the config', () => {
    const cfg = config({ locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } } as Partial<PostextConfig>);
    const doc = build(`::resource{id="fig"}\n\n${'春眠不覚暁'.repeat(30)}`, [figure({ wrap: 'right', width: 0.4 })], cfg);
    expect(doc.pages.flatMap((p) => p.columns).some((c) => c.exclusions)).toBe(false);
    expect(warnings(doc).map((w) => w.reason)).toEqual(['verticalText']);
    const typed = buildDocument({ markdown: 'Text.', resources: [] }, { ...cfg, resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Figure', defaultPlacement: { wrap: 'start' } }] } as PostextConfig, createMeasurementCache());
    expect(typed.configWarnings?.filter((w) => w.kind === 'wrapUnsupported').map((w) => w.path)).toEqual(['resourceTypes[0].defaultPlacement.wrap']);
    const misspelt = buildDocument({ markdown: 'Text.', resources: [] }, { ...config(), resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Figure', defaultPlacement: { wrap: 'rigth' as never } }] } as PostextConfig, createMeasurementCache());
    expect(misspelt.configWarnings?.find((w) => w.kind === 'unknownConfigValue')?.suggestion).toBe('right');
  });
});
