import { describe, expect, it } from 'vitest';
import { resolvePageConfig, PAGE_SIZE_PRESETS } from '../../defaults/page';

describe('resolvePageConfig size presets', () => {
  it('derives width and height from a named preset', () => {
    const page = resolvePageConfig({ sizePreset: '21x28' });
    expect(page.width).toEqual(PAGE_SIZE_PRESETS['21x28'].width);
    expect(page.height).toEqual(PAGE_SIZE_PRESETS['21x28'].height);
  });

  it('keeps explicit dimensions over the preset, filling only the missing side', () => {
    const page = resolvePageConfig({ sizePreset: '12x19', width: { value: 30, unit: 'cm' } });
    expect(page.width).toEqual({ value: 30, unit: 'cm' });
    expect(page.height).toEqual(PAGE_SIZE_PRESETS['12x19'].height);
  });

  it('uses explicit dimensions for the custom preset', () => {
    const page = resolvePageConfig({
      sizePreset: 'custom',
      width: { value: 30, unit: 'cm' },
      height: { value: 40, unit: 'cm' },
    });
    expect(page.width).toEqual({ value: 30, unit: 'cm' });
    expect(page.height).toEqual({ value: 40, unit: 'cm' });
  });
});
