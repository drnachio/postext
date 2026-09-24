import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDocument } from 'postext';
import { computeWarnings } from './compute';
import type { WarningPayload } from './types';

function kinds(markdown: string, config: PostextConfig = {}): WarningPayload['kind'][] {
  return computeWarnings({ markdown, config, doc: null }).map((w) => w.payload.kind);
}

function find<K extends WarningPayload['kind']>(
  markdown: string,
  kind: K,
  config: PostextConfig = {},
) {
  return computeWarnings({ markdown, config, doc: null }).filter(
    (w): w is typeof w & { payload: Extract<WarningPayload, { kind: K }> } => w.payload.kind === kind,
  );
}

describe('fenced-container warnings', () => {
  it('does not flag known containers as unknown directives', () => {
    const md = [
      '# Title',
      '',
      ':::callout{type="note"}',
      'Inside.',
      ':::',
      '',
      ':::paragraphs{style="biblio"}',
      'Entry.',
      ':::',
      '',
      ':::part',
      'Part.',
      ':::',
      '',
      ':::pagebreak',
    ].join('\n');
    const config: PostextConfig = { paragraphStyles: [{ id: 'biblio' }] };
    expect(kinds(md, config)).not.toContain('unknownDirective');
  });

  it('still flags directive names the parser does not know', () => {
    const found = find(':::banana\ntext\n:::', 'unknownDirective');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.name).toBe('banana');
  });

  it('reports an unclosed container pointing at its opening fence', () => {
    const md = 'Intro.\n\n:::callout{type="tip"}\nStill open.';
    const found = find(md, 'unclosedContainer');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.name).toBe('callout');
    expect(found[0]!.sourceStart).toBe(md.indexOf(':::callout'));
    expect(found[0]!.line).toBe(3);
  });

  it('reports a paragraphs container whose style id is not configured', () => {
    const md = ':::paragraphs{style="missing"}\nEntry.\n:::';
    const found = find(md, 'unknownParagraphStyle', { paragraphStyles: [{ id: 'biblio' }] });
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.style).toBe('missing');
    expect(found[0]!.sourceStart).toBe(0);
    expect(kinds(md, { paragraphStyles: [{ id: 'missing' }] })).not.toContain('unknownParagraphStyle');
  });

  it('reports an unknown callout type only once callout styles are configured', () => {
    const md = ':::callout{type="danger"}\nText.\n:::';
    expect(kinds(md)).not.toContain('unknownCalloutType');
    const withStyles = { calloutStyles: [{ id: 'note' }] } as PostextConfig;
    const found = find(md, 'unknownCalloutType', withStyles);
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.type).toBe('danger');
    const known = { calloutStyles: [{ id: 'danger' }] } as PostextConfig;
    expect(kinds(md, known)).not.toContain('unknownCalloutType');
  });
});

describe('chip warnings', () => {
  it('flags a chip style no style declares, the built-in `chip` style included', () => {
    const md = 'Bank :chip[a] :chip[b]{style="chip"} :chip[c]{style="nope"}.';
    const found = find(md, 'unknownChipStyle');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.style).toBe('nope');
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe(':chip[c]{style="nope"}');
    expect(kinds(md, { chipStyles: [{ id: 'nope' }] })).toContain('unknownChipStyle');
    expect(kinds(':chip[c]{style="nope"}', { chipStyles: [{ id: 'nope' }] })).not.toContain('unknownChipStyle');
  });

  it('flags chips taller than the line pitch once per style', () => {
    const chip = (styleId: string, ascent: number, descent: number) => ({
      kind: 'chip', text: '', width: 10,
      chip: { styleId, runs: [], marginLeft: 0, marginRight: 0, boxWidth: 10, ascent, descent, paddingX: 0, borderWidth: 0, borderRadius: 0 },
    });
    const line = (segments: unknown[]) => ({ text: '', bbox: { x: 0, y: 0, width: 100, height: 20 }, baseline: 16, hyphenated: false, segments, sourceStart: 0, sourceEnd: 5 });
    const doc = {
      pages: [],
      warnings: [],
      config: { page: { dpi: 72 } },
      blocks: [{ sourceStart: 0, sourceEnd: 5, lines: [line([chip('tall', 16, 6), chip('tall', 16, 6), chip('fits', 14, 5)])] }],
    } as unknown as VDTDocument;
    const found = computeWarnings({ markdown: 'x', config: {}, doc }).filter((w) => w.payload.kind === 'chipOverlap');
    expect(found.map((w) => w.payload)).toEqual([{ kind: 'chipOverlap', style: 'tall', overlapPt: 2 }]);
  });
});

describe('header/footer placeholder warnings', () => {
  const header = (content: string): PostextConfig => ({
    header: {
      elements: [
        {
          kind: 'text',
          id: 'text1',
          content,
          fontSize: { value: 8, unit: 'pt' },
          overflow: 'wrap',
          placement: { anchor: { to: 'container', edge: 'bottom' } },
        },
      ],
    },
  });

  it('flags names outside the engine allow-list', () => {
    const found = find('', 'headerFooterUnknownPlaceholder', header('{bogus} {pageNumber}'));
    expect(found.map((w) => w.payload.name)).toEqual(['bogus']);
  });

  it('accepts the open-ended attr namespace', () => {
    expect(kinds('', header('{attr.edition} — {chapterTitle}'))).not.toContain(
      'headerFooterUnknownPlaceholder',
    );
  });
});

describe('design slot placeholder warnings', () => {
  const text = (content: string) => ({
    kind: 'text' as const,
    id: 'text1',
    content,
    fontSize: { value: 8, unit: 'pt' as const },
    overflow: 'wrap' as const,
    placement: { anchor: { to: 'container' as const, edge: 'top' as const } },
  });

  it('validates the part opener with the part placeholder set', () => {
    const config: PostextConfig = {
      parts: { design: { elements: [text('{partNumber} · {titleText} · {number} {bogus}')] } },
    };
    const found = find('', 'headerFooterUnknownPlaceholder', config);
    expect(found.map((w) => [w.payload.slot, w.payload.name])).toEqual([['part', 'bogus']]);
  });

  it('keeps the heading-only names out of headers', () => {
    const config: PostextConfig = { header: { elements: [text('{titleText} {partTitle}')] } };
    const found = find('', 'headerFooterUnknownPlaceholder', config);
    expect(found.map((w) => w.payload.name)).toEqual(['titleText']);
  });

  it('tags heading advanced designs with their level', () => {
    const config: PostextConfig = {
      headings: {
        levels: [{ level: 2, advancedDesign: { enabled: true, slot: { elements: [text('{titleText} {nope}')] } } }],
      },
    };
    const found = find('', 'headerFooterUnknownPlaceholder', config);
    expect(found.map((w) => [w.payload.slot, w.payload.level, w.payload.name])).toEqual([['heading', 2, 'nope']]);
  });

  it('checks anchors inside the part opener', () => {
    const config: PostextConfig = {
      parts: {
        design: {
          elements: [{ ...text('{titleText}'), placement: { anchor: { to: '#ghost', edge: 'below' } } }],
        },
      },
    };
    const found = find('', 'designDanglingAnchor', config);
    expect(found.map((w) => [w.payload.slot, w.payload.referencedId])).toEqual([['part', 'ghost']]);
  });
});

describe('chapter attribution', () => {
  it('maps located warnings to chapters and flags ignored front matter', async () => {
    const { composeBook } = await import('../book/compose');
    const { newChapter } = await import('../book/chapterOps');
    const chapters = [
      newChapter('a', 'A', '# A\n\ntext', 1),
      newChapter('b', 'B', '---\ntitle: x\n---\n# B\n\n:::bogus\nunclosed', 1),
    ];
    const book = composeBook(chapters);
    const warnings = computeWarnings({
      markdown: book.markdown,
      config: {},
      doc: null,
      book,
      chapterTitles: new Map(chapters.map((c) => [c.id, c.title])),
    });
    const fm = warnings.find((w) => w.payload.kind === 'chapterFrontmatterIgnored');
    expect(fm?.chapterId).toBe('b');
    expect(fm?.payload).toEqual({ kind: 'chapterFrontmatterIgnored', chapterTitle: 'B' });
    const located = warnings.filter((w) => w.sourceStart !== undefined && w.chapterId === 'b' && w.payload.kind !== 'chapterFrontmatterIgnored');
    expect(located.length).toBeGreaterThan(0);
    for (const w of located) {
      expect(w.chapterIndex).toBe(1);
      expect(w.chapterLine).toBeGreaterThanOrEqual(1);
      expect(w.chapterStart).toBeLessThanOrEqual(chapters[1]!.markdown.length);
    }
  });
});

describe(':::space warnings', () => {
  it('accepts the directive with or without a valid lines value', () => {
    const md = 'A\n\n:::space\n\nB\n\n:::space{lines=2}\n\nC\n\n:::space{lines=0.5}\n\nD';
    expect(kinds(md)).not.toContain('unknownDirective');
    expect(kinds(md)).not.toContain('spaceInvalidLines');
  });

  it('flags a lines value that is not a number in (0, 20]', () => {
    for (const bad of ['0', '-1', 'two', '21']) {
      const hits = find(`A\n\n:::space{lines=${bad}}\n\nB`, 'spaceInvalidLines');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.payload.value).toBe(bad);
    }
  });
});
