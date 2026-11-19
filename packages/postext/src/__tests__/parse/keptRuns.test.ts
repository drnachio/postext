// #1647: a paragraph read before comes back moved in the source, a copy
// of its own, with the issues it reported.

import { beforeEach, describe, expect, it } from 'vitest';
import { forgetKeptRuns, keptInlineRun } from '../../parse/blockParser/keptRuns.js';
import { parseMarkdown } from '../../parse/index.js';
import type { ParseIssue } from '../../parse/types.js';

describe('keptInlineRun', () => {
  beforeEach(() => forgetKeptRuns());

  it('moves the places in the source of a kept reading, and not the offsets inside a chip', () => {
    let reads = 0;
    const read = (at: number) => () => {
      reads++;
      const sourceMap = [at, at + 1, at + 2];
      return {
        result: { text: 'abc', sourceMap, spans: [{ text: 'abc', chip: { sourceOffsets: [0, 3] }, sourceStart: at, sourceEnd: at + 3 }] },
        issues: [{ message: 'm', sourceStart: at, sourceEnd: at + 1 } as unknown as ParseIssue],
      };
    };
    const issues: ParseIssue[] = [];
    const first = keptInlineRun('k', 10, issues, read(10));
    const again = keptInlineRun('k', 25, issues, read(25));
    expect(reads === 1 || (globalThis as { __postextKeptRunsCheck?: unknown }).__postextKeptRunsCheck !== undefined).toBe(true);
    expect(again).toEqual({ text: 'abc', sourceMap: [25, 26, 27], spans: [{ text: 'abc', chip: { sourceOffsets: [0, 3] }, sourceStart: 25, sourceEnd: 28 }] });
    expect(issues.map((i) => (i as unknown as { sourceStart: number }).sourceStart)).toEqual([10, 25]);
    // Each caller owns what it gets.
    again.sourceMap[0] = -1;
    expect(keptInlineRun('k', 10, [], read(10))).toEqual(first);
  });

  it('parses a document edited before a paragraph as it parses it from nothing', () => {
    const tail = 'A paragraph with $x^2$ maths, a [^n] note, `code` and *emphasis*.\n\n[^n]: The note.';
    const before = parseMarkdown(`# Title\n\nFirst.\n\n${tail}`);
    void before;
    const edited = `# Title\n\nFirst, longer now.\n\n${tail}`;
    const kept = parseMarkdown(edited);
    forgetKeptRuns();
    expect(kept).toEqual(parseMarkdown(edited));
  });
});
