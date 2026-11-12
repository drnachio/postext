import { BOOK_PAGE_KEYS, BOOK_WIDE_KEYS, chapterConfig, resolveLayoutConfig, type ChapterStyleConfig, type LayoutType, type PostextConfig } from 'postext';

/**
 * The book's chapter styles as the viewer sets them (#1521). A style's page
 * margins, running heads and heading breaks were drawn for the leaf; laid
 * over the viewer's settings they would bring the leaf back onto the
 * screen. Each style is set here as the viewer sets the book: the settings
 * of a chapter in that style (`chapterConfig`) passed through the viewer
 * (`view`), less what the whole book shares, which stays the viewer's.
 * Its columns are its own: two in a book of one when the style asks for
 * them, unless the vertical scroll or a narrow screen sets one measure.
 */
export function viewerChapterStyles(
  base: PostextConfig,
  /** The columns the viewer sets the book in, and whether it is the
   *  vertical scroll. */
  bookLayout: LayoutType,
  scroll: boolean,
  view: (config: PostextConfig, layoutType: LayoutType) => PostextConfig,
): ChapterStyleConfig[] | undefined {
  const styles = base.chapterStyles;
  if (!styles?.length) return undefined;
  const book = resolveLayoutConfig(base.layout).layoutType;
  return styles.map((style) => {
    const styled = chapterConfig(base, style.id);
    const own = resolveLayoutConfig(styled.layout).layoutType;
    // One measure in the vertical scroll, or where the viewer gave the
    // book's columns up for a narrow screen: the style's go the same way,
    // but for a side column, which reads beside the text.
    const flattened = scroll || (bookLayout === 'single' && book !== 'single');
    const layoutType: LayoutType = own === book ? bookLayout : flattened ? (own === 'oneAndHalf' ? 'oneAndHalf' : 'single') : own;
    const config = view({ ...styled, chapterStyles: undefined }, layoutType) as Record<string, unknown>;
    for (const key of BOOK_WIDE_KEYS) delete config[key];
    const page = config.page as Record<string, unknown> | undefined;
    if (page) {
      const rest = { ...page };
      for (const key of BOOK_PAGE_KEYS) delete rest[key];
      config.page = rest;
    }
    return { ...style, config: config as ChapterStyleConfig['config'] };
  });
}
