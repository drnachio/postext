import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { createPaintedPages } from './pageReuse.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config: PostextConfig = {
  page: { width: mm(150), height: mm(200), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } } as never,
  pageTemplates: [{ id: 't', decoration: { elements: [{ kind: 'text', id: 'n', content: '{attr.n}', placement: { anchor: { to: 'page', edge: 'top-right' } } }] } as never, frames: [{ name: 'main', flow: true }, { name: 'side', width: mm(40), placement: { anchor: { to: 'container', edge: 'top-right' } } }] }],
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', placement: { anchor: { to: 'container', edge: 'bottom-left' } } }] } as never,
};
const page = (n: number, words: string) => `::::page{template="t" n="${n}"}\n${words} on page ${n}.\n\n:::frame{slot="side"}\nSide ${n}.\n:::\n::::`;
const book = (edit?: { at: number; words: string }) => [1, 2, 3].map((n) => page(n, edit?.at === n ? edit.words : 'Words')).join('\n\n');
const build = (md: string): VDTDocument => buildDocument({ markdown: md }, config);

describe('composed pages keep their pixels across a relayout (#857)', () => {
  it('repaints the page an edit changed and keeps the others', () => {
    const painted = createPaintedPages();
    const before = build(book());
    before.pages.forEach((p, i) => painted.painted(i, p, { scale: 1 }));
    const after = build(book({ at: 2, words: 'Other words' }));
    expect(after.pages.map((p, i) => painted.same(i, p, { scale: 1 }))).toEqual([true, false, true]);
    // An edit on the first page moves every offset after it, not a pixel.
    const first = build(book({ at: 1, words: 'Longer words than before' }));
    expect(first.pages.map((p, i) => painted.same(i, p, { scale: 1 }))).toEqual([false, true, true]);
  });

  it('repaints every page painted at another scale, and a page it forgot', () => {
    const painted = createPaintedPages();
    const doc = build(book());
    doc.pages.forEach((p, i) => painted.painted(i, p, { scale: 1 }));
    expect(painted.same(0, doc.pages[0]!, { scale: 2 })).toBe(false);
    painted.forget(1);
    expect(painted.same(1, doc.pages[1]!, { scale: 1 })).toBe(false);
    painted.clear();
    expect(painted.same(0, doc.pages[0]!, { scale: 1 })).toBe(false);
  });

  it('always repaints a page that is not a composed page', () => {
    const painted = createPaintedPages();
    const doc = build('Plain text.');
    painted.painted(0, doc.pages[0]!, {});
    expect(painted.same(0, doc.pages[0]!, {})).toBe(false);
  });
});
