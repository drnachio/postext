import type { ComponentType } from 'react';
import type { SettingsSectionId } from './registry.js';
import { ColorPaletteSection } from './colors/ColorPaletteSection.js';
import { PageSection } from './page/PageSection.js';
import { LayoutSection } from './page/LayoutSection.js';
import { HeaderFooterSection } from './running/HeaderFooterSection/index.js';
import { BodyTextSection } from './text/BodyTextSection/index.js';
import { HeadingsSection } from './headings/HeadingsSection/index.js';
import { HeadingStylesSection } from './headings/HeadingStylesSection.js';
import { TocSection } from './headings/TocSection.js';
import { IndexSection } from './headings/IndexSection.js';
import { PartsSection } from './parts/PartsSection.js';
import { UnorderedListsSection } from './lists/UnorderedListsSection/index.js';
import { OrderedListsSection } from './lists/OrderedListsSection/index.js';
import { MathSection } from './text/MathSection.js';
import { FootnotesSection } from './text/FootnotesSection.js';
import { LineNumbersSection } from './text/LineNumbersSection.js';
import { CrossRefsSection } from './headings/CrossRefsSection.js';
import { CitationsSection } from './text/CitationsSection.js';
import { CjkSection } from './writing/CjkSection.js';
import { WritingSection } from './writing/WritingSection.js';
import { TableStyleSection } from './figures/TableStyleSection.js';
import { TableStylesSection } from './figures/TableStylesSection.js';
import { CaptionStyleSection } from './figures/CaptionStyleSection.js';
import { ParagraphStylesSection } from './text/ParagraphStylesSection.js';
import { CalloutStylesSection } from './callouts/CalloutStylesSection.js';
import { ChipStylesSection } from './text/ChipStylesSection.js';
import { LabelStylesSection } from './figures/LabelStylesSection.js';
import { MarkStylesSection } from './text/MarkStylesSection.js';
import { CodeStyleSection } from './text/CodeStyleSection.js';
import { ScoreStyleSection } from './figures/ScoreStyleSection.js';
import { ScoreStylesSection } from './figures/ScoreStylesSection.js';
import { DiagramStyleSection } from './figures/DiagramStyleSection.js';
import { VideoStyleSection } from './figures/VideoStyleSection.js';
import { ResourceTypesSection } from './figures/ResourceTypesSection.js';
import { HtmlViewerSection } from './output/HtmlViewerSection.js';
import { CanvasViewerSection } from './output/CanvasViewerSection.js';
import { PdfGenerationSection } from './output/PdfGenerationSection.js';
import { PrintSection } from './output/PrintSection.js';
import { ContrastSection } from './colors/ContrastSection.js';
import { ChecksSection } from './advanced/ChecksSection.js';
import { FolioSection } from './output/FolioSection.js';
import { DebugSection } from './advanced/DebugSection.js';
import { WarningsConfigSection } from './advanced/WarningsConfigSection.js';
import { ComicsPanelsSection } from './comics/ComicsPanelsSection.js';
import { ComicsPanelStylesSection } from './comics/ComicsPanelStylesSection.js';
import { ComicsLetteringSection } from './comics/ComicsLetteringSection.js';
import { ComicsBalloonStylesSection } from './comics/ComicsBalloonStylesSection.js';
import { ComicsCastSection } from './comics/ComicsCastSection.js';
import { PageTemplatesSection } from './page/PageTemplatesSection/index.js';
import { ModulesSection } from './page/ModulesSection/index.js';
import { FrameStylesSection } from './callouts/FrameStylesSection/index.js';
import { FrameLooksSection } from './callouts/FrameLooksSection.js';
import { ExerciseStylesSection } from './exercises/ExerciseStylesSection.js';
import { ExercisesSection } from './exercises/ExercisesSection.js';

/** Section id → component. Kept apart from the registry so the registry
 *  stays a pure data module. */
export const SECTION_COMPONENTS: Record<SettingsSectionId, ComponentType> = {
  'page': PageSection,
  'layout': LayoutSection,
  'writing': WritingSection,
  'color-palette': ColorPaletteSection,
  'headerFooter': HeaderFooterSection,
  'parts': PartsSection,
  'bodyText': BodyTextSection,
  'headings': HeadingsSection,
  'headingStyles': HeadingStylesSection,
  'toc': TocSection,
  'index': IndexSection,
  'paragraphStyles': ParagraphStylesSection,
  'unordered-lists': UnorderedListsSection,
  'ordered-lists': OrderedListsSection,
  'math': MathSection,
  'footnotes': FootnotesSection,
  'lineNumbers': LineNumbersSection,
  'crossRefs': CrossRefsSection,
  'citations': CitationsSection,
  'cjk': CjkSection,
  'resource-types': ResourceTypesSection,
  'captionStyle': CaptionStyleSection,
  'tableStyle': TableStyleSection,
  'tableStyles': TableStylesSection,
  'diagramStyle': DiagramStyleSection,
  'scoreStyle': ScoreStyleSection,
  'scoreStyles': ScoreStylesSection,
  'videoStyle': VideoStyleSection,
  'calloutStyles': CalloutStylesSection,
  'frameStyles': FrameStylesSection,
  'frameLooks': FrameLooksSection,
  'exerciseStyles': ExerciseStylesSection,
  'exercises': ExercisesSection,
  'chipStyles': ChipStylesSection,
  'markStyles': MarkStylesSection,
  'labelStyles': LabelStylesSection,
  'codeStyle': CodeStyleSection,
  'comicsPanels': ComicsPanelsSection,
  'comicsPanelStyles': ComicsPanelStylesSection,
  'comicsLettering': ComicsLetteringSection,
  'comicsBalloonStyles': ComicsBalloonStylesSection,
  'comicsCast': ComicsCastSection,
  'pageTemplates': PageTemplatesSection,
  'modules': ModulesSection,
  'htmlViewer': HtmlViewerSection,
  'canvasViewer': CanvasViewerSection,
  'folio': FolioSection,
  'pdfGeneration': PdfGenerationSection,
  'print': PrintSection,
  'contrast': ContrastSection,
  'checks': ChecksSection,
  'debug': DebugSection,
  'warnings': WarningsConfigSection,
};
