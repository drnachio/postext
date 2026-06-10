import { describe, expect, it } from 'vitest';
import { applySingleInkToSvg } from '../svg/singleInk';

const INK = '#295aa3';

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
    const hexes = [...out.matchAll(/"(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
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
