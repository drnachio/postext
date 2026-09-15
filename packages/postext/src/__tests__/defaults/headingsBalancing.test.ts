import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLUMN_BALANCING,
  resolveHeadingsConfig,
  stripHeadingsDefaults,
} from '../../defaults/headings';

describe('headings.balancing defaults', () => {
  it('beforeSpan (level the band a page-span box leaves) is on by default', () => {
    expect(DEFAULT_COLUMN_BALANCING.beforeSpan).toBe(true);
    expect(resolveHeadingsConfig().balancing.beforeSpan).toBe(true);
    expect(resolveHeadingsConfig({ balancing: { trailing: false } }).balancing.beforeSpan).toBe(true);
    expect(resolveHeadingsConfig({ balancing: { beforeSpan: false } }).balancing.beforeSpan).toBe(false);
  });

  it('strip keeps beforeSpan only when it differs from the default', () => {
    expect(stripHeadingsDefaults({ balancing: { beforeSpan: true } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { beforeSpan: false } })).toEqual({ balancing: { beforeSpan: false } });
    expect(stripHeadingsDefaults({ balancing: { beforeSpan: false, trailing: false } }))
      .toEqual({ balancing: { beforeSpan: false, trailing: false } });
  });
});
