import type { ComponentType } from 'react';
import type { SettingsSectionId } from './registry';
import { ColorPaletteSection } from './ColorPaletteSection';
import { PageSection } from './PageSection';
import { LayoutSection } from './LayoutSection';
import { HeaderFooterSection } from './HeaderFooterSection';
import { BodyTextSection } from './BodyTextSection';
import { HeadingsSection } from './HeadingsSection';
import { HeadingStylesSection } from './HeadingStylesSection';
import { TocSection } from './TocSection';
import { IndexSection } from './IndexSection';
import { PartsSection } from './PartsSection';
import { UnorderedListsSection } from './UnorderedListsSection';
import { OrderedListsSection } from './OrderedListsSection';
import { MathSection } from './MathSection';
import { FootnotesSection } from './FootnotesSection';
import { CrossRefsSection } from './CrossRefsSection';
import { CitationsSection } from './CitationsSection';
import { CjkSection } from './CjkSection';
import { WritingSection } from './WritingSection';
import { TableStyleSection } from './TableStyleSection';
import { TableStylesSection } from './TableStylesSection';
import { CaptionStyleSection } from './CaptionStyleSection';
import { ParagraphStylesSection } from './ParagraphStylesSection';
import { CalloutStylesSection } from './CalloutStylesSection';
import { ChipStylesSection } from './ChipStylesSection';
import { DiagramStyleSection } from './DiagramStyleSection';
import { VideoStyleSection } from './VideoStyleSection';
import { ResourceTypesSection } from './ResourceTypesSection';
import { HtmlViewerSection } from './HtmlViewerSection';
import { PdfGenerationSection } from './PdfGenerationSection';
import { PrintSection } from './PrintSection';
import { FolioSection } from './FolioSection';
import { DebugSection } from './DebugSection';
import { WarningsConfigSection } from './WarningsConfigSection';
import { ComicsPanelsSection } from './comics/ComicsPanelsSection';
import { ComicsPanelStylesSection } from './comics/ComicsPanelStylesSection';
import { ComicsLetteringSection } from './comics/ComicsLetteringSection';
import { ComicsBalloonStylesSection } from './comics/ComicsBalloonStylesSection';
import { ComicsCastSection } from './comics/ComicsCastSection';

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
  'crossRefs': CrossRefsSection,
  'citations': CitationsSection,
  'cjk': CjkSection,
  'resource-types': ResourceTypesSection,
  'captionStyle': CaptionStyleSection,
  'tableStyle': TableStyleSection,
  'tableStyles': TableStylesSection,
  'diagramStyle': DiagramStyleSection,
  'videoStyle': VideoStyleSection,
  'calloutStyles': CalloutStylesSection,
  'chipStyles': ChipStylesSection,
  'comicsPanels': ComicsPanelsSection,
  'comicsPanelStyles': ComicsPanelStylesSection,
  'comicsLettering': ComicsLetteringSection,
  'comicsBalloonStyles': ComicsBalloonStylesSection,
  'comicsCast': ComicsCastSection,
  'htmlViewer': HtmlViewerSection,
  'folio': FolioSection,
  'pdfGeneration': PdfGenerationSection,
  'print': PrintSection,
  'debug': DebugSection,
  'warnings': WarningsConfigSection,
};
