import { describe, it, expect } from 'vitest';
import { alignToSource, type PaintedAtom } from './source.js';
import type { Atom } from './source.js';

const found = (source: string, kind: string): Atom[] => {
  const atoms: PaintedAtom[] = [{ at: 0, length: 1, kind }];
  const out: Atom[] = [];
  alignToSource('x', source, 0, atoms, out);
  return out;
};
const span = (source: string, kind: string): string | undefined => {
  const hit = found(source, kind)[0];
  return hit && source.slice(hit.start, hit.end);
};

describe('the construct behind a placeholder (#1419)', () => {
  it('reads a reference with its label and its target', () => {
    expect(span('see :ref[Fig]{a} on', 'ref')).toBe(':ref[Fig]{a}');
    expect(span(':ref{a}', 'ref')).toBe(':ref{a}');
    expect(span(':ref[Fig] on', 'ref')).toBeUndefined();
    expect(span(':ref{a', 'ref')).toBeUndefined();
  });

  it('reads a note marker, which holds no space', () => {
    expect(span('a[^n1] b', 'footnote')).toBe('[^n1]');
    expect(span('[^] [^a b]', 'footnote')).toBeUndefined();
  });

  it('reads any other directive with what it has', () => {
    expect(span(':swatch-a[b]{c} d', 'swatch')).toBe(':swatch-a[b]{c}');
    expect(span(':swatch[b d', 'swatch')).toBe(':swatch');
    expect(span(': 1 :1', 'swatch')).toBeUndefined();
  });

  it('takes hostile input in linear time', () => {
    for (const [text, kind] of [[':ref['.repeat(50_000), 'ref'], [':ref{'.repeat(50_000), 'ref'], ['[^'.repeat(100_000), 'footnote'], [':A['.repeat(70_000), 'other'], [':A{'.repeat(70_000), 'other']] as const) {
      const start = performance.now();
      found(text, kind);
      expect(performance.now() - start, kind).toBeLessThan(500);
    }
  });
});
