import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTBlock, VDTColumn, VDTDocument } from '../../../index.js';

// #706, `headings.columnHeadSpace: 'remainder'`: a heading that snaps to the
// grid and opens a column drops its space above in whole grid lines only.
// What is left of a line stays above it, so its text starts as far under it
// as under the same heading set after a paragraph, and no body line moves.
// The default, `'none'`, keeps the heading on the column's first line.

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

const SENTENCE =
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
const para = (n: number): string => SENTENCE.repeat(n).trim();
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const LEAD = 12;

type Headings = NonNullable<PostextConfig['headings']>;
/** One column, body 9/12 pt, no paragraph spacing, balancing off. */
const base = (headings: Headings = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { sizePreset: 'custom', width: mm(120), height: mm(180) },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(9), lineHeight: pt(LEAD), paragraphSpacing: false },
  ...extra,
  headings: { balancing: { enabled: false }, columnHeadSpace: 'remainder', ...headings },
});
const build = (markdown: string, config: PostextConfig, resources?: Resource[]): VDTDocument =>
  buildDocument({ markdown, ...(resources ? { resources } : {}) }, config, createMeasurementCache());

const MD = [para(3), '', '## Mid column', '', para(3), '', ':::pagebreak', '', '## Column head', '', para(3)].join('\n');

interface Placed { block: VDTBlock; col: VDTColumn; next?: VDTBlock }
/** The heading whose first line starts with `text`, its column and the
 *  block after it. */
const find = (doc: VDTDocument, text: string): Placed => {
  for (const page of doc.pages) {
    for (const col of page.columns) {
      const i = col.blocks.findIndex((b) => b.type === 'heading' && b.lines[0]?.text.startsWith(text));
      if (i >= 0) return { block: col.blocks[i]!, col, ...(col.blocks[i + 1] ? { next: col.blocks[i + 1] } : {}) };
    }
  }
  throw new Error(`no heading "${text}"`);
};
/** Grid lines from the column's head to the heading's top, its box height,
 *  and from the foot of its last line to the first line of the text. */
const measure = (doc: VDTDocument, text: string) => {
  const { block, col, next } = find(doc, text);
  const G = doc.baselineGrid;
  const last = block.lines[block.lines.length - 1]!;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    top: round((block.bbox.y - col.bbox.y) / G),
    height: round(block.bbox.height / G),
    toText: next ? round((next.lines[0]!.bbox.y - (last.bbox.y + last.bbox.height)) / G) : NaN,
    textTop: next ? round((next.lines[0]!.bbox.y - col.bbox.y) / G) : NaN,
  };
};
/** Every body line of the document: page, column, y. */
const bodyLines = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type !== 'heading')
    .flatMap((b) => b.lines.map((l) => `${p.index}:${c.index}:${l.bbox.y.toFixed(2)}:${l.text}`))));

describe('headings.columnHeadSpace (#706)', () => {
  // technical-book: an H2 on a line of 1.5 leadings, half a leading above,
  // nothing below.
  const tech: Headings = { levels: [{ level: 2, fontSize: pt(12), lineHeight: pt(LEAD * 1.5), marginTop: pt(LEAD / 2), marginBottom: pt(0) }] };

  it('keeps the half line above a heading that opens a column, and the text follows it as in mid-column', () => {
    const doc = build(MD, base(tech));
    expect(measure(doc, 'Mid column')).toMatchObject({ height: 1.5, toText: 0 });
    expect(measure(doc, 'Column head')).toEqual({ top: 0.5, height: 1.5, toText: 0, textTop: 2 });
  });

  it('with \'none\', the default, drops the whole space and snaps under the heading', () => {
    const none = build(MD, base({ ...tech, columnHeadSpace: 'none' }));
    expect(measure(none, 'Column head')).toEqual({ top: 0, height: 2, toText: 0.5, textTop: 2 });
    // Unset, and any value the engine does not know, are 'none'.
    expect(JSON.stringify(build(MD, base({ ...tech, columnHeadSpace: undefined })).pages)).toBe(JSON.stringify(none.pages));
    expect(JSON.stringify(build(MD, base({ ...tech, columnHeadSpace: 'above' as never })).pages)).toBe(JSON.stringify(none.pages));
    // No body line stands anywhere else under either value.
    expect(bodyLines(build(MD, base(tech)))).toEqual(bodyLines(none));
  });

  it('on the default metrics moves an H2 and leaves an H3 where it is', () => {
    const defaults = (columnHeadSpace: 'remainder' | 'none' = 'remainder'): PostextConfig => ({
      page: { sizePreset: 'custom', width: mm(120), height: mm(180) },
      layout: { layoutType: 'single' },
      headings: { balancing: { enabled: false }, columnHeadSpace },
    });
    const md = (hashes: string) => [para(3), '', `${hashes} Mid column`, '', para(3), '', ':::pagebreak', '', `${hashes} Column head`, '', para(3)].join('\n');
    // H2, 15 pt on a 12 pt grid: after a paragraph its text starts 0.625
    // lines under its line; at a column head it starts 0.875 lines down.
    const h2 = build(md('##'), defaults());
    expect(measure(h2, 'Mid column').toText).toBeCloseTo(0.625, 3);
    expect(measure(h2, 'Column head')).toMatchObject({ top: 0.875, toText: 0.625 });
    expect(measure(build(md('##'), defaults('none')), 'Column head')).toMatchObject({ top: 0, toText: 1.5 });
    expect(bodyLines(h2)).toEqual(bodyLines(build(md('##'), defaults('none'))));
    // H3: closer to its text at a column head already; nothing to keep.
    const h3 = build(md('###'), defaults());
    expect(measure(h3, 'Column head')).toEqual(measure(build(md('###'), defaults('none')), 'Column head'));
    expect(measure(h3, 'Column head').top).toBe(0);
  });

  it('reads the paragraph spacing: a heading as far from its text at a column head as after a paragraph stays', () => {
    // manual-see-page-references' H3: one line tall, half a line above, a
    // quarter below, paragraphs a line apart.
    const manual = (columnHeadSpace: 'remainder' | 'none' = 'remainder'): PostextConfig => base(
      { levels: [{ level: 2, fontSize: pt(10), lineHeight: pt(LEAD), marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 4) }], columnHeadSpace },
      { bodyText: { fontSize: pt(9), lineHeight: pt(LEAD), paragraphSpacing: true } },
    );
    const doc = build(MD, manual());
    expect(measure(doc, 'Mid column').toText).toBe(1);
    expect(measure(doc, 'Column head')).toMatchObject({ top: 0, toText: 1 });
    expect(JSON.stringify(doc.pages)).toBe(JSON.stringify(build(MD, manual('none')).pages));
  });

  it('applies under a float that heads the column', () => {
    const figure: Resource = {
      id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'Figure.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 200 },
      placement: { position: 'top' },
    };
    const md = [`Intro :ref{id="fig"}.`, '', para(3), '', ':::pagebreak', '', '## Column head', '', para(3)].join('\n');
    // The figure is cited on page 1 and heads it; the heading opens page 2.
    const top = [`${para(2)}`, '', ':::pagebreak', '', `## Column head :ref{id="fig"}`, '', para(3)].join('\n');
    for (const markdown of [md, top]) {
      const doc = build(markdown, base(tech), [figure]);
      const none = build(markdown, base({ ...tech, columnHeadSpace: 'none' }), [figure]);
      const here = measure(doc, 'Column head');
      const there = measure(none, 'Column head');
      expect(here.toText).toBe(0);
      expect(here.top - there.top).toBeCloseTo(0.5, 3);
      expect(here.textTop).toBe(there.textTop);
      expect(bodyLines(doc)).toEqual(bodyLines(none));
    }
  });

  it('reads a run of headings as one block and keeps the space above the first', () => {
    const run: Headings = {
      levels: [
        { level: 2, fontSize: pt(12), lineHeight: pt(LEAD * 1.5), marginTop: pt(LEAD / 2), marginBottom: pt(3) },
        { level: 3, fontSize: pt(8), lineHeight: pt(LEAD / 2), marginTop: pt(3), marginBottom: pt(0) },
      ],
    };
    const md = [para(3), '', ':::pagebreak', '', '## Column head', '', '### Second of the run', '', para(3)].join('\n');
    const doc = build(md, base(run));
    const none = build(md, base({ ...run, columnHeadSpace: 'none' }));
    // The run is 1.5 + 0.25 + 0.5 = 2.25 lines and its foot snaps to the
    // third grid line: up to 1.27 the 0.75 of a line went under it.
    expect(measure(none, 'Column head').top).toBe(0);
    expect(measure(none, 'Second of the run')).toMatchObject({ top: 1.75, toText: 0.75, textTop: 3 });
    // The half line above the first heading is kept, and the rest follows.
    expect(measure(doc, 'Column head').top).toBe(0.5);
    expect(measure(doc, 'Second of the run')).toMatchObject({ top: 2.25, toText: 0.25, textTop: 3 });
    expect(bodyLines(doc)).toEqual(bodyLines(none));
  });

  it('leaves a heading that does not snap, a lineSpan band and a hidden heading at the column\'s head', () => {
    const cases: Headings[] = [
      { levels: [{ level: 2, fontSize: pt(12), lineHeight: pt(LEAD * 1.5), marginTop: pt(LEAD / 2), marginBottom: pt(0), snapToGrid: false }] },
      { snapToGrid: false, levels: [{ level: 2, fontSize: pt(12), lineHeight: pt(LEAD * 1.5), marginTop: pt(LEAD / 2), marginBottom: pt(0) }] },
      { levels: [{ level: 2, fontSize: pt(12), lineHeight: pt(LEAD * 1.5), marginTop: pt(LEAD / 2), marginBottom: pt(0), lineSpan: 2 }] },
    ];
    for (const headings of cases) {
      const doc = build(MD, base(headings));
      expect(measure(doc, 'Column head').top).toBe(0);
      expect(JSON.stringify(doc.pages)).toBe(JSON.stringify(build(MD, base({ ...headings, columnHeadSpace: 'none' })).pages));
    }
  });

  it('moves no body line in two columns, where one column opens with a heading', () => {
    const two = (columnHeadSpace: 'remainder' | 'none' = 'remainder'): PostextConfig => base(
      { ...tech, keepWithNext: true, columnHeadSpace },
      { layout: { layoutType: 'double' } },
    );
    const md = [para(4), '', ':::columnbreak', '', '## Column head', '', para(4), '', para(3)].join('\n');
    const doc = build(md, two());
    const none = build(md, two('none'));
    const head = find(doc, 'Column head');
    expect(head.col.index).toBe(1);
    expect(measure(doc, 'Column head')).toMatchObject({ top: 0.5, toText: 0 });
    expect(measure(none, 'Column head')).toMatchObject({ top: 0, toText: 0.5 });
    expect(bodyLines(doc)).toEqual(bodyLines(none));
    // The first column starts on the column's first line in both.
    expect(doc.pages[0]!.columns[0]!.blocks[0]!.bbox.y).toBeCloseTo(doc.pages[0]!.columns[0]!.bbox.y, 3);
  });
});
