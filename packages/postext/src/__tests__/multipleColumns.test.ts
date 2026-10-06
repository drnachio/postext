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
