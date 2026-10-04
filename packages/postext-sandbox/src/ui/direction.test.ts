import { describe, expect, it } from 'vitest';
import { uiDirectionOf } from './direction';

describe('uiDirectionOf', () => {
  it('runs Arabic, Hebrew and Persian interfaces right to left', () => {
    expect(uiDirectionOf('ar')).toBe('rtl');
    expect(uiDirectionOf('ar-EG')).toBe('rtl');
    expect(uiDirectionOf('he')).toBe('rtl');
    expect(uiDirectionOf('fa_IR')).toBe('rtl');
  });
  it('runs every other interface left to right', () => {
    expect(uiDirectionOf('en')).toBe('ltr');
    expect(uiDirectionOf('zh-Hans')).toBe('ltr');
    expect(uiDirectionOf('ca')).toBe('ltr');
    expect(uiDirectionOf(undefined)).toBe('ltr');
  });
});
