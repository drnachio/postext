// #1637: a build that kept a page which never had its marks (a page made
// by a pass of the build before that was not its last) is done again from
// that build, without the passes whose pages lack them: not from nothing.

import { describe, expect, it } from 'vitest';
import { buildDocument, createLayoutTapes } from '../../index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { markMade, unfrozenCopy } from '../../pipeline/build/passMade.js';
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

interface Record {
  finished?: { made: { pages: object[] } };
}

describe('a kept page that never had its marks (#1637)', () => {
  it('has the build done again from the build before, the pass whose pages lack them placed without it', () => {
    const config = { page } as PostextConfig;
    const blocks = ['# A chapter', ...Array.from({ length: 60 }, (_, i) => para(i))];
    const tapes = createLayoutTapes();
    buildDocument({ markdown: blocks.join('\n\n') }, config, createMeasurementCache(), { tapes });
    blocks[50] = `${blocks[50]}x`;
    buildDocument({ markdown: blocks.join('\n\n') }, config, createMeasurementCache(), { tapes });

    // The pages of the last pass stand as a pass that was not its build's
    // last leaves them: made, never through the marks.
    const records = (tapes as unknown as { current: (Record | undefined)[] }).current;
    const last = records[records.length - 1]!;
    const pages = last.finished!.made.pages;
    for (let i = 0; i < pages.length; i++) {
      const copy = unfrozenCopy(pages[i]!);
      markMade(copy);
      pages[i] = copy;
    }

    blocks[50] = `${blocks[50]}y`;
    const markdown = blocks.join('\n\n');
    const taped = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache(), { tapes }));
    const plain = JSON.stringify(buildDocument({ markdown }, config, createMeasurementCache()));
    expect(taped).toBe(plain);
    expect(tapes.stats.builtAgain).toBe(true);
    expect(tapes.stats.builtAgainAt).toMatch(/never had its marks/);
    expect(tapes.stats.reasons[records.length - 1]).toBe('the pass before never had its marks');

    // The build before was kept: the next letter starts from a checkpoint.
    blocks[50] = `${blocks[50]}z`;
    const next = blocks.join('\n\n');
    expect(JSON.stringify(buildDocument({ markdown: next }, config, createMeasurementCache(), { tapes }))).toBe(JSON.stringify(buildDocument({ markdown: next }, config, createMeasurementCache())));
    expect(tapes.stats.builtAgain).toBe(false);
    expect(tapes.stats.startedAt.some((b) => b > 0)).toBe(true);
  });
});
