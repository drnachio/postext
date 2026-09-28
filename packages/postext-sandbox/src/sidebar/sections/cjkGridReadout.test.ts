import { describe, it, expect } from 'vitest';
import { cjkGridGeometry, resolvePageConfig } from 'postext';
import type { PostextConfig } from 'postext';
import { gridMarginsText, mmText, pageDrawingConfig } from './cjkGridReadout';

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

// 大32开, 五号 with 16.5 pt lines, 28 × 28: a 294 pt (103.7 mm) measure.
const config: PostextConfig = {
  locale: 'zh-Hans',
  page: { width: mm(140), height: mm(203), dpi: 72, margins: { top: mm(18), bottom: mm(20), left: mm(16), right: mm(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10.5), lineHeight: pt(16.5) },
  cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 28 } },
};

describe('character grid read-out', () => {
  it('writes millimetres as the UI locale writes numbers', () => {
    expect(mmText(294, 72, 'en')).toBe('103.7');
    expect(mmText(294, 72, 'es')).toBe('103,7');
    const g = cjkGridGeometry(config)!;
    expect(gridMarginsText('__top__ / __bottom__ / __left__ / __right__', g, 'es')).not.toMatch(/\d\.\d/);
    expect(gridMarginsText('__left__', g, 'es')).toBe(mmText(g.margins.left, 72, 'es'));
  });

  it('draws the page with the margins the grid sets, in points', () => {
    for (const dpi of [72, 300]) {
      const at = { ...config, page: { ...config.page!, dpi } };
      const g = cjkGridGeometry(at)!;
      const drawn = resolvePageConfig(pageDrawingConfig(at).page);
      expect(drawn.margins.left.unit).toBe('pt');
      expect(drawn.margins.left.value).toBeCloseTo((g.margins.left / dpi) * 72, 9);
      expect(drawn.margins.top.value).toBeCloseTo((g.margins.top / dpi) * 72, 9);
      // 140 mm less the 294 pt measure, shared by the two margins.
      expect(drawn.margins.left.value + drawn.margins.right!.value).toBeCloseTo((140 / 25.4) * 72 - 294, 6);
    }
    // Off: the config as written.
    const off = { ...config, cjk: { grid: { enabled: false } } };
    expect(pageDrawingConfig(off)).toBe(off);
  });
});
