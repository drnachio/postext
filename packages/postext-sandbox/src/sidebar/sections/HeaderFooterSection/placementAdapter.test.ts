import { describe, expect, it } from 'vitest';
import type { ElementPlacement } from 'postext';
import {
  anchorTargetId,
  applyAlign,
  applyAnchorTarget,
  isContainerAnchor,
  isElementAnchor,
  isPageFrameAnchor,
} from './placementAdapter';

const pt = (value: number) => ({ value, unit: 'pt' as const });

describe('placementAdapter anchor targets', () => {
  const inContainer: ElementPlacement = {
    anchor: { to: 'container', edge: 'bottom-left' },
    offset: { x: pt(4), y: pt(-6) },
  };

  it('classifies container, page/bleed and element anchors', () => {
    const page = applyAnchorTarget(inContainer, 'header', 'page');
    const element = applyAnchorTarget(inContainer, 'header', 'rule1');
    expect(isContainerAnchor(inContainer)).toBe(true);
    expect(isPageFrameAnchor(inContainer)).toBe(false);
    expect(isElementAnchor(inContainer)).toBe(false);
    expect(isPageFrameAnchor(page)).toBe(true);
    expect(isElementAnchor(page)).toBe(false);
    expect(isElementAnchor(element)).toBe(true);
    expect(element.anchor.to).toBe('#rule1');
  });

  it('round-trips page and bleed through the target picker', () => {
    for (const target of ['page', 'bleed'] as const) {
      const next = applyAnchorTarget(inContainer, 'footer', target);
      expect(next.anchor.to).toBe(target);
      expect(anchorTargetId(next)).toBe(target);
      // Moving between frames keeps the container edge and offsets.
      expect(next.anchor.edge).toBe('bottom-left');
      expect(next.offset).toEqual({ x: pt(4), y: pt(-6) });
    }
  });

  it('starts a frame anchor centred when coming from an element anchor', () => {
    const element: ElementPlacement = {
      anchor: { to: '#text1', edge: 'right-of' },
      offset: { x: pt(3), y: pt(0) },
    };
    const next = applyAnchorTarget(element, 'header', 'bleed');
    expect(next.anchor).toEqual({ to: 'bleed', edge: 'bottom' });
    expect(next.offset).toEqual({ x: pt(0), y: pt(0) });
  });

  it('keeps a frame target when re-aligning', () => {
    const page = applyAnchorTarget(inContainer, 'heading', 'page');
    const aligned = applyAlign(page, 'heading', 'right');
    expect(aligned.anchor).toEqual({ to: 'page', edge: 'top-right' });
  });
});
