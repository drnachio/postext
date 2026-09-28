import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { buildBundle } from '../bundle';
import { contentOutline } from '../pipeline/continuation';
import { computeOutline, hasIndexDirective, indexOutline, outlineFromDoc, tocOutline } from '../pipeline/outline';
import { expandIndexDirectives, rangeEnd } from '../pipeline/indexDirective';
import { parseMarkdown } from '../parse';
import { resolveAllConfig } from '../pipeline/config';
import { stripIndexDefaults } from '../defaults/indexConfig';
import type { OutlineEntry, PostextConfig } from '../types';
import type { ContentBlock } from '../parse';
import type { VDTDocument } from '../vdt';

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

const filler = (n: number, word = 'Paragraph') =>
  Array.from({ length: n }, (_, i) =>
    `${word} ${i} with enough words to consume vertical space and force the column and page to overflow onto following pages.`,
  ).join('\n\n');

const base: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(300),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'single' },
};

/** The printed entries of a document's index: every line of the blocks
 *  the `:::index` expanded into. */
const indexLines = (doc: VDTDocument): string[] =>
  doc.blocks.filter((b) => b.sourceStart !== undefined && b.lines.length > 0 && doc.blocks.indexOf(b) >= 0)
    .filter((b) => (b as { indexEntry?: unknown }).indexEntry !== undefined || b.lines.some((l) => l.segments?.some((s) => s.pageLink !== undefined)))
    .flatMap((b) => b.lines.map((l) => l.text));

/** The entry blocks of an expansion, as text. */
const expanded = (blocks: ContentBlock[]): string[] => blocks.filter((b) => b.index).map((b) => `${'  '.repeat(b.index!.level)}${b.index!.group ? `[${b.index!.group}] ` : ''}${b.text}`);

const markEntry = (path: string[], pageIndex: number, extra: Partial<NonNullable<OutlineEntry['indexMark']>> = {}, label = String(pageIndex + 1)): OutlineEntry => ({
  kind: 'indexMark', level: 0, title: path.join('!'), number: '', numbered: false, listed: false,
  indexMark: { index: '', path, sourceStart: pageIndex * 100 + path.length, ...extra },
  pageIndex, pageLabel: label, pageFormat: 'decimal',
});

describe('index marks: parsing', () => {
  it('takes marks out of the text and keeps every source offset', () => {
    const md = 'The :index[heart]{main} beats.:index{term="Pulse!radial"} Next *word*.';
    const [b] = parseMarkdown(md);
    expect(b!.text).toBe('The heart beats. Next word.');
    // Each plain character still points at itself in the source.
    for (let i = 0; i < b!.text.length; i++) {
      const at = b!.sourceMap[i]!;
      expect(md[at]).toBe(b!.text[i]);
    }
    expect(b!.indexMarks!.map((m) => [m.path, m.main ?? false, m.attach, md[m.anchor]])).toEqual([
      [['heart'], true, 'after', 'h'],
      [['Pulse', 'radial'], false, 'before', '.'],
    ]);
  });

  it('drops a line holding marks alone, so the paragraph stays one', () => {
    const md = 'First line of text\n:index{term="Alpha"}  :index{term="Beta" sub="gamma"}\nsecond line.\n\n:index{term="Delta"}\n\nNext paragraph.';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.text)).toEqual(['First line of text second line.', 'Next paragraph.']);
    expect(blocks[0]!.indexMarks!.map((m) => m.path.join('!'))).toEqual(['Alpha', 'Beta!gamma']);
    // The lone mark between paragraphs belongs to the text after it.
    expect(blocks[1]!.indexMarks!.map((m) => [m.path.join('!'), md[m.anchor]])).toEqual([['Delta', 'N']]);
  });

  it('leaves marks in inline code, escaped marks and the directive alone', () => {
    const blocks = parseMarkdown('Write `:index{term="x"}` or \\:index{term="y"}.\n\n:::index{index="names"}');
    expect(blocks[0]!.indexMarks).toBeUndefined();
    expect(blocks[1]!.type).toBe('directive');
    expect(blocks[1]!.directiveName).toBe('index');
    expect(hasIndexDirective(blocks)).toBe(true);
  });

  it('reads the attributes: sort, see, see also, range, named index', () => {
    const [b] = parseMarkdown(':index[St. Louis]{sort="Saint Louis"} :index{term="Cardiac insufficiency" see="Heart failure"} :index{term="Oedema" seealso="Heart failure" index="subjects"} :index{term="Anaemia" range="start"} :index{}');
    expect(b!.indexMarks!.map((m) => ({ ...m, sourceStart: 0, sourceEnd: 0, anchor: 0 }))).toEqual([
      { index: '', path: ['St. Louis'], sort: 'Saint Louis', sourceStart: 0, sourceEnd: 0, anchor: 0, attach: 'after' },
      { index: '', path: ['Cardiac insufficiency'], see: 'Heart failure', sourceStart: 0, sourceEnd: 0, anchor: 0, attach: 'before' },
      { index: 'subjects', path: ['Oedema'], seeAlso: 'Heart failure', sourceStart: 0, sourceEnd: 0, anchor: 0, attach: 'before' },
      { index: '', path: ['Anaemia'], range: 'start', sourceStart: 0, sourceEnd: 0, anchor: 0, attach: 'before' },
      { index: '', path: [], sourceStart: 0, sourceEnd: 0, anchor: 0, attach: 'before' },
    ]);
  });

  it('keeps headings, lists and quotes marked', () => {
    const blocks = parseMarkdown('# The heart :index{term="Heart" main}\n\n- a :index[valve]\n\n> quoted :index{term="Q"}');
    expect(blocks.map((b) => [b.type, b.text, b.indexMarks?.map((m) => m.path[0])])).toEqual([
      ['heading', 'The heart', ['Heart']],
      ['listItem', 'a valve', ['valve']],
      ['blockquote', 'quoted', ['Q']],
    ]);
  });
});

describe('index: building the entries', () => {
  const resolved = resolveAllConfig(base);
  const directive = parseMarkdown(':::index');

  it('sorts, groups by letter, merges pages and sets cross-references', () => {
    const outline = [
      markEntry(['heart'], 4), markEntry(['heart'], 5), markEntry(['heart'], 6), markEntry(['heart'], 9, { main: true }),
      markEntry(['Árbol'], 1), markEntry(['apple'], 2),
      markEntry(['heart', 'valves'], 5), markEntry(['heart', 'failure'], 7),
      markEntry(['Cardiac insufficiency'], 3, { see: 'heart!failure' }),
      markEntry(['heart'], 3, { seeAlso: 'Oedema' }),
      markEntry(['3D imaging'], 8), markEntry(['#hashtag'], 8),
    ];
    const { blocks, warnings } = expandIndexDirectives(directive, outline, resolved);
    expect(expanded(blocks)).toEqual([
      '[Symbols] #hashtag, 9',
      '[0–9] 3D imaging, 9',
      '[A] apple, 3',
      'Árbol, 2',
      '[C] Cardiac insufficiency. See heart: failure',
      '[H] heart, 4–7, 10. See also Oedema', // the seealso mark's page 4 counts (#167)
      '  failure, 8',
      '  valves, 6',
    ]);
    // The main page is bold; the cross-reference label italic.
    const heart = blocks.find((b) => b.text.startsWith('heart'))!;
    expect(heart.spans.find((s) => s.text === '10')!.bold).toBe(true);
    expect(heart.spans.find((s) => s.text === 'See also')!.italic).toBe(true);
    expect(warnings).toMatchObject([{ kind: 'indexSeeUnknown', target: 'Oedema', index: '' }]);
  });

  it('pairs ranges and reports the unpaired ones', () => {
    const outline = [
      markEntry(['anaemia'], 10, { range: 'start' }), markEntry(['anaemia'], 13, { range: 'end' }),
      markEntry(['anaemia'], 11), markEntry(['bleeding'], 20, { range: 'start' }), markEntry(['clotting'], 22, { range: 'end' }),
    ];
    const { blocks, warnings } = expandIndexDirectives(directive, outline, resolved);
    expect(expanded(blocks)).toEqual(['[A] anaemia, 11–14', '[B] bleeding, 21', '[C] clotting, 23']);
    expect(warnings.map((w) => w.kind === 'indexRangeUnclosed' && [w.term, w.missing])).toEqual([['clotting', 'start'], ['bleeding', 'end']]);
  });

  it('files the Spanish ñ under a letter of its own and accents under their letter', () => {
    const es = resolveAllConfig({ ...base, locale: 'es' });
    const outline = [markEntry(['ñandú'], 1), markEntry(['nube'], 2), markEntry(['óvalo'], 3), markEntry(['oso'], 4), markEntry(['Oca'], 5)];
    expect(expanded(expandIndexDirectives(directive, outline, es).blocks)).toEqual([
      '[N] nube, 3', '[Ñ] ñandú, 2', '[O] Oca, 6', 'oso, 5', 'óvalo, 4',
    ]);
  });

  it('prints a named index on its own and uses localised labels', () => {
    const es = resolveAllConfig({ ...base, locale: 'es', index: { groups: { enabled: false } } });
    const outline = [markEntry(['Harvey, William'], 1, { index: 'names' }), markEntry(['corazón'], 1, { see: 'Harvey, William' })];
    const names = parseMarkdown(':::index{index="names"}');
    expect(expanded(expandIndexDirectives(names, outline, es).blocks)).toEqual(['Harvey, William, 2']);
    expect(expanded(expandIndexDirectives(directive, outline, es).blocks)).toEqual(['corazón. Véase Harvey, William']);
  });

  it('abbreviates ranges the Chicago way', () => {
    const pairs = [['3', '10'], ['71', '72'], ['96', '117'], ['100', '104'], ['1100', '1113'], ['101', '108'], ['1103', '1104'], ['321', '328'], ['498', '532'], ['1087', '1089'], ['1496', '1500'], ['11564', '11615'], ['xii', 'xv']];
    expect(pairs.map(([a, b]) => rangeEnd(a!, b!, 'chicago'))).toEqual(['10', '72', '117', '104', '1113', '8', '4', '28', '532', '89', '500', '615', 'xv']);
    expect(rangeEnd('321', '328', 'full')).toBe('328');
  });

  it('strips its defaults', () => {
    expect(stripIndexDefaults({ separator: ', ', mergeRanges: true, groups: { enabled: true }, main: { bold: true } })).toBeUndefined();
    expect(stripIndexDefaults({ rangeFormat: 'chicago', groups: { enabled: false } })).toEqual({ rangeFormat: 'chicago', groups: { enabled: false } });
  });
});

describe('index: page numbers that follow the text', () => {
  const md = (extra: number) => `# Chapter one

${filler(2 + extra * 10)}

The :index[heart]{main} pumps blood.:index{term="Circulation" range="start"}

${filler(30)}

The pulse:index{term="Pulse!radial"} is taken at the wrist.:index{term="Circulation" range="end"}

# Index

:::index`;

  it('lays a document out again until its index settles', () => {
    const doc = buildDocument({ markdown: md(0) }, base);
    const marks = doc.indexMarks!;
    expect(marks).toHaveLength(4);
    const page = (i: number) => doc.pages[marks[i]!.pageIndex]!.pageLabel;
    const lines = doc.blocks.flatMap((b) => b.lines.map((l) => l.text));
    expect(lines).toContain(`Circulation, ${page(1)}–${page(3)}`);
    expect(lines).toContain(`heart, ${page(0)}`);
    expect(lines).toContain('Pulse');
    expect(lines).toContain(`radial, ${page(2)}`);
    // Moving the text moves the page numbers.
    expect(Number(page(3))).toBeGreaterThan(Number(page(1)));
    const later = buildDocument({ markdown: md(3) }, base);
    const laterHeart = later.pages[later.indexMarks![0]!.pageIndex]!.pageLabel;
    expect(Number(laterHeart)).toBeGreaterThan(Number(page(0)));
    expect(later.blocks.flatMap((b) => b.lines.map((l) => l.text))).toContain(`heart, ${laterHeart}`);
    // The page numbers link to their pages.
    const heartLine = later.blocks.flatMap((b) => b.lines).find((l) => l.text === `heart, ${laterHeart}`)!;
    expect(heartLine.segments!.find((s) => s.text === laterHeart)!.pageLink).toBe(later.indexMarks![0]!.pageIndex);
  });

  it('outlines marks apart from headings', () => {
    const blocks = parseMarkdown(md(0));
    const outline = computeOutline(blocks, resolveAllConfig(base));
    expect(tocOutline(outline).map((e) => e.title)).toEqual(['Chapter one', 'Index']);
    expect(indexOutline(outline).map((e) => e.title)).toEqual(['heart', 'Circulation', 'Pulse!radial', 'Circulation']);
    const doc = buildDocument({ markdown: md(0) }, base);
    const placed = outlineFromDoc(doc, outline);
    expect(indexOutline(placed).every((e) => e.pageLabel !== undefined)).toBe(true);
  });

  it('collects every chapter of a book into the index chapter', () => {
    const chapters = [
      { markdown: `# One\n\nThe :index[heart] and more.\n\n${filler(30)}` },
      { markdown: `# Two\n\n${filler(30)}\n\nAgain the heart:index{term="heart"} and the :index[lungs].` },
      { markdown: '# Index\n\n:::index' },
    ];
    const docs = buildBundle({ chapters, config: base, resources: [] });
    const where = (d: number, i = 0) => docs[d]!.pages[docs[d]!.indexMarks![i]!.pageIndex]!.pageLabel;
    const lines = docs[2]!.blocks.flatMap((b) => b.lines.map((l) => l.text));
    expect(lines).toContain(`heart, ${where(0)}, ${where(1)}`);
    expect(lines).toContain(`lungs, ${where(1, 1)}`);
    expect(contentOutline(chapters[2]!, base).hasIndex).toBe(true);
  });
});

// Keep the helper referenced (used while debugging layouts).
void indexLines;

describe('index: the first group (#166)', () => {
  it('takes no space above it, and later groups do', () => {
    const outline = [markEntry(['apple'], 1), markEntry(['banana'], 2)];
    const { blocks } = expandIndexDirectives(parseMarkdown(':::index'), outline, resolveAllConfig(base));
    expect(blocks.map((b) => [b.index!.group, b.index!.groupStart ?? false])).toEqual([['A', false], ['B', true]]);
  });

  it('starts level in both columns under a page-span opener', () => {
    const config: PostextConfig = {
      ...base,
      headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
      headingStyles: [{ id: 'index', numbered: false, layout: { layoutType: 'double', gutterWidth: pt(12) } }],
      index: { groups: { marginTop: pt(7.5) } },
    };
    const letters = 'abcdefghijklmnopqrstuvw'.split('');
    const marks = letters.map((l) => `:index{term="${l}${l}${l} term" }`).join(' ');
    const doc = buildDocument({ markdown: `# Text\n\nSome words ${marks}.\n\n# Index {style="index"}\n\n:::index` }, config);
    const indexPage = doc.blocks.find((b) => b.lines.some((l) => l.text === 'A'))!.pageIndex;
    const cols = doc.pages[indexPage]!.columns.filter((c) => c.blocks.some((b) => b.lines.length > 0 && b.type !== 'heading'));
    expect(cols.length).toBe(2);
    const firstLineY = (col: (typeof cols)[number]) => col.blocks.find((b) => b.type !== 'heading')!.bbox.y;
    expect(Math.abs(firstLineY(cols[0]!) - firstLineY(cols[1]!))).toBeLessThan(0.5);
  });
});

describe('index: marks in boxes and notes', () => {
  const pageOfText = (doc: VDTDocument, text: string): number =>
    doc.blocks.find((b) => b.lines.some((l) => l.text.includes(text)))!.pageIndex;

  it('takes the page of a callout line and of a footnote', () => {
    const markdown = `# Chapter

${filler(8)}

:::callout{title="Box"}
A boxed word:index{term="Boxed"} here.
:::

${filler(8)}

A cited line.[^n]

[^n]: The note names a term:index{term="Noted"} too.`;
    const doc = buildDocument({ markdown }, base);
    const byTerm = new Map(computeOutline(parseMarkdown(markdown), resolveAllConfig(base))
      .filter((e) => e.kind === 'indexMark').map((e) => [e.title, e.indexMark!.sourceStart]));
    const pageOf = (term: string) => doc.indexMarks!.find((m) => m.sourceStart === byTerm.get(term))!.pageIndex;
    expect(pageOf('Boxed')).toBe(pageOfText(doc, 'A boxed word'));
    expect(pageOf('Noted')).toBe(pageOfText(doc, 'The note names'));
    expect(pageOf('Noted')).toBeGreaterThan(pageOf('Boxed'));
  });
});

describe('index: seealso keeps its page (#167)', () => {
  it('lists the page of a seealso mark, not of a see mark', () => {
    const outline = [
      markEntry(['Punchcutting'], 0, { main: true, seeAlso: 'Matrices' }),
      markEntry(['Matrices'], 1),
      markEntry(['Punches'], 2, { see: 'Punchcutting' }),
    ];
    const { blocks } = expandIndexDirectives(parseMarkdown(':::index'), outline, resolveAllConfig(base));
    expect(expanded(blocks)).toEqual(['[M] Matrices, 2', '[P] Punchcutting, 1. See also Matrices', 'Punches. See Punchcutting']);
    expect(blocks[1]!.spans.find((s) => s.text === '1')!.bold).toBe(true);
  });
});
