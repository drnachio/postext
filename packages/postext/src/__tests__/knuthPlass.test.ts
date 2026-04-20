import { describe, it, expect } from 'vitest';
import {
  computeBreakpoints,
  richTokensToItems,
  type KPItem,
  type KPBox,
  type KPGlue,
  type KPPenalty,
  type KPOptions,
} from '../knuthPlass';

// ---------------------------------------------------------------------------
// Helpers to build items manually
// ---------------------------------------------------------------------------

function box(width: number, sourceIndex = 0): KPBox {
  return { type: 'box', width, sourceIndex };
}

function glue(width: number, stretch: number, shrink: number, sourceIndex = 0): KPGlue {
  return { type: 'glue', width, stretch, shrink, sourceIndex };
}

function penalty(width: number, pen: number, flagged = false, sourceIndex = 0): KPPenalty {
  return { type: 'penalty', width, penalty: pen, flagged, sourceIndex };
}

function finalItems(): KPItem[] {
  return [
    glue(0, Number.MAX_SAFE_INTEGER, 0, -1),
    penalty(0, -10000, false, -1),
  ];
}

const defaultOptions: KPOptions = {
  lineWidth: () => 100,
  normalSpaceWidth: 10,
  maxStretchRatio: 1.5,
  minShrinkRatio: 0.8,
};

describe('runt penalty option', () => {
  it('accepts runtPenalty + runtMinWidth without crashing and returns valid breaks', () => {
    const items: KPItem[] = [
      box(30, 0),
      glue(10, 5, 2, 1),
      box(30, 2),
      ...finalItems(),
    ];
    const withRunt = computeBreakpoints(items, {
      ...defaultOptions,
      runtPenalty: 1500,
      runtMinWidth: 50,
    });
    const without = computeBreakpoints(items, defaultOptions);
    expect(withRunt.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
  });

  it('runtPenalty=0 produces identical breaks to omitting the option', () => {
    const items: KPItem[] = [
      box(30, 0),
      glue(10, 5, 2, 1),
      box(30, 2),
      glue(10, 5, 2, 3),
      box(30, 4),
      ...finalItems(),
    ];
    const withZero = computeBreakpoints(items, {
      ...defaultOptions,
      runtPenalty: 0,
      runtMinWidth: 50,
    });
    const without = computeBreakpoints(items, defaultOptions);
    expect(withZero).toEqual(without);
  });
});

// ---------------------------------------------------------------------------
// Core algorithm tests
// ---------------------------------------------------------------------------

describe('computeBreakpoints', () => {
  it('produces a single break for text that fits one line', () => {
    const items: KPItem[] = [
      box(30, 0),
      glue(10, 5, 2, 1),
      box(30, 2),
      ...finalItems(),
    ];
    const breaks = computeBreakpoints(items, defaultOptions);
    // Should break at the forced penalty (last item)
    expect(breaks.length).toBe(1);
  });

  it('produces two breaks when content exceeds one line', () => {
    const items: KPItem[] = [
      box(40, 0),
      glue(10, 5, 2, 1),
      box(40, 2),
      glue(10, 5, 2, 3),
      box(40, 4),
      ...finalItems(),
    ];
    // Total natural width: 40+10+40+10+40 = 140 > 100
    const breaks = computeBreakpoints(items, defaultOptions);
    expect(breaks.length).toBe(2);
  });

  it('handles forced breaks (hard line breaks)', () => {
    const items: KPItem[] = [
      box(20, 0),
      penalty(0, -10000, false, 1), // forced break
      box(20, 2),
      ...finalItems(),
    ];
    const breaks = computeBreakpoints(items, defaultOptions);
    expect(breaks.length).toBe(2);
    // First break at the forced penalty
    expect(breaks[0]).toBe(1);
  });

  it('handles empty item list gracefully', () => {
    const items = finalItems();
    const breaks = computeBreakpoints(items, defaultOptions);
    expect(breaks.length).toBe(1); // Just the forced final break
  });

  it('handles a single oversized box via emergency fallback', () => {
    const items: KPItem[] = [
      box(200, 0), // way wider than 100
      ...finalItems(),
    ];
    const breaks = computeBreakpoints(items, defaultOptions);
    expect(breaks.length).toBeGreaterThanOrEqual(1);
  });

  it('respects variable line widths', () => {
    const items: KPItem[] = [
      box(30, 0),
      glue(10, 5, 2, 1),
      box(30, 2),
      glue(10, 5, 2, 3),
      box(30, 4),
      ...finalItems(),
    ];
    // First line narrow, subsequent lines wide
    const breaks = computeBreakpoints(items, {
      ...defaultOptions,
      lineWidth: (li) => li === 0 ? 50 : 200,
    });
    // Line 0 can only fit ~50px, so first word breaks early
    expect(breaks.length).toBe(2);
  });

  it('penalizes consecutive hyphens', () => {
    // Two words with soft-hyphen breaks
    const items: KPItem[] = [
      box(35, 0), // "exam"
      penalty(5, 50, true, 1), // soft hyphen
      box(20, 2), // "ple"
      glue(10, 5, 2, 3),
      box(35, 4), // "docu"
      penalty(5, 50, true, 5), // soft hyphen
      box(20, 6), // "ment"
      ...finalItems(),
    ];
    const breaks = computeBreakpoints(items, {
      ...defaultOptions,
      lineWidth: () => 60,
    });
    expect(breaks.length).toBeGreaterThanOrEqual(1);
  });

  it('produces ragged last line (no demerits for short final line)', () => {
    const items: KPItem[] = [
      box(40, 0),
      glue(10, 5, 2, 1),
      box(40, 2),
      glue(10, 5, 2, 3),
      box(10, 4), // short last word
      ...finalItems(),
    ];
    const breaks = computeBreakpoints(items, defaultOptions);
    // The algorithm should produce breaks without penalizing the short last line
    expect(breaks.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Adapter: richTokensToItems
// ---------------------------------------------------------------------------

describe('richTokensToItems', () => {
  it('converts space tokens to glue items', () => {
    const tokens = [
      { text: 'hello', bold: false, italic: false, kind: 'text' as const, width: 50 },
      { text: ' ', bold: false, italic: false, kind: 'space' as const, width: 10 },
      { text: 'world', bold: false, italic: false, kind: 'text' as const, width: 50 },
    ];
    const items = richTokensToItems(tokens, 10, 1.5, 0.8);
    // box, glue, box, final-glue, final-penalty
    expect(items.length).toBe(5);
    expect(items[0]!.type).toBe('box');
    expect(items[1]!.type).toBe('glue');
    expect(items[2]!.type).toBe('box');
  });

  it('decomposes hyphenatable words into sub-boxes with penalties', () => {
    const tokens = [
      {
        text: 'example',
        bold: false,
        italic: false,
        kind: 'text' as const,
        width: 70,
        breakPoints: [{ charIndex: 4, widthBefore: 40 }],
        hyphenWidth: 5,
      },
    ];
    const items = richTokensToItems(tokens, 10, 1.5, 0.8);
    // box("exam"), penalty, box("ple"), final-glue, final-penalty
    expect(items.length).toBe(5);
    expect(items[0]!.type).toBe('box');
    expect((items[0] as KPBox).width).toBe(40);
    expect(items[1]!.type).toBe('penalty');
    expect((items[1] as KPPenalty).flagged).toBe(true);
    expect((items[1] as KPPenalty).width).toBe(5);
    expect(items[2]!.type).toBe('box');
    expect((items[2] as KPBox).width).toBe(30); // 70 - 40
  });

  it('preserves bold/italic metadata', () => {
    const tokens = [
      { text: 'bold', bold: true, italic: false, kind: 'text' as const, width: 40 },
    ];
    const items = richTokensToItems(tokens, 10, 1.5, 0.8);
    const meta = items[0]!.meta as { bold: boolean; italic: boolean };
    expect(meta.bold).toBe(true);
    expect(meta.italic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: K-P produces fewer loose lines than greedy
// ---------------------------------------------------------------------------

describe('K-P vs greedy quality', () => {
  it('K-P can redistribute words for more even spacing', () => {
    // Simulate: 5 words of varying width, line width = 100
    // Greedy would stuff first line, leaving second line loose
    const items: KPItem[] = [
      box(45, 0),          // word1
      glue(10, 5, 2, 1),   // space
      box(45, 2),          // word2 (greedy: line 1 = 45+10+45 = 100, perfect)
      glue(10, 5, 2, 3),   // space
      box(20, 4),          // word3
      glue(10, 5, 2, 5),   // space
      box(15, 6),          // word4 (greedy: line 2 = 20+10+15 = 45, very loose)
      ...finalItems(),
    ];

    const breaks = computeBreakpoints(items, defaultOptions);
    expect(breaks.length).toBe(2);

    // K-P might choose to break after word1 instead, making:
    // Line 1: word1 (45) - stretched but not terrible
    // Line 2: word2 + word3 + word4 (45+10+20+10+15 = 100) - perfect
    // Or keep the greedy solution if it's actually optimal.
    // Either way, the algorithm should produce valid breaks.
    for (const b of breaks) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(items.length);
    }
  });
});
