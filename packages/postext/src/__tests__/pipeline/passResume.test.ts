// #1639: a placement pass saved at a block and taken up again from there
// ends as a pass run from the first block: the same tape (every
// collection the pass keeps, the document included), object for object.

import { afterEach, describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import type { PassResumeCheck } from '../../pipeline/build/passTape.js';
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

const hook = globalThis as { __postextPassResumeCheck?: PassResumeCheck };
afterEach(() => { delete hook.__postextPassResumeCheck; });

/** Build with the check on: every pass saves itself where a page opens
 *  (every `every`-th of them) and is taken up again from each. Returns
 *  how many resumed runs were compared, and the first that differed. */
function checked(markdown: string, config: PostextConfig, every = 1): { compared: number; differed: string[]; text: string } {
  let compared = 0;
  let lastPages = -1;
  let opened = 0;
  const differed: string[] = [];
  hook.__postextPassResumeCheck = {
    saveAt(blockIdx, pages) {
      if (blockIdx === 0) lastPages = -1;
      if (pages === lastPages) return false;
      lastPages = pages;
      return opened++ % every === 0;
    },
    compared(blockIdx, first, again) {
      compared++;
      if (first === again) return;
      let at = 0;
      while (at < first.length && first[at] === again[at]) at++;
      differed.push(`from block ${blockIdx}: …${first.slice(Math.max(0, at - 120), at + 80)}… ≠ …${again.slice(Math.max(0, at - 120), at + 80)}…`);
    },
  };
  const doc = buildDocument({ markdown }, config);
  delete hook.__postextPassResumeCheck;
  return { compared, differed, text: JSON.stringify(doc) };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = { width: pt(360), height: pt(480), margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } };
const para = (n: number) => `Paragraph ${n} with enough words in it to run over several lines of a narrow column, and then a few more to be sure of it. `.repeat(3);
const prose = (paragraphs: number) => Array.from({ length: paragraphs }, (_, i) => para(i)).join('\n\n');

describe('a placement pass taken up again from a saved block', () => {
  it('ends as the first run did: plain prose in one column', () => {
    const config = { page } as PostextConfig;
    const md = `# A chapter\n\n${prose(40)}`;
    const plain = JSON.stringify(buildDocument({ markdown: md }, config));
    const result = checked(md, config);
    expect(result.differed).toEqual([]);
    expect(result.compared).toBeGreaterThan(3);
    // And the pass that finished from a restored tape gives the document
    // a pass that never stopped gives.
    expect(result.text).toBe(plain);
  });

  it('ends as the first run did: two balanced columns, headings, lists and footnotes', () => {
    const config = { page, layout: { layoutType: 'double' } } as PostextConfig;
    const md = `# A chapter\n\n${prose(6)}\n\n## A section\n\n${prose(3)}\n\n- one\n- two\n- three\n\nText with a note[^a] and another[^b].\n\n[^a]: The first note, long enough to take two lines at the foot of its column.\n[^b]: The second.\n\n## Another\n\n${prose(12)}\n\n> A quotation that stands apart.\n\n${prose(8)}`;
    const plain = JSON.stringify(buildDocument({ markdown: md }, config));
    const result = checked(md, config);
    expect(result.differed).toEqual([]);
    expect(result.compared).toBeGreaterThan(3);
    expect(result.text).toBe(plain);
  });
});
