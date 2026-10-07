import { describe, it, expect, beforeAll } from 'vitest';
import { installStubMeasure } from './stubMeasure';
import { prepareText, readLetteringText } from '../text';
import { shapeText } from '../shape-text';
import { presetLetteringStyles } from '../presets';
import type { InlineSpan } from '../../../parse/types';
import type { LetteringStyle } from '../types';

beforeAll(() => installStubMeasure());

const EM = 12;
const styleFor = (locale: string, id = 'speech'): LetteringStyle => presetLetteringStyles({ fontSizePx: EM, locale, fontFamily: 'Test' })[id]!;

function shape(text: string | InlineSpan[], locale: string, vertical = false, style = styleFor(locale)) {
  const p = prepareText(readLetteringText(text, undefined), style, { locale, vertical });
  return { p, s: shapeText(p, style, { locale, vertical, dpi: 96 }) };
}

const LATIN: [string, string][] = [
  ['en', 'Did you hear that? Something is moving down in the cellar, and I do not like it one bit.'],
  ['es', '¿Has oído eso? Algo se mueve abajo, en el sótano, y no me gusta nada de nada.'],
  ['fr', 'Tu as entendu ça ? Quelque chose bouge en bas, dans la cave, et ça ne me plaît pas du tout.'],
];

describe('text shaping (SPEC D3.1)', () => {
  for (const [locale, text] of LATIN) {
    it(`sets ${locale} dialogue as a diamond of 2 to 5 lines`, () => {
      const { p, s } = shape(text, locale);
      const widths = s.lines.map((l) => l.width);
      expect(widths.length).toBeGreaterThanOrEqual(2);
      expect(widths.length).toBeLessThanOrEqual(5);
      const max = Math.max(...widths);
      // No parking space, and the longest line is not an end line.
      expect(widths[widths.length - 1]!).toBeGreaterThanOrEqual(0.4 * max);
      if (widths.length >= 3) expect(Math.max(...widths.slice(1, -1))).toBe(max);
      // The lines are the text, broken at spaces only (no hyphenation).
      expect(s.block.lines.map((l) => l.text).join(' ')).toBe(p.text);
      // A block about as wide as the target aspect asks.
      expect(s.aspect).toBeGreaterThan(1);
      expect(s.aspect).toBeLessThan(3.5);
      // Centred lines.
      const mids = s.block.lines.map((l) => l.xOffset + l.width / 2);
      for (const m of mids) expect(m).toBeCloseTo(s.block.bbox.width / 2, 0);
    });
  }

  it('keeps a short text on one line', () => {
    const { s } = shape('Huh?', 'en');
    expect(s.lines).toHaveLength(1);
  });

  it('sets the same size whatever the length (never shrinks to fit)', () => {
    const short = shape('Hi.', 'en').s;
    const long = shape(LATIN[0]![1], 'en').s;
    expect(short.block.fontString).toBe(long.block.fontString);
    expect(long.em).toBe(EM);
  });

  it('honours forced breaks', () => {
    const { s } = shape('First line\nsecond line', 'en');
    expect(s.block.lines.map((l) => l.text)).toEqual(['FIRST LINE', 'SECOND LINE']);
  });

  it('sets Japanese vertically, in columns of at most maxColumnChars, broken at phrases', () => {
    const style = styleFor('ja');
    const { p, s } = shape('いまの音、聞こえた？地下室で何かが動いているみたい。', 'ja', true, style);
    expect(s.vertical).toBe(true);
    expect(s.block.vertical).toBeDefined();
    expect(s.block.vertical!.region).toBe('japan');
    for (const l of s.lines) expect(l.width).toBeLessThanOrEqual(style.maxColumnChars! * EM + 0.01);
    expect(s.block.lines.map((l) => l.text).join('')).toBe(p.text);
    // No column opens with a closing mark or a small kana.
    for (const l of s.block.lines) expect('、。？）」ゃゅょっ').not.toContain(l.text[0]!);
    // A taller than wide block.
    expect(s.block.bbox.height).toBeGreaterThan(s.block.bbox.width);
  });

  it('sets tate-chu-yoko in one cell of a vertical balloon', () => {
    const { s } = shape([{ text: 'あと', bold: false, italic: false }, { text: '12', bold: false, italic: false, combineUpright: true }, { text: '分だ', bold: false, italic: false }], 'ja', true);
    const runs = s.block.lines.flatMap((l) => l.runs ?? []);
    expect(runs.some((r) => r.tcy && r.text === '12')).toBe(true);
  });

  it('sets Traditional Chinese vertically with Taiwan punctuation', () => {
    const { p, s } = shape('你聽到了嗎？地下室裡有東西在動，我一點也不喜歡。', 'zh-Hant', true);
    expect(s.block.vertical!.region).toBe('taiwan');
    expect(s.block.lines.map((l) => l.text).join('')).toBe(p.text);
    expect(s.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('sets Arabic right to left, untracked, never cutting a word', () => {
    const style = { ...styleFor('ar'), letterSpacing: 2 };
    const text = 'هل سمعت ذلك؟ شيء ما يتحرك في القبو، ولا يعجبني ذلك أبدا.';
    const { s } = shape(text, 'ar', false, style);
    expect(s.block.direction).toBe('rtl');
    expect(s.block.letterSpacingPx ?? 0).toBe(0);
    const words = new Set(text.split(' '));
    for (const l of s.block.lines) for (const w of l.text.split(' ')) expect(words.has(w)).toBe(true);
  });

  it('is deterministic', () => {
    const a = shape(LATIN[1]![1], 'es').s;
    const b = shape(LATIN[1]![1], 'es').s;
    expect(JSON.stringify(a.block)).toBe(JSON.stringify(b.block));
  });
});
