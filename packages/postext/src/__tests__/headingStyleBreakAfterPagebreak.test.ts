import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import type { HeadingBreakParity, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';

// EF-60 (documented behaviour, locked here): a heading style inherits its
// level's `breakBefore`, and a heading applies it wherever it stands —
// right after a `:::pagebreak` too. The page break opens a new page; the
// heading's parity then still picks the side of the spread. A style meant
// to start right after a page break turns its own break off.

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
const config = (parity: HeadingBreakParity, styleBreak?: PostextConfig['headingStyles']): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity } }] },
  headingStyles: styleBreak ?? [{ id: 'contents', numbered: false }],
});

// Title page, then a page break: the contents heading comes after it on
// page 2 (a verso).
const markdown = 'A title page.\n\n:::pagebreak\n\n# Contents {style="contents"}\n\nEntries.';

const contentsPage = (doc: VDTDocument): number =>
  doc.blocks.find((b) => b.type === 'heading')!.pageIndex;

describe('EF-60: a styled heading after :::pagebreak keeps its level\'s break', () => {
  it('parity odd: the page break lands on a verso, so a blank page precedes the heading', () => {
    const doc = buildDocument({ markdown }, config('odd'));
    expect(contentsPage(doc)).toBe(2);
    expect(doc.pages[1]!.blankForParity).toBe(true);
  });

  it('always-odd: the page break adds nothing — the same pages as without it', () => {
    const withBreak = buildDocument({ markdown }, config('always-odd'));
    const without = buildDocument({ markdown: markdown.replace(':::pagebreak\n\n', '') }, config('always-odd'));
    expect(contentsPage(withBreak)).toBe(contentsPage(without));
    expect(withBreak.pages.length).toBe(without.pages.length);
  });

  it('breakBefore: { enabled: false } on the style starts the heading on the page the break opened', () => {
    const doc = buildDocument({ markdown }, config('odd', [{ id: 'contents', numbered: false, breakBefore: { enabled: false } }]));
    expect(contentsPage(doc)).toBe(1);
    expect(doc.pages.some((p) => p.blankForParity)).toBe(false);
  });

  it('parity: \'any\' on the style keeps a page of its own and needs no page break', () => {
    const style = [{ id: 'contents', numbered: false, breakBefore: { parity: 'any' as const } }];
    expect(contentsPage(buildDocument({ markdown }, config('odd', style)))).toBe(1);
    expect(contentsPage(buildDocument({ markdown: markdown.replace(':::pagebreak\n\n', '') }, config('odd', style)))).toBe(1);
  });
});
