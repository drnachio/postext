// The plain design over the Cookbook recipes the site ships (#1458), part
// 2 of 3: see corpus.test-helper.ts for what each export is held to.

import { describe, expect, it } from 'vitest';
import { recipeProblems } from './corpus.test-helper.js';

describe('plain design corpus, part 2', () => {
  it('every third Cookbook recipe, from the second', async () => {
    const { count, problems } = await recipeProblems(1, 3);
    expect(count).toBeGreaterThan(40);
    expect(problems).toEqual([]);
  }, 300_000);
});
