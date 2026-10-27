import { type PostextConfig, type LayoutType, resolveHeadingsConfig, resolvePageConfig, type PageMargins, type Dimension, dimensionToPx, resolveLayoutConfig, buildFontString, parseMarkdown } from 'postext';
import { type ColumnMode, htmlViewerDpi, PADDING_PX } from './constants.js';
import { viewerLayoutType } from './pageGeometry.js';
import { defaultDocumentLocale } from '../../../controls/language/hyphenation.js';
import { configShapingLanguage } from '../../../controls/language/measureLanguage.js';
import { viewerHeadingDesign, partTitleFace, countTitleLines, viewerPartDesign, paintsPage, withoutColors, widthIn } from './configOverride/designs.js';
import { type LeafGeometry, turnedLeaf } from './configOverride/leaf.js';

/** Layout config for one HTML viewer pass. `base` is the document config as
 *  the viewer sees it — pass it through `applyHtmlViewerOverrides` first so
 *  the screen-only `htmlViewer.overrides` take part in the heading scaling
 *  and parity handling below. */
export function buildHtmlConfigOverride(
  base: PostextConfig,
  opts: {
    fontScale: number;
    columnMode: ColumnMode;
    /** Width of one viewer page. In multi mode this hosts the document's
     *  real column structure (`layoutType`), so it may span several text
     *  columns plus gutters. */
    pageWidthPx: number;
    /** Column structure each viewer page lays out with. Single-scroll mode
     *  passes 'single'; multi mode passes the document's own layout type. */
    layoutType: LayoutType;
    viewportHeightPx: number;
    locale: string;
    optimalLineBreaking: boolean;
    /** The document's part titles as the divider sets them (`number` and
     *  title, `\n` for a forced break). The band is as tall as the longest
     *  wraps to at `pageWidthPx`; without them it reserves two lines. */
    partTitles?: readonly string[];
    /** Comic pages (`:::page`) are set on a print leaf of their own this
     *  wide (px): the viewport's width in the vertical scroll, a page's in
     *  the paged view (see `comicsViewerLeaf`). Absent: the document has
     *  none, and its `comics` settings are left as they are. */
    comicWidthPx?: number;
    /** Composed pages (`::::page{template}`) are laid out on the print
     *  leaf (`composedViewerLeaf`, #1045), at the viewer's dpi: the host
     *  scales each to the screen (see `fitComposedPages`). */
    composedLeaf?: boolean;
  },
): PostextConfig {
  const {
    fontScale,
    columnMode,
    pageWidthPx,
    viewportHeightPx,
    locale,
    optimalLineBreaking,
    partTitles,
  } = opts;
  // A newspaper grid reads as two columns here (see viewerLayoutType).
  const layoutType = viewerLayoutType(opts.layoutType);

  // Font scale: the viewer renders at HTML_DPI (8pt ≈ 16px at fontScale=1)
  // and scales by changing the DPI itself, so every absolute size in the
  // design — body, headings, callouts, tables, captions, list markers,
  // paddings, rules, figure widths — grows by the same factor and the
  // layout keeps its proportions. Page geometry is in px and stays put.
  const dpi = htmlViewerDpi(fontScale);

  // The document's own language first (its hyphenation locale, else its
  // `locale`); the app language only stands in when it names neither.
  const hypLocale =
    base.bodyText?.hyphenation?.locale ?? base.locale ?? defaultDocumentLocale(locale);

  // Single-column mode: disable widow/orphan/runt avoidance (no column breaks
  // to protect — the whole document lives on one tall, scrollable page).
  const disableParagraphRules = columnMode === 'single';

  // Page height: single-column mode needs one very tall page so content never
  // flows to a second. Multi-column mode uses the viewport inner height, so
  // each VDT "page" = one column and horizontal stacking produces the scroll.
  const pageHeightPx =
    columnMode === 'single'
      ? Math.max(viewportHeightPx * 20, 200_000)
      : Math.max(viewportHeightPx - PADDING_PX * 2, 400);

  // The viewer has no leaves — a "page" is a scroll unit, never a recto or a
  // verso — so odd/even break parity (and the blank pages it pads with) is
  // meaningless here. Chapter and part breaks keep their page break but drop
  // the parity.
  const resolvedHeadings = resolveHeadingsConfig(base.headings);
  // A design band may be as tall as a leaf. The scroll has room for it; the
  // paged view has only its page, so a band taller than that is scaled to
  // fit (see viewerHeadingDesign).
  // The leaf the designs were drawn on, defaults filled in.
  const leafPage = resolvePageConfig(base.page);
  const leafOf = (margins: PageMargins | undefined): LeafGeometry => {
    const m = { ...leafPage.margins, ...margins };
    const at = (d: Dimension | undefined): number => (d ? dimensionToPx(d, dpi) : 0);
    return {
      width: at(leafPage.width),
      height: at(leafPage.height),
      margins: { top: at(m.top), right: at(m.right), bottom: at(m.bottom), left: at(m.left) },
    };
  };
  const layoutResolved = resolveLayoutConfig(base.layout);
  // A vertical page's heading designs are laid out in the flow's frame: x
  // down the page, y leftward from its right edge. The leaf and the
  // viewer's page are handed to them turned the same way, so a cover keeps
  // the leaf's shape, the leaf's height running down the screen, and an
  // element placed down the leaf is not cut at the leaf's width.
  const vertical = layoutResolved.writingMode === 'vertical-rl';
  const flowLeafOf = (margins: PageMargins | undefined): LeafGeometry =>
    vertical ? turnedLeaf(leafOf(margins)) : leafOf(margins);
  // The length of the viewer page's lines: its width, or its height when
  // the lines run down it.
  const lineLengthPx = vertical ? pageHeightPx : pageWidthPx;
  // The main text column of a viewer page, as the engine will cut it
  // (`computeColumnBboxes` on a page with no margins): the page itself,
  // half of it less the gutter, or what the side column leaves.
  const gutterPx = dimensionToPx(layoutResolved.gutterWidth, dpi);
  const columnWidthPx = layoutType === 'double'
    ? (lineLengthPx - gutterPx) / 2
    : layoutType === 'oneAndHalf'
      ? lineLengthPx * (1 - layoutResolved.sideColumnPercent / 100) - gutterPx
      : lineLengthPx;
  const designOpts = {
    // A band runs across the lines: down a horizontal page, which the
    // vertical scroll leaves unbounded, and across a vertical one, whose
    // width is always the page's.
    maxBandPx: vertical ? pageWidthPx : columnMode === 'single' ? null : pageHeightPx,
    pageWidthPx: lineLengthPx,
    columnWidthPx: Math.max(Math.min(columnWidthPx, lineLengthPx), 1),
    dpi,
    leaf: flowLeafOf(undefined),
  };
  const headingLevels = resolvedHeadings.levels.map((lvl) => ({
    ...lvl,
    breakBefore: { ...lvl.breakBefore, parity: 'any' as const },
    ...viewerHeadingDesign(lvl.advancedDesign, designOpts),
  }));
  // Room for the part title on the viewer's own divider: as many lines of
  // the H1 face as the longest title wraps to (two when the titles are not
  // known) plus half a line of air before the part's content.
  const partFace = partTitleFace(resolvedHeadings, dpi);
  const partFont = buildFontString(
    partFace.h1.fontFamily,
    partFace.fontSizePx,
    String(partFace.h1.fontWeight),
    partFace.h1.italic ? 'italic' : 'normal',
  );
  // Measured in the language the layout sets them in (#770), so the band
  // does not depend on the language of the page that hosts the Sandbox.
  const shapedIn = configShapingLanguage(base, locale);
  const partLines = partTitles && partTitles.length > 0
    ? Math.max(...partTitles.map((t) => countTitleLines(t, partFont, pageWidthPx, shapedIn)))
    : 2;
  const partBandPx = partFace.linePx * partLines;
  const parts: PostextConfig['parts'] = {
    ...base.parts,
    breakBefore: { ...base.parts?.breakBefore, parity: 'any' },
    // A part opens a scroll unit of its own; the blank verso that follows
    // its leaf in print would only be an empty screen here.
    breakAfter: { enabled: false, parity: 'any' },
    // The divider's page design and the margins that leave room for it are
    // built for the leaf, not for this surface: the viewer sets the title
    // as type at the top of the unit and starts the body under it.
    design: viewerPartDesign(partFace, partBandPx),
    versoDesign: { elements: [] },
    // Type coloured for the panel the print divider paints (white on the
    // part's colour) would vanish on the viewer's plain one: it takes the
    // text colours instead.
    ...(base.parts?.bodyStyle && paintsPage(base.parts.design)
      ? { bodyStyle: withoutColors(base.parts.bodyStyle) as NonNullable<PostextConfig['parts']>['bodyStyle'] }
      : {}),
    margins: {
      top: { value: partBandPx + partFace.linePx * 0.5, unit: 'px' },
      bottom: { value: 0, unit: 'px' },
      left: { value: 0, unit: 'px' },
      right: { value: 0, unit: 'px' },
    },
  };

  return {
    ...base,
    page: {
      ...base.page,
      dpi,
      width: { value: pageWidthPx, unit: 'px' },
      height: { value: pageHeightPx, unit: 'px' },
      margins: {
        top: { value: 0, unit: 'px' },
        bottom: { value: 0, unit: 'px' },
        left: { value: 0, unit: 'px' },
        right: { value: 0, unit: 'px' },
      },
      cutLines: { ...(base.page?.cutLines ?? {}), enabled: false },
      // baselineGrid.enabled is a pure display flag (layout uses the grid
      // value regardless of enabled), so let the user's setting flow through
      // to drive the SVG overlay in HtmlPreview.
      backgroundColor: { hex: 'transparent', model: 'hex' },
    },
    layout: {
      ...base.layout,
      layoutType,
      // A page here is a screen tall: a figure sized for the leaf may not
      // fit it, and one taller than the page would run off its foot.
      fitFiguresToPage: true,
      // No rectos or versos on screen: a side column at the outer edge
      // takes the right, one at the inner edge the left — except in the
      // vertical scroll, which has no spine to sit against, so a
      // leaf-relative side reads in the right margin either way. A side
      // set explicitly to left or right is kept as asked.
      ...(base.layout?.sideColumnSide === 'outer' ? { sideColumnSide: 'right' as const } : {}),
      ...(base.layout?.sideColumnSide === 'inner'
        ? { sideColumnSide: columnMode === 'single' ? ('right' as const) : ('left' as const) }
        : {}),
    },
    bodyText: {
      ...base.bodyText,
      optimalLineBreaking,
      hyphenation: {
        ...(base.bodyText?.hyphenation ?? {}),
        locale: hypLocale,
      },
      ...(disableParagraphRules
        ? {
            avoidOrphans: false,
            avoidWidows: false,
            avoidRunts: false,
            avoidOrphansInLists: false,
            avoidWidowsInLists: false,
            avoidRuntsInLists: false,
          }
        : {}),
    },
    headings: {
      ...base.headings,
      levels: headingLevels,
    },
    parts,
    ...(opts.comicWidthPx ? { comics: comicsViewerLeaf(base, leafPage, opts.comicWidthPx, columnMode === 'single' ? undefined : pageHeightPx) } : {}),
    // A composed page is fixed geometry, like a comic page: its frames
    // stand where the template puts them on the leaf, so it is laid out on
    // the leaf, never on a screen-sized page (whose foot is a scroll away
    // or a screen high) (#1045).
    ...(opts.composedLeaf ? { composedViewerLeaf: { width: leafPage.width, height: leafPage.height, margins: leafPage.margins } } : {}),
    // The HTML viewer is a continuous reading surface, not a page: running
    // headers and footers (folios, running titles, page-edge tabs anchored
    // to the bleed) have no place on it — neither the document's nor the
    // ones a heading style sets for its section's pages.
    header: { elements: [] },
    footer: { elements: [] },
    ...(base.headingStyles
      ? {
          headingStyles: base.headingStyles.map((style) => ({
            ...style,
            // No rectos here: a style's odd/even break keeps the break, not
            // the blank screen before it (see the levels above).
            ...(style.breakBefore ? { breakBefore: { ...style.breakBefore, parity: 'any' as const } } : {}),
            header: { elements: [] },
            footer: { elements: [] },
            // A section set in a newspaper grid reads as two columns, as
            // the document's does.
            ...(style.layout?.layoutType === 'multiple'
              ? { layout: { ...style.layout, layoutType: viewerLayoutType(style.layout.layoutType) } }
              : {}),
            // A style's page geometry belongs to the leaf it was measured
            // for — a cover's text box in the lower corner of a 225 mm page
            // leaves no content area at all on a viewer page.
            margins: undefined,
            ...viewerHeadingDesign(style.advancedDesign, { ...designOpts, leaf: flowLeafOf(style.margins) }),
          })),
        }
      : {}),
  };
}

/** The comics settings of a viewer pass: the document's, with the leaf
 *  comic pages are laid out on (`comics.viewerLeaf`). A comic page is
 *  fixed geometry — art cropped to panels, balloons set around the art — so
 *  the viewer shows the print page whole, scaled to `widthPx` (and no
 *  taller than `maxHeightPx`, a page of the paged view), instead of
 *  cutting panels out of a screen-sized page. */
export function comicsViewerLeaf(
  base: PostextConfig,
  leaf: { width: Dimension; height: Dimension; margins: PageMargins },
  widthPx: number,
  maxHeightPx?: number,
): NonNullable<PostextConfig['comics']> {
  return {
    ...base.comics,
    viewerLeaf: {
      width: leaf.width,
      height: leaf.height,
      margins: leaf.margins,
      fitWidth: Math.max(1, Math.floor(widthPx)),
      ...(maxHeightPx ? { fitHeight: Math.max(1, Math.floor(maxHeightPx)) } : {}),
    },
  };
}

/** The width of `sample` in the body face, px: the viewer's column. `lang`
 *  is the language the layout measures the text in
 *  (`configShapingLanguage`; undefined: the host's), so the column does
 *  not depend on the language of the page that hosts the Sandbox (#770). */
export function measureColumnWidthPx(
  sample: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: number,
  lang?: string,
): number {
  const font = buildFontString(fontFamily, fontSizePx, String(fontWeight), 'normal');
  return widthIn(lang, sample, font);
}

/** Whether `markdown` may hold a composed page (a `::::page` fence). */
export function hasComposedPages(markdown: string): boolean {
  return /^[ \t]*::::page\b/m.test(markdown);
}

/** Whether `markdown` may hold a comic page (a `:::page` fence). */
export function hasComicPages(markdown: string): boolean {
  return /^[ \t]*:::page\b/m.test(markdown);
}

/** A title's `\\` forced break, as the engine reads it (`TITLE_BREAK_RE`). */
const TITLE_BREAK_RE = /[ \t]*\\\\[ \t]*/g;

let partTitlesMemo: { markdown: string; titles: string[] } | null = null;

/** The part titles of `markdown` as a divider sets them — `{number}
 *  {titleText}`, forced breaks as `\n` — for `buildHtmlConfigOverride`'s
 *  `partTitles`. Memoised on the source: relayouts at a new width or font
 *  scale reuse the last parse. */
export function partTitlesOf(markdown: string): string[] {
  if (!markdown.includes(':::part')) return [];
  if (partTitlesMemo?.markdown === markdown) return partTitlesMemo.titles;
  const titles: string[] = [];
  for (const b of parseMarkdown(markdown)) {
    if (b.type !== 'containerStart' || b.containerName !== 'part') continue;
    const number = (b.containerAttrs?.number ?? '').trim();
    const title = (b.containerAttrs?.title ?? '').trim().replace(TITLE_BREAK_RE, '\n');
    titles.push(`${number} ${title}`.trim());
  }
  partTitlesMemo = { markdown, titles };
  return titles;
}
