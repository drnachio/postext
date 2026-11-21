// #1660: the pages before an edit stand when only the places of their
// notes (whose text is at the end of the chapter) move; a checkpoint
// carried from the build before is where a later edit starts.

import { describe, expect, it } from 'vitest';
import { buildDocument, createLayoutTapes } from '../../index.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { PostextConfig } from '../../types.js';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = { width: pt(360), height: pt(480), margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } };
const para = (n: number) => `Paragraph ${n} with enough words in it to run over several lines of a narrow column, and then a few more to be sure of it. `.repeat(3).trim();

/** Build `blocks` with the tapes and without: the two documents as text. */
function both(blocks: string[], config: PostextConfig, tapes: ReturnType<typeof createLayoutTapes>) {
  const markdown = blocks.join('\n\n');
  const plain = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache()));
  const taped = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache(), { tapes }));
  return { plain, taped, stats: tapes.stats };
}

describe('the pages before an edit (#1660)', () => {
  it('stand when their notes, whose text is at the end of the chapter, only move', () => {
    const config = { page } as PostextConfig;
    const notes = Array.from({ length: 30 }, (_, i) => `[^n${i}]: The note of paragraph ${i * 4}, set at the foot of its page.`);
    const blocks = ['# A chapter', ...Array.from({ length: 120 }, (_, i) => (i % 4 === 0 ? `${para(i)} A note.[^n${i / 4}]` : para(i))), ...notes];
    const tapes = createLayoutTapes();
    expect(both(blocks, config, tapes).taped).toBeDefined();
    for (let turn = 1; turn <= 3; turn++) {
      blocks[90] = `${blocks[90]}${'x'.repeat(turn)}`;
      const edited = both(blocks, config, tapes);
      expect(edited.taped, `letter ${turn}`).toBe(edited.plain);
      expect(edited.stats.startedAt.some((b) => b > 0)).toBe(true);
      // Every page before the checkpoint names the places of notes after
      // the edit: they stand all the same.
      expect(Math.min(...edited.stats.pagesKept)).toBeGreaterThan(0);
      expect(edited.stats.builtAgain).toBe(false);
    }
  });

  it('starts a later edit from a checkpoint carried from the build before', () => {
    const config = { page } as PostextConfig;
    const blocks = ['# A chapter', ...Array.from({ length: 150 }, (_, i) => para(i))];
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    // A letter near the start: its passes rejoin the build before and
    // carry its later checkpoints.
    blocks[10] = `${blocks[10]}x`;
    const near = both(blocks, config, tapes);
    expect(near.taped).toBe(near.plain);
    expect(near.stats.rejoinedAt.some((b) => b !== undefined)).toBe(true);
    // Then one far on: it starts from one of those, not from where the
    // build before started placing.
    blocks[130] = `${blocks[130]}y`;
    const far = both(blocks, config, tapes);
    expect(far.taped).toBe(far.plain);
    expect(Math.min(...far.stats.startedAt)).toBeGreaterThan(Math.max(...Array.from(near.stats.rejoinedAt, (b) => b ?? 0)));
    expect(far.stats.builtAgain).toBe(false);
  });
});
