import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index.js';

// A composed page none of whose frames has a story (a template just
// placed, every frame still empty) lays out as a page of its own.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const at = (x: number, y: number) => ({ anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(x), y: mm(y) } });

describe('a composed page with every frame empty', () => {
  it('lays out its page instead of failing on the frames’ box style', () => {
    const doc = buildDocument(
      { markdown: '::::page{template="poster"}\n\n::::' },
      {
        header: { elements: [] },
        footer: { elements: [] },
        pageTemplates: [{
          id: 'poster',
          frames: [
            { name: 'title', width: mm(100), height: mm(30), placement: at(10, 10), optional: true },
            { name: 'text', width: mm(100), height: mm(100), placement: at(10, 50), optional: true },
          ],
        }],
      },
    );
    expect(doc.pages.length).toBe(1);
  });
});

// What #1653 added to the case above: the same page with no story for
// other reasons, and beside other pages.

const frames = (optional: boolean) => [
  { name: 'title', width: mm(100), height: mm(30), placement: at(10, 10), optional },
  { name: 'text', width: mm(100), height: mm(100), placement: at(10, 50), optional },
];
const build = (markdown: string, optional = true, templates?: unknown[]) =>
  buildDocument({ markdown }, { header: { elements: [] }, footer: { elements: [] }, pageTemplates: (templates ?? [{ id: 'poster', frames: frames(optional) }]) as never });
const EMPTY = '::::page{template="poster"}\n\n::::';

describe('a composed page none of whose content reaches a frame', () => {
  it('carries the frames of its template, each with nothing in it', () => {
    const doc = build(EMPTY);
    const page = doc.pages[0]!;
    expect(page.role).toBe('composed');
    expect(page.composed!.frames.map((f) => f.name)).toEqual(['title', 'text']);
    expect(page.composed!.frames.every((f) => f.blockIds.length === 0)).toBe(true);
  });

  it('lays out when its only content names a slot the template lacks', () => {
    const doc = build('::::page{template="poster"}\n:::frame{slot="nowhere"}\nWords.\n:::\n::::');
    expect(doc.pages.some((p) => p.role === 'composed')).toBe(true);
  });

  it('says which required frames are empty', () => {
    const doc = build(EMPTY, false);
    expect(doc.pages.length).toBe(1);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'slotEmpty').length).toBe(2);
  });

  it('takes its own page between running text', () => {
    const doc = build(`Before the page.\n\n${EMPTY}\n\nAfter the page.`);
    const pageOf = (text: string) => doc.blocks.find((b) => b.lines.some((l) => l.text.includes(text)))?.pageIndex;
    expect(doc.pages.map((p) => p.role === 'composed')).toEqual([false, true, false]);
    expect(pageOf('Before')).toBe(0);
    expect(pageOf('After')).toBe(2);
  });

  it('lays out twice in a row, and before a page with content', () => {
    expect(build(`${EMPTY}\n\n${EMPTY}`).pages.map((p) => p.role)).toEqual(['composed', 'composed']);
    const doc = build(`${EMPTY}\n\n::::page{template="poster"}\n:::frame{slot="title"}\nA title.\n:::\n::::`);
    expect(doc.pages.map((p) => p.role)).toEqual(['composed', 'composed']);
    expect(doc.blocks.find((b) => b.lines.some((l) => l.text.includes('A title')))?.pageIndex).toBe(1);
  });

  it('lays out as a spread', () => {
    const spread = { id: 'poster', spread: true, gutter: mm(10), grid: { columns: 4, rows: 4, columnGap: mm(12) }, frames: [{ name: 'left', grid: { col: 1, row: 1 }, optional: true }, { name: 'right', grid: { col: 4, row: 1 }, optional: true }] };
    const doc = build('::::page{template="poster" spread}\n\n::::', true, [spread]);
    expect(doc.pages.filter((p) => p.composed?.spread).length).toBe(2);
  });

  it('adds nothing when the template is unknown: the fence is set in the flow', () => {
    expect(build('::::page{template="other"}\n\n::::').pages.some((p) => p.role === 'composed')).toBe(false);
  });
});
