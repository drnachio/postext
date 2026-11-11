import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { composeSource, croppedSize, resourceCrop, withinCrop } from '../../../pipeline/resources/safeArea.js';
import type { VDTBlock } from '../../../vdt.js';
import type { PostextConfig, Resource } from '../../../types.js';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
};
const pic = (extra: Partial<Resource> = {}): Resource => ({
  id: 'p', typeId: 'figure', kind: 'svg', caption: 'A picture.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'p.svg', width: 800, height: 400 },
  placement: { position: 'here' },
  ...extra,
});
const figureOf = (r: Resource): VDTBlock => {
  const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="p"}\n\nMore text.', resources: [r] }, config);
  for (const b of doc.blocks) if (b.resourceBlock?.resource.id === 'p') return b;
  throw new Error('figure not set');
};

describe('the crop helpers', () => {
  it('read the crop of a picture only, and none that keeps it whole', () => {
    expect(resourceCrop(pic({ crop: { x: 0.25, y: 0, width: 0.5, height: 1 } }))).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(resourceCrop(pic({ crop: { x: 0, y: 0, width: 1, height: 1 } }))).toBeUndefined();
    expect(resourceCrop({ ...pic({ crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }), kind: 'table' })).toBeUndefined();
  });

  it('size, re-measure the safe area inside the crop, and compose back to the whole picture', () => {
    const crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    expect(croppedSize(800, 400, crop)).toEqual({ width: 400, height: 400 });
    expect(withinCrop({ x: 0.375, y: 0.25, width: 0.25, height: 0.5 }, crop)).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(composeSource(crop, { x: 0, y: 0.25, width: 1, height: 0.5 })).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(composeSource(crop, undefined)).toEqual(crop);
    expect(composeSource(undefined, undefined)).toBeUndefined();
  });
});

describe('a cropped figure', () => {
  it('takes the crop’s ratio and shows only the crop', () => {
    const whole = figureOf(pic()).resourceBlock!;
    const cropped = figureOf(pic({ crop: { x: 0.25, y: 0, width: 0.5, height: 1 } })).resourceBlock!;
    expect(whole.bodyRect.height / whole.bodyRect.width).toBeCloseTo(0.5, 3);
    expect(cropped.bodyRect.height / cropped.bodyRect.width).toBeCloseTo(1, 3);
    expect(whole.bodySource).toBeUndefined();
    expect(cropped.bodySource).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('keeps a bitmap’s pixels from being enlarged past the crop', () => {
    const r = pic({ kind: 'bitmap', svg: undefined, bitmap: { fileId: 'b.png', format: 'png', width: 200, height: 100 }, crop: { x: 0, y: 0, width: 0.5, height: 1 } } as Partial<Resource>);
    const rb = figureOf(r).resourceBlock!;
    // The crop is 100 px wide: set at its size, not stretched to the column.
    expect(rb.bodyRect.width).toBeCloseTo(100, 3);
    expect(rb.bodyRect.height).toBeCloseTo(100, 3);
  });
});
