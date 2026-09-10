import { describe, it, expect } from 'vitest';
import { mapInlineSnippet, parseInlineSnippetSpans } from '../../parse/inlineSnippet';
import { REF_PLACEHOLDER } from '../../parse/inlineFormatting';

/** Every plain char must map back to the same char in the snippet (or, for a
 *  ref placeholder, to the leading `:` of its `:ref{…}`). */
function assertRoundTrip(content: string): void {
  const { text, sourceMap } = mapInlineSnippet(content);
  expect(sourceMap).toHaveLength(text.length);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const src = sourceMap[i]!;
    if (ch === REF_PLACEHOLDER) {
      expect(content.slice(src, src + 5)).toBe(':ref{');
    } else {
      expect(content[src]).toBe(ch);
    }
  }
}

describe('mapInlineSnippet', () => {
  it('skips bold / italic / code markers', () => {
    const content = 'A **bold** and *italic* and `code` run';
    const { text, sourceMap } = mapInlineSnippet(content);
    expect(text).toBe('A bold and italic and code run');
    expect(sourceMap[text.indexOf('bold')]).toBe(content.indexOf('bold'));
    expect(sourceMap[text.indexOf('italic')]).toBe(content.indexOf('italic'));
    expect(sourceMap[text.indexOf('code')]).toBe(content.indexOf('code'));
    expect(sourceMap[text.indexOf('run')]).toBe(content.indexOf('run'));
    assertRoundTrip(content);
  });

  it('turns a :ref{…} into a single placeholder char mapped to its `:`', () => {
    const ref = ':ref{id="tabla-1-1" case="lower"}';
    const content = `See ${ref} for details`;
    const { spans, text, sourceMap } = mapInlineSnippet(content);
    expect(text).toBe(`See ${REF_PLACEHOLDER} for details`);
    expect(sourceMap[4]).toBe(4);
    expect(sourceMap[text.indexOf('for')]).toBe(content.indexOf('for'));
    expect(spans.find((s) => s.ref)?.ref?.resourceId).toBe('tabla-1-1');
    assertRoundTrip(content);
  });

  it('keeps `\\n\\n` one-to-one (no whitespace normalisation)', () => {
    const content = 'first\n\nsecond';
    const { text, sourceMap } = mapInlineSnippet(content);
    expect(text).toBe(content);
    expect(sourceMap).toEqual(Array.from({ length: content.length }, (_, i) => i));
  });

  it('keeps leading and trailing spaces', () => {
    const content = '  padded  ';
    const { text, sourceMap } = mapInlineSnippet(content);
    expect(text).toBe(content);
    expect(sourceMap).toEqual(Array.from({ length: content.length }, (_, i) => i));
  });

  it('exposes the same spans the measurer uses', () => {
    const content = '**x** :ref{id="r"}';
    expect(mapInlineSnippet(content).spans).toEqual(parseInlineSnippetSpans(content));
  });

  it('maps an empty snippet to nothing', () => {
    expect(mapInlineSnippet('')).toEqual({ spans: [], text: '', sourceMap: [] });
  });
});
