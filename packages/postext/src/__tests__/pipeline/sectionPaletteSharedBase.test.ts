import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../index';

// EF-163: the text flow keeps resolved colours, not palette links, so a
// section's or a part's palette recolours it by value. Two palette entries
// that share a base value used to clash there: every flow colour of that
// value took whichever override came last. Each kind of flow colour now
// follows the entries its own settings link to.

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
const SHARED = '#111111';
const link = (paletteId: string) => ({ hex: SHARED, model: 'hex' as const, paletteId });

const base: PostextConfig = {
  page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  colorPalette: [
    { id: 'a', name: 'A', value: { hex: SHARED, model: 'hex' } },
    { id: 'b', name: 'B', value: { hex: SHARED, model: 'hex' } },
  ],
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  bodyText: { color: link('a') },
  calloutStyles: [{ id: 'c', background: link('b') }],
};

const markdown = ['Before.', '', '# T {style="s"}', '', 'Body text.', '', ':::callout{type="c"}', 'Box.', ':::'].join('\n');

const blocksOf = (doc: VDTDocument): VDTBlock[] => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks));
const paragraph = (doc: VDTDocument, text: string): VDTBlock =>
  blocksOf(doc).find((b) => b.type === 'paragraph' && b.lines.some((l) => l.text.includes(text)))!;
const calloutFill = (doc: VDTDocument): string | undefined =>
  blocksOf(doc).find((b) => b.type === 'callout')!.designOverlay!.blocks
    .flatMap((d) => (d.kind === 'box' && d.box.backgroundColor ? [d.box.backgroundColor.toLowerCase()] : []))[0];

describe('EF-163: palette entries that share a base value', () => {
  it('each follows its own override: the text takes a\'s, the box fill b\'s', () => {
    const doc = buildDocument({ markdown }, { ...base, headingStyles: [{ id: 's', palette: { a: '#ff0000', b: '#00ff00' } }] });
    expect(paragraph(doc, 'Body text').color?.toLowerCase()).toBe('#ff0000');
    expect(calloutFill(doc)).toBe('#00ff00');
    // Outside the section both keep the base value.
    expect(paragraph(doc, 'Before').color?.toLowerCase()).toBe(SHARED);
  });

  it('an entry the section leaves alone keeps its value though another with the same base changes', () => {
    const doc = buildDocument({ markdown }, { ...base, headingStyles: [{ id: 's', palette: { a: '#ff0000' } }] });
    expect(paragraph(doc, 'Body text').color?.toLowerCase()).toBe('#ff0000');
    expect(calloutFill(doc)).toBe(SHARED);
    const other = buildDocument({ markdown }, { ...base, headingStyles: [{ id: 's', palette: { b: '#00ff00' } }] });
    expect(paragraph(other, 'Body text').color?.toLowerCase()).toBe(SHARED);
    expect(calloutFill(other)).toBe('#00ff00');
  });

  it('tells a heading colour from the body colour when both start from one value', () => {
    const config: PostextConfig = {
      ...base,
      headings: { ...base.headings, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, { level: 2, color: link('b') }] },
      calloutStyles: [],
      headingStyles: [{ id: 's', palette: { b: '#00ff00' } }],
    };
    const md = ['# T {style="s"}', '', '## Crosshead', '', 'Body text.'].join('\n');
    const doc = buildDocument({ markdown: md }, config);
    const crosshead = blocksOf(doc).find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('Crosshead')))!;
    expect(crosshead.color?.toLowerCase()).toBe('#00ff00');
    expect(paragraph(doc, 'Body text').color?.toLowerCase()).toBe(SHARED);
  });

  it('a cell\'s own fill follows its own link; the table style\'s fills theirs', () => {
    const table: Resource = {
      id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
      table: { model: { headerRowCount: 1, rows: [[{ content: 'H' }, { content: 'I' }], [{ content: 'x', background: link('b') }, { content: 'y' }]] } },
    };
    const config: PostextConfig = {
      ...base,
      tableStyle: { headerBackground: link('a'), bodyBackgroundEnabled: true, bodyBackground: link('b') },
      headingStyles: [{ id: 's', palette: { a: '#ff0000' } }],
    };
    const doc = buildDocument({ markdown: '# T {style="s"}\n\n::resource{id="t"}\n', resources: [table] }, config);
    const t = blocksOf(doc).find((b) => b.resourceBlock?.table)!.resourceBlock!.table!;
    expect(t.headerBackground?.toLowerCase()).toBe('#ff0000');
    expect(t.bodyBackground?.toLowerCase()).toBe(SHARED);
    expect(t.cells.find((c) => c.background)!.background!.toLowerCase()).toBe(SHARED);
  });

  it('a resource type\'s caption style follows its links too', () => {
    const table: Resource = {
      id: 't', typeId: 'table', kind: 'table', caption: 'Scores.', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
      table: { model: { rows: [[{ content: 'x' }]] } },
    };
    const config: PostextConfig = {
      ...base,
      resourceTypes: [
        { id: 'table', name: 'Table', shortLabel: 'Tab.', captionPrefix: 'Table', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionStyle: { backgroundEnabled: true, background: link('b') } },
      ],
      headingStyles: [{ id: 's', palette: { b: '#00ff00' } }],
    };
    const doc = buildDocument({ markdown: '# T {style="s"}\n\nBody text.\n\n::resource{id="t"}\n', resources: [table] }, config);
    const rb = blocksOf(doc).find((b) => b.resourceBlock?.table)!.resourceBlock!;
    expect(rb.captionBar?.background.toLowerCase()).toBe('#00ff00');
    expect(paragraph(doc, 'Body text').color?.toLowerCase()).toBe(SHARED);
  });

  it('a part palette follows the same rule', () => {
    const md = [':::part{number="II" title="Two" palette="b=#00ff00"}', ':::', '', '# One', '', 'Body text.', '', ':::callout{type="c"}', 'Box.', ':::'].join('\n');
    const doc = buildDocument({ markdown: md }, base);
    expect(paragraph(doc, 'Body text').color?.toLowerCase()).toBe(SHARED);
    expect(calloutFill(doc)).toBe('#00ff00');
  });
});

// The verifier's repro: the text's own colours (body, bold, italic,
// references, list markers and numbers) used to be one kind, so an entry
// the section overrides dragged the others along with it.
describe('EF-163: colours of one block that link entries sharing a base value', () => {
  const RED = '#b8413d';
  const section = { headingStyles: [{ id: 's', palette: { b: RED } }] };
  const hex = (v: string | undefined) => v?.toLowerCase();
  const heading = (doc: VDTDocument, text: string): VDTBlock =>
    blocksOf(doc).find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes(text)))!;

  it('body text keeps its entry while the bold, italic and reference colours take theirs', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      bodyText: { color: link('a'), boldColor: link('b'), italicColor: link('b'), referenceColor: link('b') },
      ...section,
    };
    const doc = buildDocument({ markdown: 'Before **b**.\n\n# T {style="s"}\n\nBody **bold** and *italic* text.' }, config);
    const p = paragraph(doc, 'Body');
    expect(hex(p.color)).toBe(SHARED);
    expect(hex(p.boldColor)).toBe(RED);
    expect(hex(p.italicColor)).toBe(RED);
    expect(hex(p.refColor)).toBe(RED);
    const before = paragraph(doc, 'Before');
    expect(hex(before.color)).toBe(SHARED);
    expect(hex(before.boldColor)).toBe(SHARED);
  });

  it('the other way round: the body text follows its override, the bold colour keeps its entry', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      bodyText: { color: link('b'), boldColor: link('a') },
      ...section,
    };
    const doc = buildDocument({ markdown: '# T {style="s"}\n\nBody **bold** text.' }, config);
    const p = paragraph(doc, 'Body');
    expect(hex(p.color)).toBe(RED);
    expect(hex(p.boldColor)).toBe(SHARED);
  });

  it('a list marker takes its entry, the item text and the body text keep theirs', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      unorderedLists: { color: link('b') },
      ...section,
    };
    const doc = buildDocument({ markdown: '# T {style="s"}\n\n- item\n\nBody text.' }, config);
    const item = blocksOf(doc).find((b) => b.type === 'listItem')!;
    expect(hex(item.bulletColor)).toBe(RED);
    expect(hex(item.color)).toBe(SHARED);
    expect(hex(paragraph(doc, 'Body text').color)).toBe(SHARED);
  });

  it('an ordered list\'s separator and its number follow their own entries', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      orderedLists: { color: link('a'), separator: '.', separatorColor: link('b'), separatorGap: pt(1) },
      ...section,
    };
    const doc = buildDocument({ markdown: '# T {style="s"}\n\n1. one\n2. two' }, config);
    const items = blocksOf(doc).filter((b) => b.type === 'listItem');
    expect(items.length).toBe(2);
    for (const item of items) {
      expect(item.separatorText).toBe('.');
      expect(hex(item.separatorColor)).toBe(RED);
      expect(hex(item.bulletColor)).toBe(SHARED);
      expect(hex(item.color)).toBe(SHARED);
    }
  });

  it('heading levels that link different entries keep apart', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      headings: {
        ...base.headings,
        levels: [
          { level: 1, color: link('a'), breakBefore: { enabled: true, parity: 'any' } },
          { level: 2, color: link('b') },
          { level: 3, color: link('a') },
        ],
      },
      ...section,
    };
    const doc = buildDocument({ markdown: '# Title {style="s"}\n\n## Crosshead\n\n### Minor\n\nBody text.' }, config);
    expect(hex(heading(doc, 'Title').color)).toBe(SHARED);
    expect(hex(heading(doc, 'Crosshead').color)).toBe(RED);
    expect(hex(heading(doc, 'Minor').color)).toBe(SHARED);
    expect(hex(paragraph(doc, 'Body text').color)).toBe(SHARED);
  });

  it('a heading style\'s colour follows its own entry, not its level\'s', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      headings: { ...base.headings, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, { level: 2, color: link('a') }] },
      headingStyles: [{ id: 'loud', color: link('b') }],
    };
    // A part's palette: a styled heading would open a section of its own.
    const md = [`:::part{number="I" title="One" palette="b=${RED}"}`, ':::', '', '# T', '', '## Plain', '', '## Loud {style="loud"}', '', 'Body text.'].join('\n');
    const doc = buildDocument({ markdown: md }, config);
    expect(hex(heading(doc, 'Plain').color)).toBe(SHARED);
    expect(hex(heading(doc, 'Loud').color)).toBe(RED);
  });

  it('two callout styles, and the fill and border of one frame, keep apart', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [
        { id: 'c1', background: link('a'), border: { enabled: true, color: link('b') } },
        { id: 'c2', background: link('b') },
      ],
      ...section,
    };
    const md = ['# T {style="s"}', '', ':::callout{type="c1"}', 'One.', ':::', '', ':::callout{type="c2"}', 'Two.', ':::'].join('\n');
    const doc = buildDocument({ markdown: md }, config);
    const frames = blocksOf(doc).filter((b) => b.type === 'callout');
    const boxOf = (styleId: string) => frames.find((f) => f.callout?.styleId === styleId)!.designOverlay!.blocks
      .find((d) => d.kind === 'box' && d.box.backgroundColor)!;
    const one = boxOf('c1');
    expect(one.kind === 'box' && hex(one.box.backgroundColor)).toBe(SHARED);
    expect(one.kind === 'box' && hex(one.box.borderColor)).toBe(RED);
    const two = boxOf('c2');
    expect(two.kind === 'box' && hex(two.box.backgroundColor)).toBe(RED);
  });

  it('a named table style and the document\'s table style keep apart', () => {
    const table = (id: string, styleId?: string): Resource => ({
      id, typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
      table: { model: { headerRowCount: 1, rows: [[{ content: 'H' }], [{ content: 'x' }]] }, ...(styleId ? { styleId } : {}) },
    });
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      tableStyle: { headerBackground: link('a') },
      tableStyles: [{ id: 'named', headerBackground: link('b') }],
      ...section,
    };
    const doc = buildDocument(
      { markdown: '# T {style="s"}\n\n::resource{id="plain"}\n\n::resource{id="styled"}\n', resources: [table('plain'), table('styled', 'named')] },
      config,
    );
    const tables = blocksOf(doc).filter((b) => b.resourceBlock?.table);
    const fillOf = (id: string) => hex(tables.find((b) => b.resourceBlock!.resource?.id === id)!.resourceBlock!.table!.headerBackground);
    expect(fillOf('plain')).toBe(SHARED);
    expect(fillOf('styled')).toBe(RED);
  });

  it('a contents row keeps its entry while its page number and the body text follow theirs', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      bodyText: { color: link('b') },
      toc: { levels: [{ level: 1, color: link('a'), numberColor: link('a') }], pageNumber: { color: link('b') } },
      ...section,
    };
    const md = ['# Contents {style="s" toc="false"}', '', ':::toc', '', 'Body text.', '', '# One', '', 'More.'].join('\n');
    const doc = buildDocument({ markdown: md }, config);
    const row = blocksOf(doc).find((b) => b.tocEntry && b.lines.some((l) => l.text.includes('One')))!;
    expect(hex(row.color)).toBe(SHARED);
    expect(hex(row.boldColor)).toBe(SHARED);
    const pageNumber = row.lines.flatMap((l) => l.segments ?? []).filter((s) => s.color);
    expect(pageNumber.length).toBeGreaterThan(0);
    for (const s of pageNumber) expect(hex(s.color)).toBe(RED);
    expect(hex(paragraph(doc, 'Body text').color)).toBe(RED);
  });

  it('two chip styles keep apart', () => {
    const config: PostextConfig = {
      ...base,
      calloutStyles: [],
      chipStyles: [{ id: 'k1', background: link('a') }, { id: 'k2', background: link('b') }],
      ...section,
    };
    const doc = buildDocument({ markdown: '# T {style="s"}\n\nKeys :chip[one]{style="k1"} and :chip[two]{style="k2"}.' }, config);
    const chips = paragraph(doc, 'Keys').lines.flatMap((l) => l.segments ?? []).flatMap((s) => (s.chip ? [s.chip] : []));
    expect(chips.map((c) => [c.styleId, hex(c.background)])).toEqual([['k1', SHARED], ['k2', RED]]);
  });
});
