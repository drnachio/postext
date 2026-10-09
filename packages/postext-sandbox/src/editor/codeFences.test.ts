import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { inFencedCode } from './codeFences';

describe('code fences in the editor (#624)', () => {
  it('reads a fence and its lines as one region', () => {
    const doc = Text.of(['Text with $x$.', '```js', 'const a = $b$; :chip[x]', '```', 'After :tab here.', '~~~', 'open to the end']);
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => inFencedCode(doc, n))).toEqual([false, true, true, true, false, true, true]);
  });
});
