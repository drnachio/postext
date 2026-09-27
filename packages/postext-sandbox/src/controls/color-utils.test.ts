import { describe, it, expect } from 'vitest';
import { hexAlpha, hexWithAlpha, hexWithoutAlpha } from './color-utils';

// EF-30: colour values may carry alpha in any of the forms the engine
// paints (`#rrggbbaa`, `#rgba`, `rgba()`); the picker reads them all.
describe('colour alpha helpers', () => {
  it('read the alpha of every colour form', () => {
    expect(hexAlpha('#ff0000')).toBe(100);
    expect(hexAlpha('#ff000080')).toBe(50);
    expect(hexAlpha('transparent')).toBe(0);
    expect(hexAlpha('#f008')).toBe(53);
    expect(hexAlpha('rgba(0, 0, 255, 0.25)')).toBe(25);
    expect(hexAlpha('rgb(0 0 255 / 40%)')).toBe(40);
  });

  it('strip the alpha to a six-digit hex', () => {
    expect(hexWithoutAlpha('#ff000080')).toBe('#ff0000');
    expect(hexWithoutAlpha('#f008')).toBe('#ff0000');
    expect(hexWithoutAlpha('#abc')).toBe('#aabbcc');
    expect(hexWithoutAlpha('rgba(0, 0, 255, 0.25)')).toBe('#0000ff');
    expect(hexWithoutAlpha('transparent')).toBe('#000000');
  });

  it('write hex with alpha back', () => {
    expect(hexWithAlpha('#0000ff', 25)).toBe('#0000ff40');
    expect(hexWithAlpha('#0000ff', 100)).toBe('#0000ff');
    expect(hexWithAlpha('#0000ff', 0)).toBe('transparent');
  });
});
