// Word documents in and out (#599): read a `.docx` into Postext Markdown
// with a style template and a quality report, and write chapters back to a
// `.docx` that carries the template for the round trip. Pure code (fflate
// and a small XML reader): runs in the browser, a Worker and Node.

export { readDocx, DocxReadError, TEMPLATE_XML_ROOT, TEMPLATE_XML_NS } from './docxRead';
export { wordToPostext, pictureResolution, paragraphTargetOf, characterTargetOf, stripCaptionLabel, tableModel } from './toMarkdown';
export type { ChapterMode, ImportedPicture, ImportedTable, ImportedChapter, ImportResult, ImportSettings } from './toMarkdown';
export { postextToDocx, DEFAULT_STYLE_NAMES } from './toDocx';
export type { ExportChapter, WordStyleNames, ExportSettings } from './toDocx';
export { analyzeDocx } from './analyze';
export type { StyleUse, FindingId, QualityFinding, QualityVerdict, QualityReport } from './analyze';
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
} from './template';
export type { ParagraphTarget, CharacterTarget, ParagraphTargetKind, CharacterTargetKind, WordImportOptions, WordTemplate } from './template';
export { parseInline, renderInline } from './inline';
export type { InlineRun, ParseInlineOptions } from './inline';
export { paragraphStyleName, paragraphText } from './model';
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
} from './model';
