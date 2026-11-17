import { describe, it, expect } from 'vitest';
import { setMeasureUprightDigits, setMeasureWritingMode, verticalTextWidth } from '../../measure/vertical.js';
import { clearMeasurementCache } from '../../measure/index.js';
import { installSizedStub, SizedStubCtx } from './stub.js';

installSizedStub();

// The advance of a vertical text is kept by text, font and the settings
// that cut it into cells (#1610): each of them asks again.
describe('verticalTextWidth keeps what it measured', () => {
  const FONT = '10px Test Serif';

  it('reads the same text and font once, and a custom run measure every time', () => {
    const measureText = SizedStubCtx.prototype.measureText;
    let calls = 0;
    SizedStubCtx.prototype.measureText = function (s: string) {
      calls++;
      return measureText.call(this, s);
    };
    try {
      clearMeasurementCache();
      const first = verticalTextWidth('第一回 abc 甄士隱', FONT);
      const asked = calls;
      expect(asked).toBeGreaterThan(0);
      expect(verticalTextWidth('第一回 abc 甄士隱', FONT)).toBe(first);
      expect(calls).toBe(asked);

      let runs = 0;
      const custom = (run: string): number => { runs++; return run.length; };
      verticalTextWidth('第一回 abc 甄士隱', FONT, custom);
      const perCall = runs;
      verticalTextWidth('第一回 abc 甄士隱', FONT, custom);
      expect(perCall).toBeGreaterThan(0);
      expect(runs).toBe(perCall * 2);
    } finally {
      SizedStubCtx.prototype.measureText = measureText;
    }
  });

  it('measures again in another font, region or upright-digit setting, and after the widths are dropped', () => {
    const text = '123月！？';
    const base = verticalTextWidth(text, FONT);
    expect(verticalTextWidth(text, '20px Test Serif')).toBe(base * 2);

    // Three digits set sideways, or in one cell
    setMeasureUprightDigits(3);
    const oneCell = verticalTextWidth(text, FONT);
    setMeasureUprightDigits(2);
    expect(oneCell).not.toBe(base);
    expect(verticalTextWidth(text, FONT)).toBe(base);

    // The mainland interpunct stands in half a cell
    const mainland = verticalTextWidth('甲·乙', FONT);
    setMeasureWritingMode('horizontal-tb', 'taiwan');
    const taiwan = verticalTextWidth('甲·乙', FONT);
    setMeasureWritingMode('horizontal-tb', 'mainland');
    expect(taiwan).not.toBe(mainland);
    expect(verticalTextWidth('甲·乙', FONT)).toBe(mainland);

    // Fonts changed: what the canvas says now is what comes back
    const before = verticalTextWidth('abc', FONT);
    const measureText = SizedStubCtx.prototype.measureText;
    SizedStubCtx.prototype.measureText = function (s: string) {
      const m = measureText.call(this, s);
      return { ...m, width: m.width * 3 } as TextMetrics;
    };
    try {
      expect(verticalTextWidth('abc', FONT)).toBe(before);
      clearMeasurementCache();
      expect(verticalTextWidth('abc', FONT)).toBe(before * 3);
    } finally {
      SizedStubCtx.prototype.measureText = measureText;
      clearMeasurementCache();
    }
  });
});
