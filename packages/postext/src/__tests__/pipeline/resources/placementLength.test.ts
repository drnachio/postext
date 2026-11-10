import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../../index.js';

// A resource's width as a length (`placement.width: { value, unit }`, this
// fork): the picture is set that wide, in the text, in a column float, in
// a page-span float and with text wrapped round it.

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
/** 72 dpi: 1 mm is 72 / 25.4 px. Two columns of 70 mm with a 6 mm gutter
 *  in a 146 mm text block. */
const PX = 72 / 25.4;
const config: PostextConfig = {
  page: { dpi: 72, width: mm(170), height: mm(240), margins: { top: mm(20), bottom: mm(20), left: mm(12), right: mm(12) } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', firstLineIndent: mm(0), hyphenation: { enabled: false } },
};

const sentence = 'The heap needs a cubic metre of mixed waste before it holds its heat.';
const para = (n: number) => Array.from({ length: n }, () => sentence).join(' ');

const figure = (placement: Resource['placement']): Resource => ({
  id: 'fig', typeId: 'figure', kind: 'svg', caption: 'A bed.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'fig.svg', width: 400, height: 300 },
  placement,
});

const build = (md: string, r: Resource, cfg: PostextConfig = config): VDTDocument =>
  buildDocument({ markdown: md, resources: [r] }, cfg, createMeasurementCache());
const resourceOf = (doc: VDTDocument): VDTBlock =>
  doc.pages.flatMap((p) => [...(p.floats ?? []), ...p.columns.flatMap((c) => c.blocks)]).find((b) => b.resourceBlock)!;
const bodyWidthMm = (doc: VDTDocument): number => resourceOf(doc).resourceBlock!.bodyRect.width / PX;

const CITED = `${para(3)} See :ref{id="fig"}. ${para(6)}`;

describe('a resource width given as a length', () => {
  it('sets an inline picture that wide in its column', () => {
    const doc = build(`${para(2)}\n\n::resource{id="fig"}\n\n${para(4)}`, figure({ position: 'here', width: mm(45) }));
    expect(bodyWidthMm(doc)).toBeCloseTo(45, 1);
  });

  it('sets a column float and a page-span float that wide', () => {
    expect(bodyWidthMm(build(CITED, figure({ width: mm(50) })))).toBeCloseTo(50, 1);
    expect(bodyWidthMm(build(CITED, figure({ span: 'page', width: mm(110) })))).toBeCloseTo(110, 1);
  });

  it('takes centimetres and points too', () => {
    expect(bodyWidthMm(build(CITED, figure({ width: { value: 5, unit: 'cm' } })))).toBeCloseTo(50, 1);
    expect(bodyWidthMm(build(CITED, figure({ width: { value: 144, unit: 'pt' } })))).toBeCloseTo(50.8, 1);
  });

  it('lays out as the same share of the slot would', () => {
    const asLength = build(CITED, figure({ span: 'page', width: mm(73) }));
    const asShare = build(CITED, figure({ span: 'page', width: 73 / 146 }));
    expect(resourceOf(asLength).bbox).toEqual(resourceOf(asShare).bbox);
  });

  it('runs the text beside a wrapped picture that wide', () => {
    const doc = build(`${para(2)}\n\n::resource{id="fig"}\n\n${para(8)}`, figure({ position: 'here', wrap: 'right', width: mm(30) }));
    expect(bodyWidthMm(doc)).toBeCloseTo(30, 1);
    expect(doc.pages[0]!.columns[0]!.exclusions).toHaveLength(1);
  });

  it('takes the whole slot when as wide as it or wider', () => {
    const wide = build(CITED, figure({ width: mm(300) }));
    const whole = build(CITED, figure({}));
    expect(resourceOf(wide).bbox).toEqual(resourceOf(whole).bbox);
  });

  it('reads a length from the resource type', () => {
    const cfg = { ...config, resourceTypes: [{ id: 'figure', defaultPlacement: { width: mm(40) } }] } as unknown as PostextConfig;
    expect(bodyWidthMm(build(CITED, figure(undefined), cfg))).toBeCloseTo(40, 1);
  });
});
