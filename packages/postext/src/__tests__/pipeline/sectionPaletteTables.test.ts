import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../index';

// EF-190: a section's or a part's palette recolours the table fills (header,
// body, zebra rows, a cell's own fill) and the caption bar on its pages, as
// it recolours the table's text and rules and the callout fills beside them.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: s.length * (m ? Number(m[1]) : 16) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const BASE = '#2d9cdb';
const SECTION = '#ffb627';
const band = { hex: BASE, model: 'hex' as const, paletteId: 'band' };

const table = (id: string): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: 'Scores.',
  createdAt: 0,
  updatedAt: 0,
  placement: { position: 'here' },
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [{ content: 'Head' }, { content: 'H2' }],
        [{ content: 'a', background: band }, { content: 'b' }],
        [{ content: 'c' }, { content: 'd' }],
      ],
    },
  },
});

const config: PostextConfig = {
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  colorPalette: [{ id: 'band', name: 'Band', value: { hex: BASE, model: 'hex' } }],
  tableStyle: {
    headerBackgroundEnabled: true,
    headerBackground: band,
    bodyBackgroundEnabled: true,
    bodyBackground: band,
    bodyAlternateBackgroundEnabled: true,
    bodyAlternateBackground: band,
    borderColor: band,
  },
  captionStyle: { backgroundEnabled: true, background: band },
  calloutStyles: [{ id: 'c', background: band }],
  headingStyles: [{ id: 's', palette: { band: SECTION } }],
};

const markdown = [
  'Before the section.', '', '::resource{id="t0"}', '',
  '# T {style="s"}', '', '::resource{id="t1"}', '', ':::callout{type="c"}', 'Box.', ':::',
].join('\n');

const tablesOf = (doc: VDTDocument): VDTBlock[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) => b.resourceBlock?.table);

const fillsOf = (b: VDTBlock) => {
  const t = b.resourceBlock!.table!;
  return {
    border: t.borderColor.toLowerCase(),
    header: t.headerBackground?.toLowerCase(),
    body: t.bodyBackground?.toLowerCase(),
    zebra: t.bodyAlternateBackground?.toLowerCase(),
    cell: t.cells.find((c) => c.background !== undefined)?.background?.toLowerCase(),
    bar: b.resourceBlock!.captionBar?.background.toLowerCase(),
  };
};

describe('EF-190: a section palette recolours table fills', () => {
  it('recolours header, body, zebra and cell fills and the caption bar inside the section only', () => {
    const doc = buildDocument({ markdown, resources: [table('t0'), table('t1')] }, config);
    const [before, inside] = tablesOf(doc);
    expect(fillsOf(before!)).toEqual({ border: BASE, header: BASE, body: BASE, zebra: BASE, cell: BASE, bar: BASE });
    expect(fillsOf(inside!)).toEqual({ border: SECTION, header: SECTION, body: SECTION, zebra: SECTION, cell: SECTION, bar: SECTION });
  });

  it('a part palette recolours table fills too', () => {
    const md = [
      'Before.', '', '::resource{id="t0"}', '',
      ':::part{number="II" title="Two" palette="band=#f6c297"}', ':::', '',
      '# One', '', '::resource{id="t1"}',
    ].join('\n');
    const doc = buildDocument({ markdown: md, resources: [table('t0'), table('t1')] }, { ...config, headingStyles: [] });
    const [before, inside] = tablesOf(doc);
    expect(fillsOf(before!).header).toBe(BASE);
    expect(fillsOf(inside!)).toEqual({ border: '#f6c297', header: '#f6c297', body: '#f6c297', zebra: '#f6c297', cell: '#f6c297', bar: '#f6c297' });
  });

  it('leaves fills that follow no overridden entry alone', () => {
    const other = { hex: '#123456', model: 'hex' as const };
    const doc = buildDocument(
      { markdown, resources: [table('t0'), table('t1')] },
      { ...config, tableStyle: { ...config.tableStyle, headerBackground: other }, captionStyle: { backgroundEnabled: true, background: other } },
    );
    const inside = fillsOf(tablesOf(doc)[1]!);
    expect(inside.header).toBe('#123456');
    expect(inside.bar).toBe('#123456');
    expect(inside.body).toBe(SECTION);
  });
});
