// #1650: what kept the tapes of a chapter from being used after an edit,
// and the short chapters they rest on.

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
const paragraphs = (from: number, count: number) => Array.from({ length: count }, (_, i) => para(from + i));

/** Build `blocks` with the tapes and without: the two documents as text. */
function both(blocks: string[], config: PostextConfig, tapes: ReturnType<typeof createLayoutTapes>) {
  const markdown = blocks.join('\n\n');
  const plain = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache()));
  const taped = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache(), { tapes }));
  return { plain, taped, stats: tapes.stats };
}

describe('a build with tapes after an edit (#1650)', () => {
  it('starts from a checkpoint in a document with a part: the part list widths are read once, with the setup', () => {
    const config = { page } as PostextConfig;
    const blocks = ['# A chapter', ':::part{number="I" title="One"}\n:::', ...paragraphs(0, 80)];
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    blocks[60] = `${blocks[60]}x`;
    const edited = both(blocks, config, tapes);
    expect(edited.taped).toBe(edited.plain);
    // (The part's band caps make passes of their own, whose hints differ.)
    expect(edited.stats.reasons).not.toContain('no checkpoint before the edit');
    expect(Math.max(...edited.stats.startedAt)).toBeGreaterThan(20);
  });

  it('rejoins the build before after a floated box: the box is laid out by a function the tape does not hold', () => {
    const config = { page } as PostextConfig;
    const blocks = ['# A chapter', ...paragraphs(0, 10), ':::callout{placement="top" title="Ficha"}\nA box that floats to the head of a page.\n:::', ...paragraphs(10, 110)];
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    blocks[70] = `${blocks[70]}x`;
    const edited = both(blocks, config, tapes);
    expect(edited.taped).toBe(edited.plain);
    expect(edited.stats.apartAt.filter((why) => why?.includes('cannot be read'))).toEqual([]);
    expect(edited.stats.rejoinedAt.some((b) => b !== undefined && b > 70)).toBe(true);
    expect(edited.stats.builtAgain).toBe(false);
  });

  it('leaves the colours a part palette gave a kept page as they are', () => {
    const config = {
      page,
      colorPalette: [{ id: 'band', name: 'Band', value: { hex: '#336699', model: 'hex' } }],
      calloutStyles: [{ id: 'c', background: { hex: '#336699', model: 'hex', paletteId: 'band' } }],
    } as PostextConfig;
    const box = ':::callout{type="c"}\nA box in the colour of the band.\n:::';
    const blocks = ['# A chapter', ':::part{number="II" title="Two" palette="band=#f6c297"}\n:::', ...paragraphs(0, 30), box, ...paragraphs(30, 30), box, ...paragraphs(60, 30)];
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    blocks[80] = `${blocks[80]}x`;
    const edited = both(blocks, config, tapes);
    expect(edited.taped).toBe(edited.plain);
    expect(edited.stats.builtAgain).toBe(false);
    expect(Math.max(...edited.stats.pagesKept)).toBeGreaterThan(0);
  });

  it('keeps the checkpoints of the build before past the block where it rejoined it: a later edit further on rejoins after it', () => {
    const config = { page } as PostextConfig;
    const blocks = ['# A chapter', ...paragraphs(0, 150)];
    const tapes = createLayoutTapes();
    both(blocks, config, tapes);
    blocks[10] = `${blocks[10]}x`;
    const near = both(blocks, config, tapes);
    expect(near.taped).toBe(near.plain);
    const rejoined = Math.max(0, ...Array.from(near.stats.rejoinedAt, (b) => b ?? 0));
    expect(rejoined).toBeGreaterThan(10);
    expect(rejoined).toBeLessThan(100);
    blocks[110] = `${blocks[110]}x`;
    const far = both(blocks, config, tapes);
    expect(far.taped).toBe(far.plain);
    // At a checkpoint the build before took from the one before it.
    expect(Array.from(far.stats.apartAt)).not.toContain('the pass before left no checkpoint after the edit');
    expect(far.stats.rejoinedAt[0]).toBeGreaterThan(110);
    expect(far.stats.builtAgain).toBe(false);
    blocks[130] = `${blocks[130]}x`;
    const further = both(blocks, config, tapes);
    expect(further.taped).toBe(further.plain);
  });

  it('rests on a document of fewer pages than the tapes are asked to record, and records again once it has as many', () => {
    const config = { page } as PostextConfig;
    const blocks = ['# A chapter', ...paragraphs(0, 6)];
    const tapes = createLayoutTapes({ restBelowPages: 4 });
    // The first build records: the tapes do not know the chapter yet.
    both(blocks, config, tapes);
    expect(tapes.stats.passes).toBeGreaterThan(0);
    blocks[3] = `${blocks[3]}x`;
    const resting = both(blocks, config, tapes);
    expect(resting.taped).toBe(resting.plain);
    expect(resting.stats.passes).toBe(0);
    // Long enough again: the next build records from nothing, the one
    // after it starts from a checkpoint.
    blocks.push(...paragraphs(6, 60));
    both(blocks, config, tapes);
    both(blocks, config, tapes);
    expect(tapes.stats.passes).toBeGreaterThan(0);
    blocks[50] = `${blocks[50]}x`;
    const edited = both(blocks, config, tapes);
    expect(edited.taped).toBe(edited.plain);
    expect(Math.min(...edited.stats.startedAt)).toBeGreaterThan(20);
  });
});
