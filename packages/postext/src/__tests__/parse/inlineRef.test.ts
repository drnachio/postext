import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { REF_PLACEHOLDER } from '../../parse/inlineFormatting';
import type { InlineSpan } from '../../parse';

/** Collect all spans across all parsed blocks. */
const allSpans = (md: string): InlineSpan[] =>
  parseMarkdown(md).flatMap((b) => b.spans);

const refSpans = (spans: InlineSpan[]): InlineSpan[] => spans.filter((s) => s.ref);

/** Total number of REF_PLACEHOLDER code points across every span's text. */
const placeholderCount = (spans: InlineSpan[]): number =>
  spans.reduce(
    (sum, s) => sum + [...s.text].filter((ch) => ch === REF_PLACEHOLDER).length,
    0,
  );

describe('inline :ref directive', () => {
  it('parses a default :ref{id="x"}', () => {
    const spans = allSpans('See :ref{id="fig-1"} for details.\n');
    const refs = refSpans(spans);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.ref).toEqual({ resourceId: 'fig-1' });
    expect(refs[0]!.ref!.style).toBeUndefined();
  });

  it('parses style="number"', () => {
    const spans = allSpans('See :ref{id="x" style="number"}.\n');
    const refs = refSpans(spans);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.ref).toEqual({ resourceId: 'x', style: 'number' });
  });

  it('parses style="full"', () => {
    const spans = allSpans('See :ref{id="x" style="full"}.\n');
    expect(refSpans(spans)[0]!.ref).toEqual({ resourceId: 'x', style: 'full' });
  });

  it('parses style="default"', () => {
    const spans = allSpans('See :ref{id="x" style="default"}.\n');
    expect(refSpans(spans)[0]!.ref).toEqual({ resourceId: 'x', style: 'default' });
  });

  it('parses text="..." override', () => {
    const spans = allSpans('See :ref{id="x" text="the chart"}.\n');
    expect(refSpans(spans)[0]!.ref).toEqual({ resourceId: 'x', text: 'the chart' });
  });

  it('parses combined style and text attributes', () => {
    const spans = allSpans('See :ref{id="x" style="full" text="Custom"}.\n');
    expect(refSpans(spans)[0]!.ref).toEqual({
      resourceId: 'x',
      style: 'full',
      text: 'Custom',
    });
  });

  it('represents each ref as a single-placeholder span', () => {
    const spans = allSpans('See :ref{id="x"}.\n');
    const ref = refSpans(spans)[0]!;
    expect(ref.text).toBe(REF_PLACEHOLDER);
    expect([...ref.text]).toHaveLength(1);
  });

  describe('placeholder char count matches ref span count', () => {
    const cases: string[] = [
      'one :ref{id="a"} ref\n',
      ':ref{id="a"} and :ref{id="b"} and :ref{id="c"}\n',
      'mixed **bold :ref{id="a"}** and _italic :ref{id="b"}_\n',
      'math $x^2$ then :ref{id="a"} then $y$ then :ref{id="b"}\n',
      'no refs here at all\n',
    ];

    for (const md of cases) {
      it(JSON.stringify(md), () => {
        const spans = allSpans(md);
        expect(placeholderCount(spans)).toBe(refSpans(spans).length);
      });
    }
  });

  it('keeps refs distinct from surrounding bold/italic spans', () => {
    const spans = allSpans('**before :ref{id="a"} after**\n');
    const refs = refSpans(spans);
    expect(refs).toHaveLength(1);
    // ref span inherits ambient bold
    expect(refs[0]!.bold).toBe(true);
    // surrounding text remains as its own bold spans
    expect(spans.some((s) => !s.ref && s.bold && s.text.includes('before'))).toBe(true);
  });

  it('does not confuse refs with inline math placeholders', () => {
    const spans = allSpans('$a$ :ref{id="x"} $b$\n');
    const refs = refSpans(spans);
    expect(refs).toHaveLength(1);
    const mathSpans = spans.filter((s) => s.math);
    expect(mathSpans).toHaveLength(2);
    // each math span and each ref span is exactly one code point wide
    expect(placeholderCount(spans)).toBe(1);
  });
});
