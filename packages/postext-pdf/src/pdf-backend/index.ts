import {
  PDFDocument,
  PDFName,
  BlendMode,
  ReadingDirection,
} from 'pdf-lib';
import type { ResourceImageMap, SvgRasterizer } from './renderResourceBlock';
import fontkit from '@pdf-lib/fontkit';
import type { HyphenationLocale, PdfColorSpace, RenderWarning, VDTBlock, VDTDocument, VDTPage } from 'postext';
import { canonicalLocaleTag, cjkGridCells, columnClipRect, computePageTextExtent, dimensionToPx, pageColumnRule, verticalFlowOf } from 'postext';
import { FontCache, type FontFallback, type FontFileIssue, type FontMissingGlyphs, type PdfFontProvider, type PdfFontRequest } from '../fontCache';
import {
  type PageCtx,
  type PdfMatrix,
  colorFromHex,
  fillRectPx,
  makeScale,
  popClip,
  popFrame,
  pushClipRect,
  pushFrame,
  quarterTurnMatrix,
  mirrorMatrix,
  whiteColor,
} from './primitives';
// Register the painters of vertical and of complex-script text with the
// primitives.
import './verticalText';
import './shapedText';
import { codePointNeedsComplexShaping, loadComplexShaper } from '../complexShaping';
import type { HarfBuzzWasmSource } from '../harfbuzz';
import { collectFontText, type FontText } from './fontHelpers';
import {
  computeContentArea,
  renderBaselineGrid,
  renderCharacterGrid,
  renderColumnRule,
  renderFootnoteRules,
  renderCutLines,
} from './pageDecorations';
import { renderBlock, type ResourceRenderContext } from './blockRender';
import { renderHeaderFooterSlot } from './headerFooter';
import { renderComicPage } from './comic';
import { addOutlines, numberedHeadingText } from './outlines';
import { addPageLabels } from './pageLabels';
import {
  preloadResourceImages,
  type ResourceBytesProvider,
} from './renderResourceBlock';
import { anchorDestination, LinkRegistry } from './links';
import { StructTree, tagArtifact, type StructElem } from './tagging';
import { StructureFlow } from './structureFlow';
import { openTypeLanguageOf, withShapingLanguage } from '../shapingLanguage';

export interface RenderToPdfOptions {
  fontProvider: PdfFontProvider;
  pageNegative?: boolean;
  /** Emit a PDF outline tree (bookmarks) so readers can jump between
   *  headings. When omitted, the first document's
   *  `config.pdfGeneration.outlines`, else true. */
  outlines?: boolean;
  /** Force every colour in the rendered output through the given PDF colour
   *  space. When omitted, the first document's `config.pdfGeneration`
   *  (`colorSpace`, while its `forceColorSpace` is on), else `'rgb'`
   *  (pdf-lib's native output). In `'cmyk'`, crop marks are painted in
   *  registration colour (the `/All` separation), so they print on every
   *  plate. */
  colorSpace?: PdfColorSpace;
  /** Resolver for resource binary bytes by `fileId`. The bytes are sniffed:
   *  bitmaps embed as images, SVG markup is emitted as vector paths (or
   *  rasterised in the browser when it uses unsupported features), and a
   *  single-page PDF is embedded verbatim. An SVG with a print master
   *  (`Resource.svg.pdfFileId`) is asked for by the master's id first,
   *  wherever it is drawn (a figure, a table cell, a design image, a box
   *  icon) — its first page is embedded in place of the SVG unless
   *  `diagramStyle.singleInk` is on — and by the SVG's own id when the
   *  master is missing or does not decode. When omitted, resource images
   *  are drawn as placeholders. */
  resourceBytes?: ResourceBytesProvider;
  /** Emit an accessible, tagged PDF (PDF/UA-1 oriented): logical structure
   *  tree, alt text on figures, document language and title, decoration
   *  flagged as artifacts. When omitted, the first document's
   *  `config.pdfGeneration.accessible`, else true. */
  accessible?: boolean;
  /** Draw the character grid (`cjk.grid.show`) over the type area, as
   *  the canvas and HTML do on screen. Default false: the grid is a
   *  screen aid and stays out of a file meant for print. */
  characterGrid?: boolean;
  /** Called as the render advances: after the fonts and resources are
   *  embedded, after every page, and before the file is written. */
  onProgress?: (progress: RenderProgress) => void;
  /** Rasterises an SVG the vector subset cannot draw. Defaults to the
   *  document's `Image` + canvas; a worker must supply one (its host's). */
  rasterizeSvg?: SvgRasterizer;
  /** Called for each non-fatal problem met while rendering (see
   *  {@link PdfWarning}): a face the font provider rejected and another cut
   *  of its family embedded instead (`fontFallback`); characters no file of
   *  a face has a glyph for (`missingGlyph`, once per face, after the pages
   *  are drawn); a variable font asked for at a weight other than its
   *  default instance (`variableFontDefaultInstance`); a CFF face over
   *  2 MB embedded whole (`cffEmbeddedWhole`); and an image with no bytes
   *  from `resourceBytes` (or bytes that did not decode), drawn as a
   *  placeholder and reported once per `fileId` as a `missingImage` warning
   *  carrying the page and the index of its document in `input`. Without
   *  it, the font warnings go to `console.warn` with their `message`, and
   *  a `missingImage` is not reported. A document that sets right-to-left
   *  or joining text while HarfBuzz cannot be loaded gets a
   *  `complexShapingUnavailable` warning. */
  onWarning?: (warning: PdfWarning) => void;
  /** Where to load HarfBuzz's `harfbuzz.wasm` from, for a document that
   *  sets right-to-left or joining scripts: its URL (a relative one
   *  resolves against the page's location) or its bytes. When omitted, the copy
   *  beside postext-pdf's module (`dist/harfbuzz.wasm`, which a bundler
   *  emits as an asset), then the same harfbuzzjs release from jsDelivr
   *  and esm.sh. Give it when a host serves the package's files elsewhere
   *  and cannot reach those CDNs. Only the first successful load counts:
   *  HarfBuzz is loaded once per module instance. */
  harfbuzzWasm?: HarfBuzzWasmSource;
}

/** Right-to-left or joining text drawn without HarfBuzz. */
export interface PdfComplexShapingWarning {
  /** `complexShapingUnavailable`: the pages set right-to-left or joining
   *  text (Arabic, Hebrew, Syriac…) and HarfBuzz could not be loaded (no
   *  WebAssembly, `harfbuzz.wasm` found nowhere). The PDF is drawn with
   *  fontkit's shaping: Arabic keeps its joining but loses its mark
   *  positions (harakat and dots collide or drift), and a right-to-left
   *  run with digits or Latin in it may read in the wrong order. Point
   *  `harfbuzzWasm` at the file. */
  kind: 'complexShapingUnavailable';
  /** Every place the binary was looked for, and why it failed. */
  reason: string;
  message: string;
}

/** A face set in another cut of its family. The render goes on; the text
 *  keeps its layout but is drawn in the substitute face. */
export interface PdfFontFallbackWarning {
  /** `fontFallback`: the font provider rejected a face the pages use, and
   *  another face of the same family is embedded in its place — the first
   *  that loads among the nine standard weights in CSS font-matching order,
   *  in the same style first and then in the other (italic ↔ upright). The
   *  text keeps its layout (positions come from the VDT) but is drawn in
   *  the substitute face. */
  kind: 'fontFallback';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The face embedded instead. */
  fallback: { weight: number; style: 'normal' | 'italic' };
  /** The provider's error message for the rejected face. */
  reason: string;
  /** A one-line English description, for logs. */
  message: string;
}

/** Characters a face has no glyph for in any of its files. */
export interface PdfMissingGlyphWarning {
  /** `missingGlyph`: the pages set characters that no file the font
   *  provider gave for this face has a glyph for. The PDF still builds;
   *  each of them is drawn as the font's `.notdef` glyph (an empty box, or
   *  nothing, depending on the font) at the width the layout measured.
   *  Reported once per face, after the pages are drawn. Typical causes: a
   *  provider that returns only a Latin file for a Chinese family, or a
   *  font's named subset that leaves marks out (Fontsource's
   *  `chinese-traditional` file has no full-width ，！？（）). */
  kind: 'missingGlyph';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The characters, in the order the pages first set them. */
  characters: string[];
  message: string;
}

/** A variable font embedded at its default instance. */
export interface PdfVariableFontWarning {
  /** `variableFontDefaultInstance`: the provider answered a face with a
   *  variable font (it has an `fvar` table) whose default instance is
   *  another weight. pdf-lib embeds the default instance only, so text in
   *  this face prints at `defaultWeight`. Give the provider a static file
   *  per weight (fontTools `instancer` makes one). */
  kind: 'variableFontDefaultInstance';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  defaultWeight: number;
  message: string;
}

/** A large CFF face embedded whole. */
export interface PdfCffEmbeddedWholeWarning {
  /** `cffEmbeddedWhole`: a CFF-flavoured OpenType file (`.otf`) over 2 MB
   *  went into the PDF whole, since postext-pdf does not subset CFF
   *  outlines. A CJK face such as Source Han Serif adds 8 to 25 MB per
   *  weight; its TrueType build (Noto Serif CJK from Google Fonts or
   *  Fontsource) is subset to the glyphs used. */
  kind: 'cffEmbeddedWhole';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Size of the file, in bytes. */
  bytes: number;
  message: string;
}

/** A non-fatal problem met while rendering a PDF. The render goes on; the
 *  output differs from what the document asked for in the way described:
 *  a font fallback ({@link PdfFontFallbackWarning}), characters a face
 *  lacks ({@link PdfMissingGlyphWarning}), a variable font set at its
 *  default weight ({@link PdfVariableFontWarning}), a CFF face embedded
 *  whole ({@link PdfCffEmbeddedWholeWarning}), right-to-left or joining
 *  text shaped without HarfBuzz ({@link PdfComplexShapingWarning}), or
 *  one of the engine's
 *  render warnings (`RenderWarning`: an image painted as a placeholder,
 *  `formatWarning` describes it). Narrow on `kind`. */
export type PdfWarning =
  | PdfFontFallbackWarning
  | PdfMissingGlyphWarning
  | PdfVariableFontWarning
  | PdfCffEmbeddedWholeWarning
  | PdfComplexShapingWarning
  | RenderWarning;

/** The font warnings: the kinds that carry a `message`, logged when the
 *  caller passes no `onWarning`. */
export type PdfFontWarning = Exclude<PdfWarning, RenderWarning>;

const faceName = (weight: number, style: string) => `${weight}${style === 'italic' ? ' italic' : ''}`;

/** The warning of a face set in another cut of its family. */
function fontFallbackWarning(f: FontFallback): PdfFontFallbackWarning {
  return {
    kind: 'fontFallback',
    ...f,
    message: `postext-pdf: "${f.family}" ${faceName(f.weight, f.style)} is not available from the font provider (${f.reason}); using ${faceName(f.fallback.weight, f.fallback.style)} instead`,
  };
}

/** How many characters a missing-glyph message lists. */
const LISTED_CHARACTERS = 12;

function missingGlyphWarning(m: FontMissingGlyphs): PdfMissingGlyphWarning {
  const shown = m.characters.slice(0, LISTED_CHARACTERS).join(' ');
  const more = m.characters.length > LISTED_CHARACTERS ? ` and ${m.characters.length - LISTED_CHARACTERS} more` : '';
  const count = m.characters.length === 1 ? '1 character' : `${m.characters.length} characters`;
  return {
    kind: 'missingGlyph',
    ...m,
    message: `postext-pdf: "${m.family}" ${faceName(m.weight, m.style)} has no glyph for ${count} (${shown}${more}); the PDF draws them as the font's .notdef glyph`,
  };
}

function fileIssueWarning(issue: FontFileIssue): PdfVariableFontWarning | PdfCffEmbeddedWholeWarning {
  const face = `"${issue.family}" ${faceName(issue.weight, issue.style)}`;
  if (issue.kind === 'variableFontDefaultInstance') {
    return {
      ...issue,
      message: `postext-pdf: ${face} is a variable font; the PDF embeds its default instance, so this text prints at weight ${issue.defaultWeight}. Provide a static ${issue.weight} file.`,
    };
  }
  return {
    ...issue,
    message: `postext-pdf: ${face} is a CFF (.otf) font of ${(issue.bytes / (1024 * 1024)).toFixed(1)} MB, embedded whole; a TrueType build of the face would be subset to the glyphs used.`,
  };
}

export interface RenderProgress {
  phase: 'prepare' | 'pages' | 'save';
  /** Pages rendered so far, and how many there are. */
  pages: number;
  totalPages: number;
}

export type { PdfFontProvider, PdfFontRequest };
export type { ResourceBytesProvider } from './renderResourceBlock';

/** BCP 47 tag of a document (`/Lang`): its `locale` (`'zh-Hant-TW'`,
 *  script and region kept), else the tag its hyphenation was asked for
 *  (`'es-ES'`, `'sv'`) when the patterns are another locale's, else the
 *  patterns' own (`'en-us'` → `'en-US'`). */
function languageTag(config: { locale?: string; bodyText?: { hyphenation?: { locale?: HyphenationLocale; tag?: string } } } | undefined): string | undefined {
  const declared = canonicalLocaleTag(config?.locale);
  if (declared) return declared;
  const hyphenation = config?.bodyText?.hyphenation;
  const locale = hyphenation?.tag?.trim() || hyphenation?.locale;
  if (!locale) return undefined;
  // Canonical case: language lower, a two-letter region upper, the script
  // and variant subtags as given.
  return locale.replace(/_/g, '-').split('-')
    .map((sub, i) => (i === 0 ? sub.toLowerCase() : sub.length === 2 ? sub.toUpperCase() : sub))
    .join('-');
}

/** A metadata value as PDF text. The engine hands the printed fields over
 *  as strings; a VDT from elsewhere may still carry typed YAML values
 *  (`title: 1984` is a number, a date a `Date`, `author: [A, B]` a list),
 *  which pdf-lib rejects — coerce them rather than throw. */
function metadataString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (Array.isArray(value)) {
    const items = value.map(metadataString).filter((v): v is string => !!v);
    return items.length > 0 ? items.join(', ') : undefined;
  }
  return undefined;
}

/** Title of the document for the PDF metadata: the declared title, else the
 *  first heading (PDF/UA-1 §7.1 requires one). */
function documentTitle(docs: readonly VDTDocument[]): string {
  const declared = metadataString(docs[0]?.metadata?.title)?.trim();
  if (declared) return declared;
  let best: VDTBlock | undefined;
  for (const doc of docs) {
    for (const block of doc.blocks) {
      if (block.type !== 'heading') continue;
      if (!best || (block.headingLevel ?? 1) < (best.headingLevel ?? 1)) best = block;
      if ((best.headingLevel ?? 1) === 1) break;
    }
    if (best && (best.headingLevel ?? 1) === 1) break;
  }
  return (best && numberedHeadingText(best)) || 'Document';
}

/** The heading element an opener band's text belongs to: the part title on
 *  a part-divider page, else the `span: 'page'` heading the band replaced
 *  (hidden in its column, its lines still set — a structural `hidden`
 *  heading, whose lines have no height, prints nothing at all), else a
 *  plain paragraph. */
function openerTextElem(page: VDTPage, structure: StructureFlow): () => StructElem {
  let elem: StructElem | undefined;
  return () => {
    if (elem) return elem;
    if (page.partInfo) return (elem = structure.partHeading());
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.hidden && block.type === 'heading' && (block.lines[0]?.bbox.height ?? 0) > 0) return (elem = structure.blockElem(block));
      }
    }
    return (elem = structure.tree.root.child('P'));
  };
}

/** Paint one page, its text shaped in the language system of its
 *  document's language (`shapingLanguage.ts`: `JAN ` for Japanese, the
 *  font's default for any other). */
function renderPage(...args: Parameters<typeof paintPage>): void {
  withShapingLanguage(openTypeLanguageOf(languageTag(args[2].config)), () => paintPage(...args));
}

function paintPage(
  pdfDoc: PDFDocument,
  vdtPage: VDTPage,
  doc: VDTDocument,
  fontCache: FontCache,
  pageNegative: boolean,
  colorSpace: PdfColorSpace,
  resourceCtx: ResourceRenderContext,
  tree: StructTree | undefined,
  onMissingImage?: PageCtx['onMissingImage'],
  characterGrid = false,
): void {
  const scale = makeScale(doc.config.page.dpi);
  const pageWidthPt = vdtPage.width * scale;
  const pageHeightPt = vdtPage.height * scale;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  // With cut lines the sheet carries the bleed and the marks: say where the
  // page is trimmed and how far its art runs, for imposition and preflight.
  if (doc.config.page.cutLines.enabled) {
    const trimPt = doc.trimOffset * scale;
    const bleedPt = Math.max(0, doc.trimOffset - dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)) * scale;
    page.setTrimBox(trimPt, trimPt, pageWidthPt - 2 * trimPt, pageHeightPt - 2 * trimPt);
    page.setBleedBox(bleedPt, bleedPt, pageWidthPt - 2 * bleedPt, pageHeightPt - 2 * bleedPt);
  }
  const ctx: PageCtx = { page, pageHeightPt, scale, colorSpace, tags: tree?.beginPage(page), ...(onMissingImage ? { onMissingImage } : {}) };
  const structure = resourceCtx.structure;

  // Background: full page white first (cut-mark area stays white), then the
  // trim+bleed area filled with the configured page background colour.
  tagArtifact(ctx, { type: 'Background' });
  fillRectPx(ctx, 0, 0, vdtPage.width, vdtPage.height, whiteColor(colorSpace));

  // A part's or a styled section's palette may give the page its own paper.
  const bgHex = vdtPage.background ?? doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;
  const bleedPx = trimOff > 0
    ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)
    : 0;
  if (bgHex && bgHex !== 'transparent') {
    fillRectPx(
      ctx,
      trimOff - bleedPx,
      trimOff - bleedPx,
      vdtPage.width - (trimOff - bleedPx) * 2,
      vdtPage.height - (trimOff - bleedPx) * 2,
      colorFromHex(bgHex, colorSpace),
    );
  }

  // With cut lines the sheet also carries the slug, where only the marks
  // print: everything the page paints is clipped to the bleed box, as a
  // DTP export clips it (EF-133). The marks are drawn after the clip ends.
  const bleedClip = trimOff > 0;
  if (bleedClip) {
    const inset = Math.max(0, trimOff - bleedPx);
    pushClipRect(ctx, inset, inset, vdtPage.width - inset * 2, vdtPage.height - inset * 2);
  }

  // A vertical page (`VDTPage.flow`) paints its flow through the page's
  // frame, a quarter turn clockwise (the `'cw'` resource matrix with its
  // origin at the sheet's right edge), and maps the rects that live outside
  // the content stream through it (`pushFrame`): link annotations of the
  // text, contents rows, `:ref`s and page links, the named destinations of
  // resources and notes, structure bounding boxes. Its text is set down the
  // column (`verticalText.ts`): characters upright through the fonts'
  // vertical twins, Latin words and long numbers sideways. Running heads,
  // folios and the marks stay on the sheet.
  // A right-to-left page (`VDTMirroredFlowFrame`) paints its flow through
  // its mirror the same way, with `ctx.mirror` on: each text object and
  // picture is turned back about its own box (`pushTextObject`,
  // `counterFlipPx`), so the geometry lands mirrored and the text reads as
  // written. Link and structure rects map through the frame too.
  let flowMatrix: PdfMatrix | undefined;
  const vflow = verticalFlowOf(vdtPage);
  if (vflow) {
    flowMatrix = quarterTurnMatrix(vflow.rotation, scale, pageHeightPt);
    pushFrame(ctx, flowMatrix);
    ctx.vertical = {
      region: doc.config.cjk?.region ?? 'mainland',
      uprightDigits: doc.config.cjk?.uprightDigits ?? 2,
      ...(vflow.centralBaselines ? { axes: vflow.centralBaselines } : {}),
    };
  } else if (vdtPage.flow?.writingMode === 'horizontal-tb') {
    flowMatrix = mirrorMatrix(vdtPage.flow.mirror.originX, scale);
    pushFrame(ctx, flowMatrix);
    ctx.mirror = true;
  }

  tagArtifact(ctx, { type: 'Layout' });
  if (doc.config.page.baselineGrid.enabled) {
    // Bound the grid to the page's actual text: from the first text line to
    // the last (mirrors the canvas backend). Pages with no text draw no grid.
    const textExtent = computePageTextExtent(vdtPage);
    if (textExtent) {
      const contentArea = computeContentArea(vdtPage, doc);
      const gridLineWidthPx = dimensionToPx(
        doc.config.page.baselineGrid.lineWidth,
        doc.config.page.dpi,
      );
      renderBaselineGrid(
        ctx,
        contentArea,
        doc.baselineGrid,
        doc.config.page.baselineGrid.color.hex,
        gridLineWidthPx,
        textExtent,
      );
    }
  }

  // The character grid, only when the render asks for it.
  if (characterGrid && doc.config.cjk?.grid?.show) {
    const cells = cjkGridCells(doc.config, vdtPage.contentArea ?? computeContentArea(vdtPage, doc), doc.baselineGrid, vdtPage.columns, vdtPage.flow);
    if (cells) renderCharacterGrid(ctx, cells);
  }

  // The page's own rule on a styled section's pages, else the document's
  // (mirrors the canvas backend via `pageColumnRule`).
  const columnRule = pageColumnRule(vdtPage, doc);
  if (columnRule.enabled && vdtPage.columns.length > 1) {
    renderColumnRule(ctx, vdtPage.columns, columnRule.color, columnRule.lineWidthPx, vdtPage.footnoteAreas);
  }

  // Opener / part bands go under the columns so their backgrounds sit
  // beneath the body text (mirrors the canvas backend). Their text is the
  // chapter / part heading; the rest of the band is decoration.
  if (vdtPage.openerBand) {
    renderHeaderFooterSlot(
      ctx,
      vdtPage.openerBand,
      fontCache,
      resourceCtx.images,
      structure
        ? {
            text: openerTextElem(vdtPage, structure),
            artifact: { type: 'Layout' },
            figure: (alt, attributes, after) => structure.designFigure(alt, attributes, after),
          }
        : undefined,
    );
  }

  // The anchors of the page (#264): where cross-references jump to, and
  // named destinations (`file.pdf#nameddest=id`).
  for (const anchor of doc.anchors ?? []) {
    if (anchor.pageIndex !== vdtPage.index) continue;
    const at: [number, number, number, number] = [anchor.x * scale, pageHeightPt - anchor.y * scale, anchor.x * scale, pageHeightPt - anchor.y * scale];
    const [left, , , top] = ctx.mapRectPt ? ctx.mapRectPt(at) : at;
    resourceCtx.linkRegistry.addDestination(anchorDestination(anchor.id), ctx.page, left, top, anchor.id);
  }

  // Clip to column bounds, widened for glyph ink and for design overlays
  // that hang past the column on purpose — the same rectangle the canvas
  // backend clips to (see `columnClipRect`). Only a document that hangs
  // marks (`cjk.hangingPunctuation`) has lines whose marks reach past it.
  const hanging = doc.config.cjk?.hangingPunctuation !== 'none';
  for (const col of vdtPage.columns) {
    const clip = columnClipRect(col, doc.config.page.dpi, hanging);
    pushClipRect(ctx, clip.x, clip.y, clip.width, clip.height);
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) {
        // Painted below, but read in its place among the contents rows.
        if (structure && !block.hidden && block.designOverlay.blocks.some((b) => b.kind === 'text')) {
          structure.blockElem(block);
        }
        continue;
      }
      renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
    }
    popClip(ctx);
    // A part row of the contents carries a design of its own, which may
    // run past the column (a band reaching beyond the page numbers): it
    // is drawn outside the column clip, like a float.
    for (const block of col.blocks) {
      if (!block.tocPart || !block.designOverlay) continue;
      const paint = () => renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
      if (structure) structure.aside(paint);
      else paint();
    }
  }

  // Floated resources sit outside the column clip (a `span: 'page'` float can
  // cross the gutter); they carry an absolute bbox positioned at build time.
  // A tagged render reads each one after the text that cites it (EF-146).
  if (vdtPage.floats) {
    for (const fb of vdtPage.floats) {
      const paint = () => renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x, fontCache, resourceCtx);
      if (structure) structure.readFloat(fb, paint);
      else paint();
    }
  }

  // The footnote separators are layout.
  if (vdtPage.footnoteAreas?.some((a) => a.rule)) {
    tagArtifact(ctx, { type: 'Layout' });
    renderFootnoteRules(ctx, vdtPage);
  }

  if (flowMatrix) {
    popFrame(ctx);
    delete ctx.vertical;
    delete ctx.mirror;
  }

  // A comic page's panels and lettering, on the sheet (never through the
  // flow frame), under the running heads.
  if (vdtPage.comic) renderComicPage(ctx, vdtPage.comic, fontCache, resourceCtx.images, structure);

  // Running headers and footers are pagination artifacts.
  const pagination = (subtype: 'Header' | 'Footer') =>
    structure ? { artifact: { type: 'Pagination' as const, subtype } } : undefined;
  if (vdtPage.header) renderHeaderFooterSlot(ctx, vdtPage.header, fontCache, resourceCtx.images, pagination('Header'));
  if (vdtPage.footer) renderHeaderFooterSlot(ctx, vdtPage.footer, fontCache, resourceCtx.images, pagination('Footer'));

  if (bleedClip) popClip(ctx);

  // Page negative: overlay white rect with Difference blend across trim+bleed.
  // Crop marks remain un-inverted (drawn afterwards).
  tagArtifact(ctx, { type: 'Page' });
  if (pageNegative) {
    const invX = trimOff - bleedPx;
    const invY = trimOff - bleedPx;
    const invW = vdtPage.width - (trimOff - bleedPx) * 2;
    const invH = vdtPage.height - (trimOff - bleedPx) * 2;
    fillRectPx(ctx, invX, invY, invW, invH, whiteColor(colorSpace), BlendMode.Difference);
  }

  renderCutLines(ctx, vdtPage, doc);
  ctx.tags?.close();
}

/** The output settings of a render: each one from `options` when given,
 *  else from the document's `config.pdfGeneration` (a colour space only
 *  while its `forceColorSpace` is on), else the default — RGB, bookmarks
 *  and tagging on. */
function pdfSettings(
  options: Pick<RenderToPdfOptions, 'outlines' | 'accessible' | 'colorSpace'>,
  doc: VDTDocument | undefined,
): { outlines: boolean; accessible: boolean; colorSpace: PdfColorSpace } {
  const gen = doc?.config.pdfGeneration;
  return {
    outlines: options.outlines ?? gen?.outlines ?? true,
    accessible: options.accessible ?? gen?.accessible ?? true,
    colorSpace: options.colorSpace ?? (gen?.forceColorSpace ? gen.colorSpace : undefined) ?? 'rgb',
  };
}

/**
 * Render one document — or a book, as the documents of its chapters in
 * order, each laid out with the continuation of the ones before it — into
 * one PDF. The chapters share fonts, embedded resources and the structure
 * tree; page indices in contents links are book-absolute already, so they
 * resolve across chapters.
 */
/** `/ViewerPreferences << /Direction /R2L >>` and `/PageLayout
 *  /TwoPageRight` (page 1 alone, then pairs), for a right-bound book. */
export function setRightToLeft(pdfDoc: PDFDocument): void {
  pdfDoc.catalog.getOrCreateViewerPreferences().setReadingDirection(ReadingDirection.R2L);
  pdfDoc.catalog.set(PDFName.of('PageLayout'), PDFName.of('TwoPageRight'));
}

/** Whether any face sets a character HarfBuzz shapes. */
function setsComplexScript(fontText: FontText): boolean {
  for (const cps of fontText.values()) for (const cp of cps) if (codePointNeedsComplexShaping(cp)) return true;
  return false;
}

export async function renderToPdf(
  input: VDTDocument | VDTDocument[],
  options: RenderToPdfOptions,
): Promise<Uint8Array> {
  const docs = Array.isArray(input) ? input : [input];
  const first = docs[0];
  if (!first) throw new Error('postext-pdf: nothing to render');
  const totalPages = docs.reduce((n, d) => n + d.pages.length, 0);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const metaTitle = metadataString(first.metadata?.title);
  const metaAuthor = metadataString(first.metadata?.author);
  if (metaTitle) pdfDoc.setTitle(metaTitle);
  if (metaAuthor) pdfDoc.setAuthor(metaAuthor);
  pdfDoc.setCreator('postext');
  pdfDoc.setProducer('postext-pdf');

  const warn = options.onWarning ?? ((w: PdfWarning) => { if ('message' in w) console.warn(w.message); });
  const fontCache = new FontCache(pdfDoc, options.fontProvider, {
    onFallback: (f) => warn(fontFallbackWarning(f)),
    onFileIssue: (issue) => warn(fileIssueWarning(issue)),
  });
  // The faces of every chapter at once, each with the characters set in
  // it: a provider serving a family as slices is asked once per face.
  const fontText: FontText = new Map();
  for (const doc of docs) collectFontText(doc, fontText);
  await fontCache.preloadFontStrings(fontText);
  // HarfBuzz (WebAssembly) is fetched only for a document that sets
  // right-to-left or joining scripts; the pages are then shaped with it
  // synchronously. Without it the PDF still builds, its Arabic marks
  // misplaced: said loudly, since nothing else in the file shows it.
  if (setsComplexScript(fontText)) {
    await loadComplexShaper(options.harfbuzzWasm, ({ reason }) => warn({
      kind: 'complexShapingUnavailable',
      reason,
      message: `postext-pdf: HarfBuzz did not load, so right-to-left and joining text is shaped with fontkit and its marks are misplaced (${reason})`,
    }));
  }

  const missing = fontCache.missing();
  if (missing.length > 0) {
    throw new Error(
      `postext-pdf: failed to load font(s): ${missing.join(', ')}`,
    );
  }

  // Each setting: the option when given, else the first document's
  // `pdfGeneration`, else the default.
  const settings = pdfSettings(options, first);
  const colorSpace = settings.colorSpace;

  // Accessible output: the structure tree the pages tag their content into.
  const tree = settings.accessible
    ? new StructTree(pdfDoc, {
        title: documentTitle(docs),
        author: metaAuthor,
        lang: languageTag(first.config),
        producer: 'postext-pdf',
        creatorTool: 'postext',
        // Vertical text: the document's layout reads top to bottom, lines
        // right to left (`WritingMode /TbRl`, inherited by every element).
        ...(first.config.layout.writingMode === 'vertical-rl' ? { writingMode: 'TbRl' as const } : {}),
      })
    : undefined;

  // Resource images are embedded up front (async) so page rendering stays
  // sync; one map for every document, so a figure reused across chapters
  // is embedded once.
  const resourceImages: ResourceImageMap = new Map();
  for (const doc of docs) {
    await preloadResourceImages(pdfDoc, doc, options.resourceBytes, fontCache, options.fontProvider, resourceImages, options.rasterizeSvg);
  }
  options.onProgress?.({ phase: 'prepare', pages: 0, totalPages });

  // Contents links carry book-absolute page indices; the registry maps them
  // onto the PDF's pages from the first document's offset.
  const linkRegistry = new LinkRegistry(first.pageIndexOffset ?? 0);
  let rendered = 0;
  // Placeholders are reported once per image for the whole file.
  const onWarning = options.onWarning;
  const reportedImages = new Set<string>();
  for (const [documentIndex, doc] of docs.entries()) {
    // Block ids restart per document: each gets its own structure flow
    // (paragraph fragments, lists and callouts never span chapters).
    const resourceCtx: ResourceRenderContext = {
      images: resourceImages,
      linkRegistry,
      structure: tree ? new StructureFlow(tree) : undefined,
    };
    linkRegistry.documentIndex = documentIndex;
    for (const page of doc.pages) {
      const onMissingImage = onWarning
        ? (fileId: string, resourceId?: string) => {
            if (reportedImages.has(fileId)) return;
            reportedImages.add(fileId);
            onWarning({ kind: 'missingImage', fileId, ...(resourceId !== undefined ? { resourceId } : {}), pageIndex: page.index, documentIndex });
          }
        : undefined;
      renderPage(pdfDoc, page, doc, fontCache, options.pageNegative ?? false, colorSpace, resourceCtx, tree, onMissingImage, options.characterGrid ?? false);
      rendered++;
      options.onProgress?.({ phase: 'pages', pages: rendered, totalPages });
    }
  }

  // Attach inline-ref link annotations now that every destination is known.
  linkRegistry.finalize(pdfDoc, tree);

  if (settings.outlines) {
    addOutlines(pdfDoc, docs);
  }

  addPageLabels(pdfDoc, docs);

  tree?.finalize();
  // A right-bound book (`VDTDocument.binding`) tells viewers to lay its
  // spreads out right to left, page 1 alone (Acrobat and Foxit follow it;
  // Chrome's viewer does not).
  if (first.binding === 'right') setRightToLeft(pdfDoc);
  // Untagged output declares its language too (the tagged one did above).
  if (!tree) {
    const lang = languageTag(first.config);
    if (lang) pdfDoc.setLanguage(lang);
  }

  // Characters drawn with no glyph, once per face.
  for (const m of fontCache.missingGlyphs()) warn(missingGlyphWarning(m));

  // A face asked for but never drawn with is not written.
  fontCache.dropUnusedFonts();

  options.onProgress?.({ phase: 'save', pages: rendered, totalPages });
  return pdfDoc.save();
}
