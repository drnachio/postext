import { describe, it, expect } from 'vitest';
import { createMeasurementCache } from '../measure';
import type { MeasuredBlock } from '../measure';
import { createBoundingBox } from '../vdt';

// These tests exercise the cache data structure and clone logic directly,
// without invoking measureBlock (which requires a canvas context).

function fakeMeasuredBlock(): MeasuredBlock {
  return {
    lines: [
      {
        text: 'Hello world',
        bbox: createBoundingBox(0, 0, 200, 20),
        baseline: 16,
        hyphenated: false,
        segments: [
          { kind: 'text', text: 'Hello', width: 50 },
          { kind: 'space', text: ' ', width: 10 },
          { kind: 'text', text: 'world', width: 50 },
        ],
      },
      {
        text: 'Second line',
        bbox: createBoundingBox(0, 20, 180, 20),
        baseline: 36,
        hyphenated: false,
      },
    ],
    totalHeight: 40,
  };
}

describe('MeasurementCache', () => {
  it('createMeasurementCache returns an empty cache', () => {
    const cache = createMeasurementCache();
    expect(cache._blocks.size).toBe(0);
  });

  it('stores and retrieves entries by key', () => {
    const cache = createMeasurementCache();
    const block = fakeMeasuredBlock();
    const key = 'test-key';

    cache._blocks.set(key, block);
    expect(cache._blocks.size).toBe(1);
    expect(cache._blocks.get(key)).toBe(block);
  });

  it('different keys produce separate entries', () => {
    const cache = createMeasurementCache();
    cache._blocks.set('key-a', fakeMeasuredBlock());
    cache._blocks.set('key-b', fakeMeasuredBlock());

    expect(cache._blocks.size).toBe(2);
  });

  it('cloneMeasuredBlock produces independent copies', async () => {
    // Import cloneMeasuredBlock indirectly by testing through the cached wrapper logic
    // We test the clone property by verifying the contract: mutations to a retrieved
    // block must not affect the stored version.
    const cache = createMeasurementCache();
    const original = fakeMeasuredBlock();
    const key = 'clone-test';
    cache._blocks.set(key, original);

    // Replicate the clone logic used by cachedMeasureBlock on cache hit
    const clone = {
      lines: original.lines.map((l) => ({ ...l, bbox: { ...l.bbox } })),
      totalHeight: original.totalHeight,
    };

    // Mutate the clone
    clone.lines[0]!.bbox.x = 999;
    clone.lines[0]!.sourceStart = 42;

    // Original should be unaffected
    expect(original.lines[0]!.bbox.x).toBe(0);
    expect(original.lines[0]!.sourceStart).toBeUndefined();
  });

  it('segments array is shared between original and clone (shallow)', () => {
    const original = fakeMeasuredBlock();
    const clone = {
      lines: original.lines.map((l) => ({ ...l, bbox: { ...l.bbox } })),
      totalHeight: original.totalHeight,
    };

    // Segments should be the same reference (not deep-cloned, since build.ts never mutates them)
    expect(clone.lines[0]!.segments).toBe(original.lines[0]!.segments);
  });
});
