// The page drawing of the Design panel knows vertical and right-bound books
// (#197): vertical lines filled from the right, columns as tiers, and the
// folios of a right-bound spread read 3 | 2.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LayoutConfig, PageConfig } from 'postext';
import { resolveLayoutConfig, resolvePageConfig } from 'postext';
import { PagePreview } from './PagePreview';

const PAGE: PageConfig = {
  sizePreset: 'custom',
  width: { value: 140, unit: 'mm' },
  height: { value: 200, unit: 'mm' },
  margins: {
    top: { value: 20, unit: 'mm' },
    bottom: { value: 20, unit: 'mm' },
    left: { value: 20, unit: 'mm' },
    right: { value: 15, unit: 'mm' },
    mirror: true,
  },
};

function draw(page: PageConfig, layout: LayoutConfig, folios = true): string {
  const l = resolveLayoutConfig(layout);
  const p = resolvePageConfig(page, 'zh-Hant', l.writingMode);
  return renderToString(h(PagePreview, { page: p, layout: l, lineHeightPt: 16, inkHex: '#222222', height: 132, folios }));
}

const folios = (svg: string) => [...svg.matchAll(/<text[^>]*>(\d)<\/text>/g)].map((m) => m[1]);
const numbers = (tag: string, attr: string) => [...tag.matchAll(new RegExp(`${attr}="([\\d.]+)"`, 'g'))].map((m) => Number(m[1]));

describe('PagePreview', () => {
  it('draws a right-bound vertical spread: 3 | 2, lines down the page, two tiers', () => {
    const svg = draw(PAGE, { writingMode: 'vertical-rl', layoutType: 'double' });
    expect(folios(svg)).toEqual(['3', '2']);
    // One vertical line pattern per page, started at its type area's right edge.
    const patterns = [...svg.matchAll(/<pattern [^>]*>/g)].map((m) => m[0]);
    expect(patterns).toHaveLength(2);
    for (const p of patterns) expect(p).toMatch(/patternTransform="translate\(/);
    // Two tiers per page: the same x and width, stacked (different y).
    const tiers = [...svg.matchAll(/<rect [^>]*fill="url\(#[^"]+\)"[^>]*>/g)].map((m) => m[0]);
    expect(tiers).toHaveLength(4);
    const [a, b] = tiers;
    expect(numbers(a!, 'x')).toEqual(numbers(b!, 'x'));
    expect(numbers(a!, 'width')).toEqual(numbers(b!, 'width'));
    expect(numbers(a!, 'y')[0]).toBeLessThan(numbers(b!, 'y')[0]!);
    expect(svg).toMatchSnapshot();
  });

  it('numbers a left-bound spread 2 | 3 and keeps horizontal lines', () => {
    const svg = draw({ ...PAGE, binding: 'left' }, { layoutType: 'double' });
    expect(folios(svg)).toEqual(['2', '3']);
    const tiers = [...svg.matchAll(/<rect [^>]*fill="url\(#[^"]+\)"[^>]*>/g)].map((m) => m[0]);
    // Columns side by side: the same y, different x.
    expect(numbers(tiers[0]!, 'y')).toEqual(numbers(tiers[1]!, 'y'));
    expect(numbers(tiers[0]!, 'x')[0]).toBeLessThan(numbers(tiers[1]!, 'x')[0]!);
  });

  it('leaves folios out of a thumbnail and of a single page', () => {
    expect(folios(draw(PAGE, { writingMode: 'vertical-rl' }, false))).toEqual([]);
    expect(folios(draw({ ...PAGE, margins: { ...PAGE.margins, mirror: false } }, {}))).toEqual([]);
  });
});
