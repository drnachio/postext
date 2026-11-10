// The plain design over the showcase presets (#1458), every other one
// from the second: see corpus.test-helper.ts for what each export is held
// to.

import { describe, expect, it } from 'vitest';
import { presets, problemsOf } from './corpus.test-helper.js';

describe('plain design corpus, part 5', () => {
  it('every other showcase preset, from the second', async () => {
    const mine = presets().filter((_, i) => i % 2 === 1);
    const out: string[] = [];
    for (const { id, book } of mine) out.push(...(await problemsOf(id, book)));
    expect(mine.length).toBeGreaterThan(2);
    expect(out).toEqual([]);
  }, 300_000);
});
