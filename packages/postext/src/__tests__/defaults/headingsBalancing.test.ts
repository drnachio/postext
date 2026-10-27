import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLUMN_BALANCING,
  resolveHeadingsConfig,
  stripHeadingsDefaults,
} from '../../defaults/structure/headings.js';

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

  it('maxLinesBeforeLoose is 2 by default, and strips when it is (#707)', () => {
    expect(DEFAULT_COLUMN_BALANCING.maxLinesBeforeLoose).toBe(2);
    expect(resolveHeadingsConfig().balancing.maxLinesBeforeLoose).toBe(2);
    expect(resolveHeadingsConfig({ balancing: { maxLinesPerHeading: 1 } }).balancing.maxLinesBeforeLoose).toBe(2);
    expect(resolveHeadingsConfig({ balancing: { maxLinesBeforeLoose: 0 } }).balancing.maxLinesBeforeLoose).toBe(0);
    expect(stripHeadingsDefaults({ balancing: { maxLinesBeforeLoose: 2 } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { maxLinesBeforeLoose: 4 } })).toEqual({ balancing: { maxLinesBeforeLoose: 4 } });
    expect(stripHeadingsDefaults({ balancing: { maxLinesBeforeLoose: 0 } })).toEqual({ balancing: { maxLinesBeforeLoose: 0 } });
  });

  it('stretchAfterWideFloats is \'flush\' by default, and any other value reads as it (#708)', () => {
    expect(DEFAULT_COLUMN_BALANCING.stretchAfterWideFloats).toBe('flush');
    expect(resolveHeadingsConfig().balancing.stretchAfterWideFloats).toBe('flush');
    expect(resolveHeadingsConfig({ balancing: { stretchAfterWideFloats: 'always' } }).balancing.stretchAfterWideFloats).toBe('always');
    expect(resolveHeadingsConfig({ balancing: { stretchAfterWideFloats: 'sometimes' as never } }).balancing.stretchAfterWideFloats).toBe('flush');
    expect(stripHeadingsDefaults({ balancing: { stretchAfterWideFloats: 'flush' } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { stretchAfterWideFloats: 'always' } })).toEqual({ balancing: { stretchAfterWideFloats: 'always' } });
  });

  it('stretchAfterDisplays (a line under a formula or a box) is on by default (#710)', () => {
    expect(DEFAULT_COLUMN_BALANCING.stretchAfterDisplays).toBe(true);
    expect(resolveHeadingsConfig().balancing.stretchAfterDisplays).toBe(true);
    expect(resolveHeadingsConfig({ balancing: { trailing: false } }).balancing.stretchAfterDisplays).toBe(true);
    expect(resolveHeadingsConfig({ balancing: { stretchAfterDisplays: false } }).balancing.stretchAfterDisplays).toBe(false);
    expect(stripHeadingsDefaults({ balancing: { stretchAfterDisplays: true } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { stretchAfterDisplays: false } })).toEqual({ balancing: { stretchAfterDisplays: false } });
  });

  it('fillShortColumns (fill a column the break rules left short) is off by default (#1236)', () => {
    expect(DEFAULT_COLUMN_BALANCING.fillShortColumns).toBe(false);
    expect(resolveHeadingsConfig().balancing.fillShortColumns).toBe(false);
    expect(resolveHeadingsConfig({ balancing: { trailing: false } }).balancing.fillShortColumns).toBe(false);
    expect(resolveHeadingsConfig({ balancing: { fillShortColumns: true } }).balancing.fillShortColumns).toBe(true);
    expect(stripHeadingsDefaults({ balancing: { fillShortColumns: false } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { fillShortColumns: true } })).toEqual({ balancing: { fillShortColumns: true } });
  });
});
