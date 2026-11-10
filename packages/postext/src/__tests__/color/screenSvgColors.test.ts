import { describe, expect, it } from 'vitest';
import { screenSvgColors, splitIccPaint, svgSpotInks } from '../../svg/spotPaints.js';

describe('screenSvgColors', () => {
  it('leaves each paint as the colour before its ICC colour', () => {
    expect(screenSvgColors('<rect fill="#e4002b icc-named-color(PANTONE, &quot;PANTONE 185 C&quot;)"/>')).toBe('<rect fill="#e4002b"/>');
    expect(screenSvgColors(`<rect style="fill:#e4002b icc-named-color(P, 'PANTONE 185 C');stroke:red icc-color(fogra, 0, 1, 1, 0)"/>`))
      .toBe('<rect style="fill:#e4002b;stroke:red"/>');
    expect(screenSvgColors('<rect fill="rgb(1, 2, 3) icc-color(p, 0.1, 0.2, 0.3, 0)"/>')).toBe('<rect fill="rgb(1, 2, 3)"/>');
  });

  it('rewrites the declarations of a style sheet, and nothing else in it', () => {
    const svg = '<svg><style>.a { fill: #e4002b icc-named-color(P, "PANTONE 185 C"); } .b::after { content: "red icc-color(p, 1)" }</style><rect class="a"/></svg>';
    expect(screenSvgColors(svg)).toBe('<svg><style>.a { fill: #e4002b; } .b::after { content: "red icc-color(p, 1)" }</style><rect class="a"/></svg>');
  });

  it('leaves text, comments and other attributes alone', () => {
    const svg = '<svg><!-- fill="#fff icc-color(p, 0)" --><text x="1" fill="#000">red icc-color(p, 0, 1, 1, 0)</text><desc data-note="blue icc-color(p, 1)">fill: #fff icc-color(p, 0)</desc></svg>';
    expect(screenSvgColors(svg)).toBe(svg);
  });

  it('returns markup without ICC colours as it is', () => {
    const svg = '<svg><rect fill="#123456" data-spot="PANTONE 299 C"/></svg>';
    expect(screenSvgColors(svg)).toBe(svg);
  });
});

describe('splitIccPaint', () => {
  it('reads the colour, the ink and its tint', () => {
    expect(splitIccPaint('#e4002b icc-named-color(PANTONE, "PANTONE 185 C")')).toEqual({ base: '#e4002b', ink: { name: 'PANTONE 185 C' } });
    expect(splitIccPaint("#e4002b  ICC-NAMED-COLOR( PANTONE , 'PANTONE 185 C', 40% )")).toEqual({ base: '#e4002b', ink: { name: 'PANTONE 185 C', tint: 40 } });
    expect(splitIccPaint('#e4002b icc-named-color(PANTONE, Reflex Blue, 0.5)')).toEqual({ base: '#e4002b', ink: { name: 'Reflex Blue', tint: 50 } });
    expect(splitIccPaint('red icc-color(p, 0, 1, 1, 0)')).toEqual({ base: 'red' });
    expect(splitIccPaint('#e4002b')).toBeUndefined();
    expect(splitIccPaint('icc-color(p, 0)')).toBeUndefined();
  });

  it('runs in linear time on hostile input', () => {
    const spaces = ' '.repeat(200_000);
    const t0 = performance.now();
    expect(splitIccPaint(`#fff${spaces}x)`)).toBeUndefined();
    expect(splitIccPaint(`#fff${spaces}icc-named-color(${spaces}`)).toBeUndefined();
    expect(screenSvgColors(`<rect fill="#fff${spaces}icc-color(${'a'.repeat(100_000)}"/>`)).toContain('<rect');
    expect(svgSpotInks(`<rect ${'a '.repeat(100_000)} data-spot="X"/>`)).toEqual([{ name: 'X' }]);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('svgSpotInks', () => {
  it('lists the inks an SVG names, once each', () => {
    const svg = '<svg><rect fill="#e4002b icc-named-color(PANTONE, &quot;PANTONE 185 C&quot;)"/>'
      + '<g data-spot="PANTONE 299 C" data-spot-tint="60"><rect fill="#00a3e0"/></g>'
      + '<style>.x { stroke: #000 icc-named-color(P, "Varnish") }</style>'
      + '<rect style="fill:#e4002b icc-named-color(P, \'PANTONE 185 C\')"/>'
      + '<text>#fff icc-named-color(P, "Not an ink")</text></svg>';
    expect(svgSpotInks(svg)).toEqual([{ name: 'PANTONE 185 C' }, { name: 'PANTONE 299 C', tint: 60 }, { name: 'Varnish' }]);
  });

  it('finds none in markup that names none', () => {
    expect(svgSpotInks('<svg><rect fill="#e4002b"/></svg>')).toEqual([]);
  });
});
