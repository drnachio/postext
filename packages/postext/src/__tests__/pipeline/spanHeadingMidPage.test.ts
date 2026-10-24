import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { PostextConfig, HeadingStyleConfig, Resource } from '../../types.js';
import type { VDTBlock, VDTDocument, VDTPage } from '../../vdt.js';

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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const article = (extra: Partial<HeadingStyleConfig> = {}): HeadingStyleConfig => ({
  id: 'article', numbered: false, span: 'page', breakBefore: { enabled: false }, fontSize: pt(16), ...extra,
});

const config = (style: HeadingStyleConfig): PostextConfig => ({
  page: { width: mm(160), height: mm(240), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  headingStyles: [style],
});

const MD = [
  '# The first article {style="article"}', '', filler(9), '',
  '# The second article {style="article"}', '', filler(9),
].join('\n');

const build = (style: HeadingStyleConfig): VDTDocument => buildDocument({ markdown: MD }, config(style), createMeasurementCache());
const headings = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'heading');
const textColumnsOf = (page: VDTPage) => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
const bottomOf = (b: VDTBlock): number => b.bbox.y + b.bbox.height;

describe('a span: page heading that opens mid-page (#539)', () => {
  it('starts a new page by default, breakBefore off or not', () => {
    const doc = build(article());
    const [, second] = headings(doc);
    expect(second!.pageIndex).toBe(1);
  });

  it('with spanBreak: false opens under the text before it, across the columns', () => {
    const doc = build(article({ spanBreak: false }));
    const [first, second] = headings(doc);
    expect(first!.pageIndex).toBe(0);
    expect(second!.pageIndex).toBe(0);
    const page = doc.pages[0]!;
    // The first article's text sits above the second heading in both columns.
    const before = doc.blocks.filter((b) => b.type === 'paragraph' && b.pageIndex === 0 && b.bbox.y < second!.bbox.y);
    const after = doc.blocks.filter((b) => b.type === 'paragraph' && b.pageIndex === 0 && b.bbox.y > second!.bbox.y);
    expect(new Set(before.map((b) => b.columnIndex)).size).toBe(2);
    for (const b of before) expect(bottomOf(b)).toBeLessThanOrEqual(second!.bbox.y + 0.5);
    // The text under it starts below its band in every column of its band.
    expect(after.length).toBeGreaterThan(0);
    for (const b of after) expect(b.bbox.y).toBeGreaterThanOrEqual(bottomOf(second!) - 0.5);
    const band = page.columns[second!.columnIndex]!.band ?? 0;
    expect(band).toBeGreaterThan(0);
    expect(new Set(after.map((b) => b.columnIndex)).size).toBe(2);
    // The columns above it end level, within a line.
    const closed = textColumnsOf(page).filter((c) => (c.band ?? 0) === band - 1);
    const ends = closed.map((c) => c.bbox.y + c.bbox.height - c.availableHeight);
    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(60);
    // Painted across the page, from its own overlay (the page's opener
    // band belongs to the first article).
    expect(second!.designOverlay).toBeDefined();
    expect(second!.designOverlay!.bbox.width).toBeCloseTo(page.contentArea.width, 0);
    expect(page.openerBand).toBeDefined();
    expect(first!.hidden).toBe(true);
  });

  it('paints a designed opener across the page at the heading', () => {
    const design: HeadingStyleConfig['advancedDesign'] = {
      enabled: true,
      slot: { elements: [{ kind: 'text', id: 't', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } }] },
    };
    const doc = build(article({ spanBreak: false, advancedDesign: design }));
    const [, second] = headings(doc);
    expect(second!.pageIndex).toBe(0);
    const overlay = second!.designOverlay!;
    expect(overlay.bbox.y).toBeCloseTo(second!.bbox.y, 5);
    const text = overlay.blocks.find((b) => b.kind === 'text');
    expect(text && 'lines' in text ? text.lines.map((l) => l.text).join(' ') : '').toBe('The second article');
  });

  it('still takes the next page when the room left would not hold it and a few lines', () => {
    const md = ['# The first article {style="article"}', '', filler(90), '', '# The second article {style="article"}', '', filler(4)].join('\n');
    const doc = buildDocument({ markdown: md }, config(article({ spanBreak: false })), createMeasurementCache());
    const [first, second] = headings(doc);
    expect(second!.pageIndex).toBeGreaterThan(first!.pageIndex);
    expect(doc.pages[second!.pageIndex]!.columns[second!.columnIndex]!.band ?? 0).toBe(0);
  });

  it('moves on when the headings under it roll it back out of the band it opened (#1219)', () => {
    // The band under the cut holds the heading and a few lines, not the
    // heading with the run of headings kept with it: kept with next, the
    // run goes on to the band's next column, where the heading was set at
    // the band's head again and rolled back again, without end.
    const words = SENTENCE.repeat(60).split(' ').slice(0, 640).join(' ');
    const subheads = ['## Tuesday the long title of the event here', '', '## Tuesday the long title of the event here', '', '## Tuesday the long title of the event here', ''];
    const md = ['# The first article {style="article"}', '', words, '', '# The second article {style="article"}', '', ...subheads, filler(3)].join('\n');
    const doc = buildDocument({ markdown: md }, { ...config(article({ spanBreak: false })), headings: { balancing: { trailing: false } } }, createMeasurementCache());
    const [first, second, ...run] = headings(doc);
    expect(second!.pageIndex).toBeGreaterThan(first!.pageIndex);
    expect(doc.pages[second!.pageIndex]!.columns[second!.columnIndex]!.band ?? 0).toBe(0);
    for (const h of run) expect(h.pageIndex).toBe(second!.pageIndex);
  });

  it('moves on when the heading right under it does not fit the band (#1222)', () => {
    const md = 'Lorem ipsum dolor sit amet.\n\n# Title {style="termine"}\n\n## Sub\n\nLorem ipsum\n';
    for (const height of [77, 80, 85, 90]) {
      const doc = buildDocument({ markdown: md }, {
        page: { height: mm(height) },
        headingStyles: [{ id: 'termine', breakBefore: { enabled: false }, span: 'page', spanBreak: false }],
      }, createMeasurementCache());
      const [title, sub] = headings(doc);
      expect(sub!.pageIndex).toBe(title!.pageIndex);
    }
  });

  it('opens with a design wherever it opens without one (#1224)', () => {
    // The title breaks at the column width, not at the page width it is
    // painted across. Measured at the column width, the designed heading
    // took a band of two lines where the plain one takes one: it no longer
    // fitted under the text and opened the next page, a page later.
    const design: HeadingStyleConfig['advancedDesign'] = {
      enabled: true,
      slot: { elements: [{ kind: 'text', id: 't', content: '{titleText}', fontSize: pt(16),
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } }] },
    };
    const taller: number[] = [];
    const moved: number[] = [];
    for (const n of [12, 40, 78, 79, 80, 85, 86]) {
      const md = [
        '# The first article {style="article"}', '', filler(n), '',
        '# The second article, with a title far too long for one line of a column, which the width of the page across both columns holds {style="article"}', '', filler(9),
      ].join('\n');
      const [plain, designed] = [undefined, design].map((advancedDesign) =>
        buildDocument({ markdown: md }, config(article({ spanBreak: false, ...(advancedDesign ? { advancedDesign } : {}) })), createMeasurementCache()));
      const [, a] = headings(plain!);
      const [, b] = headings(designed!);
      if (Math.abs(b!.bbox.height - a!.bbox.height) > 0.5) taller.push(n);
      if (b!.pageIndex !== a!.pageIndex || designed!.pages.length !== plain!.pages.length) moved.push(n);
    }
    expect(taller).toEqual([]);
    expect(moved).toEqual([]);
  });

  it('moves on with the box kept with it when the box does not fit the band under it (#1238)', () => {
    // The band under the cut holds the heading and the widow minimum of
    // body lines, not the box that follows it: the box moved on whole
    // (or, splittable, with too few lines for a cut) and left the heading
    // alone at the page foot, the only block of the band's first column.
    const sentence = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore. ';
    const box = Array.from({ length: 8 }, (_, i) => `**Group ${i}**\\\nMondays at 10, parish hall`).join('\n\n');
    const style: HeadingStyleConfig = { id: 'a', breakBefore: { enabled: false }, span: 'page', spanBreak: false };
    const strayed: string[] = [];
    for (const keepTogether of [true, false]) {
      for (const fill of [21, 28, 35, 36, 67]) {
        const md = [
          '# First {style="a"}', '', Array.from({ length: fill }, () => sentence.repeat(2)).join('\n\n'), '',
          '# Second {style="a"}', '', ':::callout{type="k" title="Every week"}', box, ':::',
        ].join('\n');
        const doc = buildDocument({ markdown: md }, { headingStyles: [style], calloutStyles: [{ id: 'k', keepTogether }] }, createMeasurementCache());
        const [, second] = headings(doc);
        const frame = doc.blocks.find((b) => b.type === 'callout')!;
        if (second!.pageIndex !== frame.pageIndex) strayed.push(`${keepTogether ? 'whole' : 'split'} ${fill}`);
      }
    }
    expect(strayed).toEqual([]);
  });

  it('takes a heading that opens a short column of its band along with the box that moves on', () => {
    // The band under the cut is short: the text before ends in its first
    // column, the next heading opens the second one alone, and the
    // keep-together box after it moves on to the next page. A run of
    // headings that is all its column holds stayed behind, orphaned — a
    // hidden heading too, which takes no room: its bookmark, contents entry
    // and running head pointed to the page before its box.
    const sentence = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore. ';
    const box = Array.from({ length: 8 }, (_, i) => `**Group ${i}**\\\nMondays at 10, parish hall`).join('\n\n');
    const style: HeadingStyleConfig = { id: 'a', breakBefore: { enabled: false }, span: 'page', spanBreak: false };
    const strayed: string[] = [];
    for (const hidden of [true, false]) {
      for (const fill of [21, 28, 67]) {
        const md = [
          '# First {style="a"}', '', Array.from({ length: fill }, () => sentence.repeat(2)).join('\n\n'), '',
          '# Second {style="a"}', '', sentence, '', '# News {style="n"}', '', ':::callout{type="k" title="Every week"}', box, ':::',
        ].join('\n');
        const doc = buildDocument({ markdown: md }, {
          headingStyles: [style, { id: 'n', breakBefore: { enabled: false }, hidden }],
          calloutStyles: [{ id: 'k', keepTogether: true }],
        }, createMeasurementCache());
        const [, , news] = headings(doc);
        const frame = doc.blocks.find((b) => b.type === 'callout')!;
        if (news!.pageIndex !== frame.pageIndex || news!.columnIndex !== frame.columnIndex) strayed.push(`${hidden ? 'hidden' : 'shown'} ${fill}`);
      }
    }
    expect(strayed).toEqual([]);
  });

  // A heading opening a short column alone and the box after it, taller
  // than any column, in a two-column page (review of #1246).
  const groupBox = Array.from({ length: 22 }, (_, i) => `**Group ${i}**\\\nMondays at 10, parish hall`).join('\n\n');
  const newsConfig: PostextConfig = {
    layout: { layoutType: 'double' },
    headingStyles: [{ id: 'n', breakBefore: { enabled: false } }],
    calloutStyles: [{ id: 'k', keepTogether: true }],
  };

  it('still stops a box after four short columns when the heading before it moves along', () => {
    // Three page-wide figures head every page, so every column is short:
    // the box leaves four of them and is set (#1246 review). Rolling the
    // heading back must not start the count over each time, sending both
    // on past every figure. In two columns the band caps already stop it;
    // in one, only the count does.
    const figure = (id: string): Resource => ({
      id, typeId: 'figure', kind: 'bitmap', caption: `Figure ${id}.`, createdAt: 0, updatedAt: 0,
      bitmap: { fileId: `${id}.png`, format: 'png', width: 1600, height: 500 },
      placement: { position: 'top', span: 'page' },
    });
    const figures = Array.from({ length: 40 }, (_, i) => figure(`f${i}`));
    const md = [
      `Intro ${figures.map((f) => `:ref{id="${f.id}"}`).join(' ')} text.`, '',
      '# News {style="n"}', '', ':::callout{type="k" title="Every week"}', groupBox, ':::',
    ].join('\n');
    const landed: Record<string, number> = {};
    for (const layoutType of ['double', 'single'] as const) {
      const doc = buildDocument({ markdown: md, resources: figures }, { ...newsConfig, layout: { layoutType } }, createMeasurementCache());
      landed[layoutType] = doc.blocks.find((b) => b.type === 'callout')!.pageIndex;
    }
    expect(landed).toEqual({ double: 4, single: 7 });
  });

  it('leaves a heading in a column a band cap cut short', () => {
    // The box leaves the last column of the band and caps it: that column
    // is short on purpose, and the heading in it gains nothing by moving
    // on, as the heading and the box are taller than a full column — it
    // would open the next page alone, the box in the column after it.
    const md = [
      'Intro line.', '', ...Array.from({ length: 3 }, () => ['Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.', '']).flat(),
      '# News[^n] {style="n"}', '', ':::callout{type="k" title="Every week"}', groupBox, ':::', '', '[^n]: A note.',
    ].join('\n');
    const doc = buildDocument({ markdown: md }, newsConfig, createMeasurementCache());
    const [news] = headings(doc);
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    expect(doc.pages).toHaveLength(2);
    expect(news!.pageIndex).toBe(0);
    expect([frame.pageIndex, frame.columnIndex]).toEqual([1, 0]);
  });

  it('stays under the text before it when the cut that levels that text is dropped', () => {
    // The band above the heading closes level in a capped pass; in the
    // plain pass the heading moved on to the next page. A cap that was not
    // delivered — a figure the columns do not split level around, a top
    // float the level cut sets under its citing line — left the plain
    // pass's layout: the heading opened the next page, and most of this
    // one stayed empty.
    const figure = (placement: Resource['placement']): Resource => ({
      id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'A figure.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'fig.png', format: 'png', width: 1600, height: 900 }, placement,
    });
    const cases: Array<[string, PostextConfig['layout'], Resource['placement'], number, number]> = [
      ['inline figure', { layoutType: 'double' }, { position: 'here' }, 6, 3],
      ['column float', { layoutType: 'double' }, { position: 'top' }, 11, 1],
      ['float across two of three columns', { layoutType: 'multiple', columnCount: 3 }, { position: 'top', span: 'column', columns: 2 }, 7, 1],
    ];
    const moved: string[] = [];
    for (const [name, layout, placement, paragraphs, after] of cases) {
      const body = Array.from({ length: paragraphs }, () => filler(3));
      body.splice(paragraphs - after, 0, '::resource{id="fig"}');
      const md = ['# The first article {style="article"}', '', body.join('\n\n'), '', '# The second article {style="article"}', '', filler(6)].join('\n');
      const doc = buildDocument({ markdown: md, resources: [figure(placement)] }, { ...config(article({ spanBreak: false })), layout }, createMeasurementCache());
      const [, second] = headings(doc);
      const page = doc.pages[second!.pageIndex]!;
      const fig = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock)!;
      // On the first page, under the first article and its figure.
      if (second!.pageIndex !== 0 || (page.columns[second!.columnIndex]!.band ?? 0) === 0
        || fig.pageIndex !== 0 || bottomOf(fig) > second!.bbox.y + 0.5) moved.push(name);
    }
    expect(moved).toEqual([]);
  });

  it('keeps no layout cut for a cap the driver dropped', () => {
    // The cap levelling the band above the heading ran out of retries in
    // the last round, while the document's closing cap was delivered: the
    // layout that round placed was kept, cut for the dropped cap. Its
    // figure was set twice, at the foot of the first page and alone on a
    // second, and the heading opened a third.
    const figure: Resource = {
      id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'A figure.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'fig.png', format: 'png', width: 1600, height: 900 }, placement: { position: 'top' },
    };
    const body = Array.from({ length: 24 }, () => filler(3));
    body.splice(23, 0, '::resource{id="fig"}');
    const md = ['# The first article {style="article"}', '', body.join('\n\n'), '', '# The second article {style="article"}', '', filler(6)].join('\n');
    const layout: PostextConfig['layout'] = { layoutType: 'multiple', columnCount: 3 };
    const doc = buildDocument({ markdown: md, resources: [figure] }, { ...config(article({ spanBreak: false })), layout }, createMeasurementCache());
    const [, second] = headings(doc);
    expect(doc.pages.flatMap((p) => (p.floats ?? []).map(() => p.index))).toEqual([0]);
    expect(doc.pages).toHaveLength(2);
    expect(second!.pageIndex).toBe(1);
  });
});
