import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults';
import { buildBundle, createBundle, migrateConfig, openBundle, pinLegacyInlineGap, CONFIG_VERSION, LEGACY_MATH_SIZE } from '../../bundle';
import { migrateBundleConfig } from '../../bundle/configVersion';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../index';

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

const para = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i + 1} of this paragraph fills the measure.`).join(' ');

const figure = (height: number): Resource => ({
  id: 'fig',
  typeId: 'figure',
  kind: 'svg',
  caption: 'A figure.',
  createdAt: 0,
  updatedAt: 0,
  svg: { fileId: 'f.svg', width: 400, height },
  placement: { position: 'here' },
});

const build = (height: number, markdown = `${para(6)}\n\n::resource{id="fig"}\n\n${para(6)}`, config: PostextConfig = { layout: { layoutType: 'single' } }): VDTDocument =>
  buildDocument({ markdown, resources: [figure(height)] }, config, createMeasurementCache());

const bottom = (b: VDTBlock) => b.bbox.y + b.bbox.height;

describe('an inline figure has a line of space below it as above (EF-93)', () => {
  it('keeps at least the float gap under the figure, then snaps to the grid', () => {
    for (const height of [190, 195, 200, 205, 210, 240, 300]) {
      const doc = build(height);
      const [a, fig, b] = doc.pages[0]!.columns[0]!.blocks as [VDTBlock, VDTBlock, VDTBlock];
      expect(fig.type).toBe('resource');
      const grid = doc.baselineGrid;
      const above = fig.bbox.y - bottom(a);
      const below = b.bbox.y - bottom(fig);
      // Above: one line (the float gap).
      expect(above, `h=${height}`).toBeCloseTo(grid, 1);
      // Below: at least as much, and the grid snap adds less than a line.
      expect(below, `h=${height}`).toBeGreaterThanOrEqual(above - 0.01);
      expect(below, `h=${height}`).toBeLessThan(above + grid - 0.01);
      // The text after it is back on the grid.
      const offset = (b.lines[0]!.bbox.y - doc.pages[0]!.contentArea.y) / grid;
      expect(Math.abs(offset - Math.round(offset)), `h=${height}`).toBeLessThan(1e-6);
    }
  });

  it('owes no space to a column foot: a figure closing its column still fits', () => {
    // The figure is sized to end on the column's last grid line: what follows
    // opens the next column, and nothing is pushed on for a gap no text uses.
    const config: PostextConfig = { layout: { layoutType: 'double' } };
    const probe = build(100, `${para(6)}\n\n::resource{id="fig"}\n\n${para(60)}`, config);
    const col = probe.pages[0]!.columns[0]!;
    const fig = col.blocks.find((b) => b.type === 'resource')!;
    const room = col.bbox.y + col.bbox.height - fig.bbox.y;
    // Grow the figure until its group is the whole room left under the text.
    const tall = build(Math.floor(100 * room / fig.bbox.height) - 1, `${para(6)}\n\n::resource{id="fig"}\n\n${para(60)}`, config);
    const tcol = tall.pages[0]!.columns[0]!;
    const tfig = tcol.blocks.find((b) => b.type === 'resource');
    expect(tfig).toBeDefined();
    expect(bottom(tfig!)).toBeLessThanOrEqual(tcol.bbox.y + tcol.bbox.height + 0.5);
    expect(tall.pages[0]!.columns[1]!.blocks[0]!.type).toBe('paragraph');
  });
});

describe('the space under an inline figure is shared with the next block (EF-93)', () => {
  const second: Resource = { ...figure(120), id: 'fig2' };
  const around = (markdown: string, config: PostextConfig = { layout: { layoutType: 'single' } }, height = 190): VDTDocument =>
    buildDocument({ markdown, resources: [figure(height), second] }, config, createMeasurementCache());
  const above = (markdown: string, height = 190): VDTDocument =>
    around(markdown, { layout: { layoutType: 'single', inlineResourceGap: 'above' } }, height);
  /** From the first figure's foot to the top of the next block on page 1. */
  const gapAfterFigure = (doc: VDTDocument): number => {
    const blocks = doc.pages[0]!.columns[0]!.blocks;
    const at = blocks.findIndex((b) => b.type === 'resource');
    return blocks[at + 1]!.bbox.y - bottom(blocks[at]!);
  };
  const cases: [string, string][] = [
    ['another inline figure', `${para(6)}\n\n::resource{id="fig"}\n\n::resource{id="fig2"}\n\n${para(6)}`],
    ['a heading', `${para(6)}\n\n::resource{id="fig"}\n\n## A heading\n\n${para(6)}`],
    ['a list', `${para(6)}\n\n::resource{id="fig"}\n\n- One item of the list.\n- Another item.\n\n${para(6)}`],
    ['a box', `${para(6)}\n\n::resource{id="fig"}\n\n:::callout\nA short note in a box.\n:::\n\n${para(6)}`],
  ];

  for (const [name, md] of cases) {
    it(`collapses with the top space of ${name}`, () => {
      for (const height of [190, 195, 200, 205, 210]) {
        const now = around(md, undefined, height);
        const old = above(md, height);
        // The float gap here is one line, the grid's.
        const gap = now.baselineGrid;
        const gapNow = gapAfterFigure(now);
        const gapOld = gapAfterFigure(old);
        // One shared white: the float gap or the space 1.4 left (the grid
        // snap's leftover and the block's own space above), the larger.
        expect(gapNow, `${name}, h=${height}`).toBeCloseTo(Math.max(gap, gapOld), 1);
      }
    });
  }

  it('still keeps a line under the figure before a paragraph, then the grid', () => {
    const md = `${para(6)}\n\n::resource{id="fig"}\n\n${para(6)}`;
    const now = around(md);
    const gap = gapAfterFigure(now);
    expect(gap).toBeGreaterThanOrEqual(now.baselineGrid - 0.01);
    expect(gap).toBeLessThan(2 * now.baselineGrid - 0.01);
  });
});

/** Gap above and below the figure, and the line height, on page 1. */
const gaps = (doc: VDTDocument) => {
  const [a, fig, b] = doc.pages[0]!.columns[0]!.blocks as [VDTBlock, VDTBlock, VDTBlock];
  return { above: fig.bbox.y - bottom(a), below: b.bbox.y - bottom(fig), grid: doc.baselineGrid };
};

describe('layout.inlineResourceGap and configurations stored before postext 1.5 (EF-93)', () => {
  const MD = `${para(6)}\n\n::resource{id="fig"}\n\n${para(6)}`;

  it("'above' keeps 1.4's rule: only the grid snap under the figure", () => {
    expect(resolveLayoutConfig().inlineResourceGap).toBe('around');
    expect(resolveLayoutConfig({ inlineResourceGap: 'above' }).inlineResourceGap).toBe('above');
    expect(stripLayoutDefaults({ inlineResourceGap: 'around' })).toBeUndefined();
    expect(stripLayoutDefaults({ inlineResourceGap: 'above' })).toEqual({ inlineResourceGap: 'above' });
    const old = gaps(build(190, MD, { layout: { layoutType: 'single', inlineResourceGap: 'above' } }));
    // 1.4.1 laid this out with 39.6 px under the figure (the report's numbers).
    expect(old.below).toBeCloseTo(39.57, 1);
    expect(old.below).toBeLessThan(old.grid);
    const now = gaps(build(190, MD));
    expect(now.below).toBeCloseTo(old.below + now.grid, 1);
  });

  it('pins a stored configuration whose book embeds a resource, once', () => {
    const config: PostextConfig = { layout: { layoutType: 'single' } };
    expect(CONFIG_VERSION).toBe(10);
    const pinned = migrateConfig(config, undefined, { content: MD });
    expect(pinned.layout).toEqual({ layoutType: 'single', inlineResourceGap: 'above' });
    // Stamped 4 (a 1.5 prerelease): the gap is the only pin it gets.
    expect(migrateConfig(config, 4, { content: MD }).layout).toEqual({ layoutType: 'single', inlineResourceGap: 'above' });
    // Today's rules, no `::resource`, or a gap already named: as it is.
    expect(migrateConfig(config, CONFIG_VERSION, { content: MD })).toBe(config);
    expect(migrateConfig(config, 4, { content: 'No figures here.' })).toBe(config);
    // Only a line the parser reads as an embed counts: a mention in running
    // text or in a code span embeds nothing (the guide's chapter 9).
    expect(migrateConfig(config, 4, { content: 'Write `::resource{id="fig"}` on a line of its own.' })).toBe(config);
    expect(migrateConfig(config, 4, { content: ['No figure.', 'The ::resource directive embeds one.'] })).toBe(config);
    expect(migrateConfig(config, 4, { content: ['No figure.', 'Text.\r\n  ::resource{id="fig"}  \r\nMore.'] }).layout)
      .toEqual({ layoutType: 'single', inlineResourceGap: 'above' });
    const named: PostextConfig = { layout: { inlineResourceGap: 'around' } };
    expect(pinLegacyInlineGap(named)).toBe(named);
    expect(pinLegacyInlineGap({} as PostextConfig).layout).toEqual({ inlineResourceGap: 'above' });
  });

  it('reads content given as an iterator once, for both checks', () => {
    const texts = ['Intro.\n\n::resource{id="fig"}\n\nMore.', 'No maths.'];
    const book = () => new Map(texts.map((t, i) => [`ch${i}`, t])).values();
    // The maths check walks the whole iterator (no `$`); the gap check
    // must still see the embed.
    expect(migrateConfig({} as PostextConfig, undefined, { content: book() }).layout).toEqual({ inlineResourceGap: 'above' });
    expect(migrateBundleConfig({}, [{}], undefined, { content: book() }).layout).toEqual({ inlineResourceGap: 'above' });
    // A generator whose first text has maths and the only embed: the maths
    // check stops there, and the gap check reads it again.
    function* chapters() {
      yield 'Maths $x$ here.\n\n::resource{id="fig"}\n';
      yield 'x';
    }
    const pinned = migrateConfig({} as PostextConfig, undefined, { content: chapters() });
    expect(pinned.layout).toEqual({ inlineResourceGap: 'above' });
    expect(pinned.math?.fontSizeScale).toBeCloseTo(LEGACY_MATH_SIZE, 6);
    expect(migrateBundleConfig({}, [], undefined, { content: chapters() }).layout).toEqual({ inlineResourceGap: 'above' });
    // The same as an array.
    expect(migrateConfig({} as PostextConfig, undefined, { content: [...chapters()] })).toEqual(pinned);
  });

  it('lays an unversioned bundle out as 1.4 did, and a bundle written today with the gap', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 190"><rect width="400" height="190"/></svg>';
    const zip = (extra: Record<string, unknown>) => zipSync({
      'preset.json': strToU8(JSON.stringify({
        version: 2, id: 'figs', name: 'Figs', locale: 'en',
        chapters: [{ title: 'Figs', file: 'chapters/01.md' }],
        config: { layout: { layoutType: 'single' }, headings: { levels: [] } },
        resources: [{ id: 'fig', typeId: 'figure', kind: 'svg', file: 'fig.svg', width: 400, height: 190, caption: 'A figure.', placement: { position: 'here' } }],
        ...extra,
      })),
      'chapters/01.md': strToU8(MD),
      'fig.svg': strToU8(svg),
    });
    const old = await openBundle(zip({}));
    expect(old.config.layout?.inlineResourceGap).toBe('above');
    const oldGaps = gaps(buildBundle(old)[0]!);
    expect(oldGaps.below).toBeLessThan(oldGaps.grid);

    const today = await openBundle(zip({ configVersion: CONFIG_VERSION }));
    expect(today.config.layout?.inlineResourceGap).toBeUndefined();
    const todayGaps = gaps(buildBundle(today)[0]!);
    expect(todayGaps.below).toBeGreaterThanOrEqual(todayGaps.above - 0.01);

    // Opened and written again, the old bundle keeps its pin (stamped today).
    const again = await createBundle({ name: 'Figs', chapters: old.chapters, config: old.config, resources: old.resources, files: old.files });
    expect(again.manifest.configVersion).toBe(CONFIG_VERSION);
    const reopened = await openBundle(again.bytes);
    expect(reopened.config.layout?.inlineResourceGap).toBe('above');
  });
});
