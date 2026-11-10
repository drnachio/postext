import { describe, expect, it } from 'vitest';
import { screenSvgColors } from '../../svg/singleInk.js';

describe('screenSvgColors', () => {
  it('leaves each paint as the colour before its ICC colour', () => {
    expect(screenSvgColors('<rect fill="#e4002b icc-named-color(PANTONE, &quot;PANTONE 185 C&quot;)"/>')).toBe('<rect fill="#e4002b"/>');
    expect(screenSvgColors(`<rect style="fill:#e4002b icc-named-color(P, 'PANTONE 185 C');stroke:red icc-color(fogra, 0, 1, 1, 0)"/>`))
      .toBe('<rect style="fill:#e4002b;stroke:red"/>');
    expect(screenSvgColors('<rect fill="rgb(1, 2, 3) icc-color(p, 0.1, 0.2, 0.3, 0)"/>')).toBe('<rect fill="rgb(1, 2, 3)"/>');
  });

  it('returns markup without ICC colours as it is', () => {
    const svg = '<svg><rect fill="#123456" data-spot="PANTONE 299 C"/></svg>';
    expect(screenSvgColors(svg)).toBe(svg);
  });
});
