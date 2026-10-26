import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/text/bodyText.js';
import type { CompositionRule, PostextConfig, Resource } from '../../types.js';
import type { VDTBlock, VDTDocument } from '../../vdt.js';

// Deterministic text measurement stub (no DOM in the node test env).
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

// A page of ten lines, one column: one-line fillers, then a list.
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const LEAD = 13.2;
const config = (shortListSplit?: CompositionRule, extra: PostextConfig['bodyText'] = {}): PostextConfig => ({
  page: {
    dpi: 96,
    width: mm(100),
    height: { value: 20 + (10 * LEAD * 25.4) / 72, unit: 'mm' },
    margins: { top: mm(10), bottom: mm(10), left: mm(15), right: mm(15) },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontSize: pt(9.4), lineHeight: pt(LEAD), textAlign: 'left', firstLineIndent: pt(0),
    ...(shortListSplit ? { shortListSplit } : {}),
    ...extra,
  },
  unorderedLists: { marginTop: pt(0), marginBottom: pt(0) },
  headings: {
    levels: [{ level: 2, fontSize: pt(9.4), lineHeight: pt(LEAD), marginTop: pt(0), marginBottom: pt(0), breakBefore: { enabled: false } }],
  },
});
const fillers = (n: number): string[] => Array.from({ length: n }, (_, i) => `Filler line ${i + 1}.`);
const LIST = ['- item one', '- item two', '- item three'].join('\n');
const doc = (parts: string[], cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: parts.join('\n\n') }, cfg, createMeasurementCache());
const blockWith = (d: VDTDocument, text: string): VDTBlock =>
  d.blocks.find((b) => b.lines.some((l) => l.text.includes(text)))!;
const pagesOf = (d: VDTDocument, ...texts: string[]): number[] => texts.map((t) => blockWith(d, t).pageIndex);
const splits = (d: VDTDocument) => (d.contentWarnings ?? []).filter((w) => w.kind === 'shortListSplit');

describe('bodyText.shortListSplit (#749)', () => {
  it('is off by default: a list of three is cut 1 + 2 where the column ends, and nothing is reported', () => {
    const d = doc([...fillers(9), LIST], config());
    expect(pagesOf(d, 'item one', 'item two', 'item three')).toEqual([0, 1, 1]);
    expect(splits(d)).toEqual([]);
    // The explicit default lays out the same.
    const allowed = doc([...fillers(9), LIST], config('allow'));
    expect(pagesOf(allowed, 'item one', 'item two', 'item three')).toEqual([0, 1, 1]);
    expect(splits(allowed)).toEqual([]);
  });

  it('warn: the same layout, and one warning for the list', () => {
    const markdown = [...fillers(9), LIST].join('\n\n');
    const d = doc([...fillers(9), LIST], config('warn'));
    expect(pagesOf(d, 'item one', 'item two', 'item three')).toEqual([0, 1, 1]);
    const found = splits(d);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'shortListSplit', items: 3, pageIndex: 0 });
    expect(markdown.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe(LIST);
    expect(formatWarning(found[0]!)).toContain('A list of 3 items is cut between two columns');
  });

  it('warn: a list that fits its column is not reported', () => {
    expect(splits(doc([...fillers(7), LIST], config('warn')))).toEqual([]);
  });

  it('avoid: the list opens the next column whole', () => {
    for (const n of [8, 9]) {
      const d = doc([...fillers(n), LIST], config('avoid'));
      expect(pagesOf(d, 'item one', 'item two', 'item three'), `${n} fillers`).toEqual([1, 1, 1]);
      expect(splits(d), `${n} fillers`).toEqual([]);
    }
    // One that fits stays where it is.
    expect(pagesOf(doc([...fillers(7), LIST], config('avoid')), 'item one', 'item three')).toEqual([0, 0]);
  });

  it('avoid: the heading right above the list goes with it', () => {
    const d = doc([...fillers(7), '## A heading', LIST], config('avoid'));
    expect(pagesOf(d, 'A heading', 'item one', 'item two', 'item three')).toEqual([1, 1, 1, 1]);
    expect(blockWith(d, 'Filler line 7').pageIndex).toBe(0);
  });

  it('avoid: the colon line that introduces the list goes with it', () => {
    const d = doc([...fillers(7), 'Look for these signs:', LIST], config('avoid'));
    expect(pagesOf(d, 'Look for these signs:', 'item one', 'item two', 'item three')).toEqual([1, 1, 1, 1]);
    // With the colon rule off the list moves on alone.
    const loose = doc([...fillers(7), 'Look for these signs:', LIST], config('avoid', { keepColonWithList: false }));
    expect(pagesOf(loose, 'Look for these signs:', 'item one', 'item three')).toEqual([0, 1, 1]);
  });

  it('avoid: a list longer than shortListMaxItems is cut as any other', () => {
    const four = `${LIST}\n- item four`;
    const d = doc([...fillers(8), four], config('avoid'));
    expect(pagesOf(d, 'item one', 'item two', 'item three', 'item four')).toEqual([0, 0, 1, 1]);
    expect(splits(d)).toEqual([]);
    // …and kept whole once the limit takes it in.
    const kept = doc([...fillers(8), four], config('avoid', { shortListMaxItems: 4 }));
    expect(pagesOf(kept, 'item one', 'item four')).toEqual([1, 1]);
  });

  it('avoid: nested items count, and stay with their list', () => {
    const nested = ['- item one', '  - nested a', '- item two'].join('\n');
    const d = doc([...fillers(9), nested], config('avoid'));
    expect(pagesOf(d, 'item one', 'nested a', 'item two')).toEqual([1, 1, 1]);
  });

  it('avoid: a list taller than an empty column is cut, and reported', () => {
    const long = (label: string) => `- ${label} ${Array.from({ length: 30 }, () => 'word').join(' ')}`;
    const tall = [long('first'), long('second'), long('third')].join('\n');
    const d = doc([...fillers(4), tall], config('avoid'));
    // Non-vacuous: the three items take more than the ten lines of a page.
    const lines = ['first', 'second', 'third'].reduce((n, t) => n + d.blocks.filter((b) => b.lines.some((l) => l.text.includes(t)) || false).length, 0);
    expect(lines).toBeGreaterThan(0);
    expect(blockWith(d, 'first').pageIndex).toBe(0);
    expect(splits(d)).toHaveLength(1);
  });

  describe('beside a figure the text above it cites', () => {
    // Two columns; the paragraph before the list cites a figure, which
    // takes the foot of its column once that line is placed.
    const figure: Resource = {
      id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'Figure f1.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 200 },
    };
    const two = (shortListSplit: CompositionRule): PostextConfig => ({
      page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
      bodyText: { shortListSplit },
    });
    const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
    const book = (n: number, lead: string, rule: CompositionRule): VDTDocument => buildDocument({
      markdown: [...Array.from({ length: n }, (_, i) => para(i)), lead, LIST, ...Array.from({ length: 6 }, (_, i) => para(50 + i))].join('\n\n'),
      resources: [figure],
    }, two(rule), createMeasurementCache());
    const columnsOf = (d: VDTDocument, ...texts: string[]): string[] =>
      texts.map((t) => { const b = blockWith(d, t); return `${b.pageIndex}:${b.columnIndex}`; });
    const figureAt = (d: VDTDocument): string => {
      const page = d.pages.find((p) => (p.floats ?? []).length > 0)!;
      return `${page.index}:${page.floats![0]!.columnIndex}`;
    };
    const PLAIN = 'As shown in :ref{id="f1"}, look for these.';
    const COLON = 'As shown in :ref{id="f1"}, look for these:';

    it('the figure yields the foot of the column that holds the list whole', () => {
      const cut = book(10, PLAIN, 'warn');
      expect(columnsOf(cut, 'item one', 'item two', 'item three')).toEqual(['0:0', '0:1', '0:1']);
      expect(figureAt(cut)).toBe('0:0');
      expect(splits(cut)).toHaveLength(1);
      const kept = book(10, PLAIN, 'avoid');
      expect(columnsOf(kept, 'look for these', 'item one', 'item two', 'item three')).toEqual(['0:0', '0:0', '0:0', '0:0']);
      expect(figureAt(kept)).toBe('0:1');
      expect(splits(kept)).toEqual([]);
    });

    it('the colon line that cites the figure moves on with the list, and the figure follows', () => {
      const cut = book(10, COLON, 'warn');
      expect(columnsOf(cut, 'look for these', 'item one', 'item two')).toEqual(['0:0', '0:0', '0:1']);
      expect(splits(cut)).toHaveLength(1);
      const kept = book(10, COLON, 'avoid');
      expect(columnsOf(kept, 'look for these', 'item one', 'item two', 'item three')).toEqual(['0:1', '0:1', '0:1', '0:1']);
      expect(figureAt(kept)).toBe('0:1');
      expect(splits(kept)).toEqual([]);
    });

    it('a figure the column cannot hold under the colon line takes nothing from the list', () => {
      // The figure goes to the head of the next column either way: the
      // list stays under its colon line, as without the rule.
      for (const rule of ['warn', 'avoid'] as const) {
        const d = book(12, COLON, rule);
        expect(columnsOf(d, 'look for these', 'item one', 'item three'), rule).toEqual(['0:0', '0:0', '0:0']);
        expect(figureAt(d), rule).toBe('0:1');
      }
    });
  });

  it('resolves and strips its two settings', () => {
    expect(resolveBodyTextConfig({}).shortListSplit).toBe('allow');
    expect(resolveBodyTextConfig({}).shortListMaxItems).toBe(3);
    expect(resolveBodyTextConfig({ shortListSplit: 'avoid', shortListMaxItems: 5 })).toMatchObject({ shortListSplit: 'avoid', shortListMaxItems: 5 });
    // An unknown level and a count that is no whole number of items read as the defaults.
    expect(resolveBodyTextConfig({ shortListSplit: 'never' as CompositionRule, shortListMaxItems: 0 })).toMatchObject({ shortListSplit: 'allow', shortListMaxItems: 3 });
    expect(stripBodyTextDefaults({ shortListSplit: 'allow', shortListMaxItems: 3 })).toBeUndefined();
    expect(stripBodyTextDefaults({ shortListSplit: 'warn', shortListMaxItems: 2 })).toEqual({ shortListSplit: 'warn', shortListMaxItems: 2 });
    expect(collectConfigWarnings({ bodyText: { shortListSplit: 'never' as CompositionRule } })).toContainEqual({
      kind: 'unknownConfigValue', path: 'bodyText.shortListSplit', value: 'never', used: 'allow',
    });
  });
});
