/**
 * `postext/word`: Word documents in and out. Export (#1387): a semantic .docx
 * with native Word structures (`semanticDocx`) or a formatted one that
 * reproduces the PDF pages (`formattedDocx`); both embed an export map, so the
 * edits made in Word go back into the exact Markdown and resource positions
 * (`applyDocxEdits`). Import of any other .docx (#599): read it into Postext
 * Markdown with a style template and a quality report. Pure code (fflate and
 * a small XML reader): runs in the browser, a Worker and Node.
 *
 * @module
 */

export { semanticDocx, SEMANTIC_ENGINE, SEMANTIC_STYLE, preferredWordVariant } from './semantic/index.js';
export type { SemanticDocxOptions, SemanticDesign, WordChapterInput, SemanticWarning } from './semantic/index.js';
export { formattedDocx, FORMATTED_ENGINE } from './formatted/index.js';
export type { FormattedDocxOptions, FormattedWarning } from './formatted/index.js';
export { isExportedDocx, applyDocxEdits } from './roundtrip/index.js';
export type { DocxEditSource, DocxEdit, DocxEditResult, DocxComment } from './roundtrip/index.js';
export { planWordFonts, wordFontFor } from './fonts/index.js';
export type { WordFontPlan, SourceFace, WordFontRef, FontWarning, PlanWordFontsOptions } from './fonts/index.js';
export { texToOmml, initTexToOmml, isTexToOmmlReady, setTexToOmmlConverter } from './ommlWrite/index.js';
export { createDocxPackage, validateDocxPackage } from './ooxml/index.js';
export type { DocxPackageBuilder, DocxPackageInput, DocxCoreProps, DocxSettings, EmbeddedFontFace } from './ooxml/index.js';
export { readExportMap, EXPORT_MAP_NS, EXPORT_MAP_ROOT, BOOKMARK_PREFIX } from './anchors/index.js';
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
