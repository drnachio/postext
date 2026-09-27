import { describe, expect, it } from 'vitest';
import { resolveDesignSlot } from 'postext';
import type { DesignTextElement, ResolvedDesignTextElement } from 'postext';
import { lineHeightFieldValue, lineHeightFromField } from './lineHeight';

// EF-56: a design text's leading may be a Dimension; the Sandbox field
// offers em (the multiplier, stored as a number as before) and pt / mm.

const pt = (value: number) => ({ value, unit: 'pt' as const });
const resolvedWith = (lineHeight: DesignTextElement['lineHeight']): ResolvedDesignTextElement =>
  resolveDesignSlot({ elements: [{ kind: 'text', id: 't', content: 'x', fontSize: pt(20), overflow: 'clip', placement: { anchor: { to: 'container', edge: 'top' } }, lineHeight }] })
    .elements[0] as ResolvedDesignTextElement;

describe('design text line-height field', () => {
  it('shows a multiplier in em and an absolute leading as written', () => {
    expect(lineHeightFieldValue(resolvedWith(undefined))).toEqual({ value: 1.2, unit: 'em' });
    expect(lineHeightFieldValue(resolvedWith(1.5))).toEqual({ value: 1.5, unit: 'em' });
    expect(lineHeightFieldValue(resolvedWith(pt(15.5)))).toEqual(pt(15.5));
  });

  it('stores em as the plain multiplier and pt / mm as a Dimension', () => {
    expect(lineHeightFromField({ value: 1.2, unit: 'em' }, { value: 1.4, unit: 'em' }, pt(20))).toBe(1.4);
    expect(lineHeightFromField(pt(15), pt(16), pt(20))).toEqual(pt(16));
  });

  it('converts through the element\'s font size when the unit changes', () => {
    // 1.5 × 20 pt = 30 pt.
    expect(lineHeightFromField({ value: 1.5, unit: 'em' }, { value: 18, unit: 'pt' }, pt(20))).toEqual(pt(30));
    // 30 pt back to em at 20 pt.
    expect(lineHeightFromField(pt(30), { value: 2.5, unit: 'em' }, pt(20))).toBe(1.5);
    // 30 pt in mm.
    expect(lineHeightFromField(pt(30), { value: 10.58, unit: 'mm' }, pt(20))).toEqual({ value: 10.58, unit: 'mm' });
  });
});
