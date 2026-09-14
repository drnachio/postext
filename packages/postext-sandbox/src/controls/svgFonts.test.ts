import { describe, expect, it } from 'vitest';
import { fontFaceCss, injectSvgStyle, inlineSvgFontsWith, svgFontFamilies } from './svgFonts';

describe('svgFontFamilies', () => {
  it('collects families from attributes and style declarations, quotes stripped, deduplicated', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Roboto Condensed, sans-serif">a</text>
      <text style="font-family:'DIN Pro';font-size:4">b</text>
      <text font-family='"Roboto Condensed"'>c</text>
    </svg>`;
    expect(svgFontFamilies(svg)).toEqual(['Roboto Condensed', 'sans-serif', 'DIN Pro']);
  });
});

describe('inlineSvgFontsWith', () => {
  it('injects one @font-face per held variant right after the root tag and leaves unknown families alone', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text font-family="Roboto Condensed, Nope">a</text></svg>';
    const out = await inlineSvgFontsWith(svg, async (family) =>
      family === 'Roboto Condensed'
        ? [{ weight: 400, style: 'normal', format: 'ttf', base64: 'AAAA' }, { weight: 700, style: 'italic', format: 'otf', base64: 'BBBB' }]
        : null,
    );
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><style type="text/css"><![CDATA[@font-face{')).toBe(true);
    expect(out).toContain('font-family:"Roboto Condensed";font-weight:400;font-style:normal;src:url(data:font/ttf;base64,AAAA) format("truetype")');
    expect(out).toContain('font-weight:700;font-style:italic;src:url(data:font/otf;base64,BBBB) format("opentype")');
    expect(out).not.toContain('Nope";');
    expect(out.endsWith('<text font-family="Roboto Condensed, Nope">a</text></svg>')).toBe(true);
  });

  it('returns the markup untouched when nothing is held or nothing is named', async () => {
    const plain = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    expect(await inlineSvgFontsWith(plain, async () => null)).toBe(plain);
    const named = '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="X">a</text></svg>';
    expect(await inlineSvgFontsWith(named, async () => null)).toBe(named);
    expect(injectSvgStyle('<svg/>', fontFaceCss('X', []))).toBe('<svg/>');
  });
});
