import { describe, it, expect } from 'vitest';
import {
  resolveBodyTextConfig,
  resolveTableStyleConfig,
  resolveTableStylesConfig,
  stripTableStyleDefaults,
  stripTableStylesDefaults,
  pickTableStyle,
  stripConfigDefaults,
} from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

describe('tableStyle.borderRadius', () => {
  it('defaults to a square frame and is stripped when zero', () => {
    const body = resolveBodyTextConfig(undefined);
    expect(resolveTableStyleConfig(undefined, body).borderRadius.value).toBe(0);
    expect(stripTableStyleDefaults({ borderRadius: pt(0) })).toBeUndefined();
    expect(stripTableStyleDefaults({ borderRadius: pt(4) })).toEqual({ borderRadius: pt(4) });
  });
});

describe('resolveTableStylesConfig', () => {
  const body = resolveBodyTextConfig(undefined);

  it('lays each style over the global tableStyle, then the body text', () => {
    const [s] = resolveTableStylesConfig(
      [{ id: 'check', rules: 'outer' }],
      { borders: false, borderColor: hex('#163a76') },
      body,
    );
    expect(s!.id).toBe('check');
    expect(s!.name).toBe('check');
    expect(s!.rules).toBe('outer');
    expect(s!.borders).toBe(false);
    expect(s!.borderColor.hex).toBe('#163a76');
    expect(s!.bodyFontFamily).toBe(body.fontFamily);
  });

  it('a set field wins over the global one, an explicit undefined does not mask it', () => {
    const [s] = resolveTableStylesConfig(
      [{ id: 'a', borders: true, rules: undefined }],
      { borders: false, rules: 'horizontal' },
      body,
    );
    expect(s!.borders).toBe(true);
    expect(s!.rules).toBe('horizontal');
  });

  it('is empty when no styles are declared', () => {
    expect(resolveTableStylesConfig(undefined, undefined, body)).toEqual([]);
    expect(resolveAllConfig(undefined).tableStyles).toEqual([]);
  });
});

describe('stripTableStylesDefaults', () => {
  it('keeps fields equal to a static default (they override the global style)', () => {
    expect(stripTableStylesDefaults([{ id: 'a', name: 'a', borders: true, rules: 'grid', cellPadding: undefined }]))
      .toEqual([{ id: 'a', borders: true, rules: 'grid' }]);
    expect(stripTableStylesDefaults([{ id: 'a', name: 'Checklist' }])).toEqual([{ id: 'a', name: 'Checklist' }]);
    expect(stripTableStylesDefaults([])).toBeUndefined();
  });

  it('survives stripConfigDefaults', () => {
    const stripped = stripConfigDefaults({ tableStyles: [{ id: 'a', borderRadius: pt(8) }] });
    expect(stripped.tableStyles).toEqual([{ id: 'a', borderRadius: pt(8) }]);
    expect('tableStyles' in stripConfigDefaults({ tableStyles: [] })).toBe(false);
  });
});

describe('pickTableStyle', () => {
  it('selects by id and falls back to the global style', () => {
    const resolved = resolveAllConfig({ tableStyles: [{ id: 'x', rules: 'none' }] });
    expect(pickTableStyle(resolved, 'x').rules).toBe('none');
    expect(pickTableStyle(resolved, 'nope')).toBe(resolved.tableStyle);
    expect(pickTableStyle(resolved, undefined)).toBe(resolved.tableStyle);
  });
});
