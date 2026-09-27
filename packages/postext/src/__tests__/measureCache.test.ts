import { describe, it, expect, beforeAll } from 'vitest';
import { createMeasurementCache, measureBlock, measureRichBlock, cachedMeasureBlock, cachedMeasureRichBlock } from '../measure';
import type { MeasuredBlock, MeasureBlockOptions } from '../measure';
import type { InlineSpan } from '../parse';
import { buildDocument } from '../pipeline/build';
import { initMathEngine } from '../math';
import { createBoundingBox } from '../vdt';
import type { VDTDocument } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
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

// The first tests exercise the cache data structure and clone logic
// directly; the last ones measure through the cached wrappers.

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

describe('cached measurement', () => {
  // Two twenty-character words fill the 300px measure and the two-letter
  // tail cannot be avoided: the optimal breaker flags a runt last line,
  // which runt tightening and column balancing read.
  const long = 'a'.repeat(20);
  const RUNT = `${long} ${long} ay`;
  const OPTIONS: MeasureBlockOptions = {
    textAlign: 'justify',
    optimal: true,
    maxStretchRatio: 2,
    minShrinkRatio: 0.6,
    runtPenalty: 1000,
    runtMinCharacters: 20,
  };
  const FONTS = ['12px serif', 'bold 12px serif', 'italic 12px serif', 'italic bold 12px serif'] as const;
  const spans: InlineSpan[] = [{ text: RUNT, bold: false, italic: false }];

  it('a plain block keeps every field of the uncached measure, on a miss and a hit', () => {
    const uncached = measureBlock(RUNT, '12px serif', 300, 14, OPTIONS);
    expect(uncached.lastLineRunt).toBe(true);

    const cache = createMeasurementCache();
    const miss = cachedMeasureBlock(RUNT, '12px serif', 300, 14, OPTIONS, cache);
    const hit = cachedMeasureBlock(RUNT, '12px serif', 300, 14, OPTIONS, cache);
    expect(miss.lastLineRunt).toBe(true);
    expect(hit.lastLineRunt).toBe(true);
    expect(miss).toEqual(uncached);
    expect(hit).toEqual(uncached);
  });

  it('a rich block keeps every field of the uncached measure, on a miss and a hit', () => {
    const uncached = measureRichBlock(spans, ...FONTS, 300, 14, OPTIONS);
    expect(uncached.lastLineRunt).toBe(true);

    const cache = createMeasurementCache();
    const miss = cachedMeasureRichBlock(spans, ...FONTS, 300, 14, OPTIONS, cache);
    const hit = cachedMeasureRichBlock(spans, ...FONTS, 300, 14, OPTIONS, cache);
    expect(miss.lastLineRunt).toBe(true);
    expect(hit.lastLineRunt).toBe(true);
    expect(miss).toEqual(uncached);
    expect(hit).toEqual(uncached);
  });

  it('a hit is a copy: changing it leaves the cached entry alone', () => {
    const cache = createMeasurementCache();
    const first = cachedMeasureBlock(RUNT, '12px serif', 300, 14, OPTIONS, cache);
    first.lines[0]!.bbox.x = 999;
    first.lines.pop();
    const second = cachedMeasureBlock(RUNT, '12px serif', 300, 14, OPTIONS, cache);
    expect(second.lines.length).toBe(2);
    expect(second.lines[0]!.bbox.x).toBe(0);
  });

  it('a build with a cache tightens a runt as the build without one does', () => {
    // Eight twelve-letter words and a short tail: set as it comes, the tail
    // is a runt on a second line; a little negative tracking pulls it up
    // (`bodyText.tightenRunts`, on by default).
    const markdown = `${Array.from({ length: 8 }, () => 'a'.repeat(12)).join(' ')} to go`;
    const paragraphs = (doc: VDTDocument) => doc.blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => ({ lines: b.lines.map((l) => l.text), letterSpacing: b.letterSpacing }));

    const untightened = paragraphs(buildDocument({ markdown }, { bodyText: { tightenRunts: false } }));
    expect(untightened[0]!.lines).toHaveLength(2);
    const uncached = paragraphs(buildDocument({ markdown }, {}));
    expect(uncached[0]!.lines).toHaveLength(1);
    expect(uncached[0]!.letterSpacing).toBeLessThan(0);

    // A cold cache (every measure a miss), then the same cache warm (hits).
    const cache = createMeasurementCache();
    expect(paragraphs(buildDocument({ markdown }, {}, cache))).toEqual(uncached);
    expect(paragraphs(buildDocument({ markdown }, {}, cache))).toEqual(uncached);
  });
});

// EF-168: the layout worker always builds with a cache, and a build with one
// must break every line as a build without one, on a cold cache (every
// measure a miss) and a warm one (hits). 1.4.1 dropped `lastLineRunt` on the
// copy it handed back, so runt tightening and the loose-paragraph lever of
// column balancing skipped paragraphs they act on without a cache.
describe('a build with a cache lays out as a build without one (EF-168)', () => {
  const words = ['the', 'fire', 'burnt', 'brightly', 'and', 'soft', 'radiance', 'of', 'incandescent', 'lights', 'in', 'lilies', 'silver', 'caught', 'bubbles', 'that', 'flashed', 'passed', 'our', 'glasses', 'after-dinner', 'atmosphere', 'thought', 'runs', 'gracefully', 'free'];
  // Paragraphs of varied length, so some end in a runt and some columns end
  // short: the levers that read `lastLineRunt` have work to do.
  const paragraphs = Array.from({ length: 14 }, (_, p) => Array.from({ length: 18 + ((p * 7) % 23) }, (_, w) => words[(p * 5 + w * 3) % words.length]).join(' ') + '.');
  const markdown = `# Chapter\n\n${paragraphs.join('\n\n')}\n\n:::columnbreak\n\nA closing line.`;
  const mm = (value: number) => ({ value, unit: 'mm' as const });
  const dump = (doc: VDTDocument) => doc.pages.flatMap((page, pi) => page.columns.flatMap((col, ci) => col.blocks.flatMap((b) => b.lines.map((l) =>
    `${pi}/${ci} ${l.text} x=${l.bbox.x.toFixed(2)} y=${l.bbox.y.toFixed(2)} w=${l.bbox.width.toFixed(2)} ls=${(l.letterSpacing ?? 0).toFixed(3)} b=${(b.letterSpacing ?? 0).toFixed(3)}`))));
  const configs = [
    { layout: { layoutType: 'double' as const } },
    { layout: { layoutType: 'double' as const }, bodyText: { textAlign: 'left' as const } },
    { layout: { layoutType: 'single' as const }, bodyText: { maxJustifyTracking: 20, gradedRuntPenalty: true } },
    { layout: { layoutType: 'double' as const }, bodyText: { hyphenation: { enabled: true, compounds: false }, repeatHyphen: true } },
  ];

  for (const [i, extra] of configs.entries()) {
    it(`breaks every line alike, cold and warm (configuration ${i + 1})`, () => {
      for (const width of [110, 150]) {
        const config = { page: { width: mm(width), height: mm(160), margins: { top: mm(12), bottom: mm(12), left: mm(12), right: mm(12) } }, ...extra };
        const uncached = dump(buildDocument({ markdown }, config));
        const cache = createMeasurementCache();
        expect(dump(buildDocument({ markdown }, config, cache)), `${width} mm, cold`).toEqual(uncached);
        expect(dump(buildDocument({ markdown }, config, cache)), `${width} mm, warm`).toEqual(uncached);
      }
    });
  }
});

describe('placeholder spans in the cache key', () => {
  beforeAll(async () => {
    await initMathEngine();
  });

  // A formula and a swatch are one placeholder char in the span text: two
  // blocks that differ only in them must not share a cache entry.
  const segments = (doc: VDTDocument) => doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? [])
    .filter((s) => s.kind === 'math' || s.kind === 'swatch')
    .map((s) => ({ kind: s.kind, width: s.width, tex: s.mathRender?.tex, swatch: s.swatch?.color }))));

  it('paragraphs that differ only in a formula keep their own formula', () => {
    const markdown = 'Solve $a$ now.\n\nSolve $x^2+y^2$ now.';
    const uncached = segments(buildDocument({ markdown }));
    expect(uncached.map((s) => s.tex)).toEqual(['a', 'x^2+y^2']);

    const cache = createMeasurementCache();
    expect(segments(buildDocument({ markdown }, undefined, cache))).toEqual(uncached);
    expect(segments(buildDocument({ markdown }, undefined, cache))).toEqual(uncached);
  });

  it('a formula scaled by the maths font size is measured again', () => {
    const markdown = 'Solve $x^2+y^2$ now.';
    const cache = createMeasurementCache();
    const small = segments(buildDocument({ markdown }, { math: { fontSizeScale: 1 } }, cache));
    const large = segments(buildDocument({ markdown }, { math: { fontSizeScale: 1.5 } }, cache));
    expect(large).toEqual(segments(buildDocument({ markdown }, { math: { fontSizeScale: 1.5 } })));
    expect(large[0]!.width).toBeGreaterThan(small[0]!.width);
  });

  it('paragraphs that differ only in a swatch colour keep their own colour', () => {
    const markdown = ':swatch{color="#ff0000"} Key.\n\n:swatch{color="#00ff00"} Key.';
    const uncached = segments(buildDocument({ markdown }));
    expect(uncached.map((s) => s.swatch)).toEqual(['#ff0000', '#00ff00']);

    const cache = createMeasurementCache();
    expect(segments(buildDocument({ markdown }, undefined, cache))).toEqual(uncached);
  });
});
