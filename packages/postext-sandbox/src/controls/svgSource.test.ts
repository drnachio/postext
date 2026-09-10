import { describe, expect, it } from 'vitest';
import {
  decodeXmlText,
  escapeXmlText,
  hitSvgTextIndex,
  scanSvgTextNodeRanges,
  svgSourceOffsetToCaret,
  svgSourceRangeToBoxes,
  svgTextRangeAt,
  type SvgTextIndex,
} from './svgSource';

const slices = (src: string) => scanSvgTextNodeRanges(src).map((r) => src.slice(r.start, r.end));

describe('scanSvgTextNodeRanges', () => {
  it('finds text nodes inside <text> and <tspan>, not elsewhere', () => {
    const src = '<svg><title>Not text</title><text x="1">Hello <tspan>world</tspan>!</text><desc>no</desc></svg>';
    expect(slices(src)).toEqual(['Hello ', 'world', '!']);
  });

  it('ignores comments, CDATA, processing instructions and doctypes', () => {
    const src = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE svg [ <!ENTITY x "<text>"> ]>',
      '<!-- <text>commented</text> -->',
      '<svg><style><![CDATA[ text { fill: red } ]]></style>',
      '<text><![CDATA[raw]]>plain</text></svg>',
    ].join('');
    expect(slices(src)).toEqual(['plain']);
  });

  it('is not fooled by a `>` or `<text` inside an attribute value', () => {
    const src = '<svg><rect data-x="a > b" title=\'<text>\'/><text>ok</text></svg>';
    expect(slices(src)).toEqual(['ok']);
  });

  it('handles self-closing and nested elements, and unbalanced markup', () => {
    const src = '<svg><text>a<tspan/>b<g><tspan>c</tspan></g></text><text>d</svg>';
    expect(slices(src)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports whitespace-only text nodes so DOM pairing stays aligned', () => {
    const src = '<svg><text>\n  <tspan>x</tspan>\n</text></svg>';
    expect(slices(src)).toEqual(['\n  ', 'x', '\n']);
  });

  it('returns nothing without <text>', () => {
    expect(scanSvgTextNodeRanges('<svg><rect/></svg>')).toEqual([]);
  });
});

describe('decodeXmlText / escapeXmlText', () => {
  it('decodes named, decimal and hex entities with source spans', () => {
    const d = decodeXmlText('a&amp;b&#65;&#x42;');
    expect(d.text).toBe('a&bAB');
    expect(d.charStart).toEqual([0, 1, 6, 7, 12]);
    expect(d.charEnd).toEqual([1, 6, 7, 12, 18]);
  });

  it('keeps unknown entities and bare ampersands verbatim', () => {
    const d = decodeXmlText('x&foo;y & z');
    expect(d.text).toBe('x&foo;y & z');
    expect(d.charStart).toEqual(Array.from({ length: d.text.length }, (_, i) => i));
  });

  it('gives both units of an astral pair one source span', () => {
    const d = decodeXmlText('a😀b&#x1F600;');
    expect(d.text).toBe('a😀b😀');
    expect(d.charStart).toEqual([0, 1, 1, 3, 4, 4]);
    expect(d.charEnd).toEqual([1, 3, 3, 4, 13, 13]);
  });

  it('escapes markup characters', () => {
    expect(escapeXmlText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });
});

// A hand-built index: one run "ab" at source 10..12, glyph boxes side by side.
const index: SvgTextIndex = {
  runs: [{
    start: 10, end: 12, text: 'ab',
    charStart: [10, 11], charEnd: [11, 12],
    boxes: [{ x0: 0.1, y0: 0.4, x1: 0.2, y1: 0.5 }, { x0: 0.2, y0: 0.4, x1: 0.3, y1: 0.5 }],
  }],
};

describe('hitSvgTextIndex', () => {
  it('lands the caret before or after the glyph by half', () => {
    expect(hitSvgTextIndex(index, 0.12, 0.45)).toBe(10);
    expect(hitSvgTextIndex(index, 0.18, 0.45)).toBe(11);
    expect(hitSvgTextIndex(index, 0.28, 0.45)).toBe(12);
  });

  it('snaps within the padded box and misses far away', () => {
    expect(hitSvgTextIndex(index, 0.15, 0.51)).toBe(10); // 1% below, pad is 2%
    expect(hitSvgTextIndex(index, 0.15, 0.8)).toBeNull();
    expect(hitSvgTextIndex(index, 0.9, 0.45)).toBeNull();
  });
});

describe('svgSourceRangeToBoxes / svgSourceOffsetToCaret', () => {
  it('merges the selected glyphs of a run into one box', () => {
    expect(svgSourceRangeToBoxes(index, 10, 12)).toEqual([{ x0: 0.1, y0: 0.4, x1: 0.3, y1: 0.5 }]);
    expect(svgSourceRangeToBoxes(index, 11, 12)).toEqual([{ x0: 0.2, y0: 0.4, x1: 0.3, y1: 0.5 }]);
    expect(svgSourceRangeToBoxes(index, 0, 5)).toEqual([]);
    expect(svgSourceRangeToBoxes(index, 11, 11)).toEqual([]);
  });

  it('places the caret at glyph edges, including the end of the run', () => {
    expect(svgSourceOffsetToCaret(index, 10)).toEqual({ x0: 0.1, y0: 0.4, x1: 0.1, y1: 0.5 });
    expect(svgSourceOffsetToCaret(index, 11)).toEqual({ x0: 0.2, y0: 0.4, x1: 0.2, y1: 0.5 });
    expect(svgSourceOffsetToCaret(index, 12)).toEqual({ x0: 0.3, y0: 0.4, x1: 0.3, y1: 0.5 });
    expect(svgSourceOffsetToCaret(index, 3)).toBeNull();
  });

  it('svgTextRangeAt is inclusive of both ends', () => {
    const ranges = [{ start: 10, end: 12 }];
    expect(svgTextRangeAt(ranges, 10)).toEqual(ranges[0]);
    expect(svgTextRangeAt(ranges, 12)).toEqual(ranges[0]);
    expect(svgTextRangeAt(ranges, 13)).toBeNull();
  });
});
