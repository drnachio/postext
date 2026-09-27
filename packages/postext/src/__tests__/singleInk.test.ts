import { describe, expect, it } from 'vitest';
import { applySingleInkToSvg, isSingleInkSvg, isSingleInkSvgUrl, SINGLE_INK_MARK } from '../svg/singleInk';

const INK = '#295aa3';

// The mapping is not idempotent — a second pass lightens every colour — so
// the recoloured markup is marked and never recoloured again, whichever of
// the host and the backends gets to it first.
describe('applySingleInkToSvg marks what it recolours', () => {
  const svg = '<?xml version="1.0"?>\n<!-- <svg> in a comment --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect fill="#000" stroke="rgb(128, 128, 128)"/><svg x="1"><rect fill="black"/></svg></svg>';

  it('writes the mark, naming the ink, on the root element only', () => {
    const once = applySingleInkToSvg(svg, INK);
    expect(SINGLE_INK_MARK).toBe('data-postext-single-ink');
    expect(once).toContain(`<svg ${SINGLE_INK_MARK}="${INK}" xmlns=`);
    expect(once.split(SINGLE_INK_MARK)).toHaveLength(2);
    expect(once).toContain('<!-- <svg> in a comment -->');
    expect(isSingleInkSvg(once)).toBe(true);
    expect(isSingleInkSvg(svg)).toBe(false);
  });

  it('returns marked markup as it is: tinting twice would lighten every colour', () => {
    const once = applySingleInkToSvg(svg, INK);
    expect(applySingleInkToSvg(once, INK)).toBe(once);
    // Whatever ink the second call names.
    expect(applySingleInkToSvg(once, '#aa0000')).toBe(once);
    // Black stays the full ink.
    expect(applySingleInkToSvg(applySingleInkToSvg('<svg><rect fill="#000000"/></svg>', INK), INK)).toContain(`fill="${INK}"`);
  });

  it('leaves markup with no <svg> root unmarked', () => {
    expect(applySingleInkToSvg('<rect fill="#000000"/>', INK)).toBe(`<rect fill="${INK}"/>`);
  });

  it('reads the mark through an SVG data URI, URL-encoded or base64', () => {
    const once = applySingleInkToSvg(svg, INK);
    expect(isSingleInkSvgUrl(`data:image/svg+xml,${encodeURIComponent(once)}`)).toBe(true);
    expect(isSingleInkSvgUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(once)}`)).toBe(true);
    expect(isSingleInkSvgUrl(`data:image/svg+xml;base64,${btoa(once)}`)).toBe(true);
    expect(isSingleInkSvgUrl(`data:image/svg+xml,${encodeURIComponent(svg)}`)).toBe(false);
    expect(isSingleInkSvgUrl(`data:image/svg+xml;base64,${btoa(svg)}`)).toBe(false);
    // A long picture: only the head is read, where the root tag is.
    const long = applySingleInkToSvg(`<svg>${'<rect fill="#123456"/>'.repeat(5000)}</svg>`, INK);
    expect(isSingleInkSvgUrl(`data:image/svg+xml,${encodeURIComponent(long)}`)).toBe(true);
    expect(isSingleInkSvgUrl('blob:https://example.org/1')).toBe(false);
    expect(isSingleInkSvgUrl('/figure.svg')).toBe(false);
    expect(isSingleInkSvgUrl('data:image/svg+xml;base64,%%%')).toBe(false);
  });
});

describe('applySingleInkToSvg', () => {
  it('maps black to the full ink and white to white', () => {
    const svg = '<svg><rect fill="#000000" /><rect fill="#ffffff" /></svg>';
    const out = applySingleInkToSvg(svg, INK);
    expect(out).toContain(`fill="${INK}"`);
    expect(out).toContain('fill="#ffffff"');
  });

  it('maps light colours to light tints and dark colours to dark tints', () => {
    const svg = '<svg><rect fill="#e7eef7" /><rect stroke="#1c3f73" /></svg>';
    const out = applySingleInkToSvg(svg, INK);
    const hexes = [...out.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
    expect(hexes).toHaveLength(2);
    const lum = (h: string) =>
      0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16);
    expect(lum(hexes[0]!)).toBeGreaterThan(220 * 0.9); // near-white tint stays light
    // A dark source maps to a heavy tint: well below the light tint, and no
    // lighter than ~50% coverage. (It cannot go darker than the ink itself.)
    expect(lum(hexes[1]!)).toBeLessThan(lum(hexes[0]!) - 80);
    expect(lum(hexes[1]!)).toBeLessThan(170);
  });

  it('handles short hex, rgb()/rgba(), and keyword paints; preserves alpha', () => {
    const svg = '<svg><rect fill="#abc" /><rect fill="rgba(160, 160, 160, 0.5)" style="stroke:black;" /></svg>';
    const out = applySingleInkToSvg(svg, INK);
    expect(out).not.toContain('#abc');
    expect(out).toMatch(/rgba\(\d+, \d+, \d+, 0\.5\)/);
    expect(out).toContain(`stroke:${INK}`);
  });

  it('reads rgb() with percentages, decimals or the space syntax, and hsl(), as the same colour in hex', () => {
    // Cairo writes `rgb(11.37%, 20%, 50.59%)`; CSS Color 4 allows `rgb(r g b / a)`.
    const tintOf = (paint: string) => {
      const out = applySingleInkToSvg(`<rect fill="${paint}"/>`, INK);
      return /fill="([^"]+)"/.exec(out)![1]!;
    };
    const hex = tintOf('#336699');
    const rgbOf = (h: string) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
    expect(tintOf('rgb(20%, 40%, 60%)')).toBe(rgbOf(hex));
    expect(tintOf('rgb(51.0, 102.0, 153.0)')).toBe(rgbOf(hex));
    expect(tintOf('rgb(51 102 153)')).toBe(rgbOf(hex));
    expect(tintOf('RGB(51,102,153)')).toBe(rgbOf(hex));
    expect(tintOf('hsl(210, 50%, 40%)')).toBe(rgbOf(hex));
    expect(tintOf('hsl(210deg 50% 40%)')).toBe(rgbOf(hex));
    expect(tintOf('rgb(0%, 0%, 0%)')).toBe(rgbOf(INK));
    // Alpha is kept, as a number.
    expect(tintOf('rgb(51 102 153 / 50%)')).toBe(rgbOf(hex).replace('rgb(', 'rgba(').replace(')', ', 0.5)'));
    expect(tintOf('hsla(210, 50%, 40%, 0.25)')).toBe(rgbOf(hex).replace('rgb(', 'rgba(').replace(')', ', 0.25)'));
    // Out-of-range values are left alone.
    expect(tintOf('rgb(300, 0, 0)')).toBe('rgb(300, 0, 0)');
    expect(tintOf('rgb(120%, 0%, 0%)')).toBe('rgb(120%, 0%, 0%)');
  });

  it('does not touch url(#id) references, text content, or currentColor', () => {
    const svg = '<svg><path marker-end="url(#arrow)" fill="currentColor" /><text>black ink</text></svg>';
    const out = applySingleInkToSvg(svg, INK);
    expect(out).toContain('url(#arrow)');
    expect(out).toContain('fill="currentColor"');
    expect(out).toContain('>black ink<');
  });

  it('returns the input unchanged for an unparseable ink', () => {
    const svg = '<svg><rect fill="#123456" /></svg>';
    expect(applySingleInkToSvg(svg, 'not-a-colour')).toBe(svg);
  });
});
