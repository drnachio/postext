import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults';
import { buildBundle, migrateConfig, openBundle, pinLegacyBoxResourceGap, CONFIG_VERSION } from '../../bundle';
import { migrateBundleConfig } from '../../bundle/configVersion';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../index';

// EF-117: an inline resource (`placement.position: 'here'`) inside a box
// keeps the gap it keeps in running text (EF-93): a line above it, and a
// line below it with `layout.inlineResourceGap: 'around'`. It sat right
// against the text around it. `layout.inlineResourceGapInBoxes: false`
// keeps that, and configurations stored before rules 6 are read with it.

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

const table: Resource = {
  id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  table: { model: { rows: [[{ content: 'a' }, { content: 'b' }], [{ content: 'c' }, { content: 'd' }]] } },
};
const figure: Resource = {
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 400, height: 120 }, placement: { position: 'here' },
};

const TEXT = 'A short paragraph of text.';
const boxed = (inner: string, type = '') => `:::callout${type ? `{type="${type}"}` : ''}\n${inner}\n:::`;
const MD = boxed(`${TEXT}\n\n::resource{id="t"}\n\n${TEXT}`);

const build = (markdown: string, layout: PostextConfig['layout'] = {}, extra: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown, resources: [table, figure] }, { layout: { layoutType: 'single', ...layout }, ...extra }, createMeasurementCache());

const kids = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.containerId !== undefined && b.type !== 'callout');
const frame = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const bottom = (b: VDTBlock) => b.bbox.y + b.bbox.height;
/** Space above and below the resource between its neighbours in the box. */
function gaps(doc: VDTDocument): { above: number; below: number; line: number } {
  const [a, r, b] = kids(doc) as [VDTBlock, VDTBlock, VDTBlock];
  expect(r.type).toBe('resource');
  return { above: r.bbox.y - bottom(a), below: b.bbox.y - bottom(r), line: a.lines[0]!.bbox.height };
}

describe('an inline resource inside a box keeps the gap (EF-117)', () => {
  it('keeps a line of the box text above and below it by default', () => {
    const g = gaps(build(MD));
    expect(g.line).toBeGreaterThan(0);
    expect(g.above).toBeCloseTo(g.line, 5);
    expect(g.below).toBeCloseTo(g.line, 5);
    // A figure too.
    const f = gaps(build(boxed(`${TEXT}\n\n::resource{id="f"}\n\n${TEXT}`)));
    expect(f.above).toBeCloseTo(f.line, 5);
    expect(f.below).toBeCloseTo(f.line, 5);
  });

  it('uses the box\'s own leading', () => {
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const doc = build(boxed(`${TEXT}\n\n::resource{id="t"}\n\n${TEXT}`, 'n'), {}, {
      calloutStyles: [{ id: 'n', body: { fontSize: pt(7), lineHeight: pt(9) } }],
    });
    const g = gaps(doc);
    expect(g.line).toBeCloseTo((9 * 300) / 72, 5);
    expect(g.above).toBeCloseTo(g.line, 5);
    expect(g.below).toBeCloseTo(g.line, 5);
  });

  it('shares the gap with a larger space of the next block, not both', () => {
    // A list after the table: its top margin (1.5 em) is larger than the line.
    const doc = build(boxed(`${TEXT}\n\n::resource{id="t"}\n\n- one\n- two`), {}, { unorderedLists: { marginTop: { value: 3, unit: 'em' } } });
    const [, r, li] = kids(doc) as [VDTBlock, VDTBlock, VDTBlock];
    expect(li.type).toBe('listItem');
    expect(li.bbox.y - bottom(r)).toBeCloseTo((8 * 300) / 72 * 3, 5);
  });

  it('keeps the gap above only with inlineResourceGap: \'above\'', () => {
    const g = gaps(build(MD, { inlineResourceGap: 'above' }));
    expect(g.above).toBeCloseTo(g.line, 5);
    expect(g.below).toBeCloseTo(0, 5);
  });

  it('sets the resource against the text with inlineResourceGapInBoxes: false (postext 1.4)', () => {
    const g = gaps(build(MD, { inlineResourceGapInBoxes: false }));
    expect(g.above).toBeCloseTo(0, 5);
    expect(g.below).toBeCloseTo(0, 5);
    // The running text keeps its own gap either way.
    const flow = build(`${TEXT}\n\n::resource{id="t"}\n\n${TEXT}`, { inlineResourceGapInBoxes: false });
    const [a, r] = flow.pages[0]!.columns[0]!.blocks as [VDTBlock, VDTBlock];
    expect(r.bbox.y - bottom(a)).toBeCloseTo(flow.baselineGrid, 1);
  });

  it('adds nothing at the top or the foot of the box: the padding sets the resource off', () => {
    const on = build(boxed('::resource{id="t"}'));
    const off = build(boxed('::resource{id="t"}'), { inlineResourceGapInBoxes: false });
    expect(frame(on).bbox.height).toBeCloseTo(frame(off).bbox.height, 5);
    expect(kids(on)[0]!.bbox.y - frame(on).bbox.y).toBeCloseTo(kids(off)[0]!.bbox.y - frame(off).bbox.y, 5);
  });

  it('resolves and strips the option', () => {
    expect(resolveLayoutConfig().inlineResourceGapInBoxes).toBe(true);
    expect(resolveLayoutConfig({ inlineResourceGapInBoxes: false }).inlineResourceGapInBoxes).toBe(false);
    expect(stripLayoutDefaults({ inlineResourceGapInBoxes: true })).toBeUndefined();
    expect(stripLayoutDefaults({ inlineResourceGapInBoxes: false })).toEqual({ inlineResourceGapInBoxes: false });
  });
});

describe('configurations stored before rules 6 keep the 1.4 box spacing', () => {
  // It names the box cut (EF-115), so the box gap is the pin that shows.
  const config: PostextConfig = { layout: { layoutType: 'single', boxChildSplitMinLines: 2 } };

  it('pins a configuration whose book embeds a resource in a box, once', () => {
    expect(CONFIG_VERSION).toBe(9);
    // Stamped 5 (a 1.5 prerelease): the box gap is the only pin it gets.
    expect(migrateConfig(config, 5, { content: MD }).layout).toEqual({ layoutType: 'single', boxChildSplitMinLines: 2, inlineResourceGapInBoxes: false });
    // Unversioned (1.4): both gap pins.
    expect(migrateConfig(config, undefined, { content: MD }).layout)
      .toEqual({ layoutType: 'single', boxChildSplitMinLines: 2, inlineResourceGap: 'above', inlineResourceGapInBoxes: false });
    // Unknown content: pinned.
    expect(migrateConfig(config, 5).layout).toEqual({ layoutType: 'single', boxChildSplitMinLines: 2, inlineResourceGapInBoxes: false });
    // Today's rules, or a book with no resource in a box: as it is.
    expect(migrateConfig(config, CONFIG_VERSION, { content: MD })).toBe(config);
    expect(migrateConfig(config, 5, { content: `${TEXT}\n\n::resource{id="t"}\n\n${boxed(TEXT)}` })).toBe(config);
    // Only a line inside an open `:::callout`, nested containers counted.
    expect(migrateConfig(config, 5, { content: `:::paragraphs\n::resource{id="t"}\n:::\n\n${boxed(TEXT)}` })).toBe(config);
    expect(migrateConfig(config, 5, { content: `:::callout\n:::columns{count=2}\nText.\n:::\n::resource{id="t"}\n:::` }).layout)
      .toEqual({ layoutType: 'single', boxChildSplitMinLines: 2, inlineResourceGapInBoxes: false });
    expect(migrateConfig(config, 5, { content: ['No box.', `Text.\r\n${boxed('  ::resource{id="t"}  ')}`] }).layout)
      .toEqual({ layoutType: 'single', boxChildSplitMinLines: 2, inlineResourceGapInBoxes: false });
    // A configuration that says whether boxes keep the gap is not pinned.
    const named: PostextConfig = { layout: { inlineResourceGapInBoxes: true } };
    expect(pinLegacyBoxResourceGap(named)).toBe(named);
    expect(pinLegacyBoxResourceGap({} as PostextConfig).layout).toEqual({ inlineResourceGapInBoxes: false });
    expect(migrateBundleConfig({}, [config], 5, { content: MD }).layout).toEqual({ layoutType: 'single', boxChildSplitMinLines: 2, inlineResourceGapInBoxes: false });
  });

  it('lays an unversioned bundle out as 1.4 did, and one written today with the gap', async () => {
    const zip = (extra: Record<string, unknown>) => zipSync({
      'preset.json': strToU8(JSON.stringify({
        version: 2, id: 'box', name: 'Box', locale: 'en',
        chapters: [{ title: 'Box', file: 'chapters/01.md' }],
        config: { layout: { layoutType: 'single' }, headings: { levels: [] } },
        resources: [{ id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, table: table.table }],
        ...extra,
      })),
      'chapters/01.md': strToU8(MD),
    });
    const old = await openBundle(zip({ configVersion: 5 }));
    expect(old.config.layout?.inlineResourceGapInBoxes).toBe(false);
    const oldGaps = gaps(buildBundle(old)[0]!);
    expect(oldGaps.above).toBeCloseTo(0, 5);
    const today = await openBundle(zip({ configVersion: CONFIG_VERSION }));
    expect(today.config.layout?.inlineResourceGapInBoxes).toBeUndefined();
    const todayGaps = gaps(buildBundle(today)[0]!);
    expect(todayGaps.above).toBeCloseTo(todayGaps.line, 5);
  });
});
