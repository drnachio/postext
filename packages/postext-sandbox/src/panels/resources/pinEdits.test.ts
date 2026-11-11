import { describe, expect, it } from 'vitest';
import { MAX_PIN_PAGE_OFFSET, type Resource } from 'postext';
import { PIN_PAGE_OFFSETS, pinApplies, pinProblem, pinWithField, resourceWithPin } from './pinEdits.js';

const fig: Resource = { id: 'f', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, placement: { position: 'top' }, svg: { fileId: 'f.svg', width: 10, height: 10 } };

describe('a float set by hand, as the panel and the tools store it', () => {
  it('offers the citing page and the pages the engine waits for', () => {
    expect(PIN_PAGE_OFFSETS).toEqual(Array.from({ length: MAX_PIN_PAGE_OFFSET + 1 }, (_, i) => i));
  });

  it('changes one field at a time from the pin there is, or from the foot of the citing page', () => {
    const first = pinWithField(undefined, 'page', 2);
    expect(first).toEqual({ page: 2, slot: 'bottom' });
    const col = pinWithField(first, 'column', 1);
    expect(col).toEqual({ page: 2, column: 1, slot: 'bottom' });
    expect(pinWithField(col, 'slot', 'top')).toEqual({ page: 2, column: 1, slot: 'top' });
    expect(pinWithField(col, 'column', undefined)).toEqual({ page: 2, slot: 'bottom' });
    // Past the engine's reach: held at the furthest page.
    expect(pinWithField(col, 'page', 9).page).toBe(MAX_PIN_PAGE_OFFSET);
  });

  it('keeps the rest of the placement, and back to automatic drops only the pin', () => {
    const pinned = resourceWithPin(fig, { page: 1, slot: 'top' }, 5);
    expect(pinned.placement).toEqual({ position: 'top', pin: { page: 1, slot: 'top' } });
    expect(pinned.updatedAt).toBe(5);
    expect(resourceWithPin(pinned, undefined).placement).toEqual({ position: 'top' });
    expect('placement' in resourceWithPin({ ...fig, placement: { pin: { page: 0, slot: 'top' } } }, undefined)).toBe(false);
  });

  it('names what is wrong with a pin given by hand', () => {
    expect(pinProblem({ page: 0, slot: 'top' })).toBeNull();
    expect(pinProblem({ page: MAX_PIN_PAGE_OFFSET + 1, slot: 'top' })).toMatch(/0 to 3/);
    expect(pinProblem({ page: 0.5, slot: 'top' })).toMatch(/whole number/);
    expect(pinProblem({ page: 0, slot: 'side' })).toMatch(/top or bottom/);
    expect(pinProblem({ page: 0, column: 1.5, slot: 'top' })).toMatch(/column/);
    expect(pinProblem({ page: 0, slot: 'top', band: 1 })).toMatch(/no band/);
    expect(pinProblem(null)).toMatch(/\{ page, column\?, slot \}/);
  });

  it('applies to a float to a column or across the page only', () => {
    expect(pinApplies({ inline: false, span: 'column', rotated: false, plate: false })).toBe(true);
    expect(pinApplies({ inline: false, span: 'page', rotated: false, plate: false })).toBe(true);
    expect(pinApplies({ inline: true, span: 'column', rotated: false, plate: false })).toBe(false);
    expect(pinApplies({ inline: false, span: 'side', rotated: false, plate: false })).toBe(false);
    expect(pinApplies({ inline: false, span: 'page', rotated: true, plate: false })).toBe(false);
    expect(pinApplies({ inline: false, span: 'page', rotated: false, plate: true })).toBe(false);
  });
});
