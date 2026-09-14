import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESET_ID } from './builtin';
import { hidePresetId, isPresetHideable, partitionPresets, unhidePresetId } from './hidden';
import type { PresetSummary } from './types';

const sum = (id: string): PresetSummary => ({ id, name: id, source: 'private', available: true });

describe('hidden presets', () => {
  it('never hides the built-in preset and dedupes', () => {
    expect(hidePresetId([], BUILTIN_PRESET_ID)).toEqual([]);
    expect(hidePresetId(['a'], 'a')).toEqual(['a']);
    expect(hidePresetId(['a'], 'b')).toEqual(['a', 'b']);
    expect(isPresetHideable(BUILTIN_PRESET_ID)).toBe(false);
    expect(isPresetHideable('a')).toBe(true);
  });
  it('unhides', () => {
    expect(unhidePresetId(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('partitions keeping order and ignoring unknown ids', () => {
    const presets = [sum(BUILTIN_PRESET_ID), sum('a'), sum('b')];
    const { visible, hidden } = partitionPresets(presets, ['b', 'zzz', BUILTIN_PRESET_ID]);
    expect(visible.map((p) => p.id)).toEqual([BUILTIN_PRESET_ID, 'a']);
    expect(hidden.map((p) => p.id)).toEqual(['b']);
  });
});
