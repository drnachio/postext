import { describe, expect, it } from 'vitest';
import { buildDocument, type PostextConfig, type VDTComicPage } from 'postext';
import { applyTextChanges, changesApply, invertTextChanges, minimalChange, shiftTextChanges } from '../../book/textChanges';
import {
  canMergeNext,
  canSplitPanel,
  comicPanelSlots,
  comicPageSourceAt,
  comicSplitValue,
  mergePanelChanges,
  moveSplitterChanges,
  splitPanelChanges,
} from './comicSource';

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

const config: PostextConfig = { page: { sizePreset: '17x24' } };

/** The comic pages of a Markdown text, laid out. */
function comics(markdown: string): VDTComicPage[] {
  const doc = buildDocument({ markdown, resources: [] }, config);
  return doc.pages.flatMap((p) => (p.comic ? [p.comic] : []));
}

const edit = (markdown: string, changes: ReturnType<typeof moveSplitterChanges>) => {
  expect(changes).not.toBeNull();
  expect(changesApply(markdown, changes!)).toBe(true);
  return applyTextChanges(markdown, changes!);
};

const PAGE = `# Chapter

:::page{split="30 [30 | 20 | *] / *" gutter=4mm}
::panel{art=a}
ana: Did you hear that?
::panel{art=b}
sfx: KRAK
::panel{art=c}
ana{thought}: Nothing.
::panel{art=d}
caption: Three streets away.
:::

After.
`;

describe('text changes', () => {
  it('keeps only the part that differs', () => {
    expect(minimalChange('30 / *', '42.5 / *', 10)).toEqual({ from: 10, to: 12, insert: '42.5', expect: '30' });
    expect(minimalChange('abc', 'abc')).toBeNull();
  });

  it('undoes what it applied', () => {
    const text = 'one two three';
    const changes = [
      { from: 4, to: 7, insert: 'TWO!', expect: 'two' },
      { from: 0, to: 0, insert: '> ', expect: '' },
    ];
    const after = applyTextChanges(text, changes);
    expect(after).toBe('> one TWO! three');
    const back = invertTextChanges(changes);
    expect(changesApply(after, back)).toBe(true);
    expect(applyTextChanges(after, back)).toBe(text);
    expect(changesApply(text, [{ from: 0, to: 3, insert: 'x', expect: 'two' }])).toBe(false);
    expect(shiftTextChanges(changes, 5)[0]).toMatchObject({ from: 9, to: 12 });
  });
});

describe('comic source edits', () => {
  it('writes a dragged line into the split value, in place', () => {
    const [comic] = comics(PAGE);
    const tiers = comic!.splitters.find((s) => s.path.length === 0)!;
    const changes = moveSplitterChanges(PAGE, comic!, tiers, 42.5);
    expect(changes).toEqual([{ from: PAGE.indexOf('30 ['), to: PAGE.indexOf('30 [') + 2, insert: '42.5', expect: '30' }]);
    expect(edit(PAGE, changes)).toContain(':::page{split="42.5 [30 | 20 | *] / *" gutter=4mm}');
    // A column line: the two cells either side change, the star stays.
    const col = comic!.splitters.find((s) => s.path.length === 1 && s.boundary === 0)!;
    expect(edit(PAGE, moveSplitterChanges(PAGE, comic!, col, 40))).toContain('split="30 [40 | 10 | *] / *"');
  });

  it('slants a line when only one end moves', () => {
    const [comic] = comics(PAGE);
    const tiers = comic!.splitters.find((s) => s.path.length === 0)!;
    expect(edit(PAGE, moveSplitterChanges(PAGE, comic!, tiers, 30, 45))).toContain('split="30~45 [30 | 20 | *] / *"');
  });

  it('inserts a split on a page that has none', () => {
    const md = `:::page\n::panel\nana: Hi\n::panel\nben: Bye\n::panel\n:::\n`;
    const [comic] = comics(md);
    expect(comic!.splitters).toHaveLength(2);
    const s0 = comic!.splitters[0]!;
    // The splitter carries the empty range where the attribute goes.
    expect(s0.sourceStart).toBe(s0.sourceEnd);
    expect(s0.sourceStart).toBe(':::page'.length);
    const source = comicPageSourceAt(md, comic!)!;
    expect(comicSplitValue(md, source)).toMatchObject({ value: '* / * / *', written: false });
    const out = edit(md, moveSplitterChanges(md, comic!, s0, 40));
    expect(out.split('\n')[0]).toBe(':::page{split="40 / 26.7 / *"}');
    // The new value lays the lines out where they were dragged to.
    const [after] = comics(out);
    expect(after!.splitters[0]!.startPercent).toBeCloseTo(40, 3);
    expect(after!.splitters[1]!.startPercent).toBeCloseTo(66.7, 3);
  });

  it('adds the attribute inside braces that hold others', () => {
    const md = `:::page{gutter=2mm}\n::panel\n::panel\n:::\n`;
    const [comic] = comics(md);
    const out = edit(md, moveSplitterChanges(md, comic!, comic!.splitters[0]!, 30));
    expect(out.split('\n')[0]).toBe(':::page{gutter=2mm split="30 / *"}');
  });

  it('quotes an unquoted value that needs it', () => {
    const md = `:::page{split=50/*}\n::panel\n::panel\n:::\n`;
    const [comic] = comics(md);
    // A moved number is rewritten in place: no quotes needed.
    const out = edit(md, moveSplitterChanges(md, comic!, comic!.splitters[0]!, 25));
    expect(out.split('\n')[0]).toBe(':::page{split=25/*}');
    // A split value written anew has spaces: it gets its quotes.
    const out2 = edit(md, splitPanelChanges(md, comic!, 1, 'rows'));
    expect(out2.split('\n')[0]).toBe(':::page{split="50 / 25 / *"}');
  });

  it('maps laid-out panels to their source and cells, insets apart', () => {
    const md = `:::page{split="50 / *"}\n::panel{art=a}\n::panel{inset="10% 10% 30% 30%"}\n::panel{art=b}\n:::\n`;
    const [comic] = comics(md);
    const slots = comicPanelSlots(comic!, comicPageSourceAt(md, comic!)!);
    expect(slots.map((s) => [s.cell, s.panel?.attrs.art ?? (s.panel?.attrs.inset ? 'inset' : undefined)])).toEqual([
      [0, 'a'],
      [undefined, 'inset'],
      [1, 'b'],
    ]);
    expect(canSplitPanel(md, comic!, 1)).toBe(false);
    expect(canSplitPanel(md, comic!, 0)).toBe(true);
  });

  it('splits a panel and adds an empty panel after it', () => {
    const [comic] = comics(PAGE);
    // Panel 2 (the 20 % cell of the top tier): a sibling column.
    const out = edit(PAGE, splitPanelChanges(PAGE, comic!, 1, 'columns'));
    expect(out).toContain('split="30 [30 | 10 | 10 | *] / *"');
    expect(out).toContain('::panel{art=b}\nsfx: KRAK\n::panel\n::panel{art=c}');
    // Panel 4 (the bottom tier): one above the other.
    const out2 = edit(PAGE, splitPanelChanges(PAGE, comic!, 3, 'rows'));
    expect(out2).toContain('split="30 [30 | 20 | *] / 35 / *"');
    expect(out2).toContain('caption: Three streets away.\n::panel\n:::');
    // Across the list's axis: a bracketed list in the cell.
    const out3 = edit(PAGE, splitPanelChanges(PAGE, comic!, 3, 'columns'));
    expect(out3).toContain('split="30 [30 | 20 | *] / * [* | *]"');
    const [after] = comics(out3);
    expect(after!.panels).toHaveLength(5);
  });

  it('keeps an inset with its panel when that panel is split', () => {
    const md = `:::page{split="50 / *"}\n::panel{art=a}\n::panel{inset="10% 10% 30% 30%" art=i}\n::panel{art=b}\n:::\n`;
    const [comic] = comics(md);
    const out = edit(md, splitPanelChanges(md, comic!, 0, 'columns'));
    expect(out).toBe(`:::page{split="50 [* | *] / *"}\n::panel{art=a}\n::panel{inset="10% 10% 30% 30%" art=i}\n::panel\n::panel{art=b}\n:::\n`);
  });

  it('merges a panel with the next, keeping both scripts', () => {
    const [comic] = comics(PAGE);
    expect(canMergeNext(PAGE, comic!, 0)).toBe(true);
    // The last panel of the top tier has no next sibling in its list.
    expect(canMergeNext(PAGE, comic!, 2)).toBe(false);
    const out = edit(PAGE, mergePanelChanges(PAGE, comic!, 0));
    expect(out).toContain('split="30 [50 | *] / *"');
    expect(out).toContain('::panel{art=a}\nana: Did you hear that?\nsfx: KRAK\n::panel{art=c}');
    expect(out).not.toContain('art=b');
    // The bottom tier merges with nothing: it is the last of its list.
    expect(canMergeNext(PAGE, comic!, 3)).toBe(false);
    expect(mergePanelChanges(PAGE, comic!, 3)).toBeNull();
  });

  it('moves the next panel\'s lines past an inset when merging', () => {
    const md = `:::page{split="50 | *"}\n::panel{art=a}\nana: One\n::panel{inset="10% 10% 30% 30%" art=i}\n::panel{art=b}\nben: Two\n:::\n`;
    const [comic] = comics(md);
    const out = edit(md, mergePanelChanges(md, comic!, 0));
    expect(out).toBe(`:::page{split="*"}\n::panel{art=a}\nana: One\nben: Two\n::panel{inset="10% 10% 30% 30%" art=i}\n:::\n`);
  });
});
