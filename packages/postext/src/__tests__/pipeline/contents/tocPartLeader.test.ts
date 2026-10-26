import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { isAllowedPlaceholder, resolveDesignPlaceholders, LEADER_MARK, type DesignPlaceholderContext } from '../../../design/placeholders.js';
import type { DesignSlot, PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDesignTextBlock } from '../../../vdt.js';

// #889: a contents part row (`toc.parts.design`) draws the contents' leader
// up to its page number with `{leader}`, as the entry rows do.

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

const row = (content: string, extra: Record<string, unknown> = {}): DesignSlot => ({
  elements: [{
    kind: 'text',
    id: 'row',
    content,
    fontSize: pt(10),
    align: 'left',
    verticalAlign: 'middle',
    placement: { anchor: { to: 'container', edge: 'left' }, size: { width: 'fill' } },
    ...extra,
  }],
});

const config = (design: DesignSlot, leader?: NonNullable<PostextConfig['toc']>['leader']): PostextConfig => ({
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  toc: { parts: { enabled: true, design }, ...(leader ? { leader } : {}) },
});

const book = `:::toc

:::part{number="I" title="Foundations"}
:::

# One

Text.

:::part{number="II" title="A much longer part title"}
:::

# Two

Text.`;

const partRows = (doc: { blocks: VDTBlock[] }): VDTBlock[] => doc.blocks.filter((b) => b.tocPart !== undefined && b.pageIndex === 0);
const rowText = (b: VDTBlock): VDTDesignTextBlock => b.designOverlay!.blocks.find((x) => x.kind === 'text') as VDTDesignTextBlock;

describe('toc part rows with {leader} (#889)', () => {
  it('is a placeholder of part contexts, marked only where a leader is given', () => {
    expect(isAllowedPlaceholder('leader', 'part')).toBe(true);
    expect(isAllowedPlaceholder('leader', 'header')).toBe(false);
    const ctx = { kind: 'part', page: { index: 0, pageLabel: '7' }, allPages: [], metadata: {}, chapterTitleByPageIndex: [] } as unknown as DesignPlaceholderContext;
    expect(resolveDesignPlaceholders('a{leader}{pageNumber}', ctx).text).toBe('a7');
    expect(resolveDesignPlaceholders('a{leader}{pageNumber}', { ...ctx, leader: { enabled: true, char: '.', gap: pt(2) } }).text).toBe(`a${LEADER_MARK}7`);
  });

  it('sets the title at the start, the page number at the end and the dots between, flush with the number', () => {
    const doc = buildDocument({ markdown: book }, config(row('{number} {titleText}{leader}{pageNumber}')));
    const rows = partRows(doc);
    expect(rows).toHaveLength(2);
    const ends: number[] = [];
    for (const r of rows) {
      const text = rowText(r);
      expect(text.lines).toHaveLength(1);
      const line = text.lines[0]!;
      const runs = line.runs!;
      // Title, blank room, dots, gap, page number.
      expect(runs[0]!.text).toBe(`${r.tocPart!.number} ${r.tocPart!.title}`);
      expect(runs.at(-1)!.text).toBe(r.tocPart!.pageLabel);
      const dots = runs.find((x) => /^\.{3,}$/.test(x.text))!;
      expect(dots).toBeDefined();
      expect(line.text).toBe(`${runs[0]!.text}${dots.text}${r.tocPart!.pageLabel}`);
      // The runs fill the row: the number ends at the row's right edge.
      const width = runs.reduce((s, x) => s + x.width, 0);
      expect(width).toBeCloseTo(text.bbox.width, 3);
      expect(line.width).toBeCloseTo(text.bbox.width, 3);
      // Where the dots end, measured from the row's right edge.
      const before = runs.slice(0, runs.indexOf(dots) + 1).reduce((s, x) => s + x.width, 0);
      ends.push(text.bbox.width - before);
    }
    // The dots of both rows end the same gap before the number column.
    const [a, b] = rows.map((r) => rowText(r).lines[0]!.runs!.at(-1)!.width);
    expect(ends[0]! - a!).toBeCloseTo(ends[1]! - b!, 3);
    expect(doc.contentWarnings?.some((w) => w.kind === 'designTextTruncated') ?? false).toBe(false);
  });

  it('follows toc.leader: its character, and a blank room when it is off', () => {
    const star = buildDocument({ markdown: book }, config(row('{titleText}{leader}{pageNumber}'), { char: '*', gap: pt(4) }));
    expect(rowText(partRows(star)[0]!).lines[0]!.runs!.some((x) => /^\*{3,}$/.test(x.text))).toBe(true);
    const off = buildDocument({ markdown: book }, config(row('{titleText}{leader}{pageNumber}'), { enabled: false }));
    const text = rowText(partRows(off)[0]!);
    const runs = text.lines[0]!.runs!;
    expect(runs.map((x) => x.text)).toEqual(['Foundations', '', partRows(off)[0]!.tocPart!.pageLabel]);
    expect(runs.reduce((s, x) => s + x.width, 0)).toBeCloseTo(text.bbox.width, 3);
  });

  it('cuts the title, not the page number, when the row is short of room', () => {
    const doc = buildDocument({ markdown: book }, config(row('{titleText} {titleText} {titleText}{leader}{pageNumber}', { placement: { anchor: { to: 'container', edge: 'left' }, size: { width: pt(120) } } })));
    const r = partRows(doc)[1]!;
    const runs = rowText(r).lines[0]!.runs!;
    expect(runs[0]!.text.endsWith('…')).toBe(true);
    expect(runs.at(-1)!.text).toBe(r.tocPart!.pageLabel);
    const warned = (doc.contentWarnings ?? []).filter((w) => w.kind === 'designTextTruncated');
    expect(warned.length).toBeGreaterThan(0);
    expect(JSON.stringify(warned)).not.toContain(LEADER_MARK);
  });

  it('lays a right-to-left row out from its right edge', () => {
    const arabic = book.replace('title="Foundations"', 'title="الأسس"').replace('title="A much longer part title"', 'title="جزء"');
    const doc = buildDocument({ markdown: arabic }, { ...config(row('{titleText}{leader}{pageNumber}', { direction: 'rtl' })) });
    const text = rowText(partRows(doc)[0]!);
    const line = text.lines[0]!;
    const runs = line.runs!;
    expect(runs.reduce((s, x) => s + x.width, 0)).toBeCloseTo(text.bbox.width, 3);
    // Painted from the left: the page number, the gap, the dots, the
    // blank room, the title.
    const painted = (line.order ?? runs.map((_, i) => i)).map((i) => runs[i]!.text);
    expect(painted[0]).toBe(partRows(doc)[0]!.tocPart!.pageLabel);
    expect(painted.at(-1)).toBe('الأسس');
    expect(painted.findIndex((t) => /^\.{3,}$/.test(t))).toBe(2);
  });

  it('reads {leader} as nothing outside a contents part row', () => {
    const doc = buildDocument({ markdown: '# One\n\nText.' }, {
      page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(30), left: pt(18), right: pt(18) } },
      footer: row('a{leader}{pageNumber}'),
    } as PostextConfig);
    const footer = doc.pages[0]!.footer;
    const text = footer?.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock | undefined;
    if (text) expect(text.lines[0]!.text).not.toContain(LEADER_MARK);
  });
});
