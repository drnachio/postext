/** Comics (`:::page`, #555–#563): the split grammar, the panel script, the
 *  page geometry, the picture crop and the page layout. */
export {
  parseComicSplit,
  serializeComicSplit,
  moveComicSplitLine,
  splitComicCell,
  mergeComicCells,
  comicSplitLines,
  comicSplitLeaves,
  comicSplitListAt,
  COMIC_MIN_CELL_PERCENT,
} from './split';
export type { ComicSplitAxis, ComicSplitSize, ComicSplitItem, ComicSplitList, ComicSplitToken, ComicSplitIssue, ComicSplitParse } from './split';
export { parseComicScript, parseComicPoint, readBalloonText } from './script';
export type { ComicScriptLine } from './script';
export { parseComicFence, isComicFence, COMIC_FENCES } from './page';
export { comicGeometry, pointInPolygon, polygonBBox, physicalSide } from './geometry';
export type { ComicCell, ComicSplitLine, ComicGeometry, ComicGeometryInput, ComicFrameSide } from './geometry';
export { comicArtCrop, comicCropFeasibleRange, comicArtPointToPage, comicArtRectToPage, anchorsOutsideSafeArea } from './art';
export type { ComicCropInput, ComicCrop } from './art';
export { layoutComicPage, comicViewerLeaf, letterPanels, comicLetteringStyle, comicLetteringLocale, comicLetteringVertical, comicPageDirection, comicPanelPadding, parseComicDimension, comicPageLayoutWarnings } from './layoutPage';
export type { ComicPageContext, LetterPanelsInput } from './layoutPage';
export { letterPanel, letterPanelDetailed, presetLetteringStyles } from './lettering';
export type { LetteringItem, LetteringPanel, LetteringStyle, LetteringAnchor, LetteringDiagnostic, LetteringResult, LetteringEnv } from './lettering';
export { comicSourceWarnings } from './warnings';
export { layoutComicFrame, comicPageFrame } from './layoutPage';
export type { ComicFrameContext } from './layoutPage';
export { layoutComicStrip, comicStripPlacement, comicStripExtent, comicStripAspect, comicSplitGrid, parseComicAspect, parseComicStripWidth, parseComicStripAlign, comicStripWidth, comicStripOffset } from './strip';
export type { ComicStripPlacement, ComicStripContext, ComicStripAlign } from './strip';
export { layoutComicSpread, isComicSpread } from './spread';
export type { ComicSpreadContext, ComicSpreadPage } from './spread';
export { translateComicPage, translateComicPanel, translateComicSplitter, translateComicBalloon, translateSvgPath, comicBlockOnSheet, pageComics } from './transform';
export { comicFontFamilies, markdownHasComics } from './fonts';
export { COMIC_RESERVED_KEYS } from './types';
export type { ComicPageSource, ComicPanelSource, ComicScriptItem, ComicScriptRole, ComicSourceRange, ComicTailSide } from './types';
export {
  comicBalloonKind,
  comicBalloonText,
  comicSpeakerName,
  comicBalloonGroups,
  comicPanelPathData,
  comicBorderPathData,
  comicRoughBorder,
  polygonPathData,
  comicPanelContinues,
  isComicSpreadPartner,
  joinComicSpread,
  comicBalloonMatrix,
} from './paint';
export type { ComicBalloonKind } from './paint';
