// #1639: a placement pass saved at a block and taken up again from there
// ends as a pass run from the first block: the same tape (every
// collection the pass keeps, the document included), object for object.

import { afterEach, describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { PassTape } from '../../pipeline/build/passTape.js';
import type { PassResumeCheck } from '../../pipeline/build/passResume.js';
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
function checked(markdown: string, config: PostextConfig, every = 1, placedAgain?: () => void): { compared: number; differed: string[]; text: string } {
  let compared = 0;
  let lastPages = -1;
  let opened = 0;
  const differed: string[] = [];
  hook.__postextPassResumeCheck = {
    ...(placedAgain ? { placedAgain } : {}),
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

  it('closes the pages behind a checkpoint: checkpoints share them, and a write to one throws', () => {
    const tape = new PassTape();
    const doc = { pages: [{ index: 0, lines: [{ text: 'one' }] }, { index: 1, lines: [{ text: 'two' }] }] as { index: number; lines: { text: string }[] }[] };
    const byPage = new Map<object, string>([[doc.pages[0]!, 'first']]);
    tape.track('test', { doc, byPage });
    tape.close(doc.pages.slice(0, -1));
    const closed = doc.pages[0]!;
    const a = tape.record();
    doc.pages[1]!.lines.push({ text: 'three' });
    const b = tape.record();
    const pagesOf = (image: typeof a) => (image.bindings.get('test.doc') as typeof doc).pages;
    // The closed page is one object in both; the open one a copy in each.
    expect(pagesOf(a)[0]).toBe(closed);
    expect(pagesOf(b)[0]).toBe(closed);
    expect(pagesOf(a)[1]).not.toBe(pagesOf(b)[1]);
    expect(pagesOf(a)[1]!.lines).toHaveLength(1);
    expect(() => { closed.lines.push({ text: 'late' }); }).toThrow(TypeError);
    expect(() => { closed.lines[0]!.text = 'late'; }).toThrow(TypeError);
    // Put back, the tape holds the closed page itself and its key still
    // finds it; the open page is as the checkpoint held it.
    tape.putBack(a);
    expect(doc.pages[0]).toBe(closed);
    expect(byPage.get(doc.pages[0]!)).toBe('first');
    expect(doc.pages[1]!.lines).toHaveLength(1);
    // Opened, the tape writes to pages of its own; the closed one stays.
    tape.open();
    expect(doc.pages[0]).not.toBe(closed);
    doc.pages[0]!.lines[0]!.text = 'set by the finish';
    expect(closed.lines[0]!.text).toBe('one');
    expect([...byPage.keys()][0]).toBe(doc.pages[0]);
    expect(pagesOf(a)[0]).toBe(closed);
  });

  it('places a pass again, with no page closed, when it sets a box on a page behind it', () => {
    // Two side boxes fenced where the column is full: the first goes on
    // with the next line, the second stays with the text it follows, on
    // the page behind. That page was closed at the checkpoint: the write
    // throws, and the pass is placed again from its first block.
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const box = { backgroundEnabled: false, padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) } };
    const config = {
      page: { width: mm(100), height: mm(60), dpi: 150, margins: { top: mm(10), bottom: mm(10.48), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'oneAndHalf', sideColumnPercent: 20, sideColumnRole: 'floats', gutterWidth: mm(3) },
      bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', firstLineIndent: pt(0) },
      paragraphStyles: [{ id: 'v' }],
      calloutStyles: [{ id: 'n', ...box, sideAtColumnEnd: 'after' }, { id: 'g', ...box }],
      header: { elements: [] },
      footer: { elements: [] },
    } as unknown as PostextConfig;
    const blocks = Array.from({ length: 12 }, (_, i) => `:::paragraphs{style="v"}\nLine ${i + 1} of the text.\n:::`);
    blocks.splice(8, 0, ':::callout{type="n" span="side"}\nBOX\n:::', ':::callout{type="g" span="side"}\nGLOSS\n:::');
    const md = blocks.join('\n\n');
    const plain = JSON.stringify(buildDocument({ markdown: md }, config));
    let placedAgain = 0;
    const result = checked(md, config, 1, () => { placedAgain++; });
    expect(result.differed).toEqual([]);
    expect(result.text).toBe(plain);
    expect(placedAgain).toBeGreaterThan(0);
  });
});
