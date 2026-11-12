import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { chapterStyleView, newChapterStyle, writeChapterStyle } from './chapterStyleEdit.js';

const pt = (value: number) => ({ value, unit: 'pt' as const });
const book: PostextConfig = {
  page: { width: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10) },
  chapterStyles: [{ id: 'appendix', name: 'Appendix', config: { layout: { layoutType: 'double' } } }],
};

describe('editing a chapter style', () => {
  it('shows the style over the book', () => {
    expect(chapterStyleView(book, 'appendix').layout?.layoutType).toBe('double');
  });

  it('keeps what the panel writes as the style\'s difference from the book, without the book\'s page settings', () => {
    const view = chapterStyleView(book, 'appendix');
    const next = writeChapterStyle(book, 'appendix', { ...view, bodyText: { fontSize: pt(9) }, page: { ...view.page, width: pt(500) } });
    const own = next.chapterStyles![0]!.config;
    expect(own.bodyText).toEqual({ fontSize: pt(9) });
    // Two columns are the default: the style takes the book's one out.
    expect(own.layout === null || (own.layout as { layoutType?: string }).layoutType === 'double').toBe(true);
    expect(own.page).toBeUndefined();
    // The book itself is left as it was.
    expect(next.bodyText).toEqual(book.bodyText);
    // Setting a field back to the book's value takes it out of the style.
    const back = writeChapterStyle(next, 'appendix', { ...chapterStyleView(next, 'appendix'), layout: { layoutType: 'single' } });
    expect(back.chapterStyles![0]!.config).toEqual({ bodyText: { fontSize: pt(9) } });
  });

  it('names a new style with an id the book does not use', () => {
    expect(newChapterStyle(book.chapterStyles!, 'Apéndice')).toEqual({ id: 'apendice', name: 'Apéndice', config: {} });
    expect(newChapterStyle([{ id: 'appendix', config: {} }], 'Appendix').id).toBe('appendix-2');
  });
});
