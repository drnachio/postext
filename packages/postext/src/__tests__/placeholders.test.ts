import { describe, it, expect } from 'vitest';
import {
  resolvePlaceholders,
  collectPlaceholderNames,
  isKnownPlaceholder,
  computeChapterAttrs,
  type PlaceholderContext,
} from '../pipeline/placeholders';
import { resolveDesignPlaceholders, isAllowedPlaceholder, type DesignPlaceholderContext } from '../design/placeholders';
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
