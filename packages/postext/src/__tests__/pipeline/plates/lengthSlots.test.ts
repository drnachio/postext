import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../../index.js';
import { config, mm, PX, para, svg } from './fixture.js';

// A width given as a length is measured against the slot the resource is
// set in (#1461): the columns of a styled section, a column of unequal
// width, the length of a turned picture.

const build = (md: string, r: Resource, cfg: PostextConfig = config): VDTDocument =>
  buildDocument({ markdown: md, resources: [r] }, cfg, createMeasurementCache());
const blockOf = (doc: VDTDocument): VDTBlock =>
  doc.pages.flatMap((p) => [...(p.floats ?? []), ...p.columns.flatMap((c) => c.blocks)]).find((b) => b.resourceBlock)!;
const widthMm = (doc: VDTDocument): number => blockOf(doc).resourceBlock!.bodyRect.width / PX;

const CITED = `${para(3)} See :ref{id="a"}. ${para(10)}`;

describe('a width length in its slot', () => {
  it('is measured against the single column of a styled section', () => {
    const cfg = { ...config, headingStyles: [{ id: 'wide', layout: { layoutType: 'single' } }] } as PostextConfig;
    const md = `# Plain\n\n${para(4)}\n\n# Wide {style="wide"}\n\n${CITED}`;
    // 100 mm is wider than a 70 mm column of the document, narrower than
    // the section's 146 mm one.
    expect(widthMm(build(md, svg('a', 400, 300, { width: mm(100) }), cfg))).toBeCloseTo(100, 1);
    expect(widthMm(build(md, svg('a', 400, 300, { width: mm(100) })))).toBeCloseTo(70, 1);
  });

  it('is measured against the main or the side column of unequal columns', () => {
    const cfg = { ...config, layout: { layoutType: 'oneAndHalf', gutterWidth: mm(6), sideColumnPercent: 30, sideColumnRole: 'floats' } } as PostextConfig;
    expect(widthMm(build(CITED, svg('a', 400, 300, { width: mm(80) }), cfg))).toBeCloseTo(80, 1);
    const side = build(CITED, svg('a', 400, 300, { span: 'side', width: mm(25) }), cfg);
    expect(widthMm(side)).toBeCloseTo(25, 1);
    // Wider than the side column: the whole side column.
    const whole = build(CITED, svg('a', 400, 300, { span: 'side' }), cfg);
    const over = build(CITED, svg('a', 400, 300, { span: 'side', width: mm(90) }), cfg);
    expect(widthMm(over)).toBeCloseTo(widthMm(whole), 3);
  });

  it('sets a turned picture that long before it is turned', () => {
    const turned = (width?: { value: number; unit: 'mm' }) =>
      blockOf(build(CITED, svg('a', 400, 300, { rotate: 'ccw', ...(width ? { width } : {}) }))).resourceBlock!;
    const free = turned();
    const set = turned(mm(60));
    expect(set.rotation).toBeDefined();
    // Laid out unturned, 60 mm along its own width, its proportions kept.
    expect(set.bodyRect.width / PX).toBeCloseTo(60, 1);
    expect(set.bodyRect.height / PX).toBeCloseTo(45, 1);
    expect(set.bodyRect.width).toBeLessThan(free.bodyRect.width);
  });
});
