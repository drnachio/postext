import { describe, expect, it } from 'vitest';
import { buildDocument, defaultResourceTypes } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { computeWarnings } from './compute.js';
import { warningCategory } from './categories.js';
import type { WarningPayload } from './types.js';
import type { ComposedBook } from '../book/types.js';

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

describe('composed-page warnings (#854)', () => {
  const config = { pageTemplates: [{ id: 'tema', frames: [{ name: 'texto', flow: true }, { name: 'caja' }, { name: 'nota', optional: true }] }] } as unknown as PostextConfig;

  it('lists unknown templates, unknown slots and empty frames from the source', () => {
    const md = '::::page{template="tema"}\nText.\n:::frame{slot="cja"}\nBox.\n:::\n::::\n\n::::page{template="otra"}\n::::';
    const unknownSlot = find(md, 'slotUnknown', config);
    expect(unknownSlot).toHaveLength(1);
    expect(unknownSlot[0]!.payload).toEqual({ kind: 'slotUnknown', template: 'tema', slot: 'cja', frame: 'texto', fenceIndex: 0 });
    expect(md.slice(unknownSlot[0]!.sourceStart, unknownSlot[0]!.sourceEnd)).toBe('cja');
    expect(find(md, 'slotEmpty', config).map((w) => w.payload.frame)).toEqual(['caja']);
    const unknown = find(md, 'templateUnknown', config);
    expect(unknown.map((w) => w.payload.template)).toEqual(['otra']);
    expect(unknown[0]!.line).toBe(8);
    for (const k of ['slotUnknown', 'slotEmpty', 'templateUnknown', 'pageFenceLength'] as const) expect(warningCategory(k)).toBe('markup');
  });

  it('lists a fence and a template that disagree about spreads, at the attribute (#861)', () => {
    const spread = { pageTemplates: [{ id: 'doble', spread: true, frames: [{ name: 'texto', flow: true }] }, { id: 'tema', frames: [{ name: 'texto', flow: true }] }] } as unknown as PostextConfig;
    const md = '::::page{template="tema" spread}\nText.\n::::\n\n::::page{template="doble"}\nText.\n::::\n\n::::page{template="doble" spread}\nText.\n::::';
    const found = find(md, 'spreadMismatch', spread);
    expect(found.map((w) => w.payload)).toEqual([
      { kind: 'spreadMismatch', template: 'tema', fenceIndex: 0, fence: true, templateSpread: false },
      { kind: 'spreadMismatch', template: 'doble', fenceIndex: 1, fence: false, templateSpread: true },
    ]);
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('spread');
    expect(md.slice(found[1]!.sourceStart, found[1]!.sourceEnd)).toBe('doble');
    expect(warningCategory('spreadMismatch')).toBe('markup');
  });

  it('reads a frame the layout could not fit off the laid-out document (#855)', () => {
    const md = '::::page{template="tema"}\n:::frame{slot="caja"}\nA long box.\n:::\n::::';
    const doc = {
      config: { page: { dpi: 96 } },
      warnings: [],
      contentWarnings: [
        {
          kind: 'frameOverflow', template: 'tema', frame: 'caja', fenceIndex: 0, overflowMm: 12.5, configPath: '/pageTemplates/0/frames/1', sourceStart: 48, sourceEnd: 59, pageIndex: 2,
          locale: 'ca', stepsTried: ['free', 'shrinkText'], scale: 0.9, proposals: [{ kind: 'raiseMax', path: '/pageTemplates/0/frames/1/maxHeight', value: { value: 64, unit: 'mm' } }],
        },
      ],
      pages: [],
      blocks: [],
      pageIndexOffset: 4,
    } as unknown as VDTDocument;
    const found = computeWarnings({ markdown: md, config, doc }).filter((w) => w.payload.kind === 'frameOverflow');
    expect(found.map((w) => w.payload)).toEqual([
      {
        kind: 'frameOverflow', template: 'tema', frame: 'caja', fenceIndex: 0, overflowMm: 12.5, page: 7, configPath: '/pageTemplates/0/frames/1',
        locale: 'ca', stepsTried: ['free', 'shrinkText'], scale: 0.9, proposals: [{ kind: 'raiseMax', path: '/pageTemplates/0/frames/1/maxHeight', value: { value: 64, unit: 'mm' } }],
      },
    ]);
    expect(found[0]!.line).toBe(3);
    expect(warningCategory('frameOverflow')).toBe('typesetting');
    // Nothing is read from the source alone: the overflow needs a layout.
    expect(kinds(md, config)).not.toContain('frameOverflow');
  });

  it('flags a composed page written with three colons', () => {
    expect(kinds(':::page{template="tema"}\n::panel\nA: Hi.\n:::', config)).toContain('pageFenceLength');
  });

  it('reports a page left open as an unclosed container', () => {
    const found = find('::::page{template="tema"}\nText.', 'unclosedContainer', config);
    expect(found.map((w) => w.payload.name)).toEqual(['composedPage']);
  });

  it('knows :::frame and :::figure', () => {
    expect(kinds(':::frame{slot="x"}\nA.\n:::\n\n:::figure{resource="m"}\n:::')).not.toContain('unknownDirective');
  });
});

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

  it('reports a :::columns flow it does not know (#634)', () => {
    const found = find(':::columns{count=2 flow="zigzag"}\nA.\n:::', 'columnsFlowUnknown');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.value).toBe('zigzag');
    expect(warningCategory('columnsFlowUnknown')).toBe('markup');
    expect(kinds(':::columns{count=2 flow="parallel" breaks="2"}\nA.\n\nB.\n:::')).not.toContain('columnsFlowUnknown');
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

  // EF-118: a chip taller than the line pitch is fine until a chip on the
  // line above or below stands in the way of its box.
  describe('chips that run into a chip on another line', () => {
    const chip = (styleId: string, ascent: number, descent: number, width = 10) => ({
      kind: 'chip', text: '', width,
      chip: { styleId, runs: [], marginLeft: 0, marginRight: 0, boxWidth: width, ascent, descent, paddingX: 0, borderWidth: 0, borderRadius: 0 },
    });
    const text = (width: number) => ({ kind: 'text', text: 'x', width });
    const space = (width: number) => ({ kind: 'space', text: ' ', width });
    // A line box 20 px tall at `y`, its baseline 16 px down.
    const line = (y: number, segments: unknown[], isLastLine = true) => ({
      text: '', bbox: { x: 0, y, width: 100, height: 20 }, baseline: y + 16, hyphenated: false, segments, sourceStart: 0, sourceEnd: 5, isLastLine,
    });
    const block = (lines: unknown[], textAlign = 'left') => ({ sourceStart: 0, sourceEnd: 5, textAlign, bbox: { x: 0, y: 0, width: 100, height: 200 }, lines });
    const doc = (blocks: unknown[]) => ({
      pages: [{ columns: [{ blocks }], floats: [], marginNotes: [] }],
      blocks,
      warnings: [],
      config: { page: { dpi: 72 } },
    }) as unknown as VDTDocument;
    const overlaps = (d: VDTDocument) =>
      computeWarnings({ markdown: 'x', config: {}, doc: d }).filter((w) => w.payload.kind === 'chipOverlap').map((w) => w.payload);

    it('does not flag a tall chip with no chip above or below it', () => {
      // 22 px of box on a 20 px pitch, alone in its paragraph.
      expect(overlaps(doc([block([line(0, [chip('tall', 16, 6), chip('tall', 16, 6)])])]))).toEqual([]);
    });

    it('does not flag tall chips on lines far enough apart (list items with space between them)', () => {
      expect(overlaps(doc([block([line(0, [chip('tall', 16, 6)])]), block([line(44, [chip('tall', 16, 6)])])]))).toEqual([]);
    });

    it('flags chips on consecutive lines whose boxes meet, once per style, with the overlap', () => {
      const d = doc([block([
        line(0, [chip('tall', 16, 6), chip('fits', 14, 5)]),
        line(20, [chip('tall', 16, 6)]),
        line(40, [chip('tall', 17, 6)]),
      ])]);
      // 0.72 pt per px at 72 dpi is 1: line 1 ends at 22, line 2 starts at
      // 20; line 2 ends at 42, line 3 starts at 39.
      expect(overlaps(d)).toEqual([{ kind: 'chipOverlap', style: 'tall', overlapPt: 3 }]);
    });

    it('does not flag chips on consecutive lines that stand apart across the line', () => {
      expect(overlaps(doc([block([line(0, [chip('tall', 16, 6)]), line(20, [text(50), chip('tall', 16, 6)])])]))).toEqual([]);
    });

    it('places the chips of a justified line where its spaces put them', () => {
      // Line 1 is justified: its one space widens to 80 px and pushes the
      // chip to the right end, over the chip of line 2.
      const justified = doc([block([
        line(0, [text(10), space(5), chip('tall', 16, 6)], false),
        line(20, [text(90), chip('tall', 16, 6)]),
      ], 'justify')]);
      expect(overlaps(justified)).toEqual([{ kind: 'chipOverlap', style: 'tall', overlapPt: 2 }]);
      // Set ragged, the chip of line 1 stays at the left.
      const ragged = doc([block([
        line(0, [text(10), space(5), chip('tall', 16, 6)], false),
        line(20, [text(90), chip('tall', 16, 6)]),
      ], 'left')]);
      expect(overlaps(ragged)).toEqual([]);
    });
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

  // EF-134: the design checks walked the running heads, the part opener and
  // the heading levels, not the heading styles, so a loop or a missing
  // `#id` in a style's design or section running heads was never listed.
  describe('heading styles (EF-134)', () => {
    const at = (id: string, to: string) => ({ ...text('{titleText}'), id, placement: { anchor: { to: `#${to}` as const, edge: 'below' as const } } });
    const styled: PostextConfig = {
      headingStyles: [
        {
          id: 'index',
          advancedDesign: { enabled: true, slot: { elements: [at('a', 'b'), at('b', 'a'), at('c', 'ghost')] } },
          header: { elements: [{ ...text('{chapterTitle} {nope}'), id: 'rh', placement: { anchor: { to: '#missing', edge: 'below' } } }] },
          footer: { elements: [{ ...text('{pageNumber}'), id: 'f1' }] },
        },
        // A design that is not switched on is not drawn: nothing to check.
        { id: 'off', advancedDesign: { enabled: false, slot: { elements: [at('x', 'y')] } } },
      ],
    };

    it('lists cyclic and dangling anchors in a style\'s design and running heads', () => {
      const cyclic = find('', 'designCyclicAnchor', styled);
      expect(cyclic.map((w) => [w.payload.slot, w.payload.styleId, w.payload.elementId]).sort()).toEqual([
        ['heading', 'index', 'a'],
        ['heading', 'index', 'b'],
      ]);
      const dangling = find('', 'designDanglingAnchor', styled);
      expect(dangling.map((w) => [w.payload.slot, w.payload.styleId, w.payload.elementId, w.payload.referencedId])).toEqual([
        ['heading', 'index', 'c', 'ghost'],
        ['header', 'index', 'rh', 'missing'],
      ]);
      // Distinct ids from the level and document checks.
      const ids = [...cyclic, ...dangling].map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => id.includes('style-index'))).toBe(true);
    });

    it('checks the placeholders of a style\'s slots with their own allow-lists', () => {
      const found = find('', 'headerFooterUnknownPlaceholder', styled);
      expect(found.map((w) => [w.payload.slot, w.payload.styleId, w.payload.name])).toEqual([['header', 'index', 'nope']]);
    });

    it('stays quiet when the design checks are off', () => {
      const config: PostextConfig = { ...styled, debug: { warnings: { designIssues: false } } };
      const warnings = computeWarnings({ markdown: '', config, doc: null });
      expect(warnings.some((w) => w.payload.kind === 'designCyclicAnchor' || w.payload.kind === 'designDanglingAnchor')).toBe(false);
    });

    // A cover style that prints the book's title and subtitle, as deep-sky's
    // does. With no laid-out document (the PDF view opened first), the check
    // read no metadata at all and listed both as missing.
    it('reads the metadata from the front matter when no document is laid out', () => {
      const cover: PostextConfig = {
        headingStyles: [{ id: 'cover', advancedDesign: { enabled: true, slot: { elements: [text('{title} · {subtitle} · {publishDate}')] } } }],
      };
      const missing = (markdown: string) =>
        find(markdown, 'headerFooterMetadataMissing', cover).filter((w) => w.payload.styleId !== undefined).map((w) => [w.payload.styleId, w.payload.name]);
      expect(missing('---\ntitle: Deep Sky\nsubtitle: Eight views\npublishDate: 2026-09-24\n---\n\n# Deep Sky {style="cover"}\n')).toEqual([]);
      expect(missing('---\ntitle: Deep Sky\n---\n\n# Deep Sky {style="cover"}\n')).toEqual([
        ['cover', 'subtitle'],
        ['cover', 'publishDate'],
      ]);
      expect(missing('# Deep Sky {style="cover"}\n').map(([, name]) => name)).toEqual(['title', 'subtitle', 'publishDate']);
    });

    // A later chapter has no front matter of its own: the book's metadata
    // (its first chapter's front matter) is what the engine prints.
    it('reads the book\'s metadata for a chapter laid out on its own', () => {
      const cover: PostextConfig = {
        headingStyles: [{ id: 'cover', advancedDesign: { enabled: true, slot: { elements: [text('{title} · {subtitle}')] } } }],
      };
      const markdown = '# Galaxies {style="cover"}\n';
      const book: ComposedBook = { markdown, metadata: { title: 'Deep Sky', subtitle: 'Eight views' }, segments: [], scope: { only: 'c6' } };
      const warnings = computeWarnings({ markdown, config: cover, doc: null, book });
      expect(warnings.filter((w) => w.payload.kind === 'headerFooterMetadataMissing')).toEqual([]);
    });
  });

  // #1014: a box style's design is checked as a heading style's is.
  describe('box style designs (#1014)', () => {
    const at = (id: string, to: string, content = '{titleText}') => ({ ...text(content), id, placement: { anchor: { to: `#${to}` as const, edge: 'below' as const } } });
    const config: PostextConfig = {
      calloutStyles: [
        { id: 'practice', design: { setsContent: true, slot: { elements: [at('a', 'b', '{boxText}'), at('b', 'a', '{boxText.2} {attr.picture}'), at('c', 'ghost', '{nope}')] } } },
        // A design switched off is not drawn: nothing to check.
        { id: 'off', design: { enabled: false, slot: { elements: [at('x', 'y', '{bogus}')] } } },
      ],
    };

    it('lists their cyclic and dangling anchors', () => {
      const cyclic = find('', 'designCyclicAnchor', config);
      expect(cyclic.map((w) => [w.payload.slot, w.payload.styleId, w.payload.elementId]).sort()).toEqual([
        ['box', 'practice', 'a'],
        ['box', 'practice', 'b'],
      ]);
      const dangling = find('', 'designDanglingAnchor', config);
      expect(dangling.map((w) => [w.payload.slot, w.payload.styleId, w.payload.elementId, w.payload.referencedId])).toEqual([
        ['box', 'practice', 'c', 'ghost'],
      ]);
      const ids = [...cyclic, ...dangling].map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('accepts the box content and the heading set in their texts', () => {
      const found = find('', 'headerFooterUnknownPlaceholder', config);
      expect(found.map((w) => [w.payload.slot, w.payload.styleId, w.payload.name])).toEqual([['box', 'practice', 'nope']]);
    });
  });

  // The other slots set with a part's placeholders: the blank verso after a
  // part page and the part rows of the contents.
  describe('part verso and contents part rows', () => {
    const at = (id: string, to: string, content = '{titleText}') => ({ ...text(content), id, placement: { anchor: { to: `#${to}` as const, edge: 'below' as const } } });
    const config: PostextConfig = {
      parts: { versoDesign: { elements: [at('v1', 'v2'), at('v2', 'v1')] } },
      toc: { parts: { design: { elements: [at('r1', 'ghost', '{number} {pageNumber} {bogus}')] } } },
    };

    it('lists their cyclic and dangling anchors', () => {
      const cyclic = find('', 'designCyclicAnchor', config);
      expect(cyclic.map((w) => [w.payload.slot, w.payload.configPath, w.payload.elementId]).sort()).toEqual([
        ['part', 'parts.versoDesign', 'v1'],
        ['part', 'parts.versoDesign', 'v2'],
      ]);
      const dangling = find('', 'designDanglingAnchor', config);
      expect(dangling.map((w) => [w.payload.configPath, w.payload.elementId, w.payload.referencedId])).toEqual([
        ['toc.parts.design', 'r1', 'ghost'],
      ]);
      const ids = [...cyclic, ...dangling].map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('checks their placeholders against the part allow-list', () => {
      const found = find('', 'headerFooterUnknownPlaceholder', config);
      expect(found.map((w) => [w.payload.slot, w.payload.configPath, w.payload.name])).toEqual([['part', 'toc.parts.design', 'bogus']]);
    });
  });
});

describe('chapter attribution', () => {
  it('maps located warnings to chapters and flags ignored front matter', async () => {
    const { composeBook } = await import('../book/compose.js');
    const { newChapter } = await import('../book/chapterOps.js');
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

describe('engine content warnings', () => {
  const tableResource = (id: string, extra: Partial<Resource> = {}): Resource => ({
    id,
    typeId: 'table',
    kind: 'table',
    createdAt: 0,
    updatedAt: 0,
    table: { model: { rows: [[{ content: 'A', colSpan: 2 }, { content: 'C' }], [{ content: '1' }, { content: '2' }, { content: '3' }]] }, styleId: 'zebra' },
    ...extra,
  });
  const photo: Resource = {
    id: 'photo',
    typeId: 'figure',
    kind: 'bitmap',
    createdAt: 0,
    updatedAt: 0,
    bitmap: { fileId: 'file-photo', format: 'png', width: 10, height: 10 },
  };

  it('flags a heading style no style declares', () => {
    const found = find('# Preface {style="front"}\n\nText.', 'unknownHeadingStyle');
    expect(found.map((w) => w.payload)).toEqual([{ kind: 'unknownHeadingStyle', style: 'front', level: 1 }]);
    expect(found[0]!.line).toBe(1);
    expect(kinds('# Preface {style="front"}', { headingStyles: [{ id: 'front' }] })).not.toContain('unknownHeadingStyle');
  });

  it('flags the table style id and the ragged grid of a table the text uses', () => {
    const md = 'Intro.\n\nSee :ref{id="t1"}.';
    const all = computeWarnings({ markdown: md, config: {}, doc: null, resources: [tableResource('t1')] });
    const payloads = all.map((w) => w.payload).filter((p) => p.kind === 'unknownTableStyle' || p.kind === 'raggedTableGrid');
    expect(payloads).toEqual([
      { kind: 'unknownTableStyle', resourceId: 't1', styleId: 'zebra' },
      { kind: 'raggedTableGrid', resourceId: 't1', reason: 'spanOverlap', row: 0, col: 1, count: 2 },
    ]);
    const w = all.find((x) => x.payload.kind === 'unknownTableStyle')!;
    expect(md.slice(w.sourceStart, w.sourceEnd)).toBe(':ref{id="t1"}');
    expect(w.line).toBe(3);
  });

  it('does not list what the built document reports as well twice', () => {
    const md = 'See :ref{id="nope"}.';
    const doc = {
      pages: [],
      blocks: [],
      config: { page: { dpi: 72 } },
      warnings: [{ kind: 'unknownResourceId', resourceId: 'nope', usage: 'ref', sourceStart: 4, sourceEnd: 19, pageIndex: 0 }],
    } as unknown as VDTDocument;
    const found = computeWarnings({ markdown: md, config: {}, doc }).filter((w) => w.payload.kind === 'unknownResourceId');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload).toEqual({ kind: 'unknownResourceId', resourceId: 'nope', usage: 'ref' });
  });

  it('no longer flags a :::name line inside display math', () => {
    expect(kinds('$$\n:::banana\n$$')).not.toContain('unknownDirective');
  });

  it('flags an embed line that prints as text', () => {
    const found = find('Text.\n\n::resource{id=fig}', 'malformedEmbed');
    expect(found.map((w) => [w.payload.name, w.line])).toEqual([['resource', 3]]);
  });

  it('flags markup typed with a Chinese input method, with the ASCII form (#181)', () => {
    const md = '：：：callout{type="note"}\n甄士隐梦幻识通灵。\n：：：\n\n＃ 第一回';
    const found = find(md, 'fullwidthMarkup');
    expect(found.map((w) => [w.payload.typed, w.payload.ascii, w.line])).toEqual([
      ['：：：', ':::', 1], ['：：：', ':::', 3], ['＃', '#', 5],
    ]);
  });

  it('flags an attribute key written in Chinese (#181)', () => {
    const found = find(':::callout{type="note" 作者=曹雪芹}\n正文\n:::', 'attributeKeyInvalid');
    expect(found.map((w) => [w.payload.key, w.line])).toEqual([['作者', 1]]);
  });

  it('flags a :tab in vertical text, set as a word space (#622)', () => {
    const md = '品名 :tab 値段';
    const vertical: PostextConfig = { layout: { layoutType: 'single', writingMode: 'vertical-rl' }, locale: 'ja' };
    const found = find(md, 'tabInVerticalText', vertical);
    expect(found.map((w) => [md.slice(w.sourceStart, w.sourceEnd), w.line])).toEqual([[':tab', 1]]);
    expect(find(md, 'tabInVerticalText')).toEqual([]);
  });

  it('lists a paragraph whose drop cap could not be set as configured (#623)', () => {
    // A measuring canvas for the layout (no DOM here): 7 px a glyph.
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const md = '# One\n\nA short paragraph.';
    const config: PostextConfig = { headings: { levels: [{ level: 1, dropCap: { lines: 3, shortParagraph: 'shrink' } }] } };
    const doc = buildDocument({ markdown: md }, config);
    const found = computeWarnings({ markdown: md, config, doc, resources: [] })
      .filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'dropCap' }> } => w.payload.kind === 'dropCap');
    expect(found.map((w) => [w.payload.reason, w.payload.handling, w.line])).toEqual([['shortParagraph', 'shrink', 3]]);
    expect(warningCategory('dropCap')).toBe('typesetting');
  });

  it('lists a picture that cannot wrap text round it, and a type default in vertical text (#627)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const px = (value: number) => ({ value, unit: 'px' as const });
    const config: PostextConfig = {
      page: { dpi: 144, width: px(600), height: px(800), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
      layout: { layoutType: 'single' },
    };
    const wide: Resource = {
      id: 'wide', typeId: 'figure', kind: 'bitmap', caption: 'A plate.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'w.jpg', format: 'jpeg', width: 3000, height: 2000 },
      placement: { position: 'here', wrap: 'right', width: 0.9 },
    };
    const md = 'Text.\n\n::resource{id="wide"}\n\nMore text.';
    const doc = buildDocument({ markdown: md, resources: [wide] }, config);
    const found = computeWarnings({ markdown: md, config, doc, resources: [wide] }).filter((w) => w.payload.kind === 'textWrap');
    expect(found.map((w) => [w.payload, w.line])).toEqual([[{ kind: 'textWrap', reason: 'tooNarrow', resourceId: 'wide' }, 3]]);
    expect(warningCategory('textWrap')).toBe('figures');
    const vertical: PostextConfig = { layout: { writingMode: 'vertical-rl' }, resourceTypes: [{ ...defaultResourceTypes()[0]!, defaultPlacement: { wrap: 'right' } }] };
    const cw = computeWarnings({ markdown: 'Text.', config: vertical, doc: null }).filter((w) => w.payload.kind === 'wrapUnsupported');
    expect(cw).toHaveLength(1);
    expect(warningCategory('wrapUnsupported')).toBe('design');
  });

  it('lists a picture float shrunk to its slot, and one that still overruns (#626)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const px = (value: number) => ({ value, unit: 'px' as const });
    const config: PostextConfig = {
      page: { dpi: 144, width: px(600), height: px(400), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
      layout: { layoutType: 'single' },
    };
    const plate = (id: string, minScale: number): Resource => ({
      id, typeId: 'figure', kind: 'bitmap', caption: 'A plate.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 3000, height: 2000 },
      placement: { shrink: 'page', minScale },
    });
    const md = 'Text :ref{id="a"}.\n\n:::pagebreak\n\nMore :ref{id="b"}.';
    const resources = [plate('a', 0.5), plate('b', 0.95)];
    const doc = buildDocument({ markdown: md, resources }, config);
    const found = computeWarnings({ markdown: md, config, doc, resources })
      .filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'floatShrunk' }> } => w.payload.kind === 'floatShrunk');
    expect(found.map((w) => [w.payload.resourceId, w.payload.scale < 1, w.payload.overflowMm !== undefined, w.line])).toEqual([
      ['a', true, false, 1],
      ['b', true, true, 5],
    ]);
    expect(warningCategory('floatShrunk')).toBe('figures');
  });

  it('lists a caption that prints its label alone, and a figure in the text that moved on (#1151)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const px = (value: number) => ({ value, unit: 'px' as const });
    const config: PostextConfig = {
      page: { dpi: 144, width: px(600), height: px(400), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
      layout: { layoutType: 'single' },
    };
    const pic = (id: string, caption: string, height: number): Resource => ({
      id, typeId: 'figure', kind: 'bitmap', caption, createdAt: 0, updatedAt: 0,
      bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 600, height },
      placement: { position: 'here' },
    });
    const lines = Array.from({ length: 6 }, (_, i) => `Line ${i} of the text.`).join('\n\n');
    const md = `::resource{id="lone"}\n\n${lines}\n\n::resource{id="tall"}\n\nAfter.`;
    const resources = [pic('lone', '', 40), pic('tall', 'A tall one.', 300)];
    const doc = buildDocument({ markdown: md, resources }, config);
    const all = computeWarnings({ markdown: md, config, doc, resources });
    const lone = all.filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'emptyCaption' }> } => w.payload.kind === 'emptyCaption');
    expect(lone.map((w) => [w.payload.resourceId, w.line])).toEqual([['lone', 1]]);
    expect(lone[0]!.payload.label.length).toBeGreaterThan(0);
    const moved = all.filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'resourceMoved' }> } => w.payload.kind === 'resourceMoved');
    expect(moved.map((w) => [w.payload.resourceId, w.payload.page])).toEqual([['tall', 1]]);
    expect(moved[0]!.payload.emptyMm).toBeGreaterThan(0);
    expect(warningCategory('emptyCaption')).toBe('figures');
    expect(warningCategory('resourceMoved')).toBe('figures');
  });

  it('lists a composed page that draws no running foot its siblings draw (#1163)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const config = {
      pageTemplates: [{
        id: 'shell',
        frames: [{ name: 'texto', flow: true }],
        footer: { elements: [{ kind: 'text', id: 'foot', content: '{attr.foot}', placement: { anchor: { to: 'page', edge: 'bottom-left' }, offset: { y: mm(-8) } } }] },
      }],
    } as unknown as PostextConfig;
    const md = ['foot="A"', 'foot="A"', 'foot="A"', 'foot="A"', 'foot="A"', '', 'foot="A"']
      .map((a) => `::::page{template="shell"${a ? ` ${a}` : ''}}\n\nWords.\n\n::::`).join('\n\n');
    const doc = buildDocument({ markdown: md }, config);
    const all = computeWarnings({ markdown: md, config, doc });
    const lost = all.filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'folioMissing' }> } => w.payload.kind === 'folioMissing');
    expect(lost.map((w) => [w.payload.template, w.payload.elementId, w.payload.slot, w.payload.page])).toEqual([['shell', 'foot', 'footer', 6]]);
    // Pointed at the sixth page fence.
    expect(lost[0]!.line).toBe(31);
    expect(warningCategory('folioMissing')).toBe('typesetting');
  });

  it('lists a code listing wider than its box, and a code fence left open (#624)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const md = ['Text.', '', '```js', `const s = "${'a'.repeat(200)}";`, '```', '', '```py', 'open()'].join('\n');
    const config: PostextConfig = {};
    const doc = buildDocument({ markdown: md }, config);
    const all = computeWarnings({ markdown: md, config, doc, resources: [] });
    const overflow = all.filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'codeOverflow' }> } => w.payload.kind === 'codeOverflow');
    expect(overflow.map((w) => [w.payload.mode, w.payload.lines, w.payload.lang, w.line])).toEqual([['wrap', 1, 'js', 4]]);
    expect(warningCategory('codeOverflow')).toBe('typesetting');
    const open = all.filter((w) => w.payload.kind === 'unclosedCodeBlock');
    expect(open.map((w) => [w.payload, w.line])).toEqual([[{ kind: 'unclosedCodeBlock', delimiter: '```', lang: 'py' }, 7]]);
    // A book stored before #624 reads its fences as Markdown: no listing, no warning.
    const legacy = computeWarnings({ markdown: md, config: { codeStyle: { blocks: false } }, doc: null, resources: [] });
    expect(legacy.map((w) => w.payload.kind)).not.toContain('unclosedCodeBlock');
  });

  it('lists a closing fence after a one-line directive (#1125)', () => {
    const md = ['# Contents', '', ':::toc', ':::', '', 'Text.'].join('\n');
    const all = computeWarnings({ markdown: md, config: {}, doc: null, resources: [] });
    const stray = all.filter((w) => w.payload.kind === 'strayFence');
    expect(stray.map((w) => [w.payload, w.line])).toEqual([[{ kind: 'strayFence', directive: 'toc' }, 4]]);
    expect(warningCategory('strayFence')).toBe(warningCategory('unclosedContainer'));
  });

  it('reports sub-columns too narrow for their text (#634)', () => {
    const md = `:::columns{count=6}\n${Array.from({ length: 6 }, (_, i) => `Item ${i} of the group.`).join('\n\n')}\n:::`;
    const config: PostextConfig = { page: { width: { value: 200, unit: 'pt' }, height: { value: 300, unit: 'pt' } } };
    const doc = buildDocument({ markdown: md }, config);
    const found = computeWarnings({ markdown: md, config, doc }).filter((w) => w.payload.kind === 'columnsTooNarrow');
    expect(found).toHaveLength(1);
    expect(warningCategory('columnsTooNarrow')).toBe('typesetting');
  });

  it('reports side boxes set after the text, and one no page could take (#639)', () => {
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    // Eight lines a page, a side column that only takes floats.
    const config: PostextConfig = {
      page: { width: mm(100), height: mm(60), dpi: 150, margins: { top: mm(10), bottom: mm(10.48), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'oneAndHalf', sideColumnPercent: 20, sideColumnRole: 'floats', gutterWidth: mm(3) },
      bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', firstLineIndent: pt(0) },
      calloutStyles: [{ id: 'n', backgroundEnabled: false, padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) } }],
      header: { elements: [] },
      footer: { elements: [] },
    };
    const box = (name: string) => `:::callout{type="n" span="side"}\n${Array.from({ length: 6 }, (_, i) => `${name}${i + 1}`).join('\n\n')}\n:::`;
    const md = ['Text.', box('A'), box('B'), box('C')].join('\n\n');
    const doc = buildDocument({ markdown: md }, config);
    expect(doc.pages).toHaveLength(3);
    const found = computeWarnings({ markdown: md, config, doc }).filter((w) => w.payload.kind === 'afterText');
    expect(found.map((w) => w.payload)).toEqual([{ kind: 'afterText', page: 2 }, { kind: 'afterText', page: 3 }]);
    expect(found.map((w) => w.line)).toEqual([17, 31]);
    expect(warningCategory('afterText')).toBe('typesetting');

    // The section the heading opens has no side column: B has no page.
    const plain: PostextConfig = {
      ...config,
      headings: { levels: [{ level: 2, breakBefore: { enabled: false } }] },
      headingStyles: [{ id: 'plain', layout: { layoutType: 'single' } }],
    };
    const lost = ['Text.', '## Section {style="plain"}', 'More.', box('A'), box('B')].join('\n\n');
    const unplaced = computeWarnings({ markdown: lost, config: plain, doc: buildDocument({ markdown: lost }, plain) })
      .filter((w) => w.payload.kind === 'unplaced');
    expect(unplaced.map((w) => w.payload)).toEqual([{ kind: 'unplaced' }]);
    expect(lost.slice(unplaced[0]!.sourceStart, unplaced[0]!.sourceEnd)).toContain('B1');
    expect(warningCategory('unplaced')).toBe('typesetting');
  });

  it('reports a short list cut between columns and a float on an opener page (#749)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    // Eight lines a page: the heading, six lines of text, then a list of three.
    const config: PostextConfig = {
      page: { width: mm(100), height: mm(60), dpi: 150, margins: { top: mm(10), bottom: mm(10.48), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'single' },
      bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', firstLineIndent: pt(0), shortListSplit: 'warn' },
      unorderedLists: { marginTop: pt(0), marginBottom: pt(0) },
      headings: { levels: [{ level: 1, fontSize: pt(10), lineHeight: pt(14), marginTop: pt(0), marginBottom: pt(0), breakBefore: { enabled: true, parity: 'any' } }] },
      header: { elements: [] },
      footer: { elements: [] },
    };
    const list = '- one\n- two\n- three';
    const md = ['# Title', ...Array.from({ length: 6 }, (_, i) => `Line ${i + 1}.`), list].join('\n\n');
    const doc = buildDocument({ markdown: md }, config);
    const cut = computeWarnings({ markdown: md, config, doc }).filter((w) => w.payload.kind === 'shortListSplit');
    expect(cut.map((w) => w.payload)).toEqual([{ kind: 'shortListSplit', page: 1, items: 3 }]);
    expect(md.slice(cut[0]!.sourceStart, cut[0]!.sourceEnd)).toBe(list);
    expect(cut[0]!.line).toBe(15);
    expect(warningCategory('shortListSplit')).toBe('typesetting');
    // Applied, the rule leaves nothing to report.
    const kept: PostextConfig = { ...config, bodyText: { ...config.bodyText, shortListSplit: 'avoid' } };
    expect(computeWarnings({ markdown: md, config: kept, doc: buildDocument({ markdown: md }, kept) })
      .filter((w) => w.payload.kind === 'shortListSplit')).toEqual([]);

    // A figure cited on the page its chapter opens.
    const figure: Resource = {
      id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'A figure.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 60 },
    };
    const floats = (openerFloats: 'warn' | 'avoid'): PostextConfig => ({
      ...config,
      page: { ...config.page, height: mm(120) },
      layout: { layoutType: 'single', openerFloats },
      bodyText: { ...config.bodyText, shortListSplit: 'allow' },
    });
    const cited = ['# Title', 'See :ref{id="fig"}.', ...Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`)].join('\n\n');
    const warned = buildDocument({ markdown: cited, resources: [figure] }, floats('warn'));
    const found = computeWarnings({ markdown: cited, config: floats('warn'), doc: warned, resources: [figure] })
      .filter((w) => w.payload.kind === 'openerFloat');
    expect(found.map((w) => w.payload)).toEqual([{ kind: 'openerFloat', page: 1, resourceId: 'fig' }]);
    expect(found[0]!.line).toBe(3);
    expect(warningCategory('openerFloat')).toBe('typesetting');
    const moved = buildDocument({ markdown: cited, resources: [figure] }, floats('avoid'));
    expect(moved.pages[0]!.floats ?? []).toEqual([]);
    expect(computeWarnings({ markdown: cited, config: floats('avoid'), doc: moved, resources: [figure] })
      .filter((w) => w.payload.kind === 'openerFloat')).toEqual([]);
  });

  it('reports a contents block cut between columns, by its book page (#850)', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const config: PostextConfig = {
      page: { width: pt(360), height: pt(260), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
      layout: { layoutType: 'single' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
      headingStyles: [{ id: 'front', numbered: false }],
    };
    const chapters = (title: string, n: number) => Array.from({ length: n }, (_, i) => `# ${title} ${i + 1}\n\nText.`).join('\n\n');
    const md = `# Contents {style="front" toc="false"}\n\n:::toc{keep="part"}\n\n:::part{number="I" title="Long"}\n:::\n\n${chapters('Chapter', 30)}`;
    const doc = buildDocument({ markdown: md }, config);
    const cut = computeWarnings({ markdown: md, config, doc }).filter((w) => w.payload.kind === 'tocGroupSplit');
    expect(cut.map((w) => w.payload)).toEqual([{ kind: 'tocGroupSplit', page: 1, title: 'Long', columns: 2 }]);
    expect(md.slice(cut[0]!.sourceStart, cut[0]!.sourceEnd)).toBe(':::toc{keep="part"}');
    expect(warningCategory('tocGroupSplit')).toBe('typesetting');
  });

  it('flags an image the previews cannot read, unless storage itself is out', () => {
    const md = 'Look :ref{id="photo"}.';
    const found = computeWarnings({ markdown: md, config: {}, doc: null, resources: [photo], unavailableImages: new Set(['file-photo']) })
      .filter((w) => w.payload.kind === 'missingImage');
    expect(found.map((w) => w.payload)).toEqual([{ kind: 'missingImage', resourceId: 'photo', fileId: 'file-photo' }]);
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe(':ref{id="photo"}');
    const unused = computeWarnings({ markdown: 'Nothing.', config: {}, doc: null, resources: [photo], unavailableImages: new Set(['file-photo']) });
    expect(unused.map((w) => w.payload.kind)).not.toContain('missingImage');
    const noStorage = computeWarnings({ markdown: md, config: {}, doc: null, resources: [photo], unavailableImages: new Set(['file-photo']), storageUnavailable: true });
    expect(noStorage.map((w) => w.payload.kind)).not.toContain('missingImage');
  });

  it('flags an image only the configuration draws: design elements and callout icons and label tabs', () => {
    const pic = (id: string): Resource => ({ ...photo, id, bitmap: { ...photo.bitmap!, fileId: `file-${id}` } });
    const image = (id: string, resourceId: string) => ({
      kind: 'image' as const, id, resourceId, placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, size: { width: { value: 10, unit: 'pt' as const } } },
    });
    const config: PostextConfig = {
      header: { elements: [image('logo', 'seal')] },
      headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [image('opener', 'opener-photo')] } } }] },
      headingStyles: [{ id: 'off', advancedDesign: { enabled: false, slot: { elements: [image('never', 'unused')] } } }],
      calloutStyles: [
        { id: 'note', icon: { kind: 'resource', resourceId: 'note-icon' }, label: { icon: { resourceId: 'tab-icon' } } },
        { id: 'glyph', icon: { kind: 'glyph', glyph: '!', resourceId: 'stale-icon' } },
      ],
    };
    const ids = ['seal', 'opener-photo', 'unused', 'note-icon', 'tab-icon', 'stale-icon'];
    const found = computeWarnings({
      markdown: 'No references.', config, doc: null, resources: ids.map(pic), unavailableImages: new Set(ids.map((id) => `file-${id}`)),
    }).filter((w) => w.payload.kind === 'missingImage');
    expect(found.map((w) => w.payload.kind === 'missingImage' && w.payload.resourceId).sort()).toEqual(['note-icon', 'opener-photo', 'seal', 'tab-icon']);
    // They belong to no place in the text.
    expect(found.every((w) => w.sourceStart === undefined)).toBe(true);
  });

  it('expands an {attr.<key>} image id with the values the headings give it', () => {
    const pic = (id: string): Resource => ({ ...photo, id, bitmap: { ...photo.bitmap!, fileId: `file-${id}` } });
    const config: PostextConfig = {
      headingStyles: [{ id: 'opener', advancedDesign: { enabled: true, slot: { elements: [{
        kind: 'image', id: 'art', resourceId: 'art-{attr.art}',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: 10, unit: 'pt' } } },
      }] } } }],
    };
    const ids = ['art-log', 'art-wig', 'art-unused'];
    const found = computeWarnings({
      markdown: '# One {style="opener" art="log"}\n\nA.\n\n# Two {style="opener" art="wig"}\n\nB.',
      config, doc: null, resources: ids.map(pic), unavailableImages: new Set(ids.map((id) => `file-${id}`)),
    }).filter((w) => w.payload.kind === 'missingImage');
    expect(found.map((w) => w.payload.kind === 'missingImage' && w.payload.resourceId).sort()).toEqual(['art-log', 'art-wig']);
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

describe('config value warnings', () => {
  it('reports a font stack in a font family and an unknown number format', () => {
    const config: PostextConfig = {
      bodyText: { fontFamily: 'EB Garamond, serif' },
      orderedLists: { numberFormat: 'roman' as never },
    };
    expect(find('Text.', 'fontFamilyStack', config).map((w) => w.payload)).toEqual([
      { kind: 'fontFamilyStack', path: 'bodyText.fontFamily', value: 'EB Garamond, serif', used: 'EB Garamond' },
    ]);
    expect(find('Text.', 'unknownNumberFormat', config).map((w) => w.payload)).toEqual([
      { kind: 'unknownNumberFormat', path: 'orderedLists.numberFormat', value: 'roman', used: 'arabic' },
    ]);
    const clean = kinds('Text.', { bodyText: { fontFamily: 'EB Garamond' }, orderedLists: { numberFormat: 'decimal' as never } });
    expect(clean).not.toContain('unknownNumberFormat');
    expect(clean).not.toContain('fontFamilyStack');
  });

  it('accepts every spelling of a :::numbering format', () => {
    expect(kinds(':::numbering{format="roman-lower"}')).not.toContain('numberingInvalidFormat');
    expect(kinds(':::numbering{format="i"}')).not.toContain('numberingInvalidFormat');
    expect(find(':::numbering{format="roman"}', 'numberingInvalidFormat')).toHaveLength(1);
  });
});

describe('config values the engine replaces', () => {
  it('reports a side column that leaves a column with no width, with the path and the value used', () => {
    const config: PostextConfig = {
      layout: { layoutType: 'oneAndHalf', sideColumnPercent: 120 },
      headingStyles: [{ id: 'notes', layout: { layoutType: 'oneAndHalf', sideColumnPercent: -5 } }],
    };
    const hits = find('Text.', 'sideColumnPercentClamped', config);
    expect(hits.map((w) => [w.payload.path, w.payload.value])).toEqual([
      ['layout.sideColumnPercent', '120'],
      ['headingStyles[0].layout.sideColumnPercent', '-5'],
    ]);
    expect(hits[1]!.payload.used).toBe('1');
    expect(new Set(hits.map((w) => w.id)).size).toBe(2);
    // Not tied to the text: nothing to jump to in the editor.
    expect(hits.every((w) => w.sourceStart === undefined)).toBe(true);
  });

  it('stays silent for a side column both columns can take, and for other layouts', () => {
    expect(kinds('Text.', { layout: { layoutType: 'oneAndHalf', sideColumnPercent: 14 } })).not.toContain('sideColumnPercentClamped');
    expect(kinds('Text.', { layout: { layoutType: 'double', sideColumnPercent: 120 } })).not.toContain('sideColumnPercentClamped');
  });

  it('reports a column count outside 3 to 8, the document\u2019s and a section\u2019s, with the count used', () => {
    const config: PostextConfig = {
      layout: { layoutType: 'multiple', columnCount: 12 },
      headingStyles: [{ id: 'news', layout: { layoutType: 'multiple', columnCount: 2 } }],
    };
    const hits = find('Text.', 'columnCountClamped', config);
    expect(hits.map((w) => [w.payload.path, w.payload.value, w.payload.used])).toEqual([
      ['layout.columnCount', '12', '8'],
      ['headingStyles[0].layout.columnCount', '2', '3'],
    ]);
    expect(kinds('Text.', { layout: { layoutType: 'multiple', columnCount: 5 } })).not.toContain('columnCountClamped');
    expect(kinds('Text.', { layout: { layoutType: 'double', columnCount: 12 } })).not.toContain('columnCountClamped');
  });
});

describe('hyphenation locale warnings', () => {
  it('flags a document language with no bundled hyphenation patterns', () => {
    const hits = find('Hej.', 'unsupportedHyphenationLocale', { locale: 'sv' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.payload.locale).toBe('sv');
    // The explicit hyphenation locale is the one hyphenation uses.
    expect(find('Hej.', 'unsupportedHyphenationLocale', { locale: 'es', bodyText: { hyphenation: { locale: 'fi' } } })[0]!.payload.locale).toBe('fi');
    expect(find('Hej.', 'unsupportedHyphenationLocale', { locale: 'sv', bodyText: { hyphenation: { locale: 'de' } } })).toHaveLength(0);
  });

  it('stays quiet once hyphenation is switched off, the remedy it suggests', () => {
    expect(find('Hej.', 'unsupportedHyphenationLocale', { locale: 'sv', bodyText: { hyphenation: { enabled: false } } })).toHaveLength(0);
    expect(find('Hej.', 'unsupportedHyphenationLocale', { bodyText: { hyphenation: { enabled: false, locale: 'fi' } } })).toHaveLength(0);
  });

  it('says nothing for Chinese, Japanese or Korean, set without hyphenation', () => {
    for (const locale of ['zh-Hans', 'zh-Hant-TW', 'ja', 'ko']) {
      expect(kinds('此開卷第一回也。', { locale }), locale).not.toContain('unsupportedHyphenationLocale');
    }
    expect(kinds('Text.', { locale: 'es', bodyText: { hyphenation: { locale: 'zh' } } })).not.toContain('unsupportedHyphenationLocale');
  });

  it('accepts bundled languages with any region subtag', () => {
    for (const locale of ['es', 'es-ES', 'pt-BR', 'en-GB', 'ca-ES-valencia', 'nl']) {
      expect(kinds('Text.', { locale }), locale).not.toContain('unsupportedHyphenationLocale');
    }
    expect(kinds('Text.')).not.toContain('unsupportedHyphenationLocale');
  });
});

describe('unknown heading settings (EF-83)', () => {
  it('lists a key a heading level or style does not have, with the setting it is closest to', () => {
    const config = {
      headings: { levels: [{ level: 2, tracking: { value: 1, unit: 'pt' } }] },
      headingStyles: [{ id: 'back', letterSpacng: { value: 1.35, unit: 'pt' } }],
    } as unknown as PostextConfig;
    const hits = find('Text.', 'unknownConfigKey', config);
    expect(hits.map((w) => w.payload)).toEqual([
      { kind: 'unknownConfigKey', path: 'headings.levels[0].tracking', value: 'tracking', used: '' },
      { kind: 'unknownConfigKey', path: 'headingStyles[0].letterSpacng', value: 'letterSpacng', used: '', suggestion: 'letterSpacing' },
    ]);
    expect(kinds('Text.', { headings: { levels: [{ level: 2, letterSpacing: { value: 1, unit: 'pt' } }] } })).not.toContain('unknownConfigKey');
  });
});

describe('comics setting values (#590)', () => {
  it('lists a comics word outside its choices, with what the engine used and the closest word', () => {
    const config = {
      comics: { readingDirection: 'rlt', balloonStyles: [{ id: 'speech', shape: 'ovall' }], lettering: { joinSameSpeaker: 'merge' } },
    } as unknown as PostextConfig;
    const hits = find('Text.', 'unknownConfigValue', config);
    expect(hits.map((w) => w.payload)).toEqual([
      { kind: 'unknownConfigValue', path: 'comics.readingDirection', value: 'rlt', used: 'auto', suggestion: 'rtl' },
      { kind: 'unknownConfigValue', path: 'comics.lettering.joinSameSpeaker', value: 'merge', used: 'butt' },
      { kind: 'unknownConfigValue', path: 'comics.balloonStyles[0].shape', value: 'ovall', used: 'oval', suggestion: 'oval' },
    ]);
  });
});

describe('heading designs cut off (EF-91)', () => {
  const text = (baselines: number[]) => ({
    kind: 'text', bbox: { x: 0, y: 0, width: 100, height: 20 }, fontString: '10px Lora', color: '#000',
    lines: baselines.map((baselineY) => ({ text: 'Lead', xOffset: 0, baselineY, width: 20 })), clip: false,
  });
  const heading = (extra: Record<string, unknown>) => ({
    type: 'heading', headingLevel: 1, sourceStart: 2, sourceEnd: 9, columnIndex: 0, pageIndex: 0,
    bbox: { x: 0, y: 0, width: 100, height: 380 }, lines: [], ...extra,
  });
  const column = (blocks: unknown[]) => ({ index: 0, bbox: { x: 20, y: 20, width: 360, height: 360 }, blocks });
  const docWith = (page: Record<string, unknown>): VDTDocument => ({
    pages: [{ index: 0, width: 400, height: 400, columns: [column([])], ...page }],
    warnings: [],
    blocks: [],
    config: { page: { dpi: 72 } },
  } as unknown as VDTDocument);
  const cut = (doc: VDTDocument) => computeWarnings({ markdown: '# Rain\n\nText.', config: {}, doc }).filter((w) => w.payload.kind === 'headingDesignCut');
  const band = (baselines: number[]) => ({ bbox: { x: 20, y: 20, width: 360, height: 360 }, blocks: [text(baselines)] });

  it('flags an opener whose text runs past the foot of the page, at the heading', () => {
    const hits = cut(docWith({ openerBand: band([60, 390, 410, 430]), columns: [column([heading({ hidden: true })])] }));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.payload).toMatchObject({ kind: 'headingDesignCut', level: 1, page: 1 });
    // 30pt past the page foot (400).
    expect((hits[0]!.payload as { overflowMm: number }).overflowMm).toBeCloseTo((30 * 25.4) / 72, 5);
    expect(hits[0]!.sourceStart).toBe(2);
  });

  it('flags an in-column design whose text runs past the foot of its column (canvas and PDF clip it there)', () => {
    expect(cut(docWith({ columns: [column([heading({ designOverlay: band([60, 385]) })])] }))).toHaveLength(1);
  });

  it('stays silent for a design that fits: a dateline in the bottom margin of an opener is on the page', () => {
    expect(cut(docWith({ openerBand: band([60, 392]), columns: [column([heading({ hidden: true })])] }))).toHaveLength(0);
    expect(cut(docWith({ columns: [column([heading({ designOverlay: band([60, 370]) })])] }))).toHaveLength(0);
    // A part page's design belongs to no heading.
    expect(cut(docWith({ partInfo: { number: 'I', title: 'Part' }, openerBand: band([900]) }))).toHaveLength(0);
  });
});

describe('PDF font warnings (#196)', () => {
  it('lists the last PDF\'s font warnings once per face and kind, in the fonts group', () => {
    const warnings = computeWarnings({
      markdown: '此開卷第一回也。',
      config: {},
      doc: null,
      pdfFontChecks: [
        { kind: 'missingGlyph', family: 'Noto Serif TC', weight: 400, style: 'normal', characters: ['，', '！'], message: '' },
        { kind: 'missingGlyph', family: 'Noto Serif TC', weight: 400, style: 'normal', characters: ['，'], message: '' },
        { kind: 'variableFontDefaultInstance', family: 'Noto Serif SC', weight: 700, style: 'normal', defaultWeight: 400, message: '' },
        { kind: 'cffEmbeddedWhole', family: 'Source Han Serif TW', weight: 400, style: 'normal', bytes: 7_936_412, message: '' },
      ],
    });
    const pdf = warnings.filter((w) => w.id.startsWith('pdf-'));
    expect(pdf.map((w) => w.payload)).toEqual([
      { kind: 'missingGlyph', family: 'Noto Serif TC', weight: 400, style: 'normal', characters: ['，', '！'] },
      { kind: 'variableFontDefaultInstance', family: 'Noto Serif SC', weight: 700, style: 'normal', defaultWeight: 400 },
      { kind: 'cffEmbeddedWhole', family: 'Source Han Serif TW', weight: 400, style: 'normal', bytes: 7_936_412 },
    ]);
    expect(pdf.every((w) => w.sourceStart === undefined)).toBe(true);
  });
});

describe('comic page warnings (#570)', () => {
  it('lists what the engine reads off a comic page, each pointing at its source', () => {
    const md = 'Intro.\n\n:::page{split="60 / 60"}\nstray words\n::panel{art=nowhere}\nana{wisper}: Hi.\n::panel\n::panel\n:::';
    const all = computeWarnings({ markdown: md, config: {}, doc: null });
    const comic = all.filter((w) => w.payload.kind.startsWith('comic'));
    expect(comic.map((w) => w.payload.kind).sort()).toEqual(
      ['comicPanelCount', 'comicSplitOverflow', 'comicStrayText', 'comicUnknownArt', 'comicUnknownBalloonStyle'].sort(),
    );
    // Every one of them carries a place in the source: a click jumps there.
    for (const w of comic) {
      expect(w.sourceStart, w.payload.kind).toBeTypeOf('number');
      expect(w.line, w.payload.kind).toBeGreaterThanOrEqual(3);
    }
    const style = comic.find((w) => w.payload.kind === 'comicUnknownBalloonStyle')!;
    expect(style.payload).toEqual({ kind: 'comicUnknownBalloonStyle', style: 'wisper' });
    expect(style.line).toBe(6);
  });

  it('reads the layout-only comic warnings off the laid-out document', () => {
    const doc = {
      config: { page: { dpi: 96 } },
      warnings: [],
      contentWarnings: [
        { kind: 'comicPanelLetterbox', resourceId: 'p1', panel: 1, sourceStart: 10, sourceEnd: 20 },
        { kind: 'comicBalloonOverflow', panelIndex: 0, sourceStart: 30, sourceEnd: 40 },
        // A text panel's text clipped (#885) is the layout's.
        { kind: 'comicPanelFrame', reason: 'textOverflow', panel: 0, overflowMm: 4.2, sourceStart: 41, sourceEnd: 45 },
        // Source-level kinds come from the source, not twice.
        { kind: 'comicUnknownArt', resourceId: 'x', sourceStart: 0, sourceEnd: 5 },
        { kind: 'comicPanelFrame', reason: 'unknownBox', panel: 0, style: 'nope', sourceStart: 0, sourceEnd: 5 },
      ],
      pages: [],
      blocks: [],
    } as unknown as VDTDocument;
    const md = 'a'.repeat(50);
    const kindsFound = computeWarnings({ markdown: md, config: {}, doc }).map((w) => w.payload.kind).filter((k) => k.startsWith('comic'));
    expect(kindsFound).toEqual(['comicPanelLetterbox', 'comicBalloonOverflow', 'comicPanelFrame']);
  });
});

describe('page template warnings (#853)', () => {
  it('lists the engine\'s template warnings in the design group, with the resource of an anchor', () => {
    const config: PostextConfig = {
      calloutStyles: [{ id: 'caja' }],
      pageTemplates: [{ id: 'tema', frames: [{ name: 'texto', flow: true, style: 'cja' }, { name: 'texto' }] }, { id: 'hijo', extends: 'tem' }],
    };
    const mapa = { id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, anchors: [{ id: 'madrid', x: 0.5, y: 0.5, style: 'ciudad' }] } as Resource;
    const found = computeWarnings({ markdown: 'Text.', config, doc: null, resources: [mapa] })
      .filter((w) => ['frameStyleUnknown', 'frameDuplicate', 'templateExtendsUnknown', 'labelStyleUnknown'].includes(w.payload.kind));
    expect(found.map((w) => w.payload)).toEqual([
      { kind: 'frameDuplicate', path: '/pageTemplates/0/frames/1', value: 'texto', used: '' },
      { kind: 'frameStyleUnknown', path: '/pageTemplates/0/frames/0/style', value: 'cja', used: '', suggestion: 'caja' },
      { kind: 'templateExtendsUnknown', path: '/pageTemplates/1/extends', value: 'tem', used: '', suggestion: 'tema' },
      { kind: 'labelStyleUnknown', path: '/resources/0/anchors/0/style', value: 'ciudad', used: '', resourceId: 'mapa' },
    ]);
    for (const kind of ['templateDuplicate', 'templateExtendsCycle', 'templateExtendsUnknown', 'frameDuplicate', 'frameStyleUnknown', 'frameAnchorUnknown', 'frameMinMax', 'groupFrameUnknown', 'groupFrameTwice', 'frameChainLoop', 'overflowTargetUnknown', 'labelStyleUnknown'] as const) {
      expect(warningCategory(kind), kind).toBe('design');
    }
  });
});

describe('box styles based on another (#905)', () => {
  it('lists an unknown parent and a loop in the design group', () => {
    const config: PostextConfig = {
      calloutStyles: [{ id: 'caja' }, { id: 'p5', extends: 'cajas' }, { id: 'a', extends: 'b' }, { id: 'b', extends: 'a' }],
    };
    const found = computeWarnings({ markdown: 'Text.', config, doc: null, resources: [] })
      .filter((w) => w.payload.kind.startsWith('calloutStyleExtends'));
    expect(found.map((w) => w.payload)).toEqual([
      { kind: 'calloutStyleExtendsUnknown', path: 'calloutStyles[1].extends', value: 'cajas', used: '', suggestion: 'caja' },
      { kind: 'calloutStyleExtendsCycle', path: 'calloutStyles[2].extends', value: 'a → b → a', used: '' },
    ]);
    expect(warningCategory('calloutStyleExtendsUnknown')).toBe('design');
    expect(warningCategory('calloutStyleExtendsCycle')).toBe('design');
  });
});

describe('figure labels and words (#969, #986)', () => {
  it('carries the symbol a label runs onto into the Checks panel, on the book page', () => {
    const doc = {
      pages: [], blocks: [], warnings: [], pageIndexOffset: 4, config: { page: { dpi: 72 } },
      contentWarnings: [{ kind: 'labelOverlap', resourceId: 'mapa', text: 'Madrid', anchor: 'a', with: 'symbol 2', withSymbol: 2, count: 3, pageIndex: 1, sourceStart: 0, sourceEnd: 6 }],
    } as unknown as VDTDocument;
    const found = computeWarnings({ markdown: 'Madrid', config: {}, doc, resources: [] }).filter((w) => w.payload.kind === 'labelOverlap');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload).toEqual({ kind: 'labelOverlap', resourceId: 'mapa', text: 'Madrid', anchor: 'a', with: 'symbol 2', withSymbol: 2, count: 3, page: 6 });
  });

  it('lists two figures that word one resource differently, in the Figures group', () => {
    const relief = { id: 'relief', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, caption: 'Relief' } as Resource;
    const md = ':::figure{resource="relief" caption="First"}\n:::\n\n:::figure{resource="relief" caption="Second"}\n:::\n';
    const found = computeWarnings({ markdown: md, config: {}, doc: null, resources: [relief] }).filter((w) => w.payload.kind === 'figureWordsShared');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload).toEqual({ kind: 'figureWordsShared', resourceId: 'relief', words: ['caption'] });
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('Second');
    expect(warningCategory('figureWordsShared')).toBe('figures');
  });
});

describe('a heading design that fills its column (#997)', () => {
  const note = (extra: Record<string, unknown>): VDTDocument => ({
    pages: [], blocks: [], warnings: [], pageIndexOffset: 2, config: { page: { dpi: 72 } },
    contentWarnings: [{ kind: 'headingClaimsColumn', level: 2, pageIndex: 1, sourceStart: 3, sourceEnd: 11, ...extra }],
  } as unknown as VDTDocument);
  const hits = (doc: VDTDocument) => computeWarnings({ markdown: 'x\n\n## Rain\n', config: {}, doc }).filter((w) => w.payload.kind === 'headingClaimsColumn');

  it('lists the heading with the element that claims the column, on the book page', () => {
    const found = hits(note({ element: 'seal' }));
    expect(found).toHaveLength(1);
    expect(found[0]!.payload).toEqual({ kind: 'headingClaimsColumn', level: 2, page: 4, element: 'seal' });
    expect(found[0]!.sourceStart).toBe(3);
    expect(warningCategory('headingClaimsColumn')).toBe('design');
  });

  it('lists a heading whose minHeight fills the column without an element', () => {
    expect(hits(note({}))[0]!.payload).toEqual({ kind: 'headingClaimsColumn', level: 2, page: 4 });
  });
});

describe('references into other chapters (#1300)', () => {
  // The chapter's build is handed the book's outline (its plan's) and
  // resolves a reference to a heading of another chapter: the Checks panel,
  // which reads the content warnings from the source, must too.
  const markdown = '# One\n\nAs :ref{id="engine"} explains, and :ref{id="ghost"} does not.';
  const unknown = (bookContent?: Parameters<typeof computeWarnings>[0]['bookContent']) =>
    computeWarnings({ markdown, config: {}, doc: null, ...(bookContent ? { bookContent } : {}) })
      .flatMap((w) => (w.payload.kind === 'unknownResourceId' ? [w.payload.resourceId] : []));

  it('knows the headings with an id and the anchors of the book outline', () => {
    const outline = [
      { kind: 'heading' as const, level: 1, title: 'One', number: '1', numbered: true, listed: true },
      { kind: 'heading' as const, level: 1, title: 'How the engine works', number: '2', numbered: true, listed: true, anchorId: 'engine' },
    ];
    expect(unknown()).toEqual(['engine', 'ghost']);
    expect(unknown({ outline })).toEqual(['ghost']);
  });
});
