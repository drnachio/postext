import { describe, it, expect, vi } from 'vitest';
import { chapterConfig, collectConfigWarnings, type PostextConfig } from 'postext';
import { buildHtmlConfigOverride } from '../configOverride.js';

// No canvas under node: every glyph measures 10px.
vi.mock('postext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('postext')>()),
  measureGlyphWidth: (text: string) => text.length * 10,
}));

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

// An appendix style drawn for the leaf: wider margins, two columns, its own
// running head and a smaller body.
const base: PostextConfig = {
  layout: { layoutType: 'single' },
  chapterStyles: [{
    id: 'appendix',
    config: {
      page: { margins: { top: mm(30), left: mm(40), right: mm(40) } },
      layout: { layoutType: 'double' },
      bodyText: { fontSize: pt(7) },
      header: { elements: [{ kind: 'text', id: 't', content: 'Appendix' }] },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
    },
  }],
};

const opts = { fontScale: 1, pageWidthPx: 800, viewportHeightPx: 900, locale: 'en', optimalLineBreaking: false };

describe('chapter styles in the HTML viewer (#1521)', () => {
  it('keep the viewer\'s page and drop the leaf\'s running heads and parity', () => {
    const view = buildHtmlConfigOverride(base, { ...opts, columnMode: 'multi', layoutType: 'single' });
    const styled = chapterConfig(view, 'appendix');
    expect(styled.page?.margins).toEqual(view.page?.margins);
    expect(styled.page?.width).toEqual(view.page?.width);
    expect(styled.page?.dpi).toBe(view.page?.dpi);
    expect(styled.header?.elements).toEqual([]);
    expect(styled.headings?.levels?.find((l) => l.level === 1)?.breakBefore?.parity).toBe('any');
    // What the style is about stays: its columns and its text.
    expect(styled.layout?.layoutType).toBe('double');
    expect(styled.bodyText?.fontSize).toEqual(pt(7));
    // Nothing the whole book shares is set by the style.
    expect(collectConfigWarnings(view).filter((w) => w.kind === 'chapterStyleBookSetting')).toEqual([]);
  });

  it('set the style in one measure in the vertical scroll', () => {
    const view = buildHtmlConfigOverride(base, { ...opts, columnMode: 'single', layoutType: 'single' });
    expect(chapterConfig(view, 'appendix').layout?.layoutType).toBe('single');
    expect(chapterConfig(view, 'appendix').bodyText?.fontSize).toEqual(pt(7));
  });

  it('leave a book without styles as it was', () => {
    const { chapterStyles: _styles, ...plain } = base;
    void _styles;
    expect(buildHtmlConfigOverride(plain, { ...opts, columnMode: 'multi', layoutType: 'single' }).chapterStyles).toBeUndefined();
  });
});
