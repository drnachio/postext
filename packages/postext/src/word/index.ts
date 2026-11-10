/**
 * `postext/word`: Word documents in and out. Export: three writers.
 * `semanticDocx` is the flow writer (#1387, #1458): an editable document of
 * native Word structures (styles, lists, tables, notes, fields), set with
 * the book's design as far as Word allows (`design: 'book'`, the default)
 * or with none of it, content only (`design: 'plain'`). `facsimileDocx`
 * is the page facsimile: every line of the PDF's pages in a placed text
 * box. All three files embed an export map, so the edits made in Word go
 * back into the exact Markdown and resource positions (`applyDocxEdits`).
 * A flow file that Google Docs saved comes back without the map: it is
 * written again from the book (`rebuildExportMap`).
 * Import of any other .docx (#599): read it into Postext Markdown with a
 * style template and a quality report. Pure code (fflate and a small XML
 * reader): runs in the browser, a Worker and Node.
 *
 * @module
 */

export { semanticDocx, semanticExportMap, SEMANTIC_ENGINE, SEMANTIC_STYLE, preferredWordVariant } from './semantic/index.js';
export type { SemanticDocxOptions, SemanticDesign, SemanticExportMap, WordChapterInput, SemanticWarning } from './semantic/index.js';
export { facsimileDocx, FACSIMILE_ENGINE, formattedDocx, FORMATTED_ENGINE } from './formatted/index.js';
export type { FacsimileDocxOptions, FacsimileWarning, FormattedDocxOptions, FormattedWarning } from './formatted/index.js';
export { exportMapLost, isExportedDocx, applyDocxEdits, rebuildExportMap } from './roundtrip/index.js';
export type { DocxEditSource, DocxEdit, DocxEditResult, DocxComment, DocxImportNote, DocxBook, RebuiltMap } from './roundtrip/index.js';
export { planWordFonts, wordFontFor } from './fonts/index.js';
export type { WordFontPlan, SourceFace, WordFontRef, FontWarning, PlanWordFontsOptions } from './fonts/index.js';
export { texToOmml, initTexToOmml, isTexToOmmlReady, setTexToOmmlConverter } from './ommlWrite/index.js';
export { createDocxPackage, validateDocxPackage } from './ooxml/index.js';
export type { DocxPackageBuilder, DocxPackageInput, DocxCoreProps, DocxSettings, EmbeddedFontFace } from './ooxml/index.js';
export { readExportMap, readExportTrace, EXPORT_MAP_NS, EXPORT_MAP_ROOT, BOOKMARK_PREFIX } from './anchors/index.js';
export type { ExportTrace, TraceChapter } from './anchors/index.js';
export type { ExportMap, ExportVariant, ExportSnapshot, MapChapter, MapFragment, MapFormat, FragmentTarget } from './anchors/index.js';

export { readDocx, DocxReadError, TEMPLATE_XML_ROOT, TEMPLATE_XML_NS } from './docxRead.js';
export { wordToPostext, pictureResolution, paragraphTargetOf, characterTargetOf, stripCaptionLabel, tableModel } from './toMarkdown.js';
export type { ChapterMode, ImportedPicture, ImportedTable, ImportedChapter, ImportResult, ImportSettings } from './toMarkdown.js';
export { wordStyleTracking, applyStyleTracking } from './tracking.js';
export type { StyleTracking } from './tracking.js';
export { analyzeDocx } from './analyze.js';
export type { StyleUse, FindingId, QualityFinding, QualityVerdict, QualityReport } from './analyze.js';
export {
  DEFAULT_IMPORT_OPTIONS,
  MARKUP_STYLE,
  MARKUP_CHAR_STYLE,
  CHAPTER_STYLE,
  emptyTemplate,
  calloutStylesOf,
  chipStylesOf,
  characterStylesOf,
  displayStyleName,
  lookup,
  guessParagraphTarget,
  guessCharacterTarget,
  parseTemplate,
  templateFile,
  newTemplateId,
} from './template.js';
export type { ParagraphTarget, CharacterTarget, ParagraphTargetKind, CharacterTargetKind, WordImportOptions, WordTemplate } from './template.js';
export { parseInline, renderInline } from './inline.js';
export type { InlineRun, ParseInlineOptions } from './inline.js';
export { paragraphStyleName, paragraphText } from './model.js';
export type {
  WordStyleType,
  WordStyle,
  WordTextRun,
  WordRun,
  WordParagraph,
  WordCell,
  WordTable,
  WordBlock,
  WordNumberingLevel,
  WordNumbering,
  WordMedia,
  WordDocument,
} from './model.js';
