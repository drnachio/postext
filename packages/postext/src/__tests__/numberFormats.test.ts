import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { parseMarkdown } from '../parse';
import { computeHeadingContext, computeResourceNumbering } from '../pipeline/resourceNumbering';
import { resolveOrderedListsConfig, stripOrderedListsDefaults } from '../defaults/orderedLists';
import { resolvePageConfig, stripPageDefaults } from '../defaults/page';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { collectConfigWarnings } from '../configWarnings';
import { stripConfigDefaults } from '../defaults';
import { resolveAllConfig } from '../pipeline/config';
import { formatNumeral, parseNumberFormat, parseTemplate, type NumeralStyle } from '../numbering';
import type { PostextConfig, Resource, ResourceType } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const base = (over: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(200), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  ...over,
});

const LIST = '1. one\n2. two\n3. three\n4. four';
const listNumbers = (config: PostextConfig, md = LIST): string[] =>
  buildDocument({ markdown: md }, config).blocks
    .filter((b) => b.type === 'listItem')
    .map((b) => (b.bulletText ?? '').replace(/[.)]\s*$/, ''));

// EF-12: the three numbering vocabularies — lists (`arabic`), page labels
// (`decimal`, `lower-roman`), resource counters (`roman-lower`) — each accept
// the others' spellings instead of printing "undefined".
describe('list numberFormat', () => {
  it('accepts the page and resource spellings and the template tokens', () => {
    expect(listNumbers(base({ orderedLists: { numberFormat: 'decimal' as never } }))).toEqual(['1', '2', '3', '4']);
    expect(listNumbers(base({ orderedLists: { numberFormat: 'roman-lower' as never } }))).toEqual(['i', 'ii', 'iii', 'iv']);
    expect(listNumbers(base({ orderedLists: { numberFormat: 'alpha-upper' as never } }))).toEqual(['A', 'B', 'C', 'D']);
    expect(listNumbers(base({ orderedLists: { numberFormat: 'I' as never } }))).toEqual(['I', 'II', 'III', 'IV']);
    expect(listNumbers(base({ orderedLists: { numberFormat: 'lower-latin' as never } }))).toEqual(['a', 'b', 'c', 'd']);
    expect(listNumbers(base({ orderedLists: { levels: [{ level: 1, numberFormat: 'Upper-Roman' as never }] } }))).toEqual(['I', 'II', 'III', 'IV']);
  });

  it('numbers an unknown format in arabic and reports it', () => {
    const config = base({ orderedLists: { numberFormat: 'bogus' as never, levels: [{ level: 2, numberFormat: 'roman' as never }] } });
    expect(listNumbers(config)).toEqual(['1', '2', '3', '4']);
    const doc = buildDocument({ markdown: LIST }, config);
    expect(doc.configWarnings).toEqual([
      { kind: 'unknownNumberFormat', path: 'orderedLists.numberFormat', value: 'bogus', used: 'arabic' },
      { kind: 'unknownNumberFormat', path: 'orderedLists.levels[0].numberFormat', value: 'roman', used: 'arabic' },
    ]);
  });

  it('resolves to the canonical list spelling and strips an alias of the default', () => {
    const r = resolveOrderedListsConfig({ numberFormat: 'decimal' as never, levels: [{ level: 2, numberFormat: 'roman-lower' as never }] }, resolveBodyTextConfig(undefined));
    expect(r.numberFormat).toBe('arabic');
    expect(r.levels[1]!.numberFormat).toBe('lower-roman');
    expect(stripOrderedListsDefaults({ numberFormat: 'decimal' as never })).toBeUndefined();
    expect(stripOrderedListsDefaults({ numberFormat: 'roman-upper' as never })).toEqual({ numberFormat: 'roman-upper' });
    const stripped = stripConfigDefaults({ orderedLists: { numberFormat: 'decimal' as never }, page: { pageNumbering: { format: 'arabic' as never } } });
    expect(stripped.orderedLists).toBeUndefined();
    expect(stripped.page).toBeUndefined();
    const resolved = resolveAllConfig({ orderedLists: { numberFormat: 'decimal' as never }, page: { pageNumbering: { format: 'roman-lower' as never } } });
    expect(resolved.orderedLists.numberFormat).toBe('arabic');
    expect(resolved.page.pageNumbering.format).toBe('lower-roman');
  });
});

describe('page numbering format', () => {
  const labels = (config: PostextConfig, md = '# A\n\n:::pagebreak\n\n# B\n\n:::pagebreak\n\n# C'): string[] =>
    buildDocument({ markdown: md }, config).pages.map((p) => p.pageLabel);

  it('accepts the list and resource spellings', () => {
    expect(labels(base({ page: { ...base().page, pageNumbering: { format: 'roman-lower' as never } } }))).toEqual(['i', 'ii', 'iii']);
    expect(labels(base({ page: { ...base().page, pageNumbering: { format: 'arabic' as never, startAt: 7 } } }))).toEqual(['7', '8', '9']);
    expect(resolvePageConfig({ pageNumbering: { format: 'alpha-upper' as never } }).pageNumbering.format).toBe('upper-alpha');
    expect(stripPageDefaults({ pageNumbering: { format: 'arabic' as never } })).toBeUndefined();
  });

  it('accepts them in a `:::numbering` directive too', () => {
    const md = '# A\n\n:::pagebreak\n\n:::numbering{format="roman-upper" startAt=1}\n\n# B\n\n:::pagebreak\n\n# C';
    expect(labels(base(), md)).toEqual(['1', 'I', 'II']);
  });

  it('never prints "undefined" for an unknown format', () => {
    const doc = buildDocument({ markdown: '# A' }, base({ page: { ...base().page, pageNumbering: { format: 'roman' as never } } }));
    expect(doc.pages[0]!.pageLabel).toBe('1');
    expect(doc.configWarnings).toEqual([{ kind: 'unknownNumberFormat', path: 'page.pageNumbering.format', value: 'roman', used: 'decimal' }]);
    expect(formatNumeral(3, 'bogus' as NumeralStyle)).toBe('3');
  });
});

describe('resource counterFormat', () => {
  const resource: Resource = {
    id: 'a', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'a.png', format: 'png', width: 1, height: 1 },
  };
  const type = (counterFormat: string): ResourceType => ({
    id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never',
    counterFormat: counterFormat as ResourceType['counterFormat'], captionPrefix: 'Figure',
  });
  const numberOf = (counterFormat: string): string | undefined => {
    const blocks = parseMarkdown('::resource{id="a"}');
    return computeResourceNumbering(blocks, [type(counterFormat)], [resource], computeHeadingContext(blocks)).a?.number;
  };

  it('accepts the page and list spellings', () => {
    expect(numberOf('lower-roman')).toBe('i');
    expect(numberOf('upper-alpha')).toBe('A');
    expect(numberOf('arabic')).toBe('1');
    expect(numberOf('bogus')).toBe('1');
  });

  it('reports an unknown one', () => {
    expect(collectConfigWarnings({ resourceTypes: [type('decimal'), { ...type('roman'), id: 'plate' }] })).toEqual([
      { kind: 'unknownNumberFormat', path: 'resourceTypes[1].counterFormat', value: 'roman', used: 'decimal' },
    ]);
  });
});

describe('parseNumberFormat', () => {
  it('maps every spelling to one numeral style', () => {
    const cases: Array<[string, string | undefined]> = [
      ['decimal', 'decimal'], ['arabic', 'decimal'], ['1', 'decimal'], ['DECIMAL', 'decimal'],
      ['lower-roman', 'lower-roman'], ['roman-lower', 'lower-roman'], ['i', 'lower-roman'],
      ['upper-roman', 'upper-roman'], ['roman-upper', 'upper-roman'], ['I', 'upper-roman'],
      ['lower-alpha', 'lower-alpha'], ['alpha-lower', 'lower-alpha'], ['lower-latin', 'lower-alpha'], ['a', 'lower-alpha'],
      ['upper-alpha', 'upper-alpha'], ['alpha-upper', 'upper-alpha'], ['upper-latin', 'upper-alpha'], ['A', 'upper-alpha'],
      [' lower-roman ', 'lower-roman'],
      ['roman', undefined], ['01', undefined], ['', undefined], ['constructor', undefined], ['toString', undefined],
    ];
    for (const [input, out] of cases) expect([input, parseNumberFormat(input)]).toEqual([input, out]);
    expect(parseNumberFormat(undefined)).toBeUndefined();
    expect(parseNumberFormat(3)).toBeUndefined();
  });
});

describe('heading template tokens', () => {
  it('take the format-field spellings as well as their own', () => {
    const styleOf = (tpl: string) => parseTemplate(tpl).find((t) => t.kind === 'counter');
    expect(styleOf('{1:roman-upper}')).toMatchObject({ style: 'upper-roman' });
    expect(styleOf('{1:lower-latin}')).toMatchObject({ style: 'lower-alpha' });
    expect(styleOf('{1:arabic}')).toMatchObject({ style: 'decimal' });
    expect(styleOf('{1:01}')).toMatchObject({ style: 'decimal-02' });
    expect(styleOf('{1:I}')).toMatchObject({ style: 'upper-roman' });
    expect(styleOf('{1:bogus}')).toMatchObject({ style: 'decimal' });
    expect(styleOf('{1:constructor}')).toMatchObject({ style: 'decimal' });
  });
});
