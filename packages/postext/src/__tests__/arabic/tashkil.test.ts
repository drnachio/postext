import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { collectConfigWarnings } from '../../configWarnings';
import { stripConfigDefaults } from '../../defaults';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import { parseMarkdown } from '../../parse';
import { stripBlockTashkil, stripTashkil, tashkilFor } from '../../pipeline/tashkil';
import type { PostextConfig } from '../../types';

// Issue #376: `bodyText.tashkil` takes the Arabic vowel marks out of the text
// the layout sets, the source map kept right.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

// بِسْمِ اللَّهِ / هٰذا (dagger alef) / مُحَمَّدٌ (shadda + tanwīn) / أُمّ, إِلى,
// آمَنَ with the hamza and madda letters; ۚ a Qurʾānic pause mark.
const VOCALISED = 'بِسْمِ اللَّهِ هٰذا مُحَمَّدٌ أُمّ إِلى آمَنَ ۚ';

describe('stripTashkil', () => {
  it("takes every vowel and Qurʾānic mark out under 'strip'", () => {
    expect(stripTashkil(VOCALISED, 'strip')).toBe('بسم الله هذا محمد أم إلى آمن ');
  });

  it("keeps the shadda under 'strip-vowels'", () => {
    expect(stripTashkil(VOCALISED, 'strip-vowels')).toBe('بسم اللّه هذا محمّد أمّ إلى آمن ');
  });

  it('leaves one space where a lone mark stood between two words', () => {
    expect(stripTashkil('آمَنَ ۚ قال', 'strip')).toBe('آمن قال');
    expect(stripTashkil('ۚ قال', 'strip')).toBe('قال');
  });

  it('keeps hamza and madda written as combining marks, and Latin text', () => {
    // ا + U+0654 hamza above, ا + U+0655 hamza below, ا + U+0653 madda.
    expect(stripTashkil('أَ إِ آ Café', 'strip')).toBe('أ إ آ Café');
  });
});

describe('stripBlockTashkil', () => {
  const md = '# ALPHA بِسْمِ\n\nBETA *اللَّهِ* [مُحَمَّدٌ](https://x.test) GAMMA';
  const blocks = parseMarkdown(md);

  it('keeps text, spans and source map in step', () => {
    for (const block of blocks) {
      const out = stripBlockTashkil(block, 'strip');
      expect(out.spans.map((s) => s.text).join('')).toBe(out.text);
      expect(out.sourceMap.length).toBe(out.text.length);
      // Each character left maps to the same character of the source.
      for (let i = 0; i < out.text.length; i++) expect(md[out.sourceMap[i]!]).toBe(out.text[i]);
    }
  });

  it('moves link ranges with their text', () => {
    const para = stripBlockTashkil(blocks[1]!, 'strip');
    const link = para.spans.find((s) => s.links)!;
    const l = link.links![0]!;
    expect(link.text.slice(l.start, l.end)).toBe('محمد');
  });

  it('returns the same blocks when nothing changes', () => {
    expect(tashkilFor(blocks, 'keep')).toBe(blocks);
    expect(tashkilFor(blocks, undefined)).toBe(blocks);
    const bare = parseMarkdown("Alpha بسم");
    expect(tashkilFor(bare, 'strip')).toBe(bare);
    // Memoised: the outline and the layout get the same array.
    expect(tashkilFor(blocks, 'strip')).toBe(tashkilFor(blocks, 'strip'));
  });
});

describe('bodyText.tashkil — config and layout', () => {
  const config = (tashkil?: 'keep' | 'strip' | 'strip-vowels'): PostextConfig => ({
    locale: 'ar',
    page: { width: pt(300), height: pt(400), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
    layout: { layoutType: 'single' },
    bodyText: { fontFamily: 'Amiri', ...(tashkil ? { tashkil } : {}) },
  });

  it('resolves, keeping the default absent, and warns about an unknown value', () => {
    expect('tashkil' in resolveBodyTextConfig(undefined, 'ar')).toBe(false);
    expect('tashkil' in resolveBodyTextConfig({ tashkil: 'keep' }, 'ar')).toBe(false);
    expect(resolveBodyTextConfig({ tashkil: 'strip-vowels' }, 'ar').tashkil).toBe('strip-vowels');
    expect(stripConfigDefaults({ bodyText: { tashkil: 'keep' } }).bodyText).toBeUndefined();
    expect(stripConfigDefaults({ bodyText: { tashkil: 'strip' } }).bodyText).toEqual({ tashkil: 'strip' });
    const bad = { bodyText: { tashkil: 'none' } } as unknown as PostextConfig;
    expect(collectConfigWarnings(bad)).toContainEqual({ kind: 'unknownConfigValue', path: 'bodyText.tashkil', value: 'none', used: 'keep' });
  });

  it('sets the text, the headings and the contents without the marks', () => {
    const md = `:::toc\n:::\n\n# ALPHA بِسْمِ\n\nBETA ${VOCALISED} GAMMA`;
    const kept = buildDocument({ markdown: md }, config());
    const stripped = buildDocument({ markdown: md }, config('strip'));
    const text = (doc: typeof kept) => doc.blocks.flatMap((b) => b.lines.map((l) => l.text)).join('\n');
    expect(text(kept)).toContain('بِسْمِ');
    expect(text(stripped)).not.toMatch(/[ً-ْٰ]/);
    expect(text(stripped)).toContain('ALPHA بسم');
    expect(text(stripped)).toContain('هذا محمد');
    // No marks left, so nothing for the leading check either.
    expect(stripped.blocks.some((b) => b.lines.some((l) => l.markInk))).toBe(false);
  });

  it('maps every line back to its source range', () => {
    const md = `BETA ${VOCALISED} GAMMA`;
    const doc = buildDocument({ markdown: md }, config('strip'));
    const lines = doc.blocks.flatMap((b) => b.lines);
    expect(lines[0]!.sourceStart).toBe(0);
    const last = lines[lines.length - 1]!;
    expect(md.slice(0, last.sourceEnd)).toMatch(/GAMMA$/);
  });
});
