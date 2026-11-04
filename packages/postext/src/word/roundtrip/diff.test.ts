import { describe, expect, it } from 'vitest';
import { applyHunks, diffText, mapThrough } from './diff.js';
import { markupDeletable, stripFlag, widenOverDelimiters, escapeTyped } from './markup.js';
import { mathUnchanged, normalizeTex } from './math.js';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('diffText', () => {
  it('finds minimal hunks', () => {
    expect(diffText('abc', 'abc')).toEqual([]);
    expect(diffText('abc', 'abxc')).toEqual([{ a0: 2, a1: 2, b0: 2, b1: 3 }]);
    expect(diffText('abc', 'ac')).toEqual([{ a0: 1, a1: 2, b0: 1, b1: 1 }]);
    expect(diffText('', 'x')).toEqual([{ a0: 0, a1: 0, b0: 0, b1: 1 }]);
  });

  it('rebuilds the new text from random edits, large ones included', () => {
    const r = rng(7);
    const alphabet = 'abcde \n';
    for (let n = 0; n < 200; n++) {
      const len = n < 190 ? Math.floor(r() * 60) : 20_000;
      let a = '';
      for (let i = 0; i < len; i++) a += alphabet[Math.floor(r() * alphabet.length)];
      let b = a;
      const edits = n < 190 ? Math.floor(r() * 6) : 3000;
      for (let k = 0; k < edits; k++) {
        const at = Math.floor(r() * (b.length + 1));
        const del = Math.floor(r() * 3);
        b = b.slice(0, at) + (r() < 0.5 ? alphabet[Math.floor(r() * alphabet.length)] : '') + b.slice(at + del);
      }
      const hunks = diffText(a, b);
      expect(applyHunks(a, b, hunks)).toBe(b);
      for (let k = 1; k < hunks.length; k++) expect(hunks[k]!.a0).toBeGreaterThan(hunks[k - 1]!.a1 - (hunks[k - 1]!.a0 === hunks[k - 1]!.a1 ? 0 : 1));
    }
  });

  it('maps positions through the hunks', () => {
    const hunks = diffText('hello world', 'hello brave world');
    expect(mapThrough(hunks, 0)).toBe(0);
    expect(mapThrough(hunks, 11)).toBe(17);
  });
});

describe('markup helpers', () => {
  it('lets paired delimiters go with the deleted text, not index marks', () => {
    expect(markupDeletable(['**', '**'])).toBe(true);
    expect(markupDeletable(['](https://x)'])).toBe(false);
    expect(markupDeletable(['[', '](https://x)'])).toBe(true);
    expect(markupDeletable(['**'])).toBe(false);
    expect(markupDeletable([']{key="t"}'])).toBe(false);
    expect(markupDeletable(['\n  '])).toBe(true);
  });

  it('widens over delimiters wrapping a deleted span', () => {
    const s = 'a **bold** b';
    expect(widenOverDelimiters(s, 4, 8)).toEqual([2, 10]);
    expect(widenOverDelimiters('[x](u) y', 1, 2)).toEqual([0, 6]);
  });

  it('strips italic, bold or both from a run of asterisks', () => {
    expect(stripFlag('*x*', 1, 2, 'i')).toEqual([0, 3]);
    expect(stripFlag('**x**', 2, 3, 'i')).toBeUndefined();
    expect(stripFlag('**x**', 2, 3, 'b')).toEqual([0, 5]);
    expect(stripFlag('***x***', 3, 4, 'i')).toEqual([2, 5]);
    expect(stripFlag(':smallcaps[x]', 11, 12, 'c')).toEqual([0, 13]);
  });

  it('escapes typed markup characters', () => {
    expect(escapeTyped('2*3 a_b $5 @key x@y')).toBe('2\\*3 a\\_b \\$5 \\@key x@y');
  });
});

describe('equations read back', () => {
  it('normalises TeX spellings', () => {
    expect(normalizeTex('x^{2} + \\left( a \\right)')).toBe(normalizeTex('x^2+(a)'));
    expect(normalizeTex('\\alpha x')).toBe('\\alpha x');
    expect(mathUnchanged('$x^2$', 'x^{2}')).toBe(true);
    expect(mathUnchanged('$x^2$', 'x^{3}')).toBe(false);
  });
});
