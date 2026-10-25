import { describe, expect, it } from 'vitest';
import { buildReflowablePublication } from './index.js';
import { buildBundle, renderToHtml } from 'postext';
import type { PostextConfig } from 'postext';
import '../__tests__/sampleBook.js';

// A style's figures (#1237) in a reflowable book: each family the
// stylesheet names is the base family, with the `font-variant-numeric` of
// its features beside it; every other family states `normal`, since the
// property inherits.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const CHAPTER = '# Chapter 1\n\nIn 1984 and 2024.\n\n::resource{id="t"}\n';
const table = {
  id: 't', typeId: 'table', kind: 'table' as const, createdAt: 0, updatedAt: 0,
  placement: { position: 'here' as const },
  table: { model: { headerRowCount: 1, rows: [[{ content: 'Year' }, { content: 'Staff' }], [{ content: '1984' }, { content: '4' }]] } },
};

async function cssOf(config: PostextConfig): Promise<string> {
  const docs = buildBundle({
    chapters: [{ markdown: CHAPTER }],
    resources: [table],
    config: { page: { width: pt(360), height: pt(480), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } }, locale: 'en-us', ...config },
  });
  const pub = await buildReflowablePublication(docs, {
    layout: 'reflowable',
    metadata: { title: 'Figures', language: 'en-US', modified: new Date(Date.UTC(2026, 9, 25)) },
  });
  return pub.items.filter((i) => i.mediaType === 'text/css').map((i) => String(i.data)).join('\n');
}

describe('figure styles in a reflowable book (#1237)', () => {
  it('set the base family with the features of each style', async () => {
    const css = await cssOf({ bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle' }, tableStyle: { figureStyle: 'lining-tabular' }, headings: { fontFamily: 'Inter' } });
    expect(css).not.toMatch(/@(onum|lnum|tnum|pnum)/);
    expect(css).toContain('font-family: "Lora", serif;\n  font-variant-numeric: oldstyle-nums;');
    expect(css).toContain('font-family: "Lora", serif;\n  font-variant-numeric: lining-nums tabular-nums;');
    expect(css).toContain('font-family: "Inter", sans-serif;\n  font-variant-numeric: normal;');
  });

  it('leave a book that sets none as it was', async () => {
    expect(await cssOf({ bodyText: { fontFamily: 'Lora' } })).not.toContain('font-variant-numeric');
  });

  it('the fixed-layout pages set them as the HTML backend does', () => {
    const [doc] = buildBundle({ chapters: [{ markdown: 'In 1984.' }], config: { bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle' } } });
    expect(renderToHtml(doc!)).toContain("'Lora';font-variant-numeric:oldstyle-nums");
  });
});
