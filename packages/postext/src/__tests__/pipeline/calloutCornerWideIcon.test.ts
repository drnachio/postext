import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTBlock, VDTDesignImageBlock, VDTDesignTextBlock, VDTDocument } from '../../index';

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

const PAGE: PostextConfig = {
  page: { width: pt(500), height: pt(700), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(40), right: pt(40) } },
  layout: { layoutType: 'single' },
};

/** A strip of icons, 3.75 times as wide as it is tall. */
const strip: Resource = {
  id: 'strip', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'strip.svg', width: 375, height: 100 },
};

function config(cornerSide: 'left' | 'right', icon: Record<string, unknown> = {}): PostextConfig {
  return {
    ...PAGE,
    calloutStyles: [{
      id: 'k', name: 'K', title: 'Before you start', padding: { left: pt(4), right: pt(4) },
      titleStyle: { indent: pt(0), gap: pt(6) },
      icon: { kind: 'resource', resourceId: 'strip', size: pt(20), width: pt(75), position: 'corner', cornerSide, ...icon },
    }],
  } as PostextConfig;
}

const frameOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;

function layout(cornerSide: 'left' | 'right', icon: Record<string, unknown> = {}) {
  const doc = buildDocument({ markdown: ':::callout{type="k"}\nA line of text in the box.\n:::', resources: [strip] }, config(cornerSide, icon));
  const frame = frameOf(doc);
  const blocks = frame.designOverlay!.blocks;
  const image = blocks.find((b): b is VDTDesignImageBlock => b.kind === 'image')!;
  const title = blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.lines[0]?.text === 'Before you start');
  return { frame, image, title };
}

describe('a wide callout icon at a corner (EF-142)', () => {
  it('hangs centred on the top-right corner, half of its width past the border', () => {
    const { frame, image } = layout('right');
    expect(image.bbox.width).toBeCloseTo(75, 6);
    expect(image.bbox.x + image.bbox.width / 2).toBeCloseTo(frame.bbox.x + frame.bbox.width, 6);
  });

  it('hangs centred on the top-left corner, and the title starts past it', () => {
    const { frame, image, title } = layout('left');
    expect(image.bbox.x + image.bbox.width / 2).toBeCloseTo(frame.bbox.x, 6);
    // Half the strip (37.5 pt) plus the 6 pt gap from the box edge.
    expect(title!.bbox.x).toBeCloseTo(frame.bbox.x + 37.5 + 6, 6);
  });

  it('centres a strip narrower than its width box on the corner too', () => {
    // A 30 pt tall slot holds the strip at 20 pt: 75 pt wide, inside a 100 pt box.
    const { frame, image } = layout('right', { width: pt(100) });
    expect(image.bbox.width).toBeCloseTo(75, 6);
    expect(image.bbox.x + image.bbox.width / 2).toBeCloseTo(frame.bbox.x + frame.bbox.width, 6);
  });

  it('leaves a square corner icon where it was', () => {
    const { frame, image, title } = layout('left', { width: undefined });
    // Fitted in its 20 pt square, centred on the corner.
    expect(image.bbox.x + image.bbox.width / 2).toBeCloseTo(frame.bbox.x, 6);
    expect(title!.bbox.x).toBeCloseTo(frame.bbox.x + 10 + 6, 6);
  });
});
