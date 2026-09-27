import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { collectContentWarnings, formatWarning } from '../pipeline/contentWarnings';
import type { ContentWarning } from '../vdt';
import type { PostextConfig, Resource, TableModel } from '../types';

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

const table = (id: string, model: TableModel, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: 'A table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model },
  ...extra,
});

const figure = (id: string, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `file-${id}`, format: 'png', width: 400, height: 300 },
  placement: { position: 'here' },
  ...extra,
});

const square: TableModel = { headerRowCount: 1, rows: [[{ content: 'H' }, { content: 'I' }], [{ content: '1' }, { content: '2' }]] };

function kinds(ws: readonly ContentWarning[] | undefined): string[] {
  return (ws ?? []).map((w) => w.kind);
}

function only<K extends ContentWarning['kind']>(ws: readonly ContentWarning[] | undefined, kind: K) {
  return (ws ?? []).filter((w): w is Extract<ContentWarning, { kind: K }> => w.kind === kind);
}

describe('doc.contentWarnings — unknown ids and markup', () => {
  it('leaves a clean document without warnings', () => {
    const doc = buildDocument(
      { markdown: '# Title\n\nSee :ref{id="t1"}.\n\n::resource{id="t1"}\n', resources: [table('t1', square)] },
      {},
    );
    expect(doc.contentWarnings).toBeUndefined();
  });

  it('reports an unknown :ref id at the reference, on its page', () => {
    const md = '# Title\n\nSee :ref{id="fig-nope"} for details.\n';
    const doc = buildDocument({ markdown: md }, {});
    const [w] = only(doc.contentWarnings, 'unknownResourceId');
    expect(w).toMatchObject({ kind: 'unknownResourceId', resourceId: 'fig-nope', usage: 'ref', pageIndex: 0 });
    expect(md.slice(w!.sourceStart, w!.sourceEnd)).toBe(':ref{id="fig-nope"}');
  });

  it('reports an unknown ::resource embed without a page', () => {
    const md = 'Text.\n\n::resource{id="ghost"}\n';
    const doc = buildDocument({ markdown: md }, {});
    const [w] = only(doc.contentWarnings, 'unknownResourceId');
    expect(w).toMatchObject({ resourceId: 'ghost', usage: 'embed' });
    expect(w!.pageIndex).toBeUndefined();
    expect(md.slice(w!.sourceStart, w!.sourceEnd)).toBe('::resource{id="ghost"}');
  });

  it('reports a :::name line the parser sets as text', () => {
    const md = 'Intro.\n\n:::banana\ntext\n\n  :::sidebar with words\n\n$$\n:::inmath\n$$\n\n:::pagebreak\n';
    const doc = buildDocument({ markdown: md }, {});
    const found = only(doc.contentWarnings, 'unknownDirective');
    expect(found.map((w) => w.name)).toEqual(['banana', 'sidebar']);
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe(':::banana');
    expect(md.slice(found[1]!.sourceStart, found[1]!.sourceEnd)).toBe(':::sidebar with words');
    expect(found[0]!.pageIndex).toBe(0);
  });

  it('reports a :: embed line set as text: malformed, or glued under a paragraph', () => {
    const md = 'Text.\n\n::resource{id=fig}\n\nMore text\n::resource{id="fig"}\n\n::resource{id="fig"}\n';
    const doc = buildDocument({ markdown: md, resources: [figure('fig')] }, {});
    const found = only(doc.contentWarnings, 'malformedEmbed');
    expect(found.map((w) => md.slice(w.sourceStart, w.sourceEnd))).toEqual(['::resource{id=fig}', '::resource{id="fig"}']);
    expect(found[0]).toMatchObject({ name: 'resource', pageIndex: 0 });
    // The well-formed embed on its own line is not reported.
    expect(found[1]!.sourceStart).toBe(md.indexOf('::resource{id="fig"}'));
  });

  it('reports a line only when it reads as an embed, not prose that opens with ::', () => {
    const md = '::before and ::after are pseudo-elements.\n\n::figure{id="fig"}\n\n::resource\n';
    const found = only(buildDocument({ markdown: md, resources: [figure('fig')] }, {}).contentWarnings, 'malformedEmbed');
    expect(found.map((w) => [w.name, md.slice(w.sourceStart, w.sourceEnd)])).toEqual([
      ['figure', '::figure{id="fig"}'],
      ['resource', '::resource'],
    ]);
  });

  it('keeps offsets absolute past the frontmatter', () => {
    const md = '---\ntitle: T\n---\n\nSee :ref{id="nope"}.\n';
    const doc = buildDocument({ markdown: md }, {});
    const [w] = only(doc.contentWarnings, 'unknownResourceId');
    expect(md.slice(w!.sourceStart, w!.sourceEnd)).toBe(':ref{id="nope"}');
  });

  it('reports unknown paragraph, callout, chip and heading style ids', () => {
    const md = [
      '# Preface {style="front"}',
      '',
      ':::paragraphs{style="biblio"}',
      'Entry.',
      ':::',
      '',
      ':::callout{type="danger"}',
      'Careful :chip[x]{style="pill"}.',
      ':::',
    ].join('\n');
    const config: PostextConfig = { calloutStyles: [{ id: 'note' }] };
    const doc = buildDocument({ markdown: md }, config);
    expect(kinds(doc.contentWarnings)).toEqual(['unknownHeadingStyle', 'unknownParagraphStyle', 'unknownCalloutType', 'unknownChipStyle']);
    expect(doc.contentWarnings!.map((w) => w.pageIndex)).toEqual([0, 0, 0, 0]);
    const [h] = only(doc.contentWarnings, 'unknownHeadingStyle');
    expect(h).toMatchObject({ style: 'front', level: 1 });
    expect(md.slice(h!.sourceStart, h!.sourceEnd)).toBe('# Preface {style="front');
    const [chip] = only(doc.contentWarnings, 'unknownChipStyle');
    expect(md.slice(chip!.sourceStart, chip!.sourceEnd)).toBe(':chip[x]{style="pill"}');
    expect(only(doc.contentWarnings, 'unknownCalloutType')[0]!.type).toBe('danger');
  });

  it('does not flag styles the configuration declares, nor callout types without callout styles', () => {
    const md = '# Preface {style="front"}\n\n:::paragraphs{style="biblio"}\nEntry.\n:::\n\n:::callout{type="tip"}\nText :chip[x].\n:::\n';
    const config: PostextConfig = { headingStyles: [{ id: 'front' }], paragraphStyles: [{ id: 'biblio' }] };
    expect(buildDocument({ markdown: md }, config).contentWarnings).toBeUndefined();
  });

  it('reports a table style id no style declares, at the table', () => {
    const md = 'Text :ref{id="t1"}.\n\n::resource{id="t1"}\n';
    const resources = [table('t1', square, { table: { model: square, styleId: 'zebra' } })];
    const doc = buildDocument({ markdown: md, resources }, { tableStyles: [{ id: 'plain' }] });
    const [w] = only(doc.contentWarnings, 'unknownTableStyle');
    expect(w).toMatchObject({ styleId: 'zebra', resourceId: 't1', pageIndex: 0 });
    expect(md.slice(w!.sourceStart, w!.sourceEnd)).toBe(':ref{id="t1"}');
  });

  it('treats a null table style id as no named style', () => {
    const md = 'Text :ref{id="t1"}.\n\n::resource{id="t1"}\n';
    const model = { model: square, styleId: null } as unknown as NonNullable<Resource['table']>;
    const resources = [table('t1', square, { table: model })];
    const doc = buildDocument({ markdown: md, resources }, { tableStyles: [{ id: 'plain' }] });
    expect(doc.contentWarnings?.filter((w) => w.kind === 'unknownTableStyle') ?? []).toEqual([]);
  });

  it('reports a ragged merged grid once per table', () => {
    const ragged: TableModel = {
      rows: [
        [{ content: 'A', colSpan: 2, isHeader: true }, { content: 'C', isHeader: true }],
        [{ content: '1' }, { content: '2' }, { content: '3' }],
      ],
    };
    const doc = buildDocument({ markdown: '::resource{id="t1"}\n', resources: [table('t1', ragged)] }, {});
    const found = only(doc.contentWarnings, 'raggedTableGrid');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ resourceId: 't1', reason: 'spanOverlap', row: 0, col: 1, count: 2 });
  });

  it('reports unknown refs and chip styles in the captions and cells of the resources used', () => {
    // A resource's repeats are reported once: they all point at its first use.
    const cells: TableModel = {
      rows: [
        [{ content: 'See :ref{id="nope"}', image: { resourceId: 'pic' } }, { content: ':chip[a]{style="bad"}' }],
        [{ content: 'Again :ref{id="nope"}', image: { resourceId: 'pic' } }, { content: ':chip[b]{style="bad"}' }],
      ],
    };
    const resources = [
      table('t1', cells, { caption: 'Compare :ref{id="missing"}.' }),
      figure('unused', { caption: ':ref{id="elsewhere"}' }),
    ];
    const ws = collectContentWarnings('::resource{id="t1"}\n', {}, resources);
    expect(ws.map((w) => [w.kind, 'resourceId' in w ? w.resourceId : 'style' in w ? w.style : '', 'inResource' in w ? w.inResource : ''])).toEqual([
      ['unknownResourceId', 'missing', 't1'],
      ['unknownResourceId', 'nope', 't1'],
      ['unknownResourceId', 'pic', 't1'],
      ['unknownChipStyle', 'bad', 't1'],
    ]);
    expect(ws.find((w) => w.kind === 'unknownResourceId' && w.resourceId === 'pic')).toMatchObject({ usage: 'cellImage' });
  });

  it('keeps the layout identical: warnings only add to doc.contentWarnings', () => {
    const md = '# Title\n\nSee :ref{id="nope"} and :::nothing.\n\n:::banana\n';
    const doc = buildDocument({ markdown: md }, {});
    const { contentWarnings, ...rest } = doc;
    expect(kinds(contentWarnings)).toEqual(['unknownResourceId', 'unknownDirective']);
    const again = buildDocument({ markdown: md }, {});
    expect(again.pages.length).toBe(rest.pages.length);
  });

  // `doc.warnings` keeps the shape it had in postext 1.4 — boxes the layout
  // had to force, each with a page, a column and an overflow — so code
  // written against it (`w.overflowPx.toFixed(1)`) keeps working.
  it('leaves doc.warnings to the layout warnings, as in postext 1.4', () => {
    const md = '# Title\n\nSee :ref{id="x"}.\n\n::resource{id="nope"}\n\n:::banana\n';
    const doc = buildDocument({ markdown: md }, {});
    expect(doc.warnings).toBeUndefined();
    expect(kinds(doc.contentWarnings)).toEqual(['unknownResourceId', 'unknownResourceId', 'unknownDirective']);
    for (const w of doc.warnings ?? []) {
      expect(typeof w.pageIndex).toBe('number');
      expect(typeof w.columnIndex).toBe('number');
      expect(w.overflowPx.toFixed(1)).toMatch(/^\d/);
    }
  });
});

describe('formatWarning', () => {
  it('describes every kind in one line', () => {
    expect(formatWarning({ kind: 'unknownResourceId', resourceId: 'fig-map', usage: 'ref', sourceStart: 314, pageIndex: 1 }))
      .toBe('Unknown resource id "fig-map" in :ref — it prints "?" (or its text= label), with no number or link (page 2, offset 314)');
    expect(formatWarning({ kind: 'unknownDirective', name: 'banana' })).toBe('Unknown directive ":::banana" — the line is set as text');
    expect(formatWarning({ kind: 'calloutOverflow', pageIndex: 0, columnIndex: 0, overflowPx: 12.4 }))
      .toBe('A box fits no column and overflows its column by 12px (page 1)');
    expect(formatWarning({ kind: 'missingImage', fileId: 'f1', resourceId: 'map', pageIndex: 2, documentIndex: 1 }))
      .toBe('No image for file "f1" (resource "map") — painted as a placeholder (document 2, page 3)');
    expect(formatWarning({ kind: 'raggedTableGrid', resourceId: 't', reason: 'missingCells', row: 2, col: 3, count: 1 }))
      .toBe('Table "t": row 3 has no cell from column 4 on — the grid has a hole');
  });

  it('describes the configuration warnings, with the setting they name', () => {
    expect(formatWarning({ kind: 'unknownNumberFormat', path: 'orderedLists.levels[0].numberFormat', value: 'bogus', used: 'arabic' }))
      .toBe('orderedLists.levels[0].numberFormat: unknown number format "bogus" — numbered as arabic');
    expect(formatWarning({ kind: 'fontFamilyStack', path: 'bodyText.fontFamily', value: 'Georgia, serif', used: 'Georgia' }))
      .toBe('bodyText.fontFamily: font stack "Georgia, serif" — set in "Georgia"');
    expect(formatWarning({ kind: 'sideColumnPercentClamped', path: 'layout.sideColumnPercent', value: '-5', used: '1' }))
      .toBe('layout.sideColumnPercent: a side column of -5% leaves a column with no width — cut at 1%');
    expect(formatWarning({ kind: 'sideColumnPercentClamped', path: 'layout.sideColumnPercent', value: 'wide', used: '30' }))
      .toBe('layout.sideColumnPercent: "wide" is not a percentage — the side column is cut at 30%');
  });

  it('takes every list a build returns, configuration warnings included', () => {
    const doc = buildDocument(
      { markdown: 'Text.' },
      { bodyText: { fontFamily: 'Georgia, serif' }, layout: { layoutType: 'oneAndHalf', sideColumnPercent: 0 } },
    );
    const lines = [...(doc.warnings ?? []), ...(doc.contentWarnings ?? []), ...(doc.configWarnings ?? [])].map(formatWarning);
    expect(lines).toContain('bodyText.fontFamily: font stack "Georgia, serif" — set in "Georgia"');
    expect(lines.some((l) => l.startsWith('layout.sideColumnPercent: a side column of 0%'))).toBe(true);
    for (const l of lines) expect(l).not.toMatch(/^Warning "/);
  });
});
