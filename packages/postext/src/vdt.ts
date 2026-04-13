import type {
  PostextResource,
  ResolvedPageConfig,
  ResolvedLayoutConfig,
  ResolvedBodyTextConfig,
  ResolvedHeadingsConfig,
} from './types';

// ---------------------------------------------------------------------------
// Bounding box — all values in px, relative to page origin
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Resolved config aggregate (all sub-configs fully resolved to non-optional)
// ---------------------------------------------------------------------------

export interface ResolvedConfig {
  page: ResolvedPageConfig;
  layout: ResolvedLayoutConfig;
  bodyText: ResolvedBodyTextConfig;
  headings: ResolvedHeadingsConfig;
}

// ---------------------------------------------------------------------------
// VDT node types
// ---------------------------------------------------------------------------

export type VDTBlockType =
  | 'paragraph'
  | 'heading'
  | 'resource'
  | 'blockquote'
  | 'listItem'
  | 'footnoteRef';

export type TextAlign = 'left' | 'justify';

export interface VDTLineSegment {
  kind: 'text' | 'space';
  text: string;
  width: number;
  bold?: boolean;
}

export interface VDTLine {
  text: string;
  bbox: BoundingBox;
  baseline: number;
  hyphenated: boolean;
  /** Per-segment data for justified rendering */
  segments?: VDTLineSegment[];
  /** Whether this is the last line of the paragraph (ragged even when justified) */
  isLastLine?: boolean;
}

export interface VDTBlock {
  id: string;
  type: VDTBlockType;
  bbox: BoundingBox;
  lines: VDTLine[];
  resource?: PostextResource;
  pageIndex: number;
  columnIndex: number;
  dirty: boolean;
  snappedToGrid: boolean;
  headingLevel?: number;
  fontString: string;
  boldFontString?: string;
  color: string;
  textAlign: TextAlign;
}

export interface VDTColumn {
  index: number;
  bbox: BoundingBox;
  blocks: VDTBlock[];
  availableHeight: number;
  baselineOffset: number;
}

export interface VDTFootnoteArea {
  bbox: BoundingBox;
  notes: VDTBlock[];
  separator: boolean;
}

export interface VDTPage {
  index: number;
  width: number;
  height: number;
  columns: VDTColumn[];
  header?: VDTBlock;
  footer?: VDTBlock;
  marginNotes: VDTBlock[];
  footnoteArea?: VDTFootnoteArea;
}

export interface VDTDocument {
  pages: VDTPage[];
  blocks: VDTBlock[];
  config: ResolvedConfig;
  baselineGrid: number;
  converged: boolean;
  iterationCount: number;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createBoundingBox(
  x: number,
  y: number,
  width: number,
  height: number,
): BoundingBox {
  return { x, y, width, height };
}

export function createVDTDocument(
  config: ResolvedConfig,
  baselineGrid: number,
): VDTDocument {
  return {
    pages: [],
    blocks: [],
    config,
    baselineGrid,
    converged: false,
    iterationCount: 0,
  };
}

export function createVDTPage(
  index: number,
  width: number,
  height: number,
): VDTPage {
  return {
    index,
    width,
    height,
    columns: [],
    marginNotes: [],
  };
}

export function createVDTColumn(
  index: number,
  bbox: BoundingBox,
): VDTColumn {
  return {
    index,
    bbox,
    blocks: [],
    availableHeight: bbox.height,
    baselineOffset: 0,
  };
}

export function createVDTBlock(
  id: string,
  type: VDTBlockType,
  fontString: string,
  color: string,
  textAlign: TextAlign = 'left',
): VDTBlock {
  return {
    id,
    type,
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines: [],
    pageIndex: -1,
    columnIndex: -1,
    dirty: true,
    snappedToGrid: false,
    fontString,
    color,
    textAlign,
  };
}
