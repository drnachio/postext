// #1639: a document built with tapes after an edit is the document built
// without them, and its passes start from the page before the edit.

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
const chapter = (paragraphs: number) => ['# A chapter', ...Array.from({ length: paragraphs }, (_, i) => para(i))];

/** Build `blocks` with the tapes and without: the two documents as text. */
function both(blocks: string[], config: PostextConfig, tapes: ReturnType<typeof createLayoutTapes>) {
  const markdown = blocks.join('\n\n');
  const plain = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache()));
  const taped = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache(), { tapes }));
  return { plain, taped, stats: tapes.stats };
}

describe('a build with tapes after an edit', () => {
  it('gives the pages a build without them gives, starting each pass before the edit', () => {
    const config = { page } as PostextConfig;
    const blocks = chapter(60);
    const tapes = createLayoutTapes();
    const first = both(blocks, config, tapes);
    expect(first.taped).toBe(first.plain);
    expect(first.stats.startedAt.every((b) => b === 0)).toBe(true);

    // A letter typed in a paragraph near the end, then more of them.
    for (let turn = 1; turn <= 3; turn++) {
      blocks[50] = `${blocks[50]}${'x'.repeat(turn)}`;
      const edited = both(blocks, config, tapes);
      expect(edited.taped).toBe(edited.plain);
      expect(edited.stats.reasons.filter(Boolean)).toEqual([]);
      expect(Math.min(...edited.stats.startedAt)).toBeGreaterThan(30);
      // The pages before the checkpoint keep what the build before made of
      // them (their running heads, their labels): not finished again.
      expect(Math.min(...edited.stats.pagesKept)).toBeGreaterThan(2);
      expect(edited.stats.builtAgain).toBe(false);
    }

    // Then one near the start: the passes start there.
    blocks[5] = `${blocks[5]} And a sentence more, long enough to add a line or two to the paragraph it ends.`;
    const early = both(blocks, config, tapes);
    expect(early.taped).toBe(early.plain);
    expect(Math.max(...early.stats.startedAt)).toBeLessThanOrEqual(5);

    // The same text again: nothing changed, every pass starts from its
    // last checkpoint.
    const again = both(blocks, config, tapes);
    expect(again.taped).toBe(again.plain);
    expect(Math.min(...again.stats.startedAt)).toBeGreaterThan(40);
  });

  it('stops placing where the layout rejoins the one before, and takes the pages after from it', () => {
    const config = { page } as PostextConfig;
    const blocks = chapter(120);
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    // Letters typed in the middle: each build places a few pages, from
    // the checkpoint before the edit to the first one after it where its
    // state is the state the pass before had there.
    for (let turn = 1; turn <= 3; turn++) {
      blocks[50] = `${blocks[50]}x`;
      const edited = both(blocks, config, tapes);
      expect(edited.taped, `letter ${turn}`).toBe(edited.plain);
      expect(edited.stats.rejoinedAt.some((b) => b !== undefined && b > 50)).toBe(true);
      expect(Math.max(...edited.stats.pagesTaken)).toBeGreaterThan(2);
      expect(edited.stats.builtAgain).toBe(false);
    }
    // Then earlier and later in the chapter, and a sentence that adds
    // lines: whatever the build does, the document is the same.
    for (const at of [20, 100, 50]) {
      blocks[at] = `${blocks[at]} And a sentence more, long enough to add a line or two to the paragraph it ends.`;
      const edited = both(blocks, config, tapes);
      expect(edited.taped, `sentence at block ${at}`).toBe(edited.plain);
      blocks[at] = `${blocks[at]}y`;
      const typed = both(blocks, config, tapes);
      expect(typed.taped, `letter at block ${at}`).toBe(typed.plain);
    }
  }, 120_000);

  it('starts over when the edit changes more than a block: a block added, the configuration changed', () => {
    const config = { page } as PostextConfig;
    const blocks = chapter(40);
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    blocks.splice(20, 0, 'A new paragraph between two others.');
    const added = both(blocks, config, tapes);
    expect(added.taped).toBe(added.plain);
    expect(added.stats.startedAt.every((b) => b === 0)).toBe(true);
    expect(added.stats.reasons[0]).toBe('the number of blocks changed');

    const wider = { page: { ...page, margins: { ...page.margins, left: pt(30) } } } as PostextConfig;
    const changed = both(blocks, wider, tapes);
    expect(changed.taped).toBe(changed.plain);
    expect(changed.stats.startedAt.every((b) => b === 0)).toBe(true);
  });

  it('gives the same pages in two balanced columns with headings, lists and notes', () => {
    const config = { page, layout: { layoutType: 'double' } } as PostextConfig;
    const blocks = ['# A chapter', ...Array.from({ length: 10 }, (_, i) => para(i)), '## A section', para(11), '- one\n- two\n- three', 'Text with a note[^a] and another[^b].', '[^a]: The first note, long enough to take two lines at the foot of its column.\n[^b]: The second.', '## Another', ...Array.from({ length: 30 }, (_, i) => para(20 + i))];
    const tapes = createLayoutTapes();
    expect(both(blocks, config, tapes).taped).toBe(both(blocks, config, createLayoutTapes()).plain);
    for (const at of [40, 25, 8, 44]) {
      blocks[at] = `${blocks[at]} More words here.`;
      const edited = both(blocks, config, tapes);
      expect(edited.taped, `edit at block ${at}`).toBe(edited.plain);
    }
  });
});
