import { describe, expect, it } from 'vitest';
import { cssWeightOrder, cssWeightOrderOf, fontFallbacks, type FontFaceLike } from '../../index.js';

// #757: one rule for the weight that answers one a family has no cut for,
// where the command line took the nearest (the 400 for a 550 of a family
// with a 400 and a 700) and a browser, the Sandbox and the PDF writer the
// one CSS font matching settles on (the 700).

describe('cssWeightOrder (CSS Fonts 4, §5.2)', () => {
  it('tries the weight asked first', () => {
    expect(cssWeightOrder(600, [400, 600, 700])[0]).toBe(600);
    expect(cssWeightOrder(400, [300, 400, 500])[0]).toBe(400);
  });

  it('tries the heavier weights first above 500, then the lighter ones', () => {
    expect(cssWeightOrder(550, [400, 700])).toEqual([700, 400]);
    expect(cssWeightOrder(600, [300, 400, 500, 800, 900])).toEqual([800, 900, 500, 400, 300]);
    expect(cssWeightOrder(950, [400, 700])).toEqual([700, 400]);
  });

  it('tries the lighter weights first below 400, then the heavier ones', () => {
    expect(cssWeightOrder(300, [400, 700])).toEqual([400, 700]);
    expect(cssWeightOrder(350, [100, 300, 400, 700])).toEqual([300, 100, 400, 700]);
  });

  it('tries the weights up to 500 first from 400 to 500, then the lighter, then the heavier', () => {
    expect(cssWeightOrder(400, [300, 500, 700])).toEqual([500, 300, 700]);
    expect(cssWeightOrder(450, [300, 400, 500, 600])).toEqual([500, 400, 300, 600]);
    expect(cssWeightOrder(500, [300, 400, 600])).toEqual([400, 300, 600]);
  });

  it('is not the nearest weight', () => {
    const nearest = (desired: number, weights: number[]) => weights.reduce((best, w) => (Math.abs(w - desired) < Math.abs(best - desired) ? w : best));
    for (const [desired, weights, matched] of [[550, [400, 700], 700], [600, [500, 800], 800], [400, [300, 500], 500], [500, [300, 600], 300]] as const) {
      expect(cssWeightOrder(desired, [...weights])[0]).toBe(matched);
      expect(nearest(desired, [...weights])).not.toBe(matched);
    }
  });

  it('takes each weight once, in whatever order they come, and answers nothing for none', () => {
    expect(cssWeightOrder(600, [700, 400, 700, 400])).toEqual([700, 400]);
    expect(cssWeightOrder(600, [])).toEqual([]);
  });
});

describe('cssWeightOrderOf', () => {
  const face = (lo: number, hi = lo) => ({ span: [lo, hi] as const });
  const spans = (desired: number, faces: { span: readonly [number, number] }[]) => cssWeightOrderOf(desired, faces, (f) => f.span).map((f) => f.span.join('–'));

  it('puts a variable face that holds the weight before any other', () => {
    expect(spans(450, [face(400), face(500), face(200, 900)])).toEqual(['200–900', '500–500', '400–400']);
  });

  it('orders ranges by the end nearest to the weight', () => {
    expect(spans(600, [face(100, 300), face(350, 500), face(700, 900)])).toEqual(['700–900', '350–500', '100–300']);
    expect(spans(450, [face(100, 300), face(480, 490), face(600, 900)])).toEqual(['480–490', '100–300', '600–900']);
  });

  it('is the rule the fallback report reads a font set by', () => {
    const loaded = (weight: string): FontFaceLike => ({ family: 'Amiri', weight, style: 'normal', status: 'loaded' });
    // A 550 of a family with a 400 and a 700 is drawn from the 700: a neighbour, reported as such.
    expect(fontFallbacks([{ family: 'Amiri', weight: 550, style: 'normal' }], [loaded('400'), loaded('700')], { measureWidth: null }))
      .toEqual([{ family: 'Amiri', weight: 550, style: 'normal', reason: 'synthesized' }]);
  });
});
