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
import { PartsSection } from './PartsSection';
import { UnorderedListsSection } from './UnorderedListsSection';
import { OrderedListsSection } from './OrderedListsSection';
import { MathSection } from './MathSection';
import { TableStyleSection } from './TableStyleSection';
import { TableStylesSection } from './TableStylesSection';
import { CaptionStyleSection } from './CaptionStyleSection';
import { ParagraphStylesSection } from './ParagraphStylesSection';
import { CalloutStylesSection } from './CalloutStylesSection';
import { ChipStylesSection } from './ChipStylesSection';
import { DiagramStyleSection } from './DiagramStyleSection';
import { ResourceTypesSection } from './ResourceTypesSection';
import { HtmlViewerSection } from './HtmlViewerSection';
import { PdfGenerationSection } from './PdfGenerationSection';
import { DebugSection } from './DebugSection';
import { WarningsConfigSection } from './WarningsConfigSection';

/** Section id → component. Kept apart from the registry so the registry
 *  stays a pure data module. */
export const SECTION_COMPONENTS: Record<SettingsSectionId, ComponentType> = {
  'page': PageSection,
  'layout': LayoutSection,
  'color-palette': ColorPaletteSection,
  'headerFooter': HeaderFooterSection,
  'parts': PartsSection,
  'bodyText': BodyTextSection,
  'headings': HeadingsSection,
  'headingStyles': HeadingStylesSection,
  'toc': TocSection,
  'paragraphStyles': ParagraphStylesSection,
  'unordered-lists': UnorderedListsSection,
  'ordered-lists': OrderedListsSection,
  'math': MathSection,
  'resource-types': ResourceTypesSection,
  'captionStyle': CaptionStyleSection,
  'tableStyle': TableStyleSection,
  'tableStyles': TableStylesSection,
  'diagramStyle': DiagramStyleSection,
  'calloutStyles': CalloutStylesSection,
  'chipStyles': ChipStylesSection,
  'htmlViewer': HtmlViewerSection,
  'pdfGeneration': PdfGenerationSection,
  'debug': DebugSection,
  'warnings': WarningsConfigSection,
};
