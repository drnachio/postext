// The Die-cuts section (#1570) and Print preparation › Die line: every
// field of a shape, a placement, the corners and the outline is drawn.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { setCardsOpen } from '../../../../controls/index.js';
import { DieCutsSection } from './index.js';
import { PrintDieLineGroup, withDieLine } from '../../output/PrintDieLineGroup.js';

function render(config: PostextConfig, component: unknown): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en', chapters: [], activeChapterId: null, markdown: '', selection: null };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(component as never)));
}

const mm = (value: number) => ({ value, unit: 'mm' as const });

describe('the Die-cuts section', () => {
  it('says what to do when the book has no die-cuts', () => {
    const html = render({}, DieCutsSection);
    expect(html).toContain(DEFAULT_LABELS.dieCutsIntro);
    expect(html).toContain(DEFAULT_LABELS.dieCutsShapeAdd);
    expect(html).toContain(DEFAULT_LABELS.dieCutsPlacementNoShape);
  });

  it('draws a shape card with its fields and preview, a placement, the corners and the outline', () => {
    setCardsOpen('dieShapes', ['0'], true);
    setCardsOpen('diePlacements', ['0'], true);
    const html = render({
      dieCuts: {
        shapes: [{ id: 'moon', name: 'Moon', shape: 'path', d: 'M0 0 L1 0 L1 1 Z', viewBox: [1, 1], x: mm(20), y: mm(30), width: mm(40), height: mm(40), leaves: 2 }],
        pages: [{ pages: '3-5', die: 'moon' }],
        corners: { radius: mm(4), edges: 'all' },
        outline: { d: 'M0 0 H90 Q100 50 90 100 H0 Z', viewBox: [100, 100] },
      },
    }, DieCutsSection);
    for (const key of ['dieCutsShapeId', 'dieCutsShapeName', 'dieCutsShape', 'dieCutsX', 'dieCutsY', 'dieCutsWidth', 'dieCutsHeight', 'dieCutsPathD', 'dieCutsViewBoxWidth', 'dieCutsLeaves', 'dieCutsWrap', 'dieCutsWrapGap',
      'dieCutsPlacementPages', 'dieCutsPlacementDie', 'dieCutsCornerRadius', 'dieCutsCornerEdgesAll', 'dieCutsOutline', 'dieCutsOutlinePreview'] as const) {
      expect(html, key).toContain(DEFAULT_LABELS[key]);
    }
    expect(html).toContain('aria-label="Preview of die shape moon"');
    expect(html).toContain('d="M0 0 L1 0 L1 1 Z"');
    expect(html).toContain('value="3-5"');
    expect(html).toContain('Pages 3-5 · moon');
  });
});

describe('the die line group', () => {
  it('draws its fields', () => {
    const html = render({}, PrintDieLineGroup);
    for (const key of ['printGroupDieLine', 'printDieLineOutput', 'printDieLineOutputPage', 'printDieLineInk', 'printDieLineCmyk', 'printDieLineWidth'] as const) {
      expect(html, key).toContain(DEFAULT_LABELS[key]);
    }
  });

  it('stores only what is set', () => {
    expect(withDieLine(undefined, { ink: 'CutContour' })).toEqual({ dieLine: { ink: 'CutContour' } });
    expect(withDieLine({ dieLine: { ink: 'CutContour' } }, { ink: undefined })).toBeUndefined();
    expect(withDieLine({ standard: 'pdfx4', dieLine: { output: 'none' } }, { output: undefined })).toEqual({ standard: 'pdfx4' });
  });
});
