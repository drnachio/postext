import { describe, it, expect } from 'vitest';
import {
  resolvePlaceholders,
  collectPlaceholderNames,
  isKnownPlaceholder,
  computeChapterAttrs,
  computeChapterNumbers,
  computePageMarks,
  leadingBoldText,
  markPlaceholder,
  type PlaceholderContext,
} from '../pipeline/placeholders';
import { resolveDesignPlaceholders, isAllowedPlaceholder, configUsesPlaceholder, type DesignPlaceholderContext } from '../design/placeholders';
import type { VDTDesignTextBlock } from '../vdt';
import { buildDocument } from '../pipeline';
import type { VDTBlock, VDTPage } from '../vdt';
import type { PostextConfig } from '../types';

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

const page = (index: number): VDTPage => ({ index, pageLabel: String(index + 1) } as unknown as VDTPage);

function h1(pageIndex: number, text: string, attrs?: Record<string, string>): VDTBlock {
  return {
    id: `h1-${pageIndex}`,
    type: 'heading',
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines: [{ text, bbox: { x: 0, y: 0, width: 0, height: 0 }, baseline: 0, hyphenated: false }],
    pageIndex,
    columnIndex: 0,
    dirty: false,
    snappedToGrid: false,
    fontString: '',
    color: '',
    textAlign: 'left',
    headingLevel: 1,
    ...(attrs ? { attrs } : {}),
  };
}

describe('{attr.*} placeholders — grammar', () => {
  it('collectPlaceholderNames accepts dotted names', () => {
    expect(collectPlaceholderNames('{attr.author} — {chapterTitle} {{lit}}')).toEqual(['attr.author', 'chapterTitle']);
  });

  it('isKnownPlaceholder treats any attr.<key> as known', () => {
    expect(isKnownPlaceholder('attr.author')).toBe(true);
    expect(isKnownPlaceholder('attr.')).toBe(false);
    expect(isKnownPlaceholder('nosuch')).toBe(false);
    expect(isAllowedPlaceholder('attr.x', 'header')).toBe(true);
    expect(isAllowedPlaceholder('titleText', 'header')).toBe(false);
    expect(isAllowedPlaceholder('titleText', 'heading')).toBe(true);
  });
});

describe('{attr.*} placeholders — header/footer resolver', () => {
  const ctx = (chapterAttrs?: Record<string, string>[]): PlaceholderContext => ({
    page: page(1),
    allPages: [page(0), page(1)],
    metadata: {},
    chapterTitleByPageIndex: ['One', 'One'],
    chapterAttrsByPageIndex: chapterAttrs,
  });

  it('resolves from the current chapter attrs', () => {
    const r = resolvePlaceholders('{chapterTitle} by {attr.author}', ctx([{ author: 'A' }, { author: 'A' }]));
    expect(r.text).toBe('One by A');
    expect(r.unknownPlaceholders).toEqual([]);
  });

  it('a missing attr resolves to the empty string with no unknown-placeholder warning', () => {
    expect(resolvePlaceholders('[{attr.missing}]', ctx([{ author: 'A' }, {}]))).toMatchObject({ text: '[]', unknownPlaceholders: [] });
    expect(resolvePlaceholders('[{attr.author}]', ctx(undefined))).toMatchObject({ text: '[]', unknownPlaceholders: [] });
  });

  it('passes attribute values, and only them, through `attrValue`', () => {
    const r = resolvePlaceholders('{chapterTitle}: {attr.author}', ctx([{}, { author: 'a' }]), { attrValue: (v) => v.toUpperCase() });
    expect(r.text).toBe('One: A');
  });
});

describe('{attr.*} placeholders — heading resolver', () => {
  const base: DesignPlaceholderContext = {
    kind: 'heading',
    page: page(0),
    allPages: [page(0)],
    metadata: {},
    chapterTitleByPageIndex: [],
    chapterAttrsByPageIndex: [{ author: 'Chapter author' }],
    heading: { titleText: 'T', formattedNumber: '', attrs: { author: 'Own author' } },
  };

  it('prefers the heading own attrs, then falls back to the chapter attrs', () => {
    expect(resolveDesignPlaceholders('{attr.author}', base).text).toBe('Own author');
    const noOwn = { ...base, heading: { titleText: 'T', formattedNumber: '' } };
    expect(resolveDesignPlaceholders('{attr.author}', noOwn).text).toBe('Chapter author');
    const r = resolveDesignPlaceholders('{attr.nope}', base);
    expect(r.text).toBe('');
    expect(r.unknownPlaceholders).toEqual([]);
  });
});

describe('computeChapterAttrs', () => {
  it('tracks the most recent H1 attrs per page, empty before the first H1', () => {
    const blocks = [h1(1, 'One', { author: 'A' }), h1(3, 'Two')];
    expect(computeChapterAttrs(blocks, 5)).toEqual([{}, { author: 'A' }, { author: 'A' }, {}, {}]);
  });

  it('attributes parity-padding pages to the upcoming chapter', () => {
    const blocks = [h1(0, 'One', { author: 'A' }), h1(3, 'Two', { author: 'B' })];
    const pages = [{}, {}, { blankForParity: true }, {}];
    expect(computeChapterAttrs(blocks, 4, pages)).toEqual([{ author: 'A' }, { author: 'A' }, { author: 'B' }, { author: 'B' }]);
  });
});

describe('{attr.*} end to end', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const cfg: PostextConfig = {
    page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
    header: {
      elements: [{
        kind: 'text', id: 'by', content: 'by {attr.author}', fontSize: pt(8), overflow: 'ellipsis-end',
        placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'auto', height: 'auto' } },
      }],
    },
  };

  it('copies heading attrs onto the VDT block and resolves them in the header', () => {
    const doc = buildDocument({ markdown: '# Title {author="I. Zango"}\n\nBody.' }, cfg);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.attrs).toEqual({ author: 'I. Zango' });
    expect(heading.lines.map((l) => l.text).join(' ')).toBe('Title');
    expect(doc.pages[0]!.header?.blocks[0]).toMatchObject({ kind: 'text', lines: [{ text: 'by I. Zango' }] });
  });
});

describe('{chapterNumber} without a numbering template', () => {
  it('falls back to the chapter ordinal, counting a split heading once', () => {
    const blocks = [h1(0, 'One'), h1(2, 'Two'), h1(2, 'Two (cont.)'), h1(4, 'Three')];
    blocks[0]!.contentIndex = 0;
    blocks[1]!.contentIndex = 5;
    blocks[2]!.contentIndex = 5;
    blocks[3]!.contentIndex = 9;
    const numbers = computeChapterNumbers(blocks, 6, [0, 1, 2, 3, 4, 5].map(page));
    expect(numbers).toEqual(['1', '1', '2', '2', '3', '3']);
  });

  it('prefers the rendered numbering prefix when present', () => {
    const block = { ...h1(0, 'One'), numberPrefix: 'Chapter 4. ' } as VDTBlock;
    expect(computeChapterNumbers([block], 1, [page(0)])).toEqual(['Chapter 4.']);
  });
});

describe('running marks: {firstMark.<key>} / {lastMark.<key>}', () => {
  const heading = (pageIndex: number, text: string, level: number, contentIndex: number): VDTBlock =>
    ({ ...h1(pageIndex, text), headingLevel: level, contentIndex }) as VDTBlock;

  it('parses the namespaced names and allows them in running heads only', () => {
    expect(markPlaceholder('firstMark.h2')).toEqual({ which: 'first', key: 'h2' });
    expect(markPlaceholder('lastMark.entry')).toEqual({ which: 'last', key: 'entry' });
    expect(markPlaceholder('firstMark')).toBeUndefined();
    expect(markPlaceholder('middleMark.h2')).toBeUndefined();
    expect(collectPlaceholderNames('{firstMark.entry} – {lastMark.entry}')).toEqual(['firstMark.entry', 'lastMark.entry']);
    expect(isKnownPlaceholder('lastMark.h3')).toBe(true);
    expect(isAllowedPlaceholder('firstMark.h2', 'header')).toBe(true);
    expect(isAllowedPlaceholder('lastMark.h2', 'footer')).toBe(true);
    expect(isAllowedPlaceholder('firstMark.h2', 'heading')).toBe(false);
    expect(isAllowedPlaceholder('bookTotalPages', 'footer')).toBe(true);
    expect(isAllowedPlaceholder('bookTotalPages', 'heading')).toBe(true);
  });

  it('takes the first and last mark starting on each page, else the one in effect', () => {
    const blocks = [
      heading(0, 'Intro', 1, 0),
      heading(1, 'Aback', 2, 1),
      heading(1, 'Abaft', 2, 2),
      heading(1, 'Aboard', 2, 3),
      // A heading split across pages marks the page it starts on only.
      heading(3, 'Anchor', 2, 4),
      heading(4, 'Anchor', 2, 4),
    ];
    const marks = computePageMarks(blocks, 5, { level: 2 });
    expect(marks.first).toEqual(['', 'Aback', 'Aboard', 'Anchor', 'Anchor']);
    expect(marks.last).toEqual(['', 'Aboard', 'Aboard', 'Anchor', 'Anchor']);
    // Paragraph marks come from the content: its style and headword.
    const para = (pageIndex: number, contentIndex: number): VDTBlock => ({ ...h1(pageIndex, ''), type: 'paragraph', headingLevel: undefined, contentIndex }) as VDTBlock;
    const words: Record<number, { styleId: string; text: string }> = { 10: { styleId: 'entry', text: 'Ballast' }, 11: { styleId: 'note', text: 'Aside' }, 12: { styleId: 'entry', text: 'Beam' } };
    const entries = computePageMarks([para(0, 10), para(0, 11), para(1, 12)], 3, { styleId: 'entry' }, (i) => words[i]);
    expect(entries).toEqual({ first: ['Ballast', 'Beam', 'Beam'], last: ['Ballast', 'Beam', 'Beam'] });
  });

  it('reads a paragraph\'s headword from its leading bold run', () => {
    const span = (text: string, bold = false) => ({ text, bold, italic: false });
    expect(leadingBoldText([span('Aback.', true), span(' Said of the sails.')])).toBe('Aback');
    expect(leadingBoldText([span(' '), span('Abaft', true), span(', ', true), span('behind')])).toBe('Abaft');
    expect(leadingBoldText([span('Plain '), span('bold', true)])).toBe('');
  });

  it('resolves in header slots through the context', () => {
    const ctx: DesignPlaceholderContext = {
      kind: 'header', page: page(1), allPages: [page(0), page(1)], metadata: {}, chapterTitleByPageIndex: [],
      bookTotalPages: 12,
      marksFor: (key) => (key === 'h2' ? { first: ['', 'Aback'], last: ['', 'Aboard'] } : undefined),
    };
    expect(resolveDesignPlaceholders('{firstMark.h2} – {lastMark.h2} · {firstMark.h3} · {totalPages}/{bookTotalPages}', ctx).text).toBe('Aback – Aboard ·  · 2/12');
    expect(resolveDesignPlaceholders('{bookTotalPages}', { ...ctx, bookTotalPages: undefined }).text).toBe('2');
  });

  it('tells whether a configuration names a placeholder', () => {
    expect(configUsesPlaceholder({ footer: { elements: [{ kind: 'text', id: 'f', content: '{pageNumber} of {bookTotalPages}' }] } } as PostextConfig, 'bookTotalPages')).toBe(true);
    expect(configUsesPlaceholder({ footer: { elements: [{ kind: 'text', id: 'f', content: '{totalPages}' }] } } as PostextConfig, 'bookTotalPages')).toBe(false);
    expect(configUsesPlaceholder(undefined, 'bookTotalPages')).toBe(false);
  });

  it('prints a dictionary\'s first and last headword and a book\'s sections', () => {
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const words = ['Aback', 'Abaft', 'Aboard', 'Adrift', 'Aft', 'Anchor', 'Astern', 'Ballast', 'Beam', 'Bowline', 'Capstan', 'Careen'];
    const entries = words.map((w) => `**${w}.** ${'A nautical term defined at some length so that the entries fill the page. '.repeat(8)}`).join('\n\n');
    const cfg: PostextConfig = {
      page: { width: pt(360), height: pt(240), margins: { top: pt(24), bottom: pt(18), left: pt(18), right: pt(18) } },
      paragraphStyles: [{ id: 'entry', name: 'Entry' }],
      header: {
        elements: [{
          kind: 'text', id: 'rh', content: '{firstMark.entry} – {lastMark.entry} | {firstMark.h2}', fontSize: pt(8), overflow: 'wrap',
          placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
        }],
      },
    };
    const doc = buildDocument({ markdown: `## Letter A\n\n:::paragraphs{style="entry"}\n${entries}\n:::\n` }, cfg);
    expect(doc.pages.length).toBeGreaterThan(2);
    const text = (p: VDTPage) => (p.header?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' ')).join('');
    // Each page's headwords, in the order the entries were placed.
    const byPage = doc.pages.map((p) => {
      const heads: string[] = [];
      for (const b of doc.blocks) {
        if (b.pageIndex !== p.index || b.type !== 'paragraph') continue;
        const first = b.lines[0]?.text ?? '';
        const w = words.find((word) => first.startsWith(`${word}.`));
        if (w && !heads.includes(w)) heads.push(w);
      }
      return heads;
    });
    let current = '';
    doc.pages.forEach((p, i) => {
      const heads = byPage[i]!;
      const first = heads[0] ?? current;
      if (heads.length > 0) current = heads[heads.length - 1]!;
      expect(text(p)).toBe(`${first} – ${current} | Letter A`);
    });
  });
});
