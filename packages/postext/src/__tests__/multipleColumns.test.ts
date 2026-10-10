import { describe, it, expect } from 'vitest';
import { buildDocument } from '../index';
import { createMeasurementCache } from '../measure';
import { collectConfigWarnings } from '../configWarnings';
import { columnRuleSegments } from '../columnRule';
import type { PostextConfig, Resource } from '../types';
import type { VDTDocument, VDTPage } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const BODY = 'Body text that runs on for a while and keeps going. '.repeat(40);

/** An 800 × 1000pt page at 72 dpi, 30pt margins, 12pt gutters. */
const config = (columnCount: number, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(800), height: pt(1000), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'multiple', columnCount, gutterWidth: pt(12), columnRule: { enabled: true } },
  bodyText: { fontSize: pt(9), lineHeight: pt(11) },
  ...extra,
});

const picture = (id: string, placement: Resource['placement']): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: id, format: 'png', width: 400, height: 300 }, caption: `Caption ${id}`, placement,
});

const build = (markdown: string, cfg: PostextConfig, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

const textColumns = (page: VDTPage) => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
const floatOf = (doc: VDTDocument, id: string) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((f) => ({ page: p, f }))).find(({ f }) => f.resourceBlock?.resource.id === id);

describe('multiple layout (#505)', () => {
  it.each([3, 4, 6])('cuts the page into %i equal columns', (n) => {
    const doc = build(`${BODY}\n\n${BODY}\n\n${BODY}`, config(n));
    const cols = textColumns(doc.pages[0]!);
    expect(cols).toHaveLength(n);
    const width = (740 - (n - 1) * 12) / n;
    cols.forEach((c, i) => {
      expect(c.bbox.width).toBeCloseTo(width, 3);
      expect(c.bbox.x).toBeCloseTo(30 + i * (width + 12), 3);
    });
    // Every column takes text: the flow runs on from one to the next.
    expect(cols.every((c) => c.blocks.length > 0)).toBe(true);
  });

  it('rules every gutter', () => {
    const doc = build(`${BODY}\n\n${BODY}\n\n${BODY}\n\n${BODY}`, config(4));
    expect(columnRuleSegments(doc.pages[0]!.columns)).toHaveLength(3);
  });

  it('clamps a column count outside 3 … 8 and reports it', () => {
    expect(textColumns(build(BODY, config(12)).pages[0]!)).toHaveLength(8);
    expect(textColumns(build(BODY, config(2)).pages[0]!)).toHaveLength(3);
    expect(textColumns(build(BODY, config(4.4)).pages[0]!)).toHaveLength(4);
    expect(collectConfigWarnings(config(12))).toContainEqual(
      expect.objectContaining({ kind: 'columnCountClamped', path: 'layout.columnCount', value: '12', used: '8' }),
    );
    expect(collectConfigWarnings(config(5)).filter((w) => w.kind === 'columnCountClamped')).toEqual([]);
  });

  it('a section takes the document count unless it sets its own', () => {
    const md = `# One {style=wide}\n\n${BODY}\n\n# Two {style=narrow}\n\n${BODY}`;
    const doc = build(md, config(5, {
      headingStyles: [
        { id: 'wide', layout: { layoutType: 'multiple' } },
        { id: 'narrow', layout: { layoutType: 'multiple', columnCount: 3 } },
      ],
    }));
    const counts = doc.pages.map((p) => textColumns(p).length);
    expect(counts[0]).toBe(5);
    expect(counts[counts.length - 1]).toBe(3);
  });

  it('sets a page-span float across every column', () => {
    const doc = build(`${BODY} :ref{id="a"}\n\n${BODY}\n\n${BODY}`, config(4), [picture('a', { span: 'page', position: 'top' })]);
    const hit = floatOf(doc, 'a')!;
    expect(hit.f.bbox.width).toBeCloseTo(740, 3);
  });
});

describe('floats across several columns (#505)', () => {
  it('takes the measure of its columns and the gutters between them', () => {
    const doc = build(`${BODY} :ref{id="a"}\n\n${BODY}\n\n${BODY}\n\n${BODY}\n\n${BODY}`, config(4), [picture('a', { position: 'top', columns: 2 })]);
    const { page, f } = floatOf(doc, 'a')!;
    const cols = textColumns(page);
    const width = (740 - 3 * 12) / 4;
    expect(f.bbox.width).toBeCloseTo(2 * width + 12, 3);
    // The two columns under it start below it; the others do not.
    const under = cols.filter((c) => c.bbox.x >= f.bbox.x - 0.5 && c.bbox.x < f.bbox.x + f.bbox.width);
    expect(under).toHaveLength(2);
    for (const c of under) expect(c.bbox.y).toBeGreaterThan(f.bbox.y + f.bbox.height - 0.5);
    for (const c of cols.filter((c) => !under.includes(c))) expect(c.bbox.y).toBeLessThan(f.bbox.y + 0.5);
  });

  it('a float across as many columns as the page has is page-wide', () => {
    const doc = build(`${BODY} :ref{id="a"}\n\n${BODY}\n\n${BODY}`, config(3), [picture('a', { position: 'top', columns: 5 })]);
    expect(floatOf(doc, 'a')!.f.bbox.width).toBeCloseTo(740, 3);
  });

  it('a floated box takes its columns attribute', () => {
    const md = `${BODY}\n\n:::callout{placement="top" columns="3"}\nA story box across three columns with a few words in it.\n:::\n\n${BODY}\n\n${BODY}\n\n${BODY}`;
    const doc = build(md, config(5));
    const frame = doc.pages.flatMap((p) => p.floats ?? []).find((b) => b.type === 'callout');
    expect(frame).toBeDefined();
    const width = (740 - 4 * 12) / 5;
    expect(frame!.bbox.width).toBeCloseTo(3 * width + 2 * 12, 3);
  });

  it('a single column float is unchanged', () => {
    const doc = build(`${BODY} :ref{id="a"}\n\n${BODY}\n\n${BODY}`, config(4), [picture('a', { position: 'top' })]);
    expect(floatOf(doc, 'a')!.f.bbox.width).toBeCloseTo((740 - 3 * 12) / 4, 3);
  });
});

describe('column rules on a page of several columns (#505)', () => {
  const col = (index: number, x: number, y: number, height: number, blocks: number) => ({
    index, bbox: { x, y, width: 100, height }, availableHeight: 0, band: 0,
    blocks: Array.from({ length: blocks }, () => ({})),
  }) as unknown as VDTPage['columns'][number];

  it('rules the gutters of a column a float filled beside it, never through it', () => {
    // The third column is all picture: no height left, no text.
    const cols = [col(0, 0, 0, 500, 3), col(1, 110, 0, 500, 3), col(2, 220, 520, 0, 0), col(3, 330, 0, 500, 2)];
    const xs = columnRuleSegments(cols).map((s) => s.x);
    expect(xs).toEqual([105, 215, 325]);
  });

  it('leaves the gutters between the empty columns of a closing page unruled', () => {
    const cols = [col(0, 0, 0, 300, 4), col(1, 110, 200, 30, 0), col(2, 220, 200, 30, 0), col(3, 330, 200, 30, 0)];
    expect(columnRuleSegments(cols).map((s) => s.x)).toEqual([105]);
  });
});

describe('a closing page cut level keeps its floats (#505)', () => {
  it('never drains a float across several columns onto a page of its own', () => {
    const mmd = (value: number) => ({ value, unit: 'mm' as const });
    const para = (n: number) => 'Body text that runs on for a while and keeps going with words. '.repeat(n);
    const md = `# Front\n\n:::callout{span="page"}\n## Headline\n\nStandfirst line here.\n:::\n\n${para(9)}`
      + `\n\n::resource{id="m"}\n\n${para(9)}\n\n${para(9)}\n\n::resource{id="v"}\n\n## Second\n\n${para(9)}`
      + `\n\n${para(9)}\n\n:::callout{span="page" placement="bottom"}\nBriefs here, a few words.\n\nMore briefs.\n:::`
      + `\n\n# Next\n\n${para(4)}`;
    const wide = (id: string, columns: number): Resource => ({ ...picture(id, { position: 'top', span: 'column', columns }),
      bitmap: { fileId: id, format: 'png', width: 640, height: 480 } });
    const doc = buildDocument({ markdown: md, resources: [wide('m', 3), wide('v', 2)] }, {
      page: { dpi: 72, width: mmd(280), height: mmd(430), margins: { top: mmd(12), bottom: mmd(12), left: mmd(12), right: mmd(12) } },
      layout: { layoutType: 'multiple', columnCount: 4, gutterWidth: mmd(4.5) },
      bodyText: { fontSize: pt(8.8), lineHeight: pt(11.6) },
      headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
    }, createMeasurementCache());
    expect(doc.pages).toHaveLength(2);
    expect(floatOf(doc, 'v')!.page.index).toBe(0);
  });
});

describe('floats under a page-span opener (#639)', () => {
  const W = (740 - 3 * 12) / 4;
  const X = (i: number) => 30 + i * (W + 12);
  const LINE = 11;
  const headings = (span: 'page' | 'column', extra: Partial<PostextConfig> = {}): Partial<PostextConfig> => ({
    headings: { levels: [{ level: 1, span, breakBefore: { enabled: false } }] },
    calloutStyles: [{ id: 'note' }],
    ...extra,
  });
  const box = (attrs = '', text = 'Box text.') => `:::callout{type="note" placement="top"${attrs}}\n${text}\n:::`;
  const frameOf = (doc: VDTDocument) => (doc.pages[0]!.floats ?? []).find((b) => b.type === 'callout')!;
  const opener = (doc: VDTDocument) => doc.pages[0]!.columns[0]!.blocks[0]!;
  /** The y the first block after the opener starts at in column `i` (the
   *  first block of any other column). */
  const textTop = (doc: VDTDocument, i: number): number => textColumns(doc.pages[0]!)[i]!.blocks[i === 0 ? 1 : 0]!.bbox.y;
  /** The grid-rounded band a top float `height` px tall takes. */
  const band = (height: number): number => Math.ceil((height + LINE - 0.01) / LINE) * LINE;

  it('a box across two columns heads columns 1 and 2 under the opener', () => {
    const doc = build(`# Opener\n\n${box(' columns="2"')}\n\n${BODY}\n\n${BODY}`, config(4, headings('page')));
    const frame = frameOf(doc);
    const head = textColumns(doc.pages[0]!)[2]!.bbox.y;
    expect(frame.bbox.x).toBeCloseTo(X(0), 3);
    expect(frame.bbox.width).toBeCloseTo(2 * W + 12, 3);
    // Under the opener's band, level with the heads of the other columns.
    expect(frame.bbox.y).toBeGreaterThanOrEqual(opener(doc).bbox.y + opener(doc).bbox.height - 0.01);
    expect(frame.bbox.y).toBeCloseTo(head, 3);
    // The text of both columns starts under the box, on the same line.
    expect(textTop(doc, 0)).toBeCloseTo(frame.bbox.y + band(frame.bbox.height), 3);
    expect(textTop(doc, 1)).toBeCloseTo(textTop(doc, 0), 3);
    expect(textTop(doc, 2)).toBeCloseTo(head, 3);
    // The box of column 1 starts under the float, like column 2's; the
    // opener stays above it.
    const cols = textColumns(doc.pages[0]!);
    expect(cols[0]!.bbox.y).toBeCloseTo(cols[1]!.bbox.y, 3);
    expect(cols[0]!.bbox.y).toBeCloseTo(textTop(doc, 0), 3);
    expect(cols[0]!.blocks[0]).toBe(opener(doc));
    expect(cols[0]!.bbox.y + cols[0]!.bbox.height).toBeCloseTo(cols[3]!.bbox.y + cols[3]!.bbox.height, 3);
  });

  it('the column rule never runs through a float under the opener', () => {
    const box2 = build(`# Opener\n\n${box(' columns="2"')}\n\n${BODY}\n\n${BODY}`, config(4, headings('page')));
    const frame = frameOf(box2);
    const rules = columnRuleSegments(box2.pages[0]!.columns);
    // Gutter 1|2 starts under the box; gutter 2|3 runs beside it from the
    // band's head, where column 3 starts; gutter 3|4 too.
    expect(rules).toHaveLength(3);
    expect(rules[0]!.top).toBeCloseTo(frame.bbox.y + band(frame.bbox.height), 3);
    expect(rules[1]!.top).toBeCloseTo(frame.bbox.y, 3);
    expect(rules[1]!.x).toBeGreaterThan(frame.bbox.x + frame.bbox.width);
    expect(rules[2]!.top).toBeCloseTo(frame.bbox.y, 3);

    // A one-column box: the rule beside it runs the length of column 2,
    // right of the box.
    const box1 = build(`# Opener\n\n${box()}\n\n${BODY}\n\n${BODY}`, config(4, headings('page')));
    const one = frameOf(box1);
    const beside = columnRuleSegments(box1.pages[0]!.columns)[0]!;
    expect(beside.top).toBeCloseTo(one.bbox.y, 3);
    expect(beside.x).toBeGreaterThan(one.bbox.x + one.bbox.width);
  });

  it('a figure across two columns embedded after the opener does too', () => {
    const doc = build(`# Opener\n\n::resource{id="a"}\n\n${BODY}\n\n${BODY}`, config(4, headings('page')), [picture('a', { position: 'top', columns: 2 })]);
    const { page, f } = floatOf(doc, 'a')!;
    expect(page.index).toBe(0);
    expect(f.bbox.x).toBeCloseTo(X(0), 3);
    expect(f.bbox.width).toBeCloseTo(2 * W + 12, 3);
    expect(f.bbox.y).toBeCloseTo(textColumns(page)[2]!.bbox.y, 3);
    expect(textTop(doc, 0)).toBeCloseTo(f.bbox.y + band(f.bbox.height), 3);
    expect(textTop(doc, 1)).toBeCloseTo(textTop(doc, 0), 3);
  });

  it('a one-column box heads column 1, and a second one stacks under it', () => {
    const one = build(`# Opener\n\n${box()}\n\n${BODY}\n\n${BODY}`, config(4, headings('page')));
    const frame = frameOf(one);
    expect(frame.bbox.x).toBeCloseTo(X(0), 3);
    expect(frame.bbox.width).toBeCloseTo(W, 3);
    expect(frame.bbox.y).toBeCloseTo(textColumns(one.pages[0]!)[1]!.bbox.y, 3);
    expect(textTop(one, 0)).toBeCloseTo(frame.bbox.y + band(frame.bbox.height), 3);
    // Column 2 starts at its head, as before.
    expect(textTop(one, 1)).toBeCloseTo(frame.bbox.y, 3);

    const two = build(`# Opener\n\n${box()}\n\n${box('', 'Second box.')}\n\n${BODY}\n\n${BODY}`, config(4, headings('page')));
    const frames = two.pages[0]!.floats!.filter((b) => b.type === 'callout');
    expect(frames.map((b) => Math.round(b.bbox.x))).toEqual([Math.round(X(0)), Math.round(X(0))]);
    expect(frames[1]!.bbox.y).toBeCloseTo(frames[0]!.bbox.y + band(frames[0]!.bbox.height), 3);
    expect(textTop(two, 0)).toBeCloseTo(frames[1]!.bbox.y + band(frames[1]!.bbox.height), 3);
  });

  it('a heading right under the float starts there, with no space above it', () => {
    const cfg = config(4, { headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: false } }, { level: 2, marginTop: pt(22) }] }, calloutStyles: [{ id: 'note' }] });
    const doc = build(`# Opener\n\n${box()}\n\n## Sub\n\n${BODY}\n\n${BODY}`, cfg);
    const frame = frameOf(doc);
    expect(textTop(doc, 0)).toBeCloseTo(frame.bbox.y + band(frame.bbox.height), 3);
  });

  it('an opener set mid-page offers the head of its own column too', () => {
    const cfg = config(4, {
      headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: false } }, { level: 2, span: 'page', spanBreak: false }] },
      calloutStyles: [{ id: 'note' }],
    });
    const doc = build(`# Opener\n\n${BODY}\n\n## Mid\n\n${box(' columns="2"')}\n\n${BODY}`, cfg);
    const mid = doc.blocks.find((b) => b.type === 'heading' && b.headingLevel === 2)!;
    const frame = frameOf(doc);
    expect(mid.pageIndex).toBe(0);
    expect(mid.bbox.y).toBeGreaterThan(opener(doc).bbox.y + 100);
    expect(frame.bbox.x).toBeCloseTo(X(0), 3);
    expect(frame.bbox.y).toBeGreaterThanOrEqual(mid.bbox.y + mid.bbox.height - 0.01);
    const cols = doc.pages[0]!.columns.filter((c) => (c.band ?? 0) === (doc.pages[0]!.columns[mid.columnIndex]!.band ?? 0));
    expect(frame.bbox.y).toBeCloseTo(cols[2]!.bbox.y, 3);
  });

  it('text wraps round a narrow box under the opener as at any column head', () => {
    const two: PostextConfig = { ...config(4, headings('page')), layout: { layoutType: 'double' } };
    const doc = build(`# Opener\n\n${box(' wrap="left" width="0.4"', 'Wrapped box of a few words here that takes some lines.')}\n\n${BODY}\n\n${BODY}`, two);
    const frame = frameOf(doc);
    const col = doc.pages[0]!.columns[0]!;
    expect(frame.bbox.x).toBeCloseTo(col.bbox.x, 3);
    expect(doc.contentWarnings ?? []).toEqual([]);
    // The paragraph starts level with the box and its first lines run
    // beside it; the lines under it take the whole measure.
    const para = col.blocks[1]!;
    expect(para.bbox.y).toBeCloseTo(frame.bbox.y, 3);
    expect(para.lines[0]!.bbox.x).toBeGreaterThan(frame.bbox.x + frame.bbox.width - para.bbox.x - 0.01);
    expect(para.lines[0]!.bbox.width).toBeLessThan(col.bbox.width - frame.bbox.width);
    expect(para.lines[para.lines.length - 2]!.bbox.width).toBeGreaterThan(col.bbox.width - 40);
  });

  it('a float cited in the text still follows its citing line', () => {
    // The paragraph that cites it is set first (a float never stands above
    // the line that cites it), so column 1 has no head left.
    const doc = build(`# Opener\n\nSee :ref{id="a"}. ${BODY}\n\n${BODY}`, config(4, headings('page')), [picture('a', { position: 'top', columns: 2 })]);
    expect(floatOf(doc, 'a')!.f.bbox.x).toBeGreaterThan(X(1) - 0.5);
    expect(textTop(doc, 0)).toBeCloseTo(textColumns(doc.pages[0]!)[1]!.bbox.y, 3);
  });

  it("a span: 'column' heading keeps its column: the float lands from column 2, as before", () => {
    for (const markdown of [
      `# Opener\n\n${box(' columns="2"')}\n\n${BODY}\n\n${BODY}`,
      `# Opener\n\n${box()}\n\n${BODY}\n\n${BODY}`,
    ]) {
      const now = build(markdown, config(4, headings('column')));
      const off = build(markdown, config(4, headings('column', { layout: { layoutType: 'multiple', columnCount: 4, gutterWidth: pt(12), columnRule: { enabled: true }, floatsUnderOpener: false } })));
      expect(frameOf(now).bbox.x).toBeCloseTo(X(1), 3);
      expect(frameOf(now).bbox.y).toBeCloseTo(30, 3);
      expect(JSON.stringify(now.pages) === JSON.stringify(off.pages)).toBe(true);
    }
    const fig = build(`# Opener\n\n::resource{id="a"}\n\n${BODY}\n\n${BODY}`, config(4, headings('column')), [picture('a', { position: 'top', columns: 2 })]);
    expect(floatOf(fig, 'a')!.f.bbox.x).toBeCloseTo(X(1), 3);
  });

  it('a single text column under its opener is unchanged', () => {
    const markdown = `# Opener\n\n${box()}\n\n${BODY}\n\n${BODY}\n\n${BODY}`;
    // (A side column that only takes floats is no text column.)
    for (const layout of [{ layoutType: 'single' }, { layoutType: 'oneAndHalf', sideColumnRole: 'floats' }] as const) {
      const now = build(markdown, { ...config(4, headings('page')), layout });
      const off = build(markdown, { ...config(4, headings('page')), layout: { ...layout, floatsUnderOpener: false } });
      expect(JSON.stringify(now.pages) === JSON.stringify(off.pages)).toBe(true);
      expect(frameOf(now)).toBeUndefined();
    }
  });

  it('layout.floatsUnderOpener: false keeps the slots of postext 1.24', () => {
    const off = (span: 'page' | 'column') => config(4, headings(span, { layout: { layoutType: 'multiple', columnCount: 4, gutterWidth: pt(12), columnRule: { enabled: true }, floatsUnderOpener: false } }));
    const two = build(`# Opener\n\n${box(' columns="2"')}\n\n${BODY}\n\n${BODY}`, off('page'));
    expect(frameOf(two).bbox.x).toBeCloseTo(X(1), 3);
    expect(textTop(two, 0)).toBeCloseTo(textColumns(two.pages[0]!)[3]!.bbox.y, 3);
    const one = build(`# Opener\n\n${box()}\n\n${BODY}\n\n${BODY}`, off('page'));
    expect(frameOf(one).bbox.x).toBeCloseTo(X(1), 3);
    const fig = build(`# Opener\n\n::resource{id="a"}\n\n${BODY}\n\n${BODY}`, off('page'), [picture('a', { position: 'top', columns: 2 })]);
    expect(floatOf(fig, 'a')!.f.bbox.x).toBeCloseTo(X(1), 3);
  });

  it('does the same in vertical text', () => {
    const cfg: PostextConfig = { ...config(4, headings('page')), layout: { layoutType: 'multiple', columnCount: 4, gutterWidth: pt(12), writingMode: 'vertical-rl' } };
    const doc = build(`# Opener\n\n${box(' columns="2"')}\n\n${BODY}\n\n${BODY}`, cfg);
    const frame = frameOf(doc);
    const cols = textColumns(doc.pages[0]!);
    expect(frame.bbox.x).toBeCloseTo(cols[0]!.bbox.x, 3);
    expect(frame.bbox.width).toBeCloseTo(cols[1]!.bbox.x + cols[1]!.bbox.width - cols[0]!.bbox.x, 3);
    expect(frame.bbox.y).toBeCloseTo(cols[2]!.bbox.y, 3);
    expect(textTop(doc, 0)).toBeCloseTo(cols[1]!.bbox.y, 3);
  });
});
