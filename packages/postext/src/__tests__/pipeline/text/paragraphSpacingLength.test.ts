/**
 * `paragraphSpacing` as a length (#1115): `true` is still one line, a
 * length is the space between two paragraphs, set exactly in the main
 * flow, in boxes and in composed frames. In the main flow the paragraphs
 * leave the baseline grid as those of a `:::paragraphs` container do, and
 * the next block that snaps (a heading, a list's last item) brings the flow
 * back onto it.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveBodyStyle, paragraphSpacingPx } from '../../../pipeline/styles.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { resolveHeadingsConfig } from '../../../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../../../defaults/text/unorderedLists.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../../defaults/text/bodyText.js';
import { resolveCalloutStylesConfig, stripCalloutStylesDefaults } from '../../../defaults/boxes/calloutStyles.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { Dimension, PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const DPI = 300;
const MM = DPI / 25.4;
const LINE = 14 * (DPI / 72);

const config = (spacing: boolean | Dimension, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  layout: { layoutType: 'single' } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(10), lineHeight: pt(14), paragraphSpacing: spacing, firstLineIndent: pt(0) } as never,
  ...extra,
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const paragraphs = (blocks: readonly VDTBlock[]): VDTBlock[] => blocks.filter((b) => b.type === 'paragraph');
/** The space between the foot of the first paragraph and the head of the second. */
const gap = (blocks: readonly VDTBlock[]): number => {
  const [a, b] = paragraphs(blocks);
  return b!.bbox.y - (a!.bbox.y + a!.bbox.height);
};
const TWO = 'One short paragraph.\n\nAnother short one.';

describe('paragraphSpacingPx', () => {
  it('reads true as a line, false as none and a length as that length', () => {
    expect(paragraphSpacingPx(true, 50, DPI, 40)).toBe(50);
    expect(paragraphSpacingPx(false, 50, DPI, 40)).toBe(0);
    expect(paragraphSpacingPx(undefined, 50, DPI, 40)).toBe(0);
    expect(paragraphSpacingPx(mm(2), 50, DPI, 40)).toBeCloseTo(2 * MM, 6);
    expect(paragraphSpacingPx({ value: 0.5, unit: 'em' }, 50, DPI, 40)).toBeCloseTo(20, 6);
    expect(paragraphSpacingPx(mm(-2), 50, DPI, 40)).toBe(0);
  });

  it('lands in the body style', () => {
    expect(resolveBodyStyle(resolveAllConfig(config(true))).marginBottomPx).toBeCloseTo(LINE, 6);
    expect(resolveBodyStyle(resolveAllConfig(config(false))).marginBottomPx).toBe(0);
    expect(resolveBodyStyle(resolveAllConfig(config(mm(2)))).marginBottomPx).toBeCloseTo(2 * MM, 6);
  });
});

describe('resolve and strip', () => {
  it('keeps a length through the body text and a box body', () => {
    expect(resolveBodyTextConfig({ paragraphSpacing: mm(2) }).paragraphSpacing).toEqual(mm(2));
    expect(stripBodyTextDefaults({ paragraphSpacing: mm(2) })).toEqual({ paragraphSpacing: mm(2) });
    expect(stripBodyTextDefaults({ paragraphSpacing: false })).toBeUndefined();
    const body = resolveBodyTextConfig({ paragraphSpacing: mm(2) });
    const [inherited] = resolveCalloutStylesConfig([{ id: 'x' }], body, resolveHeadingsConfig(), resolveUnorderedListsConfig(undefined, body));
    expect(inherited!.body.paragraphSpacing).toEqual(mm(2));
    const [own] = resolveCalloutStylesConfig([{ id: 'x', body: { paragraphSpacing: pt(3) } }], body, resolveHeadingsConfig(), resolveUnorderedListsConfig(undefined, body));
    expect(own!.body.paragraphSpacing).toEqual(pt(3));
    expect(stripCalloutStylesDefaults([{ id: 'x', body: { paragraphSpacing: pt(3) } }])).toEqual([{ id: 'x', body: { paragraphSpacing: pt(3) } }]);
  });
});

describe('in the main flow', () => {
  const blocks = (doc: VDTDocument) => doc.pages[0]!.columns.flatMap((c) => c.blocks);
  it('true still adds one line', () => {
    expect(gap(blocks(build(TWO, config(true))))).toBeCloseTo(LINE, 3);
  });
  it('a length is set exactly, as spaceBetween in a :::paragraphs container', () => {
    expect(gap(blocks(build(TWO, config(mm(2)))))).toBeCloseTo(2 * MM, 3);
  });
  it('a heading after spaced paragraphs brings the flow back onto the grid', () => {
    const doc = build(`${TWO}\n\n# Head\n\nAfter the head.`, config(mm(2)));
    const after = paragraphs(blocks(doc)).at(-1)!;
    const top = doc.pages[0]!.columns[0]!.bbox.y;
    const steps = (after.bbox.y - top) / LINE;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-3);
  });
});

describe('in a box', () => {
  const boxBlocks = (doc: VDTDocument): VDTBlock[] => doc.pages[0]!.columns.flatMap((c) => c.blocks).filter((b) => b.type === 'paragraph' && b.containerId !== undefined);
  const md = `:::callout\n${TWO}\n:::`;
  it('a box body sets its own length exactly', () => {
    const cfg = config(false, { calloutStyles: [{ id: 'note', body: { paragraphSpacing: mm(2) } }] as never });
    expect(gap(boxBlocks(build(md, cfg)))).toBeCloseTo(2 * MM, 3);
  });
  it('a box takes the body text\'s length when it sets none', () => {
    expect(gap(boxBlocks(build(md, config(mm(2)))))).toBeCloseTo(2 * MM, 3);
  });
});

describe('in a composed frame', () => {
  const template: PageTemplate = {
    id: 'card',
    frames: [{ name: 'main', height: mm(60), placement: { anchor: { to: 'container', edge: 'top-left' } } }],
  } as never;
  const page = `::::page{template="card"}\n:::frame{slot="main"}\n${TWO}\n:::\n::::`;
  const frameBlocks = (doc: VDTDocument): VDTBlock[] => {
    const p: VDTPage = doc.pages.find((x) => x.composed)!;
    const f: VDTFrame = p.composed!.frames.find((x) => x.name === 'main')!;
    return f.blockIds.map((id) => p.floats!.find((b) => b.id === id)!);
  };
  it('lays two paragraphs 2 mm apart', () => {
    expect(gap(frameBlocks(build(page, config(mm(2), { pageTemplates: [template] }))))).toBeCloseTo(2 * MM, 3);
  });
  it('true still lays them a line apart', () => {
    expect(gap(frameBlocks(build(page, config(true, { pageTemplates: [template] }))))).toBeCloseTo(LINE, 3);
  });
});
